// @vitest-environment node
/*
 * #61 connected integration over ONE mounted mock service instance: the 12-step journey from
 * _docs/mock-integration.md, stable IDs across every domain, cross-domain stale/cancel no-writes,
 * the per-method Slow+abort / Unavailable / stale sweep, internal M06 expiry in the gate, and Reset.
 * Synthetic state only: no storage, network, database, provider or credential is touched.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMockService, pendingDomains } from "../../frontend/mock/service";
import { blankEntry } from "../../frontend/mock/metadata-fixtures";
import type { ContextIdentity, EntryPage, EntryReview, FrontendService, LibraryDraft, LibraryTitle, PersonalClaim, PickerCycleHandle, PickerInput, PickerOutcome, RequestOptions, ServiceResult } from "../../frontend/service/contracts";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.parse("2026-10-19T12:00:00.000Z")); });
afterEach(() => vi.useRealTimers());

async function done<T>(p: Promise<T>, ms = 80) { await vi.advanceTimersByTimeAsync(ms); return p; }
function ok<T>(r: ServiceResult<T>) { if (r.kind !== "success") throw Error(`Expected success, got ${r.kind}: ${r.kind === "failure" ? r.error.message : r.message}`); return r; }
async function ctx(s: FrontendService) { return ok(await done(s.context.read())).context; }
async function signIn(s: FrontendService, username: string) { return ok(await done(s.accounts.signIn({ username, password: "synthetic password" }, await ctx(s)))).context; }
async function select(s: FrontendService, group = "friday") { return ok(await done(s.groups.select(group, await ctx(s)))).value; }
async function as(s: FrontendService, username: string, group = "friday") { await signIn(s, username); return select(s, group); }
const ids = (items: readonly LibraryTitle[]) => items.map(t => t.id);
async function list(s: FrontendService, filter: "all" | "mine" = "all", archived = false) { return ok(await done(s.library.list(filter, archived, await ctx(s)))).value; }
async function detail(s: FrontendService, id: string) { return ok(await done(s.library.detail(id, await ctx(s)))).value; }
async function claim(s: FrontendService, id: string): Promise<PersonalClaim> { const t = await detail(s, id); return { memberId: t.personal.own!.memberId, numberingStyle: t.numberingStyle }; }
const record = (t: LibraryTitle, memberId: string) => t.history.find(h => h.memberId === memberId) ?? null;
let intents = 0; const intent = () => `integration-intent-${++intents}`;
const input = (viewerIds: string[], availableMinutes: string, mood = "funny"): PickerInput => ({ viewerIds, availableMinutes, mood, rewatches: false });
async function pick(s: FrontendService, i: PickerInput) { return ok(await done(s.picker.pick(i, intent(), await ctx(s)))).value; }
async function next(s: FrontendService, c: PickerCycleHandle) { return ok(await done(s.picker.next(c, intent(), await ctx(s)))).value; }
const picked = (o: PickerOutcome) => { if (o.kind !== "picked") throw Error(`Expected picked, got ${o.kind}`); return o; };
const manualDraft = (title: string, minutes = "15"): LibraryDraft => ({ ...blankEntry(), title, contentType: "movie", minutes, seconds: "0", moods: ["funny"] });
async function providerSave(s: FrontendService, mood = "relaxing") {
  const page = ok(await done(s.entry.search("youtube", "title", "journey lessons", await ctx(s)))).value as EntryPage;
  const review = ok(await done(s.entry.select(page.handle, page.candidates[0].id, await ctx(s)))).value;
  ok(await done(s.entry.adopt(review.handle, await ctx(s))));
  return ok(await done(s.entry.save({ ...review.draft, moods: [mood] }, false, review.handle, undefined, await ctx(s)))).value;
}
/** Observable domain state of the current context: account, groups/memberships, active/archived/Mine lists and every detail (contributors + personal history). */
async function snapshot(s: FrontendService) {
  const account = ok(await done(s.accounts.read())).value.account, workspace = ok(await done(s.groups.read())).value;
  if (!workspace.selected) return JSON.stringify({ account, workspace });
  const c = await ctx(s), all = ok(await done(s.library.list("all", false, c))).value, archive = ok(await done(s.library.list("all", true, c))).value, mine = ok(await done(s.library.list("mine", false, c))).value;
  const details = []; for (const t of [...all.items, ...archive.items]) details.push(ok(await done(s.library.detail(t.id, c))).value);
  return JSON.stringify({ account, workspace, all, archive, mine, details });
}
/** Fresh-instance library state for every seeded group, independent of the instance name. */
async function seededState(s: FrontendService) {
  const out: string[] = [];
  for (const [user, group] of [["Demo.Owner", "friday"], ["Demo.Viewer", "weekend"]] as const) { await as(s, user, group); out.push(JSON.stringify([await list(s), await list(s, "all", true)])); }
  ok(await done(s.accounts.signOut(await ctx(s))));
  return out;
}

