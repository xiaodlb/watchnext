import type { ContextIdentity, EpisodeInput, FeedbackService, FieldErrors, GroupWorkspace, LibraryHistory, OwnEpisodeProgress, OwnPersonal, OwnWatchProgress, PersonalClaim, PersonalCommit, PersonalEntry, PersonalPanel, PersonalProgress, ProgressService, RequestOptions, ServiceResult } from "../service/contracts";
import type { Row } from "./library";

/*
 * Synthetic personal progress/feedback (#59, P01-P05). Client-safe pure copies of the baseline
 * rules in lib/{episode-progress,watch-progress,ratings,notes}.ts and their *-state helpers;
 * tests/frontend/personal.test.ts checks parity against those production helpers.
 * Records live only on the mounted mock library rows. No storage, network or credentials.
 */
export const noteLimit = 2000;
export const seededNote = "Synthetic personal note. <script> stays plain text.";

/** Same normalization/count as lib/note-state.ts inspectNoteDraft. */
export function inspectNoteDraft(value: string) {
  const normalized = value.replace(/\r\n?/g, "\n").replace(/^[\p{White_Space}﻿]+|[\p{White_Space}﻿]+$/gu, "");
  const count = [...normalized].length;
  return { normalized, count, error: value.includes("\0") ? "Notes cannot contain NUL characters." : count > noteLimit ? "Keep your note within 2000 Unicode code points. Your draft has not been shortened." : undefined };
}
/** Baseline coordinate rule: one to four digits after trimming, value 1-9999. */
export function parseCoordinate(value: unknown): number | null {
  if (typeof value !== "string" || !/^[0-9]{1,4}$/.test(value.trim())) return null;
  const n = Number(value.trim()); return n >= 1 && n <= 9999 ? n : null;
}
/** Baseline parseWatchTimestamp as a result value: blank is absent (null), never 0. */
export function parseTimestampText(input: unknown): { ok: true; seconds: number | null } | { ok: false; error: string } {
  if (typeof input !== "string") return { ok: false, error: "Enter a timestamp using M:SS or H:MM:SS, or leave it blank." };
  const value = input.trim(); if (!value) return { ok: true, seconds: null };
  const match = /^(?:([0-9]+):([0-5][0-9])|([0-9]+):([0-5][0-9]):([0-5][0-9]))$/.exec(value);
  if (!match) return { ok: false, error: "Use M:SS or H:MM:SS with two-digit seconds and valid minute/second components (00–59)." };
  const seconds = match[1] === undefined ? Number(match[3]) * 3600 + Number(match[4]) * 60 + Number(match[5]) : Number(match[1]) * 60 + Number(match[2]);
  if (!Number.isSafeInteger(seconds)) return { ok: false, error: "Enter a whole-second timestamp within the full duration." };
  return { ok: true, seconds };
}
export function usableRuntime(duration: number | null): duration is number { return duration !== null && Number.isInteger(duration) && duration >= 1 && duration <= 86400; }
export function formatWatchTimestamp(seconds: number | null): string {
  if (seconds === null) return "";
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error("A timestamp must contain nonnegative whole seconds");
  const pad = (value: number) => String(value).padStart(2, "0");
  return seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${pad(Math.floor(seconds / 60) % 60)}:${pad(seconds % 60)}` : `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
}
/** Baseline parseRating: canonical decimal 1-10 after trimming; anything else is invalid (null). */
export function parseRatingText(score: unknown): number | null {
  return typeof score === "string" && /^(?:[1-9]|10)$/.test(score.trim()) ? Number(score.trim()) : null;
}

/** P01 needs episodic numbering with series/anime/NULL type; P02 needs `none` with movie/YouTube/NULL. */
export function progressKind(r: Pick<Row, "contentType" | "numberingStyle">): "episode" | "watch" | null {
  if ((r.numberingStyle === "season_episode" || r.numberingStyle === "continuous") && (r.contentType === null || r.contentType === "series" || r.contentType === "anime")) return "episode";
  if (r.numberingStyle === "none" && (r.contentType === null || r.contentType === "movie" || r.contentType === "youtube")) return "watch";
  return null;
}
/** D10: any recorded progress (explicit Unknown/completion-only included), rating or note blocks type/numbering changes. */
export const blocksStructureChange = (record: LibraryHistory) => record.progress !== null || record.rating !== null || record.note !== null;

