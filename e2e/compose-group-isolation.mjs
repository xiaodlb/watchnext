import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, resolve, sep, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = `watchnext-e2e-${randomBytes(10).toString("hex")}`;
const tempBase = resolve(tmpdir());
const temp = mkdtempSync(join(tempBase, "watchnext-compose-e2e-"));
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

let stage = "setup", started = false, browser, interrupted = false;
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
  if (!resolve(temp).startsWith(`${tempBase}${sep}`) || !basename(temp).startsWith("watchnext-compose-e2e-")) throw new Error("Unsafe temporary path.");
}
function assertNoExistingProject() {
  for (const resource of ["container", "network", "volume"]) {
    const flags = resource === "container" ? ["--all", "--quiet"] : ["--quiet"];
    if (dockerLines([resource, "ls", ...flags, "--filter", `label=com.docker.compose.project=${project}`]).length) throw new Error("Generated test project already exists.");
  }
  if (docker(["volume", "inspect", `${project}_postgres-data`], 30000, true).status === 0) throw new Error("Generated test volume already exists.");
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
async function createGroup(page, name) {
  await page.goto(`${origin}/groups`);
  await page.getByLabel("Group name", { exact: true }).fill(name);
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const inviteSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Invite your group" }) });
  await inviteSection.getByRole("heading", { name: "Invite your group" }).waitFor();
  await inviteSection.getByRole("button", { name: "Open watchlist" }).click();
  await page.getByRole("heading", { name, exact: true }).waitFor();
}
async function createTitle(page, title) {
  await page.goto(`${origin}/add`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Runtime (min)", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Funny", exact: true }).click();
  await page.getByRole("button", { name: "Save to list", exact: true }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  const pathname = new URL(page.url()).pathname;
  const match = /^\/title\/([a-f0-9-]+)$/i.exec(pathname);
  if (!match) throw new Error("Saved title details did not open.");
  return match[1];
}
async function apiGet(page, path) {
  return await page.evaluate(async requestPath => {
    const response = await fetch(requestPath, { credentials: "same-origin", cache: "no-store" });
    return { status: response.status, text: await response.text() };
  }, path);
}
async function openSelectedGroup(page, groupName) {
  let currentRequested = false;
  let responseCount = null, responseIncludesOwn = false;
  const responses = [];
  const onRequest = request => {
    if (new URL(request.url()).pathname === "/v1/groups/current") currentRequested = true;
  };
  const onResponse = response => {
    if (new URL(response.url()).pathname !== "/v1/groups/current") return;
    responses.push(response.json().then(data => {
      const memberships = data?.memberships;
      responseCount = Array.isArray(memberships) ? memberships.length : null;
      responseIncludesOwn = Array.isArray(memberships) && memberships.some(group => group.name === groupName);
    }).catch(() => {}));
  };
  page.on("request", onRequest);
  page.on("response", onResponse);
  stage = "opening the signed-in account's group workspace";
  await page.goto(`${origin}/groups`);
  stage = "waiting for the group workspace heading";
  await page.getByRole("heading", { name: "Your groups", exact: true }).waitFor();
  const main = page.locator("main");
  stage = "checking that the account's own group is listed";
  try { await main.getByText(groupName, { exact: false }).waitFor(); }
  catch (error) {
    await Promise.all(responses);
    const renderedOwn = await main.getByText(groupName, { exact: false }).count() > 0;
    const authErrorVisible = await page.locator('p.mt-4.text-destructive[role="alert"]').isVisible().catch(() => false);
    membershipDiagnostics.returnRequest = currentRequested;
    membershipDiagnostics.returnResponseMembershipCount = responseCount;
    membershipDiagnostics.returnResponseIncludesOwn = responseIncludesOwn;
    membershipDiagnostics.renderedOwn = renderedOwn;
    membershipDiagnostics.authErrorVisible = authErrorVisible;
    throw error;
  } finally {
    page.off("request", onRequest);
    page.off("response", onResponse);
  }
  const members = main.locator("section").filter({ has: page.getByRole("heading", { name: `Members of ${groupName}`, exact: true }) });
  if (await members.count() === 0) {
    stage = "opening the account's own listed group";
    const groupRow = main.getByRole("listitem").filter({ hasText: groupName });
    await groupRow.getByRole("button", { name: "Open", exact: true }).click();
    stage = "waiting for the opened group's watchlist";
    await page.getByRole("heading", { name: groupName, exact: true }).waitFor();
    stage = "reopening the group workspace";
    await page.goto(`${origin}/groups`);
  }
  stage = "waiting for the selected group's member panel";
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: `Members of ${groupName}`, exact: true }) });
  await section.getByRole("heading", { name: `Members of ${groupName}`, exact: true }).waitFor();
}
async function assertOwnWorkspace(page, ownGroup, ownTitle, ownUsername, foreignGroup, foreignTitle) {
  stage = `checking own group workspace`;
  await openSelectedGroup(page, ownGroup);
  const groupsText = await page.locator("main").innerText();
  const groupFlags = {
    ownGroup: groupsText.includes(ownGroup),
    ownMember: groupsText.includes(ownUsername),
    foreignGroup: groupsText.includes(foreignGroup),
    foreignTitle: groupsText.includes(foreignTitle),
  };
  if (!groupFlags.ownGroup || !groupFlags.ownMember || groupFlags.foreignGroup || groupFlags.foreignTitle) {
    throw new Error(`Workspace visibility flags: ${JSON.stringify(groupFlags)}`);
  }

  stage = `checking own watchlist`;
  await page.goto(`${origin}/watchlist`);
  await page.getByRole("heading", { name: ownGroup, exact: true }).waitFor();
  await page.getByRole("link", { name: new RegExp(ownTitle) }).waitFor();
  const watchlistText = await page.locator("main").innerText();
  if (watchlistText.includes(foreignGroup) || watchlistText.includes(foreignTitle)) throw new Error("Foreign group data appeared in the watchlist.");

  stage = `checking the library API`;
  const listResponse = await apiGet(page, "/v1/library");
  if (listResponse.status !== 200) throw new Error("The own-group library request did not succeed.");
  const list = JSON.parse(listResponse.text);
  const ownItems = (list.items ?? []).filter(item => item.title === ownTitle);
  if (ownItems.length !== 1 || (list.items ?? []).some(item => item.title === foreignTitle) || listResponse.text.includes(foreignGroup)) {
    throw new Error("The library API returned missing own data or foreign group data.");
  }

  stage = `checking direct foreign title access`;
  await page.goto(`${origin}/title/${foreignTitleId}`);
  await page.getByText("Title not found.", { exact: false }).waitFor();
  const detailText = await page.locator("main").innerText();
  if (detailText.includes(foreignTitle) || detailText.includes(foreignGroup)) throw new Error("The foreign title page exposed its content.");

  stage = `checking the protected foreign title API`;
  const foreignResponse = await apiGet(page, `/v1/library/${encodeURIComponent(foreignTitleId)}`);
  if (foreignResponse.status === 200 || foreignResponse.text.includes(foreignTitle) || foreignResponse.text.includes(foreignGroup)) {
    throw new Error("The protected title API exposed a foreign group's content.");
  }
}