it("connected journey: accounts, groups, library, manual X, provider Y by two adders, personal, picker, archive/restore, removal/rejoin, legacy, stale/cancel and Reset on one instance", async () => {
  expect(pendingDomains).toEqual([]);
  const s = createMockService();

  // 1. Accounts
  const code = ok(await done(s.accounts.register({ username: "Journey.User", password: "synthetic journey password", confirmation: "synthetic journey password" }, await ctx(s)))).value;
  expect(code).toMatchObject({ next: "account" });
  expect(ok(await done(s.accounts.read())).value.account).toMatchObject({ username: "Journey.User", seeded: false });
  ok(await done(s.accounts.signOut(await ctx(s)))); expect(ok(await done(s.accounts.read())).value.account).toBeNull();
  await signIn(s, "Demo.Owner"); expect(ok(await done(s.accounts.read())).value.account?.username).toBe("Demo.Owner");

  // 2. Groups: select Friday, create a group (creation selects it, empty library), then select Friday again
  expect((await select(s)).selected?.name).toBe("Synthetic Friday friends");
  const created = ok(await done(s.groups.create("Journey group", await ctx(s)))).value; expect(created.kind).toBe("account");
  const createdWorkspace = ok(await done(s.groups.read())).value;
  expect(createdWorkspace.selected).toMatchObject({ id: "created-group-1", name: "Journey group" }); expect(createdWorkspace.members.map(m => m.name)).toEqual(["Demo.Owner"]);
  expect((await list(s)).items).toEqual([]); expect((await list(s, "all", true)).items).toEqual([]);
  expect((await select(s)).selected?.id).toBe("friday");

  // 3. Library: the seeded IDs
  const seeds = ["joint-movie", "saved-series", "saved-anime", "saved-video"];
  expect(ids((await list(s)).items)).toEqual([...seeds, "expired-video"]); expect(ids((await list(s, "mine")).items)).toEqual(["joint-movie", "saved-video"]);

  // 4. Manual X (Funny movie, exactly 15:00) as Demo.Owner
  const savedX = ok(await done(s.entry.save(manualDraft("Journey Laugh"), false, undefined, undefined, await ctx(s)))).value;
  if (savedX.status !== "saved") throw Error("manual save needs no confirmation"); const X = savedX.title.id;
  expect(savedX.title).toMatchObject({ durationSeconds: 900, contentType: "movie", moods: ["funny"] });
  expect(ids((await list(s)).items)).toContain(X); expect(ids((await list(s, "mine")).items)).toContain(X); expect((await detail(s, X)).id).toBe(X);

  // 5. Provider Y, then the same provider work saved by a second account: same ID, two adders, unchanged metadata/history
  const savedY = await providerSave(s); if (savedY.status !== "saved") throw Error("first provider save"); const Y = savedY.title.id;
  expect(savedY.title.providerId).toBe("youtube:SYNTHVID001"); expect(Y).not.toBe(X);
  await as(s, "Demo.Viewer");
  const before = await detail(s, Y), again = await providerSave(s, "funny");
  if (again.status !== "saved") throw Error("same provider work converges without confirmation");
  expect(again.title.id).toBe(Y); expect(again.title.contributors.map(m => m.name)).toEqual(["Demo.Owner", "Demo.Viewer"]);
  const metadata = (t: LibraryTitle) => [t.title, t.contentType, t.durationSeconds, t.genres, t.moods, t.watchUrl, t.sourceUrl, t.coverUrl, t.origins, t.providerId];
  expect(metadata(again.title)).toEqual(metadata(before)); expect(again.title.history).toEqual(before.history);

  // 6. Personal as Demo.Viewer on Y
  const viewerY = await claim(s, Y);
  ok(await done(s.progress.saveTimestamp(Y, "3:00", viewerY, await ctx(s))));
  ok(await done(s.feedback.saveRating(Y, "7", viewerY, await ctx(s))));
  ok(await done(s.feedback.saveNote(Y, "Journey note", viewerY, await ctx(s))));
  const yRecord = record(await detail(s, Y), "friday-viewer");
  expect(yRecord).toEqual({ id: `personal-${Y}-friday-viewer`, memberId: "friday-viewer", progress: { kind: "watch", timestampSeconds: 180, completed: false }, rating: 7, note: "Journey note" });
  expect((await detail(s, Y)).personal.history.find(e => e.member.id === "friday-viewer")?.member.name).toBe("Demo.Viewer");

  // 7. Picker: A Small Good Idea, then X (equal 900 s, older createdAt first); rating on X never refreshes; a selected timestamp change does
  expect(ok(await done(s.picker.getInputs(await ctx(s)))).value.viewers.map(v => v.id)).toEqual(["friday-owner", "friday-viewer"]);
  const first = picked(await pick(s, input(["friday-viewer"], "15")));
  expect(first.candidate).toMatchObject({ id: "saved-video", title: "A Small Good Idea", tier: "exact" });
  ok(await done(s.feedback.saveRating(X, "6", await claim(s, X), await ctx(s))));
  const second = picked(await next(s, first.cycle)); expect(second.candidate.id).toBe(X); expect(second.refreshed).toBe(false);
  expect((await detail(s, second.candidate.id)).id).toBe(X); // the picker's View details target
  ok(await done(s.progress.saveTimestamp("saved-video", "1:00", await claim(s, "saved-video"), await ctx(s))));
  const refreshed = picked(await next(s, second.cycle)); expect(refreshed.refreshed).toBe(true); expect(refreshed.candidate.id).toBe("saved-video");

  // 8. Mine and archive as Demo.Owner
  await as(s, "Demo.Owner");
  ok(await done(s.feedback.saveRating(X, "9", await claim(s, X), await ctx(s))));
  const ownerX = record(await detail(s, X), "friday-owner"); expect(ownerX).toMatchObject({ id: `personal-${X}-friday-owner`, rating: 9 });
  const archived = ok(await done(s.library.removeOwn(X, (await detail(s, X)).revision, await ctx(s)))).value; expect(archived).toMatchObject({ id: X, archived: true });
  expect(ids((await list(s)).items)).not.toContain(X); expect(ids((await list(s, "mine")).items)).not.toContain(X); expect(ids((await list(s, "all", true)).items)).toContain(X);
  const walk = [picked(await pick(s, input(["friday-viewer"], "15")))]; const exhausted = await next(s, walk[0].cycle);
  expect(walk[0].candidate.id).toBe("saved-video"); expect(exhausted.kind).toBe("exhausted");
  const restored = ok(await done(s.library.restore(X, archived.revision, await ctx(s)))).value;
  expect(restored).toMatchObject({ id: X, archived: false }); expect(ids((await list(s, "mine")).items)).toContain(X); expect(record(restored, "friday-owner")).toEqual(ownerX);
  expect(picked(await next(s, (exhausted as Extract<PickerOutcome, { kind: "exhausted" }>).cycle)).refreshed).toBe(true);

  // 9. Owner removal, rotation and rejoin of the SAME member; a write held across it never commits
  const viewerMember = (await select(s)).members.find(m => m.id === "friday-viewer")!;
  ok(await done(s.groups.remove("friday-viewer", viewerMember.generation, await ctx(s))));
  const rotated = ok(await done(s.groups.rotate(1, await ctx(s)))).value;
  expect(ok(await done(s.picker.getInputs(await ctx(s)))).value.viewers.map(v => v.id)).toEqual(["friday-owner"]);
  const inactiveY = await detail(s, Y);
  expect(inactiveY.contributors.find(m => m.id === "friday-viewer")).toMatchObject({ active: false, name: "Demo.Viewer" }); expect(record(inactiveY, "friday-viewer")).toEqual(yRecord);
  await signIn(s, "Demo.Viewer");
  expect(await done(s.groups.resolve("SYNTHETIC-FRIDAY-INITIAL", await ctx(s)))).toMatchObject({ kind: "failure", error: { code: "invite_invalid" } });
  expect(ok(await done(s.groups.read())).value.pending).toBeNull();
  expect(ok(await done(s.groups.resolve(rotated.invite, await ctx(s)))).value.pending).toMatchObject({ groupName: "Synthetic Friday friends" });
  const rejoined = ok(await done(s.groups.join(await ctx(s)))).value;
  expect(rejoined.members.find(m => m.id === "friday-viewer")).toMatchObject({ active: true, you: true });
  expect(record(await detail(s, Y), "friday-viewer")).toEqual(yRecord);
  expect(ok(await done(s.picker.getInputs(await ctx(s)))).value.viewers.map(v => v.id)).toEqual(["friday-owner", "friday-viewer"]);

  // 10. Legacy: readable library and a pick without a selected profile; no account record appears
  ok(await done(s.groups.mode("legacy", await ctx(s))));
  const legacy = ok(await done(s.groups.resolve("SYNTHETIC-LEGACY-INITIAL", await ctx(s)))).value; expect(legacy).toMatchObject({ mode: "legacy", profileId: null });
  const legacyList = await list(s); expect(legacyList.mode).toBe("legacy"); expect(ids(legacyList.items)).toEqual(["legacy-movie"]);
  const legacyPick = picked(await pick(s, input(["legacy-sample-profile"], "25"))); expect(legacyPick.candidate.title).toBe("Legacy sample film");

  // 11-12 are covered by the dedicated stale/cancel and Reset tests below; the journey ends with Reset
  const beforeReset = await ctx(s);
  ok(await done(s.context.reset(beforeReset)));
  expect((await done(s.library.list("all", false, beforeReset))).kind).toBe("stale");
  expect((await done(s.accounts.signIn({ username: "Journey.User", password: "synthetic journey password" }, await ctx(s)))).kind).toBe("failure");
  await as(s, "Demo.Owner"); const after = ids((await list(s)).items); expect(after).toEqual([...seeds, "expired-video"]); expect(after).not.toContain(X); expect(after).not.toContain(Y);
  expect(ok(await done(s.groups.read())).value.memberships.map(g => g.id)).toEqual(["friday"]);
});

