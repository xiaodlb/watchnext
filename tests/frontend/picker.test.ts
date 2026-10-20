// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockService } from "../../frontend/mock/service";
import { blankEntry } from "../../frontend/mock/metadata-fixtures";
import { titleDraft, type Row } from "../../frontend/mock/library";
import { candidateIdentity, conflictMessage, cycleCapacity, noMatchLabels, projectProgress, projectSnapshot } from "../../frontend/mock/picker";
import * as ranking from "../../lib/picker/ranking";
import { evaluateEligibility } from "../../lib/picker/eligibility";
import { candidateIdentity as baselineIdentity } from "../../lib/picker/cycle";
import type { EligibilityProgress, TitleEligibility } from "../../lib/picker/types";
import type { ContextIdentity, FrontendService, LibraryDraft, LibraryHistory, PickerCycleHandle, PickerInput, PickerOutcome, ServiceResult } from "../../frontend/service/contracts";

// Wrap (not replace) the real baseline function so the test can prove the mock calls it.
vi.mock("../../lib/picker/ranking", async original => { const actual = await original<typeof import("../../lib/picker/ranking")>(); return { ...actual, rankCandidates: vi.fn(actual.rankCandidates) }; });
beforeEach(() => { vi.useFakeTimers(); vi.mocked(ranking.rankCandidates).mockClear(); }); afterEach(() => vi.useRealTimers());
async function done<T>(p: Promise<T>, ms = 80) { await vi.advanceTimersByTimeAsync(ms); return p; }
function ok<T>(r: ServiceResult<T>) { if (r.kind !== "success") throw Error(`Expected success, got ${r.kind}: ${r.kind === "failure" ? r.error.message : r.message}`); return r; }
async function ctx(s: FrontendService) { return ok(await done(s.context.read())).context; }
async function login(s: FrontendService, user = "Demo.Owner", group = "friday") { ok(await done(s.accounts.signIn({ username: user, password: "synthetic password" }, await ctx(s)))); return ok(await done(s.groups.select(group, await ctx(s)))).context; }
let intents = 0; const intent = () => `test-intent-${++intents}`;
const input = (viewerIds: string[], availableMinutes: string, mood = "funny", rewatches = false): PickerInput => ({ viewerIds, availableMinutes, mood, rewatches });
const V = ["friday-viewer"], O = ["friday-owner"], OV = ["friday-owner", "friday-viewer"];
async function pick(s: FrontendService, i: PickerInput, id = intent()) { return ok(await done(s.picker.pick(i, id, await ctx(s)))).value; }
async function next(s: FrontendService, c: PickerCycleHandle, id = intent()) { return ok(await done(s.picker.next(c, id, await ctx(s)))).value; }
async function restart(s: FrontendService, i: PickerInput, c: PickerCycleHandle, id = intent()) { return ok(await done(s.picker.restart(i, c, id, await ctx(s)))).value; }
function label(o: PickerOutcome) {
  if (o.kind !== "picked") return o.kind;
  const t = o.candidate.target; return t.kind === "item" ? o.candidate.title : `${o.candidate.title} ${t.nextSeason === null ? "" : `S${t.nextSeason}`}E${t.nextEpisode}`;
}
const handle = (o: PickerOutcome) => { if (o.kind !== "picked" && o.kind !== "exhausted") throw Error(`No cycle on ${o.kind}`); return o.cycle; };
/** Walks the whole cycle: first pick, Pick again until exhausted. */
async function walk(s: FrontendService, i: PickerInput) {
  const out = [await pick(s, i)]; while (out.at(-1)!.kind === "picked") out.push(await next(s, handle(out.at(-1)!)));
  return out;
}
const reasons = (o: PickerOutcome) => o.kind === "no_match" ? o.reasons.map(r => r.code) : [];
async function save(s: FrontendService, draft: Partial<LibraryDraft>) { return ok(await done(s.entry.save({ ...blankEntry(), contentType: "movie", genres: "", moods: ["funny"], ...draft }, false, undefined, undefined, await ctx(s)))).value; }
async function claim(s: FrontendService, id: string) { const t = ok(await done(s.library.detail(id, await ctx(s)))).value; return { memberId: t.personal.own!.memberId, numberingStyle: t.numberingStyle }; }
async function libraryState(s: FrontendService) {
  const c = await ctx(s);
  return JSON.stringify([ok(await done(s.library.list("all", false, c))).value, ok(await done(s.library.list("all", true, c))).value, ok(await done(s.library.list("mine", false, c))).value]);
}

