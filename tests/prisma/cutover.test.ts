// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../db/migrate";
import { handleMemory, resetHttpMemoryForTests } from "../../lib/http-memory/service";
import { resetPrismaIdentityForTests } from "../../lib/http-prisma/identity-store";

const origin = "http://127.0.0.1:3000";
const roots: string[] = [];
const request = (path: string, value?: unknown, cookie?: string, method = "POST") => new Request(`${origin}/v1/${path}`, { method, headers: { ...(method === "GET" ? {} : { origin, "content-type": "application/json" }), ...(cookie ? { cookie } : {}) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
const cookieOf = (response: Response, name: string) => `${name}=${/[^=]+=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1]}`;
function setup() {
  const root = mkdtempSync(join(tmpdir(), "watchnext-prisma-cutover-")); roots.push(root);
  const database = join(root, "watchnext.sqlite"), native = new DatabaseSync(database); try { migrate(native); } finally { native.close(); }
  process.env.WATCHNEXT_HTTP_REPOSITORY = "prisma";
  process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL = `file:${database.replace(/\\/g, "/")}`;
  return database;
}
afterEach(async () => { resetHttpMemoryForTests(); await resetPrismaIdentityForTests(); delete process.env.WATCHNEXT_HTTP_REPOSITORY; delete process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL; delete process.env.WATCHNEXT_HTTP_METADATA_FIXTURES; for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

it("uses the complete Prisma durable path for an account group, library and personal history across a restart", async () => {
  const database = setup(), password = "A durable passphrase";
  const registration = await handleMemory(request("auth/register", { username: "Prisma.Cutover", password, confirmation: password }), ["auth", "register"]); expect(registration.status).toBe(200);
  const account = cookieOf(registration, "watchnext_account_session");
  const created = await handleMemory(request("groups", { expectedContextRevision: 1, name: "Durable group" }, account), ["groups"]); expect(created.status).toBe(200);
  const group = await created.json() as any;
  const saved = await handleMemory(request("library/manual", { expectedContextRevision: 2, title: "Durable funny short", contentType: "youtube", durationSeconds: 1200, numberingStyle: "none", genres: ["Comedy"], moods: ["funny"], watchUrl: "https://www.youtube.com/watch?v=AbCdEf12345", sourceUrl: "https://www.youtube.com/watch?v=AbCdEf12345", coverUrl: "https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg" }, account), ["library", "manual"]); expect(saved.status).toBe(200);
  const savedValue = await saved.json() as any; const id = savedValue.title.id;
  expect((await handleMemory(request(`library/${id}/progress/timestamp`, { expectedContextRevision: 2, timestampSeconds: 125 }, account, "PUT"), ["library", id, "progress", "timestamp"])).status).toBe(200);
  expect((await handleMemory(request(`library/${id}/rating`, { expectedContextRevision: 2, score: 9 }, account, "PUT"), ["library", id, "rating"])).status).toBe(200);
  expect((await handleMemory(request(`library/${id}/note`, { expectedContextRevision: 2, note: "Keep for Friday" }, account, "PUT"), ["library", id, "note"])).status).toBe(200);
  // Simulate a new server process. State comes only from the configured SQLite file.
  resetHttpMemoryForTests(); await resetPrismaIdentityForTests();
  const detail = await handleMemory(request(`library/${id}`, undefined, account, "GET"), ["library", id]); expect(detail.status).toBe(200);
  expect(await detail.json()).toMatchObject({ id, groupId: group.context.groupId, title: "Durable funny short", personal: { timestampSeconds: 125, rating: 9, note: "Keep for Friday" } });
  const picked = await handleMemory(request("picker/pick", { expectedContextRevision: 2, viewerIds: [(await (await handleMemory(request("groups/current", undefined, account, "GET"), ["groups", "current"])).json() as any).members[0].id], availableMinutes: 25, mood: "funny", rewatches: false, intentId: "cutover" }, account), ["picker", "pick"]); expect(picked.status).toBe(200);
  const db = new DatabaseSync(database); try { expect(db.prepare("SELECT count(*) AS count FROM titles").get()).toMatchObject({ count: 1 }); expect(db.prepare("SELECT count(*) AS count FROM progress").get()).toMatchObject({ count: 1 }); expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]); } finally { db.close(); }
});

it("does not allow a request to change the server-selected repository", async () => {
  setup();
  const response = await handleMemory(new Request(`${origin}/v1/context?repository=memory`, { headers: { "x-watchnext-repository": "memory" } }), ["context"]);
  // The untrusted URL/header are ignored; this is still the Prisma identity
  // implementation's anonymous projection, not a selector override.
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ context: { mode: "anonymous", revision: 0 } });
});

it("keeps provider review handles durable and saves an imported YouTube item through Prisma", async () => {
  setup(); process.env.WATCHNEXT_HTTP_METADATA_FIXTURES = "1"; const password = "A durable passphrase";
  const registration = await handleMemory(request("auth/register", { username: "Prisma.Import", password, confirmation: password }), ["auth", "register"]), account = cookieOf(registration, "watchnext_account_session");
  expect((await handleMemory(request("groups", { expectedContextRevision: 1, name: "Import group" }, account), ["groups"])).status).toBe(200);
  const review = await handleMemory(request("metadata/search", { expectedContextRevision: 2, source: "youtube", kind: "link", query: "AbCdEf12345" }, account), ["metadata", "search"]); expect(review.status).toBe(200);
  const value = await review.json() as any;
  resetHttpMemoryForTests(); await resetPrismaIdentityForTests();
  const saved = await handleMemory(request(`metadata/reviews/${value.handle}/save`, { expectedContextRevision: 2, title: value.draft.title, contentType: value.draft.contentType, durationSeconds: value.draft.duration.seconds, numberingStyle: "none", genres: value.draft.genres, moods: ["funny"], watchUrl: value.draft.watchUrl, sourceUrl: value.draft.sourceUrl, coverUrl: value.draft.coverUrl, typicalDurationConfirmed: true }, account), ["metadata", "reviews", value.handle, "save"]);
  expect(saved.status).toBe(200); expect(await saved.json()).toMatchObject({ status: "created", title: { title: "HTTP fixture YouTube" } });
  delete process.env.WATCHNEXT_HTTP_METADATA_FIXTURES;
});
