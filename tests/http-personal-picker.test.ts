// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { handleMemory, resetHttpMemoryForTests } from "../lib/http-memory/service";
import { DELETE, GET, POST, PUT } from "../app/v1/[...path]/route";

const origin = "http://127.0.0.1:3000";
const password = "Synthetic personal picker password";
const request = (path: string, body?: unknown, cookie?: string, method = "POST") => new Request(`${origin}/v1/${path}`, {
  method,
  headers: { ...(method === "GET" ? {} : { origin, "content-type": "application/json" }), ...(cookie ? { cookie } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const cookieOf = (response: Response, name: string) => `${name}=${/[^=]+=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1]}`;
const call = (path: string, body?: unknown, cookie?: string, method = "POST") => handleMemory(request(path, body, cookie, method), path.split("/"));
const draft = (title: string, durationSeconds: number, contentType: "movie" | "series" = "movie") => ({
  expectedContextRevision: 2,
  title,
  contentType,
  durationSeconds,
  numberingStyle: contentType === "series" ? "season_episode" : "none",
  genres: ["Comedy"],
  moods: ["funny"],
  watchUrl: "https://example.test/watch",
  sourceUrl: null,
  coverUrl: null,
});

afterEach(() => { resetHttpMemoryForTests(); delete process.env.WATCHNEXT_HTTP_MEMORY; });

async function groupWithTwoMembers() {
  process.env.WATCHNEXT_HTTP_MEMORY = "1";
  const ownerRegistration = await call("auth/register", { username: "Personal.Owner", password, confirmation: password });
  const owner = cookieOf(ownerRegistration, "watchnext_account_session");
  const group = await (await call("groups", { expectedContextRevision: 1, name: "Personal group" }, owner)).json() as any;
  const memberRegistration = await call("auth/register", { username: "Personal.Member", password, confirmation: password });
  const member = cookieOf(memberRegistration, "watchnext_account_session");
  await call("invitations/resolve", { invite: group.invite }, member);
  await call("groups/pending/join", { expectedContextRevision: 1 }, member);
  return { owner, member, group };
}

it("writes only the current actor's episode, timestamp, completion, rating and note records", async () => {
  const { owner, member } = await groupWithTwoMembers();
  const movie = await (await call("library/manual", draft("Funny film", 1500), owner)).json() as any;
  const series = await (await call("library/manual", draft("Funny series", 1200, "series"), owner)).json() as any;

  const episode = await call(`library/${series.title.id}/progress/episode`, {
    expectedContextRevision: 2, position: "not_started", season: 1, episode: 1, memberId: "forged-member-id",
  }, owner, "PUT");
  expect(episode.status).toBe(200);
  expect((await episode.json()).record).toMatchObject({ positionState: "not_started", nextSeason: 1, nextEpisode: 1, completed: false });
  expect((await call(`library/${series.title.id}/progress/episode`, { expectedContextRevision: 2, position: "in_progress", season: null, episode: 2 }, owner, "PUT")).status).toBeGreaterThanOrEqual(400);
  expect((await call(`library/${series.title.id}/progress/episode`, { expectedContextRevision: 2, position: "unknown", season: 1, episode: 1 }, owner, "PUT")).status).toBeGreaterThanOrEqual(400);

  const timestamp = await call(`library/${movie.title.id}/progress/timestamp`, { expectedContextRevision: 2, timestampSeconds: 0 }, owner, "PUT");
  expect(timestamp.status).toBe(200);
  expect((await timestamp.json()).record.timestampSeconds).toBe(0);
  expect((await call(`library/${movie.title.id}/progress/timestamp`, { expectedContextRevision: 2, timestampSeconds: 1501 }, owner, "PUT")).status).toBeGreaterThanOrEqual(400);
  expect((await call(`library/${movie.title.id}/progress/completed`, { expectedContextRevision: 2, completed: true }, owner, "PUT")).status).toBe(200);
  const rated = await call(`library/${movie.title.id}/rating`, { expectedContextRevision: 2, score: 8 }, owner, "PUT");
  expect(rated.status).toBe(200);
  const noted = await call(`library/${movie.title.id}/note`, { expectedContextRevision: 2, note: "  Keep\nthis ending.  " }, owner, "PUT");
  expect((await noted.json()).record.note).toBe("Keep\nthis ending.");
  expect((await call(`library/${movie.title.id}/rating`, { expectedContextRevision: 2, score: 2.5 }, owner, "PUT")).status).toBeGreaterThanOrEqual(400);
  expect((await call(`library/${movie.title.id}/note`, { expectedContextRevision: 2, note: "x".repeat(2001) }, owner, "PUT")).status).toBeGreaterThanOrEqual(400);

  const ownerDetail = await (await call(`library/${movie.title.id}`, undefined, owner, "GET")).json() as any;
  const memberDetail = await (await call(`library/${movie.title.id}`, undefined, member, "GET")).json() as any;
  expect(ownerDetail.personal).toMatchObject({ timestampSeconds: 0, completed: true, rating: 8, note: "Keep\nthis ending." });
  expect(memberDetail.personal).toMatchObject({ timestampSeconds: null, completed: false, rating: null, note: null });

  const route = (path: string, body: unknown, cookie: string, method: "PUT" | "DELETE") => {
    const current = request(path, body, cookie, method);
    return (method === "PUT" ? PUT : DELETE)(current, { params: Promise.resolve({ path: path.split("/") }) });
  };
  expect((await route(`library/${movie.title.id}/progress/timestamp`, { expectedContextRevision: 2 }, owner, "DELETE")).status).toBe(200);
  expect((await route(`library/${movie.title.id}/rating`, { expectedContextRevision: 2 }, owner, "DELETE")).status).toBe(200);
  expect((await route(`library/${movie.title.id}/note`, { expectedContextRevision: 2 }, owner, "DELETE")).status).toBe(200);
  const cleared = await (await call(`library/${movie.title.id}`, undefined, owner, "GET")).json() as any;
  expect(cleared.personal).toMatchObject({ timestampSeconds: null, completed: true, rating: null, note: null });
});

it("uses the shared note normalization and rejects NUL without replacing the saved record", async () => {
  const { owner } = await groupWithTwoMembers();
  const movie = await (await call("library/manual", draft("Normalized HTTP note", 1500), owner)).json() as any;
  const first = await call(`library/${movie.title.id}/note`, { expectedContextRevision: 2, note: "  First\r\n  second\r " }, owner, "PUT");
  expect(first.status).toBe(200);
  expect((await first.json()).record.note).toBe("First\n  second");

  const second = await call(`library/${movie.title.id}/note`, { expectedContextRevision: 2, note: "  Bare\rCR stays internal  " }, owner, "PUT");
  expect(second.status).toBe(200);
  expect((await second.json()).record.note).toBe("Bare\nCR stays internal");

  const rejected = await call(`library/${movie.title.id}/note`, { expectedContextRevision: 2, note: "must\0not save" }, owner, "PUT");
  expect(rejected.status).toBeGreaterThanOrEqual(400);
  const detail = await (await call(`library/${movie.title.id}`, undefined, owner, "GET")).json() as any;
  expect(detail.personal.note).toBe("Bare\nCR stays internal");
});

it("runs ranked picker cycles from fresh memory projections without picker history writes", async () => {
  const { owner, member } = await groupWithTwoMembers();
  const longest = await (await call("library/manual", draft("Longest funny", 1500), owner)).json() as any;
  const shorter = await (await call("library/manual", draft("Shorter funny", 1200), owner)).json() as any;
  const inputs = await (await call("picker/inputs", undefined, owner, "GET")).json() as any;
  expect(inputs.viewers).toHaveLength(2);
  const viewers = inputs.viewers.map((viewer: { id: string }) => viewer.id);
  const base = { expectedContextRevision: 2, viewerIds: viewers, availableMinutes: 25, mood: "funny", rewatches: false };
  expect((await call("picker/pick", { ...base, viewerIds: [viewers[0], viewers[0]], intentId: "duplicate" }, owner)).status).toBeGreaterThanOrEqual(400);

  const firstResponse = await call("picker/pick", { ...base, intentId: "start" }, owner);
  expect(firstResponse.status).toBe(200);
  const first = await firstResponse.json() as any;
  expect(first).toMatchObject({ kind: "picked", refreshed: false, candidate: { id: longest.title.id } });
  const startRetry = await (await call("picker/pick", { ...base, intentId: "start" }, owner)).json() as any;
  expect(startRetry).toMatchObject({ kind: "picked", candidate: { id: longest.title.id }, cycle: first.cycle });
  expect((await call(`library/${longest.title.id}/rating`, { expectedContextRevision: 2, score: 7 }, owner, "PUT")).status).toBe(200);
  const secondResponse = await call(`picker/cycles/${first.cycle.cycleId}/next`, { expectedContextRevision: 2, step: first.cycle.step, intentId: "next" }, owner);
  const second = await secondResponse.json() as any;
  expect(second).toMatchObject({ kind: "picked", refreshed: false, candidate: { id: shorter.title.id } });
  const retry = await (await call(`picker/cycles/${first.cycle.cycleId}/next`, { expectedContextRevision: 2, step: first.cycle.step, intentId: "next" }, owner)).json() as any;
  expect(retry).toMatchObject({ kind: "picked", candidate: { id: shorter.title.id }, cycle: { step: second.cycle.step } });
  const exhausted = await (await call(`picker/cycles/${first.cycle.cycleId}/next`, { expectedContextRevision: 2, step: second.cycle.step, intentId: "exhaust" }, owner)).json() as any;
  expect(exhausted.kind).toBe("exhausted");
  const restarted = await (await call(`picker/cycles/${first.cycle.cycleId}/restart`, { ...base, step: exhausted.cycle.step, intentId: "restart" }, owner)).json() as any;
  expect(restarted).toMatchObject({ kind: "picked", candidate: { id: longest.title.id } });

  const after = await (await call(`library/${longest.title.id}`, undefined, owner, "GET")).json() as any;
  expect(after.contributors).toHaveLength(1);
  expect(after.personal).toMatchObject({ completed: false, rating: 7, note: null });
  expect((await call(`picker/cycles/${first.cycle.cycleId}/next`, { expectedContextRevision: 2, step: restarted.cycle.step, intentId: "foreign" }, member)).status).toBe(200);
  expect((await (await call(`picker/cycles/${first.cycle.cycleId}/next`, { expectedContextRevision: 2, step: restarted.cycle.step, intentId: "foreign" }, member)).json()).kind).toBe("conflict");
});