const record = (id: string, memberId: string, progress: PersonalProgress | null, rating: number | null, note: string | null): LibraryHistory => Object.freeze({ id, memberId, progress: progress && Object.freeze(progress), rating, note });
/** Structured form of the #57 seeded summaries; the record ID/attribution is supplied unchanged by the caller. */
export function seededHistory(id: string, memberId: string, numbering: Row["numberingStyle"]): LibraryHistory {
  return record(id, memberId, numbering === "none" ? { kind: "watch", timestampSeconds: 300, completed: false } : { kind: "episode", position: "in_progress", season: numbering === "season_episode" ? 1 : null, episode: 2, completed: false }, 8, seededNote);
}
/** The three additional #59 seeds from _docs/mock-personal.md. Existing records are never replaced. */
export function seedPersonal(rows: Row[]) {
  const add = (titleId: string, memberId: string, progress: PersonalProgress) => { const r = rows.find(x => x.id === titleId); if (r && !r.history.some(x => x.memberId === memberId)) r.history = Object.freeze([...r.history, record(`personal-${titleId}-${memberId}`, memberId, progress, null, null)]); };
  add("saved-anime", "friday-owner", { kind: "episode", position: "not_started", season: null, episode: 1, completed: false });
  add("saved-video", "friday-viewer", { kind: "watch", timestampSeconds: 0, completed: false });
  add("weekend-movie", "weekend-viewer", { kind: "watch", timestampSeconds: null, completed: true });
}

const beyond = (r: Row, p: PersonalProgress | null | undefined) => p?.kind === "watch" && p.timestampSeconds !== null && usableRuntime(r.durationSeconds) && p.timestampSeconds > r.durationSeconds;
function ownProgress(r: Row, own: LibraryHistory | undefined): OwnEpisodeProgress | OwnWatchProgress | null {
  const kind = progressKind(r), p = own?.progress ?? null;
  if (kind === "episode") {
    const e = p?.kind === "episode" ? p : null;
    return Object.freeze({ kind, numberingStyle: r.numberingStyle as "season_episode" | "continuous", recorded: !!e, position: e?.position ?? "unknown", season: e?.season ?? null, episode: e?.episode ?? null, completed: e?.completed ?? false, metadataUnavailable: r.title === null || r.contentType === null || r.durationSeconds === null });
  }
  if (kind === "watch") {
    const t = p?.kind === "watch" ? p : null;
    return Object.freeze({ kind, recorded: !!t, timestampSeconds: t?.timestampSeconds ?? null, completed: t?.completed ?? false, fullDurationSeconds: r.durationSeconds, runtimeAvailable: usableRuntime(r.durationSeconds), beyondDuration: beyond(r, t) });
  }
  return null;
}
/** Every group member in member order, inactive members included and labeled by the UI. */
export function personalPanel(r: Row, w: GroupWorkspace): PersonalPanel {
  const member = w.members.find(m => m.active && m.you) ?? null, mine = member ? r.history.find(x => x.memberId === member.id) : undefined;
  const own: OwnPersonal | null = member ? Object.freeze({ memberId: member.id, memberName: member.name, recordId: mine?.id ?? null, progress: ownProgress(r, mine), rating: mine?.rating ?? null, note: mine?.note ?? null }) : null;
  const history = Object.freeze(w.members.map((m): PersonalEntry => { const entry = r.history.find(x => x.memberId === m.id) ?? null; return Object.freeze({ member: m, record: entry, beyondDuration: beyond(r, entry?.progress) }); }));
  const reason = !member ? (w.mode === "legacy" ? "Choose profile: legacy browsing shows every member's history, but only a selected same-group profile can record its own progress, rating and note." : "Only an active member of this group can record personal progress.") : r.archived ? "Archived title: personal history stays readable. Restore the title before recording progress, ratings or notes." : null;
  return Object.freeze({ own, history, writable: !!member && !r.archived, reason });
}

