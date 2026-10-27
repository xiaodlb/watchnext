import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Btn } from "@/components/ui-kit";
import { useStore } from "@/lib/store";
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
  const [mode, setMode] = useState<"in" | "up" | "code">("in");
  const [username, setUsername] = useState("aliya");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState("");
  const { signIn } = useStore();
  const nav = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z0-9_.-]{3,32}$/.test(username.trim())) return setErr("Username must be 3–32 letters, digits, _ . or -.");
    if (pw.length < 12) return setErr("Password must be at least 12 characters.");
    if (mode === "up" && pw !== pw2) return setErr("Passwords don't match.");
    setErr("");
    if (mode === "up") return setMode("code");
    signIn(username);
    nav({ to: "/watchlist" });
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
              <code className="mt-4 block rounded-lg bg-muted p-4 text-center font-mono text-lg tracking-widest">K7QF-29XM-H4TD-88RW</code>
              <Btn className="mt-6 w-full" onClick={() => { signIn(username); nav({ to: "/watchlist" }); }}>I saved it — continue</Btn>
            </div>
          ) : (
            <>
              <div className="mb-6 grid grid-cols-2 rounded-lg bg-muted p-1" role="tablist">
                {(["in", "up"] as const).map((m) => (
                  <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setErr(""); }} className={cn("min-h-11 rounded-md font-semibold", mode === m ? "bg-card shadow-sm" : "text-muted-foreground")}>
                    {m === "in" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
              <h1 className="sr-only">{mode === "in" ? "Sign in" : "Create account"}</h1>
              <form onSubmit={submit} className="space-y-4">
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold">Username</span>
                  <input className="field" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-semibold">Password</span>
                  <input className="field" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="At least 12 characters" />
                </label>
                {mode === "up" && (
                  <label className="block">
                    <span className="mb-1 block text-sm font-semibold">Confirm password</span>
                    <input className="field" type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
                  </label>
                )}
                {err && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{err}</p>}
                <Btn type="submit" className="w-full">{mode === "in" ? "Sign in" : "Create account"}</Btn>
                <p className="text-center text-sm text-muted-foreground">Prototype: any username and a 12+ character password work.</p>
              </form>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
