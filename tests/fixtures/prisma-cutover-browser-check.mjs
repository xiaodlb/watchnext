// Production browser proof for #51. It owns a fresh temporary database and
// starts/stops only its own Next processes.
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "watchnext-prisma-browser-"));
const database = join(root, "watchnext.sqlite");
const port = await new Promise((resolve, reject) => { const probe = createServer(); probe.once("error", reject); probe.listen(0, "127.0.0.1", () => { const value = probe.address().port; probe.close(error => error ? reject(error) : resolve(value)); }); });
const origin = `http://127.0.0.1:${port}`;
const env = { ...process.env, WATCHNEXT_DATABASE_PATH: database, WATCHNEXT_APP_ORIGIN: origin, WATCHNEXT_HTTP_REPOSITORY: "prisma", WATCHNEXT_HTTP_PRISMA_DATABASE_URL: `file:${database.replace(/\\/g, "/")}`, WATCHNEXT_HTTP_METADATA_FIXTURES: "1", NEXT_TELEMETRY_DISABLED: "1" };
let server, browser;
const check = (value, message) => { if (!value) throw new Error(message); };
const run = (command, args) => new Promise((resolve, reject) => { const child = spawn(command, args, { cwd: repo, env, stdio: "ignore", windowsHide: true }); child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${args.join(" ")} failed with ${code}`))); });
async function stop() { if (!server || server.exitCode !== null) return; const done = new Promise(resolve => server.once("exit", resolve)); server.kill(); await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error("Owned Prisma server did not stop.")), 15000))]); server = undefined; }
async function start() { server = spawn(process.execPath, ["--import", pathToFileURL(join(repo, "scripts/framework-privacy.mjs")).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: repo, env, stdio: "ignore", windowsHide: true }); for (let at = Date.now() + 30000; Date.now() < at;) { if (server.exitCode !== null) throw new Error("Prisma production server exited before readiness."); try { if ((await fetch(`${origin}/v1/context`)).ok) return; } catch {} await new Promise(resolve => setTimeout(resolve, 100)); } throw new Error("Prisma production server did not become ready."); }

try {
  await run(process.execPath, ["--env-file-if-exists=.env.local", "scripts/db/init.mjs"]);
  await run(process.execPath, ["node_modules/next/dist/bin/next", "build"]);
  await start();
  const { chromium } = await import("playwright"); browser = await chromium.launch({ headless: true }); const context = await browser.newContext(); const page = await context.newPage();
  await page.goto(`${origin}/http`); check((await page.title()) !== "", "The mounted /http UI did not load.");
  const call = (path, body, method = "POST") => page.evaluate(async ({ path, body, method }) => { const response = await fetch(`/v1/${path}`, { method, headers: method === "GET" ? {} : { origin: location.origin, "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }); return { status: response.status, value: await response.json() }; }, { path, body, method });
  const password = "Prisma browser passphrase", registration = await call("auth/register", { username: "Prisma.Browser", password, confirmation: password }); check(registration.status === 200, "Browser could not register through selected Prisma HTTP.");
  const group = await call("groups", { expectedContextRevision: registration.value.context.revision, name: "Prisma browser group" }); check(group.status === 200, "Browser could not create a group.");
  const saved = await call("library/manual", { expectedContextRevision: group.value.context.revision, title: "Browser durable title", contentType: "youtube", durationSeconds: 1200, numberingStyle: "none", genres: ["Comedy"], moods: ["funny"], watchUrl: "https://www.youtube.com/watch?v=AbCdEf12345", sourceUrl: "https://www.youtube.com/watch?v=AbCdEf12345", coverUrl: "https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg" }); check(saved.status === 200 && saved.value.status === "created", "Browser could not save Prisma title.");
  const id = saved.value.title.id; check((await call(`library/${id}/rating`, { expectedContextRevision: group.value.context.revision, score: 8 }, "PUT")).status === 200, "Browser could not save personal rating.");
  await stop(); await start();
  const retained = await call(`library/${id}`, undefined, "GET"); check(retained.status === 200 && retained.value.personal?.rating === 8 && retained.value.title === "Browser durable title", "Restart did not retain Prisma security/session/title/history state.");
  await context.close(); console.log("PASS Prisma production browser: /http loaded, account/group/manual title/rating persisted across server restart.");
} finally { await browser?.close(); await stop(); rmSync(root, { recursive: true, force: true }); }
