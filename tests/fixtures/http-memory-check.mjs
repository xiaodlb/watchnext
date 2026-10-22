import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = fileURLToPath(new URL("../../", import.meta.url));
const root = mkdtempSync(join(tmpdir(), "watchnext-http-memory-"));
const password = "Synthetic memory password";
let server;

const fail = message => { throw new Error(message); };
const check = (value, message) => { if (!value) fail(message); };
const port = await new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => {
    const value = probe.address().port;
    probe.close(error => error ? reject(error) : resolve(value));
  });
});
const origin = `http://127.0.0.1:${port}`;
const database = join(root, "must-not-exist.sqlite");
const environment = {
  ...process.env,
  HOME: join(root, "home"), USERPROFILE: join(root, "home"), LOCALAPPDATA: join(root, "local"), XDG_DATA_HOME: join(root, "local"),
  WATCHNEXT_APP_ORIGIN: origin, WATCHNEXT_DATABASE_PATH: database, WATCHNEXT_HTTP_MEMORY: "1", NEXT_TELEMETRY_DISABLED: "1",
};

async function stop() {
  if (!server || server.exitCode !== null || server.signalCode !== null) return;
  const exited = new Promise(resolve => server.once("exit", resolve));
  server.kill();
  await Promise.race([exited, new Promise((_, reject) => setTimeout(() => reject(new Error("Owned HTTP memory server did not stop.")), 10000))]);
  server = undefined;
}

async function start() {
  server = spawn(process.execPath, ["--import", pathToFileURL(join(repo, "scripts/framework-privacy.mjs")).href, "node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: repo, env: environment, stdio: ["ignore", "ignore", "pipe"], windowsHide: true,
  });
  let stderr = "";
  server.stderr.on("data", value => { stderr += value; });
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) fail(`Memory server exited before readiness: ${stderr.slice(0, 300)}`);
    try { if ((await fetch(`${origin}/v1/context`)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  fail("Memory server did not become ready.");
}

const jar = () => ({ cookie: "" });
async function call(client, path, body, method = "POST", extra = {}) {
  const headers = { ...extra, ...(client.cookie ? { cookie: client.cookie } : {}) };
  if (method !== "GET") Object.assign(headers, { origin, "content-type": "application/json" });
  const response = await fetch(`${origin}/v1/${path}`, { method, headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) client.cookie = setCookie.split(";")[0];
  return { response, value: await response.json() };
}
const revision = value => value.context.revision;

try {
  const build = spawn(process.execPath, ["node_modules/next/dist/bin/next", "build"], { cwd: repo, env: environment, stdio: "inherit", windowsHide: true });
  const buildCode = await new Promise((resolve, reject) => { build.once("error", reject); build.once("exit", resolve); });
  check(buildCode === 0, "Production build failed.");
  await start();

  const owner = jar(), member = jar(), outsider = jar(), legacy = jar();
  const ownerRegistration = await call(owner, "auth/register", { username: "Http.Owner", password, confirmation: password });
  check(ownerRegistration.response.status === 200 && /^[A-Za-z0-9_-]{43}$/.test(ownerRegistration.value.recoveryCode), "Owner registration did not return one synthetic recovery disclosure.");
  const created = await call(owner, "groups", { name: "HTTP proof group", expectedContextRevision: revision(ownerRegistration.value) });
  check(created.response.status === 200 && created.value.invite.startsWith(`${origin}/invite/`), "Owner could not create a group through HTTP.");

  const memberRegistration = await call(member, "auth/register", { username: "Http.Member", password, confirmation: password });
  const memberInvite = await call(member, "invitations/resolve", { invite: created.value.invite });
  check(memberInvite.response.status === 200 && memberInvite.value.pending?.needsAccount === false, "A second HTTP client could not resolve the invitation.");
  const joined = await call(member, "groups/pending/join", { expectedContextRevision: revision(memberInvite.value) });
  check(joined.response.status === 200 && joined.value.members.length === 2, "A second HTTP client could not join the group.");
  const memberId = joined.value.members.find(item => item.name === "Http.Member")?.id;

  const outsiderRegistration = await call(outsider, "auth/register", { username: "Http.Outsider", password, confirmation: password });
  const outsiderRemove = await call(outsider, "groups/current/members/remove", { expectedContextRevision: revision(outsiderRegistration.value), memberId, confirmed: true });
  check(outsiderRemove.response.status >= 400, "A foreign HTTP client was allowed to remove a participant.");
  const removal = await call(owner, "groups/current/members/remove", { expectedContextRevision: created.value.context.revision, memberId, confirmed: true });
  check(removal.response.status === 200, "Owner could not remove a participant.");
  const removedRead = await call(member, "groups/current", undefined, "GET");
  check(removedRead.response.status >= 400, "Removed participant retained group access.");
  const rotation = await call(owner, "groups/current/invitations/rotate", { expectedContextRevision: revision(removal.value), generation: 1, confirmed: true });
  check(rotation.response.status === 200, "Owner could not rotate an invitation.");
  const oldInvite = await call(member, "invitations/resolve", { invite: created.value.invite });
  check(oldInvite.response.status >= 400, "Rotated-away invitation remained usable.");
  const rejoinIntent = await call(member, "invitations/resolve", { invite: rotation.value.invite });
  const rejoined = await call(member, "groups/pending/join", { expectedContextRevision: revision(rejoinIntent.value) });
  check(rejoined.response.status === 200 && rejoined.value.members.find(item => item.name === "Http.Member")?.id === memberId, "Removal/rejoin did not retain the member identity.");

  const legacyCreated = await call(legacy, "legacy/groups", { name: "HTTP legacy group" });
  const legacyAccess = await call(legacy, "invitations/resolve", { invite: legacyCreated.value.invite });
  check(legacyAccess.response.status === 200 && legacy.cookie.startsWith("watchnext_session="), "Legacy invitation did not create a legacy-only HTTP session.");
  const legacyProfile = await call(legacy, "legacy/groups/current/profiles", { name: "HTTP Legacy", color: "teal", expectedContextRevision: revision(legacyAccess.value) });
  check(legacyProfile.response.status === 200 && legacyProfile.value.mode === "legacy", "Legacy HTTP profile context was unavailable.");

  const rejectedOrigin = await fetch(`${origin}/v1/auth/logout`, { method: "POST", headers: { origin: "https://untrusted.example", "content-type": "application/json" }, body: "{}" });
  check(rejectedOrigin.status >= 400, "Cross-origin mutation was accepted.");
  const recovery = await call(jar(), "auth/recovery", { username: "Http.Owner", proof: ownerRegistration.value.recoveryCode, password: "Replacement memory password", confirmation: "Replacement memory password" });
  check(recovery.response.status === 200, "Recovery did not work over the actual HTTP route.");

  await stop();
  check(!existsSync(database), "Memory mode opened the configured SQLite database.");
  await start();
  const afterRestart = await call(owner, "context", undefined, "GET");
  check(afterRestart.response.status === 200 && afterRestart.value.account === null, "Owned server restart retained an in-memory account or session.");
  check(!existsSync(database), "Memory-mode restart opened the configured SQLite database.");
  console.log("HTTP memory journey passed: independent clients, auth/group/legacy guards, removal/rejoin, and restart loss.");
} finally {
  await stop();
  rmSync(root, { recursive: true, force: true });
}
