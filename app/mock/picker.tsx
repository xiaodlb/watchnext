"use client";
import { useEffect, useRef, useState } from "react";
import { contentTypes, durationLabel, fixedMoods } from "../../lib/title-state";
import type { ContextIdentity, FieldErrors, FrontendService, MockScenario, PickerCandidate, PickerCycleHandle, PickerInput, PickerInputs, PickerOutcome, PickerSuggestion, PickerViewer, RequestOptions, ServiceResult } from "../../frontend/service/contracts";
import styles from "./preview.module.css";

/* Mock picker region (#60). Wording, labels and global classes follow baseline app/pick/picker.tsx; all data comes from the mounted synthetic service. */
let intentCounter = 0;
/** Logical intent IDs are synthetic per-page counters (no crypto or randomness); they coordinate retries, not authority. */
const newIntent = () => `mock-intent-${++intentCounter}`;
export const contextChangedMessage = "Picker context changed; previous picks and selections were cleared.";
const presets = [{ minutes: "20", label: "20 min" }, { minutes: "45", label: "45 min" }, { minutes: "90", label: "1 h 30 min" }, { minutes: "150", label: "2 h 30 min" }] as const;
const genericError = "We couldn’t pick right now. Your inputs are still here. Please try again.";
type Phase = "idle" | "active" | "exhausted" | "conflict";
type Logical = { action: "pick" | "next" | "restart"; intentId: string; cycle: PickerCycleHandle | null };
type View = { kind: "idle" } | { kind: "outcome"; outcome: PickerOutcome } | { kind: "invalid"; fields: FieldErrors } | { kind: "error"; message: string } | { kind: "cancelled" } | { kind: "stale"; message: string };
const initials = (name: string) => name.split(" ").slice(0, 2).map(part => [...part][0] ?? "").join("").toUpperCase();
function Avatar({ person }: { person: PickerViewer }) { return <span className="avatar" style={{ backgroundColor: `var(--avatar-${person.color})` }} aria-hidden="true">{initials(person.name)}</span>; }
function People({ label, members }: { label: string; members: readonly PickerViewer[] }) { return <ul className="contributor-list" aria-label={label}>{members.map(member => <li key={member.id}><Avatar person={member} /><span className="profile-name">{member.name}</span></li>)}</ul>; }
/** Focuses another mounted /mock panel without navigating; headings get a programmatic tab stop only. */
function focusPanel(headingId: string, field?: string) {
  const target = field ? document.querySelector<HTMLElement>(field) : null;
  if (target) { target.focus(); return; }
  const heading = document.getElementById(headingId); if (heading) { heading.tabIndex = -1; heading.focus(); }
}
export function MockPickResult({ pick, onViewDetails }: { pick: PickerCandidate; onViewDetails: (id: string) => void }) {
  const episodic = pick.target.kind === "episode";
  return <section className={`group-result ${styles.pickResult}`} aria-labelledby="mock-pick-result-heading"><p className="status-label">{pick.tier === "exact" ? "Exact match" : "Alternative suggestion"}</p><h3 id="mock-pick-result-heading">{pick.title}</h3>
    <p>{contentTypes.find(type => type.value === pick.contentType)?.label} · {episodic ? "Typical episode duration" : "Full duration"}: {durationLabel(pick.durationSeconds)}</p>
    <p className={pick.tier === "exact" ? "form-feedback" : "notice"}>{pick.message}</p>
    {pick.target.kind === "episode" && <><p className="saved-title-name">{pick.target.nextSeason === null ? `Episode ${pick.target.nextEpisode}` : `Season ${pick.target.nextSeason}, episode ${pick.target.nextEpisode}`}</p>{pick.target.restart && <p>Restart from the first episode.</p>}{pick.target.catchUp && <p>Catch-up episode for the least advanced viewer.</p>}</>}
    {pick.rewatchers.length > 0 && <div><h4>Rewatching</h4><People label="Rewatching" members={pick.rewatchers} /></div>}
    <h4>Watching together</h4><People label="Watching together" members={pick.viewers} /><p>Requested: {pick.availableMinutes} minutes · {pick.requestedMood} · Rewatches {pick.rewatches ? "OK" : "off"}</p>
    <div className="progress-actions"><button type="button" className={`button ${styles.secondary}`} onClick={() => onViewDetails(pick.id)}>View details</button>{pick.watchUrl ? <a className="button" href={pick.watchUrl} target="_blank" rel="noopener noreferrer">{episodic ? "Open series (external)" : "Watch (external)"}</a> : <p>No viewing link saved.</p>}</div>
    <p className="field-hint">External watching does not update progress. Update your own progress in details.</p>
  </section>;
}
export function MockPicker({ service, identity, scenario, announced, onViewDetails }: { service: FrontendService; identity: { current: ContextIdentity }; scenario: MockScenario; announced: boolean; onViewDetails: (id: string) => void }) {
  const [inputs, setInputs] = useState<PickerInputs>(), [loadMessage, setLoadMessage] = useState<{ text: string; alert: boolean }>();
  const [viewers, setViewers] = useState<string[]>([]), [minutes, setMinutes] = useState(""), [mood, setMood] = useState(""), [rewatches, setRewatches] = useState(false);
  const [view, setView] = useState<View>({ kind: "idle" }), [phase, setPhase] = useState<Phase>("idle"), [pending, setPending] = useState<string>(), [focusTick, setFocusTick] = useState(0);
  const running = useRef<AbortController | undefined>(undefined), sequence = useRef(0), generation = useRef(0), opened = useRef(identity.current);
  const cycle = useRef<PickerCycleHandle | null>(null), retry = useRef<Logical | null>(null);
  const feedback = useRef<HTMLDivElement>(null), cancelButton = useRef<HTMLButtonElement>(null);
  useEffect(() => () => { sequence.current++; running.current?.abort(); }, []);
  useEffect(() => { if (running.current) cancel(); }, [scenario]);
  // The submit button becomes disabled while pending, so focus moves to the reachable Cancel pick (never trapped).
  useEffect(() => { if (pending) cancelButton.current?.focus(); }, [pending]);
  useEffect(() => { if (focusTick) feedback.current?.focus(); }, [focusTick]);
  const announce = () => setFocusTick(value => value + 1);
  function abortRunning() { sequence.current++; running.current?.abort(); running.current = undefined; setPending(undefined); }
  function cancel() { abortRunning(); setView({ kind: "cancelled" }); announce(); }
  /** Any input edit immediately hides the result and discards the cycle and retry intent; late replies are ignored. */
  function edit(apply: () => void) { generation.current++; if (running.current) abortRunning(); cycle.current = null; retry.current = null; setPhase("idle"); setView({ kind: "idle" }); apply(); }
  async function load() {
    if (running.current) return;
    const n = ++sequence.current, controller = new AbortController(); running.current = controller; setPending("Loading picker…"); setLoadMessage(undefined);
    const result = await service.picker.getInputs(identity.current, { scenario, signal: controller.signal });
    if (n !== sequence.current) return; running.current = undefined; setPending(undefined);
    if (result.kind !== "success") { setLoadMessage({ text: result.kind === "failure" ? result.error.message : result.message, alert: result.kind !== "cancelled" }); announce(); return; }
    opened.current = result.context; generation.current++; cycle.current = null; retry.current = null;
    setInputs(result.value); setViewers([]); setMinutes(""); setMood(""); setRewatches(false); setPhase("idle"); setView({ kind: "idle" }); setLoadMessage(undefined);
  }
  const name = (id: string) => inputs?.viewers.find(member => member.id === id)?.name ?? "unavailable viewer";
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (running.current || !inputs) return;
    const logical: Logical = retry.current ?? { action: phase === "active" ? "next" : phase === "exhausted" ? "restart" : "pick", intentId: newIntent(), cycle: phase === "active" || phase === "exhausted" ? cycle.current : null };
    retry.current = logical;
    const version = generation.current, n = ++sequence.current, controller = new AbortController(); running.current = controller;
    const input: PickerInput = { viewerIds: [...viewers], availableMinutes: minutes, mood, rewatches };
    setPending(`Finding a pick for ${viewers.map(name).join(", ") || "your selected viewers"} · ${minutes || "no time selected"} minutes · ${fixedMoods.find(item => item.value === mood)?.label ?? "no mood selected"} · Rewatches ${rewatches ? "OK" : "off"}…`);
    setView({ kind: "idle" });
    const options: RequestOptions = { scenario, signal: controller.signal }, expected = opened.current;
    const result: ServiceResult<PickerOutcome> = logical.action === "next" && logical.cycle ? await service.picker.next(logical.cycle, logical.intentId, expected, options)
      : logical.action === "restart" && logical.cycle ? await service.picker.restart(input, logical.cycle, logical.intentId, expected, options)
      : await service.picker.pick(input, logical.intentId, expected, options);
    if (n !== sequence.current || version !== generation.current) return;
    running.current = undefined; setPending(undefined);
    if (result.kind === "success") {
      retry.current = null; const outcome = result.value;
      if (outcome.kind === "picked") { cycle.current = outcome.cycle; setPhase("active"); }
      else if (outcome.kind === "exhausted") { cycle.current = outcome.cycle; setPhase("exhausted"); }
      else if (outcome.kind === "conflict") { cycle.current = null; setPhase("conflict"); }
      else { cycle.current = null; setPhase("idle"); }
      setView({ kind: "outcome", outcome });
    } else if (result.kind === "failure" && result.error.code === "picker_input") { retry.current = null; cycle.current = null; setPhase("idle"); setView({ kind: "invalid", fields: result.error.fields ?? {} }); }
    else if (result.kind === "failure") setView({ kind: "error", message: result.error.code === "demo_unavailable" ? genericError : `${result.error.message} Your inputs are still here.` });
    else if (result.kind === "stale") { retry.current = null; cycle.current = null; setPhase("idle"); setView({ kind: "stale", message: result.message }); }
    else setView({ kind: "cancelled" });
    announce();
  }
  function suggest(item: PickerSuggestion) {
    if (item.kind === "open_title") onViewDetails(item.titleId);
    else if (inputs?.canAddTitle) focusPanel("mock-entry"); else focusPanel("mock-groups");
  }
  const fields: FieldErrors = view.kind === "invalid" ? view.fields : {};
  const outcome = view.kind === "outcome" ? view.outcome : null;
  const alert = view.kind === "error" || view.kind === "invalid" || view.kind === "stale" || outcome?.kind === "conflict";
  const retrying = view.kind === "error" || view.kind === "cancelled";
  const status = pending && inputs ? pending : view.kind === "error" || view.kind === "stale" ? view.message : outcome?.kind === "conflict" ? outcome.message : view.kind === "invalid" ? fields.form ?? "Review the highlighted choices and try again."
    : view.kind === "cancelled" ? "Pick canceled. Your inputs are still here and no pick was used. Choose Retry pick to continue." : outcome?.kind === "picked" ? "Your suggestion is ready." : outcome?.kind === "exhausted" ? "All matches shown. Choose Start again to begin explicitly."
    : outcome?.kind === "no_match" ? "No match for these settings." : "Choose your viewers, time and mood, then pick.";
  const described = (field: keyof FieldErrors, hint?: string) => [hint, fields[field] ? `mock-picker-${field}-error` : undefined].filter(Boolean).join(" ") || undefined;
  const error = (field: keyof FieldErrors) => fields[field] ? <p className="field-error" id={`mock-picker-${field}-error`}>{fields[field]}</p> : null;
  return <section className={styles.card} aria-labelledby="mock-picker"><h2 id="mock-picker">Pick for me</h2>
    <p>Choose who’s watching, your time and your mood. Get one suggestion from the shared synthetic list. Viewers are separate from your selected profile. Nothing is chosen for you, and picking never changes progress.</p>
    {!inputs && <><div className={styles.controls}><button className="button" disabled={!!pending} onClick={() => void load()}>Load picker</button>{pending && <button ref={cancelButton} className={`button ${styles.secondary}`} onClick={() => { abortRunning(); setLoadMessage({ text: "Picker request canceled. Nothing changed.", alert: false }); announce(); }}>Cancel pick</button>}</div>
      <div ref={feedback} tabIndex={-1} className="picker-feedback" role={loadMessage?.alert ? "alert" : "status"} aria-live="polite">{pending ? pending : loadMessage ? loadMessage.text : announced ? contextChangedMessage : "Select a group, then load the picker."}</div></>}
    {inputs && <>
      <p className="eyebrow">Picking in {inputs.groupName}</p>
      {inputs.viewers.length === 0 ? <div><p>No group members yet. Create a named profile before choosing viewers.</p><button type="button" className="button" onClick={() => focusPanel("mock-groups", 'input[name="profileName"]')}>Create a profile</button></div> : <form className={styles.pickerForm} onSubmit={submit} noValidate aria-busy={!!pending}>
        <fieldset className="mood-choices picker-viewers" aria-describedby={described("viewers")}><legend className="field-label">Who’s watching?</legend>{inputs.viewers.map(member => <label className="color-choice" key={member.id}><input type="checkbox" checked={viewers.includes(member.id)} onChange={event => { const checked = event.target.checked; edit(() => setViewers(previous => checked ? [...previous.filter(id => id !== member.id), member.id] : previous.filter(id => id !== member.id))); }} /><Avatar person={member} /><span className="profile-name">{member.name}</span></label>)}</fieldset>
        {error("viewers")}
        <label className="field-label" htmlFor="mock-picker-time">Available time (whole minutes)</label><input id="mock-picker-time" className="field" type="text" inputMode="numeric" value={minutes} onChange={event => { const value = event.target.value; edit(() => setMinutes(value)); }} aria-invalid={Boolean(fields.availableMinutes)} aria-describedby={described("availableMinutes", "mock-picker-time-hint")} />
        <p id="mock-picker-time-hint" className="field-hint">Enter 1–1440 minutes. Picks use the full movie/video or one typical episode duration.</p>{error("availableMinutes")}
        <div className={styles.controls} role="group" aria-label="Time presets">{presets.map(preset => <button type="button" key={preset.minutes} className={`button ${styles.secondary}`} aria-pressed={minutes === preset.minutes} onClick={() => edit(() => setMinutes(preset.minutes))}>{preset.label}</button>)}</div>
        <fieldset className="mood-choices" aria-describedby={described("mood")}><legend className="field-label">Mood</legend>{fixedMoods.map(item => <label className="color-choice" key={item.value}><input type="radio" name="mock-picker-mood" value={item.value} checked={mood === item.value} onChange={() => edit(() => setMood(item.value))} />{item.label}</label>)}</fieldset>
        {error("mood")}
        <label className="color-choice picker-rewatches"><input type="checkbox" checked={rewatches} aria-describedby={described("rewatches")} onChange={event => { const checked = event.target.checked; edit(() => setRewatches(checked)); }} />Rewatches OK</label>{error("rewatches")}
        <div className="progress-actions"><button className="button" type="submit" disabled={!!pending}>{pending ? "Finding a pick…" : retrying ? "Retry pick" : phase === "active" ? "Pick again" : phase === "exhausted" ? "Start again" : phase === "conflict" ? "Start a new cycle" : "Pick for me"}</button>{pending && <button ref={cancelButton} type="button" className={`button ${styles.secondary}`} onClick={cancel}>Cancel pick</button>}</div>
      </form>}
      <div ref={feedback} tabIndex={-1} className="form-feedback picker-feedback" role={alert ? "alert" : "status"} aria-live="polite">{status}</div>
      {outcome?.refreshed && <p className="notice" role="status">List changed; picks refreshed.</p>}
      {!pending && outcome?.kind === "picked" && <MockPickResult pick={outcome.candidate} onViewDetails={onViewDetails} />}
      {!pending && outcome?.kind === "exhausted" && <section className="group-result" aria-labelledby="mock-pick-exhausted"><h3 id="mock-pick-exhausted">All matches shown</h3><p>You’ve seen every match in this tier. Choose Start again to begin a freshly checked cycle. No other tier has been added.</p></section>}
      {!pending && outcome?.kind === "conflict" && <section className="group-result" aria-labelledby="mock-pick-conflict"><h3 id="mock-pick-conflict">Start a new picking cycle</h3><p>{outcome.message}</p><p>Your choices are still here. Use Start a new cycle above to begin explicitly.</p></section>}
      {!pending && outcome?.kind === "no_match" && <section className="group-result" aria-labelledby="mock-no-pick"><h3 id="mock-no-pick">No match</h3><p>{outcome.message}</p><ul aria-label="No-match reasons">{outcome.reasons.map(reason => <li key={reason.code}>{reason.label}</li>)}</ul><p>Edit the choices above and submit again. Your settings haven’t changed.</p><div className="progress-actions">{outcome.suggestions.map(item => <button type="button" key={item.kind} className={`button ${styles.secondary}`} onClick={() => suggest(item)}>{item.label}</button>)}</div></section>}
    </>}
  </section>;
}