type Change = { progress?: PersonalProgress | null; rating?: number | null; note?: string | null };
type Hooks = {
  access: () => GroupWorkspace | null;
  actor: (w: GroupWorkspace) => string | null;
  find: (id: string, w: GroupWorkspace) => Row | undefined;
  identity: () => ContextIdentity;
  run: <T>(expected: ContextIdentity, options: RequestOptions | undefined, commit: () => ServiceResult<T>) => Promise<ServiceResult<T>>;
};
const denied = (message: string): ServiceResult<never> => ({ kind: "failure", error: { code: "personal_access", message, retryable: true } });
const invalid = (fields: FieldErrors, message: string): ServiceResult<never> => ({ kind: "failure", error: { code: "personal_input", message, retryable: true, fields } });
const isFailure = (value: Change | "noop" | ServiceResult<never>): value is ServiceResult<never> => typeof value === "object" && "kind" in value;
const absent = (value: unknown) => value === undefined || value === "";
const sameProgress = (a: PersonalProgress | null, b: PersonalProgress | null) => JSON.stringify(a) === JSON.stringify(b);

export function createMockPersonal(h: Hooks) {
  /** Commit-time authority: live actor/profile, same-group active title, current structure and the stale-form claims. */
  function mutate(id: string, claim: PersonalClaim, expected: ContextIdentity, options: RequestOptions | undefined, need: "episode" | "watch" | "progress" | null, area: string, decide: (r: Row, current: LibraryHistory | undefined) => Change | "noop" | ServiceResult<never>) {
    return h.run<PersonalCommit>(expected, options, () => {
      const unavailable = `${area} is unavailable for this profile or title. Reload, choose your profile, and restore archived titles before updating.`;
      const w = h.access(), actorId = w && h.actor(w);
      if (!w || !actorId) return denied(w?.mode === "legacy" ? "Choose your own same-group legacy profile before recording personal progress, ratings or notes." : unavailable);
      if (!claim || typeof claim !== "object" || claim.memberId !== actorId) return denied(`This form was opened for a different member. Personal records can only be changed by their own member. ${unavailable}`);
      const r = h.find(id, w); if (!r) return denied("This title is missing or outside your current group.");
      if (r.archived) return denied(`Archived title: personal history stays readable, but nothing was changed. ${unavailable}`);
      if (claim.numberingStyle !== r.numberingStyle) return denied("This title's episode structure changed. Reload the title before updating. Nothing was changed.");
      const kind = progressKind(r);
      if (need && (kind === null || (need !== "progress" && kind !== need))) return denied(`This title's structure does not support this progress operation. ${unavailable}`);
      const current = r.history.find(x => x.memberId === actorId), outcome = decide(r, current);
      if (isFailure(outcome)) return outcome;
      let committed = current ?? null;
      if (outcome !== "noop") {
        const base = current ?? { id: `personal-${r.id}-${actorId}`, memberId: actorId, progress: null, rating: null, note: null };
        const next = { ...base, ...outcome };
        const changed = !current ? next.progress !== null || next.rating !== null || next.note !== null : !sameProgress(current.progress, next.progress) || current.rating !== next.rating || current.note !== next.note;
        if (changed) {
          committed = record(next.id, next.memberId, next.progress, next.rating, next.note);
          r.history = Object.freeze(current ? r.history.map(x => x === current ? committed! : x) : [...r.history, committed]);
        }
      }
      const panel = personalPanel(r, w);
      return { kind: "success", value: Object.freeze({ record: committed, own: panel.own!, history: panel.history }), context: h.identity() };
    });
  }
  const watchOf = (current: LibraryHistory | undefined) => current?.progress?.kind === "watch" ? current.progress : null;
  function timestamp(r: Row, current: LibraryHistory | undefined, text: unknown): Change | "noop" | ServiceResult<never> {
    const parsed = parseTimestampText(text);
    if (!parsed.ok) return invalid({ timestamp: parsed.error }, "Check Stopped at. Nothing was changed.");
    const previous = watchOf(current);
    if (parsed.seconds === null) return previous ? { progress: { ...previous, timestampSeconds: null } } : "noop";
    if (!usableRuntime(r.durationSeconds)) return invalid({ timestamp: "Full duration is unavailable. Restore usable metadata before entering a timestamp. Clearing and completion are still available." }, "Check Stopped at. Nothing was changed.");
    if (parsed.seconds > r.durationSeconds) return invalid({ timestamp: "Stopped at must not exceed the current full duration." }, "Check Stopped at. Nothing was changed.");
    return { progress: { kind: "watch", timestampSeconds: parsed.seconds, completed: previous?.completed ?? false } };
  }
  const progress = Object.freeze<ProgressService>({
    saveEpisode: (id, input, claim, expected, options) => mutate(id, claim, expected, options, "episode", "Progress", (r, current) => {
      const style = r.numberingStyle as "season_episode" | "continuous", position = input?.position, fields: { positionState?: string; nextSeason?: string; nextEpisode?: string } = {};
      if (position !== "unknown" && position !== "not_started" && position !== "in_progress") return invalid({ positionState: "Choose Unknown, Not started or In progress." }, "Check your episode progress. Nothing was changed.");
      let season: number | null = null, episode: number | null = null;
      if (position === "in_progress") {
        const coordinate = "Enter a whole number from 1 to 9999, using digits only.";
        episode = parseCoordinate(input.episode); if (episode === null) fields.nextEpisode = coordinate;
        if (style === "season_episode") { season = parseCoordinate(input.season); if (season === null) fields.nextSeason = coordinate; }
        else if (!absent(input.season)) fields.nextSeason = "Continuous numbering does not have a season. Reload this title’s progress.";
      } else {
        if (!absent(input?.season)) fields.nextSeason = "Only In progress accepts entered coordinates.";
        if (!absent(input?.episode)) fields.nextEpisode = "Only In progress accepts entered coordinates.";
        if (position === "not_started") { episode = 1; season = style === "season_episode" ? 1 : null; }
      }
      if (Object.keys(fields).length) return invalid(fields, "Check your episode progress. Nothing was changed.");
      const previous = current?.progress?.kind === "episode" ? current.progress : null;
      // Saving a position never changes completion and nothing is inferred or advanced.
      return { progress: { kind: "episode", position, season, episode, completed: previous?.completed ?? false } };
    }),
    saveTimestamp: (id, text, claim, expected, options) => mutate(id, claim, expected, options, "watch", "Watch progress", (r, current) => timestamp(r, current, text)),
    clearTimestamp: (id, claim, expected, options) => mutate(id, claim, expected, options, "watch", "Watch progress", (r, current) => timestamp(r, current, "")),
    setCompleted: (id, completed, claim, expected, options) => mutate(id, claim, expected, options, "progress", "Progress", (r, current) => {
      if (typeof completed !== "boolean") return invalid({ completed: "Choose Mark complete or Undo completion." }, "Check your progress. Nothing was changed.");
      const previous = current?.progress ?? null;
      // Only the flag changes; coordinates/timestamps are copied, never revalidated or rewritten.
      if (progressKind(r) === "episode") return { progress: previous?.kind === "episode" ? { ...previous, completed } : { kind: "episode", position: "unknown", season: null, episode: null, completed } };
      return { progress: previous?.kind === "watch" ? { ...previous, completed } : { kind: "watch", timestampSeconds: null, completed } };
    }),
  });
  const ratingError = "Enter a whole-number rating from 1 to 10, using digits only. Use Clear my rating to remove it.";
  const feedback = Object.freeze<FeedbackService>({
    saveRating: (id, score, claim, expected, options) => mutate(id, claim, expected, options, null, "Your rating", () => { const value = parseRatingText(score); return value === null ? invalid({ rating: ratingError }, "Check your rating. Nothing was changed.") : { rating: value }; }),
    clearRating: (id, claim, expected, options) => mutate(id, claim, expected, options, null, "Your rating", () => ({ rating: null })),
    saveNote: (id, body, claim, expected, options) => mutate(id, claim, expected, options, null, "Your note", () => {
      if (typeof body !== "string") return invalid({ note: "Enter a plain-text note, or leave it blank to clear your note." }, "Check your note. Nothing was changed.");
      const checked = inspectNoteDraft(body); if (checked.error) return invalid({ note: checked.error }, "Check your note. Nothing was changed.");
      return { note: checked.normalized || null };
    }),
    clearNote: (id, claim, expected, options) => mutate(id, claim, expected, options, null, "Your note", () => ({ note: null })),
  });
  return { progress, feedback };
}
