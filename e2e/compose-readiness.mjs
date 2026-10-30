import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tempBase = resolve(tmpdir());
const temp = mkdtempSync(join(tempBase, "watchnext-readiness-"));
const envFile = join(temp, "compose.env");
const imageFile = join(temp, "image.json");
const isolationFile = join(temp, "isolation.json");
const unhealthyFile = join(temp, "unhealthy.json");
const image = process.env.WATCHNEXT_E2E_IMAGE;
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(COMPOSE_|WATCHNEXT_|POSTGRES_|DATABASE_URL$|YOUTUBE_API_KEY$|KINOPOISK_UNOFFICIAL_API_KEY$)/i.test(key),
));
env.WATCHNEXT_COMPOSE_DB_USER = "e2e";
env.WATCHNEXT_COMPOSE_DB_PASSWORD = randomBytes(24).toString("base64url");
env.WATCHNEXT_COMPOSE_DB_NAME = "e2e";
env.YOUTUBE_API_KEY = "";
env.KINOPOISK_UNOFFICIAL_API_KEY = "";
const projects = [];
let stage = "setup", failed = false, browser, interrupted = false;
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { interrupted = true; void browser?.close().catch(() => {}); });
function checkInterrupted() { if (interrupted) throw new Error("Interrupted."); }
function docker(args, timeout = 30000, allowFailure = false) {
  const result = spawnSync("docker", args, { cwd: root, env, encoding: "utf8", windowsHide: true, timeout, maxBuffer: 4 * 1024 * 1024 });
  if ((result.error || result.status !== 0) && !allowFailure) throw new Error(`Docker command failed during ${stage}.`);
  return result;
}
function lines(args) { return docker(args).stdout.trim().split(/\r?\n/).filter(Boolean); }
function compose(project, args, timeout = 30000, allowFailure = false) { return docker([...project.args, ...args], timeout, allowFailure); }
function inspect(id) { return JSON.parse(docker(["inspect", id]).stdout)[0]; }
function assertOwnedTemp() {
  if (!resolve(temp).startsWith(`${tempBase}${sep}`) || !basename(temp).startsWith("watchnext-readiness-")) throw new Error("Unsafe temporary path.");
}
function newProject(negative) {
  const name = `watchnext-readiness-${randomBytes(10).toString("hex")}`;
  if (!/^watchnext-readiness-[a-f0-9]{20}$/.test(name)) throw new Error("Invalid test project name.");
  for (const resource of ["container", "network", "volume"]) {
    const flags = resource === "container" ? ["--all", "--quiet"] : ["--quiet"];
    if (lines([resource, "ls", ...flags, "--filter", `label=com.docker.compose.project=${name}`]).length) throw new Error("Test project already exists.");
  }
  if (docker(["volume", "inspect", `${name}_postgres-data`], 30000, true).status === 0) throw new Error("Test volume already exists.");
  const args = ["compose", "--project-name", name, "--project-directory", root, "--env-file", envFile, "-f", join(root, "docker-compose.yaml")];
  // The image declares an unused /data volume for SQLite. A private tmpfs
  // prevents anonymous Docker volumes from accumulating in these PG checks.
  args.push("-f", isolationFile);
  if (image) args.push("-f", imageFile);
  if (negative) args.push("-f", unhealthyFile);
  const project = { name, args, started: false };
  const config = JSON.parse(compose(project, ["config", "--format", "json"]).stdout);
  const volumes = Object.values(config.volumes ?? {});
  if (volumes.length !== 1 || volumes[0].name !== `${name}_postgres-data` || volumes[0].external === true) throw new Error("Compose volume is not isolated.");
  projects.push(project);
  return project;
}
async function freePort() {
  return await new Promise((done, reject) => {
    const server = createServer(); server.once("error", reject);
    server.listen(0, "127.0.0.1", () => { const port = server.address().port; server.close(error => error ? reject(error) : done(port)); });
  });
}
function container(project, service) {
  const id = compose(project, ["ps", "--all", "--quiet", service]).stdout.trim();
  if (!id) return null;
  const value = inspect(id);
  if (value.Config?.Labels?.["com.docker.compose.project"] !== project.name || value.Config?.Labels?.["com.docker.compose.service"] !== service) throw new Error("Container ownership mismatch.");
  return value;
}
function cleanup(project) {
  const down = compose(project, ["down", "--remove-orphans"], 120000, true);
  if (down.error || down.status !== 0) throw new Error("Could not stop the isolated Compose project.");
  const volumes = lines(["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project.name}`]);
  for (const volume of volumes) {
    if (volume !== `${project.name}_postgres-data`) throw new Error("Unexpected test volume.");
    const labels = JSON.parse(docker(["volume", "inspect", volume, "--format", "{{json .Labels}}"]).stdout);
    if (labels?.["com.docker.compose.project"] !== project.name || labels?.["com.docker.compose.volume"] !== "postgres-data") throw new Error("Volume ownership mismatch.");
    docker(["volume", "rm", volume]);
  }
  if (lines(["volume", "ls", "--quiet", "--filter", `label=com.docker.compose.project=${project.name}`]).length) throw new Error("Owned volume cleanup incomplete.");
}

try {
  assertOwnedTemp();
  writeFileSync(envFile, "", { mode: 0o600, flag: "wx" });
  writeFileSync(isolationFile, JSON.stringify({ services: { app: { tmpfs: ["/data"] } } }), { mode: 0o600, flag: "wx" });
  if (image) {
    stage = "checking the requested local image";
    if (docker(["image", "inspect", image], 30000, true).status !== 0) throw new Error("Requested local image does not exist.");
    writeFileSync(imageFile, JSON.stringify({ services: { app: { image } } }), { mode: 0o600, flag: "wx" });
  }
  writeFileSync(unhealthyFile, JSON.stringify({ services: { postgres: { healthcheck: { test: ["CMD-SHELL", "exit 1"], interval: "1s", timeout: "1s", retries: 2, start_period: "0s" } } } }), { mode: 0o600, flag: "wx" });
  env.WATCHNEXT_COMPOSE_PORT = String(await freePort());
  const origin = `http://localhost:${env.WATCHNEXT_COMPOSE_PORT}`;
  stage = "starting healthy Compose services";
  const success = newProject(false); success.started = true;
  compose(success, ["up", "-d", image ? "--no-build" : "--build", "--wait", "--wait-timeout", "180"], 600000);
  checkInterrupted();
  const postgres = container(success, "postgres"), app = container(success, "app");
  if (postgres?.State?.Health?.Status !== "healthy" || app?.State?.Status !== "running") throw new Error("Healthy database or running application not observed.");
  const ready = postgres.State.Health.Log.find(entry => entry.ExitCode === 0);
  if (!ready || Date.parse(ready.End) > Date.parse(app.State.StartedAt)) throw new Error("PostgreSQL readiness was not observed before application start.");
  console.log("PASS: PostgreSQL became healthy before the application started.");
  stage = "checking Chromium installation (run pnpm exec playwright install chromium if missing)";
  if (!existsSync(chromium.executablePath())) throw new Error("Chromium is missing.");
  stage = "checking the site and API";
  browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--no-first-run"] });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage(); page.setDefaultTimeout(30000); page.setDefaultNavigationTimeout(30000);
  const home = await page.goto(origin); if (!home?.ok()) throw new Error("Home page returned an error.");
  await page.getByRole("tab", { name: "Sign in", exact: true }).waitFor();
  const api = await page.request.get(`${origin}/v1/context`, { timeout: 10000 }); if (!api.ok()) throw new Error("Context API returned an error.");
  await context.close(); await browser.close(); browser = undefined;
  console.log("PASS: Playwright received successful home and /v1/context responses.");
  stage = "checking the unhealthy PostgreSQL refusal";
  env.WATCHNEXT_COMPOSE_PORT = String(await freePort());
  const negative = newProject(true); negative.started = true;
  const attempt = compose(negative, ["up", "-d", image ? "--no-build" : "--build", "--wait", "--wait-timeout", "30"], 90000, true);
  checkInterrupted();
  if (attempt.error || attempt.status === 0 || !/unhealthy/i.test(`${attempt.stdout}\n${attempt.stderr}`)) throw new Error("Expected Compose to refuse startup because PostgreSQL is unhealthy.");
  const unhealthy = container(negative, "postgres"), blocked = container(negative, "app");
  if (unhealthy?.State?.Health?.Status !== "unhealthy") throw new Error("Test PostgreSQL did not become unhealthy.");
  if (blocked && (blocked.State?.Running || (blocked.State?.StartedAt && !blocked.State.StartedAt.startsWith("0001-01-01")))) throw new Error("Application started despite unhealthy PostgreSQL.");
  console.log("PASS: Compose refused to start the app when the test PostgreSQL healthcheck was unhealthy.");
} catch (error) {
  failed = true;
  // Tool and browser errors can contain private environment or page details.
  console.error(`FAIL: ${stage} (${error instanceof Error ? error.name : "Error"}).`);
} finally {
  await browser?.close().catch(() => { failed = true; });
  for (const project of projects.reverse()) if (project.started) {
    try { cleanup(project); } catch { failed = true; console.error(`FAIL: could not safely clean isolated ${project.name} resources.`); }
  }
  try {
    assertOwnedTemp();
    for (const file of [envFile, imageFile, isolationFile, unhealthyFile]) if (existsSync(file)) unlinkSync(file);
    rmdirSync(temp);
  } catch { failed = true; console.error("FAIL: could not remove the owned temporary configuration."); }
}
if (failed) process.exitCode = 1;
else console.log(`PASS: isolated Compose readiness checks completed; ${image ? "caller-selected prebuilt image" : "fresh checkout build"}; owned resources removed.`);