it("stale and cancel across domains write nothing: manual save cancel, pick across group switch, personal save across Reset, held write across removal and rejoin, Unavailable then retry", async () => {
  const s = createMockService();
  await as(s, "Demo.Viewer");
  // Slow then Cancel on a manual save
  let state = await snapshot(s); const controller = new AbortController();
  const save = s.entry.save(manualDraft("Cancelled Laugh"), false, undefined, undefined, await ctx(s), { scenario: "slow", signal: controller.signal });
  await vi.advanceTimersByTimeAsync(400); controller.abort();
  expect((await save).kind).toBe("cancelled"); expect(await snapshot(s)).toBe(state);
  // Slow pick, then a group switch commits while it is pending: the late result is stale
  const heldPick = s.picker.pick(input(["friday-viewer"], "90"), intent(), await ctx(s), { scenario: "slow" });
  await vi.advanceTimersByTimeAsync(10); const switched = s.groups.select("weekend", await ctx(s)); await vi.advanceTimersByTimeAsync(1300);
  expect(ok(await switched).value.selected?.id).toBe("weekend"); expect((await heldPick).kind).toBe("stale");
  await select(s); expect(await snapshot(s)).toBe(state);
  // A Slow write held across member removal and rejoin cannot commit after the rejoin
  const viewerClaim = await claim(s, "joint-movie"), heldFrom = await ctx(s);
  const titles = async () => { const c = await ctx(s); const out = []; for (const t of ok(await done(s.library.list("all", false, c))).value.items) out.push([t.id, t.revision, ok(await done(s.library.detail(t.id, c))).value.history]); return JSON.stringify(out); };
  const beforeHold = await titles();
  const held = s.feedback.saveNote("joint-movie", "late note", viewerClaim, heldFrom, { scenario: "slow" });
  await vi.advanceTimersByTimeAsync(5);
  const step = async <T>(p: Promise<ServiceResult<T>>) => { await vi.advanceTimersByTimeAsync(80); return ok(await p); };
  let c = (await step(s.accounts.signIn({ username: "Demo.Owner", password: "synthetic password" }, heldFrom))).context;
  c = (await step(s.groups.select("friday", c))).context;
  c = (await step(s.groups.remove("friday-viewer", 1, c))).context;
  const rotated = await step(s.groups.rotate(1, c)); c = rotated.context;
  c = (await step(s.accounts.signIn({ username: "Demo.Viewer", password: "synthetic password" }, c))).context;
  c = (await step(s.groups.resolve(rotated.value.invite, c))).context;
  const rejoined = await step(s.groups.join(c));
  expect(rejoined.value.members.find(m => m.id === "friday-viewer")).toMatchObject({ active: true, you: true });
  await vi.advanceTimersByTimeAsync(1200); expect((await held).kind).toBe("stale");
  expect(await titles()).toBe(beforeHold); expect(record(await detail(s, "joint-movie"), "friday-viewer")?.note).not.toBe("late note");
  // Unavailable then retry on a library read
  const unavailable = await done(s.library.list("all", false, await ctx(s), { scenario: "unavailable" }), 300);
  expect(unavailable).toMatchObject({ kind: "failure", error: { code: "demo_unavailable", retryable: true } });
  expect(ok(await done(s.library.list("all", false, await ctx(s)))).value.items.length).toBeGreaterThan(0);
  // A Slow personal save, then Reset: the save is stale and the reseeded state equals a fresh instance
  const resetClaim = await claim(s, "joint-movie"), heldRating = s.feedback.saveRating("joint-movie", "2", resetClaim, await ctx(s), { scenario: "slow" });
  await vi.advanceTimersByTimeAsync(10); const reset = s.context.reset(await ctx(s)); await vi.advanceTimersByTimeAsync(80); ok(await reset);
  await vi.advanceTimersByTimeAsync(1200); expect((await heldRating).kind).toBe("stale");
  expect(await seededState(s)).toEqual(await seededState(createMockService()));
});

