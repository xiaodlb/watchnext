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

let stage = "setup", started = false, browser, interrupted = false, safeDiagnostic = "";
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
function assertOwnedVolumeExists() {
  const volume = `${project}_postgres-data`;
  const labels = JSON.parse(docker(["volume", "inspect", volume, "--format", "{{json .Labels}}"] ).stdout);
  if (labels?.["com.docker.compose.project"] !== project) throw new Error("PostgreSQL volume ownership could not be verified.");
}
function ownedContainer(service) {
  const ids = compose(["ps", "--all", "--quiet", service]).stdout.trim().split(/\r?\n/).filter(Boolean);
  if (ids.length !== 1) throw new Error(`Expected exactly one owned ${service} container.`);
  const result = JSON.parse(docker(["inspect", ids[0]]).stdout)[0];
  const labels = result?.Config?.Labels ?? {};
  if (labels["com.docker.compose.project"] !== project || labels["com.docker.compose.service"] !== service) {
    throw new Error(`Could not verify ownership of the test ${service} container.`);
  }
  return { id: result.Id, state: result.State };
}
function assertAppRunning() {
  const app = ownedContainer("app");
  if (app.state?.Status !== "running") throw new Error("The isolated app container stopped during the database outage.");
}
function assertPostgresHealthy(expectedId) {
  const postgres = ownedContainer("postgres");
  if (postgres.id !== expectedId || postgres.state?.Status !== "running" || postgres.state?.Health?.Status !== "healthy") {
    throw new Error("The same isolated PostgreSQL container did not become healthy again.");
  }
}
async function waitPostgresHealthy(containerId) {
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    checkInterrupted();
    try { assertPostgresHealthy(containerId); return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error("The isolated PostgreSQL container did not become healthy again.");
}
async function waitReady(origin) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    checkInterrupted();
    try { if ((await fetch(`${origin}/v1/context`, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 300));
  }
  throw new Error("Application did not become ready after PostgreSQL recovery.");
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
async function createGroup(page, groupName) {
  await page.getByLabel("Group name", { exact: true }).fill(groupName);
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const inviteSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Invite your group" }) });
  await inviteSection.getByRole("heading", { name: "Invite your group" }).waitFor();
  await inviteSection.getByRole("button", { name: "Open watchlist" }).click();
  await page.getByRole("heading", { name: groupName, exact: true }).waitFor();
}
async function saveTitle(page, title) {
  await page.goto(`${origin}/add`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Runtime (min)", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Funny", exact: true }).click();
  await page.getByRole("button", { name: "Save to list", exact: true }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
}
async function assertWatchlistTitle(page, groupName, title, shouldExist) {
  await page.goto(`${origin}/watchlist`);
  await page.getByRole("heading", { name: groupName, exact: true }).waitFor();
  const titleLink = page.getByRole("link", { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) });
  if (shouldExist) await titleLink.waitFor();
  else if (await titleLink.count() !== 0) throw new Error("A title rejected during the outage appeared in the saved watchlist.");
}

let origin = "", failed = false;
try {
  assertOwnedTemp();
  writeFileSync(envFile, "", { mode: 0o600, flag: "wx" });
  if (image) {
    stage = "checking the requested local image";
    if (docker(["image", "inspect", image], 30000, true).status !== 0) throw new Error("Requested local image does not exist.");
    writeFileSync(overrideFile, JSON.stringify({ services: { app: { image } } }), { mode: 0o600, flag: "wx" });
    composeArgs.push("-f", overrideFile);
  }
  stage = "checking isolated Compose resources";
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
  assertOwnedVolumeExists();
  await waitReady(origin);

  stage = "starting Chromium";
  if (!existsSync(chromium.executablePath())) throw new Error("Chromium is missing; run pnpm exec playwright install chromium.");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  const context = await browser.newContext({ serviceWorkers: "block" });
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(30000);
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const suffix = randomBytes(5).toString("hex");
  const groupName = `Database recovery E2E group ${suffix}`;
  const firstTitle = `Database recovery original ${suffix}`;
  const failedTitle = `Database recovery rejected ${suffix}`;
  const recoveredTitle = `Database recovery restored ${suffix}`;

  stage = "creating a synthetic account and group";
  await createAccount(page, `db_recovery_${suffix}`);
  await createGroup(page, groupName);
  stage = "saving and verifying the title before the outage";
  await saveTitle(page, firstTitle);
  await assertWatchlistTitle(page, groupName, firstTitle, true);

  // Keep the authenticated page and form state loaded while PostgreSQL is
  // healthy. Navigating during an outage could make initial auth refresh fail
  // before the user can attempt the save.
  stage = "preparing the second title form before the outage";
  await page.goto(`${origin}/add`);
  await page.getByLabel("Title", { exact: true }).fill(failedTitle);
  await page.getByLabel("Runtime (min)", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Funny", exact: true }).click();

  stage = "verifying ownership before stopping the test PostgreSQL service";
  const postgres = ownedContainer("postgres");
  if (postgres.state?.Status !== "running" || postgres.state?.Health?.Status !== "healthy") throw new Error("The isolated PostgreSQL service is not healthy before the outage.");
  const app = ownedContainer("app");
  if (app.state?.Status !== "running") throw new Error("The isolated app is not running before the outage.");
  const postgresId = postgres.id;

  stage = "stopping only the owned PostgreSQL service";
  const stopTarget = ownedContainer("postgres");
  if (stopTarget.id !== postgresId || stopTarget.state?.Status !== "running") throw new Error("PostgreSQL ownership/status changed before stop.");
  compose(["stop", "postgres"], 60000);
  const stopped = ownedContainer("postgres");
  if (stopped.id !== postgresId || stopped.state?.Status !== "exited") throw new Error("The isolated PostgreSQL service did not stop as requested.");
  assertAppRunning();
  assertOwnedVolumeExists();

  stage = "waiting for the visible failed-save alert during the outage";
  const responsePromise = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.origin === origin && url.pathname === "/v1/library/manual" && response.request().method() === "POST";
  });
  await page.getByRole("button", { name: "Save to list", exact: true }).click();
  const saveResponse = await responsePromise;
  const apiFlags = await saveResponse.json().then(data => {
    const error = data?.error;
    const body = JSON.stringify(data);
    const internal = /https?:\/\/|postgres(?:ql)?:\/\/|\b(?:prisma(?:client)?|sql(?:ite)?|postgres(?:ql)?|database|relation|constraint|migration)\b|\b(?:econnrefused|econnreset|enotfound|etimedout|connection\s+(?:refused|timeout|failed)|stack\s*trace|traceback)\b|\b(?:localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?):\d{1,5}\b|\b(?:\d{1,3}\.){3}\d{1,3}:\d{1,5}\b|\[[0-9a-f:]+\]:\d{1,5}\b|\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}\b|password|credential|recovery|cookie|\bat\s+\S+\s*\([^)]*:\d+:\d+\)/i;
    return {
      status: saveResponse.status(),
      code: typeof error?.code === "string" ? error.code : "missing",
      retryable: error?.retryable === true,
      genericMessage: error?.message === "The request could not be completed.",
      unsafe: internal.test(body),
    };
  }).catch(() => ({ status: saveResponse.status(), code: "unavailable", retryable: false, genericMessage: false, unsafe: false }));
  const alert = page.getByRole("alert");
  await alert.waitFor({ state: "visible" });
  const alertText = (await alert.innerText()).trim();
  stage = "checking that the outage alert is safe and does not report success";
  const safeInternal = /https?:\/\/|postgres(?:ql)?:\/\/|\b(?:prisma(?:client)?|sql(?:ite)?|postgres(?:ql)?|database|relation|constraint|migration)\b|\b(?:econnrefused|econnreset|enotfound|etimedout|connection\s+(?:refused|timeout|failed)|stack\s*trace|traceback)\b|\b(?:localhost|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?):\d{1,5}\b|\b(?:\d{1,3}\.){3}\d{1,3}:\d{1,5}\b|\[[0-9a-f:]+\]:\d{1,5}\b|\b(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}\b|password|credential|recovery|cookie|\bat\s+\S+\s*\([^)]*:\d+:\d+\)/i;
  const expectedGenericMessage = "The request could not be completed.";
  const alertFlags = {
    nonEmpty: Boolean(alertText),
    matchesApprovedGenericMessage: alertText === expectedGenericMessage,
    containsSensitiveOrRawDatabaseDetail: safeInternal.test(alertText),
    claimsSuccess: /\bsaved\b|\bsuccess(?:ful|fully)?\b|\badded\b/i.test(alertText),
    stayedOnAddForm: new URL(page.url()).pathname === "/add",
    failedTitleHeadingVisible: await page.getByRole("heading", { name: failedTitle, exact: true }).count() !== 0,
  };
  safeDiagnostic = `api status=${apiFlags.status}, code=${apiFlags.code}, retryable=${apiFlags.retryable}, generic-message=${apiFlags.genericMessage}, unsafe-detail=${apiFlags.unsafe}; alert non-empty=${alertFlags.nonEmpty}, approved-generic-message=${alertFlags.matchesApprovedGenericMessage}, unsafe-detail=${alertFlags.containsSensitiveOrRawDatabaseDetail}, success-claim=${alertFlags.claimsSuccess}, stayed-on-form=${alertFlags.stayedOnAddForm}, failed-title-page=${alertFlags.failedTitleHeadingVisible}`;
  if (apiFlags.status !== 503 || apiFlags.code !== "service_unavailable" || !apiFlags.retryable || !apiFlags.genericMessage || apiFlags.unsafe) throw new Error("The outage API response did not match the approved generic service-unavailable error.");
  if (!alertFlags.nonEmpty || !alertFlags.matchesApprovedGenericMessage || alertFlags.containsSensitiveOrRawDatabaseDetail) throw new Error("The outage did not produce the approved generic visible error message.");
  if (alertFlags.claimsSuccess) throw new Error("The outage error incorrectly claims the title was saved.");
  if (alertFlags.failedTitleHeadingVisible) throw new Error("The failed save navigated to a success page.");
  if (!alertFlags.stayedOnAddForm) throw new Error("The failed save navigated away from the add form.");

  stage = "restarting the same owned PostgreSQL service and volume";
  assertOwnedVolumeExists();
  compose(["start", "postgres"], 60000);
  await waitPostgresHealthy(postgresId);
  assertOwnedVolumeExists();
  await waitReady(origin);
  checkInterrupted();

  stage = "verifying saved data and the rejected title after recovery";
  await assertWatchlistTitle(page, groupName, firstTitle, true);
  await assertWatchlistTitle(page, groupName, failedTitle, false);

  stage = "saving a new title after recovery";
  await saveTitle(page, recoveredTitle);
  await assertWatchlistTitle(page, groupName, recoveredTitle, true);
  console.log("PASS: PostgreSQL outage showed a visible save error; the same database recovered with prior data intact, the failed title absent, and a new save successful.");
} catch (error) {
  failed = true;
  console.error(`FAIL: ${stage} (${error instanceof Error ? error.name : "Error"})${safeDiagnostic ? `: ${safeDiagnostic}` : ""}.`);
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
