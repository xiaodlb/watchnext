import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, lstatSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "playwright";
import { initializeDatabase } from "../../db/connection.ts";
export const repo = fileURLToPath(new URL("../../", import.meta.url));
export function assertOwnedRoot(root) {
  if (dirname(resolve(root)) !== realpathSync.native(tmpdir()) || !/^watchnext-e2e-[A-Za-z0-9]+$/.test(basename(root)) || lstatSync(root).isSymbolicLink() || realpathSync.native(root) !== resolve(root)) throw new Error("Refusing cleanup outside owned E2E root");
}
function assertSentinelRoot(root) {
  if (dirname(resolve(root)) !== realpathSync.native(tmpdir()) || !/^watchnext-e2e-sentinels-[A-Za-z0-9]+$/.test(basename(root)) || lstatSync(root).isSymbolicLink() || realpathSync.native(root) !== resolve(root)) throw new Error("Refusing cleanup outside owned sentinel root");
}
export function safeDiagnostic(error, secrets, root, extraRoots = []) {
  let value = error instanceof Error ? `${error.name}: ${error.message.split("\n")[0]}` : "Unknown failure";
  if (typeof error?.code === "string" && error.code.includes("SQLITE")) value = "DatabaseError: Expected isolated database invariant; observed database check failure. Run unit/schema checks for diagnostics.";
  for (const secret of secrets) if (secret) value = value.split(secret).join("<redacted>");
  for (const path of [root, ...extraRoots]) if (path) value = value.split(path).join("<fixture>");
  return value.replace(/\/invite\/[^\s"']+/g, "/invite/<redacted>").replace(/[A-Za-z0-9_-]{43}/g, "<redacted>").split(repo).join("<repo>").slice(0, 500);
}
export async function createFixture() {
  const net = createServer(); await new Promise((done, fail) => { net.once("error", fail); net.listen(0, "127.0.0.1", done); }); const port = net.address().port; await new Promise(done => net.close(done));
  const root = mkdtempSync(join(realpathSync.native(tmpdir()), "watchnext-e2e-")); assertOwnedRoot(root);
  let sentinelRoot;
  const path = join(root, "journey.sqlite"), secrets = [randomBytes(32).toString("base64url"), randomBytes(32).toString("base64url")], sentinels = [];
  try {
    sentinelRoot = mkdtempSync(join(realpathSync.native(tmpdir()), "watchnext-e2e-sentinels-")); assertSentinelRoot(sentinelRoot);
    for (const name of ["normal-user.sqlite", "separate-demo.sqlite", "unrelated.txt"]) {
      const file = join(sentinelRoot, name);
      if (name.endsWith(".sqlite")) { const sentinel = new DatabaseSync(file); try { sentinel.exec("CREATE TABLE sentinel(value TEXT); INSERT INTO sentinel VALUES ('Unrelated synthetic sentinel')"); } finally { sentinel.close(); } }
      else writeFileSync(file, "Unrelated synthetic sentinel");
      sentinels.push({ file, original: readFileSync(file) });
    }
  } catch (error) {
    assertOwnedRoot(root); rmSync(root, { recursive: true, force: true }); if (sentinelRoot) { assertSentinelRoot(sentinelRoot); rmSync(sentinelRoot, { recursive: true, force: true }); } throw error;
  }
  const origin = `http://127.0.0.1:${port}`;
  const environment = { ...process.env, HOME: join(root, "fake-home"), USERPROFILE: join(root, "fake-home"), LOCALAPPDATA: join(root, "normal-default"), XDG_DATA_HOME: join(root, "normal-default"), WATCHNEXT_DATABASE_PATH: path, WATCHNEXT_APP_ORIGIN: origin, YOUTUBE_API_KEY: secrets[0], KINOPOISK_UNOFFICIAL_API_KEY: secrets[1], NEXT_TELEMETRY_DISABLED: "1" };
  let server, building, browser, db, output = "", cleaned = false, cleanupComplete = false;
  const capture = child => { child.stdout.on("data", value => { output += value; }); child.stderr.on("data", value => { output += value; }); child.on("error", () => {}); return child; };
  const stop = async child => {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    const ended = new Promise(done => child.once("exit", done)); child.kill();
    let timer; try { await Promise.race([ended, new Promise((_, fail) => { timer = setTimeout(() => fail(new Error("Owned child failed to stop within 10 seconds")), 10000); })]); } finally { clearTimeout(timer); }
  };
  // Other isolated test workers may finish their own production build while
  // this audit runs. A file observed during directory enumeration can then be
  // gone before readFileSync. It is not part of this fixture and must not turn
  // a successful fixture cleanup into an ENOENT failure.
  const files = directory => {
    try {
      return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(join(directory, entry.name)) : [join(directory, entry.name)]);
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  };
  const fixture = {
    root, path, origin, secrets, sentinelRoot, get db() { return db; }, get browser() { return browser; }, get cleanupComplete() { return cleanupComplete; },
    initialize() {
      if(db)throw new Error("Fixture database already initialized");
      initializeDatabase({ WATCHNEXT_DATABASE_PATH: path });
      db = new DatabaseSync(path, { readOnly: true }); db.exec("PRAGMA busy_timeout=5000;");
    },
    async build() {
      fixture.initialize();
      building = capture(spawn(process.execPath, [join(repo, "node_modules/next/dist/bin/next"), "build"], { cwd: repo, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }));
      let timer;
      try { await new Promise((done, fail) => { timer = setTimeout(() => { void stop(building).then(() => fail(new Error("Production build exceeded five minutes")), fail); }, 300000); building.once("error", fail); building.once("exit", code => code === 0 ? done() : fail(new Error(`Production build failed (exit ${code}); run pnpm build for compiler diagnostics`))); }); }
      finally { clearTimeout(timer); }
    },
    async stop() { await stop(server); server = undefined; },
    async start(configured = true, database = path) {
      server = capture(spawn(process.execPath, ["--import", pathToFileURL(join(repo, "scripts/framework-privacy.mjs")).href, "--import", pathToFileURL(join(repo, "tests/e2e/provider-preload.mjs")).href, join(repo, "node_modules/next/dist/bin/next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: repo, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...environment, WATCHNEXT_DATABASE_PATH: database, YOUTUBE_API_KEY: configured ? secrets[0] : "", KINOPOISK_UNOFFICIAL_API_KEY: configured ? secrets[1] : "" } }));
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) {
        if (server.exitCode !== null) throw new Error(`Production server exited before readiness (${server.exitCode})`);
        try { if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) return; } catch {}
        await new Promise(done => setTimeout(done, 100));
      }
      throw new Error("Production server not ready within 30 seconds");
    },
    async restart(configured = true, database = path) { await fixture.stop(); await fixture.start(configured, database); },
    async launch() {
      if (!existsSync(chromium.executablePath())) throw new Error("Chromium is missing: run pnpm exec playwright install chromium (Linux CI: add --with-deps)");
      browser = await chromium.launch({ headless: true, args: ["--disable-background-networking", "--no-first-run"] });
    },
    async context(width) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, serviceWorkers: "block" }); context.setDefaultTimeout(15000); context.setDefaultNavigationTimeout(20000);
      await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
      return context;
    },
    async audit() {
      if (secrets.some(secret => output.includes(secret))) throw new Error("Raw synthetic credential found in captured routine output");
      for (const file of [...(existsSync(join(repo, ".next")) ? files(join(repo, ".next")) : []), ...files(root)]) {
        let content;
        try { content = readFileSync(file); }
        catch (error) { if (error?.code === "ENOENT") continue; throw error; }
        if (secrets.some(secret => content.includes(Buffer.from(secret)))) throw new Error("Raw synthetic credential found in generated artifacts/database");
      }
      for (const { file, original } of sentinels) if (!readFileSync(file).equals(original)) throw new Error("Unrelated normal/demo/file sentinel changed");
      if (existsSync(join(root, "normal-default"))) throw new Error("Unexpected fallback to default storage");
    },
    async cleanup() {
      if (cleaned) return; cleaned = true;
      const errors = [];
      for (const action of [() => browser?.close(), () => stop(server), () => stop(building), () => db?.close()]) try { await action(); } catch (error) { errors.push(error); }
      try { await fixture.audit(); } catch (error) { errors.push(error); }
      assertOwnedRoot(root); rmSync(root, { recursive: true, force: true });
      // Neighbouring sentinel data must survive data-root cleanup, too.
      try { for (const { file, original } of sentinels) if (!readFileSync(file).equals(original)) throw new Error("Neighbour sentinel changed during cleanup"); } catch (error) { errors.push(error); }
      assertSentinelRoot(sentinelRoot); rmSync(sentinelRoot, { recursive: true, force: true });
      if (errors.length) throw errors[0];
      cleanupComplete = true;
    },
  };
  return fixture;
}