it("reuses the real baseline rankCandidates (which runs evaluateEligibility) and the baseline candidate identity format", async () => {
  const source = readFileSync("frontend/mock/picker.ts", "utf8");
  expect(source).toContain('from "../../lib/picker/ranking"'); expect(source).not.toMatch(/function\s+(?:rankCandidates|evaluateEligibility)\b/); expect(source).not.toMatch(/from\s+["'][^"']*lib\/picker\/(?:cycle|server|view-state)/);
  const s = createMockService(); await login(s);
  const first = await pick(s, input(V, "90"));
  expect(vi.mocked(ranking.rankCandidates)).toHaveBeenCalledTimes(1);
  const call = vi.mocked(ranking.rankCandidates).mock.calls[0][0], returned = vi.mocked(ranking.rankCandidates).mock.results[0].value as ranking.RankingResult;
  expect(call).toMatchObject({ groupId: "friday", selectedViewerIds: V, availableMinutes: "90", mood: "funny", rewatches: false });
  expect(call.members).toEqual([{ id: "friday-owner", groupId: "friday" }, { id: "friday-viewer", groupId: "friday" }]);
  expect(returned.kind).toBe("ranked"); if (returned.kind === "ranked") expect(returned.eligibility).toEqual(evaluateEligibility(call));
  expect(label(first)).toBe("Together Tonight");
  for (const [id, target] of [["a", { kind: "item" }], ["b", { kind: "episode", numberingStyle: "season_episode", nextSeason: 2, nextEpisode: 7 }], ["c", { kind: "episode", numberingStyle: "continuous", nextSeason: null, nextEpisode: 1 }]] as const) expect(candidateIdentity(id, target)).toBe(baselineIdentity(id, target));
});

// ---- Projection and the eligibility truth table (both numbering styles, both rewatch values) ----
type Rec = LibraryHistory["progress"];
const progressRow = (numbering: Row["numberingStyle"], history: LibraryHistory[], contentType: Row["contentType"] = numbering === "none" ? "movie" : "series"): Row => ({ id: "t", groupId: "g", revision: 1, createdBy: "a", providerId: null, archived: false, title: "Truth title", contentType, durationSeconds: 1200, numberingStyle: numbering, genres: [], moods: ["funny"], watchUrl: null, sourceUrl: null, coverUrl: null, contributions: [], history, origins: {}, availability: "", createdAt: "2026-10-01T00:00:00.000Z" });
const rec = (memberId: string, progress: Rec, rating: number | null = null, note: string | null = null): LibraryHistory => ({ id: `r-${memberId}`, memberId, progress, rating, note });
/** Truth-table shorthand: 3 / 7 / 12 are next episodes (seasonal season 1); "S2E1" is seasonal only; NS explicit Not started; U absent; XU explicit Unknown; C(...) completed. */
function state(token: string, seasonal: boolean): Rec | undefined {
  const completed = token.startsWith("C(");
  const inner = completed ? token.slice(2, -1) : token;
  if (inner === "U") return completed ? undefined : undefined;
  if (inner === "XU") return { kind: "episode", position: "unknown", season: null, episode: null, completed };
  if (inner === "NS") return { kind: "episode", position: "not_started", season: seasonal ? 1 : null, episode: 1, completed };
  if (inner === "S2E1") return { kind: "episode", position: "in_progress", season: 2, episode: 1, completed };
  return { kind: "episode", position: "in_progress", season: seasonal ? 1 : null, episode: Number(inner), completed };
}
function completedUnknown(): Rec { return { kind: "episode", position: "unknown", season: null, episode: null, completed: true }; }
function evaluateThroughMock(numbering: Row["numberingStyle"], records: (Rec | undefined)[], rewatches: boolean) {
  const members = ["a", "b"].slice(0, records.length || 1);
  const history = records.flatMap((p, i) => p === undefined ? [] : [rec(members[i], p, 7, "note")]);
  const snapshot = projectSnapshot([progressRow(numbering, history)], "g");
  const result = evaluateEligibility({ groupId: "g", members: members.map(id => ({ id, groupId: "g" })), titles: snapshot.titles, progress: snapshot.progress, selectedViewerIds: members, rewatches });
  if (result.kind !== "evaluated") throw Error(result.kind);
  // The same records written as baseline progress rows (eligibility.md projection) give the identical result.
  const baselineRows: EligibilityProgress[] = history.map(r => r.progress!.kind === "episode" ? { titleId: "t", memberId: r.memberId, groupId: "g", numberingStyle: numbering, completed: r.progress!.completed, positionState: r.progress!.position, nextSeason: r.progress!.season, nextEpisode: r.progress!.episode } : { titleId: "t", memberId: r.memberId, groupId: "g", numberingStyle: numbering, completed: r.progress!.completed, positionState: "unknown", nextSeason: null, nextEpisode: null });
  expect(snapshot.progress).toEqual(baselineRows);
  expect(evaluateEligibility({ groupId: "g", members: members.map(id => ({ id, groupId: "g" })), titles: snapshot.titles, progress: baselineRows, selectedViewerIds: members, rewatches })).toEqual(result);
  return result.titles[0];
}
const outcome = (t: TitleEligibility) => t.kind === "excluded" ? t.reason : t.target.kind === "item" ? { item: true, rewatching: t.rewatchingViewerIds } : { season: t.target.nextSeason, episode: t.target.nextEpisode, restart: t.target.restart, catchUp: t.target.catchUp, rewatching: t.rewatchingViewerIds };

it("projection: one row per #59 record with a progress state; rating/note-only and absent records project nothing; Not started is never manufactured", () => {
  const row = progressRow("season_episode", [rec("a", null, 9, "only feedback"), rec("b", { kind: "episode", position: "unknown", season: null, episode: null, completed: false })]);
  expect(projectProgress(row, row.history[0])).toBeNull();
  expect(projectSnapshot([row], "g").progress).toEqual([{ titleId: "t", memberId: "b", groupId: "g", numberingStyle: "season_episode", completed: false, positionState: "unknown", nextSeason: null, nextEpisode: null }]);
  const watch = progressRow("none", [rec("a", { kind: "watch", timestampSeconds: 1200, completed: false }), rec("b", { kind: "watch", timestampSeconds: null, completed: true })]);
  expect(projectSnapshot([watch], "g").progress.map(p => [p.memberId, p.positionState, p.nextSeason, p.nextEpisode, p.completed])).toEqual([["a", "unknown", null, null, false], ["b", "unknown", null, null, true]]);
  expect(projectSnapshot([progressRow("continuous", [])], "g").progress).toEqual([]);
  const titles = projectSnapshot([progressRow("none", [], "youtube")], "g").titles; expect(titles[0]).toEqual({ id: "t", groupId: "g", archived: false, title: "Truth title", contentType: "youtube", durationSeconds: 1200, numberingStyle: "none", moods: ["funny"], createdAt: "2026-10-01T00:00:00.000Z" });
  expect(Object.keys(titles[0])).not.toContain("watchUrl");
});

it("truth table: every eligibility.md row through the mock projection gives the baseline result for both numbering styles and both rewatch values", () => {
  for (const numbering of ["season_episode", "continuous"] as const) {
    const seasonal = numbering === "season_episode", s1 = seasonal ? 1 : null;
    const check = (tokens: (string | Rec)[], off: unknown, on: unknown) => {
      const records = tokens.map(t => typeof t === "string" ? state(t, seasonal) : t);
      expect(outcome(evaluateThroughMock(numbering, records, false)), `${numbering} ${JSON.stringify(tokens)} off`).toEqual(off);
      expect(outcome(evaluateThroughMock(numbering, records, true)), `${numbering} ${JSON.stringify(tokens)} on`).toEqual(on);
    };
    const target = (episode: number, rewatching: string[] = [], extra: { restart?: boolean; catchUp?: boolean } = {}) => ({ season: s1, episode, restart: extra.restart ?? false, catchUp: extra.catchUp ?? false, rewatching });
    check(["3"], target(3), target(3));
    check(["NS"], target(1), target(1)); check(["NS", "1"], target(1), target(1));
    check(["3", "3"], target(3), target(3));
    check(["3", "7"], "different_positions", target(3, ["b"], { catchUp: true }));
    check(["NS", "7"], "different_positions", target(1, ["b"], { catchUp: true }));
    check(["U"], "unknown_progress", "unknown_progress"); check(["XU"], "unknown_progress", "unknown_progress");
    check(["3", "U"], "unknown_progress", "unknown_progress"); check(["3", "XU"], "unknown_progress", "unknown_progress");
    check(["C(3)", "7"], "completed_viewer", target(7, ["a"], { catchUp: true })); check([completedUnknown(), "7"], "completed_viewer", target(7, ["a"], { catchUp: true }));
    check(["C(3)", "U"], "completed_viewer", "unknown_progress"); check([completedUnknown(), "XU"], "completed_viewer", "unknown_progress");
    check(["C(3)", "C(7)"], "completed_viewer", target(1, ["a", "b"], { restart: true })); check([completedUnknown(), completedUnknown()], "completed_viewer", target(1, ["a", "b"], { restart: true }));
    if (seasonal) check(["12", "S2E1"], "different_positions", { season: 1, episode: 12, restart: false, catchUp: true, rewatching: ["b"] });
  }
  const movie = (records: Rec[], rewatches: boolean) => outcome(evaluateThroughMock("none", records, rewatches));
  for (const records of [[], [{ kind: "watch", timestampSeconds: 1200, completed: false }], [{ kind: "watch", timestampSeconds: null, completed: false }]] as Rec[][]) for (const r of [false, true]) expect(movie(records, r)).toEqual({ item: true, rewatching: [] });
  const completed: Rec[] = [{ kind: "watch", timestampSeconds: 300, completed: true }, { kind: "watch", timestampSeconds: null, completed: false }];
  expect(movie(completed, false)).toBe("completed_viewer"); expect(movie(completed, true)).toEqual({ item: true, rewatching: ["a"] });
});

// ---- K01 inputs and scenarios through the real mounted service ----
it("K01 viewers: active account members only, every legacy profile without a selected profile, safe failure without a group, honest empty legacy group", async () => {
  const s = createMockService();
  const none = await done(s.picker.getInputs(await ctx(s))); expect(none.kind === "failure" && none.error.code).toBe("picker_access");
  await login(s); expect(ok(await done(s.picker.getInputs(await ctx(s)))).value).toEqual({ groupId: "friday", groupName: "Synthetic Friday friends", mode: "account", viewers: [{ id: "friday-owner", name: "Demo.Owner", color: "purple" }, { id: "friday-viewer", name: "Demo.Viewer", color: "blue" }], canAddTitle: true });
  await login(s, "Demo.Viewer", "weekend"); expect(ok(await done(s.picker.getInputs(await ctx(s)))).value.viewers.map(v => v.id)).toEqual(["weekend-viewer"]);
  ok(await done(s.groups.mode("legacy", await ctx(s)))); ok(await done(s.groups.resolve("SYNTHETIC-LEGACY-INITIAL", await ctx(s))));
  expect(ok(await done(s.picker.getInputs(await ctx(s)))).value).toMatchObject({ mode: "legacy", viewers: [{ id: "legacy-sample-profile", name: "Legacy sample", color: "teal" }], canAddTitle: false });
  const legacy = ok(await done(s.groups.createLegacy("Empty legacy", await ctx(s)))).value; ok(await done(s.groups.resolve(legacy.invite, await ctx(s))));
  expect(ok(await done(s.picker.getInputs(await ctx(s)))).value).toMatchObject({ groupName: "Empty legacy", viewers: [], canAddTitle: false });
});

it("scenarios 1-10: exact, over-budget, different-mood tiers, catch-up and every Friday no-match reason, with baseline wording", async () => {
  const s = createMockService(); await login(s);
  const one = await walk(s, input(V, "90"));
  expect(one.map(label)).toEqual(["Together Tonight", "Short Laughs S1E2", "Paper Stars E2", "A Small Good Idea", "exhausted"]);
  expect(one[0]).toMatchObject({ kind: "picked", refreshed: false, candidate: { id: "joint-movie", contentType: "movie", durationSeconds: 5400, tier: "exact", message: "Matches your mood and fits your available time.", target: { kind: "item" }, rewatchers: [], viewers: [{ id: "friday-viewer", name: "Demo.Viewer", color: "blue" }], availableMinutes: "90", requestedMood: "Funny", rewatches: false, watchUrl: "https://example.test/watch/sample" } });
  expect(JSON.stringify(one)).not.toMatch(/rating|note|Synthetic personal note/);
  expect(label(await restart(s, input(V, "90"), handle(one[4])))).toBe("Together Tonight");
  expect((await walk(s, input(OV, "90"))).map(label)).toEqual(["Together Tonight", "A Small Good Idea", "exhausted"]);
  const three = await walk(s, input(OV, "90", "funny", true));
  expect(three.map(label)).toEqual(["Together Tonight", "Paper Stars E1", "A Small Good Idea", "exhausted"]);
  expect(three[1].kind === "picked" && three[1].candidate).toMatchObject({ target: { kind: "episode", numberingStyle: "continuous", nextEpisode: 1, catchUp: true, restart: false }, rewatchers: [{ id: "friday-viewer" }], viewers: [{ id: "friday-owner" }, { id: "friday-viewer" }], rewatches: true });
  expect((await walk(s, input(O, "25"))).map(label)).toEqual(["Paper Stars E1", "A Small Good Idea", "exhausted"]);
  const five = await walk(s, input(V, "14")); expect(five.map(label)).toEqual(["A Small Good Idea", "exhausted"]);
  expect(five[0].kind === "picked" && five[0].candidate).toMatchObject({ tier: "over_budget", message: "1 minute longer than your available time." });
  const six = await pick(s, input(V, "10")); expect(six.kind === "picked" && six.candidate).toMatchObject({ id: "saved-video", tier: "over_budget", message: "5 minutes longer than your available time." });
  const seven = await pick(s, input(V, "9")); expect(reasons(seven)).toEqual(["metadata_incomplete", "time_mood_excluded"]);
  expect(seven).toMatchObject({ kind: "no_match", refreshed: false, message: "No saved item matches these viewers and the permitted time/mood tiers. Keep your inputs or adjust them explicitly.", suggestions: [{ kind: "open_title", titleId: "expired-video", label: "View details to review progress or metadata" }] });
  if (seven.kind === "no_match") expect(seven.reasons.map(r => r.label)).toEqual([noMatchLabels.metadata_incomplete, noMatchLabels.time_mood_excluded]);
  const eight = await walk(s, input(V, "90", "relaxing")); expect(eight.map(label)).toEqual(["Together Tonight", "Short Laughs S1E2", "Paper Stars E2", "A Small Good Idea", "exhausted"]);
  for (const o of eight.slice(0, 4)) expect(o.kind === "picked" && [o.candidate.tier, o.candidate.message]).toEqual(["different_mood", "Requested Relaxing; different mood: Funny. Within your available time."]);
  const nine = await pick(s, input(O, "5")); expect(reasons(nine)).toEqual(["progress_required", "metadata_incomplete", "time_mood_excluded"]);
  expect(nine.kind === "no_match" && nine.suggestions).toEqual([{ kind: "open_title", titleId: "saved-series", label: "View details to review progress or metadata" }]);
  expect(reasons(await pick(s, input(OV, "5")))).toEqual(["progress_required", "viewer_ineligible", "metadata_incomplete", "time_mood_excluded"]);
});

it("scenarios 11-14: weekend completed viewer off/on, legacy pick with no profile, empty new account group, legacy group with no profiles", async () => {
  const s = createMockService(); await login(s, "Demo.Viewer", "weekend");
  const off = await pick(s, input(["weekend-viewer"], "30")); expect(reasons(off)).toEqual(["viewer_ineligible"]); expect(off.kind === "no_match" && off.suggestions).toEqual([]);
  const on = await pick(s, input(["weekend-viewer"], "30", "funny", true)); expect(on.kind === "picked" && on.candidate).toMatchObject({ id: "weekend-movie", rewatchers: [{ id: "weekend-viewer", name: "Demo.Viewer" }] });
  const retired = await done(s.picker.pick(input(["weekend-retired"], "30"), intent(), await ctx(s))); expect(retired.kind === "failure" && retired.error.fields).toEqual({ viewers: "A selected viewer is unavailable in this group." });
  ok(await done(s.groups.mode("legacy", await ctx(s)))); ok(await done(s.groups.resolve("SYNTHETIC-LEGACY-INITIAL", await ctx(s))));
  expect(ok(await done(s.groups.read())).value.profileId).toBeNull();
  const legacy = await pick(s, input(["legacy-sample-profile"], "25")); expect(legacy.kind === "picked" && [legacy.candidate.title, legacy.candidate.tier]).toEqual(["Legacy sample film", "exact"]);
  const empty = ok(await done(s.groups.createLegacy("No profiles", await ctx(s)))).value; ok(await done(s.groups.resolve(empty.invite, await ctx(s))));
  expect(ok(await done(s.picker.getInputs(await ctx(s)))).value.viewers).toEqual([]);
  const noViewer = await done(s.picker.pick(input([], "25"), intent(), await ctx(s))); expect(noViewer.kind === "failure" && noViewer.error.fields).toEqual({ viewers: "Select at least one viewer." });
  ok(await done(s.groups.mode("account", await ctx(s)))); ok(await done(s.groups.create("Fresh group", await ctx(s))));
  const inputs = ok(await done(s.picker.getInputs(await ctx(s)))).value; expect(inputs.viewers.map(v => v.name)).toEqual(["Demo.Viewer"]);
  const fresh = await pick(s, input([inputs.viewers[0].id], "30")); expect(reasons(fresh)).toEqual(["no_active_titles"]); expect(fresh.kind === "no_match" && fresh.suggestions).toEqual([{ kind: "add_title", label: "Add a title" }]);
  // Legacy without a selected profile: the add suggestion asks for a profile instead.
  ok(await done(s.groups.mode("legacy", await ctx(s)))); const bare = ok(await done(s.groups.createLegacy("Bare legacy", await ctx(s)))).value; ok(await done(s.groups.resolve(bare.invite, await ctx(s))));
  ok(await done(s.groups.createProfile("Anna", "rose", await ctx(s)))); ok(await done(s.groups.resolve(bare.invite, await ctx(s))));
  expect(ok(await done(s.groups.read())).value.profileId).toBeNull();
  const anna = ok(await done(s.picker.getInputs(await ctx(s)))).value.viewers[0]; const bareResult = await pick(s, input([anna.id], "30"));
  expect(bareResult.kind === "no_match" && bareResult.suggestions).toEqual([{ kind: "add_title", label: "Choose profile to add a title" }]);
});

it("states through earlier domains: restart and completed movie (#59), creation-order tie and one-second disclosure (#58), multi-mood match (#57)", async () => {
  const s = createMockService({ now: () => Date.parse("2026-10-19T12:00:00.000Z") }); await login(s);
  ok(await done(s.progress.setCompleted("saved-anime", true, await claim(s, "saved-anime"), await ctx(s))));
  await login(s, "Demo.Viewer");
  ok(await done(s.progress.setCompleted("saved-anime", true, await claim(s, "saved-anime"), await ctx(s))));
  const restartWalk = await walk(s, input(OV, "90", "funny", true));
  const paper = restartWalk.find(o => o.kind === "picked" && o.candidate.id === "saved-anime");
  expect(paper?.kind === "picked" && paper.candidate).toMatchObject({ target: { kind: "episode", nextSeason: null, nextEpisode: 1, restart: true, catchUp: false }, rewatchers: [{ id: "friday-owner" }, { id: "friday-viewer" }] });
  const active = await pick(s, input(V, "90")); expect(label(active)).toBe("Together Tonight");
  ok(await done(s.progress.setCompleted("joint-movie", true, await claim(s, "joint-movie"), await ctx(s))));
  const refreshed = await next(s, handle(active)); expect(refreshed).toMatchObject({ kind: "picked", refreshed: true }); expect(label(refreshed)).toBe("Short Laughs S1E2");
  expect((await walk(s, input(V, "90"))).map(label)).not.toContain("Together Tonight");
  const rewatch = await pick(s, input(V, "90", "funny", true)); expect(rewatch.kind === "picked" && [rewatch.candidate.id, rewatch.candidate.rewatchers.map(r => r.id)]).toEqual(["joint-movie", ["friday-viewer"]]);
  // #58 tie: equal 900 s, the older createdAt (seed) wins; 900 s also fits a 15-minute budget exactly.
  const tie = await save(s, { title: "Fifteen minute tie", minutes: "15", seconds: "0" }); expect(tie.status).toBe("saved");
  const tied = await walk(s, input(V, "15")); expect(tied.map(label)).toEqual(["A Small Good Idea", "Fifteen minute tie", "exhausted"]); expect(tied[1].kind === "picked" && tied[1].candidate.tier).toBe("exact");
  // #57 multi-mood: any matching mood makes the exact tier.
  await login(s, "Demo.Owner"); const video = ok(await done(s.library.detail("saved-video", await ctx(s)))).value;
  expect(ok(await done(s.library.save("saved-video", video.revision, { ...titleDraft(video), moods: ["funny", "relaxing"] }, undefined, await ctx(s)))).value.status).toBe("saved");
  const relaxing = await walk(s, input(V, "90", "relaxing")); expect(relaxing.map(label)).toEqual(["A Small Good Idea", "exhausted"]); expect(relaxing[0].kind === "picked" && relaxing[0].candidate.tier).toBe("exact");
  // One-second disclosure in a new account group: save 25:01 first (over-budget), then 25:00 (exact).
  ok(await done(s.groups.create("Disclosure group", await ctx(s)))); const me = ok(await done(s.picker.getInputs(await ctx(s)))).value.viewers[0].id;
  await save(s, { title: "Twenty-five and one", minutes: "25", seconds: "1" });
  const over = await pick(s, input([me], "25")); expect(over.kind === "picked" && [over.candidate.tier, over.candidate.message]).toEqual(["over_budget", "1 second longer than your available time."]);
  await save(s, { title: "Twenty-five exactly", minutes: "25", seconds: "0" });
  expect((await walk(s, input([me], "25"))).map(o => o.kind === "picked" ? [o.candidate.title, o.candidate.tier] : o.kind)).toEqual([["Twenty-five exactly", "exact"], "exhausted"]);
});

it("createdAt: fixed seed instants in seed order, monotonic new saves even with an injected early clock, unchanged by edits/restore/expiry and reseeded by Reset", async () => {
  const created = () => Object.fromEntries(vi.mocked(ranking.rankCandidates).mock.calls.at(-1)![0].titles.map(t => [t.id, t.createdAt]));
  const at = (k: number) => new Date(Date.parse("2026-10-01T00:00:00.000Z") + k).toISOString();
  let clock = 0; const s = createMockService({ now: () => clock }); await login(s);
  await pick(s, input(V, "90"));
  expect(created()).toEqual({ "joint-movie": at(0), "saved-series": at(1000), "saved-anime": at(2000), "saved-video": at(3000), "archived-movie": at(4000), "expired-video": at(5000) });
  await login(s, "Demo.Viewer", "weekend"); await pick(s, input(["weekend-viewer"], "30")); expect(created()).toEqual({ "weekend-movie": at(6000), "weekend-archive": at(8000) });
  ok(await done(s.groups.mode("legacy", await ctx(s)))); ok(await done(s.groups.resolve("SYNTHETIC-LEGACY-INITIAL", await ctx(s)))); await pick(s, input(["legacy-sample-profile"], "25")); expect(created()).toEqual({ "legacy-movie": at(7000) });
  // An injected clock before every seed still yields creation after the newest existing row, in save order.
  await login(s); const a = await save(s, { title: "Early clock A", minutes: "15", seconds: "0" }), b = await save(s, { title: "Early clock B", minutes: "15", seconds: "0" });
  const ids = [a, b].map(x => x.status === "saved" ? x.title.id : ""); await pick(s, input(V, "15"));
  expect([created()[ids[0]], created()[ids[1]]]).toEqual([at(8001), at(8002)]);
  expect((await walk(s, input(V, "15"))).map(label)).toEqual(["A Small Good Idea", "Early clock A", "Early clock B", "exhausted"]);
  clock = Date.parse("2026-10-19T12:00:00.000Z"); const c = await save(s, { title: "Clock now", minutes: "15", seconds: "0" }); const cid = c.status === "saved" ? c.title.id : "";
  await pick(s, input(V, "15")); expect(created()[cid]).toBe("2026-10-19T12:00:00.000Z");
  const before = created(), saved = ok(await done(s.library.detail(ids[0], await ctx(s)))).value; expect(Object.keys(saved)).not.toContain("createdAt");
  ok(await done(s.library.save(ids[0], saved.revision, { ...titleDraft(saved), watchUrl: "https://example.test/edited" }, undefined, await ctx(s))));
  const removed = ok(await done(s.library.removeOwn(ids[0], saved.revision + 1, await ctx(s)))).value; ok(await done(s.library.restore(ids[0], removed.revision, await ctx(s))));
  ok(await done(s.entry.advanceTime("thirty-one-days", await ctx(s)))); await pick(s, input(V, "15")); expect(created()).toEqual(before);
  ok(await done(s.context.reset(await ctx(s)))); await login(s); await pick(s, input(V, "90"));
  expect(created()).toEqual({ "joint-movie": at(0), "saved-series": at(1000), "saved-anime": at(2000), "saved-video": at(3000), "archived-movie": at(4000), "expired-video": at(5000) });
});

it("input validation: baseline viewer/time/mood/rewatch messages, accepted bounds, and invalid input creates no cycle", async () => {
  const s = createMockService(); await login(s);
  const field = async (i: PickerInput) => { const r = await done(s.picker.pick(i, intent(), await ctx(s))); if (r.kind !== "failure") throw Error(r.kind); expect(r.error.code).toBe("picker_input"); return r.error.fields; };
  expect(await field(input([], "90"))).toEqual({ viewers: "Select at least one viewer." });
  expect(await field(input(["friday-viewer", "friday-viewer"], "90"))).toEqual({ viewers: "Select each viewer once." });
  for (const bad of [["weekend-viewer"], ["nobody"], ["weekend-retired"], [""]]) expect(await field(input(bad, "90"))).toEqual({ viewers: "A selected viewer is unavailable in this group." });
  for (const time of ["0", "1441", "045", " 45", "45.0", "1e2", "+5", "", "45 ", "-1", "abc"]) expect(await field(input(V, time))).toEqual({ availableMinutes: "Enter whole minutes from 1 to 1440." });
  for (const mood of ["", "Funny", "happy", "funny,relaxing"]) expect(await field(input(V, "90", mood))).toEqual({ mood: "Choose exactly one supported mood." });
  for (const rewatches of ["yes", null, undefined, 1, "false"]) expect(await field({ ...input(V, "90"), rewatches } as unknown as PickerInput)).toEqual({ rewatches: "Rewatch permission must be true or false." });
  const low = await pick(s, input(V, "1")); expect(low.kind).toBe("no_match");
  const high = await pick(s, input(V, "1440")); expect(high.kind === "picked" && high.cycle.cycleId).toBe("cycle-1");
});

it("cycle protocol: one-item exhaustion, next after exhaustion, restart rules, tampered/unknown/foreign cycles and malformed intents conflict", async () => {
  const s = createMockService(); await login(s);
  const conflict = { kind: "conflict", refreshed: false, message: conflictMessage };
  const one = await pick(s, input(V, "14")); const exhausted = await next(s, handle(one)); expect(exhausted).toMatchObject({ kind: "exhausted", refreshed: false });
  expect(await next(s, handle(exhausted))).toEqual(conflict);
  expect(await restart(s, input(V, "13"), handle(exhausted))).toEqual(conflict);
  expect(await restart(s, input(V, "14", "funny", true), handle(exhausted))).toEqual(conflict);
  expect(label(await restart(s, input(V, "14"), handle(exhausted)))).toBe("A Small Good Idea");
  const active = await pick(s, input(V, "90"));
  expect(await restart(s, input(V, "90"), handle(active))).toEqual(conflict);
  expect(await next(s, { ...handle(active), step: "cycle-2-step-9" })).toEqual(conflict);
  expect(await next(s, { cycleId: "cycle-404", step: "cycle-404-step-1" })).toEqual(conflict);
  expect(await next(s, handle(active), "bad intent!")).toEqual(conflict); expect(await pick(s, input(V, "90"), "x".repeat(81))).toEqual(conflict);
  expect(label(await next(s, handle(active)))).toBe("Short Laughs S1E2");
  // Handles from another mounted instance grant nothing here: an unknown ID, or a colliding synthetic ID with a different step, conflicts.
  const other = createMockService(); await login(other); for (let i = 0; i < 5; i++) await pick(other, input(V, "90"));
  const foreign = await pick(other, input(V, "90")); expect(handle(foreign).cycleId).toBe("cycle-6");
  expect(await next(s, handle(foreign))).toEqual(conflict); expect(await next(s, { cycleId: "cycle-1", step: "cycle-1-step-1" })).toEqual(conflict);
  const held = await pick(s, input(V, "90")); await login(s, "Demo.Viewer", "weekend"); await login(s, "Demo.Viewer", "friday");
  expect(await next(s, handle(held))).toEqual(conflict);
  // No cycle is offered for a zero-item result.
  const empty = await pick(s, input(V, "9")); expect(empty.kind).toBe("no_match"); expect("cycle" in empty).toBe(false);
});

it("lifetime and capacity: 30 synthetic minutes from start, not extended by advances, synthetic-time controls, and eviction of the oldest beyond 512", async () => {
  let clock = Date.parse("2026-10-19T12:00:00.000Z"); const s = createMockService({ now: () => clock }); await login(s);
  const c = await pick(s, input(V, "90")); clock += 20 * 60000; const second = await next(s, handle(c)); expect(label(second)).toBe("Short Laughs S1E2");
  clock += 10 * 60000; expect((await next(s, handle(second))).kind).toBe("conflict");
  const viaControls = await pick(s, input(V, "90"));
  for (let i = 0; i < 2; i++) ok(await done(s.entry.advanceTime("ten-minutes", await ctx(s))));
  const still = await next(s, handle(viaControls)); expect(label(still)).toBe("Short Laughs S1E2");
  ok(await done(s.entry.advanceTime("ten-minutes", await ctx(s)))); expect((await next(s, handle(still))).kind).toBe("conflict");
  const recovered = await pick(s, input(V, "90")); expect(label(recovered)).toBe("Together Tonight");
  const fresh = createMockService(); await login(fresh); const e = await ctx(fresh);
  const first = await done(fresh.picker.pick(input(V, "90"), intent(), e)); const handles = [ok(first).value];
  for (let i = 1; i <= cycleCapacity; i++) handles.push(ok(await done(fresh.picker.pick(input(V, "90"), intent(), e))).value);
  expect(handles).toHaveLength(cycleCapacity + 1);
  expect((await next(fresh, handle(handles[0]))).kind).toBe("conflict");
  expect(label(await next(fresh, handle(handles[1])))).toBe("Short Laughs S1E2");
});

it("idempotence: same intent replays position and step, older intents and changed actions conflict, competing intents give one advance and one conflict", async () => {
  const s = createMockService(); await login(s);
  const startId = intent(), start = await pick(s, input(V, "90"), startId);
  const replayStart = await pick(s, input(["friday-viewer"], "90"), startId); expect(replayStart).toEqual(start);
  const a = intent(), first = await next(s, handle(start), a), again = await next(s, handle(start), a);
  expect(again).toEqual(first); expect(label(first)).toBe("Short Laughs S1E2");
  expect(await pick(s, input(V, "90"), startId)).toMatchObject({ kind: "conflict" });
  expect(await restart(s, input(V, "90"), handle(start), a)).toMatchObject({ kind: "conflict" });
  expect(await next(s, handle(start), intent())).toMatchObject({ kind: "conflict" });
  const third = await next(s, handle(first)); expect(label(third)).toBe("Paper Stars E2");
  expect(await next(s, handle(start), a)).toMatchObject({ kind: "conflict" });
  const e = await ctx(s), x = s.picker.next(handle(third), intent(), e), y = s.picker.next(handle(third), intent(), e);
  await vi.advanceTimersByTimeAsync(80); const results = [ok(await x).value, ok(await y).value];
  expect(results.map(label).sort()).toEqual(["A Small Good Idea", "conflict"]);
  const winner = results.find(r => r.kind === "picked")!; expect(await next(s, handle(winner))).toMatchObject({ kind: "exhausted", refreshed: false });
  // A refreshed result keeps its notice on an idempotent replay (Demo.Owner is the selected viewer and changes own progress).
  const owner = await pick(s, input(O, "90")); expect(label(owner)).toBe("Together Tonight");
  ok(await done(s.progress.saveTimestamp("joint-movie", "1:00", await claim(s, "joint-movie"), await ctx(s))));
  const r = intent(), refreshed = await next(s, handle(owner), r), replay = await next(s, handle(owner), r);
  expect(refreshed).toMatchObject({ kind: "picked", refreshed: true }); expect(label(refreshed)).toBe("Together Tonight"); expect(replay).toEqual(refreshed);
  expect(label(await next(s, handle(refreshed)))).toBe("Paper Stars E1");
});

it("no advance on failure: Unavailable, cancel and stale consume nothing and the same-intent retry skips no candidate", async () => {
  const s = createMockService(); await login(s);
  const start = await pick(s, input(V, "90")), retryId = intent();
  const unavailable = await done(s.picker.next(handle(start), retryId, await ctx(s), { scenario: "unavailable" }), 300); expect(unavailable.kind === "failure" && unavailable.error.code).toBe("demo_unavailable");
  const controller = new AbortController(), slow = s.picker.next(handle(start), retryId, await ctx(s), { scenario: "slow", signal: controller.signal });
  await vi.advanceTimersByTimeAsync(600); controller.abort(); expect((await slow).kind).toBe("cancelled");
  const retried = await next(s, handle(start), retryId); expect(label(retried)).toBe("Short Laughs S1E2");
  const expected = await ctx(s), held = s.picker.next(handle(retried), intent(), expected, { scenario: "slow" });
  await vi.advanceTimersByTimeAsync(100); const reset = s.context.reset(expected); await vi.advanceTimersByTimeAsync(80); ok(await reset);
  await vi.advanceTimersByTimeAsync(1200); expect((await held).kind).toBe("stale");
  await login(s); expect((await next(s, handle(retried))).kind).toBe("conflict");
});

it("D22 resets: list, contribution, metadata, save/contributor/refresh/expiry and selected-progress changes refresh; feedback, unselected progress, Mine, details, viewer order and profile do not", async () => {
  let clock = Date.parse("2026-10-19T12:00:00.000Z"); const s = createMockService({ now: () => clock }); await login(s);
  const fresh = async () => pick(s, input(V, "90"));
  const expectRefresh = async (what: string, mutate: () => Promise<unknown>) => { const c = await fresh(); await mutate(); const r = await next(s, handle(c)); expect(r.refreshed, `refresh after ${what}`).toBe(true); expect(label(r), what).toBe("Together Tonight"); };
  const expectSame = async (what: string, mutate: () => Promise<unknown>) => { const c = await fresh(), peek = label(await next(s, handle(await fresh()))); await mutate(); const r = await next(s, handle(c)); expect(r.refreshed, `no refresh after ${what}`).toBe(false); expect(label(r), what).toBe(peek); };
  const video = async () => ok(await done(s.library.detail("saved-video", await ctx(s)))).value;
  // As Demo.Owner (not selected): #57 archive by removing the only contribution, then restore.
  await expectRefresh("archive", async () => { const v = await video(); ok(await done(s.library.removeOwn("saved-video", v.revision, await ctx(s)))); });
  await expectRefresh("restore", async () => { const v = await video(); ok(await done(s.library.restore("saved-video", v.revision, await ctx(s)))); });
  // #57 duration, mood, link and (confirmed) title edits.
  for (const change of [{ minutes: "14" }, { moods: ["funny", "dark"] }, { watchUrl: "https://example.test/watch/edited" }] as Partial<LibraryDraft>[]) await expectRefresh(`edit ${Object.keys(change)}`, async () => { const v = await video(); ok(await done(s.library.save("saved-video", v.revision, { ...titleDraft(v), ...change }, undefined, await ctx(s)))); });
  await expectRefresh("title edit", async () => { const v = await video(), draft = { ...titleDraft(v), title: "A Smaller Good Idea" }; const c = ok(await done(s.library.save("saved-video", v.revision, draft, undefined, await ctx(s)))).value; expect(c.status).toBe("confirmation"); ok(await done(s.library.save("saved-video", v.revision, draft, c.status === "confirmation" ? c.handle : undefined, await ctx(s)))); });
  // #58 new save.
  await expectRefresh("new save", () => save(s, { title: "Another save", minutes: "200", seconds: "0" }));
  // Never refresh: the unselected member's progress, ratings, notes and reads.
  await expectSame("unselected episode", async () => ok(await done(s.progress.saveEpisode("saved-series", { position: "in_progress", season: "4", episode: "4" }, await claim(s, "saved-series"), await ctx(s)))));
  await expectSame("unselected completion", async () => ok(await done(s.progress.setCompleted("joint-movie", true, await claim(s, "joint-movie"), await ctx(s)))));
  await expectSame("owner rating", async () => ok(await done(s.feedback.saveRating("joint-movie", "2", await claim(s, "joint-movie"), await ctx(s)))));
  await login(s, "Demo.Viewer");
  // #58 duplicate save that adds Demo.Viewer as contributor, then a refresh of the provider-backed expired video.
  await expectRefresh("added contributor", async () => { const draft = titleDraft(await video()); const c = ok(await done(s.entry.save(draft, false, undefined, undefined, await ctx(s)))).value; expect(c.status).toBe("confirmation"); ok(await done(s.entry.save(draft, false, undefined, c.status === "confirmation" ? c.handle : undefined, await ctx(s)))); });
  // The seeded expired-video has a non-refreshable synthetic provider ID (its refresh fails safely and changes nothing), so a provider-saved title is refreshed instead.
  const failedRefresh = await done(s.entry.refresh("expired-video", await ctx(s))); expect(failedRefresh.kind).toBe("failure");
  const review = ok(await done(s.entry.search("youtube", "link", "SYNTHVID005", await ctx(s)))).value; if (!("draft" in review)) throw Error("Expected a review");
  ok(await done(s.entry.adopt(review.handle, await ctx(s))));
  const provider = ok(await done(s.entry.save({ ...review.draft, moods: ["funny"] }, false, review.handle, undefined, await ctx(s)))).value; if (provider.status !== "saved") throw Error("Expected a provider save");
  await expectRefresh("provider refresh", async () => ok(await done(s.entry.refresh(provider.title.id, await ctx(s)))));
  // #59 selected viewer's episode, timestamp (absent and recorded zero are distinct) and completion.
  await expectRefresh("selected episode", async () => ok(await done(s.progress.saveEpisode("saved-series", { position: "in_progress", season: "1", episode: "3" }, await claim(s, "saved-series"), await ctx(s)))));
  for (const stamp of ["1:00", "", "0:00"]) await expectRefresh(`selected timestamp ${stamp || "cleared"}`, async () => ok(await done(s.progress.saveTimestamp("saved-video", stamp, await claim(s, "saved-video"), await ctx(s)))));
  await expectRefresh("selected completion", async () => ok(await done(s.progress.setCompleted("saved-video", true, await claim(s, "saved-video"), await ctx(s)))));
  ok(await done(s.progress.setCompleted("saved-video", false, await claim(s, "saved-video"), await ctx(s))));
  // Never refresh: the selected viewer's own ratings and notes, Mine/detail/input reads.
  await expectSame("rating", async () => ok(await done(s.feedback.saveRating("joint-movie", "2", await claim(s, "joint-movie"), await ctx(s)))));
  await expectSame("note", async () => ok(await done(s.feedback.saveNote("joint-movie", "changed note", await claim(s, "joint-movie"), await ctx(s)))));
  await expectSame("clears", async () => { ok(await done(s.feedback.clearRating("saved-series", await claim(s, "saved-series"), await ctx(s)))); ok(await done(s.feedback.clearNote("saved-series", await claim(s, "saved-series"), await ctx(s)))); });
  await expectSame("reads", async () => { ok(await done(s.library.list("mine", false, await ctx(s)))); ok(await done(s.library.detail("joint-movie", await ctx(s)))); ok(await done(s.picker.getInputs(await ctx(s)))); });
  // Canonical viewer order: reordered selections are the same context and the same sequence; display keeps the selected order.
  const ordered = (await walk(s, input(["friday-owner", "friday-viewer"], "90"))).map(label), reversed = await walk(s, input(["friday-viewer", "friday-owner"], "90"));
  expect(reversed.map(label)).toEqual(ordered); expect(reversed[0].kind === "picked" && reversed[0].candidate.viewers.map(v => v.id)).toEqual(["friday-viewer", "friday-owner"]);
  expect(label(await restart(s, input(["friday-owner", "friday-viewer"], "90"), handle(reversed.at(-1)!)))).toBe(ordered[0]);
  // #58 expiry of provider fields during a live cycle (injected clock just before the 30-day deadline) refreshes to the honest no-match.
  const expiring = createMockService({ now: () => clock }); clock += 30 * 86400000 - 10 * 60000; await login(expiring);
  const live = ok(await done(expiring.picker.pick(input(V, "90"), intent(), await ctx(expiring)))).value; expect(label(live)).toBe("Together Tonight");
  clock += 10 * 60000; const expired = ok(await done(expiring.picker.next(handle(live), intent(), await ctx(expiring)))).value;
  expect(expired).toMatchObject({ kind: "no_match", refreshed: true }); expect(reasons(expired)).toEqual(["metadata_incomplete"]);
});

it("no writes: picks, advances, restarts, conflicts and failures leave rows, personal records, contributions, revisions and Mine deep-equal", async () => {
  const s = createMockService(); await login(s); const before = await libraryState(s);
  const one = await walk(s, input(OV, "90", "funny", true)); await restart(s, input(OV, "90", "funny", true), handle(one.at(-1)!));
  await walk(s, input(V, "90", "relaxing")); await pick(s, input(O, "5")); await done(s.picker.pick(input([], "x"), intent(), await ctx(s)));
  await next(s, { cycleId: "cycle-1", step: "tampered" }); await done(s.picker.next(handle(one[0]), intent(), await ctx(s), { scenario: "unavailable" }), 300);
  expect(await libraryState(s)).toBe(before);
});

it("context changes: account, group, mode, profile and Reset make held picker calls stale; the legacy profile never stands in for selected viewers", async () => {
  const s = createMockService(); await login(s);
  const hold = async (change: () => Promise<unknown>) => { const held = s.picker.pick(input(V, "90"), intent(), await ctx(s), { scenario: "slow" }); await vi.advanceTimersByTimeAsync(100); await change(); await vi.advanceTimersByTimeAsync(1300); return (await held).kind; };
  expect(await hold(async () => ok(await done(s.accounts.signIn({ username: "Demo.Viewer", password: "synthetic password" }, await ctx(s)))))).toBe("stale");
  await login(s, "Demo.Viewer");
  expect(await hold(async () => ok(await done(s.groups.select("weekend", await ctx(s)))))).toBe("stale");
  expect(await hold(async () => ok(await done(s.groups.mode("legacy", await ctx(s)))))).toBe("stale");
  ok(await done(s.groups.resolve("SYNTHETIC-LEGACY-INITIAL", await ctx(s))));
  const legacyPick = async () => { const r = await pick(s, input(["legacy-sample-profile"], "25")); return r.kind === "picked" ? r.candidate : null; };
  const withoutProfile = await legacyPick();
  const profileHeld = s.picker.getInputs(await ctx(s), { scenario: "slow" }); await vi.advanceTimersByTimeAsync(100);
  ok(await done(s.groups.selectProfile("legacy-sample-profile", await ctx(s)))); await vi.advanceTimersByTimeAsync(1300); expect((await profileHeld).kind).toBe("stale");
  expect(await legacyPick()).toEqual(withoutProfile);
  expect(await hold(async () => ok(await done(s.context.reset(await ctx(s)))))).toBe("stale");
});