it("Reset removes journey records and restores seeds with original IDs, clears picker cycles and stales captured identities", async () => {
  const s = createMockService(), fresh = await seededState(createMockService());
  ok(await done(s.accounts.register({ username: "Reset.User", password: "synthetic reset password", confirmation: "synthetic reset password" }, await ctx(s))));
  await as(s, "Demo.Owner");
  ok(await done(s.groups.create("Reset group", await ctx(s)))); await select(s);
  const x = ok(await done(s.entry.save(manualDraft("Reset Laugh"), false, undefined, undefined, await ctx(s)))).value, y = await providerSave(s);
  if (x.status !== "saved" || y.status !== "saved") throw Error("saves");
  ok(await done(s.feedback.saveRating("joint-movie", "1", await claim(s, "joint-movie"), await ctx(s))));
  const cycle = picked(await pick(s, input(["friday-viewer"], "90"))).cycle, captured = await ctx(s);
  ok(await done(s.context.reset(captured)));
  for (const call of [s.library.list("all", false, captured), s.groups.select("friday", captured), s.picker.next(cycle, intent(), captured), s.feedback.saveRating("joint-movie", "3", { memberId: "friday-owner", numberingStyle: "none" }, captured)]) expect((await done(call as Promise<ServiceResult<unknown>>)).kind).toBe("stale");
  expect((await done(s.accounts.signIn({ username: "Reset.User", password: "synthetic reset password" }, await ctx(s)))).kind).toBe("failure");
  await as(s, "Demo.Owner");
  const all = ids((await list(s)).items); expect(all).not.toContain(x.title.id); expect(all).not.toContain(y.title.id);
  expect(ok(await done(s.groups.read())).value.memberships.map(g => g.name)).toEqual(["Synthetic Friday friends"]);
  expect(record(await detail(s, "joint-movie"), "friday-owner")).toMatchObject({ id: "history-friday-owner", rating: 8 });
  expect(await next(s, cycle)).toMatchObject({ kind: "conflict" }); // the old cycle is gone
  ok(await done(s.accounts.signOut(await ctx(s))));
  expect(await seededState(s)).toEqual(fresh);
  // The new account name is free again after Reset
  ok(await done(s.accounts.register({ username: "Reset.User", password: "synthetic reset password", confirmation: "synthetic reset password" }, await ctx(s))));
});

