// @vitest-environment node
// Issue #48 evidence (_docs/prisma-baseline.md §7): Prisma mapping, byte-exact baseline, inventory,
// data-preserving `migrate resolve --applied` on owned populated copies, rollback, client reads and
// constraint survival. Every Prisma CLI call is a child process that only sees owned `file:` URLs.
// Native (node:sqlite) and Prisma (better-sqlite3) connections never overlap on one file.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveDatabasePath } from "../../db/config";
import { assertCurrentSchema } from "../../db/migrate";
import {
  BASELINE_NAME, TABLES, canonicalDump, createNativeDatabase, integrity, inventory, logicalSnapshot, markClosed, markOpen,
  nativeLedger, openHandles, populateF1, populateF2, synthetic, withNative, type Inventory,
} from "./prisma-baseline-fixture";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const prismaCli = join(repo, "node_modules", "prisma", "build", "index.js");
const snapshotCli = join(repo, "scripts", "db", "snapshot.mjs");
const baselineSql = join(repo, "prisma", "migrations", BASELINE_NAME, "migration.sql");
const schemaPath = join(repo, "prisma", "schema.prisma");
const STRFTIME_DBGENERATED = `@default(dbgenerated("(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"))`;
const STRFTIME_LITERAL = `@default("strftime('%Y-%m-%dT%H:%M:%fZ', 'now')")`;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CLI_TIMEOUT = 120_000;

let root: string;
let isolated: { home: string; xdg: string; local: string };
const cliLog: { args: string[]; url?: string; status: number | null }[] = [];

// ------------------------------------------------------------------------------------------------
// Owned paths, child-process Prisma CLI and the real snapshot helper
// ------------------------------------------------------------------------------------------------

function owned(name: string): string {
  const path = join(root, name);
  if (relative(root, path).startsWith("..")) throw new Error("Path escapes the owned root");
  return path;
}

function childEnvironment(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  // No inherited WatchNext/Prisma database variable may reach a child (removes WATCHNEXT_DATABASE_PATH).
  for (const key of Object.keys(environment)) if (/^(WATCHNEXT_|DATABASE_URL$|PRISMA_)/.test(key)) delete environment[key];
  return {
    ...environment,
    HOME: isolated.home, USERPROFILE: isolated.home, XDG_DATA_HOME: isolated.xdg, XDG_CACHE_HOME: join(isolated.home, ".cache"),
    XDG_CONFIG_HOME: join(isolated.home, ".config"), LOCALAPPDATA: isolated.local, APPDATA: isolated.local,
    CHECKPOINT_DISABLE: "1", PRISMA_HIDE_UPDATE_MESSAGE: "1", NO_COLOR: "1",
    ...extra,
  };
}

function fileUrl(path: string): string {
  if (relative(root, path).startsWith("..") || !path.startsWith(root)) throw new Error("Prisma may only reach owned files");
  return `file:${path}`;
}

/** Runs `prisma <args>` as a child process. `database`/`shadow` are owned file paths. */
function prisma(args: string[], database?: string, shadow?: string): SpawnSyncReturns<string> {
  const extra: Record<string, string> = {};
  if (database) extra.WATCHNEXT_PRISMA_DATABASE_URL = fileUrl(database);
  if (shadow) extra.WATCHNEXT_PRISMA_SHADOW_DATABASE_URL = fileUrl(shadow);
  const result = spawnSync(process.execPath, [prismaCli, ...args], { cwd: repo, env: childEnvironment(extra), encoding: "utf8", timeout: CLI_TIMEOUT });
  cliLog.push({ args, url: extra.WATCHNEXT_PRISMA_DATABASE_URL, status: result.status });
  return result;
}
const output = (result: SpawnSyncReturns<string>) => `${result.stdout}\n${result.stderr}`;

let shadowCounter = 0;
/** D2: `migrate diff --from-migrations prisma/migrations --to-config-datasource --exit-code` with an owned shadow file. */
function diffMigrationsToDatabase(database: string): SpawnSyncReturns<string> {
  return prisma(["migrate", "diff", "--from-migrations", "prisma/migrations", "--to-config-datasource", "--exit-code"], database, owned(`shadow-${++shadowCounter}.sqlite`));
}

/** B1: the real `pnpm db:snapshot` script, run as its own process. */
function snapshot(source: string, destination: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [snapshotCli, source, destination], { cwd: repo, env: childEnvironment(), encoding: "utf8", timeout: CLI_TIMEOUT });
}
function copyOwned(source: string, destination: string): string {
  const result = snapshot(source, destination);
  if (result.status !== 0) throw new Error(`Owned snapshot copy failed: ${output(result)}`);
  return destination;
}