let origin = "", foreignTitleId = "", failed = false;
const membershipDiagnostics = {};
let owner, guest;
const suffix = randomBytes(5).toString("hex");
const ownerName = `isolation_a_${suffix}`, guestName = `isolation_b_${suffix}`;
const ownerGroup = `Isolation group A ${suffix}`, guestGroup = `Isolation group B ${suffix}`;
const ownerTitle = `Private title A ${suffix}`, guestTitle = `Private title B ${suffix}`;
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
  stage = "waiting for the isolated app";
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    checkInterrupted();
    try { if ((await fetch(`${origin}/v1/context`, { signal: AbortSignal.timeout(2000) })).ok) { ready = true; break; } } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 300));
  }
  if (!ready) throw new Error("Application did not become ready.");
  if (!existsSync(chromium.executablePath())) throw new Error("Chromium is missing; run pnpm exec playwright install chromium.");

  stage = "opening two isolated browser contexts";
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  const ownerContext = await browser.newContext({ serviceWorkers: "block" });
  const guestContext = await browser.newContext({ serviceWorkers: "block" });
  for (const context of [ownerContext, guestContext]) {
    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(30000);
    await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  }
  owner = await ownerContext.newPage();
  guest = await guestContext.newPage();

  stage = "creating two independent accounts";
  await createAccount(owner, ownerName);
  await createAccount(guest, guestName);

  stage = "creating the first account's group";
  await createGroup(owner, ownerGroup);
  stage = "recording initial own-group membership";
  const initialContext = await apiGet(owner, "/v1/context");
  if (initialContext.status !== 200) throw new Error("Initial account context request failed.");
  const initial = JSON.parse(initialContext.text);
  const ownerGroupId = initial.group?.id;
  const initialMember = typeof ownerGroupId === "string" && Array.isArray(initial.account?.memberships) && initial.account.memberships.includes(ownerGroupId);
  console.log(`Own-group membership before other account activity: ${initialMember}`);
  if (!initialMember) throw new Error("Initial own-group membership missing.");
  stage = "saving first account title";
  const ownerTitleId = await createTitle(owner, ownerTitle);
  stage = "creating the second account's group and title";
  await createGroup(guest, guestGroup);
  foreignTitleId = await createTitle(guest, guestTitle);
  stage = "checking own-group membership after other account activity";
  const laterContext = await apiGet(owner, "/v1/context");
  if (laterContext.status !== 200) throw new Error("Later account context request failed.");
  const later = JSON.parse(laterContext.text);
  const laterMember = Array.isArray(later.account?.memberships) && later.account.memberships.includes(ownerGroupId);
  membershipDiagnostics.contextOwnGroup = laterMember;
  console.log(`Own-group membership in account context after other account activity: ${laterMember}`);
  if (!laterMember) throw new Error("Own-group membership missing after other account activity.");

  const laterWorkspace = await apiGet(owner, "/v1/groups/current");
  const workspace = laterWorkspace.status === 200 ? JSON.parse(laterWorkspace.text) : null;
  const workspaceOwnGroup = Array.isArray(workspace?.memberships) && workspace.memberships.some(group => group.id === ownerGroupId);
  membershipDiagnostics.groupsCurrentOwnGroup = workspaceOwnGroup;
  membershipDiagnostics.groupsCurrentStatusOk = laterWorkspace.status === 200;
  console.log(`Own-group membership in groups/current after other account activity: ${workspaceOwnGroup}`);
  if (!workspaceOwnGroup) throw new Error("Own-group membership missing from groups/current after other account activity.");

  await assertOwnWorkspace(owner, ownerGroup, ownerTitle, ownerName, guestGroup, guestTitle);
  foreignTitleId = ownerTitleId;
  await assertOwnWorkspace(guest, guestGroup, guestTitle, guestName, ownerGroup, ownerTitle);
  console.log("PASS: two accounts see only their own group and title in the workspace, watchlist, list API, direct title page, and protected title API.");
} catch (error) {
  failed = true;
  const detail = error instanceof Error && error.message.startsWith("Workspace visibility flags:") ? ` ${error.message}` : "";
  console.error(`FAIL: ${stage} (${error instanceof Error ? error.name : "Error"}).${detail} Membership checks: ${JSON.stringify(membershipDiagnostics)}.`);
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
