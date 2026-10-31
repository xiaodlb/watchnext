import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = `watchnext-e2e-${randomBytes(10).toString("hex")}`;
const tempBase = resolve(tmpdir());
const temp = mkdtempSync(join(tempBase, "watchnext-compose-restart-"));
const envFile = join(temp, "compose.env");
const overrideFile = join(temp, "image.json");
const image = process.env.WATCHNEXT_E2E_IMAGE;
const password = randomBytes(24).toString("base64url");
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(COMPOSE_|WATCHNEXT_|POSTGRES_|DATABASE_URL$|YOUTUBE_API_KEY$|KINOPOISK_UNOFFICIAL_API_KEY$)/i.test(key),
));
env.WATCHNEXT_COMPOSE_DB_USER = "e2e";
env.WATCHNEXT_COMPOSE_DB_PASSWORD = password;
env.WATCHNEXT_COMPOSE_DB_NAME = "e2e";
env.YOUTUBE_API_KEY = "";
env.KINOPOISK_UNOFFICIAL_API_KEY = "";

let origin = "", groupName = "", started = false, browser, interrupted = false;
let stage = "setup", failed = false;
const composeArgs = ["compose", "--project-name", project, "--project-directory", root, "--env-file", envFile, "-f", join(root, "docker-compose.yaml")];
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  interrupted = true;
  void browser?.close().catch(() => {});
});
function checkInterrupted() { if (interrupted) throw new Error("Interrupted."); }

function docker(args, timeout = 30000, allowFailure = false) {
  const result = spawnSync("docker", args, { cwd: root, env, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 });
  if ((result.error || result.status !== 0) && !allowFailure) throw new Error(`Docker command failed during ${stage}.`);
  return result;
}
function compose(args, timeout = 30000, allowFailure = false) { return docker([...composeArgs, ...args], timeout, allowFailure); }
function dockerLines(args) { return docker(args).stdout.trim().split(/\r?\n/).filter(Boolean); }
async function freePort() {
  return await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(error => error ? reject(error) : resolvePort(port)); });
  });
}
function assertOwnedTemp() {
  if (!resolve(temp).startsWith(`${tempBase}${sep}`) || !basename(temp).startsWith("watchnext-compose-restart-")) throw new Error("Unsafe temporary path.");
}
function assertNoExistingProject() {
  for (const resource of ["container", "network", "volume"]) {
    const flags = resource === "container" ? ["--all", "--quiet"] : ["--quiet"];
    if (dockerLines([resource, "ls", ...flags, "--filter", `label=com.docker.compose.project=${project}`]).length) throw new Error("Generated test project already exists.");
  }
  if (docker(["volume", "inspect", `${project}_postgres-data`], 30000, true).status === 0) throw new Error("Generated test volume already exists.");
}
function assertOwnedVolumeExists() {
  const name = `${project}_postgres-data`;
  const result = docker(["volume", "inspect", name, "--format", "{{json .Labels}}"], 30000, true);
  if (result.status !== 0) throw new Error("The PostgreSQL volume did not survive Compose down.");
  const labels = JSON.parse(result.stdout);
  if (labels?.["com.docker.compose.project"] !== project || labels?.["com.docker.compose.volume"] !== "postgres-data") {
    throw new Error("The retained PostgreSQL volume is not owned by this test.");
  }
}
async function createAccount(page, username) {
  await page.goto(origin);
  await page.getByRole("tab", { name: "Create account", exact: true }).click();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await page.getByRole("heading", { name: "Save your recovery code" }).waitFor();
  await page.getByRole("button", { name: "I saved it — continue" }).click();
  await page.getByRole("heading", { name: "Your groups" }).waitFor();
}
async function signOut(page) {
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("heading", { name: "Sign in", exact: true }).waitFor();
}
async function signIn(page, username) {
  await page.goto(origin);
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("heading", { name: "Your groups" }).waitFor();
}
async function assertGroupMembers(page, own, other) {
  stage = `opening groups for ${own}`;
  await page.goto(`${origin}/groups`);
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: `Members of ${groupName}`, exact: true }) });
  stage = `checking persisted group heading for ${own}`;
  try {
    await section.getByRole("heading", { name: `Members of ${groupName}`, exact: true }).waitFor();
  } catch {
    const summary = (await page.locator("main").innerText().catch(() => "")).replace(/https?:\/\/\S+/g, "[URL]").replace(/\s+/g, " ").slice(0, 240);
    throw new Error(`Persisted group heading missing; page summary: ${summary}`);
  }
  stage = `checking persisted own membership for ${own}`;
  await section.getByRole("listitem").filter({ hasText: `${own} · You` }).waitFor();
  stage = `checking persisted other membership for ${own}`;
  await section.getByRole("listitem").filter({ hasText: other }).waitFor();
}
async function assertSharedTitle(page, title) {
  await page.goto(`${origin}/watchlist`);
  await page.getByRole("heading", { name: groupName, exact: true }).waitFor();
  const entries = page.getByRole("listitem").filter({ hasText: title });
  await entries.first().waitFor();
  if (await entries.count() !== 1) throw new Error("Persisted title did not appear exactly once.");
}
async function waitReady() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    checkInterrupted();
    try { if ((await fetch(`${origin}/v1/context`, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 300));
  }
  throw new Error("Application did not become ready.");
}

