// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createMockService } from "../../frontend/mock/service";
import { titleDraft } from "../../frontend/mock/library";
import { blankEntry } from "../../frontend/mock/metadata-fixtures";
import { formatWatchTimestamp, inspectNoteDraft, noteLimit, parseCoordinate, parseRatingText, parseTimestampText, usableRuntime } from "../../frontend/mock/personal";
import { parseWatchTimestamp, TimestampFieldError } from "../../lib/watch-progress";
import { formatWatchTimestamp as baselineFormat, usableRuntime as baselineRuntime } from "../../lib/watch-progress-state";
import { parseRating } from "../../lib/ratings";
import { inspectNoteDraft as baselineNote, noteLimit as baselineLimit } from "../../lib/note-state";
import type { ContextIdentity, EntryPage, FrontendService, LibraryTitle, PersonalClaim, PersonalCommit, ServiceResult } from "../../frontend/service/contracts";
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
async function done<T>(p: Promise<T>, ms = 80) { await vi.advanceTimersByTimeAsync(ms); return p; }
function ok<T>(r: ServiceResult<T>) { if (r.kind !== "success") throw Error(`Expected personal success, got ${r.kind}: ${r.kind === "failure" ? r.error.message : r.message}`); return r; }
function fail<T>(r: ServiceResult<T>, code = "personal_access") { expect(r.kind).toBe("failure"); if (r.kind === "failure") expect(r.error.code).toBe(code); return r.kind === "failure" ? r.error : undefined!; }
async function ctx(s: FrontendService) { return ok(await done(s.context.read())).context; }
async function login(s: FrontendService, user = "Demo.Owner", group = "friday") { ok(await done(s.accounts.signIn({ username: user, password: "synthetic password" }, await ctx(s)))); return ok(await done(s.groups.select(group, await ctx(s)))).context; }
async function detail(s: FrontendService, id: string): Promise<LibraryTitle> { return ok(await done(s.library.detail(id, await ctx(s)))).value; }
async function claim(s: FrontendService, id: string): Promise<PersonalClaim> { const t = await detail(s, id); return { memberId: t.personal.own!.memberId, numberingStyle: t.numberingStyle }; }
const ids = (t: LibraryTitle) => t.history.map(r => `${r.id}:${r.memberId}`);
type Op = (s: FrontendService, id: string, c: PersonalClaim, expected: ContextIdentity, options?: { scenario?: "slow" | "ready" | "unavailable"; signal?: AbortSignal }) => Promise<ServiceResult<PersonalCommit>>;
const rate = (score: string): Op => (s, id, c, e, o) => s.feedback.saveRating(id, score, c, e, o);
const stamp = (value: string): Op => (s, id, c, e, o) => s.progress.saveTimestamp(id, value, c, e, o);
const episode = (position: "unknown" | "not_started" | "in_progress", season = "", ep = ""): Op => (s, id, c, e, o) => s.progress.saveEpisode(id, { position, season, episode: ep }, c, e, o);
async function apply(s: FrontendService, id: string, op: Op) { return ok(await done(op(s, id, await claim(s, id), await ctx(s)))).value; }

it("parity: client-safe validators equal the baseline production helpers exactly", () => {
  for (const value of ["0:00", "5:00", "70:00", "1:10:00", "  1:10:00 ", "", "   ", "1:6", "1:60", "1:60:00", "+1:00", "-1:00", "1.5:00", "1:00.5", "01:05", "10:00:00", "99999999999999999:00", "1:05:5", "abc", "0:0"]) {
    let baseline: number | null | "error"; try { baseline = parseWatchTimestamp(value); } catch (error) { expect(error).toBeInstanceOf(TimestampFieldError); baseline = "error"; }
    const mine = parseTimestampText(value); expect(mine.ok ? mine.seconds : "error").toBe(baseline);
  }
  expect(parseTimestampText(5).ok).toBe(false);
  for (const seconds of [0, 59, 60, 300, 3599, 3600, 4200, 86400]) expect(formatWatchTimestamp(seconds)).toBe(baselineFormat(seconds));
  expect(formatWatchTimestamp(4200)).toBe("1:10:00"); expect(formatWatchTimestamp(300)).toBe("5:00"); expect(formatWatchTimestamp(null)).toBe("");
  for (const d of [null, 0, 1, 86400, 86401, 1.5]) expect(usableRuntime(d)).toBe(baselineRuntime(d));
  for (const score of ["1", "10", " 7 ", "0", "11", "7.5", "8.0", "1e1", "+5", "08", " ", "", "\t", "ten"]) { let b: number | null; try { b = parseRating(score); } catch { b = null; } expect(parseRatingText(score)).toBe(b); }
  for (const note of ["  a\r\nb\rc  ", "﻿　x ", "😀".repeat(2000), "😀".repeat(2001), "a\0b", "   "]) expect(inspectNoteDraft(note)).toEqual(baselineNote(note));
  expect(noteLimit).toBe(baselineLimit);
  for (const [value, expected] of [["0007", 7], ["1", 1], ["9999", 9999], [" 12 ", 12], ["0", null], ["10000", null], ["2.5", null], ["1e3", null], ["+1", null], ["-1", null], ["", null], ["a", null], ["00000", null]] as const) expect(parseCoordinate(value)).toBe(expected);
});