function rawMaster(path: string) {
  return withNative(path, (db) => db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master ORDER BY type, name").all().map((row) => ({ ...row })), { readOnly: true });
}
function prismaLedger(path: string) {
  return withNative(path, (db) => {
    const exists = db.prepare("SELECT count(*) AS count FROM sqlite_master WHERE type = 'table' AND name = '_prisma_migrations'").get() as { count: number };
    return exists.count ? db.prepare("SELECT * FROM _prisma_migrations").all().map((row) => ({ ...row })) : null;
  }, { readOnly: true });
}

// ------------------------------------------------------------------------------------------------
// Path C: data-preserving baseline of an owned populated current-revision copy (§6)
// ------------------------------------------------------------------------------------------------

class BaselineRefused extends Error {}
type PathCResult = { outcome: "baselined" | "already-baselined"; backup: string; before: Record<string, unknown[]>; beforeMaster: unknown[] };
let referenceInventory: Inventory;

function pathC(source: string, backup: string): PathCResult {
  // 1. New backup with the real snapshot helper (it also refuses a mismatched native ledger).
  const backed = snapshot(source, backup);
  if (backed.status !== 0) throw new BaselineRefused(`snapshot refused: ${output(backed).trim()}`);
  // 2. Native guard, integrity and foreign keys.
  const before = withNative(source, (db) => {
    try { assertCurrentSchema(db); } catch (error) { throw new BaselineRefused(`native ledger: ${(error as Error).message}`); }
    const health = integrity(db);
    if (health.integrity !== "ok" || health.foreignKeyViolations !== 0) throw new BaselineRefused("integrity/foreign keys");
    // 3a. Canonical inventory must equal path A: Prisma's own diff cannot see triggers or CHECKs.
    if (!isDeepStrictEqual(inventory(db), referenceInventory)) throw new BaselineRefused("inventory drift");
    return logicalSnapshot(db);
  }, { readOnly: true });
  const beforeMaster = rawMaster(source);
  // 3b. Prisma diff from the committed migration history to the copy.
  const diff = diffMigrationsToDatabase(source);
  if (diff.status !== 0) throw new BaselineRefused(`prisma diff: ${output(diff)}`);
  // 4. Status: already baselined is a no-op; anything else than "not yet applied" stops.
  const status = prisma(["migrate", "status"], source);
  if (status.status === 0 && /Database schema is up to date/.test(status.stdout)) return { outcome: "already-baselined", backup, before, beforeMaster };
  if (!new RegExp(`not yet been applied:\\s*${BASELINE_NAME}`).test(output(status))) throw new BaselineRefused(`unexpected status: ${output(status)}`);
  // 5. Record the baseline as applied without running its SQL.
  const resolved = prisma(["migrate", "resolve", "--applied", BASELINE_NAME], source);
  if (resolved.status !== 0) throw new Error(`resolve failed: ${output(resolved)}`);
  return { outcome: "baselined", backup, before, beforeMaster };
}

function expectBaselined(path: string, result: PathCResult) {
  const status = prisma(["migrate", "status"], path);
  expect(status.status, output(status)).toBe(0);
  expect(status.stdout).toContain("Database schema is up to date");
  const ledger = prismaLedger(path)!;
  expect(ledger).toHaveLength(1);
  expect(ledger[0]).toMatchObject({ migration_name: BASELINE_NAME, rolled_back_at: null, applied_steps_count: 0 });
  expect(ledger[0].finished_at).not.toBeNull();
  withNative(path, (db) => {
    expect(logicalSnapshot(db)).toEqual(result.before);
    expect(inventory(db)).toEqual(referenceInventory);
    expect(integrity(db)).toEqual({ integrity: "ok", foreignKeyViolations: 0 });
    expect(() => assertCurrentSchema(db)).not.toThrow();
  }, { readOnly: true });
  // Only `_prisma_migrations` (and its primary-key autoindex) was added.
  const added = rawMaster(path).filter((row) => !result.beforeMaster.some((old) => JSON.stringify(old) === JSON.stringify(row)));
  expect(added.map((row) => row.name).sort()).toEqual(["_prisma_migrations", "sqlite_autoindex__prisma_migrations_1"]);
  expect(rawMaster(path).length).toBe(result.beforeMaster.length + 2);
}

// ------------------------------------------------------------------------------------------------
// Schema parsing for D1/P1 (committed mapped schema and raw introspection)
// ------------------------------------------------------------------------------------------------

type ParsedModel = { model: string; table: string; columns: Record<string, string>; fieldToColumn: Record<string, string>; indexNames: string[] };
function parseSchema(text: string): ParsedModel[] {
  const blocks = [...text.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
  const modelNames = new Set(blocks.map((block) => block[1]));
  return blocks.map(([, model, body]) => {
    const columns: Record<string, string> = {}, fieldToColumn: Record<string, string> = {};
    let table = model;
    const indexNames = [...body.matchAll(/map: "([^"]+)"/g)].map((match) => match[1]).sort();
    for (const rawLine of body.split("\n")) {
      const line = rawLine.trim();
      if (!line || line.startsWith("//")) continue;
      const mapped = line.match(/^@@map\("([^"]+)"\)/);
      if (mapped) { table = mapped[1]; continue; }
      if (line.startsWith("@@")) continue;
      const field = line.match(/^(\w+)\s+(\w+)(\?|\[\])?/);
      if (!field || modelNames.has(field[2])) continue;
      const column = line.match(/@map\("([^"]+)"\)/)?.[1] ?? field[1];
      columns[column] = `${field[2]}${field[3] ?? ""}`;
      fieldToColumn[field[1]] = column;
    }
    return { model, table, columns, fieldToColumn, indexNames };
  });
}
/** Code only: drops block comments and whole-line `//`/`///` comments so documentation cannot satisfy or trip a check. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const byTable = (models: ParsedModel[]) => Object.fromEntries(models.map((model) => [model.table, model]));

// ------------------------------------------------------------------------------------------------
// Prisma client (generated by V1) with the official better-sqlite3 adapter
// ------------------------------------------------------------------------------------------------

type Delegate = { findMany: () => Promise<Record<string, unknown>[]>; create: (args: unknown) => Promise<Record<string, unknown>>; update: (args: unknown) => Promise<unknown>; delete: (args: unknown) => Promise<unknown> };
type Client = Record<string, Delegate> & { $disconnect(): Promise<void>; $queryRawUnsafe(sql: string, ...values: unknown[]): Promise<Record<string, unknown>[]>; $executeRawUnsafe(sql: string, ...values: unknown[]): Promise<number> };
let PrismaClient: new (options: { adapter: unknown }) => Client;

async function withPrisma<T>(path: string, work: (client: Client) => Promise<T>): Promise<T> {
  markOpen("prisma", path);
  const client = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: fileUrl(path), fileMustExist: true }) });
  try { return await work(client); } finally { await client.$disconnect(); markClosed("prisma", path); }
}
const delegateName = (model: string) => model[0].toLowerCase() + model.slice(1);
const sortRows = (rows: Record<string, unknown>[]) => rows.map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort()))).sort();

function driverCode(error: unknown): { prismaCode?: string; originalCode?: string; originalMessage?: string } {
  type Cause = { originalCode?: string; originalMessage?: string };
  const value = error as { code?: string; meta?: { driverAdapterError?: { cause?: Cause } }; cause?: Cause };
  const cause = value.meta?.driverAdapterError?.cause ?? value.cause;
  return { prismaCode: value.code, originalCode: cause?.originalCode, originalMessage: cause?.originalMessage };
}

// ------------------------------------------------------------------------------------------------
// Fixtures
// ------------------------------------------------------------------------------------------------

const files = {} as Record<"native" | "pathA" | "pathB" | "f1" | "f2", string>;

beforeAll(() => {
  root = mkdtempSync(join(realpathSync.native(tmpdir()), "watchnext-prisma-baseline-"));
  isolated = { home: owned("home"), xdg: owned("xdg"), local: owned("local") };
  for (const directory of Object.values(isolated)) mkdirSync(directory);
  files.native = owned("native.sqlite");
  createNativeDatabase(files.native);
  referenceInventory = withNative(files.native, inventory, { readOnly: true });
  files.f1 = owned("f1.sqlite");
  populateF1(files.f1);
  files.f2 = owned("f2.sqlite");
  populateF2(files.f2, root);
}, CLI_TIMEOUT);

afterAll(() => {
  if (!root) return;
  const base = realpathSync.native(tmpdir());
  if (dirname(resolve(root)) !== base || !/^watchnext-prisma-baseline-[A-Za-z0-9]+$/.test(basename(root))) throw new Error("Unsafe Prisma baseline test cleanup");
  rmSync(root, { recursive: true, force: true });
});

describe("issue #48 Prisma mapping and data-preserving SQLite baseline", () => {
  it("V1/S1: validate and generate need no database; datasource commands refuse without the explicit URL", async () => {
    const before = readdirSync(root).sort();
    for (const args of [["validate"], ["generate"]]) {
      const result = prisma(args);
      expect(result.status, output(result)).toBe(0);
    }
    expect(readdirSync(root).sort()).toEqual(before);
    const status = prisma(["migrate", "status"]);
    expect(status.status).not.toBe(0);
    expect(output(status)).toMatch(/datasource\.url property is required/);
    // The generated client is git-ignored output; load it with the official adapter.
    expect(readFileSync(join(repo, ".gitignore"), "utf8").split(/\r?\n/)).toContain("/generated/");
    ({ PrismaClient } = await import(/* @vite-ignore */ pathToFileURL(join(repo, "generated", "prisma", "client.ts")).href));
    const config = code(readFileSync(join(repo, "prisma.config.ts"), "utf8"));
    expect(config).toContain('schema: "prisma/schema.prisma"');
    expect(config).toContain('migrations: { path: "prisma/migrations" }');
    expect(config).not.toMatch(/WATCHNEXT_DATABASE_PATH|resolveDatabasePath|dotenv|loadEnv|["'`][^"'`\n]*\.env|homedir|LOCALAPPDATA|XDG_DATA_HOME|process\.env\[|\?\?|\|\|/);
    expect([...config.matchAll(/process\.env\.(\w+)/g)].map((match) => match[1])).toEqual(["WATCHNEXT_PRISMA_DATABASE_URL", "WATCHNEXT_PRISMA_SHADOW_DATABASE_URL"]);
  }, CLI_TIMEOUT);

  it("B4: the committed baseline equals the regenerated canonical dump and carries the native checksums", () => {
    const dump = withNative(files.native, canonicalDump, { readOnly: true });
    expect(dump).not.toContain("\r");
    const committed = readFileSync(baselineSql, "utf8");
    // Byte-exact on an LF checkout; a CRLF working copy (Windows autocrlf) is normalized exactly like native checksums.
    expect(committed.includes("\r\n") ? committed.replace(/\r\n/g, "\n") : committed).toBe(dump);
    for (const entry of nativeLedger()) {
      expect(committed).toContain(`INSERT INTO schema_migrations(version, filename, checksum) VALUES ('${entry.version}', '${entry.filename}', '${entry.checksum}');`);
    }
    expect(withNative(files.native, (db) => db.prepare("SELECT version, filename, checksum FROM schema_migrations ORDER BY version").all().map((row) => ({ ...row })), { readOnly: true })).toEqual(nativeLedger());
    expect(readFileSync(join(repo, "prisma", "migrations", "migration_lock.toml"), "utf8")).toMatch(/^provider = "sqlite"$/m);
    expect(readdirSync(join(repo, "prisma", "migrations")).sort()).toEqual([BASELINE_NAME, "migration_lock.toml"]);
  });

  it("I1: the native inventory has 19 STRICT tables, 18 triggers, 8 explicit and 29 automatic indexes, no partial index", () => {
    expect(referenceInventory.counts).toEqual({ tables: 19, triggers: 18, explicitIndexes: 8, partialIndexes: 0, autoindexes: 29, strictTables: 19 });
    expect(referenceInventory.strict.map((row) => row.name).sort()).toEqual([...TABLES].sort());
    expect(referenceInventory.master.filter((row) => row.type === "trigger").map((row) => row.name).sort()).toEqual([
      "account_context_monotonic", "genre_limit", "genre_limit_move", "group_access_immutable", "group_generation_monotonic",
      "group_session_legacy_insert", "group_session_legacy_update", "legacy_context_monotonic", "membership_generation_insert",
      "membership_generation_update", "membership_identity_immutable", "membership_owner_active_insert", "membership_owner_active_update",
      "membership_preserve", "membership_rejoin_generation", "protect_history_type", "timestamp_insert", "timestamp_update",
    ]);
    expect(referenceInventory.master.filter((row) => row.type === "index" && row.sql !== null).map((row) => row.name).sort()).toEqual([
      "account_memberships_live", "account_sessions_account", "groups_id_mode", "invitations_id_group", "metadata_expiry",
      "metadata_review_expiry", "pending_group_invitations_expiry", "titles_active",
    ]);
    const foreignKeys = referenceInventory.foreignKeys;
    expect(new Set(foreignKeys.map((row) => `${row.from_table}:${row.id}`)).size).toBe(27);
    const composite = new Set(foreignKeys.filter((row) => Number(row.seq) > 0).map((row) => `${row.from_table}:${row.id}`));
    expect(composite.size).toBe(13);
    expect(referenceInventory.moods).toHaveLength(5);
    expect(referenceInventory.ledger).toEqual(nativeLedger());
  });

  it("schema: 19 mapped models cover every table and column with the §4 mapping rules", () => {
    const text = readFileSync(schemaPath, "utf8");
    expect(text).toMatch(/generator client \{[^}]*provider\s+= "prisma-client"[^}]*output\s+= "\.\.\/generated\/prisma"[^}]*runtime\s+= "nodejs"[^}]*moduleFormat = "esm"/);
    const models = parseSchema(text);
    expect(models).toHaveLength(19);
    for (const model of models) expect(model.model).toMatch(/^[A-Z][A-Za-z]+$/);
    const mapped = byTable(models);
    expect(Object.keys(mapped).sort()).toEqual([...TABLES].sort());
    withNative(files.native, (db) => {
      for (const table of TABLES) {
        const columns = db.prepare("SELECT name, type, \"notnull\", pk FROM pragma_table_info(?)").all(table) as { name: string; type: string; notnull: number; pk: number }[];
        expect(Object.keys(mapped[table].columns).sort(), table).toEqual(columns.map((column) => column.name).sort());
        for (const column of columns) {
          const scalar = column.type === "INTEGER" ? "Int" : "String";
          // A primary-key column without NOT NULL is still required in Prisma.
          expect(mapped[table].columns[column.name], `${table}.${column.name}`).toBe(column.notnull || column.pk ? scalar : `${scalar}?`);
        }
      }
    }, { readOnly: true });
    expect(text.split(STRFTIME_DBGENERATED).length - 1).toBe(9);
    expect(code(text)).not.toMatch(/Boolean|BigInt|DateTime|onDelete: (?!NoAction)|onUpdate: (?!NoAction)/);
    expect(text).toMatch(/accountMemberships AccountMembership\[\]/);
    const autoindexNames = [...text.matchAll(/map: "(sqlite_autoindex_[^"]+)"/g)].map((match) => match[1]);
    expect(autoindexNames).toHaveLength(10);
    for (const name of ["invitations_id_group", "titles_active", "metadata_expiry", "metadata_review_expiry", "account_sessions_account", "groups_id_mode", "account_memberships_live", "pending_group_invitations_expiry"]) {
      expect(text).toContain(`map: "${name}"`);
    }
    const compositeRelations = [...text.matchAll(/@relation\(fields: \[(\w+), (\w+)(?:, \w+)?\]/g)];
    expect(compositeRelations).toHaveLength(13);
  });

  it("I1/path B: baseline deploy onto an empty owned file equals the native inventory and passes the native guard", () => {
    files.pathB = owned("path-b.sqlite");
    const deployed = prisma(["migrate", "deploy"], files.pathB);
    expect(deployed.status, output(deployed)).toBe(0);
    withNative(files.pathB, (db) => {
      expect(inventory(db)).toEqual(referenceInventory);
      expect(() => assertCurrentSchema(db)).not.toThrow();
      expect(integrity(db)).toEqual({ integrity: "ok", foreignKeyViolations: 0 });
    }, { readOnly: true });
    expect(prismaLedger(files.pathB)).toEqual([expect.objectContaining({ migration_name: BASELINE_NAME, rolled_back_at: null, applied_steps_count: 1 })]);
  }, CLI_TIMEOUT);

  it("path A and D2: native init then resolve on an empty owned file; Prisma diff is empty", () => {
    files.pathA = copyOwned(files.native, owned("path-a.sqlite"));
    const result = pathC(files.pathA, owned("path-a-backup.sqlite"));
    expect(result.outcome).toBe("baselined");
    expectBaselined(files.pathA, result);
    const diff = diffMigrationsToDatabase(files.pathA);
    expect(diff.status, output(diff)).toBe(0);
    expect(output(diff)).toContain("No difference detected");
  }, CLI_TIMEOUT);

  it("D1: raw `db pull --print` on F1 yields exactly the 19 tables and the committed column set", () => {
    const bare = owned("introspect.prisma");
    writeFileSync(bare, 'datasource db {\n  provider = "sqlite"\n}\n');
    const pulled = prisma(["db", "pull", "--print", "--schema", bare], files.f1);
    expect(pulled.status, output(pulled)).toBe(0);
    const introspected = byTable(parseSchema(pulled.stdout));
    const committed = byTable(parseSchema(readFileSync(schemaPath, "utf8")));
    expect(Object.keys(introspected).sort()).toEqual(Object.keys(committed).sort());
    expect(Object.keys(introspected)).toHaveLength(19);
    for (const table of Object.keys(committed)) {
      expect(introspected[table].columns, table).toEqual(committed[table].columns);
      expect(introspected[table].indexNames, table).toEqual(committed[table].indexNames);
    }
    expect(readFileSync(bare, "utf8")).toBe('datasource db {\n  provider = "sqlite"\n}\n');
  }, CLI_TIMEOUT);

  it("D3: committed schema differs from introspection only by the nine dbgenerated strftime defaults", () => {
    const committed = readFileSync(schemaPath, "utf8");
    const variant = committed.split(STRFTIME_DBGENERATED).join(STRFTIME_LITERAL);
    expect(committed.split(STRFTIME_DBGENERATED).length - 1).toBe(9);
    expect(variant.split(STRFTIME_LITERAL).length - 1).toBe(9);
    expect(code(variant)).not.toContain("dbgenerated");
    // Nothing else changed: undoing the nine replacements restores the committed file exactly.
    expect(variant.split(STRFTIME_LITERAL).join(STRFTIME_DBGENERATED)).toBe(committed);
    const copy = owned("schema-introspected-defaults.prisma");
    writeFileSync(copy, variant);
    const diff = prisma(["migrate", "diff", "--from-config-datasource", "--to-schema", copy, "--exit-code"], files.f1);
    expect(diff.status, output(diff)).toBe(0);
    expect(output(diff)).toContain("No difference detected");
  }, CLI_TIMEOUT);

  let f1Result: PathCResult;
  it("F1 + path C: populated current fixture is backed up, verified and baselined with every value preserved", () => {
    const snap = withNative(files.f1, logicalSnapshot, { readOnly: true });
    for (const table of TABLES) expect(snap[table].length, table).toBeGreaterThan(0);
    // Coverage of the populated fixture (prisma-baseline §7 F1).
    expect(snap.groups.map((row) => row.access_mode).sort()).toEqual(["account", "legacy"]);
    expect(snap.account_memberships.map((row) => `${row.member_id}:${row.status}:${row.joined_invite_generation}`)).toEqual(expect.arrayContaining(["mem-owner:active:1", "mem-removed:removed:1", "mem-rejoined:active:3"]));
    expect(snap.account_sessions.map((row) => row.context_revision)).toContain(9007199254740990);
    expect(snap.account_sessions.some((row) => row.revoked_at !== null)).toBe(true);
    expect(snap.account_sessions.some((row) => (row.expires_at as number) < Date.now() / 1000)).toBe(true);
    expect(snap.titles.map((row) => row.content_type)).toEqual(expect.arrayContaining(["movie", "series", "anime", "youtube", null]));
    expect(snap.titles.find((row) => row.metadata_unavailable === 1)).toMatchObject({ title: null, title_key: null, content_type: null, duration_seconds: null });
    expect(snap.titles.some((row) => row.archived === 1)).toBe(true);
    expect(snap.title_genres.filter((row) => row.title_id === "ttl-series")).toHaveLength(10);
    expect(new Set(snap.progress.map((row) => row.position_state))).toEqual(new Set(["unknown", "not_started", "in_progress"]));
    expect(snap.progress.some((row) => row.completed === 1)).toBe(true);
    const stale = snap.progress.find((row) => row.title_id === "ttl-youtube")!;
    expect(stale.timestamp_seconds as number).toBeGreaterThan(snap.titles.find((row) => row.id === "ttl-youtube")!.duration_seconds as number);
    expect(snap.notes.some((row) => String(row.body).includes("\n") && /[^\x00-\x7f]/.test(String(row.body)))).toBe(true);
    expect(new Set(snap.metadata_fields.map((row) => `${row.origin}:${row.cleared}`))).toEqual(new Set(["provider:0", "provider:1", "user:0"]));
    expect(snap.invitations.some((row) => row.revoked_at !== null) && snap.invitations.some((row) => row.generation === 3)).toBe(true);

    f1Result = pathC(files.f1, owned("f1-backup.sqlite"));
    expect(f1Result.outcome).toBe("baselined");
    expect(f1Result.before).toEqual(snap);
    expect(existsSync(f1Result.backup) && statSync(f1Result.backup).size > 0).toBe(true);
    expectBaselined(files.f1, f1Result);
    const diff = diffMigrationsToDatabase(files.f1);
    expect(diff.status, output(diff)).toBe(0);
  }, CLI_TIMEOUT);

  it("F2 + path D/C: legacy data written at 0001-0003, natively upgraded, then baselined unchanged", () => {
    const snap = withNative(files.f2, (db) => {
      expect(() => assertCurrentSchema(db)).not.toThrow();
      return logicalSnapshot(db);
    }, { readOnly: true });
    expect(snap.groups).toEqual([expect.objectContaining({ id: "old-group", access_mode: "legacy", owner_account_id: null, invite_generation: 1 })]);
    expect(snap.group_sessions).toEqual([expect.objectContaining({ context_revision: 0 })]);
    expect(snap.accounts).toEqual([]);
    const result = pathC(files.f2, owned("f2-backup.sqlite"));
    expect(result.outcome).toBe("baselined");
    expect(result.before).toEqual(snap);
    expectBaselined(files.f2, result);
    const diff = diffMigrationsToDatabase(files.f2);
    expect(diff.status, output(diff)).toBe(0);
  }, CLI_TIMEOUT);

  it("refusals: mismatched ledger and a dropped trigger stop before resolve; an already-baselined copy is a no-op", () => {
    // Mismatched native ledger.
    const mismatched = copyOwned(files.native, owned("refuse-ledger.sqlite"));
    withNative(mismatched, (db) => { db.exec("UPDATE schema_migrations SET checksum = 'mismatch' WHERE version = '0005'"); });
    const ledgerBefore = readFileSync(mismatched);
    expect(() => pathC(mismatched, owned("refuse-ledger-backup.sqlite"))).toThrow(BaselineRefused);
    expect(prismaLedger(mismatched)).toBeNull();
    expect(readFileSync(mismatched).equals(ledgerBefore)).toBe(true);

    // One trigger dropped: Prisma's diff stays empty, the inventory refuses.
    const dropped = copyOwned(files.native, owned("refuse-trigger.sqlite"));
    withNative(dropped, (db) => { db.exec("DROP TRIGGER membership_preserve"); });
    const blindDiff = diffMigrationsToDatabase(dropped);
    expect(blindDiff.status, output(blindDiff)).toBe(0);
    expect(output(blindDiff)).toContain("No difference detected");
    expect(() => pathC(dropped, owned("refuse-trigger-backup.sqlite"))).toThrow("inventory drift");
    expect(prismaLedger(dropped)).toBeNull();

    // Already baselined: detected by migrate status and left unchanged, no second resolve.
    const ledger = prismaLedger(files.f1);
    const again = pathC(files.f1, owned("f1-second-backup.sqlite"));
    expect(again.outcome).toBe("already-baselined");
    expect(prismaLedger(files.f1)).toEqual(ledger);
    expect(withNative(files.f1, logicalSnapshot, { readOnly: true })).toEqual(f1Result.before);
  }, CLI_TIMEOUT);

  it("B3: restoring the pre-baseline backup or dropping _prisma_migrations rolls back exactly", () => {
    const restored = copyOwned(f1Result.backup, owned("f1-restored.sqlite"));
    expect(prismaLedger(restored)).toBeNull();
    expect(withNative(restored, logicalSnapshot, { readOnly: true })).toEqual(f1Result.before);
    expect(rawMaster(restored)).toEqual(f1Result.beforeMaster);

    const diagnostic = copyOwned(files.f1, owned("f1-drop-ledger.sqlite"));
    expect(prismaLedger(diagnostic)).toHaveLength(1);
    withNative(diagnostic, (db) => { db.exec("DROP TABLE _prisma_migrations"); });
    expect(rawMaster(diagnostic)).toEqual(f1Result.beforeMaster);
    withNative(diagnostic, (db) => {
      expect(inventory(db)).toEqual(referenceInventory);
      expect(logicalSnapshot(db)).toEqual(f1Result.before);
    }, { readOnly: true });
  }, CLI_TIMEOUT);

  it("P1: the generated client reads every row of every model on baselined F1 exactly as the native read", async () => {
    const native = withNative(files.f1, logicalSnapshot, { readOnly: true });
    const models = parseSchema(readFileSync(schemaPath, "utf8"));
    const read = await withPrisma(files.f1, async (client) => {
      const result: Record<string, Record<string, unknown>[]> = {};
      for (const model of models) result[model.table] = await client[delegateName(model.model)].findMany();
      return result;
    });
    for (const model of models) {
      const asColumns = read[model.table].map((row) => Object.fromEntries(Object.entries(row).map(([field, value]) => [model.fieldToColumn[field], value])));
      expect(sortRows(asColumns), model.table).toEqual(sortRows(native[model.table]));
      expect(asColumns.length).toBeGreaterThan(0);
    }
    expect(read.account_sessions.map((row) => row.contextRevision)).toContain(9007199254740990);
    expect(openHandles.native.size + openHandles.prisma.size).toBe(0);
  }, CLI_TIMEOUT);

  it("P2: Prisma creates that omit createdAt store ISO timestamps, never the strftime text", async () => {
    const copy = copyOwned(files.pathB, owned("p2.sqlite"));
    await withPrisma(copy, async (client) => {
      await client.account.create({ data: { id: "p2-account", username: "P2user", usernameKey: "p2user", passwordVersion: 1, passwordAlgorithm: "scrypt", passwordHash: synthetic.passwordHash("p2"), passwordSalt: synthetic.salt("p2"), passwordN: 16384, passwordR: 8, passwordP: 1, passwordMaxmem: 33554432, recoveryDigest: synthetic.digest("p2") } });
      await client.group.create({ data: { id: "p2-legacy", name: "P2 legacy" } });
      await client.group.create({ data: { id: "p2-account-group", name: "P2 account", accessMode: "account", ownerAccountId: "p2-account" } });
      await client.invitation.create({ data: { id: "p2-invite", groupId: "p2-legacy", tokenHash: synthetic.digest("p2-invite") } });
      await client.member.create({ data: { id: "p2-member", groupId: "p2-legacy", name: "P2", nameKey: "p2", avatarColor: "#aabbcc" } });
      await client.member.create({ data: { id: "p2-owner", groupId: "p2-account-group", name: "Owner", nameKey: "owner", avatarColor: "#ccbbaa" } });
      await client.accountMembership.create({ data: { accountId: "p2-account", groupId: "p2-account-group", memberId: "p2-owner", joinedInviteGeneration: 1 } });
      await client.title.create({ data: { id: "p2-title", groupId: "p2-legacy", title: "P2", titleKey: "p2", contentType: "movie", durationSeconds: 60, numberingStyle: "none" } });
      await client.contributor.create({ data: { groupId: "p2-legacy", titleId: "p2-title", memberId: "p2-member" } });
      await client.legacySession.create({ data: { tokenHash: synthetic.digest("p2-session"), groupId: "p2-legacy", invitationId: "p2-invite" } });
      // Throwaway copy only: proves the ledger default too; Prisma code never writes the native ledger.
      await client.nativeMigration.create({ data: { version: "9999", filename: "9999_probe.sql", checksum: "probe" } });
    });
    const stamps = withNative(copy, (db) => db.prepare(`
      SELECT created_at AS value FROM groups UNION ALL SELECT created_at FROM invitations UNION ALL SELECT created_at FROM members
      UNION ALL SELECT created_at FROM titles UNION ALL SELECT created_at FROM contributors UNION ALL SELECT created_at FROM group_sessions
      UNION ALL SELECT created_at FROM accounts UNION ALL SELECT created_at FROM account_memberships
      UNION ALL SELECT applied_at FROM schema_migrations WHERE version = '9999'`).all().map((row) => String(row.value)), { readOnly: true });
    expect(stamps).toHaveLength(11);
    for (const stamp of stamps) {
      expect(stamp).toMatch(ISO);
      expect(stamp).not.toContain("strftime");
    }
  }, CLI_TIMEOUT);

  it("C1: constraints, STRICT typing, composite keys and triggers reject Prisma writes on baselined F1", async () => {
    const before = withNative(files.f1, logicalSnapshot, { readOnly: true });
    const observed: Record<string, ReturnType<typeof driverCode>> = {};
    const trigger = (message: string) => ({ prismaCode: "P2003", originalCode: "SQLITE_CONSTRAINT_TRIGGER", originalMessage: message });
    const live = synthetic.digest("session-live");
    const cases: Record<string, (client: Client) => Promise<unknown>> = {
      check: (client) => client.group.create({ data: { id: "c1-blank", name: "   " } }),
      strictType: (client) => client.$executeRawUnsafe("UPDATE ratings SET score = ? WHERE title_id = 'ttl-movie' AND member_id = 'mem-anya'", "ten"),
      compositeCrossGroupForeignKey: (client) => client.rating.create({ data: { groupId: "grp-account", titleId: "ttl-movie", memberId: "mem-owner", score: 5 } }),
      duplicateTitleKey: (client) => client.title.create({ data: { id: "c1-dup", groupId: "grp-legacy", title: "Duplicate", titleKey: "manual movie «ночь»", contentType: "movie", durationSeconds: 60, numberingStyle: "none" } }),
      eleventhGenre: (client) => client.titleGenre.create({ data: { titleId: "ttl-series", genreKey: "eleventh", label: "Eleventh" } }),
      membershipDelete: (client) => client.accountMembership.delete({ where: { accountId_groupId: { accountId: "acct-removed", groupId: "grp-account" } } }),
      groupModeChange: (client) => client.group.update({ where: { id: "grp-legacy" }, data: { accessMode: "account", ownerAccountId: "acct-owner" } }),
      inviteGenerationDecrease: (client) => client.group.update({ where: { id: "grp-account" }, data: { inviteGeneration: 2 } }),
      nonIncreasingContextRevision: (client) => client.accountSession.update({ where: { tokenHash: live }, data: { contextRevision: 9007199254740990 } }),
      legacySessionInAccountGroup: (client) => client.legacySession.create({ data: { tokenHash: synthetic.digest("c1-legacy"), groupId: "grp-account", invitationId: "inv-account-3" } }),
      timestampAboveDuration: (client) => client.progress.update({ where: { titleId_memberId: { titleId: "ttl-movie", memberId: "mem-anya" } }, data: { timestampSeconds: 7201 } }),
      typeChangeWithHistory: (client) => client.title.update({ where: { id: "ttl-series" }, data: { contentType: "anime" } }),
    };
    const foreignKeys = await withPrisma(files.f1, async (client) => {
      for (const [name, attempt] of Object.entries(cases)) {
        let rejected = false;
        try { await attempt(client); } catch (error) { rejected = true; observed[name] = driverCode(error); }
        expect(rejected, name).toBe(true);
      }
      return client.$queryRawUnsafe("PRAGMA foreign_keys");
    });
    expect(foreignKeys.map((row) => Number(row.foreign_keys))).toEqual([1]);
    expect(withNative(files.f1, logicalSnapshot, { readOnly: true })).toEqual(before);
    // Trigger aborts surface as P2003 "Foreign key constraint violated"; only originalCode/originalMessage are reliable.
    expect(observed).toEqual({
      check: { prismaCode: "P2039", originalCode: "SQLITE_CONSTRAINT_CHECK", originalMessage: expect.stringContaining("CHECK constraint failed: length(trim(name)) BETWEEN 1 AND 80") },
      strictType: { prismaCode: "P2010", originalCode: "SQLITE_CONSTRAINT_DATATYPE", originalMessage: expect.stringContaining("cannot store TEXT value in INTEGER column ratings.score") },
      compositeCrossGroupForeignKey: { prismaCode: "P2003", originalCode: "SQLITE_CONSTRAINT_FOREIGNKEY", originalMessage: expect.stringContaining("FOREIGN KEY constraint failed") },
      duplicateTitleKey: { prismaCode: "P2002", originalCode: "SQLITE_CONSTRAINT_UNIQUE", originalMessage: expect.stringContaining("UNIQUE constraint failed: titles.group_id, titles.content_type, titles.title_key") },
      eleventhGenre: trigger("At most ten genres per title"),
      membershipDelete: trigger("Remove membership without deleting its identity"),
      groupModeChange: trigger("Group access mode and ownership are immutable"),
      inviteGenerationDecrease: trigger("Invite generation cannot decrease"),
      nonIncreasingContextRevision: trigger("Context revision must increase"),
      legacySessionInAccountGroup: trigger("Legacy session requires a legacy group"),
      timestampAboveDuration: trigger("Timestamp exceeds current duration"),
      typeChangeWithHistory: trigger("Cannot change content type or numbering with member history"),
    });
    console.info(`#48 C1 observed codes: ${JSON.stringify(observed)}`);
  }, CLI_TIMEOUT);

  it("S1: ports are type-only and unimported, scripts are safe, and no default or outside database was touched", async () => {
    const portsSource = readFileSync(join(repo, "lib", "persistence", "ports.ts"), "utf8");
    const ports = code(portsSource);
    expect(ports).not.toMatch(/^\s*import\s|\bimport\s*\(|\brequire\s*\(/m);
    expect(ports).not.toMatch(/node:sqlite|@prisma|generated\//);
    expect(ports).not.toMatch(/^\s*export\s+(?!type\s|interface\s)/m);
    expect(portsSource).toMatch(/Reconciliation rule with #44/);
    expect(Object.keys(await import("../../lib/persistence/ports"))).toEqual([]);
    for (const name of ["UnitOfWork", "AccountRepository", "AccountSessionRepository", "GroupRepository", "MemberRepository", "MembershipRepository", "InvitationRepository", "PendingInvitationRepository", "LegacySessionRepository", "TitleRepository", "ContributionRepository", "PersonalHistoryRepository", "MetadataProvenanceRepository", "ReviewSnapshotRepository", "PickerProjectionRepository"]) {
      expect(ports).toMatch(new RegExp(`export interface ${name} \\{`));
    }
    expect(ports).toMatch(/reason: WriteFailureReason/);
    expect(ports).toMatch(/"stale" \| "conflict" \| "not_found"/);

    const sources: string[] = [];
    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) walk(path); else if (/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) sources.push(path);
      }
    };
    for (const directory of ["app", "lib", "db", "frontend", "scripts"]) walk(join(repo, directory));
    expect(sources.length).toBeGreaterThan(50);
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      expect(text, path).not.toMatch(/persistence\/ports|["']@prisma\/|generated\/prisma|["']better-sqlite3["']|["']prisma\/config["']/);
    }

    const manifest = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as { scripts: Record<string, string>; dependencies: Record<string, string>; devDependencies: Record<string, string> };
    for (const command of Object.values(manifest.scripts)) expect(command).not.toMatch(/migrate dev|migrate reset|db push|db execute|--force-reset|--accept-data-loss/);
    expect(Object.entries(manifest.scripts).filter(([, command]) => /prisma/.test(command))).toEqual([["prisma:generate", "prisma generate"], ["prisma:validate", "prisma validate"]]);
    expect(manifest.devDependencies.prisma).toBe("7.10.0");
    expect(manifest.dependencies["@prisma/client"]).toBe("7.10.0");
    expect(manifest.dependencies["@prisma/adapter-better-sqlite3"]).toBe("7.10.0");
    const lock = readFileSync(join(repo, "pnpm-lock.yaml"), "utf8");
    expect(lock).toMatch(/^ {2}better-sqlite3@12\.11\.1:$/m);
    expect(readFileSync(join(repo, "pnpm-workspace.yaml"), "utf8")).toMatch(/allowBuilds:\n {2}'@prisma\/engines': true\n {2}better-sqlite3: true\n {2}prisma: true\n?$/);

    // Every CLI call used an owned file URL or none; the isolated native default path never appeared.
    expect(cliLog.length).toBeGreaterThan(15);
    for (const call of cliLog) if (call.url) expect(call.url.startsWith(`file:${root}/`)).toBe(true);
    const isolatedDefault = resolveDatabasePath({ XDG_DATA_HOME: isolated.xdg, LOCALAPPDATA: isolated.local }, root, process.platform, isolated.home);
    expect(relative(root, isolatedDefault).startsWith("..")).toBe(false);
    expect(existsSync(isolatedDefault)).toBe(false);
    const found: string[] = [];
    const scan = (directory: string) => { for (const entry of readdirSync(directory, { withFileTypes: true })) { const path = join(directory, entry.name); if (entry.isDirectory()) scan(path); else found.push(path); } };
    scan(root);
    expect(found.some((path) => basename(path) === "watchnext.sqlite")).toBe(false);
    expect(openHandles.native.size + openHandles.prisma.size).toBe(0);
  });
});
