"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MetadataFields, type MetadataValues } from "../title-fields";
import { type TitleFormState } from "../../../lib/title-state";
import { LookupPanel } from "./lookup-panel";
import { reviewValues } from "../../../lib/metadata/review-values";
import { Cover } from "../cover";
import type { MetadataItem } from "../../../lib/metadata/types";
import type { ReviewResult } from "../../../lib/metadata/reviews";

const initialValues: MetadataValues = { title: "", contentType: "movie", minutes: "", seconds: "", numberingStyle: "", genres: "", watchUrl: "", sourceUrl: "", coverUrl: "" };
export function TitleForm({ action, lookup, select, page }: { action: (previous: TitleFormState, form: FormData) => Promise<TitleFormState>; lookup?: (form: FormData) => Promise<ReviewResult>; select?: (form: FormData) => Promise<ReviewResult>; page?: (form: FormData) => Promise<ReviewResult> }) {
  const [state, submit, pending] = useActionState(action, { kind: "idle" });
  const [values, setValues] = useState<MetadataValues>(initialValues);
  const [moods, setMoods] = useState<string[]>([]);
  const [reviewHandle, setReviewHandle] = useState<string | null>(null);
  const [typicalConfirmed, setTypicalConfirmed] = useState(false);
  const revision = useRef(0), baseline = useRef(initialValues), current = useRef(values), saving = useRef(false);
  current.current = values;
  const [lookupReset,setLookupReset]=useState(0),[resetConfirm,setResetConfirm]=useState(false);
  const [selected,setSelected]=useState<MetadataItem|null>(null);
  const [replacement,setReplacement]=useState<{handle:string;item:MetadataItem;revision:number;focus:boolean}|null>(null);
  const reviewFocus=useRef<HTMLElement>(null),replacementFocus=useRef<HTMLElement>(null);
  useEffect(()=>{if(reviewHandle)reviewFocus.current?.focus();},[reviewHandle]);
  useEffect(()=>{if(replacement?.focus)replacementFocus.current?.focus();},[replacement]);
  const dirty=()=>JSON.stringify(current.current)!==JSON.stringify(baseline.current);
  useEffect(()=>{if(!pending)saving.current=false;},[pending,state]);
  const [dismissed, setDismissed] = useState<TitleFormState | null>(null);
  const confirming = (state.kind === "confirmation" || state.kind === "restore_confirmation") && state !== dismissed;
  const errors = state.kind === "invalid" ? state.errors : {};
  const update = (field: keyof typeof values, value: string) => { revision.current++; setResetConfirm(false); setReplacement(null); if (field === "contentType" || field === "minutes" || field === "seconds") setTypicalConfirmed(false); setValues((previous) => ({ ...previous, ...(reviewHandle && field === "contentType" && ["series", "anime"].includes(previous.contentType) !== ["series", "anime"].includes(value) ? { minutes: "", seconds: "", numberingStyle: "" } : {}), [field]: value })); };
  function apply(handle:string,item:MetadataItem) {
    const next=reviewValues(item);revision.current++;current.current=next;baseline.current=next;setValues(next);setReviewHandle(handle);setSelected(item);setReplacement(null);setResetConfirm(false);setTypicalConfirmed(false);setDismissed(state);
  }
  function receive(handle:string,item:MetadataItem,started:number) {
    if(saving.current)return;
    if(dirty()||revision.current!==started)setReplacement({handle,item,revision:revision.current,focus:started===revision.current});else apply(handle,item);
  }
  function freshManual(){
    revision.current++;current.current=initialValues;baseline.current=initialValues;setValues(initialValues);setMoods([]);setReviewHandle(null);setSelected(null);setReplacement(null);setTypicalConfirmed(false);setDismissed(state);setResetConfirm(false);setLookupReset(value=>value+1);
  }
  // Keep controlled fields across action errors and never attach a late identity to edits.
  return <>{lookup && select && <fieldset className="form-fields source-search-surface" disabled={pending}><legend className="visually-hidden">Optional metadata lookup</legend><LookupPanel lookup={lookup} select={select} page={page} revision={()=>revision.current} invalidate={()=>setReplacement(null)} reset={lookupReset} apply={receive}/></fieldset>}
    {replacement&&<section ref={replacementFocus} tabIndex={-1} className="save-confirmation" aria-labelledby="replace-heading"><h3 id="replace-heading">Replace your edited details?</h3><p>Use {replacement.item.title??"the selected title"} instead? This replaces title, type, runtime, numbering, genres and links. Your moods stay.</p><button className="button" type="button" disabled={pending} onClick={()=>{if(!saving.current&&replacement.revision===revision.current)apply(replacement.handle,replacement.item);else setReplacement(null);}}>Replace details</button>{" "}<button className="button button-secondary" type="button" disabled={pending} onClick={()=>setReplacement(null)}>Keep my details</button></section>}
    {reviewHandle&&<section ref={reviewFocus} tabIndex={-1} className="lookup-review" aria-label="Selected lookup review"><Cover url={values.coverUrl} title={values.title} video={values.contentType==="youtube"}/><div><h3>Review your selected title</h3><p>{selected?.channelTitle??(selected?.year?`Year ${selected.year}`:"")}</p><p>A lookup review is active for 10 minutes. Edit any detail before saving; choose your own moods.</p>{selected?.duration.interpretation==="app_minutes_to_seconds"&&<p>Movie runtime interprets the supplied number as minutes. Check and edit it if needed.</p>}{!values.minutes&&!values.seconds&&<p>Runtime is unknown. Enter a finite duration before saving.</p>}<button className="button button-secondary" type="button" disabled={pending} onClick={()=>{if(dirty())setResetConfirm(true);else freshManual();}}>Start a fresh manual entry (clear details)</button></div></section>}
    {resetConfirm&&<section className="save-confirmation" aria-label="Clear edited details"><p>Clear your edited details, moods and imported identity to start manually?</p><button className="button" type="button" disabled={pending} onClick={freshManual}>Clear details and start manually</button>{" "}<button className="button button-secondary" type="button" disabled={pending} onClick={()=>setResetConfirm(false)}>Keep editing</button></section>}
    <form id="source-manual-entry" className="source-manual-card" action={submit} onSubmit={()=>{saving.current=true;setReplacement(null);setResetConfirm(false);setLookupReset(value=>value+1);}} onReset={event=>event.preventDefault()} noValidate aria-busy={pending}>
    <h2 className="source-manual-title">Or add it yourself</h2>
    {reviewHandle && <input type="hidden" name="reviewHandle" value={reviewHandle} />}
    <fieldset className="form-fields" disabled={pending}>
      <legend className="visually-hidden">Manual title details</legend>
      <MetadataFields values={values} moods={moods} update={update} setMoods={setMoods} errors={errors} sourceFields={Boolean(reviewHandle)} />
      {reviewHandle && ["series", "anime"].includes(values.contentType) && <label className="color-choice"><input type="checkbox" name="typicalDurationConfirmed" value="yes" checked={typicalConfirmed} onChange={event => setTypicalConfirmed(event.target.checked)} />I confirm this is a typical episode duration</label>}
      {confirming && <section className="save-confirmation" aria-labelledby="confirmation-heading"><h3 id="confirmation-heading">{state.kind === "restore_confirmation" ? "Restore this saved title?" : "Is this the title you meant?"}</h3><p className="saved-title-name">{state.title}</p><p>{state.message}</p>
        <input type="hidden" name="confirmationId" value={state.id} />
        <button className="button" type="submit" name="intent" value="confirm">{state.kind === "restore_confirmation" ? "Restore to watchlist" : "Add my name to this title"}</button>{" "}<button className="button button-secondary" type="button" onClick={() => setDismissed(state)}>Return to editing</button>
      </section>}
      {!confirming && <button className="button" type="submit" name="intent" value="save">{pending ? "Saving title…" : "Save title"}</button>}
    </fieldset>
    <p role={state.kind === "error" ? "alert" : "status"} className={state.kind === "error" ? "field-error" : "form-feedback"}>{pending ? "Saving your title…" : state.kind === "error" || state.kind === "already_added" || state.kind === "conflict" ? state.message : confirming ? "Please confirm the existing title or return to editing." : "Add something you’ve been meaning to watch."}</p>
    {(state.kind === "already_added" || state.kind === "conflict") && state.id && <Link href={`/watchlist/${encodeURIComponent(state.id)}`}>View existing details</Link>}
  </form></>;
}