it("seeds: every #57/#58 record ID and attribution survives as structured history, plus the three documented personal seeds", async () => {
  const s = createMockService(); await login(s);
  expect(ids(await detail(s, "joint-movie"))).toEqual(["history-friday-owner:friday-owner", "history-friday-viewer:friday-viewer"]);
  const joint = await detail(s, "joint-movie"); expect(joint.history[0]).toEqual({ id: "history-friday-owner", memberId: "friday-owner", progress: { kind: "watch", timestampSeconds: 300, completed: false }, rating: 8, note: "Synthetic personal note. <script> stays plain text." });
  const members = ok(await done(s.groups.read())).value.members; expect(members.map(m => m.references.history[0])).toEqual(["history-friday-owner", "history-friday-viewer"]);
  const series = await detail(s, "saved-series"); expect(ids(series)).toEqual(["history-saved-series-friday-viewer:friday-viewer"]); expect(series.history[0].progress).toEqual({ kind: "episode", position: "in_progress", season: 1, episode: 2, completed: false });
  expect(series.personal.own).toMatchObject({ memberId: "friday-owner", recordId: null, rating: null, note: null, progress: { kind: "episode", recorded: false, position: "unknown", season: null, episode: null, completed: false } });
  expect(series.personal.history.map(e => [e.member.name, e.record?.id ?? null])).toEqual([["Demo.Owner", null], ["Demo.Viewer", "history-saved-series-friday-viewer"]]);
  const anime = await detail(s, "saved-anime"); expect(ids(anime)).toEqual(["history-saved-anime-friday-viewer:friday-viewer", "personal-saved-anime-friday-owner:friday-owner"]); expect(anime.history[0].progress).toEqual({ kind: "episode", position: "in_progress", season: null, episode: 2, completed: false }); expect(anime.personal.own?.progress).toMatchObject({ recorded: true, position: "not_started", season: null, episode: 1 }); expect(anime.history[1]).toMatchObject({ rating: null, note: null });
  const video = await detail(s, "saved-video"); expect(ids(video)).toEqual(["history-saved-video-friday-owner:friday-owner", "personal-saved-video-friday-viewer:friday-viewer"]); expect(video.history[1].progress).toEqual({ kind: "watch", timestampSeconds: 0, completed: false });
  expect(ids(await detail(s, "archived-movie"))).toEqual(["history-archived-movie-friday-owner:friday-owner"]);
  const expired = await detail(s, "expired-video"); expect(ids(expired)).toEqual(["history-expired-video-friday-viewer:friday-viewer"]); expect(expired.personal.own?.progress).toMatchObject({ kind: "watch", runtimeAvailable: false, recorded: false });
  await login(s, "Demo.Viewer", "weekend"); const weekend = await detail(s, "weekend-movie"); expect(ids(weekend)).toEqual(["history-weekend-retired:weekend-retired", "personal-weekend-movie-weekend-viewer:weekend-viewer"]);
  expect(weekend.personal.history.map(e => [e.member.name, e.member.active])).toEqual([["Demo.Viewer", true], ["Past participant", false]]); expect(weekend.personal.own?.progress).toMatchObject({ kind: "watch", recorded: true, timestampSeconds: null, completed: true });
  expect(ok(await done(s.library.list("mine", false, await ctx(s)))).value.items).toHaveLength(0);
  expect(ids(ok(await done(s.library.detail("weekend-archive", await ctx(s)))).value)).toEqual(["history-weekend-viewer:weekend-viewer"]);
  const again = await detail(s, "weekend-movie"); expect(again.history).toBe(weekend.history); expect(again).toEqual(weekend);
});

