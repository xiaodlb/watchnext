import {resolve as resolveScriptPath} from "node:path";
import {pathToFileURL as scriptURL} from "node:url";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createFixture, safeDiagnostic } from "../e2e/lifecycle.mjs";
import { credentialHash } from "../../lib/sessions.ts";

let f, failure, current = "setup";
const check = (value, label) => { if (!value) throw new Error(`Expected ${label}; observed condition false`); };
const step = async (name, run) => { current = name; await run(); console.log(`PASS ${name}`); };
async function capture(context) { for (const cookie of await context.cookies()) if (!f.secrets.includes(cookie.value)) if(cookie.name !== "watchnext_access_mode") f.secrets.push(cookie.value); }
async function submit(page, operation, username, password) {
  await page.goto(f.origin + (operation === "register" ? "/register" : "/login"));
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  if (operation === "register") await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: operation === "register" ? "Create account" : "Sign in", exact: true }).press("Enter");
}
export async function runAccounts({build=true,onFixture,injectFailure=false}={}){
failure=undefined;current="setup";

try {
  f = await createFixture();onFixture?.(f);
  await step(build?"current production build and owned server":"owned server using this invocation's current build", async () => { await (build?f.build():f.initialize()); await f.launch(); await f.start(); });
  for (const width of [375, 1280]) {
    const a = await f.context(width), b = await f.context(width), third = await f.context(width);
    const pageA = await a.newPage(), pageB = await b.newPage(), pageThird = await third.newPage();
    const nameA = `AccountA.${width}`, nameB = `AccountB.${width}`;
    const passwordA = " " + randomBytes(24).toString("base64url") + "🔒 ", passwordB = randomBytes(24).toString("base64url"), wrong = randomBytes(24).toString("base64url");
    const fixation = randomBytes(32).toString("base64url"); f.secrets.push(passwordA, passwordA.trim(), passwordB, wrong, fixation);
    await step(`${width}: real registration, private one-time recovery, separate identity and cookie flags`, async () => {
      await pageA.goto(f.origin + "/account"); await pageA.waitForURL("**/login"); check(new URL(pageA.url()).pathname === "/login", "anonymous account redirect");
      await a.addCookies([{ name: "watchnext_account_session", value: fixation, url: f.origin }]);
      await submit(pageA, "register", " " + nameA + " ", passwordA);
      const code = pageA.getByLabel("Private recovery code"); await code.waitFor();
      const recovery = await code.inputValue(); f.secrets.push(recovery); check(/^[A-Za-z0-9_-]{43}$/.test(recovery), "random recovery format");
      await capture(a); const cookie = (await a.cookies()).find(cookie => cookie.name === "watchnext_account_session");
      check(cookie.value !== fixation && cookie.httpOnly && cookie.sameSite === "Lax" && cookie.path === "/" && cookie.expires === -1, "rotated HttpOnly browser-session cookie");
      check(!(await pageA.evaluate(() => document.cookie)).includes("watchnext_account_session"), "cookie inaccessible to script");
      const row = f.db.prepare("SELECT recovery_digest FROM accounts WHERE username_key=?").get(nameA.toLowerCase());
      check(row.recovery_digest === credentialHash(recovery), "only recovery digest persisted");
      await pageA.getByRole("button", { name: "Copy recovery code" }).press("Enter"); await pageA.getByRole("status").waitFor();
      await pageA.reload(); check(await pageA.getByLabel("Private recovery code").count() === 0, "refresh cannot retrieve recovery code");
      await pageA.goto(f.origin + "/account"); await pageA.getByText(nameA, { exact: true }).waitFor();
      await submit(pageB, "register", nameB, passwordB); const codeB = pageB.getByLabel("Private recovery code"); await codeB.waitFor(); f.secrets.push(await codeB.inputValue()); await capture(b);
      await pageB.getByRole("link", { name: /Continue/ }).press("Enter"); await pageB.getByText(nameB, { exact: true }).waitFor();
      check(f.db.prepare("SELECT * FROM account_memberships").all().length === 0, "no implicit memberships/profile claiming");
    });
    if(injectFailure)throw new Error("Deliberate authenticated failure after private registration");
    await step(`${width}: duplicate, exact password, unknown failure, safe requests and rollback semantics`, async () => {
      await submit(pageThird, "register", nameA.toUpperCase(), passwordA); await pageThird.getByRole("alert").filter({ hasText: "already taken" }).waitFor();
      check(await pageThird.getByLabel("Password", { exact: true }).inputValue() === "", "password cleared on failure");
      await submit(pageThird, "login", nameA, passwordA.trim()); await pageThird.getByRole("alert").waitFor(); const knownError = await pageThird.getByRole("alert").textContent();
      await submit(pageThird, "login", `Unknown.${width}`, wrong); await pageThird.getByRole("alert").waitFor(); check(await pageThird.getByRole("alert").textContent() === knownError, "unknown and wrong identical public failure");
      const before = f.db.prepare("SELECT count(*) AS n FROM accounts").get().n;
      for (const headers of [{ origin: "https://other.example" }, { origin: "" }, { origin: f.origin, "sec-fetch-site": "cross-site" }]) {
        const response = await a.request.post(f.origin + "/api/account/register", { headers, data: { username: `Denied.${width}`, password: passwordA, confirmation: passwordA } }); check(response.status() === 400, "origin guard rejection");
      }
      check((await a.request.get(f.origin + "/api/account/logout")).status() === 405, "GET cannot mutate");
      check(f.db.prepare("SELECT count(*) AS n FROM accounts").get().n === before, "rejected requests leave accounts unchanged");
      const response = await a.request.post(f.origin + "/api/account/login", { headers: { origin: f.origin }, data: { username: nameA, password: wrong } });
      const text = await response.text(); check(response.status() === 400 && !text.includes(wrong), "no secret echo");
      await pageA.goto(f.origin + "/account"); await pageA.getByText(nameA, { exact: true }).waitFor();
    });
    await step(`${width}: login rotation, independent contexts, logout reuse rejection and persistent expiry`, async () => {
      const old = (await a.cookies()).find(cookie => cookie.name === "watchnext_account_session").value;
      await submit(pageA, "login", nameA.toUpperCase(), passwordA); await pageA.waitForURL("**/account"); await capture(a);
      const next = (await a.cookies()).find(cookie => cookie.name === "watchnext_account_session").value;
      check(next !== old && f.db.prepare("SELECT revoked_at FROM account_sessions WHERE token_hash=?").get(credentialHash(old)).revoked_at !== null, "successful rotation revokes only prior credential");
      const duplicate = await a.request.get(f.origin + "/account", { headers: { cookie: `watchnext_account_session=${next}; watchnext_account_session=${next}` } });
      const duplicateBody = await duplicate.text();
      // The loading boundary may stream Next's redirect instead of an HTTP 3xx.
      check((new URL(duplicate.url()).pathname === "/login" || (duplicateBody.includes("NEXT_REDIRECT") && duplicateBody.includes("/login"))) && !duplicateBody.includes(nameA), "duplicate account cookie names denied without account disclosure");
      await submit(pageThird, "login", nameA, passwordA); await pageThird.waitForURL("**/account"); await capture(third);
      const response = await a.request.get(f.origin + "/account"); check(response.headers()["cache-control"].includes("no-store"), "private dynamic account response");
      await pageA.getByRole("button", { name: "Sign out", exact: true }).press("Enter"); await pageA.waitForURL("**/login");
      check(!(await a.cookies()).some(cookie => cookie.name === "watchnext_account_session"), "account cookie cleared");
      await a.addCookies([{ name: "watchnext_account_session", value: next, url: f.origin }]); await pageA.goto(f.origin + "/account"); await pageA.waitForURL("**/login"); check(new URL(pageA.url()).pathname === "/login", "revoked credential cannot be reused");
      await pageThird.reload(); await pageThird.getByText(nameA, { exact: true }).waitFor();
      await f.restart(); await pageB.reload(); await pageB.getByText(nameB, { exact: true }).waitFor();
      const token = (await third.cookies()).find(cookie => cookie.name === "watchnext_account_session").value;
      const writer = new DatabaseSync(f.path);
      try { const now = Math.floor(Date.now() / 1000); writer.prepare("UPDATE account_sessions SET created_at=?,expires_at=? WHERE token_hash=?").run(now - 700000, now - 1, credentialHash(token)); } finally { writer.close(); }
      await pageThird.reload(); await pageThird.waitForURL("**/login"); check(new URL(pageThird.url()).pathname === "/login", "expired credential denied");
      await a.clearCookies(); await a.addCookies([{ name: "watchnext_account_session", value: randomBytes(32).toString("base64url"), url: f.origin }]); await capture(a);
      await pageA.goto(f.origin + "/account"); await pageA.waitForURL("**/login"); check(new URL(pageA.url()).pathname === "/login", "tampered credential denied");
    });
    await step(`${width}: keyboard/responsive privacy and honest legacy separation`, async () => {
      await pageA.goto(f.origin); await pageA.getByRole("heading", { name: "WatchNext", exact: true }).waitFor();
      await pageA.getByRole("link", { name: "Open a legacy group", exact: true }).press("Enter");
      await pageA.getByRole("heading", { name: "Group access unavailable", exact: true }).waitFor();
      await pageA.goto(f.origin + "/login"); await pageA.keyboard.press("Tab"); check(await pageA.evaluate(() => document.activeElement?.tagName === "A"), "keyboard focus visible on link");
      for (const page of [pageA, pageB]) check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
      for (const page of [pageA, pageB]) check(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), "no web storage secrets");
      check(await pageB.getByRole("button", { name: "Create account group", exact: true }).count() === 1, "real account group create control without implicit membership");
    });
    await a.close(); await b.close(); await third.close();
  }
  await f.audit();
} catch (error) { failure = error; }
finally { try { await f?.cleanup(); } catch (error) { failure ??= error; } }
if(failure)throw new Error(`FAIL ${current}: ${safeDiagnostic(failure,f?.secrets??[],f?.root??"",f?[f.sentinelRoot]:[])}; owned cleanup complete: ${f?.cleanupComplete??false}`);
const report={ pass: true, widths: [375, 1280], twoAccounts: true, actualCrypto: true, cookieRotationLogoutExpiryRestart: true, privacyAudit: true, ownedCleanup: f.cleanupComplete };console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&scriptURL(resolveScriptPath(process.argv[1])).href===import.meta.url)runAccounts().catch(error=>{console.error(error.message);process.exitCode=1;});
