import { sameContext } from "../service/contracts";
import type { ContextIdentity, FieldErrors, GroupWorkspace, LibraryHistory, LibraryType, PickerCandidate, PickerCycleHandle, PickerInput, PickerInputs, PickerNoMatchReason, PickerOutcome, PickerService, PickerSuggestion, PickerViewer, RequestOptions, ServiceResult } from "../service/contracts";
import type { Row } from "./library";
import { rankCandidates, type RankingInput, type RankingResult, type RankingTitle } from "../../lib/picker/ranking";
import type { EligibilityProgress } from "../../lib/picker/types";
import { fixedMoods } from "../../lib/title-state";

/*
 * Synthetic picker and Pick again cycle (#60, K01-K04). Ranking and eligibility are the unchanged
 * baseline pure functions (`rankCandidates` runs `evaluateEligibility`). The cycle protocol mirrors
 * lib/picker/cycle.ts semantics without crypto, randomness, storage or network: cycles live only in
 * this mounted service instance. Step tokens are synthetic coordination tags, never credentials.
 * Picking reads a fresh snapshot of the shared rows and never writes them.
 */
export const cycleLifetimeMs = 30 * 60 * 1000;
export const cycleCapacity = 512;
export const conflictMessage = "This picking cycle expired or changed. Start a new cycle to continue safely.";
export const noMatchLabels: Readonly<Record<PickerNoMatchReason, string>> = Object.freeze({
  no_active_titles: "There are no active saved titles to pick from.",
  progress_required: "Selected viewers need valid next-episode progress.",
  viewer_ineligible: "Completion or different next episodes prevent a shared pick with these settings.",
  metadata_incomplete: "Some saved titles need usable title, type, duration or mood details.",
  time_mood_excluded: "No viewer-eligible title meets the requested mood/time or permitted alternatives.",
});

/** Same three-line format as baseline `candidateIdentity` in lib/picker/cycle.ts (equality is tested). */
export function candidateIdentity(titleId: string, target: { readonly kind: "item" } | { readonly kind: "episode"; readonly numberingStyle: string; readonly nextSeason: number | null; readonly nextEpisode: number }) {
  return JSON.stringify(target.kind === "item" ? [titleId, "item"] : [titleId, "episode", target.numberingStyle, target.nextSeason, target.nextEpisode]);
}

/** K01 viewers: account groups list active members only; legacy groups list every profile. */
export function pickerViewers(w: GroupWorkspace): PickerViewer[] {
  return w.members.filter(m => w.mode === "legacy" || m.active).map(m => Object.freeze({ id: m.id, name: m.name, color: m.color }));
}

/**
 * One progress row per #59 record that has a progress state (explicit episode state, timestamp or completion).
 * Rating/note-only and absent records project nothing; Not started is never manufactured. Records hold no
 * numbering style, so the title's current numbering is used (the D10 guard keeps both equal).
 */
