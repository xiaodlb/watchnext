import {resolve as resolveScriptPath} from "node:path";
import {pathToFileURL as scriptURL} from "node:url";
import { randomBytes } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { createFixture, safeDiagnostic } from "../e2e/lifecycle.mjs";
import { credentialHash } from "../../lib/sessions.ts";
import { createGroup as createLegacyGroup } from "../../lib/groups.ts";
let f, failure, current = "setup";
const check = (value, label) => { if (!value) throw new Error(`Expected ${label}; observed condition false`); };
const step = async (name, run) => { current = name; await run(); console.log(`PASS ${name}`); };
async function capture(context) { for (const cookie of await context.cookies()) if (!f.secrets.includes(cookie.value)) if(cookie.name !== "watchnext_access_mode") f.secrets.push(cookie.value); }
async function login(page, name, password) {
  await page.goto(f.origin + "/login"); await page.getByLabel("Username", { exact: true }).fill(name); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).press("Enter");
}
async function register(page, name, password) {
  await page.goto(f.origin + "/register"); await page.getByLabel("Username", { exact: true }).fill(name); await page.getByLabel("Password", { exact: true }).fill(password); await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Create account" }).press("Enter"); const code = page.getByLabel("Private recovery code"); await code.waitFor();
  const value = await code.inputValue(); f.secrets.push(value); await capture(page.context()); await page.getByRole("link", { name: /Continue/ }).press("Enter"); await page.waitForURL("**/account"); return value;
}
async function recover(page, name, code, password) {
  await page.goto(f.origin + "/login"); await page.getByRole("link", { name: "Forgot password?" }).press("Enter"); await page.waitForURL("**/recover");
  await page.getByLabel("Username", { exact: true }).fill(name); await page.getByLabel("Saved recovery code").fill(code);
  await page.getByLabel("New password").fill(password); await page.getByLabel("Confirm password").fill(password);
  await page.getByRole("button", { name: "Reset password" }).press("Enter");
}
export async function runRecovery({build=true,onFixture,injectFailure=false}={}){
failure=undefined;current="setup";

try {
  f = await createFixture();onFixture?.(f); await step(build?"current production build and owned server":"owned server using this invocation's current build", async () => { await (build?f.build():f.initialize()); await f.launch(); await f.start(); });
  for (const width of [375, 1280]) {
    const a = await f.context(width), second = await f.context(width), b = await f.context(width);
    const page = await a.newPage(), page2 = await second.newPage(), other = await b.newPage();
    const name = `Recovery.A${width}`, otherName = `Recovery.B${width}`;
    const old = randomBytes(24).toString("base64url"), next = " " + randomBytes(24).toString("base64url") + " 🔒 ", later = randomBytes(24).toString("base64url"), wrong = randomBytes(32).toString("base64url");
    f.secrets.push(old, next, later, wrong); let saved, replacement, legacy;
    await step(`${width}: two actual accounts and independent target sessions plus legacy context`, async () => {
      saved = await register(page, name, old); await register(other, otherName, old);
      await login(page2, name, old); await page2.waitForURL("**/account"); await capture(second);
      // Legacy groups no longer have a public creation screen. Use the real
      // domain service only to prepare an isolated invitation, then exercise
      // the browser's invite and legacy-context behavior below.
      const writer = new DatabaseSync(f.path); let invite;
      try { invite = createLegacyGroup(writer, `Recovery legacy ${width}`, f.origin).inviteUrl; }
      finally { writer.close(); }
      f.secrets.push(invite.split("/").at(-1)); await page.goto(invite); await page.waitForURL("**/group"); await capture(a);
      legacy = (await a.cookies()).find(cookie => cookie.name === "watchnext_session").value;
    });
    await step(`${width}: generic invalid proof, private replacement and all target sessions revoked`, async () => {
      await recover(page, name, wrong, next); await page.locator("form").getByRole("alert").waitFor(); const error = await page.locator("form").getByRole("alert").textContent();
      await page.waitForFunction(() => [...document.querySelectorAll('input[type="password"]')].every(input => input.value === ""));
      await recover(page, `Unknown.${width}`, saved, next); await page.locator("form").getByRole("alert").waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('input[type="password"]')].every(input => input.value === ""));
      const unknownError = await page.locator("form").getByRole("alert").textContent();
      check(unknownError === error, `unknown and wrong proof same message (${error}; ${unknownError})`);
      await recover(page, name.toUpperCase(), saved, next); const code = page.getByLabel("Private recovery code"); await code.waitFor(); replacement = await code.inputValue(); f.secrets.push(replacement);
      check(replacement !== saved && replacement.length === 43, "new independent recovery code");
      check(!(await a.cookies()).some(cookie => cookie.name === "watchnext_account_session"), "recovery creates no session and clears current cookie");
      check((await a.cookies()).find(cookie => cookie.name === "watchnext_session").value === legacy, "legacy cookie preserved");
      check(f.db.prepare("SELECT recovery_digest FROM accounts WHERE username_key=?").get(name.toLowerCase()).recovery_digest === credentialHash(replacement), "replacement digest only");
      await page2.reload(); await page2.waitForURL("**/login"); check(new URL(page2.url()).pathname === "/login", "second target browser revoked immediately");
      await other.reload(); await other.getByText(otherName, { exact: true }).waitFor();
      await page.getByRole("button", { name: "Copy recovery code" }).press("Enter");
      await page.getByRole("link", { name: /Continue/ }).press("Enter"); await page.waitForURL("**/login");
      await page.goBack(); check(await page.getByLabel("Private recovery code").count() === 0, "back cannot restore replacement code");
      await page.reload(); check(await page.getByLabel("Private recovery code").count() === 0, "reload cannot retrieve code");
    });
    await step(`${width}: consumed code rejected, exact new login, restart persistence and later replacement use`, async () => {
      await recover(page, name, saved, later); await page.locator("form").getByRole("alert").waitFor();
      await login(page, name, old); await page.locator("form").getByRole("alert").waitFor();
      await login(page, name, next); await page.waitForURL("**/account"); await capture(a);
      await f.restart(); await page.reload(); await page.getByText(name, { exact: true }).waitFor();
      await other.reload(); await other.getByText(otherName, { exact: true }).waitFor();
      await recover(page, name, replacement, later); const code = page.getByLabel("Private recovery code"); await code.waitFor(); f.secrets.push(await code.inputValue());
      await page.getByRole("link", { name: /Continue/ }).press("Enter"); await login(page, name, later); await page.waitForURL("**/account"); await capture(a);
      await page.goto(f.origin + "/group"); await page.getByRole("heading", { name: `Recovery legacy ${width}`, exact: true }).waitFor();
    });
    await step(`${width}: protected requests, no backdoor and keyboard-responsive privacy`, async () => {
      const before = JSON.stringify(f.db.prepare("SELECT * FROM accounts ORDER BY id").all());
      const input = { username: name, recoveryCode: wrong, password: next, confirmation: next };
      for (const headers of [{ origin: "" }, { origin: "https://other.example" }, { origin: f.origin, "sec-fetch-site": "cross-site" }]) check((await a.request.post(f.origin + "/api/account/recover", { headers, data: input })).status() === 400, "protected recovery origin");
      check((await a.request.get(f.origin + "/api/account/recover")).status() === 405, "GET cannot reset");
      check((await a.request.post(f.origin + "/api/account/recover", { headers: { origin: f.origin }, data: { ...input, accountId: "other" } })).status() === 400, "extra ID rejected");
      check(JSON.stringify(f.db.prepare("SELECT * FROM accounts ORDER BY id").all()) === before, "denied requests preserve credentials");
      await page.goto(f.origin + "/recover"); await page.getByText(/no email or support bypass/).waitFor(); await page.keyboard.press("Tab");
      check(await page.evaluate(() => document.activeElement?.tagName === "A"), "keyboard focusable skip link");
      check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no horizontal overflow");
      check(await page.evaluate(() => localStorage.length === 0 && sessionStorage.length === 0), "no browser storage secrets");
    });
    await a.close(); await second.close(); await b.close();
  }
  await f.audit();
} catch (error) { failure = error; }
finally { try { await f?.cleanup(); } catch (error) { failure ??= error; } }
if(failure)throw new Error(`FAIL ${current}: ${safeDiagnostic(failure,f?.secrets??[],f?.root??"",f?[f.sentinelRoot]:[])}; owned cleanup complete: ${f?.cleanupComplete??false}`);
const report={ pass: true, widths: [375, 1280], twoAccounts: true, targetTwoSessionsRevoked: true, replacementAndRestart: true, legacyPreserved: true, privacyAudit: true, ownedCleanup: f.cleanupComplete };console.log(JSON.stringify(report));return report;
}
if(process.argv[1]&&scriptURL(resolveScriptPath(process.argv[1])).href===import.meta.url)runRecovery().catch(error=>{console.error(error.message);process.exitCode=1;});
