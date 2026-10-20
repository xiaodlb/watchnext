"use client";
import { useEffect, useRef, useState } from "react";
import type { ContextIdentity, FrontendService, MockContext, MockScenario, PrivateDisclosure, ServiceResult } from "../../frontend/service/contracts";
import styles from "./preview.module.css";
type Screen = "entry" | "register" | "signin" | "recover" | "reveal" | "account";
export function MockAccounts({ service, identity, scenario, changed, departed }: { service: FrontendService; identity: { current: ContextIdentity }; scenario: MockScenario; changed: (context: MockContext | undefined) => void; departed?: () => void }) {
  const [screen, setScreen] = useState<Screen>("entry");
  const [account, setAccount] = useState<MockContext["account"]>(null);
  const [disclosure, setDisclosure] = useState<PrivateDisclosure>();
  const [message, setMessage] = useState("Choose a synthetic account action.");
  const [pending, setPending] = useState(false);
  const [copy, setCopy] = useState("");
  const form = useRef<HTMLFormElement>(null), feedback = useRef<HTMLParagraphElement>(null);
  const running = useRef<AbortController | undefined>(undefined), sequence = useRef(0);
  function clear() { form.current?.reset(); setDisclosure(undefined); setCopy(""); }
  function cancel() { sequence.current++; running.current?.abort(); running.current = undefined; setPending(false); form.current?.reset(); setMessage("Account request canceled. No change was committed."); }
  function navigate(next: Screen) { departed?.(); cancel(); clear(); setScreen(next); setMessage("Choose a synthetic account action."); }
  useEffect(() => {
    const leave = () => { sequence.current++; running.current?.abort(); form.current?.reset(); setDisclosure(undefined); setScreen("entry"); setPending(false); setMessage("Private disclosure cleared on departure."); };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) leave(); };
    window.addEventListener("pagehide", leave); window.addEventListener("pageshow", restore);
    return () => { sequence.current++; running.current?.abort(); window.removeEventListener("pagehide", leave); window.removeEventListener("pageshow", restore); };
  }, []);
  useEffect(() => { if (running.current) cancel(); }, [scenario]);
  useEffect(() => { if (!pending && (message !== "Choose a synthetic account action." || screen !== "entry")) feedback.current?.focus(); }, [message, pending, screen]);
  async function run(action: "register" | "signin" | "recover" | "signout" | "read", data?: FormData) {
    if (running.current) return;
    const n = ++sequence.current, controller = new AbortController(); running.current = controller;
    setPending(true); setMessage("Waiting for synthetic account response…"); setDisclosure(undefined);
    const options = { scenario, signal: controller.signal }, expected = identity.current;
    const input = { username: String(data?.get("username") ?? ""), password: String(data?.get("password") ?? ""), confirmation: String(data?.get("confirmation") ?? ""), proof: String(data?.get("proof") ?? "") };
    const result = action === "register" ? await service.accounts.register(input, expected, options) : action === "signin" ? await service.accounts.signIn(input, expected, options) : action === "recover" ? await service.accounts.recover(input, expected, options) : action === "signout" ? await service.accounts.signOut(expected, options) : await service.accounts.read(options);
    if (n !== sequence.current) return;
    running.current = undefined; setPending(false); form.current?.reset();
    if (result.kind !== "success") { const r = result as Exclude<ServiceResult<unknown>, {kind:"success"}>; setMessage(r.kind === "failure" ? [r.error.message, ...Object.values(r.error.fields ?? {})].join(" ") : r.message); return; }
    identity.current = result.context;
    changed(undefined); setAccount(null);
    if ("code" in result.value) { setDisclosure(result.value); setScreen("reveal"); setMessage("Save this synthetic code now. It is shown only once."); }
    else { changed(result.value); setAccount(result.value.account); setScreen(result.value.account ? "account" : "entry"); setMessage(action === "signout" ? "Signed out of the synthetic account." : "Synthetic account context ready."); }
  }
  const formScreen = screen === "register" || screen === "signin" || screen === "recover";
  return <section className={styles.card} aria-labelledby="mock-accounts"><h2 id="mock-accounts">Synthetic accounts</h2><p>Temporary sample credentials only. No real authentication. Seeded sign-ins: Demo.Owner or Demo.Viewer / synthetic password. These fixture credentials are a synthetic demo, not security evidence. Seeded memberships are read-only samples.</p>
    <nav className={styles.controls} aria-label="Preview account views"><button className={`button ${styles.secondary}`} onClick={() => navigate("entry")}>Account entry</button><button className={`button ${styles.secondary}`} onClick={() => navigate("register")}>Register</button><button className={`button ${styles.secondary}`} onClick={() => navigate("signin")}>Sign in</button><button className={`button ${styles.secondary}`} onClick={() => navigate("recover")}>Recover account</button></nav>
    {screen === "entry" && <><p>Register a temporary account, sign in to a sample, or recover using its current code.</p><button className="button" disabled={pending} onClick={() => void run("read")}>Read account context</button></>}
    {formScreen && <form ref={form} className={styles.form} onSubmit={event => { event.preventDefault(); void run(screen, new FormData(event.currentTarget)); }}>
      <h3>{screen === "register" ? "Create synthetic account" : screen === "recover" ? "Recover synthetic account" : "Synthetic sign-in"}</h3>
      <label className={styles.field}>Username<input className="field" name="username" autoComplete="off" required /></label>
      {screen === "recover" && <><label className={styles.field}>Current recovery code<input className="field" name="proof" type="password" autoComplete="off" required /></label><p>Missing your code? It cannot be retrieved, emailed or bypassed. Reload resets only this demo.</p></>}
      <label className={styles.field}>{screen === "recover" ? "New password" : "Password"}<input className="field" name="password" type="password" autoComplete="off" required /></label>
      {screen !== "signin" && <label className={styles.field}>Confirm password<input className="field" name="confirmation" type="password" autoComplete="off" required /></label>}
      <button className="button" disabled={pending} type="submit">{screen === "register" ? "Create account" : screen === "recover" ? "Replace password" : "Sign in to demo"}</button>
    </form>}
    {screen === "reveal" && disclosure && <div className={styles.form}><h3>Save your synthetic recovery code</h3><p>This is the only disclosure. Leaving this view discards it. Explicit copying cannot erase an external clipboard.</p><label className={styles.field}>One-time synthetic recovery code<input className="field" readOnly value={disclosure.code} onFocus={event => event.currentTarget.select()} /></label><button className="button" onClick={() => { const value = disclosure.code; void navigator.clipboard?.writeText(value).then(() => setCopy("Copied explicitly. Keep it private."), () => setCopy("Copy unavailable. Select the code and copy it manually.")); if (!navigator.clipboard) setCopy("Copy unavailable. Select the code and copy it manually."); }}>Copy code</button><p role="status">{copy || "You can select the code and copy manually."}</p><button className="button" onClick={() => { const next = disclosure.next; clear(); if (next === "account") void run("read"); else navigate("signin"); }}>Continue</button></div>}
    {screen === "account" && account && <div><h3>Account: {account.username}</h3><p>{account.seeded ? "Seeded synthetic account" : "New synthetic account"}</p>{account.memberships.length ? <><h4>Read-only sample memberships</h4><ul>{account.memberships.map(name => <li key={name}>{name}</li>)}</ul><p>Group controls are in the separate synthetic groups panel.</p></> : <p>No groups yet. Group controls are in the separate synthetic groups panel.</p>}<button className="button" disabled={pending} onClick={() => void run("signout")}>Sign out</button></div>}
    {screen === "entry" && <button className={`button ${styles.secondary}`} disabled={pending} onClick={() => void run("signout")}>Sign out</button>}
    {pending && <button className={`button ${styles.secondary}`} onClick={cancel}>Cancel account request</button>}
    <p ref={feedback} tabIndex={-1} role="status" aria-live="polite">{message}</p>
  </section>;
}
