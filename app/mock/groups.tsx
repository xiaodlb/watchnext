"use client";
import { useEffect, useRef, useState } from "react";
import { avatarColors } from "../../frontend/service/contracts";
import type { AvatarColor, ContextIdentity, FrontendService, GroupWorkspace, InviteDisclosure, MockScenario, ServiceResult } from "../../frontend/service/contracts";
import styles from "./preview.module.css";
type Confirmation = { kind: "remove"; id: string; generation: number; name: string } | { kind: "rotate"; generation: number };
export function MockGroups({ service, identity, scenario, real: _real, changed }: { service: FrontendService; identity: {current: ContextIdentity}; scenario: MockScenario; real?: boolean; changed: () => void }) {
  const [workspace, setWorkspace] = useState<GroupWorkspace>();
  const [reveal, setReveal] = useState<InviteDisclosure>();
  const [confirmation, setConfirmation] = useState<Confirmation>();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("Load synthetic groups to see current access.");
  const [copied, setCopied] = useState("");
  const running = useRef<AbortController | undefined>(undefined), sequence = useRef(0), feedback = useRef<HTMLParagraphElement>(null), inviteForm = useRef<HTMLFormElement>(null);
  const confirmContext = useRef<ContextIdentity | undefined>(undefined);
  function discard() { setReveal(undefined); setCopied(""); setConfirmation(undefined); inviteForm.current?.reset(); }
  function cancel() { sequence.current++; running.current?.abort(); running.current = undefined; setPending(false); inviteForm.current?.reset(); setMessage("Group request canceled. No change was committed."); }
  useEffect(() => {
    const leave = () => { sequence.current++; running.current?.abort(); running.current = undefined; setPending(false); discard(); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) leave(); };
    window.addEventListener("pagehide", leave); window.addEventListener("pageshow", restore);
    return () => { sequence.current++; running.current?.abort(); window.removeEventListener("pagehide", leave); window.removeEventListener("pageshow", restore); };
  }, []);
  useEffect(() => { if (running.current) cancel(); }, [scenario]);
  useEffect(() => { if (message !== "Load synthetic groups to see current access." && !pending) feedback.current?.focus(); }, [message, pending]);
  async function run(operation: (expected: ContextIdentity, options: { scenario: MockScenario; signal: AbortSignal }) => Promise<ServiceResult<GroupWorkspace | InviteDisclosure>>, captured?: ContextIdentity) {
    if (running.current) return;
    discard(); const n = ++sequence.current, controller = new AbortController(); running.current = controller;
    setPending(true); setMessage("Waiting for synthetic group response…");
    const result = await operation(captured ?? identity.current, { scenario, signal: controller.signal });
    if (n !== sequence.current) return;
    running.current = undefined; setPending(false); inviteForm.current?.reset();
    if (result.kind !== "success") { setMessage(result.kind === "failure" ? result.error.message : result.message); return; }
    identity.current = result.context; changed();
    if ("invite" in result.value) { setReveal(result.value); setWorkspace(undefined); setMessage("Save this private synthetic invite now. It works only in this mounted preview."); }
    else { setWorkspace(result.value); setMessage("Synthetic group context ready."); }
  }
  function confirm(value: Confirmation) { discard(); confirmContext.current = identity.current; setConfirmation(value); setMessage("Review the named confirmation before proceeding."); }
  const g = service.groups;
  return <section className={styles.card} aria-labelledby="mock-groups"><h2 id="mock-groups">{_real ? "Groups and legacy access" : "Synthetic groups and legacy access"}</h2><p>{_real ? "Create and join groups through the current HTTP session. Legacy profiles remain separate from account identity." : "Invites work only inside this temporary preview. No real links, shared browser sessions or account/profile conversion. Seeded owner: Demo.Owner / synthetic password."}</p>
    <div className={styles.controls}><button className="button" disabled={pending} onClick={() => void run((_, options) => g.read(options))}>Load groups</button><button className={`button ${styles.secondary}`} disabled={pending} onClick={() => void run((expected, options) => g.mode("account", expected, options))}>Account groups</button><button className={`button ${styles.secondary}`} disabled={pending} onClick={() => void run((expected, options) => g.mode("legacy", expected, options))}>Separate legacy mode</button></div>
    <form className={styles.form} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget), name = String(data.get("groupName") ?? ""); void run((expected, options) => workspace?.mode === "legacy" ? g.createLegacy(name, expected, options) : g.create(name, expected, options)); }}><label className={styles.field}>New group name<input className="field" name="groupName" required /></label><button className="button" disabled={pending}>Create {workspace?.mode === "legacy" ? "legacy" : "account"} group</button></form>
    <form ref={inviteForm} className={styles.form} onSubmit={event => { event.preventDefault(); const invite = String(new FormData(event.currentTarget).get("invite") ?? ""); void run((expected, options) => g.resolve(invite, expected, options)); }}><label className={styles.field}>Synthetic invite<input className="field" name="invite" type="password" autoComplete="off" required /></label><button className="button" disabled={pending}>Resolve synthetic invite</button></form>
    {reveal && <div className={styles.form}><h3>One-time synthetic invite</h3><p>Save before leaving. Discarded values cannot be retrieved. Clipboard copies cannot be erased by this app.</p><label className={styles.field}>Private synthetic invite<input className="field" readOnly value={reveal.invite} onFocus={event => event.currentTarget.select()} /></label><button className="button" onClick={() => { void navigator.clipboard?.writeText(reveal.invite).then(() => setCopied("Copied explicitly."), () => setCopied("Select the invite and copy manually.")); if (!navigator.clipboard) setCopied("Select the invite and copy manually."); }}>Copy invite</button><p role="status">{copied || "Select the invite to copy manually."}</p><button className="button" onClick={() => void run((_, options) => g.read(options))}>Continue to groups</button></div>}
    {workspace && <div className={styles.form}><p>Mode: {workspace.mode === "account" ? "Account groups" : "Separate legacy"}</p>
      {workspace.pending && <div><h3>Pending synthetic invitation</h3><p>{workspace.pending.needsAccount ? "Sign in or register above, then load groups and explicitly Join. The anonymous preview does not reveal a private group name." : `Ready to join: ${workspace.pending.groupName}`}</p><button className="button" disabled={pending || workspace.pending.needsAccount} onClick={() => void run((expected, options) => g.join(expected, options))}>Join pending group</button></div>}
      {workspace.mode === "account" && <><h3>Your active memberships</h3>{workspace.memberships.length ? <ul>{workspace.memberships.map(group => <li key={group.id}><button className={`button ${styles.secondary}`} disabled={pending} onClick={() => void run((expected, options) => g.select(group.id, expected, options))}>Select {group.name}</button></li>)}</ul> : <p>No active account memberships. Sign in, create a group or resolve a current invite.</p>}</>}
      {workspace.selected ? <><h3>Selected group: {workspace.selected.name}</h3><p>Invitation generation: {workspace.selected.generation}</p><h4>{workspace.mode === "legacy" ? "Same-group profiles" : "Group members"}</h4>{workspace.members.length ? <ul>{workspace.members.map(member => <li key={member.id}><span className={styles.member} style={{ backgroundColor: `var(--avatar-${member.color})` }}>{member.name}</span> {member.owner && "Creator · "}{member.you && "You · "}{member.active ? "Active" : "Inactive"}{workspace.canManage && !member.owner && member.active && <button className={`button ${styles.secondary}`} disabled={pending} onClick={() => confirm({kind:"remove",id:member.id,generation:member.generation,name:member.name})}>Remove {member.name}</button>}{workspace.mode === "legacy" && <button className={`button ${styles.secondary}`} disabled={pending} onClick={() => void run((expected, options) => g.selectProfile(member.id, expected, options))}>Use profile {member.name}</button>}</li>)}</ul> : <p>No profiles yet. Create the first profile.</p>}
        {workspace.canManage && <button className={`button ${styles.secondary}`} disabled={pending} onClick={() => confirm({kind:"rotate",generation:workspace.selected!.generation})}>Rotate synthetic invite</button>}
        {workspace.mode === "legacy" && <><p>{workspace.profileId ? "A same-group legacy profile is selected." : "No active legacy profile."}</p><form className={styles.form} onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); void run((expected, options) => g.createProfile(String(data.get("profileName") ?? ""), String(data.get("color")) as AvatarColor, expected, options)); }}><label className={styles.field}>Legacy profile name<input className="field" name="profileName" required /></label><label className={styles.field}>Avatar color<select className="field" name="color">{avatarColors.map(color => <option key={color} value={color}>{color}</option>)}</select></label><button className="button" disabled={pending}>Create and select profile</button></form></>}
      </> : <p>No selected group. Legacy groups require explicit invite resolution.</p>}
    </div>}
    {confirmation && <div className={styles.notice} role="group" aria-label="Group action confirmation"><p>{confirmation.kind === "remove" ? `Remove ${confirmation.name}? Their contribution and history references remain unchanged.` : `Rotate the invite for ${workspace?.selected?.name}? Existing participants stay active; old invitations stop working.`}</p><button className="button" disabled={pending} onClick={() => { const value = confirmation; void run((expected, options) => value.kind === "remove" ? g.remove(value.id, value.generation, expected, options) : g.rotate(value.generation, expected, options), confirmContext.current); }}>Confirm {confirmation.kind === "remove" ? "removal" : "rotation"}</button><button className={`button ${styles.secondary}`} onClick={() => { setConfirmation(undefined); setMessage("Confirmation canceled. Nothing changed."); }}>Cancel confirmation</button></div>}
    {pending && <button className={`button ${styles.secondary}`} onClick={cancel}>Cancel group request</button>}<p role="status" aria-live="polite" tabIndex={-1} ref={feedback}>{message}</p>
  </section>;
}
