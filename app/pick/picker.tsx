"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { contentTypes, durationLabel, fixedMoods } from "../../lib/title-state";
import { initials } from "../../lib/profile-state";
import type { Profile } from "../../lib/profile-state";
import type { PickerPageView, PickAction, PickState, PickView } from "../../lib/picker/view-state";
import { Cover } from "../watchlist/cover";
function People({ members }: { members: Profile[] }) { return <ul className="contributor-list">{members.map(member => <li key={member.id}><span className="avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{initials(member.name)}</span><span className="profile-name">{member.name}</span></li>)}</ul>; }
const sourceTimes = [20, 45, 90, 150] as const;
export function PickResult({ pick }: { pick: PickView }) {
  const episodic = pick.target.kind === "episode";
  return <section className="group-result source-pick-result" aria-labelledby="pick-result-heading"><Cover url={pick.coverUrl ?? null} title={pick.title} video={pick.contentType === "youtube"}/><div><p className="status-label">{pick.tier === "exact" ? "Tonight’s pick" : "Alternative suggestion"}</p><h2 id="pick-result-heading">{pick.title}</h2>
    <p>{contentTypes.find(type => type.value === pick.contentType)?.label} · {episodic ? "Typical episode duration" : "Full duration"}: {durationLabel(pick.durationSeconds)}</p>
    <p className={pick.tier === "exact" ? "form-feedback" : "notice"}>{pick.message}</p>
    {pick.target.kind === "episode" && <><p className="saved-title-name">{pick.target.nextSeason === null ? `Episode ${pick.target.nextEpisode}` : `Season ${pick.target.nextSeason}, episode ${pick.target.nextEpisode}`}</p>{pick.target.restart && <p>Restart from the first episode.</p>}{pick.target.catchUp && <p>Catch-up episode for the least advanced viewer.</p>}</>}
    {pick.rewatchers.length > 0 && <div><h3>Rewatching</h3><People members={pick.rewatchers} /></div>}
    <h3>Watching together</h3><People members={pick.viewers} /><p>Requested: {pick.availableMinutes} minutes · {pick.requestedMood} · Rewatches {pick.rewatches ? "OK" : "off"}</p>
    <div className="progress-actions"><Link className="button button-secondary" href={`/watchlist/${encodeURIComponent(pick.id)}`}>View details</Link>{pick.watchUrl ? <a className="button" href={pick.watchUrl} target="_blank" rel="noopener noreferrer">{episodic ? "Open series (external)" : "Watch (external)"}</a> : <p>No viewing link saved.</p>}</div>
    <p className="field-hint">External watching does not update progress. Update your own progress in details.</p></div>
  </section>;
}
export function Picker({ view, action }: { view: PickerPageView; action: PickAction }) {
  const [viewers, setViewers] = useState<string[]>([]), [minutes, setMinutes] = useState(""), [mood, setMood] = useState(""), [rewatches, setRewatches] = useState(false);
  const [state, setState] = useState<PickState>({ kind: "idle" }), [pending, setPending] = useState(false), [pendingLabel, setPendingLabel] = useState("");
  const generation = useRef(0), active = useRef(""), group = useRef(view.groupId), feedback = useRef<HTMLDivElement>(null);
  const page = useRef(crypto.randomUUID()), cursor = useRef("");
  const retry = useRef<{ pageId: string; intentId: string; intent: "start" | "next" | "restart"; cursor: string } | null>(null);
  const [phase, setPhase] = useState<"idle" | "active" | "exhausted" | "conflict">("idle");
  const reset = () => { page.current = crypto.randomUUID(); cursor.current = ""; retry.current = null; setPhase("idle"); };
  useEffect(() => { group.current = view.groupId; generation.current++; active.current = ""; setPending(false); setState({ kind: "idle" }); setViewers([]); reset(); }, [view.groupId]);
  const changed = () => { generation.current++; setState({ kind: "idle" }); reset(); };
  const response = state.kind === "idle" || state.groupId !== view.groupId ? null : state;
  const errors = response?.kind === "invalid" ? response.errors : {};
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (active.current) return;
    const requestId = crypto.randomUUID(), version = generation.current, currentGroup = view.groupId;
    if (phase === "conflict") reset();
    const logical = retry.current ?? { pageId: page.current, intentId: crypto.randomUUID(), intent: phase === "active" ? "next" as const : phase === "exhausted" ? "restart" as const : "start" as const, cursor: cursor.current };
    retry.current = logical;
    active.current = requestId; setPending(true); setState({ kind: "idle" });
    setPendingLabel(`Finding a pick for ${viewers.map(id => view.members.find(member => member.id === id)?.name ?? "unavailable viewer").join(", ") || "your selected viewers"} · ${minutes || "no time selected"} minutes · ${fixedMoods.find(item => item.value === mood)?.label ?? "no mood selected"} · Rewatches ${rewatches ? "OK" : "off"}…`);
    const form = new FormData(); form.set("groupId", currentGroup); form.set("requestId", requestId); viewers.forEach(id => form.append("viewers", id)); form.set("availableMinutes", minutes); form.set("mood", mood); if (rewatches) form.set("rewatches", "yes");
    form.set("pageId", logical.pageId); form.set("intentId", logical.intentId); form.set("intent", logical.intent); if (logical.cursor) form.set("cursor", logical.cursor);
    try {
      const result = await action(form);
      if (active.current === requestId && generation.current === version && group.current === currentGroup && result.kind !== "idle" && result.requestId === requestId && result.groupId === currentGroup) {
        if ((result.kind === "picked" || result.kind === "exhausted") && (result.pageId !== logical.pageId || result.intentId !== logical.intentId)) return;
        if (result.kind !== "error") retry.current = null;
        if (result.kind === "picked" && result.cursor) { cursor.current = result.cursor; setPhase("active"); }
        else if (result.kind === "exhausted") { cursor.current = result.cursor; setPhase("exhausted"); }
        else if (result.kind === "conflict") { cursor.current = ""; setPhase("conflict"); }
        else if (result.kind === "invalid" || result.kind === "no_match") reset();
        setState(result); requestAnimationFrame(() => feedback.current?.focus());
      }
    } catch {
      if (active.current === requestId && generation.current === version && group.current === currentGroup) { setState({ kind: "error", groupId: currentGroup, requestId, message: "We couldn’t pick right now. Your inputs are still here. Please try again." }); requestAnimationFrame(() => feedback.current?.focus()); }
    } finally { if (active.current === requestId) { active.current = ""; setPending(false); } }
  }
  return <div className="page-content picker-page source-picker-page"><div className="page-heading"><h1>Pick for me</h1><p className="page-introduction">One suggestion from your list. No endless scrolling.</p><p className="source-save-context">{view.groupName} · Choose who’s watching, your time and your mood.</p></div>
    <section className="placeholder source-picker-card" aria-labelledby="picker-controls-heading"><h2 className="visually-hidden" id="picker-controls-heading">Plan this watch</h2>
    {view.members.length === 0 ? <div><p>No group members yet. Create a named profile before choosing viewers.</p><Link className="button" href="/group">Create a profile</Link></div> : <form onSubmit={submit} noValidate aria-busy={pending}>
      <fieldset className="mood-choices picker-viewers" aria-describedby={errors.viewers ? "picker-viewers-error" : undefined}><legend className="field-label">Who’s watching?</legend>{view.members.map(member => <label className="color-choice" key={member.id}><input type="checkbox" checked={viewers.includes(member.id)} onChange={event => { changed(); setViewers(previous => event.target.checked ? [...previous, member.id] : previous.filter(id => id !== member.id)); }} /><span className="avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{initials(member.name)}</span><span className="profile-name">{member.name}</span></label>)}</fieldset>
      {errors.viewers && <p className="field-error" id="picker-viewers-error">{errors.viewers}</p>}
      <fieldset className="source-picker-choices"><legend className="field-label">How much time do you have?</legend><div className="source-picker-chip-row">{sourceTimes.map(time => <button key={time} type="button" className="source-picker-chip" aria-pressed={minutes === String(time)} onClick={() => { changed(); setMinutes(String(time)); }}>{time < 60 ? `${time} min` : `${Math.floor(time / 60)} h ${time % 60 ? `${time % 60} min` : ""}`.trim()}</button>)}<label className="source-exact-time" htmlFor="picker-time">or <span className="visually-hidden">Available time (whole minutes)</span><input id="picker-time" className="field" type="text" inputMode="numeric" aria-label="Available time (whole minutes)" value={minutes} onChange={event => { changed(); setMinutes(event.target.value); }} aria-invalid={Boolean(errors.availableMinutes)} aria-describedby={errors.availableMinutes ? "picker-time-hint picker-time-error" : "picker-time-hint"} /> min</label></div><p id="picker-time-hint" className="field-hint">Enter 1–1440 minutes. Picks use the full movie/video or one typical episode duration.</p>{errors.availableMinutes && <p className="field-error" id="picker-time-error">{errors.availableMinutes}</p>}</fieldset>
      <fieldset className="source-picker-choices"><legend className="field-label">What’s the mood?</legend><label className="visually-hidden" htmlFor="picker-mood">Mood</label><select id="picker-mood" className="field visually-hidden" value={mood} onChange={event => { changed(); setMood(event.target.value); }} aria-invalid={Boolean(errors.mood)} aria-describedby={errors.mood ? "picker-mood-error" : undefined}><option value="">Choose a mood</option>{fixedMoods.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select><div className="source-picker-chip-row">{fixedMoods.map(item => <button key={item.value} type="button" className="source-picker-chip" aria-pressed={mood === item.value} onClick={() => { changed(); setMood(item.value); }}>{item.label}</button>)}</div>{errors.mood && <p id="picker-mood-error" className="field-error">{errors.mood}</p>}</fieldset>
      <label className="color-choice picker-rewatches"><input type="checkbox" checked={rewatches} aria-describedby={errors.rewatches ? "picker-rewatches-error" : undefined} onChange={event => { changed(); setRewatches(event.target.checked); }} />Rewatches OK</label>{errors.rewatches && <p className="field-error" id="picker-rewatches-error">{errors.rewatches}</p>}
      <div className="progress-actions"><button className="button" type="submit" disabled={pending}>{pending ? "Finding a pick…" : response?.kind === "error" ? "Retry pick" : phase === "active" ? "Pick again" : phase === "exhausted" ? "Start again" : phase === "conflict" ? "Start a new cycle" : "Pick for me"}</button><Link href="/group">Manage profiles</Link><Link href={view.hasActiveProfile ? "/watchlist/add" : "/group"}>{view.hasActiveProfile ? "Add a title" : "Choose profile to add a title"}</Link></div>
    </form>}
    <div ref={feedback} tabIndex={-1} className="form-feedback picker-feedback" role={response?.kind === "error" || response?.kind === "invalid" || response?.kind === "conflict" ? "alert" : "status"} aria-live="polite">{pending ? pendingLabel : response?.kind === "error" || response?.kind === "conflict" ? response.message : response?.kind === "invalid" ? errors.form ?? "Review the highlighted choices and try again." : response?.kind === "picked" ? "Your suggestion is ready." : response?.kind === "exhausted" ? "All matches shown. Choose Start again to begin explicitly." : response?.kind === "no_match" ? "No match for these settings." : "Choose your viewers, time and mood, then pick."}</div>
    </section>
    {response && "refreshed" in response && response.refreshed && <p className="notice" role="status">List changed; picks refreshed.</p>}
    {!pending && response?.kind === "picked" && <PickResult pick={response.pick} />}
    {!pending && response?.kind === "exhausted" && <section className="group-result"><h2>All matches shown</h2><p>You’ve seen every match in this tier. Choose Start again to begin a freshly checked cycle. No other tier has been added.</p></section>}
    {!pending && response?.kind === "conflict" && <section className="group-result"><h2>Start a new picking cycle</h2><p>{response.message}</p><p>Your choices are still here. Use Start a new cycle above to begin explicitly.</p></section>}
    {!pending && response?.kind === "no_match" && <section className="group-result" aria-labelledby="no-pick-heading"><h2 id="no-pick-heading">No match</h2><p>{response.message}</p><ul>{response.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul><p>Edit the choices above and submit again. Your settings haven’t changed.</p><div className="progress-actions">{response.links.map(link => <Link key={link.href} className="button button-secondary" href={link.href}>{link.label}</Link>)}</div></section>}
    {response?.kind === "error" && <p><Link href="/group">Reload group and profiles</Link></p>}
  </div>;
}