it("P01 episode position: absent vs Unknown vs Not started, exact coordinates, structure denial, backward edits and completion independence", async () => {
  const s = createMockService(); await login(s); const before = await detail(s, "saved-series");
  const unknown = await apply(s, "saved-series", episode("unknown")); expect(unknown.record).toEqual({ id: "personal-saved-series-friday-owner", memberId: "friday-owner", progress: { kind: "episode", position: "unknown", season: null, episode: null, completed: false }, rating: null, note: null });
  expect(unknown.own.progress).toMatchObject({ recorded: true, position: "unknown" }); expect(unknown.history.map(e => e.record?.id ?? null)).toEqual(["personal-saved-series-friday-owner", "history-saved-series-friday-viewer"]);
  expect((await apply(s, "saved-series", episode("not_started"))).record?.progress).toMatchObject({ position: "not_started", season: 1, episode: 1 });
  expect((await apply(s, "saved-series", episode("in_progress", "2", "0007"))).record?.progress).toMatchObject({ position: "in_progress", season: 2, episode: 7 });
  const held = await detail(s, "saved-series");
  for (const bad of ["0", "10000", "2.5", "1e3", "+1", "-1", "", " ", "a"]) {
    const e = fail(await done(s.progress.saveEpisode("saved-series", { position: "in_progress", season: "1", episode: bad }, await claim(s, "saved-series"), await ctx(s))), "personal_input"); expect(e.fields?.nextEpisode).toContain("1 to 9999");
    expect(fail(await done(s.progress.saveEpisode("saved-series", { position: "in_progress", season: bad, episode: "1" }, await claim(s, "saved-series"), await ctx(s))), "personal_input").fields?.nextSeason).toContain("1 to 9999");
  }
  for (const position of ["unknown", "not_started"] as const) expect(fail(await done(s.progress.saveEpisode("saved-series", { position, season: "1", episode: "2" }, await claim(s, "saved-series"), await ctx(s))), "personal_input").fields).toMatchObject({ nextSeason: expect.stringContaining("Only In progress"), nextEpisode: expect.stringContaining("Only In progress") });
  fail(await done(s.progress.saveEpisode("saved-series", { position: "finished" as never, season: "", episode: "" }, await claim(s, "saved-series"), await ctx(s))), "personal_input");
  expect((await detail(s, "saved-series")).history).toBe(held.history);
  ok(await done(s.progress.setCompleted("saved-series", true, await claim(s, "saved-series"), await ctx(s))));
  const back = await apply(s, "saved-series", episode("in_progress", "1", "1")); expect(back.record?.progress).toEqual({ kind: "episode", position: "in_progress", season: 1, episode: 1, completed: true });
  const after = await detail(s, "saved-series"); expect(after).toMatchObject({ revision: before.revision, contributors: before.contributors, origins: before.origins, archived: false }); expect(after.history.find(r => r.memberId === "friday-viewer")).toBe(before.history[0]);
  expect(ok(await done(s.library.list("mine", false, await ctx(s)))).value.items.map(t => t.id)).toEqual(["joint-movie", "saved-video"]);
  // Continuous numbering rejects a season and Not started stores E1.
  expect(fail(await done(s.progress.saveEpisode("saved-anime", { position: "in_progress", season: "1", episode: "3" }, await claim(s, "saved-anime"), await ctx(s))), "personal_input").fields?.nextSeason).toContain("Continuous");
  expect((await apply(s, "saved-anime", episode("in_progress", "", "3"))).record).toMatchObject({ id: "personal-saved-anime-friday-owner", progress: { season: null, episode: 3 } });
  expect((await apply(s, "saved-anime", episode("not_started"))).record?.progress).toMatchObject({ season: null, episode: 1 });
  // Structure mismatch and stale numbering claims are denied without writes.
  const joint = await detail(s, "joint-movie");
  fail(await done(s.progress.saveEpisode("joint-movie", { position: "unknown", season: "", episode: "" }, await claim(s, "joint-movie"), await ctx(s))));
  fail(await done(s.progress.saveEpisode("joint-movie", { position: "unknown", season: "", episode: "" }, { memberId: "friday-owner", numberingStyle: "season_episode" }, await ctx(s))));
  fail(await done(s.progress.saveTimestamp("saved-series", "1:00", await claim(s, "saved-series"), await ctx(s))));
  fail(await done(s.progress.saveEpisode("saved-series", { position: "unknown", season: "", episode: "" }, { memberId: "friday-owner", numberingStyle: "continuous" }, await ctx(s))));
  expect((await detail(s, "joint-movie")).history).toBe(joint.history);
});

it("P01 NULL-type episodic title keeps own corrections with a metadata-unavailable projection", async () => {
  let time = Date.UTC(2026, 0, 1); const s = createMockService({ now: () => time }); await login(s);
  const page = ok(await done(s.entry.search("kinopoisk", "title", "Synthetic series", await ctx(s)))).value as EntryPage;
  const review = ok(await done(s.entry.select(page.handle, page.candidates[1].id, await ctx(s)))).value; ok(await done(s.entry.adopt(review.handle, await ctx(s))));
  const saved = ok(await done(s.entry.save({ ...review.draft, minutes: "24", seconds: "0", numberingStyle: "season_episode", moods: ["funny"] }, true, review.handle, undefined, await ctx(s)))).value; if (saved.status !== "saved") throw Error("Expected saved");
  ok(await done(s.entry.advanceTime("thirty-one-days", await ctx(s)))); time += 0;
  const t = await detail(s, saved.title.id); expect(t).toMatchObject({ contentType: null, numberingStyle: "season_episode" });
  const r = await apply(s, t.id, episode("in_progress", "3", "4")); expect(r.own.progress).toMatchObject({ kind: "episode", metadataUnavailable: true, season: 3, episode: 4 }); expect(r.record?.id).toBe(`personal-${t.id}-friday-owner`);
});

