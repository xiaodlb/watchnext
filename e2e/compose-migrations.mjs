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
const migration = "20261026000000_watchnext_portability";
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
function query(sql) {
  return compose(["exec", "-T", "postgres", "psql", "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-U", "e2e", "-d", "e2e", "-c", sql]).stdout.trim();
}
function migrationCount() {
  if (query("SELECT to_regclass('public._prisma_migrations') IS NOT NULL;").toLowerCase() !== "t") {
    safeDiagnostic = "migration history table absent";
    throw new Error("Migration history table was not created.");
  }
  const summary = query(`SELECT COUNT(*), COUNT(*) FILTER (WHERE migration_name = '${migration}'), COUNT(*) FILTER (WHERE migration_name = '${migration}' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) FROM \"_prisma_migrations\";`);
  const [total, named, successful] = summary.split("|");
  safeDiagnostic = `migration rows total=${total ?? "?"}, expected-name=${named ?? "?"}, successful=${successful ?? "?"}`;
  if (![total, named, successful].every(value => /^\d+$/.test(value ?? ""))) throw new Error("Migration history query returned an invalid result.");
  return { named, successful };
}
function assertSingleMigration() {
  const { named, successful } = migrationCount();
  if (named !== "1" || successful !== "1") throw new Error("Expected exactly one successful row for the expected migration.");
}
function assertInitialMigrationLog() {
  const logs = compose(["logs", "--no-color", "app"]).stdout;
  if (!logs.includes(`Applying migration \`${migration}\``) || !logs.includes("All migrations have been successfully applied.")) {
    throw new Error("Application did not report successful application of the expected migration.");
  }
}
function assertNoPendingMigrationLog() {
  const logs = compose(["logs", "--no-color", "app"]).stdout;
  if (!logs.includes("No pending migrations to apply.")) throw new Error("Application did not report that no migrations are pending after restart.");
}
async function waitReady(origin) {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    checkInterrupted();
    try { if ((await fetch(`${origin}/v1/context`, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await new Promise(resolveWait => setTimeout(resolveWait, 300));
  }
  throw new Error("Application did not become ready.");
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

  stage = "starting the isolated PostgreSQL service";
  started = true;
  compose(["up", "-d", "--wait", "--wait-timeout", "120", "postgres"], 180000);
  assertOwnedVolumeExists();
  stage = "verifying the fresh database has no migration history";
  if (query("SELECT to_regclass('public._prisma_migrations') IS NULL;").toLowerCase() !== "t") throw new Error("The fresh database already has migration history.");

  stage = "starting the isolated app and applying migrations";
  compose(["up", "-d", image ? "--no-build" : "--build", "--wait", "--wait-timeout", "180", "app"], 600000);
  await waitReady(origin);
  stage = "checking first-start migration history";
  assertSingleMigration();
  stage = "checking first-start migration completion";
  assertInitialMigrationLog();

  stage = "starting Chromium";
  if (!existsSync(chromium.executablePath())) throw new Error("Chromium is missing; run pnpm exec playwright install chromium.");
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  const context = await browser.newContext({ serviceWorkers: "block" });
  context.setDefaultTimeout(30000);
  context.setDefaultNavigationTimeout(30000);
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const suffix = randomBytes(5).toString("hex");
  stage = "creating a synthetic account";
  await createAccount(page, `migration_${suffix}`);
  stage = "creating a group";
  await page.getByLabel("Group name", { exact: true }).fill(`Migration E2E group ${suffix}`);
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const inviteSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "Invite your group" }) });
  await inviteSection.getByRole("heading", { name: "Invite your group" }).waitFor();
  await inviteSection.getByRole("button", { name: "Open watchlist" }).click();
  await page.getByRole("heading", { name: `Migration E2E group ${suffix}`, exact: true }).waitFor();
  stage = "creating a synthetic title";
  const title = `Migration E2E film ${suffix}`;
  await page.goto(`${origin}/add`);
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Runtime (min)", { exact: true }).fill("25");
  await page.getByRole("button", { name: "Funny", exact: true }).click();
  await page.getByRole("button", { name: "Save to list", exact: true }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  stage = "opening the saved title from the watchlist";
  await page.goto(`${origin}/watchlist`);
  await page.getByRole("heading", { name: `Migration E2E group ${suffix}`, exact: true }).waitFor();
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();

  stage = "restarting only the isolated app service";
  compose(["restart", "app"], 120000);
  await waitReady(origin);
  stage = "checking migration idempotency after app restart";
  assertSingleMigration();
  assertNoPendingMigrationLog();
  stage = "checking the title remains readable after app restart";
  await page.goto(`${origin}/watchlist`);
  await page.getByRole("heading", { name: `Migration E2E group ${suffix}`, exact: true }).waitFor();
  await page.getByRole("link", { name: new RegExp(title) }).click();
  await page.getByRole("heading", { name: title, exact: true }).waitFor();
  console.log("PASS: fresh PostgreSQL migration, title create/read, and app restart migration idempotency.");
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