it("M06 internal expiry runs inside the service gate: a read pending across a deadline returns the cleared projection; cancel and Unavailable return no data and authored fields and history remain", async () => {
  let now = Date.parse("2026-10-19T12:00:00.000Z"); const s = createMockService({ now: () => now });
  await as(s, "Demo.Owner");
  expect((await detail(s, "joint-movie")).durationSeconds).toBe(5400);
  const pending = s.library.detail("joint-movie", await ctx(s), { scenario: "slow" });
  await vi.advanceTimersByTimeAsync(100); now += 31 * 86_400_000; await vi.advanceTimersByTimeAsync(1100);
  const cleared = ok(await pending).value;
  expect(cleared).toMatchObject({ durationSeconds: null, origins: { durationSeconds: "unavailable", title: "authored" }, title: "Together Tonight" });
  expect(record(cleared, "friday-owner")?.id).toBe("history-friday-owner");
  const controller = new AbortController(), cancelled = s.library.detail("joint-movie", await ctx(s), { scenario: "slow", signal: controller.signal });
  await vi.advanceTimersByTimeAsync(100); controller.abort(); expect((await cancelled).kind).toBe("cancelled");
  expect((await done(s.library.detail("joint-movie", await ctx(s), { scenario: "unavailable" }), 300)).kind).toBe("failure");
  expect(await detail(s, "joint-movie")).toEqual(cleared);
});