it("P02 timestamp: exact formats, runtime bounds at commit, absent vs saved zero, unavailable and shortened runtime", async () => {
  const s = createMockService(); await login(s);
  expect((await apply(s, "joint-movie", stamp("70:00"))).record).toMatchObject({ id: "history-friday-owner", progress: { timestampSeconds: 4200, completed: false } });
  expect((await apply(s, "joint-movie", stamp("1:10:00"))).own.progress).toMatchObject({ timestampSeconds: 4200 });
  expect((await apply(s, "joint-movie", stamp("1:30:00"))).own.progress).toMatchObject({ timestampSeconds: 5400, completed: false, beyondDuration: false });
  const held = await detail(s, "joint-movie");
  for (const bad of ["1:30:01", "1:6", "1:60", "1:60:00", "+1:00", "-1:00", "1.5:00", "1:00.5", "abc"]) expect(fail(await done(s.progress.saveTimestamp("joint-movie", bad, await claim(s, "joint-movie"), await ctx(s))), "personal_input").fields?.timestamp).toBeTruthy();
  expect((await detail(s, "joint-movie")).history).toBe(held.history);
  const cleared = await apply(s, "joint-movie", (x, id, c, e, o) => x.progress.clearTimestamp(id, c, e, o)); expect(cleared.record?.progress).toEqual({ kind: "watch", timestampSeconds: null, completed: false }); expect(cleared.own.progress).toMatchObject({ recorded: true, timestampSeconds: null });
  const again = await detail(s, "joint-movie"); ok(await done(s.progress.clearTimestamp("joint-movie", await claim(s, "joint-movie"), await ctx(s)))); expect((await detail(s, "joint-movie")).history).toBe(again.history);
  expect((await apply(s, "joint-movie", stamp("0:00"))).record?.progress).toMatchObject({ timestampSeconds: 0 }); expect((await apply(s, "joint-movie", stamp("  "))).record?.progress).toMatchObject({ timestampSeconds: null });
  // Absent record: blank save / clear are no-ops that create no record.
  const absent = await detail(s, "expired-video"); for (const op of [stamp(""), (x: FrontendService, id: string, c: PersonalClaim, e: ContextIdentity) => x.progress.clearTimestamp(id, c, e)] as Op[]) { const r = await apply(s, "expired-video", op); expect(r.record).toBeNull(); expect(r.own.progress).toMatchObject({ recorded: false }); }
  expect((await detail(s, "expired-video")).history).toBe(absent.history);
  // Unavailable runtime: forged non-blank rejected; completion, rating and note still work.
  expect(fail(await done(s.progress.saveTimestamp("expired-video", "1:00", await claim(s, "expired-video"), await ctx(s))), "personal_input").fields?.timestamp).toContain("Full duration is unavailable");
  expect((await apply(s, "expired-video", (x, id, c, e) => x.progress.setCompleted(id, true, c, e))).record).toEqual({ id: "personal-expired-video-friday-owner", memberId: "friday-owner", progress: { kind: "watch", timestampSeconds: null, completed: true }, rating: null, note: null });
  expect((await apply(s, "expired-video", rate("6"))).record?.rating).toBe(6);
  await login(s, "Demo.Viewer"); expect((await detail(s, "expired-video")).personal.own?.progress).toMatchObject({ timestampSeconds: 300, runtimeAvailable: false, beyondDuration: false });
  expect((await apply(s, "expired-video", (x, id, c, e) => x.progress.clearTimestamp(id, c, e))).record).toMatchObject({ id: "history-expired-video-friday-viewer", progress: { timestampSeconds: null } });
  // Shortened runtime keeps older values with a warning; re-entry is rejected, correction works.
  await login(s); ok(await done(s.progress.saveTimestamp("joint-movie", "5:00", await claim(s, "joint-movie"), await ctx(s))));
  const t = ok(await done(s.library.editDraft("joint-movie", await ctx(s)))).value; const edited = ok(await done(s.library.save(t.id, t.revision, { ...titleDraft(t), minutes: "4", seconds: "0" }, undefined, await ctx(s)))).value; expect(edited.status).toBe("saved");
  const short = await detail(s, "joint-movie"); expect(short.personal.own?.progress).toMatchObject({ timestampSeconds: 300, beyondDuration: true, fullDurationSeconds: 240 }); expect(short.personal.history.map(e => e.beyondDuration)).toEqual([true, true]);
  fail(await done(s.progress.saveTimestamp("joint-movie", "5:00", await claim(s, "joint-movie"), await ctx(s))), "personal_input");
  expect((await apply(s, "joint-movie", (x, id, c, e) => x.progress.setCompleted(id, true, c, e))).record?.progress).toEqual({ kind: "watch", timestampSeconds: 300, completed: true });
  expect((await apply(s, "joint-movie", stamp("3:00"))).own.progress).toMatchObject({ timestampSeconds: 180, beyondDuration: false, completed: true });
  expect((await detail(s, "joint-movie")).history[1]).toBe(short.history[1]);
});

it("P03 completion flag only: absent creates Unknown/no-timestamp progress, undo keeps coordinates, and false on absent is explicit", async () => {
  const s = createMockService(); await login(s);
  const done1 = await apply(s, "saved-series", (x, id, c, e) => x.progress.setCompleted(id, true, c, e)); expect(done1.record?.progress).toEqual({ kind: "episode", position: "unknown", season: null, episode: null, completed: true }); expect(done1.own.progress).toMatchObject({ recorded: true });
  ok(await done(s.progress.saveEpisode("saved-series", { position: "in_progress", season: "2", episode: "7" }, await claim(s, "saved-series"), await ctx(s))));
  expect((await apply(s, "saved-series", (x, id, c, e) => x.progress.setCompleted(id, false, c, e))).record?.progress).toEqual({ kind: "episode", position: "in_progress", season: 2, episode: 7, completed: false });
  expect((await apply(s, "saved-series", (x, id, c, e) => x.progress.setCompleted(id, true, c, e))).record?.progress).toMatchObject({ season: 2, episode: 7, completed: true });
  const repeat = await detail(s, "saved-series"); ok(await done(s.progress.setCompleted("saved-series", true, await claim(s, "saved-series"), await ctx(s)))); expect((await detail(s, "saved-series")).history).toBe(repeat.history);
  expect((await apply(s, "saved-video", (x, id, c, e) => x.progress.setCompleted(id, true, c, e))).record?.progress).toEqual({ kind: "watch", timestampSeconds: 300, completed: true });
  expect((await apply(s, "saved-video", (x, id, c, e) => x.progress.setCompleted(id, false, c, e))).record?.progress).toEqual({ kind: "watch", timestampSeconds: 300, completed: false });
  fail(await done(s.progress.setCompleted("saved-video", "yes" as never, await claim(s, "saved-video"), await ctx(s))), "personal_input");
  const fresh = createMockService(); await login(fresh, "Demo.Viewer"); expect((await apply(fresh, "saved-video", (x, id, c, e) => x.progress.setCompleted(id, false, c, e))).record?.progress).toEqual({ kind: "watch", timestampSeconds: 0, completed: false });
  await login(fresh); expect((await apply(fresh, "expired-video", (x, id, c, e) => x.progress.setCompleted(id, false, c, e))).record?.progress).toEqual({ kind: "watch", timestampSeconds: null, completed: false });
});

