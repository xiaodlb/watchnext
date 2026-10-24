"use client";
import { useEffect, useRef, useState } from "react";
import type { ContextIdentity, EpisodePosition, FrontendService, LibraryHistory, LibraryTitle, MockScenario, OwnPersonal, PersonalCommit, PersonalField, PersonalPanel, RequestOptions, ServiceResult } from "../../frontend/service/contracts";
import { formatWatchTimestamp, inspectNoteDraft, noteLimit } from "../../frontend/mock/personal";
import styles from "./preview.module.css";

type Drafts = { position: EpisodePosition; season: string; episode: string; timestamp: string; rating: string; note: string };
type Area = "progress" | "rating" | "note";
const ids: Record<PersonalField, string> = { positionState: "personal-episode-state", nextSeason: "personal-next-season", nextEpisode: "personal-next-episode", timestamp: "personal-timestamp", completed: "personal-progress-heading", rating: "personal-rating", note: "personal-note" };
const areaFields: Record<Area, PersonalField[]> = { progress: ["positionState", "nextSeason", "nextEpisode", "timestamp", "completed"], rating: ["rating"], note: ["note"] };
function stored(own: OwnPersonal | null, area: Area | "all", previous?: Drafts): Drafts {
  const p = own?.progress, base: Drafts = previous ?? { position: "unknown", season: "", episode: "", timestamp: "", rating: "", note: "" };
  const progress = p?.kind === "episode" ? { position: p.position, season: p.season === null ? "" : String(p.season), episode: p.episode === null ? "" : String(p.episode) } : p?.kind === "watch" ? { timestamp: formatWatchTimestamp(p.timestampSeconds) } : {};
  return { ...base, ...(area === "all" || area === "progress" ? progress : {}), ...(area === "all" || area === "rating" ? { rating: own?.rating === null || own?.rating === undefined ? "" : String(own.rating) } : {}), ...(area === "all" || area === "note" ? { note: own?.note ?? "" } : {}) };
}
/** Baseline member-history wording; absence is Not recorded / Not rated / No notes. */
export function historyPosition(record: LibraryHistory | null, episodic: boolean) {
  const p = record?.progress ?? null;
  if (p?.kind === "watch" || (!p && !episodic)) return p?.kind === "watch" && p.timestampSeconds !== null ? `Manual timestamp: ${formatWatchTimestamp(p.timestampSeconds)}` : "Manual timestamp: Not recorded";
  if (!p) return "Next episode: Not recorded";
  if (p.position === "unknown") return "Next episode: Unknown";
  const next = p.season === null ? `Episode ${p.episode}` : `Season ${p.season}, episode ${p.episode}`;
  return `${p.position === "not_started" ? "Not started — " : "Next: "}${next}`;
}
export function MockPersonal({ service, identity, scenario, title, onCommitted }: { service: FrontendService; identity: { current: ContextIdentity }; scenario: MockScenario; title: LibraryTitle; onCommitted: (panel: PersonalPanel) => void }) {
  const panel = title.personal, own = panel.own, progress = own?.progress ?? null;
  const [drafts, setDrafts] = useState<Drafts>(() => stored(own, "all"));
  const [errors, setErrors] = useState<Partial<Record<PersonalField, string>>>({});
  const [pending, setPending] = useState<string>();
  const [message, setMessage] = useState<{ text: string; alert: boolean; focus?: PersonalField }>();
  const opened = useRef(identity.current), running = useRef<AbortController | undefined>(undefined), sequence = useRef(0);
  const cancelButton = useRef<HTMLButtonElement>(null), feedback = useRef<HTMLParagraphElement>(null);
  useEffect(() => () => { sequence.current++; running.current?.abort(); }, []);
  useEffect(() => { if (running.current) cancel(); }, [scenario]);
  // The started operation's controls become disabled, so keyboard focus moves to the reachable Cancel (no trap).
  useEffect(() => { if (pending) cancelButton.current?.focus(); }, [pending]);
  useEffect(() => { if (!message) return; if (message.focus) document.getElementById(ids[message.focus])?.focus(); else feedback.current?.focus(); }, [message]);
  function cancel() { sequence.current++; running.current?.abort(); running.current = undefined; setPending(undefined); setMessage({ text: "Personal request canceled. Your draft is kept and nothing was saved.", alert: false }); }
  const edit = (field: keyof Drafts, value: string, error?: PersonalField) => { setDrafts(d => ({ ...d, [field]: value })); if (error) setErrors(e => ({ ...e, [error]: undefined })); };
  async function run(area: Area, label: string, operation: (expected: ContextIdentity, options: RequestOptions) => Promise<ServiceResult<PersonalCommit>>, success: (value: PersonalCommit) => string) {
    if (running.current || !own) return;
    const n = ++sequence.current, controller = new AbortController(); running.current = controller; setPending(label); setMessage(undefined);
    const result = await operation(opened.current, { scenario, signal: controller.signal });
    if (n !== sequence.current) return; running.current = undefined; setPending(undefined);
    if (result.kind !== "success") {
      const fields = result.kind === "failure" ? result.error.fields ?? {} : {}, first = areaFields[area].find(field => fields[field]);
      setErrors(e => ({ ...e, ...Object.fromEntries(areaFields[area].map(field => [field, fields[field]])) }));
      setMessage({ text: `${result.kind === "failure" ? result.error.message : result.message} Your entered draft is kept.`, alert: true, focus: first });
      return;
    }
    identity.current = result.context;
    setErrors(e => ({ ...e, ...Object.fromEntries(areaFields[area].map(field => [field, undefined])) }));
    setDrafts(d => stored(result.value.own, area, d));
    onCommitted({ ...panel, own: result.value.own, history: result.value.history });
    setMessage({ text: success(result.value), alert: false });
  }
  const claim = own ? { memberId: own.memberId, numberingStyle: title.numberingStyle } : null;
  const described = (field: PersonalField, hint?: string) => [hint, `${ids[field]}-error`].filter(Boolean).join(" ");
  const fieldError = (field: PersonalField) => <p id={`${ids[field]}-error`} className={styles.fieldError}>{errors[field]}</p>;
  const complete = () => { if (!claim || !progress) return; const done = !progress.completed, thing = progress.kind === "episode" ? "episode position" : "timestamp"; void run("progress", progress.kind === "episode" ? "Saving episode progress…" : "Saving watch progress…", (expected, options) => service.progress.setCompleted(title.id, done, claim, expected, options), () => done ? `Marked complete. Your stored ${thing} is unchanged.` : `Completion undone. Your stored ${thing} is unchanged.`); };
  const note = inspectNoteDraft(drafts.note), noteError = note.error ?? errors.note;
  const episodic = title.numberingStyle !== "none";
  return <section className={styles.personal} aria-labelledby="personal-heading"><h4 id="personal-heading">Personal progress and feedback</h4>
    <p>Each member records only their own progress, rating and note. Everyone with access to this group can read them. Ratings and notes do not affect picks.</p>
    {own && claim && panel.writable ? <>
      {progress?.kind === "episode" && <form className={styles.personalPanel} role="group" aria-labelledby="personal-progress-heading" noValidate aria-busy={!!pending} onSubmit={event => { event.preventDefault(); void run("progress", "Saving episode progress…", (expected, options) => service.progress.saveEpisode(title.id, { position: drafts.position, season: drafts.position === "in_progress" ? drafts.season : "", episode: drafts.position === "in_progress" ? drafts.episode : "" }, claim, expected, options), () => "Episode progress saved. Completion is unchanged."); }}>
        <h4 id="personal-progress-heading" tabIndex={-1}>Your episode progress</h4>
        <p>Editing as <strong>{own.memberName}</strong>. Record the next episode to watch. Season changes are entered manually.</p>
        {progress.metadataUnavailable && <p className={styles.warning}>Title metadata is unavailable. Your saved episode structure and history remain; you can still correct your own position.</p>}
        <p>Saved position: {!progress.recorded ? "Unknown / Not recorded" : progress.position === "unknown" ? "Unknown" : `${progress.position === "not_started" ? "Not started — " : "Next: "}${progress.season === null ? "" : `Season ${progress.season}, `}episode ${progress.episode}`}. Completion: {progress.completed ? "Finished" : "Not finished"}.</p>
        <div className={styles.field}><label htmlFor={ids.positionState}>Episode position</label><select className="field" id={ids.positionState} value={drafts.position} onChange={event => edit("position", event.target.value, "positionState")} aria-invalid={!!errors.positionState} aria-describedby={described("positionState", "personal-episode-hint")}><option value="unknown">Unknown</option><option value="not_started">Not started</option><option value="in_progress">In progress</option></select></div>
        <p id="personal-episode-hint">Unknown clears coordinates. Not started explicitly sets {progress.numberingStyle === "season_episode" ? "season 1, episode 1" : "episode 1"}. Neither changes completion.</p>{fieldError("positionState")}
        {drafts.position === "in_progress" && <>{progress.numberingStyle === "season_episode" && <><label className={styles.field}>Next season to watch<input className="field" id={ids.nextSeason} inputMode="numeric" value={drafts.season} onChange={event => edit("season", event.target.value, "nextSeason")} aria-invalid={!!errors.nextSeason} aria-describedby={described("nextSeason", "personal-coordinate-hint")} /></label>{fieldError("nextSeason")}</>}
          <label className={styles.field}>Next episode to watch<input className="field" id={ids.nextEpisode} inputMode="numeric" value={drafts.episode} onChange={event => edit("episode", event.target.value, "nextEpisode")} aria-invalid={!!errors.nextEpisode} aria-describedby={described("nextEpisode", "personal-coordinate-hint")} /></label>{fieldError("nextEpisode")}
          <p id="personal-coordinate-hint">Whole numbers from 1 to 9999. This is the next episode, not the last watched.</p></>}
        <div className={styles.controls}><button className="button" disabled={!!pending}>Save episode progress</button><button type="button" className={`button ${styles.secondary}`} disabled={!!pending} onClick={complete}>{progress.completed ? "Undo completion" : "Mark complete"}</button></div>
      </form>}
      {progress?.kind === "watch" && <form className={styles.personalPanel} role="group" aria-labelledby="personal-progress-heading" noValidate aria-busy={!!pending} onSubmit={event => { event.preventDefault(); if (!progress.runtimeAvailable) return; void run("progress", "Saving watch progress…", (expected, options) => service.progress.saveTimestamp(title.id, drafts.timestamp, claim, expected, options), value => value.own.progress?.kind === "watch" && value.own.progress.timestampSeconds === null ? "Timestamp cleared. Completion is unchanged." : "Timestamp saved. Completion is unchanged."); }}>
        <h4 id="personal-progress-heading" tabIndex={-1}>Your watch progress</h4>
        <p>Editing as <strong>{own.memberName}</strong>. Progress is manual; watching externally does not update it.</p>
        <p>Saved timestamp: {formatWatchTimestamp(progress.timestampSeconds) || "Not recorded"}. Completion: {progress.completed ? "Finished" : "Not finished"}.</p>
        {progress.beyondDuration && <p className={styles.warning}>Your saved timestamp is beyond the current full duration. It is preserved; correct or clear it when ready.</p>}
        {!progress.runtimeAvailable && <p id="personal-runtime-notice" className={styles.warning}>Full duration is unavailable, so a new timestamp cannot be validated. Your saved position and completion are preserved. Restore usable metadata to enter a timestamp; clearing and completion remain available.</p>}
        <label className={styles.field}>Stopped at<input className="field" id={ids.timestamp} value={drafts.timestamp} readOnly={!progress.runtimeAvailable} onChange={event => edit("timestamp", event.target.value, "timestamp")} aria-invalid={!!errors.timestamp} aria-describedby={described("timestamp", `personal-timestamp-hint${progress.runtimeAvailable ? "" : " personal-runtime-notice"}`)} /></label>
        <p id="personal-timestamp-hint">Use M:SS or H:MM:SS, for example 12:05 or 1:10:00. Blank means no timestamp; 0:00 means the beginning.</p>{fieldError("timestamp")}
        <div className={styles.controls}><button className="button" disabled={!!pending || !progress.runtimeAvailable}>Save timestamp</button><button type="button" className={`button ${styles.secondary}`} disabled={!!pending} onClick={() => void run("progress", "Saving watch progress…", (expected, options) => service.progress.clearTimestamp(title.id, claim, expected, options), () => "Timestamp cleared. Completion is unchanged.")}>Clear timestamp</button><button type="button" className={`button ${styles.secondary}`} disabled={!!pending} onClick={complete}>{progress.completed ? "Undo completion" : "Mark complete"}</button></div>
      </form>}
      {!progress && <p className={styles.warning}>This title's saved type and numbering do not match a progress structure, so progress is unavailable. Rating and note remain available.</p>}
      <form className={styles.personalPanel} role="group" aria-labelledby="personal-rating-heading" noValidate aria-busy={!!pending} onSubmit={event => { event.preventDefault(); void run("rating", "Saving your rating…", (expected, options) => service.feedback.saveRating(title.id, drafts.rating, claim, expected, options), () => "Your whole-title rating is saved."); }}>
        <h4 id="personal-rating-heading">Your rating</h4>
        <p>Rating as <strong>{own.memberName}</strong>. Rate the whole title, including a series or anime, rather than an individual episode. You can rate before marking it complete.</p>
        <p>Your saved rating: {own.rating === null ? "Not rated" : `${own.rating}/10`}.</p>
        <label className={styles.field}>Rating (1–10)<input className="field" id={ids.rating} inputMode="numeric" value={drafts.rating} onChange={event => edit("rating", event.target.value, "rating")} aria-invalid={!!errors.rating} aria-describedby={described("rating", "personal-rating-hint")} /></label>
        <p id="personal-rating-hint">One whole number from 1 to 10. To remove a score, use Clear my rating.</p>{fieldError("rating")}
        <div className={styles.controls}><button className="button" disabled={!!pending}>Save rating</button><button type="button" className={`button ${styles.secondary}`} disabled={!!pending} onClick={() => void run("rating", "Saving your rating…", (expected, options) => service.feedback.clearRating(title.id, claim, expected, options), () => "Your rating is cleared. Not rated.")}>Clear my rating</button></div>
      </form>
      <form className={styles.personalPanel} role="group" aria-labelledby="personal-note-heading" noValidate aria-busy={!!pending} onSubmit={event => { event.preventDefault(); void run("note", "Saving your note…", (expected, options) => service.feedback.saveNote(title.id, drafts.note, claim, expected, options), value => value.own.note === null ? "Your note is cleared. No notes." : "Your whole-title note is saved."); }}>
        <h4 id="personal-note-heading">Your note</h4>
        <p>Writing as <strong>{own.memberName}</strong>. This is a whole-title plain-text note that your group can read.</p>
        <p>{own.note === null ? "No notes saved for you." : "Your saved note is visible in the group history below."}</p>
        <div className={styles.field}><label htmlFor={ids.note}>Your note text</label><textarea className="field" id={ids.note} rows={6} value={drafts.note} onChange={event => edit("note", event.target.value, "note")} aria-invalid={!!noteError} aria-describedby={described("note", "personal-note-hint personal-note-count")} /></div>
        <p id="personal-note-hint">Up to 2000 Unicode code points. Outer whitespace is trimmed; internal spacing and line breaks stay. Saving blank or whitespace-only text clears your stored note. Clear my note discards the unsaved draft and removes only your note.</p>
        <p id="personal-note-count" role="status">{note.count} / {noteLimit} Unicode code points after normalization and trimming.</p><p id={`${ids.note}-error`} className={styles.fieldError}>{noteError}</p>
        <div className={styles.controls}><button className="button" disabled={!!pending}>Save note</button><button type="button" className={`button ${styles.secondary}`} disabled={!!pending} onClick={() => void run("note", "Saving your note…", (expected, options) => service.feedback.clearNote(title.id, claim, expected, options), () => "Your note is cleared. No notes.")}>Clear my note</button></div>
      </form>
    </> : <div className={styles.notice}><p>{panel.reason}</p>{!own && <p>Use the groups panel above to choose a profile; your history stays readable here.</p>}</div>}
    <h4 id="personal-history-heading">Group-visible personal history</h4>
    <ul className={styles.history} aria-labelledby="personal-history-heading">{panel.history.map(({ member, record, beyondDuration }) => <li key={member.id}>
      <strong><span className={styles.member} style={{ backgroundColor: `var(--avatar-${member.color})` }}>{member.name}</span>{member.you ? " (You)" : ""}{!member.active ? " (Inactive participant)" : ""}</strong>
      <p>{historyPosition(record, episodic)}</p>{beyondDuration && <p className={styles.warning}>This saved timestamp exceeds the current duration. It has been preserved and needs correction.</p>}
      <p>Completion: {!record?.progress ? "Not recorded" : record.progress.completed ? "Finished" : "Not finished"}</p><p>Rating: {record?.rating == null ? "Not rated" : `${record.rating}/10`}</p>
      <p className={styles.note}>{record?.note ?? "No notes"}</p>{record && <p className={styles.muted}>Record ID: {record.id}</p>}
    </li>)}</ul>
    {pending && <button ref={cancelButton} className={`button ${styles.secondary}`} onClick={cancel}>Cancel personal request</button>}
    <p role={message?.alert ? "alert" : "status"} tabIndex={-1} ref={feedback} aria-live="polite">{pending ?? message?.text ?? ""}</p>
  </section>;
}