// ---- Operation sweep: every typed domain method, Slow+abort -> cancelled, Unavailable -> retryable failure, old identity -> stale; no write ----
type Call = (expected: ContextIdentity, options: RequestOptions) => Promise<ServiceResult<unknown>>;
/** Re-enters the current group (account select or legacy resolve): a real context change that keeps the observable state. */
function bump(s: FrontendService, expected: ContextIdentity, mode: "account" | "legacy", group: string) {
  return mode === "legacy" ? s.groups.resolve("SYNTHETIC-LEGACY-INITIAL", expected) : s.groups.select(group, expected);
}
async function sweep(s: FrontendService, name: string, call: Call, reads = false) {
  const state = await snapshot(s);
  const controller = new AbortController(), slow = call(await ctx(s), { scenario: "slow", signal: controller.signal });
  await vi.advanceTimersByTimeAsync(300); controller.abort();
  expect((await slow).kind, `${name} Slow+abort`).toBe("cancelled");
  const unavailable = await done(call(await ctx(s), { scenario: "unavailable" }), 300);
  expect(unavailable, `${name} Unavailable`).toMatchObject({ kind: "failure", error: { code: "demo_unavailable", retryable: true } });
  const w = ok(await done(s.groups.read())).value, mode = w.mode, group = w.selected!.id;
  if (reads) {
    // Reads take no identity: a context change that commits while the read is pending makes it stale.
    const held = call(await ctx(s), { scenario: "slow" }); await vi.advanceTimersByTimeAsync(10);
    const change = bump(s, await ctx(s), mode, group); await vi.advanceTimersByTimeAsync(1300);
    ok(await change); expect((await held).kind, `${name} stale`).toBe("stale");
  } else {
    const old = await ctx(s); ok(await done(bump(s, old, mode, group)));
    expect((await done(call(old, {}))).kind, `${name} stale`).toBe("stale");
  }
  expect(await snapshot(s), `${name} wrote nothing`).toBe(state);
}
async function sweepSetup() {
  const s = createMockService(); await as(s, "Demo.Owner");
  const y = await providerSave(s); if (y.status !== "saved") throw Error("provider save");
  const page = ok(await done(s.entry.search("youtube", "title", "sweep lessons", await ctx(s)))).value as EntryPage;
  const review = ok(await done(s.entry.select(page.handle, page.candidates[1].id, await ctx(s)))).value as EntryReview;
  return { s, y: y.title, page, review };
}