it("P04 rating: canonical 1-10 on all four types and NULL metadata, identical save/absent clear are no-ops, blank never clears", async () => {
  const s = createMockService(); await login(s);
  for (const id of ["joint-movie", "saved-series", "saved-anime", "saved-video", "expired-video"]) expect((await apply(s, id, rate(" 7 "))).own.rating).toBe(7);
  expect((await apply(s, "joint-movie", rate("10"))).record?.rating).toBe(10); expect((await apply(s, "joint-movie", rate("1"))).record?.rating).toBe(1);
  const held = await detail(s, "joint-movie");
  for (const bad of ["0", "11", "7.5", "8.0", "1e1", "+5", "08", " ", "", "\t"]) expect(fail(await done(s.feedback.saveRating("joint-movie", bad, await claim(s, "joint-movie"), await ctx(s))), "personal_input").fields?.rating).toContain("1 to 10");
  ok(await done(s.feedback.saveRating("joint-movie", "1", await claim(s, "joint-movie"), await ctx(s)))); expect((await detail(s, "joint-movie")).history).toBe(held.history);
  const cleared = await apply(s, "joint-movie", (x, id, c, e) => x.feedback.clearRating(id, c, e)); expect(cleared.record).toMatchObject({ id: "history-friday-owner", rating: null, note: "Synthetic personal note. <script> stays plain text.", progress: { timestampSeconds: 300 } }); expect(cleared.own.rating).toBeNull();
  const absent = createMockService(); await login(absent); const before = await detail(absent, "saved-series"); const r = await apply(absent, "saved-series", (x, id, c, e) => x.feedback.clearRating(id, c, e)); expect(r.record).toBeNull(); expect((await detail(absent, "saved-series")).history).toBe(before.history);
});

it("P05 note: normalization, exact 2000 code points, NUL, whitespace clear, inert text and no-op clears", async () => {
  const s = createMockService(); await login(s);
  expect((await apply(s, "saved-series", (x, id, c, e) => x.feedback.saveNote(id, "﻿  first\r\nsecond\rthird <script>alert(1)</script> https://example.test 　", c, e))).record?.note).toBe("first\nsecond\nthird <script>alert(1)</script> https://example.test");
  const max = "😀".repeat(2000); expect((await apply(s, "saved-series", (x, id, c, e) => x.feedback.saveNote(id, max, c, e))).record?.note).toBe(max);
  const held = await detail(s, "saved-series");
  expect(fail(await done(s.feedback.saveNote("saved-series", max + "😀", await claim(s, "saved-series"), await ctx(s))), "personal_input").fields?.note).toContain("has not been shortened");
  expect(fail(await done(s.feedback.saveNote("saved-series", "a\0b", await claim(s, "saved-series"), await ctx(s))), "personal_input").fields?.note).toContain("NUL");
  ok(await done(s.feedback.saveNote("saved-series", ` ${max}\n`, await claim(s, "saved-series"), await ctx(s)))); expect((await detail(s, "saved-series")).history).toBe(held.history);
  const blank = await apply(s, "saved-series", (x, id, c, e) => x.feedback.saveNote(id, " \r\n\t ", c, e)); expect(blank.record?.note).toBeNull(); expect(blank.own.note).toBeNull();
  const after = await detail(s, "saved-series"); ok(await done(s.feedback.clearNote("saved-series", await claim(s, "saved-series"), await ctx(s)))); expect((await detail(s, "saved-series")).history).toBe(after.history);
  expect((await apply(s, "joint-movie", (x, id, c, e) => x.feedback.clearNote(id, c, e))).record).toMatchObject({ id: "history-friday-owner", note: null, rating: 8 });
  const fresh = createMockService(); await login(fresh); const before = await detail(fresh, "expired-video"); expect((await apply(fresh, "expired-video", (x, id, c, e) => x.feedback.clearNote(id, c, e))).record).toBeNull(); expect((await detail(fresh, "expired-video")).history).toBe(before.history);
});