export function projectProgress(row: Pick<Row, "id" | "groupId" | "numberingStyle">, record: LibraryHistory): EligibilityProgress | null {
  const p = record.progress;
  if (!p) return null;
  const base = { titleId: row.id, memberId: record.memberId, groupId: row.groupId, numberingStyle: row.numberingStyle, completed: p.completed };
  return p.kind === "episode" ? { ...base, positionState: p.position, nextSeason: p.season, nextEpisode: p.episode } : { ...base, positionState: "unknown", nextSeason: null, nextEpisode: null };
}
/** Fresh ranking snapshot of one group: every title (archived included) and the projected progress. Timestamps, ratings and notes never reach ranking. */
export function projectSnapshot(rows: readonly Readonly<Row>[], groupId: string): { titles: RankingTitle[]; progress: EligibilityProgress[] } {
  const own = rows.filter(r => r.groupId === groupId).sort((a, b) => a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const titles = own.map((r): RankingTitle => ({ id: r.id, groupId: r.groupId, archived: r.archived, title: r.title, contentType: r.contentType, durationSeconds: r.durationSeconds, numberingStyle: r.numberingStyle, moods: [...r.moods], createdAt: r.createdAt }));
  const progress = own.flatMap(r => r.history.map(record => projectProgress(r, record)).filter((x): x is EligibilityProgress => x !== null));
  return { titles, progress };
}

type Action = "start" | "next" | "restart";
type Canonical = { viewerIds: string[]; availableMinutes: string; mood: string; rewatches: boolean };
type LastIntent = { id: string; action: Action; inputStep: string; index: number; outputStep: string; refreshed: boolean };
/** Holds no titles, names, ratings or notes; only coordination state. */
type Cycle = { id: string; context: ContextIdentity; groupId: string; input: Canonical; key: string; semantic: string; index: number; step: string; steps: number; startedAt: number; last: LastIntent; intents: Set<string> };
type Hooks = {
  access: () => GroupWorkspace | null;
  actor: (w: GroupWorkspace) => string | null;
  rows: () => readonly Readonly<Row>[];
  clock: () => number;
  safeUrl: (value: string | null) => string | null;
  identity: () => ContextIdentity;
  run: <T>(expected: ContextIdentity, options: RequestOptions | undefined, commit: () => ServiceResult<T>) => Promise<ServiceResult<T>>;
};
const validIntent = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const sorted = (values: readonly string[]) => Array.isArray(values) ? [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0) : values;
const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
const contextKey = (input: Canonical) => JSON.stringify([sorted(input.viewerIds), input.availableMinutes, input.mood, input.rewatches]);

export function createMockPicker(h: Hooks) {
  const cycles = new Map<string, Cycle>();
  let counter = 0;
  const denied = (): ServiceResult<never> => ({ kind: "failure", error: { code: "picker_access", message: "Select an accessible synthetic group before picking.", retryable: true } });
  const invalid = (fields: FieldErrors): ServiceResult<never> => ({ kind: "failure", error: { code: "picker_input", message: "Review the highlighted choices and try again.", retryable: true, fields } });
  const success = <T>(value: T): ServiceResult<T> => ({ kind: "success", value: Object.freeze(value), context: h.identity() });
  const conflict = (): ServiceResult<PickerOutcome> => success<PickerOutcome>({ kind: "conflict", refreshed: false, message: conflictMessage });
  const purge = () => { const now = h.clock(); for (const [id, cycle] of cycles) if (cycle.startedAt + cycleLifetimeMs <= now) cycles.delete(id); };

  /** Builds the fresh snapshot after the gate delay and ranks it once with the unchanged baseline. */
  function rank(w: GroupWorkspace, input: Canonical): { result: RankingResult; viewers: PickerViewer[]; rows: readonly Readonly<Row>[] } {
    const groupId = w.selected!.id, viewers = pickerViewers(w), rows = h.rows(), snapshot = projectSnapshot(rows, groupId);
    const ranking: RankingInput = { groupId, members: viewers.map(v => ({ id: v.id, groupId })), ...snapshot, selectedViewerIds: input.viewerIds, availableMinutes: input.availableMinutes, mood: input.mood as RankingInput["mood"], rewatches: input.rewatches };
    return { result: rankCandidates(ranking), viewers, rows };
  }
  function inputFailure(result: RankingResult): ServiceResult<never> | null {
    if (result.kind === "invalid_selection") return invalid({ viewers: result.message });
    if (result.kind === "invalid_input") return invalid(result.reason === "invalid_rewatches" ? { rewatches: result.message } : { form: result.message });
    if (result.kind === "invalid_ranking") return invalid({ [result.field === "titles" ? "form" : result.field]: result.message });
    return null;
  }
  /** Checks the explicit input shape without coercion; values themselves are validated by the baseline ranking. */
  function canonical(input: PickerInput): Canonical | ServiceResult<never> {
    if (!input || typeof input !== "object") return invalid({ form: "Provide viewers, time, mood and rewatch permission." });
    if (typeof input.rewatches !== "boolean") return invalid({ rewatches: "Rewatch permission must be true or false." });
    const viewerIds = Array.isArray(input.viewerIds) ? [...input.viewerIds] as string[] : input.viewerIds as unknown as string[];
    return { viewerIds, availableMinutes: input.availableMinutes, mood: input.mood, rewatches: input.rewatches };
  }
  /** D22 semantic fingerprint (deterministic JSON, no crypto). Ratings, notes, unselected records, revisions, origins, deadlines, availability, filter, profile and viewer order are excluded. */
  function fingerprint(rows: readonly Readonly<Row>[], groupId: string, viewers: PickerViewer[], input: Canonical, result: RankingResult) {
    const own = rows.filter(r => r.groupId === groupId).sort((a, b) => a.id < b.id ? -1 : 1);
    const selected = sorted(input.viewerIds);
    return JSON.stringify({
      titles: own.map(r => [r.id, r.title, r.title === null ? null : normalized(r.title), r.contentType, r.durationSeconds, r.numberingStyle, r.archived, r.createdAt, r.providerId, r.watchUrl, r.sourceUrl, r.coverUrl, sorted(r.moods), sorted(r.genres)]),
      contributions: sorted(own.flatMap(r => r.contributions.filter(c => c.active).map(c => JSON.stringify([r.id, c.memberId])))),
      viewers: selected.map(id => { const v = viewers.find(x => x.id === id); return v ? [v.id, v.name, v.color] : [id]; }),
      progress: own.flatMap(r => r.history.filter(x => x.progress !== null && selected.includes(x.memberId)).map(x => {
        const p = x.progress!;
        return [r.id, x.memberId, r.numberingStyle, p.kind, p.kind === "episode" ? [p.position, p.season, p.episode] : null, p.completed, p.kind === "watch" ? (p.timestampSeconds === null ? "absent" : p.timestampSeconds) : "absent"];
      })).sort((a, b) => JSON.stringify(a) < JSON.stringify(b) ? -1 : 1),
      tier: result.kind === "ranked" ? result.tier : "none",
      identities: result.kind === "ranked" ? result.candidates.map(c => candidateIdentity(c.titleId, c.target)) : [],
    });
  }
  function display(groupId: string, rows: readonly Readonly<Row>[], viewers: PickerViewer[], input: Canonical, result: Extract<RankingResult, { kind: "ranked" }>, index: number): PickerCandidate {
    const c = result.candidates[index], row = rows.find(r => r.id === c.titleId && r.groupId === groupId)!;
    const person = (id: string) => viewers.find(v => v.id === id)!;
    return Object.freeze({ id: c.titleId, title: row.title!, contentType: row.contentType as LibraryType, durationSeconds: c.durationSeconds, tier: c.tier, message: c.message, target: Object.freeze({ ...c.target }),
      rewatchers: Object.freeze(c.rewatchingViewerIds.map(person)), viewers: Object.freeze(input.viewerIds.map(person)), availableMinutes: String(result.context.availableMinutes),
      requestedMood: fixedMoods.find(m => m.value === result.context.mood)!.label, rewatches: result.context.rewatches, watchUrl: h.safeUrl(row.watchUrl) });
  }
  function noMatch(w: GroupWorkspace, result: Extract<RankingResult, { kind: "no_match" }>, refreshed: boolean): PickerOutcome {
    const suggestions: PickerSuggestion[] = [];
    if (result.actions.includes("add_title")) suggestions.push(Object.freeze({ kind: "add_title", label: h.actor(w) ? "Add a title" : "Choose profile to add a title" }));
    if (result.actions.includes("set_progress") || result.actions.includes("complete_metadata")) {
      const affected = result.eligibility.titles.find(item => item.kind === "excluded" && ["unknown_progress", "invalid_progress", "metadata_incomplete"].includes(item.reason) && item.titleId);
      if (affected?.kind === "excluded" && affected.titleId) suggestions.push(Object.freeze({ kind: "open_title", titleId: affected.titleId, label: "View details to review progress or metadata" }));
    }
    return { kind: "no_match", refreshed, message: result.message, reasons: Object.freeze(result.reasons.map(code => Object.freeze({ code, label: noMatchLabels[code] }))), suggestions: Object.freeze(suggestions) };
  }
  function outcome(w: GroupWorkspace, rows: readonly Readonly<Row>[], viewers: PickerViewer[], input: Canonical, result: RankingResult, index: number, cycle: PickerCycleHandle | null, refreshed: boolean): PickerOutcome {
    if (result.kind === "no_match") return noMatch(w, result, refreshed);
    const ranked = result as Extract<RankingResult, { kind: "ranked" }>;
    if (index >= ranked.candidates.length) return { kind: "exhausted", refreshed, cycle: cycle! };
    return { kind: "picked", refreshed, candidate: display(w.selected!.id, rows, viewers, input, ranked, index), cycle: cycle! };
  }
  const handle = (cycle: Cycle, step: string): PickerCycleHandle => Object.freeze({ cycleId: cycle.id, step });

  /** Shared continuation for next/restart and same-intent retries. Computes the whole outcome first, then commits synchronously. */
  function advance(action: Action, cycle: Cycle, w: GroupWorkspace, intentId: string, inputStep: string, repeated: boolean): ServiceResult<PickerOutcome> {
    const { result, viewers, rows } = rank(w, cycle.input);
    const failed = inputFailure(result); if (failed) return failed;
    const semantic = fingerprint(rows, cycle.groupId, viewers, cycle.input, result), changed = semantic !== cycle.semantic;
    const refreshed = changed || (repeated && cycle.last.refreshed), count = result.kind === "ranked" ? result.candidates.length : 0;
    if (!repeated && !refreshed && (action === "restart" ? cycle.index < count : cycle.index >= count)) return conflict();
    const index = changed || action === "restart" || action === "start" ? 0 : repeated ? cycle.last.index : cycle.index + 1;
    const step = repeated && !changed ? cycle.last.outputStep : `${cycle.id}-step-${++cycle.steps}`;
    cycle.semantic = semantic; cycle.index = index; cycle.step = step; cycle.last = { id: intentId, action, inputStep, index, outputStep: step, refreshed }; cycle.intents.add(intentId);
    return success(outcome(w, rows, viewers, cycle.input, result, index, handle(cycle, step), refreshed));
  }
  /** Resolves a continuation handle or returns why it must conflict (unknown, expired, evicted, foreign, wrong step, older intent). */
  function locate(w: GroupWorkspace, value: PickerCycleHandle, intentId: unknown, action: Action): { cycle: Cycle; repeated: boolean } | null {
    purge();
    if (!validIntent(intentId) || !value || typeof value !== "object" || typeof value.cycleId !== "string" || typeof value.step !== "string") return null;
    const cycle = cycles.get(value.cycleId);
    if (!cycle || !sameContext(cycle.context, h.identity()) || cycle.groupId !== w.selected!.id) return null;
    const repeated = cycle.last.id === intentId;
    if (repeated) return cycle.last.action === action && cycle.last.inputStep === value.step ? { cycle, repeated } : null;
    if (cycle.intents.has(intentId) || cycle.step !== value.step) return null;
    return { cycle, repeated };
  }

  const service = Object.freeze<PickerService>({
    getInputs: (expected, options) => h.run<PickerInputs>(expected, options, () => {
      const w = h.access(); if (!w) return denied();
      return success({ groupId: w.selected!.id, groupName: w.selected!.name, mode: w.mode, viewers: Object.freeze(pickerViewers(w)), canAddTitle: !!h.actor(w) });
    }),
    pick: (input, intentId, expected, options) => h.run<PickerOutcome>(expected, options, () => {
      const w = h.access(); if (!w) return denied();
      purge();
      if (!validIntent(intentId)) return conflict();
      const chosen = canonical(input); if ("kind" in chosen) return chosen;
      // A repeated start intent returns its own cycle; a start intent that was superseded by later advances is older and conflicts.
      for (const cycle of cycles.values()) {
        if (!cycle.intents.has(intentId)) continue;
        if (cycle.last.id !== intentId || cycle.last.action !== "start" || !sameContext(cycle.context, h.identity()) || cycle.groupId !== w.selected!.id || cycle.key !== contextKey(chosen)) return conflict();
        return advance("start", cycle, w, intentId, "", true);
      }
      const { result, viewers, rows } = rank(w, chosen);
      const failed = inputFailure(result); if (failed) return failed;
      // A zero-item result is a no-match view with no cycle and no advance action.
      if (result.kind !== "ranked") return success(outcome(w, rows, viewers, chosen, result, 0, null, false));
      while (cycles.size >= cycleCapacity) cycles.delete(cycles.keys().next().value!);
      const id = `cycle-${++counter}`, step = `${id}-step-1`;
      const cycle: Cycle = { id, context: h.identity(), groupId: w.selected!.id, input: chosen, key: contextKey(chosen), semantic: fingerprint(rows, w.selected!.id, viewers, chosen, result), index: 0, step, steps: 1, startedAt: h.clock(), last: { id: intentId, action: "start", inputStep: "", index: 0, outputStep: step, refreshed: false }, intents: new Set([intentId]) };
      cycles.set(id, cycle);
      return success(outcome(w, rows, viewers, chosen, result, 0, handle(cycle, step), false));
    }),
    next: (value, intentId, expected, options) => h.run<PickerOutcome>(expected, options, () => {
      const w = h.access(); if (!w) return denied();
      const found = locate(w, value, intentId, "next"); if (!found) return conflict();
      return advance("next", found.cycle, w, intentId, value.step, found.repeated);
    }),
    restart: (input, value, intentId, expected, options) => h.run<PickerOutcome>(expected, options, () => {
      const w = h.access(); if (!w) return denied();
      const found = locate(w, value, intentId, "restart"); if (!found) return conflict();
      const chosen = canonical(input); if ("kind" in chosen) return chosen;
      if (contextKey(chosen) !== found.cycle.key) return conflict();
      return advance("restart", found.cycle, w, intentId, value.step, found.repeated);
    }),
  });
  return { service, reset: () => { cycles.clear(); }, size: () => cycles.size };
}
