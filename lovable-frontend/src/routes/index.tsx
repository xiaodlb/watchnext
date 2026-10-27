import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Btn } from "@/components/ui-kit";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Sign in · WatchNext" },
      { name: "description", content: "Sign in or create an account for your private shared watchlist." },
      { property: "og:title", content: "Sign in · WatchNext" },
      { property: "og:description", content: "Your group's private list of movies, series, anime and YouTube videos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignIn,
});

function SignIn() {
  const [mode, setMode] = useState<"in" | "up" | "recover" | "code">("in");
  const [username, setUsername] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const [proof, setProof] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [returnToSignIn, setReturnToSignIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const { login, register, recover, error: connectionError } = useAuth();
  const nav = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username.trim())) return setErr("Username must be 3–32 letters, digits, _ . or -.");
    if (pw.length < 12) return setErr("Password must be at least 12 characters.");
    if ((mode === "up" || mode === "recover") && pw !== pw2) return setErr("Passwords don't match.");
    setErr("");
    setBusy(true);
    try {
      if (mode === "up") {
        setRecoveryCode(await register(username, pw, pw2));
        setReturnToSignIn(false);
        setMode("code");
      } else if (mode === "recover") {
        setRecoveryCode(await recover(username, proof, pw, pw2));
        setReturnToSignIn(true);
        setProof("");
        setMode("code");
      } else {
        await login(username, pw);
        void nav({ to: "/groups" });
      }
    } catch (cause) {
      setErr(cause instanceof Error ? cause.message : "Unable to sign in. Try again.");
    } finally { setPw(""); setPw2(""); setBusy(false); }
  };

  return (
    <main className="grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <p className="mb-2 text-center text-2xl font-extrabold tracking-tight">
          Watch<span className="text-primary">Next</span>
        </p>
        <p className="mb-6 text-center text-muted-foreground">Stop scrolling. Pick from what you already wanted to watch.</p>
        <div className="surface p-6 md:p-8">
          {mode === "code" ? (
            <div>
              <h1 className="text-2xl font-bold">Save your recovery code</h1>
              <p className="mt-2 text-muted-foreground">There's no email reset. This code is the only way back in if you forget your password. It's shown once.</p>
              <code className="mt-4 block break-all rounded-lg bg-muted p-4 text-center font-mono text-lg">{recoveryCode}</code>
              <Btn className="mt-6 w-full" onClick={() => { setRecoveryCode(""); if (returnToSignIn) setMode("in"); else void nav({ to: "/groups" }); }}>I saved it — continue</Btn>
            </div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist">
                {(["in", "up"] as const).map((m) => (
                  <button key={m} role="tab" type="button" aria-selected={mode === m} onClick={() => { setMode(m); setErr(""); }} className={cn("min-h-11 rounded-md font-semibold", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}>
                    {m === "in" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
              <h1 className="sr-only">{mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Recover account"}</h1>
              <form onSubmit={submit} className="space-y-4">
                {mode === "recover" && <p className="text-sm text-muted-foreground">Enter your username and recovery code to choose a new password.</p>}
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold">Username</span>
                  <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold">Password</span>
                  <input className="field" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 12 characters" />
                </label>
                {mode === "recover" && <label className="block"><span className="mb-1 block text-sm font-semibold">Recovery code</span><input className="field" type="password" value={proof} onChange={(e) => setProof(e.target.value)} autoComplete="off" /></label>}
                {(mode === "up" || mode === "recover") && (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold">Confirm password</span>
                    <input className="field" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
                  </label>
                )}
                {(err || connectionError) && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{err || connectionError}</p>}
                <Btn type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Reset password"}</Btn>
                {mode === "in" && <button className="block w-full text-center text-sm text-primary" type="button" onClick={() => { setMode("recover"); setErr(""); }}>Forgot password?</button>}
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