it("authority: no impersonation by owner/creator/contributor, honest legacy profile gating, archived denial and personal-only writes", async () => {
  const s = createMockService(); await login(s); const joint = await detail(s, "joint-movie");
  for (const op of [rate("3"), stamp("1:00"), (x: FrontendService, id: string, c: PersonalClaim, e: ContextIdentity) => x.feedback.clearNote(id, c, e), (x: FrontendService, id: string, c: PersonalClaim, e: ContextIdentity) => x.progress.setCompleted(id, true, c, e)] as Op[]) fail(await done(op(s, "joint-movie", { memberId: "friday-viewer", numberingStyle: "none" }, await ctx(s))));
  fail(await done(s.feedback.saveRating("joint-movie", "3", null as never, await ctx(s))));
  expect((await detail(s, "joint-movie")).history).toBe(joint.history);
  fail(await done(s.feedback.saveRating("weekend-movie", "3", await claim(s, "joint-movie"), await ctx(s)))); fail(await done(s.feedback.saveRating("missing-title", "3", await claim(s, "joint-movie"), await ctx(s))));
  // Archived titles keep readable history and deny writes until restored; restore keeps the same record.
  const archived = await detail(s, "archived-movie"); expect(archived.personal).toMatchObject({ writable: false, reason: expect.stringContaining("Archived title") });
  fail(await done(s.feedback.saveRating("archived-movie", "3", await claim(s, "archived-movie"), await ctx(s)))); fail(await done(s.progress.setCompleted("archived-movie", true, await claim(s, "archived-movie"), await ctx(s))));
  expect((await detail(s, "archived-movie")).archived).toBe(true);
  const restored = ok(await done(s.library.restore("archived-movie", archived.revision, await ctx(s)))).value; expect(restored.history).toBe(archived.history);
  expect((await apply(s, "archived-movie", rate("4"))).record?.id).toBe("history-archived-movie-friday-owner");
  // Personal writes never change contribution, Mine, revision, metadata or origins.
  const series = await detail(s, "saved-series"); await apply(s, "saved-series", rate("5")); await apply(s, "saved-series", (x, id, c, e) => x.feedback.saveNote(id, "Mine?", c, e)); await apply(s, "saved-series", episode("not_started"));
  const after = await detail(s, "saved-series"); const { history: _h, personal: _p, historyMembers: _m, ...meta } = after, { history: _h2, personal: _p2, historyMembers: _m2, ...metaBefore } = series; expect(meta).toEqual(metaBefore);
  expect(ok(await done(s.library.list("mine", false, await ctx(s)))).value.items.map(t => t.id)).toEqual(["joint-movie", "saved-video", "archived-movie"]);
  // Legacy browsing without a profile reads history; only a selected same-group profile writes its own record.
  const legacy = createMockService(); ok(await done(legacy.groups.resolve("SYNTHETIC-LEGACY-INITIAL", await ctx(legacy))));
  const browse = await detail(legacy, "legacy-movie"); expect(browse.personal).toMatchObject({ own: null, writable: false, reason: expect.stringContaining("Choose profile") }); expect(browse.personal.history[0].record?.id).toBe("history-legacy-sample-profile");
  expect(fail(await done(legacy.feedback.saveRating("legacy-movie", "3", { memberId: "legacy-sample-profile", numberingStyle: "none" }, await ctx(legacy)))).message).toContain("Choose your own same-group legacy profile");
  ok(await done(legacy.groups.selectProfile("legacy-sample-profile", await ctx(legacy)))); expect((await apply(legacy, "legacy-movie", rate("9"))).record).toMatchObject({ id: "history-legacy-sample-profile", rating: 9 });
  ok(await done(legacy.groups.createProfile("Second Sample", "rose", await ctx(legacy)))); const second = await apply(legacy, "legacy-movie", rate("2")); expect(second.record?.id).toMatch(/^personal-legacy-movie-profile-/); expect(second.history.map(e => e.record?.rating)).toEqual([9, 2]);
  fail(await done(legacy.feedback.saveRating("legacy-movie", "1", { memberId: "legacy-sample-profile", numberingStyle: "none" }, await ctx(legacy))));
});

