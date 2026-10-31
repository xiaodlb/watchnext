// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { GET, POST } from "../../app/v1/[...path]/route";

const probeEnabled = process.env.WATCHNEXT_PICKER_ROUTE_PROBE === "1";
const origin = process.env.WATCHNEXT_APP_ORIGIN ?? "http://127.0.0.1:3999";

async function call(path: string, method: "GET" | "POST", cookie = "", body?: unknown) {
  const request = new Request(`${origin}/v1/${path}`, {
    method,
    headers: {
      ...(method === "GET" ? {} : { origin, "sec-fetch-site": "same-origin", "content-type": "application/json" }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const context = { params: Promise.resolve({ path: path.split("/") }) };
  return method === "GET" ? GET(request, context) : POST(request, context);
}

it.skipIf(!probeEnabled)("runs a valid eligible movie through the production Next API route handler", async () => {
  const password = randomBytes(24).toString("base64url");
  const username = `routeprobe_${randomBytes(6).toString("hex")}`;
  const registration = await call("auth/register", "POST", "", { username, password, confirmation: password });
  expect(registration.status).toBe(200);
  const cookie = /^watchnext_account_session=([^;]+)/.exec(registration.headers.get("set-cookie") ?? "")?.[0] ?? "";
  expect(cookie).toMatch(/^watchnext_account_session=.+$/);

  const group = await call("groups", "POST", cookie, { expectedContextRevision: 1, name: `Route probe ${randomBytes(3).toString("hex")}` });
  expect(group.status).toBe(200);
  const saved = await call("library/manual", "POST", cookie, {
    expectedContextRevision: 2,
    title: `Eligible title ${randomBytes(3).toString("hex")}`,
    contentType: "movie",
    durationSeconds: 18 * 60,
    numberingStyle: "none",
    genres: [],
    moods: ["funny"],
    watchUrl: null,
    sourceUrl: null,
    coverUrl: null,
  });
  expect(saved.status).toBe(200);

  const inputs = await call("picker/inputs", "GET", cookie);
  expect(inputs.status).toBe(200);
  const viewers = (await inputs.json() as { viewers: { id: string }[] }).viewers;
  expect(viewers).toHaveLength(1);

  const picked = await call("picker/pick", "POST", cookie, {
    expectedContextRevision: 2,
    viewerIds: [viewers[0]!.id],
    availableMinutes: 20,
    mood: "funny",
    rewatches: false,
    intentId: randomUUID(),
  });
  const contentType = (picked.headers.get("content-type") ?? "none").split(";", 1)[0];
  let errorCode = "none";
  let body: { kind?: string; candidate?: { title: string; tier: string }; error?: { code?: string } } | null = null;
  try { body = await picked.json(); } catch {}
  if (typeof body?.error?.code === "string" && /^[a-z0-9_-]{1,48}$/i.test(body.error.code)) errorCode = body.error.code;
  expect({ status: picked.status, contentType, errorCode }).toEqual({ status: 200, contentType: "application/json", errorCode: "none" });
  expect(body).toMatchObject({ kind: "picked", candidate: { tier: "exact" } });
  expect(typeof body?.candidate?.title).toBe("string");

  const rejected = await call("picker/pick", "POST", cookie, {
    expectedContextRevision: 2,
    viewerIds: [viewers[0]!.id],
    availableMinutes: 20,
    mood: "unsupported",
    rewatches: false,
    intentId: randomUUID(),
  });
  const rejectedContentType = (rejected.headers.get("content-type") ?? "none").split(";", 1)[0];
  const rejectedBody = await rejected.json() as { error?: { code?: string } };
  expect({ status: rejected.status, contentType: rejectedContentType, errorCode: rejectedBody.error?.code }).toEqual({
    status: 422,
    contentType: "application/json",
    errorCode: "validation_failed",
  });
});
