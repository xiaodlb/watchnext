import { accessSync, constants, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { resolveDatabasePath } from "../db/config.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const provider = process.env.WATCHNEXT_HTTP_PRISMA_PROVIDER ?? "postgresql";
const configuredOrigin = process.env.WATCHNEXT_APP_ORIGIN ?? "http://127.0.0.1:3000";
const publicPort = Number(process.env.PORT ?? "3000");
let databaseUrl;
try {
  if (!Number.isInteger(publicPort) || publicPort < 1 || publicPort > 65535 || publicPort === 3101) throw new Error("PORT must be a valid port other than 3101.");
  const origin = new URL(configuredOrigin);
  if (!["http:", "https:"].includes(origin.protocol) || origin.origin !== configuredOrigin || origin.username || origin.password) {
    throw new Error("WATCHNEXT_APP_ORIGIN must be the exact public HTTP or HTTPS origin, without a path or trailing slash.");
  }
  if (provider === "postgresql") {
    databaseUrl = process.env.WATCHNEXT_POSTGRES_URL ?? process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL;
    // Compose passes discrete credentials rather than interpolating a URL so
    // special characters in the username, password and database are encoded.
    if (!databaseUrl && process.env.WATCHNEXT_COMPOSE_DB_HOST) {
      const host = process.env.WATCHNEXT_COMPOSE_DB_HOST;
      const user = encodeURIComponent(process.env.WATCHNEXT_COMPOSE_DB_USER ?? "");
      const password = encodeURIComponent(process.env.WATCHNEXT_COMPOSE_DB_PASSWORD ?? "");
      const name = encodeURIComponent(process.env.WATCHNEXT_COMPOSE_DB_NAME ?? "");
      databaseUrl = `postgresql://${user}:${password}@${host}:5432/${name}?schema=public`;
    }
    let parsed;
    try { parsed = new URL(databaseUrl); } catch { throw new Error("Set WATCHNEXT_POSTGRES_URL to a valid PostgreSQL connection URL."); }
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname === "/") {
      throw new Error("Set WATCHNEXT_POSTGRES_URL to a valid PostgreSQL connection URL.");
    }
    if (!existsSync(resolve(root, "generated/postgres-client/index.js"))) throw new Error("PostgreSQL Prisma client is missing from the image.");
  } else if (provider === "sqlite") {
    const database = resolveDatabasePath(process.env, root);
    if (!existsSync(database)) throw new Error("SQLite database not initialized. Run scripts/db/init.mjs with the same /data volume first.");
    accessSync(database, constants.R_OK | constants.W_OK);
    const db = new DatabaseSync(database, { readOnly: true });
    try {
      const versions = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
      if (versions.map(row => row.version).join(",") !== "0001,0002,0003,0004,0005") {
        throw new Error("SQLite migrations are incomplete. Run scripts/db/init.mjs with the same /data volume first.");
      }
    } finally { db.close(); }
    databaseUrl = pathToFileURL(database).href;
  } else {
    throw new Error("WATCHNEXT_HTTP_PRISMA_PROVIDER must be postgresql or sqlite.");
  }
} catch (error) {
  console.error(`Cannot start WatchNext: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

// Automatic deployment is explicitly enabled by Compose for its own database.
// Deploy applies pending migrations and does not reset or copy existing data.
if (provider === "postgresql" && process.env.WATCHNEXT_APPLY_MIGRATIONS === "1") {
  const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "prisma/postgresql/schema.prisma"], {
    cwd: root,
    env: { ...process.env, WATCHNEXT_POSTGRES_URL: databaseUrl },
    stdio: "inherit",
  });
  if (migration.error || migration.status !== 0) {
    console.error("PostgreSQL migration failed. The application was not started.");
    process.exit(migration.status ?? 1);
  }
}

const common = {
  ...process.env,
  WATCHNEXT_HTTP_REPOSITORY: "prisma",
  WATCHNEXT_HTTP_PRISMA_PROVIDER: provider,
  WATCHNEXT_HTTP_PRISMA_DATABASE_URL: databaseUrl,
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
