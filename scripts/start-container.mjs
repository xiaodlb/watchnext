import { accessSync, constants, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { resolveDatabasePath } from "../db/config.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const database = resolveDatabasePath(process.env, root);
const configuredOrigin = process.env.WATCHNEXT_APP_ORIGIN ?? "http://127.0.0.1:3000";
const publicPort = Number(process.env.PORT ?? "3000");
try {
  if (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65535 || publicPort === 3101) throw new Error("PORT must be a valid port other than 3101.");
  const origin = new URL(configuredOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== configuredOrigin || origin.username || origin.password) {
    throw new Error("WATCHNEXT_APP_ORIGIN must be the exact public HTTP or HTTPS origin, without a path or trailing slash.");
  }
  if (!existsSync(database)) throw new Error("Database not initialized. Run scripts/db/init.mjs with the same /data volume first.");
  accessSync(database, constants.R_OK | constants.W_OK);
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
    if (versions.map(row => row.version).join(",") !== "0001,0002,0003,0004,0005") {
      throw new Error("Database migrations are incomplete. Run scripts/db/init.mjs with the same /data volume first.");
    }
  } finally { db.close(); }
} catch (error) {
  console.error(`Cannot start WatchNext: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const common = {
  ...process.env,
  WATCHNEXT_HTTP_REPOSITORY: "prisma",
  WATCHNEXT_HTTP_PRISMA_DATABASE_URL: pathToFileURL(database).href,
  WATCHNEXT_APP_ORIGIN: configuredOrigin,
};
const frontend = spawn(process.execPath, ["lovable-frontend/.output/server/index.mjs"], {
  cwd: root, stdio: "inherit", env: { ...common, NITRO_HOST: "127.0.0.1", NITRO_PORT: "3101" },
});
const backend = spawn(process.execPath, ["--import", "./scripts/framework-privacy.mjs", "./node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0", "--port", String(publicPort)], {
  cwd: root, stdio: "inherit", env: { ...common, WATCHNEXT_PRIVATE_API: "1", WATCHNEXT_CONTAINER_MODE: "1" },
});

let stopping = false;
function shutdown(code) {
  if (stopping) return;
  stopping = true;
  for (const child of [frontend, backend]) if (!child.killed && child.exitCode === null) child.kill("SIGTERM");
  process.exitCode = code;
}
for (const child of [frontend, backend]) {
  child.on("error", error => { console.error(`Could not start WatchNext: ${error.message}`); shutdown(1); });
  child.on("exit", code => { if (!stopping) shutdown(code === 0 ? 1 : code ?? 1); });
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