it("operation sweep (accounts): read, register, signIn, signOut and recover cancel, fail retryably and go stale without writing", async () => {
  const { s } = await sweepSetup(), creds = { username: "Sweep.User", password: "synthetic sweep password", confirmation: "synthetic sweep password", proof: "SYNTHETIC-OWNER-PROOF" };
  await sweep(s, "accounts.read", (_, o) => s.accounts.read(o), true);
  await sweep(s, "accounts.register", (e, o) => s.accounts.register(creds, e, o));
  await sweep(s, "accounts.signIn", (e, o) => s.accounts.signIn({ username: "Demo.Viewer", password: "synthetic password" }, e, o));
  await sweep(s, "accounts.signOut", (e, o) => s.accounts.signOut(e, o));
  await sweep(s, "accounts.recover", (e, o) => s.accounts.recover({ ...creds, username: "Demo.Owner" }, e, o));
  expect((await done(s.accounts.signIn({ username: "Sweep.User", password: creds.password }, await ctx(s)))).kind).toBe("failure");
  expect(ok(await done(s.accounts.signIn({ username: "Demo.Owner", password: "synthetic password" }, await ctx(s))))).toBeTruthy();
});

it("operation sweep (groups and legacy): read, create, select, resolve, join, mode, remove, rotate, createLegacy, createProfile and selectProfile cancel, fail retryably and go stale without writing", async () => {
  const { s } = await sweepSetup();
  await sweep(s, "groups.read", (_, o) => s.groups.read(o), true);
  await sweep(s, "groups.create", (e, o) => s.groups.create("Sweep group", e, o));
  await sweep(s, "groups.select", (e, o) => s.groups.select("friday", e, o));
  await sweep(s, "groups.resolve", (e, o) => s.groups.resolve("SYNTHETIC-WEEKEND-INITIAL", e, o));
  await sweep(s, "groups.join", (e, o) => s.groups.join(e, o));
  await sweep(s, "groups.mode", (e, o) => s.groups.mode("legacy", e, o));
  await sweep(s, "groups.remove", (e, o) => s.groups.remove("friday-viewer", 1, e, o));
  await sweep(s, "groups.rotate", (e, o) => s.groups.rotate(1, e, o));
  await sweep(s, "groups.createLegacy", (e, o) => s.groups.createLegacy("Sweep legacy", e, o));
  ok(await done(s.groups.mode("legacy", await ctx(s)))); ok(await done(s.groups.resolve("SYNTHETIC-LEGACY-INITIAL", await ctx(s))));
  await sweep(s, "groups.createProfile", (e, o) => s.groups.createProfile("Sweep profile", "rose", e, o));
  await sweep(s, "groups.selectProfile", (e, o) => s.groups.selectProfile("legacy-sample-profile", e, o));
  expect(ok(await done(s.groups.read())).value).toMatchObject({ profileId: null, members: [{ id: "legacy-sample-profile" }] });
});

it("operation sweep (library): list, detail, editDraft, save, removeOwn and restore cancel, fail retryably and go stale without writing", async () => {
  const { s, y } = await sweepSetup(), joint = await detail(s, "joint-movie");
  await sweep(s, "library.list", (e, o) => s.library.list("mine", false, e, o));
  await sweep(s, "library.list archived", (e, o) => s.library.list("all", true, e, o));
  await sweep(s, "library.detail", (e, o) => s.library.detail(y.id, e, o));
  await sweep(s, "library.editDraft", (e, o) => s.library.editDraft("joint-movie", e, o));
  await sweep(s, "library.save", (e, o) => s.library.save("joint-movie", joint.revision, { ...manualDraft("Together Tonight", "91") }, undefined, e, o));
  await sweep(s, "library.removeOwn", (e, o) => s.library.removeOwn("joint-movie", joint.revision, e, o));
  const archived = await detail(s, "archived-movie");
  await sweep(s, "library.restore", (e, o) => s.library.restore("archived-movie", archived.revision, e, o));
});