it("commit-time recheck: held writes fail without writing after archive, structure/runtime change, expiry and every context change", async () => {
  const s = createMockService(); await login(s, "Demo.Viewer");
  // Archive while the response is held.
  let c = await claim(s, "saved-series"), before = await detail(s, "saved-series"); let held = s.feedback.saveRating("saved-series", "2", c, await ctx(s), { scenario: "slow" });
  ok(await done(s.library.removeOwn("saved-series", before.revision, await ctx(s)))); await vi.advanceTimersByTimeAsync(1200); expect(fail(await held).message).toContain("Archived title");
  const archived = await detail(s, "saved-series"); expect(archived.archived).toBe(true); expect(archived.history).toBe(before.history);
  // Runtime shortened while held, then numbering changed on a title without blocking records.
  await login(s); c = await claim(s, "joint-movie"); held = s.progress.saveTimestamp("joint-movie", "1:20:00", c, await ctx(s), { scenario: "slow" });
  let t = ok(await done(s.library.editDraft("joint-movie", await ctx(s)))).value; ok(await done(s.library.save(t.id, t.revision, { ...titleDraft(t), minutes: "60", seconds: "0" }, undefined, await ctx(s)))); await vi.advanceTimersByTimeAsync(1200);
  expect(fail(await held, "personal_input").fields?.timestamp).toContain("must not exceed"); expect((await detail(s, "joint-movie")).history[0].progress).toMatchObject({ timestampSeconds: 300 });
  const created = ok(await done(s.entry.save({ ...blankEntry(), title: "Structure race", contentType: "movie", minutes: "30", seconds: "0", moods: ["funny"] }, false, undefined, undefined, await ctx(s)))).value; if (created.status !== "saved") throw Error("Expected saved");
  c = await claim(s, created.title.id); held = s.feedback.saveRating(created.title.id, "5", c, await ctx(s), { scenario: "slow" });
  t = ok(await done(s.library.editDraft(created.title.id, await ctx(s)))).value; const draft = { ...titleDraft(t), contentType: "series" as const, numberingStyle: "season_episode" as const };
  const proposal = ok(await done(s.library.save(t.id, t.revision, draft, undefined, await ctx(s)))).value; if (proposal.status !== "confirmation") throw Error("Expected confirmation"); ok(await done(s.library.save(t.id, t.revision, draft, proposal.handle, await ctx(s))));
  await vi.advanceTimersByTimeAsync(1200); expect(fail(await held).message).toContain("structure changed"); expect((await detail(s, created.title.id)).history).toEqual([]);
  // Synthetic-time expiry clears an imported runtime before commit.
  const page = ok(await done(s.entry.search("youtube", "title", "Synthetic", await ctx(s)))).value as EntryPage; const review = ok(await done(s.entry.select(page.handle, page.candidates[0].id, await ctx(s)))).value; ok(await done(s.entry.adopt(review.handle, await ctx(s))));
  const video = ok(await done(s.entry.save({ ...review.draft, moods: ["funny"] }, false, review.handle, undefined, await ctx(s)))).value; if (video.status !== "saved") throw Error("Expected saved");
  c = await claim(s, video.title.id); held = s.progress.saveTimestamp(video.title.id, "1:00", c, await ctx(s), { scenario: "slow" }); ok(await done(s.entry.advanceTime("thirty-one-days", await ctx(s)))); await vi.advanceTimersByTimeAsync(1200);
  expect(fail(await held, "personal_input").fields?.timestamp).toContain("Full duration is unavailable"); expect((await detail(s, video.title.id)).history).toEqual([]);
  // Sign-out, group/mode/profile switch, removal and rejoin all invalidate a held write.
  const contexts: ((e: ContextIdentity, viewer: { id: string; generation: number }) => Promise<ServiceResult<unknown>>)[] = [
    e => s.accounts.signOut(e), e => s.groups.select("friday", e), e => s.groups.mode("legacy", e), (e, viewer) => s.groups.remove(viewer.id, viewer.generation, e),
  ];
  for (const change of contexts) {
    await login(s); const id = "saved-video", start = await detail(s, id), c2 = await claim(s, id), viewer = ok(await done(s.groups.read())).value.members.find(m => m.name === "Demo.Viewer")!, e = await ctx(s);
    const pending = s.feedback.saveRating(id, "1", c2, e, { scenario: "slow" }), changed = change(e, viewer); await vi.advanceTimersByTimeAsync(80); ok(await changed); await vi.advanceTimersByTimeAsync(1200); expect((await pending).kind).toBe("stale");
    await login(s); expect((await detail(s, id)).history).toBe(start.history);
  }
  const g = ok(await done(s.groups.read())).value; const rotated = ok(await done(s.groups.rotate(g.selected!.generation, await ctx(s)))).value.invite;
  await login(s, "Demo.Viewer", "weekend"); ok(await done(s.groups.resolve(rotated, await ctx(s))));
  const viewerHeld = s.feedback.saveRating("weekend-movie", "1", await claim(s, "weekend-movie"), await ctx(s), { scenario: "slow" }); const join = s.groups.join(await ctx(s)); await vi.advanceTimersByTimeAsync(80); ok(await join); await vi.advanceTimersByTimeAsync(1200); expect((await viewerHeld).kind).toBe("stale");
  // Rejoin reattaches the same member's records with unchanged IDs.
  const rejoined = await detail(s, "joint-movie"); expect(rejoined.personal.own).toMatchObject({ memberId: "friday-viewer", recordId: "history-friday-viewer" }); expect(ids(rejoined)).toEqual(["history-friday-owner:friday-owner", "history-friday-viewer:friday-viewer"]);
  // Profile switch.
  const legacy = createMockService(); ok(await done(legacy.groups.resolve("SYNTHETIC-LEGACY-INITIAL", await ctx(legacy)))); ok(await done(legacy.groups.selectProfile("legacy-sample-profile", await ctx(legacy)))); ok(await done(legacy.groups.createProfile("Other", "teal", await ctx(legacy))));
  ok(await done(legacy.groups.selectProfile("legacy-sample-profile", await ctx(legacy)))); const legacyBefore = await detail(legacy, "legacy-movie"); const lp = legacy.feedback.saveRating("legacy-movie", "1", await claim(legacy, "legacy-movie"), await ctx(legacy), { scenario: "slow" });
  const other = ok(await done(legacy.groups.read())).value.members.find(m => m.name === "Other")!; const sw = legacy.groups.selectProfile(other.id, await ctx(legacy)); await vi.advanceTimersByTimeAsync(80); ok(await sw); await vi.advanceTimersByTimeAsync(1200); expect((await lp).kind).toBe("stale"); expect((await detail(legacy, "legacy-movie")).history).toBe(legacyBefore.history);
});

it("synthetic injection: cancel and unavailable write nothing; retry succeeds; reads are stable", async () => {
  const s = createMockService(); await login(s); const start = await detail(s, "joint-movie"), c = await claim(s, "joint-movie");
  const controller = new AbortController(), pending = s.feedback.saveNote("joint-movie", "Canceled draft", c, await ctx(s), { scenario: "slow", signal: controller.signal }); controller.abort(); expect((await pending).kind).toBe("cancelled");
  expect((await done(s.feedback.saveNote("joint-movie", "Unavailable draft", c, await ctx(s), { scenario: "unavailable" }), 300)).kind).toBe("failure");
  fail(await done(s.feedback.saveNote("joint-movie", "Bad scenario", c, await ctx(s), { scenario: "forever" as never })), "invalid_selection");
  const stale = await ctx(s); ok(await done(s.groups.select("friday", stale))); expect((await done(s.feedback.saveNote("joint-movie", "Stale", c, stale))).kind).toBe("stale");
  expect((await detail(s, "joint-movie")).history).toBe(start.history);
  const retried = ok(await done(s.feedback.saveNote("joint-movie", "Retried draft", c, await ctx(s)))).value; expect(retried.record).toMatchObject({ id: "history-friday-owner", note: "Retried draft" });
  const read = await detail(s, "joint-movie"); expect(read.personal.own).toEqual(retried.own); expect(read.personal.history).toEqual(retried.history); expect((await detail(s, "joint-movie")).history).toBe(read.history);
});

