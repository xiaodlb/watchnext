// Runs the exact #52 owned HTTP/browser journey against a fresh temporary
// SQLite file. PostgreSQL verification invokes this first for like-for-like
// evidence, but it is also useful without Docker.
import { spawnSync } from "node:child_process";
const result = spawnSync(process.execPath, ["tests/fixtures/postgres-portability-check.mjs"], { cwd: process.cwd(), env: { ...process.env, WATCHNEXT_PORTABILITY_PROVIDER: "sqlite", NEXT_TELEMETRY_DISABLED: "1" }, stdio: "inherit", windowsHide: true });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
