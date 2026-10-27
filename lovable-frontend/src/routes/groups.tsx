import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Btn } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/groups")({ component: Groups });

function Groups() {
  const auth = useAuth();
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [invitation, setInvitation] = useState("");
  const [createdInvite, setCreatedInvite] = useState("");
  const [pendingName, setPendingName] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function run(action: () => Promise<void>) {
    setError(""); setBusy(true);
    try { await action(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete the request."); }
    finally { setBusy(false); }
  }
  function create(event: FormEvent) {
    event.preventDefault();
    void run(async () => { const link = await auth.createGroup(name); setCreatedInvite(link); setName(""); });
  }
  function findInvite(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await auth.resolveInvitation(invitation.trim());
      if (result.mode === "legacy") { await auth.refresh(); setError("This invitation belongs to a legacy group. Select a profile to continue."); return; }
      if (!result.pending || result.pending.needsAccount) throw new Error("Sign in to your account before joining this group.");
      setPendingName(result.pending.groupName ?? "this group");
    });
  }
  if (auth.loading) return <main className="grid min-h-screen place-items-center">Loading your groups…</main>;
  if (!auth.user && auth.context.mode !== "legacy") return <main className="grid min-h-screen place-items-center px-4"><div className="surface w-full max-w-md p-8 text-center"><p className="mb-4">Sign in to manage your groups.</p><Link className="font-semibold text-primary" to="/">Sign in</Link></div></main>;
  return <main className="mx-auto min-h-screen max-w-3xl px-4 py-10 md:px-6">
    <div className="mb-8 flex items-center justify-between gap-4"><Link to="/" className="text-xl font-extrabold tracking-tight">Watch<span className="text-primary">Next</span></Link>{auth.context.mode === "account" && <button type="button" className="text-sm font-semibold text-muted-foreground" onClick={() => void run(async () => { await auth.logout(); await nav({ to: "/" }); })}>Sign out</button>}</div>
    <h1 className="text-4xl font-extrabold tracking-tight">Your groups</h1>
    <p className="mt-1 text-muted-foreground">Choose a shared watchlist, create one, or join with an invitation.</p>
    {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{error}</p>}
    {auth.error && <p role="alert" className="mt-4 text-destructive">{auth.error}</p>}
    <div className="mt-6 space-y-4">
      {auth.workspace?.memberships.length ? <section className="surface p-6"><h2 className="text-xl font-bold">Your shared lists</h2><ul className="mt-4 space-y-2">{auth.workspace.memberships.map(group => <li key={group.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><span className="font-semibold">{group.name}{group.id === auth.context.groupId ? " · Current" : ""}</span><Btn disabled={busy} variant="secondary" onClick={() => void run(async () => { if (group.id !== auth.context.groupId) await auth.selectGroup(group.id); await nav({ to: "/watchlist" }); })}>Open</Btn></li>)}</ul></section> : null}
      {auth.context.mode === "account" && auth.workspace?.selected && <section className="surface p-6"><h2 className="text-xl font-bold">Members of {auth.workspace.selected.name}</h2><ul className="mt-4 space-y-2">{auth.workspace.members.map(member => <li key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><span>{member.name}{member.id === auth.workspace?.currentMemberId ? " · You" : ""}{member.inactive ? " · Inactive" : ""}</span>{auth.workspace?.canManage && !member.inactive && member.id !== auth.workspace.currentMemberId && <Btn variant="secondary" disabled={busy} onClick={() => { if (window.confirm(`Remove ${member.name} from this group? Their past contributions remain visible.`)) void run(async () => { await auth.request("groups/current/members/remove", "POST", { memberId: member.id, confirmed: true }); await auth.refresh(); }); }}>Remove</Btn>}</li>)}</ul>{auth.workspace.canManage && <Btn className="mt-4" variant="secondary" disabled={busy} onClick={() => { const generation = auth.workspace?.selected?.generation; if (generation != null && window.confirm("Create a new invitation? Previous invitation links will stop working.")) void run(async () => { const result = await auth.request("groups/current/invitations/rotate", "POST", { confirmed: true, generation }); setCreatedInvite(result.invite); await auth.refresh().catch(() => {}); }); }}>Create new invitation link</Btn>}</section>}
      {auth.context.mode === "legacy" && auth.workspace?.selected && <section className="surface p-6"><h2 className="text-xl font-bold">{auth.workspace.selected.name}</h2><p className="mt-2 text-muted-foreground">Choose a profile to open this legacy group.</p><div className="mt-4 flex flex-wrap gap-2">{auth.workspace.members.map(member => <Btn key={member.id} variant="secondary" disabled={busy} onClick={() => void run(async () => { await auth.request("legacy/context/profile", "PUT", { profileId: member.id }); await auth.refresh(); await nav({ to: "/watchlist" }); })}>{member.name}</Btn>)}</div><form className="mt-4 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); void run(async () => { await auth.request("legacy/groups/current/profiles", "POST", { name, color: "blue" }); await auth.refresh(); await nav({ to: "/watchlist" }); }); }}><label className="sr-only" htmlFor="profile-name">New profile name</label><input id="profile-name" className="field max-w-xs" value={name} onChange={event => setName(event.target.value)} placeholder="New profile name" required/><Btn disabled={busy} type="submit">Create profile</Btn></form></section>}
      {auth.context.mode === "account" && <><form className="surface p-6" onSubmit={create}><h2 className="text-xl font-bold">Create a group</h2><p className="mt-1 text-sm text-muted-foreground">Invite people after creating your shared list.</p><label htmlFor="group-name" className="mt-4 block text-sm font-semibold">Group name</label><div className="mt-1 flex flex-wrap gap-2"><input id="group-name" className="field max-w-md" value={name} onChange={event => setName(event.target.value)} maxLength={80} required/><Btn type="submit" disabled={busy}>Create group</Btn></div></form>
      <form className="surface p-6" onSubmit={findInvite}><h2 className="text-xl font-bold">Join a group</h2><label htmlFor="invite-link" className="mt-4 block text-sm font-semibold">Invitation link</label><div className="mt-1 flex flex-wrap gap-2"><input id="invite-link" className="field max-w-md" value={invitation} onChange={event => { setInvitation(event.target.value); setPendingName(null); }} required/><Btn type="submit" variant="secondary" disabled={busy}>Find group</Btn></div>{pendingName && <div className="mt-4"><p>Join {pendingName}?</p><Btn className="mt-2" type="button" disabled={busy} onClick={() => void run(async () => { await auth.joinGroup(); setInvitation(""); await nav({ to: "/watchlist" }); })}>Join group</Btn></div>}</form></>}
      {createdInvite && <section className="surface p-6"><h2 className="text-xl font-bold">Invite your group</h2><p className="mt-1 text-sm text-muted-foreground">Copy this private invitation now; it will not be shown again.</p><label htmlFor="created-invite" className="sr-only">Invitation link</label><input id="created-invite" className="field mt-3" readOnly value={createdInvite} onFocus={event => event.currentTarget.select()}/><div className="mt-4 flex flex-wrap gap-2"><Btn type="button" variant="secondary" onClick={() => void navigator.clipboard?.writeText(createdInvite)}>Copy link</Btn><Btn type="button" onClick={() => { setCreatedInvite(""); void nav({ to: "/watchlist" }); }}>Open watchlist</Btn></div></section>}
    </div>
  </main>;
}
