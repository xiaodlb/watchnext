"use client";
import { useEffect, useRef, useState } from "react";
import { createMockService, pendingDomains } from "../../frontend/mock/service";
import type { ContextIdentity, MockContext, MockScenario, SelectionResult, ServiceResult } from "../../frontend/service/contracts";
import { MockEntryForm } from "./entry";
import { MockLibrary } from "./library";
import { MockGroups } from "./groups";
import { MockAccounts } from "./accounts";
import { MockPicker } from "./picker";
import styles from "./preview.module.css";
type View = { kind: "idle" } | { kind: "pending"; action: "load" | "reset" } | ServiceResult<MockContext>;
function Notice() {
  return <aside className={styles.notice} aria-label="Synthetic demo notice"><strong>Synthetic demo only</strong><p>This preview uses temporary sample state, not real authentication or your saved watchlist.</p></aside>;
}
export function MockEntry({ selection, filter }: { selection: SelectionResult; filter?: unknown }) {
  return <div className={styles.preview}><Notice /><header className={styles.heading}><p className="eyebrow">A safe place to preview</p><h1>WatchNext preview</h1><p>Try synthetic accounts and the preview foundation. Your real groups and watchlist stay separate.</p></header>{selection.kind === "failure" ? <section className={styles.card}><p role="alert">{selection.error.message}</p><ul>{Object.values(selection.error.fields ?? {}).map(message => <li key={message}>{message}</li>)}</ul><a href="/mock">Open the default mock preview</a></section> : <Preview scenario={selection.value.scenario} filter={filter} />}</div>;
}
function Preview({ scenario: initialScenario, filter }: { scenario: MockScenario; filter?: unknown }) {
  const [service] = useState(createMockService);
  const [entryEpoch,setEntryEpoch]=useState(0);
  const [libraryEpoch, setLibraryEpoch] = useState(0);
  const [groupEpoch, setGroupEpoch] = useState(0);
  const [accountEpoch, setAccountEpoch] = useState(0);
  const [scenario, setScenario] = useState<MockScenario>(initialScenario);
  const [view, setView] = useState<View>({ kind: "idle" });
  const [context, setContext] = useState<MockContext>();
  const identity = useRef<ContextIdentity>(service.context.initialIdentity);
  const running = useRef<AbortController | undefined>(undefined);
  const sequence = useRef(0);
  const feedback = useRef<HTMLParagraphElement>(null);
  // #60: the picker is remounted (clearing selections, result and cycle) only when the context revision changes or Reset starts;
  // library, entry and personal mutations keep it mounted so its next action reports "List changed; picks refreshed.".
  const [pickerEpoch, setPickerEpoch] = useState(0), pickerRevision = useRef(identity.current.revision);
  const [openTitle, setOpenTitle] = useState<{ id: string; nonce: number }>();
  const syncPicker = (force = false) => { if (force || identity.current.revision !== pickerRevision.current) { pickerRevision.current = identity.current.revision; setPickerEpoch(value => value + 1); } };
  useEffect(() => () => { sequence.current++; running.current?.abort(); }, []);
  useEffect(() => { if (view.kind !== "idle" && view.kind !== "pending") feedback.current?.focus(); }, [view]);
  function cancel() {
    sequence.current++; running.current?.abort(); running.current = undefined;
    setView({ kind: "cancelled", message: "Preview request canceled. No demo state was changed." });
  }
  async function run(action: "load" | "reset") {
    const current = ++sequence.current;
    running.current?.abort(); const controller = new AbortController(); running.current = controller;
    if (action === "reset") { setAccountEpoch(value => value + 1); setGroupEpoch(value => value + 1); setLibraryEpoch(value => value + 1); setEntryEpoch(value=>value+1); syncPicker(true); }
    setView({ kind: "pending", action });
    const result = action === "load" ? await service.context.read({ scenario, signal: controller.signal }) : await service.context.reset(identity.current, { signal: controller.signal });
    if (current !== sequence.current) return;
    running.current = undefined;
    if (result.kind === "success") { identity.current = result.context; pickerRevision.current = result.context.revision; setContext(result.value); }
    setView(result);
  }
  const pending = view.kind === "pending";
  const message = view.kind === "idle" ? "Load the synthetic preview to begin." : view.kind === "pending" ? view.action === "reset" ? "Resetting only this demo…" : "Loading the synthetic preview…" : view.kind === "success" ? "Synthetic preview ready." : view.kind === "failure" ? view.error.message : view.message;
  return <><section className={styles.card} aria-labelledby="preview-controls"><h2 id="preview-controls">Try the preview</h2><p>Choose a simulated response, then load the preview. Reset affects only this open preview’s temporary state. Reloading starts a fresh demo; nothing is saved to browser storage.</p><label className={styles.field}>Simulated response<select className="field" value={scenario} onChange={event => { if (pending) cancel(); setScenario(event.target.value as MockScenario); }}><option value="ready">Ready</option><option value="slow">Slow</option><option value="unavailable">Unavailable</option></select></label><div className={styles.controls}><button className="button" disabled={pending} onClick={() => void run("load")}>Load preview</button><button className={`button ${styles.secondary}`} disabled={pending && view.action === "reset"} onClick={() => void run("reset")}>Reset demo</button>{pending && <button className={`button ${styles.secondary}`} onClick={cancel}>Cancel request</button>}</div><p role={view.kind === "failure" || view.kind === "stale" ? "alert" : "status"} tabIndex={-1} ref={feedback} aria-live="polite">{message}</p>{context && <div className={styles.context} aria-label="Synthetic context"><h3>{context.label}</h3><p>Demo revision: {context.identity.revision}</p><p>{context.account ? `Synthetic account: ${context.account.username}` : "No account is signed in."}</p><p>{context.group ? `Selected synthetic ${context.group.kind} group: ${context.group.name}` : "No synthetic group is selected."} Use the groups panel below to create, resolve or select a group.</p></div>}</section><MockAccounts key={`accounts-${accountEpoch}`} service={service} identity={identity} scenario={scenario} changed={value => { setContext(value); setGroupEpoch(epoch => epoch + 1); setLibraryEpoch(epoch => epoch + 1); setEntryEpoch(epoch=>epoch+1); syncPicker(); }} departed={() => { setGroupEpoch(epoch => epoch + 1); setLibraryEpoch(epoch => epoch + 1); setEntryEpoch(epoch=>epoch+1); syncPicker(); }} /><MockGroups key={`groups-${groupEpoch}`} service={service} identity={identity} scenario={scenario} changed={() => { setContext(undefined); setAccountEpoch(epoch => epoch + 1); setLibraryEpoch(epoch => epoch + 1); setEntryEpoch(epoch=>epoch+1); syncPicker(); }} /><MockEntryForm key={`entry-${entryEpoch}`} service={service} identity={identity} scenario={scenario} changed={()=>setLibraryEpoch(epoch=>epoch+1)} /><MockLibrary key={`library-${libraryEpoch}`} service={service} identity={identity} scenario={scenario} initialFilter={filter} invalidated={libraryEpoch > 0} openTitle={openTitle} /><MockPicker key={`picker-${pickerEpoch}`} service={service} identity={identity} scenario={scenario} announced={pickerEpoch > 0} onViewDetails={id => setOpenTitle(previous => ({ id, nonce: (previous?.nonce ?? 0) + 1 }))} />{pendingDomains.length > 0 && <section className={styles.card} aria-labelledby="upcoming-previews"><h2 id="upcoming-previews">Upcoming previews</h2><p>These screens are not available in this foundation.</p><ul className={styles.domains}>{pendingDomains.map(domain => <li key={domain.key}><strong>{domain.label}</strong><span>Not available yet</span></li>)}</ul></section>}</>;
}
