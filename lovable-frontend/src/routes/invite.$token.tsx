import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Btn } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/invite/$token")({ component: Invitation });

function Invitation() {
  const { token } = Route.useParams();
  const auth = useAuth();
  const nav = useNavigate();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function resolve() {
    setBusy(true); setError("");
    try {
      const result = await auth.resolveInvitation(token);
      if (result.mode === "legacy") { await auth.refresh(); await nav({ to: "/groups" }); return; }
      if (result.pending?.needsAccount) { setError("Sign in first, then reopen this invitation link."); return; }
      if (!result.pending) throw new Error("The invitation could not be opened.");
      setPending(result.pending.groupName ?? "this group");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The invitation could not be opened."); }
    finally { setBusy(false); }
  }
  async function join() {
    setBusy(true); setError("");
    try { await auth.joinGroup(); await nav({ to: "/watchlist" }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not join the group."); }
    finally { setBusy(false); }
  }
  return <main className="grid min-h-screen place-items-center px-4 py-10"><div className="surface w-full max-w-md p-8"><h1 className="text-2xl font-bold">Group invitation</h1><p className="mt-2 text-muted-foreground">{auth.user ? `Signed in as ${auth.user}.` : "Sign in before joining an account group."}</p>{error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-destructive">{error}</p>}{pending ? <><p className="mt-4">Join {pending}?</p><Btn className="mt-4 w-full" disabled={busy} onClick={() => void join()}>Join group</Btn></> : <Btn className="mt-4 w-full" disabled={busy || auth.loading} onClick={() => void resolve()}>Open invitation</Btn>}{!auth.user && <Link className="mt-4 block text-center font-semibold text-primary" to="/">Sign in or create an account</Link>}</div></main>;
}
