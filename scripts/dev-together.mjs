import { accessSync, constants, existsSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveDatabasePath } from "../db/config.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const frontend = join(root, "lovable-frontend");
const configuredOrigin = process.env.WATCHNEXT_APP_ORIGIN ?? "http://127.0.0.1:3000";
let origin;
try {
  origin = new URL(configuredOrigin);
  if (origin.protocol !== "http:" || origin.hostname !== "127.0.0.1" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash || origin.origin !== configuredOrigin) throw new Error();
} catch {
  console.error("WATCHNEXT_APP_ORIGIN must be an exact local origin such as http://127.0.0.1:3000.");
  process.exit(1);
}
const frontendPort = Number(origin.port || 80);
const backendPort = Number(process.env.WATCHNEXT_BACKEND_PORT ?? "3100");
if (!Number.isInteger(backendPort) || backendPort < 1024 || backendPort > 65535 || backendPort === frontendPort) {
  console.error("WATCHNEXT_BACKEND_PORT must be a different local port between 1024 and 65535.");
  process.exit(1);
}

// Use precisely the same data file as the pre-existing app, without resetting,
// creating, migrating, or seeding it during server startup.
const databasePath = resolveDatabasePath(process.env, root);
try {
  if (!existsSync(databasePath)) throw new Error("database not found");
  accessSync(databasePath, constants.R_OK | constants.W_OK);
  const db = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
    if (versions.map((row) => row.version).join(",") !== "0001,0002,0003,0004,0005") throw new Error("database migrations are incomplete");
  } finally { db.close(); }
} catch (error) {
  console.error(`WatchNext database unavailable (${error.message}). Run pnpm db:init, then pnpm dev.`);
  process.exit(1);
}

// A fresh pnpm install can leave the generated Prisma client absent. Generating
// from the checked-in schema writes only node_modules; it does not migrate data.
try {
  const localRequire = createRequire(import.meta.url);
  const prismaRequire = createRequire(localRequire.resolve("@prisma/client"));
  prismaRequire.resolve(".prisma/client/default");
} catch {
  console.log("Preparing the Prisma client from the existing schema...");
  const result = spawnSync(process.execPath, [join(root, "node_modules/prisma/build/index.js"),
    "generate", "--schema", join(root, "prisma/schema.prisma")], {
    cwd: root, env: { ...process.env, DATABASE_URL: pathToFileURL(databasePath).href }, stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function requireFreePort(port) {
  await new Promise((resolvePort, reject) => {
    const probe = createServer();
    probe.once("error", () => reject(new Error(`Port ${port} is already in use. Stop the existing server and retry.`)));
    probe.listen(port, "127.0.0.1", () => probe.close(resolvePort));
  });
}
try {
  await requireFreePort(frontendPort);
  await requireFreePort(backendPort);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const env = {
  ...process.env,
  WATCHNEXT_APP_ORIGIN: origin.origin,
  WATCHNEXT_DATABASE_PATH: databasePath,
  WATCHNEXT_HTTP_REPOSITORY: "prisma",
  WATCHNEXT_PRIVATE_API: "1",
  WATCHNEXT_HTTP_PRISMA_DATABASE_URL: pathToFileURL(databasePath).href,
  WATCHNEXT_BACKEND_ORIGIN: `http://127.0.0.1:${backendPort}`,
};
const backend = spawn(process.execPath, ["--import", pathToFileURL(join(root, "scripts/framework-privacy.mjs")).href,
  join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(backendPort)],
  { cwd: root, env, stdio: "inherit" });
const ui = spawn(process.execPath, [join(frontend, "node_modules/vite/bin/vite.js"),
  "--host", "127.0.0.1", "--port", String(frontendPort), "--strictPort"],
  { cwd: frontend, env, stdio: "inherit" });

let exiting = false;
function shutdown(code) {
  if (exiting) return;
  exiting = true;
  for (const child of [backend, ui]) if (!child.killed && child.exitCode === null) child.kill();
  process.exitCode = code;
}
for (const child of [backend, ui]) {
  child.on("error", (error) => { console.error(`Could not start WatchNext: ${error.message}`); shutdown(1); });
  child.on("exit", (code) => { if (!exiting) shutdown(code === 0 ? 1 : code ?? 1); });
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