it("survival and D10: IDs survive archive/restore, edits, duplicate save, refresh, expiry and reset; blocking records guard structure", async () => {
  let time = Date.UTC(2026, 0, 1); const s = createMockService({ now: () => time }); await login(s);
  await apply(s, "joint-movie", rate("6")); await login(s, "Demo.Viewer"); await apply(s, "joint-movie", (x, id, c, e) => x.feedback.saveNote(id, "Viewer kept", c, e));
  const expected = ["history-friday-owner:friday-owner", "history-friday-viewer:friday-viewer"];
  let t = await detail(s, "joint-movie"); await login(s); ok(await done(s.library.removeOwn(t.id, t.revision, await ctx(s)))); await login(s, "Demo.Viewer"); t = await detail(s, "joint-movie"); const last = ok(await done(s.library.removeOwn(t.id, t.revision, await ctx(s)))).value; expect(last.archived).toBe(true); expect(ids(last)).toEqual(expected);
  ok(await done(s.library.restore(t.id, last.revision, await ctx(s)))); expect(ids(await detail(s, "joint-movie"))).toEqual(expected);
  const draft = { ...blankEntry(), title: "Together Tonight", contentType: "movie" as const, minutes: "90", seconds: "0", moods: ["funny"] }; const proposal = ok(await done(s.entry.save(draft, false, undefined, undefined, await ctx(s)))).value; if (proposal.status !== "confirmation") throw Error("Expected confirmation"); ok(await done(s.entry.save(draft, false, undefined, proposal.handle, await ctx(s))));
  const kept = await detail(s, "joint-movie"); expect(ids(kept)).toEqual(expected); expect(kept.history.map(r => [r.rating, r.note])).toEqual([[6, "Synthetic personal note. <script> stays plain text."], [8, "Viewer kept"]]);
  const page = ok(await done(s.entry.search("youtube", "title", "Synthetic", await ctx(s)))).value as EntryPage; const review = ok(await done(s.entry.select(page.handle, page.candidates[0].id, await ctx(s)))).value; ok(await done(s.entry.adopt(review.handle, await ctx(s))));
  const video = ok(await done(s.entry.save({ ...review.draft, moods: ["funny"] }, false, review.handle, undefined, await ctx(s)))).value; if (video.status !== "saved") throw Error("Expected saved");
  const own = await apply(s, video.title.id, stamp("2:00")); ok(await done(s.entry.refresh(video.title.id, await ctx(s)))); ok(await done(s.entry.advanceTime("thirty-one-days", await ctx(s)))); time += 0;
  const expired = await detail(s, video.title.id); expect(expired.durationSeconds).toBeNull(); expect(expired.history).toEqual([own.record]); expect(expired.personal.own?.progress).toMatchObject({ timestampSeconds: 120, runtimeAvailable: false });
  // D10: a completion-only record blocks numbering changes; a fully cleared record does not.
  const series = ok(await done(s.entry.save({ ...blankEntry(), title: "Guarded series", contentType: "series", minutes: "20", seconds: "0", numberingStyle: "season_episode", moods: ["funny"] }, true, undefined, undefined, await ctx(s)))).value; if (series.status !== "saved") throw Error("Expected saved");
  await apply(s, series.title.id, (x, id, c, e) => x.progress.setCompleted(id, true, c, e)); let edit = ok(await done(s.library.editDraft(series.title.id, await ctx(s)))).value;
  expect(fail(await done(s.library.save(edit.id, edit.revision, { ...titleDraft(edit), numberingStyle: "continuous" }, undefined, await ctx(s))), "library_input").message).toContain("Existing history");
  const movie = ok(await done(s.entry.save({ ...blankEntry(), title: "Cleared movie", contentType: "movie", minutes: "20", seconds: "0", moods: ["funny"] }, false, undefined, undefined, await ctx(s)))).value; if (movie.status !== "saved") throw Error("Expected saved");
  await apply(s, movie.title.id, rate("4")); edit = ok(await done(s.library.editDraft(movie.title.id, await ctx(s)))).value; const typeDraft = { ...titleDraft(edit), contentType: "youtube" as const };
  fail(await done(s.library.save(edit.id, edit.revision, typeDraft, undefined, await ctx(s))), "library_input");
  await apply(s, movie.title.id, (x, id, c, e) => x.feedback.clearRating(id, c, e)); const cleared = await detail(s, movie.title.id); expect(cleared.history).toHaveLength(1);
  const confirm = ok(await done(s.library.save(cleared.id, cleared.revision, typeDraft, undefined, await ctx(s)))).value; if (confirm.status !== "confirmation") throw Error("Expected confirmation"); expect(ok(await done(s.library.save(cleared.id, cleared.revision, typeDraft, confirm.handle, await ctx(s)))).value.status).toBe("saved");
  // Reset reseeds structured records with the same IDs and removes new ones.
  ok(await done(s.context.reset(await ctx(s)))); await login(s); expect((await detail(s, "joint-movie")).history.map(r => [r.id, r.rating, r.note])).toEqual([["history-friday-owner", 8, "Synthetic personal note. <script> stays plain text."], ["history-friday-viewer", 8, "Synthetic personal note. <script> stays plain text."]]);
  expect(ids(await detail(s, "saved-series"))).toEqual(["history-saved-series-friday-viewer:friday-viewer"]);
});