try {
  assertOwnedTemp();
  writeFileSync(envFile, "", { mode: 0o600, flag: "wx" });
  if (image) {
    stage = "checking the requested local image";
    if (docker(["image", "inspect", image], 30000, true).status !== 0) throw new Error("Requested local image does not exist.");
    writeFileSync(overrideFile, JSON.stringify({ services: { app: { image } } }), { mode: 0o600, flag: "wx" });
    composeArgs.push("-f", overrideFile);
  }
  stage = "checking isolated resources";
  if (!/^watchnext-e2e-[a-f0-9]{20}$/.test(project)) throw new Error("Invalid test project name.");
  assertNoExistingProject();
  env.WATCHNEXT_COMPOSE_PORT = String(await freePort());
  origin = `http://localhost:${env.WATCHNEXT_COMPOSE_PORT}`;
  const config = JSON.parse(compose(["config", "--format", "json"]).stdout);
  const volumes = Object.values(config.volumes ?? {});
  if (volumes.length !== 1 || volumes[0].name !== `${project}_postgres-data` || volumes[0].external === true) throw new Error("Compose volume is not isolated.");

  stage = "starting isolated Compose services";
  started = true;
  compose(["up", "-d", image ? "--no-build" : "--build", "--wait", "--wait-timeout", "180"], 600000);
  await waitReady();
  checkInterrupted();

  stage = "starting Chromium";
  if (!existsSync(chromium.executablePath())) throw new Error("Chromium is missing; run pnpm exec playwright install chromium.");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  let ownerContext = await browser.newContext({ serviceWorkers: "block" });
  let guestContext = await browser.newContext({ serviceWorkers: "block" });
  for (const context of [ownerContext, guestContext]) {
    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(30000);
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  }
  let owner = await ownerContext.newPage();
  let guest = await guestContext.newPage();
  const suffix = randomBytes(5).toString("hex");
  const ownerName = `owner_${suffix}`, guestName = `guest_${suffix}`;
  groupName = `Persistence E2E group ${suffix}`;

  stage = "creating the owner account";
  await createAccount(owner, ownerName);
  stage = "creating a group and real invitation";
  await owner.getByLabel("Group name", { exact: true }).fill(groupName);
  await owner.getByRole("button", { name: "Create group", exact: true }).click();
  const inviteSection = owner.locator("section").filter({ has: owner.getByRole("heading", { name: "Invite your group" }) });
  await inviteSection.getByRole("heading", { name: "Invite your group" }).waitFor();
  const invite = await inviteSection.getByLabel("Invitation link", { exact: true }).inputValue();
  const inviteUrl = new URL(invite);
  if (inviteUrl.origin !== origin || !inviteUrl.pathname.startsWith("/invite/")) throw new Error("Invitation does not target the test server.");
  await inviteSection.getByRole("button", { name: "Open watchlist" }).click();
  await owner.getByRole("heading", { name: groupName }).waitFor();

  stage = "creating the guest account";
  await createAccount(guest, guestName);
  stage = "joining the group as the guest";
  await guest.goto(invite);
  await guest.getByRole("button", { name: "Open invitation" }).click();
  await guest.getByRole("button", { name: "Join group" }).click();
  await guest.getByRole("heading", { name: groupName }).waitFor();

  stage = "saving the shared title before restart";
  const title = `Persistent Compose E2E film ${suffix}`;
  await owner.goto(`${origin}/add`);
  await owner.getByLabel("Title", { exact: true }).fill(title);
  await owner.getByLabel("Runtime (min)", { exact: true }).fill("25");
  await owner.getByRole("button", { name: "Funny", exact: true }).click();
  await owner.getByRole("button", { name: "Save to list", exact: true }).click();
  await owner.getByRole("heading", { name: title, exact: true }).waitFor();
  await assertGroupMembers(owner, ownerName, guestName);
  await assertGroupMembers(guest, guestName, ownerName);
  await assertSharedTitle(owner, title);
  await assertSharedTitle(guest, title);
  await signOut(owner);
  await signOut(guest);
  await browser.close();
  browser = undefined;

  stage = "stopping the isolated Compose project while retaining its volume";
  const down = compose(["down", "--remove-orphans"], 120000, true);
  if (down.error || down.status !== 0) throw new Error("Compose down failed.");
  stage = "verifying the PostgreSQL volume survived down";
  assertOwnedVolumeExists();

  stage = "restarting the same isolated Compose project and volume";
  compose(["up", "-d", "--no-build", "--wait", "--wait-timeout", "180"], 180000);
  await waitReady();
  checkInterrupted();

  stage = "opening fresh browser sessions after restart";
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  ownerContext = await browser.newContext({ serviceWorkers: "block" });
  guestContext = await browser.newContext({ serviceWorkers: "block" });
  for (const context of [ownerContext, guestContext]) {
    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(30000);
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  }
  owner = await ownerContext.newPage();
  guest = await guestContext.newPage();

  stage = "signing in the owner after restart";
  await signIn(owner, ownerName);
  stage = "signing in the guest after restart";
  await signIn(guest, guestName);
  await assertGroupMembers(owner, ownerName, guestName);
  await assertGroupMembers(guest, guestName, ownerName);
  stage = "checking the shared title persisted once for both accounts";
  await assertSharedTitle(owner, title);
  await assertSharedTitle(guest, title);
  console.log("PASS: both accounts, group membership and the shared title persisted after Compose was taken down without removing its PostgreSQL volume and brought back up.");
} catch (error) {
  failed = true;
  const detail = error instanceof Error && error.message.startsWith("Persisted group heading missing;")
    ? ` ${error.message.replace(/https?:\/\/\S+/g, "[URL]").replace(/\s+/g, " ").slice(0, 260)}`
    : "";
  console.error(`FAIL: ${stage} (${error instanceof Error ? error.name : "Error"}).${detail}`);
} finally {
  await browser?.close().catch(() => { failed = true; });
  if (started) {
    stage = "cleaning the isolated Compose project";
    const down = compose(["down", "--remove-orphans"], 120000, true);
    if (down.error || down.status !== 0) { failed = true; console.error("FAIL: could not stop the isolated Compose project."); }
    try {
      const volumes = dockerLines(["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]);
      for (const volume of volumes) {
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]+$/.test(volume)) throw new Error("Invalid volume name.");
        const labels = JSON.parse(docker(["volume", "inspect", volume, "--format", "{{json .Labels}}"] ).stdout);
        if (labels?.["com.docker.compose.project"] !== project) throw new Error("Volume is not owned by this test.");
        docker(["volume", "rm", volume]);
      }
      if (dockerLines(["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project}`]).length) throw new Error("Owned volume cleanup incomplete.");
    } catch { failed = true; console.error("FAIL: could not remove the isolated test volume safely."); }
  }
  try {
    assertOwnedTemp();
    for (const file of [envFile, overrideFile]) if (existsSync(file)) unlinkSync(file);
    rmdirSync(temp);
  } catch { failed = true; console.error("FAIL: could not remove the owned temporary configuration."); }
}
if (failed) process.exitCode = 1;
else console.log("PASS: isolated Compose resources removed; existing containers and databases were not used.");