it("operation sweep (entry and metadata): search, page, select, adopt, save and refresh cancel, fail retryably and go stale without writing", async () => {
  const { s, y, page, review } = await sweepSetup();
  await sweep(s, "entry.search", (e, o) => s.entry.search("kinopoisk", "title", "sweep movie", e, o));
  await sweep(s, "entry.page", (e, o) => s.entry.page(page.handle, "next", e, o));
  await sweep(s, "entry.select", (e, o) => s.entry.select(page.handle, page.candidates[0].id, e, o));
  await sweep(s, "entry.adopt", (e, o) => s.entry.adopt(review.handle, e, o));
  await sweep(s, "entry.save manual", (e, o) => s.entry.save(manualDraft("Sweep Laugh"), false, undefined, undefined, e, o));
  const offered = ok(await done(s.entry.save(manualDraft("Together Tonight", "90"), false, undefined, undefined, await ctx(s)))).value;
  if (offered.status !== "confirmation") throw Error("a manual duplicate needs W05 confirmation");
  await sweep(s, "entry.save with confirmation", (e, o) => s.entry.save(manualDraft("Together Tonight", "90"), false, undefined, offered.handle, e, o));
  await sweep(s, "entry.refresh", (e, o) => s.entry.refresh(y.id, e, o));
});

it("operation sweep (personal): saveEpisode, saveTimestamp, clearTimestamp, setCompleted, saveRating, clearRating, saveNote and clearNote cancel, fail retryably and go stale without writing", async () => {
  const { s } = await sweepSetup(), series = await claim(s, "saved-series"), movie = await claim(s, "joint-movie");
  await sweep(s, "progress.saveEpisode", (e, o) => s.progress.saveEpisode("saved-series", { position: "in_progress", season: "2", episode: "3" }, series, e, o));
  await sweep(s, "progress.saveTimestamp", (e, o) => s.progress.saveTimestamp("joint-movie", "9:00", movie, e, o));
  await sweep(s, "progress.clearTimestamp", (e, o) => s.progress.clearTimestamp("joint-movie", movie, e, o));
  await sweep(s, "progress.setCompleted", (e, o) => s.progress.setCompleted("joint-movie", true, movie, e, o));
  await sweep(s, "feedback.saveRating", (e, o) => s.feedback.saveRating("joint-movie", "2", movie, e, o));
  await sweep(s, "feedback.clearRating", (e, o) => s.feedback.clearRating("joint-movie", movie, e, o));
  await sweep(s, "feedback.saveNote", (e, o) => s.feedback.saveNote("joint-movie", "sweep note", movie, e, o));
  await sweep(s, "feedback.clearNote", (e, o) => s.feedback.clearNote("joint-movie", movie, e, o));
});

it("operation sweep (picker): getInputs, pick, next and restart cancel, fail retryably and go stale without writing or advancing a cycle", async () => {
  const { s } = await sweepSetup(), viewers = input(["friday-viewer"], "90");
  const start = picked(await pick(s, viewers));
  // Slow+abort and Unavailable on next/restart never advance: the real next action gives the second candidate.
  for (const run of [(e: ContextIdentity, o: RequestOptions) => s.picker.next(start.cycle, intent(), e, o), (e: ContextIdentity, o: RequestOptions) => s.picker.restart(viewers, start.cycle, intent(), e, o)]) {
    const controller = new AbortController(), slow = run(await ctx(s), { scenario: "slow", signal: controller.signal });
    await vi.advanceTimersByTimeAsync(300); controller.abort(); expect((await slow).kind).toBe("cancelled");
    expect((await done(run(await ctx(s), { scenario: "unavailable" }), 300)).kind).toBe("failure");
  }
  const second = picked(await next(s, start.cycle)); expect(second.candidate.id).not.toBe(start.candidate.id); expect(second.refreshed).toBe(false);
  await sweep(s, "picker.getInputs", (e, o) => s.picker.getInputs(e, o));
  await sweep(s, "picker.pick", (e, o) => s.picker.pick(viewers, intent(), e, o));
  await sweep(s, "picker.next", (e, o) => s.picker.next(start.cycle, intent(), e, o));
  await sweep(s, "picker.restart", (e, o) => s.picker.restart(viewers, start.cycle, intent(), e, o));
  // The swept stale calls captured an identity before a context change, so the held cycle now conflicts;
  // a fresh cycle shows the same first candidate, proving no swept call advanced or wrote picker state.
  expect(picked(await pick(s, viewers)).candidate.id).toBe(start.candidate.id);
});
