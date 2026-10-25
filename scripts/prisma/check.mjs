import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const root = mkdtempSync(join(tmpdir(), "watchnext-prisma-check-"));
const database = join(root, "schema.sqlite");
const url = `file:${database.replace(/\\/g, "/")}`;
const run = (args) => {
  const result = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", ...args, "--schema", "prisma/schema.prisma"], { cwd: process.cwd(), encoding: "utf8", env: { ...process.env, DATABASE_URL: url } });
  if (result.status !== 0) throw new Error(`prisma ${args.join(" ")} failed:\n${result.stdout}\n${result.stderr}`);
  process.stdout.write(result.stdout);
};
try { run(["validate"]); run(["generate"]); if (existsSync(database)) throw new Error("Schema validation/generation unexpectedly created a database"); console.log("PASS: Prisma schema validates and client generates against an owned isolated URL."); }
finally { rmSync(root, { recursive: true, force: true }); }