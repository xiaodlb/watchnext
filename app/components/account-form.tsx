"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export function AccountForm({ operation }: { operation: "register" | "login" | "logout" | "recover" }) {
  const [pending, setPending] = useState(false), [message, setMessage] = useState("");
  const [recovery, setRecovery] = useState<string | null>(null), [copyMessage, setCopyMessage] = useState("");
  const feedback = useRef<HTMLParagraphElement>(null), busy = useRef(false);
  // Feedback must receive focus in the same commit that makes the alert observable.
  useLayoutEffect(() => { if (message) feedback.current?.focus(); }, [message]);
  useEffect(() => {
    if (recovery) document.getElementById("recovery-code")?.focus();
    const discard = () => { const field = document.getElementById("recovery-code"); if (field instanceof HTMLInputElement) field.value = ""; setRecovery(null); };
    const restored = (event: PageTransitionEvent) => { if (event.persisted) discard(); };
    window.addEventListener("pagehide", discard); window.addEventListener("pageshow", restored);
    return () => { window.removeEventListener("pagehide", discard); window.removeEventListener("pageshow", restored); };
  }, [recovery]);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy.current) return;
    busy.current = true; setPending(true); setMessage("");
    const form = event.currentTarget, fields = new FormData(form);
    const input = operation === "logout" ? {} : { username: fields.get("username"), password: fields.get("password"), ...(["register", "recover"].includes(operation) ? { confirmation: fields.get("confirmation") } : {}), ...(operation === "recover" ? { recoveryCode: fields.get("recoveryCode") } : {}) };
    try {
      const response = await fetch(`/api/account/${operation}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) { setMessage(typeof result.error === "string" ? result.error : "We couldn’t complete that request. Try again."); return; }
      if ((operation === "register" || operation === "recover") && typeof result.recoveryCode === "string") { setRecovery(result.recoveryCode); return; }
      // Only these fixed local destinations are supported; response targets grant no redirect authority.
      window.location.assign(operation === "logout" ? "/login" : "/account");
    } catch { setMessage(operation === "recover" ? "We couldn’t confirm the reset. It may have completed: try signing in with your new password before retrying. A replacement code that wasn’t displayed cannot be retrieved." : "We couldn’t reach WatchNext. Try again. Enter your password again if needed."); }
    finally {
      for (const name of ["password", "confirmation", "recoveryCode"]) {
        const field = form.elements.namedItem(name); if (field instanceof HTMLInputElement) field.value = "";
      }
      setPending(false); busy.current = false;
    }
  }
  async function copy() {
    try { if (!navigator.clipboard?.writeText) throw new Error(); await navigator.clipboard.writeText(recovery!); setCopyMessage("Recovery code copied. Store it somewhere private."); }
    catch { setCopyMessage("Select the code and copy it manually. Store it somewhere private."); }
  }
  if (recovery) return <section className="placeholder" aria-labelledby="recovery-heading">
    <h2 id="recovery-heading">{operation === "recover" ? "Save your replacement recovery code" : "Save your recovery code"}</h2>
    <p>{operation === "recover" ? "Your password was reset and all sessions for this account were signed out. Your old code no longer works. Save this replacement privately, then sign in with your new password." : "Your account is ready. This code is shown once. Save it privately: it will let you reset a forgotten password. Without your password or this code, your account cannot be recovered."}</p>
    <label className="field-label" htmlFor="recovery-code">Private recovery code</label>
    <input className="field" id="recovery-code" value={recovery} readOnly onFocus={event => event.currentTarget.select()} />
    <button className="button button-secondary" type="button" onClick={copy}>Copy recovery code</button>
    <p role="status">{copyMessage}</p>
    <a className="button" href={operation === "recover" ? "/login" : "/account"} onClick={() => setRecovery(null)}>I saved it — Continue</a>
  </section>;
  return <form method="post" action={`/api/account/${operation}`} onSubmit={submit} noValidate aria-busy={pending} className="form-fields">
    {operation !== "logout" && <fieldset disabled={pending} className="form-fields">
      <legend className="visually-hidden">{operation === "register" ? "Register" : "Sign in"}</legend>
      <label className="field-label" htmlFor="username">Username</label>
      <input id="username" name="username" className="field" autoComplete="username" required aria-describedby="username-hint" />
      <p id="username-hint" className="field-hint">3–32 letters, numbers, underscores, dots or hyphens. Letter case does not change your account.</p>
      {operation === "recover" && <><label className="field-label" htmlFor="saved-recovery-code">Saved recovery code</label><input id="saved-recovery-code" name="recoveryCode" className="field" type="password" autoComplete="off" required /></>}
      <label className="field-label" htmlFor="password">{operation === "recover" ? "New password" : "Password"}</label>
      <input id="password" name="password" className="field" type="password" autoComplete={operation === "register" || operation === "recover" ? "new-password" : "current-password"} required aria-describedby="password-hint" />
      <p id="password-hint" className="field-hint">12–128 characters. Spaces and letter case are kept exactly.</p>
      {(operation === "register" || operation === "recover") && <><label className="field-label" htmlFor="confirmation">Confirm password</label><input id="confirmation" name="confirmation" className="field" type="password" autoComplete="new-password" required /></>}
    </fieldset>}
    <button className="button" type="submit" disabled={pending}>{pending ? "Please wait…" : operation === "register" ? "Create account" : operation === "recover" ? "Reset password" : operation === "login" ? "Sign in" : "Sign out"}</button>
    {pending && <p role="status">{operation === "logout" ? "Signing out…" : "Checking your details…"}</p>}
    {message && <p className="field-error" role="alert" tabIndex={-1} ref={feedback}>{message}</p>}
  </form>;
}
