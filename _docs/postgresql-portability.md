# Disposable PostgreSQL portability proof

Issue #52 adds an opt-in, disposable PostgreSQL proof for the same Prisma HTTP composition used by WatchNext. SQLite remains the default runtime and does not need Docker or PostgreSQL.

## Run the owned PostgreSQL proof

Prerequisite: Docker Desktop must be running with Docker Compose available. The commands create a unique Compose project, bind PostgreSQL only to `127.0.0.1` on an automatically chosen port, generate a random in-memory password, use a `tmpfs` data directory, and write a private state file under the OS temporary directory. They never use a hosted account, real credentials, a user database, or a caller-supplied PostgreSQL URL.

```powershell
pnpm install --frozen-lockfile
pnpm prisma:postgres:start
# Copy the state path printed above.
pnpm prisma:postgres:verify -- --state C:\Users\you\AppData\Local\Temp\watchnext-postgres-portability-...\.postgres-portability-state.json
pnpm prisma:postgres:cleanup -- --state C:\Users\you\AppData\Local\Temp\watchnext-postgres-portability-...\.postgres-portability-state.json
```

`verify` first runs the same journey against a fresh owned SQLite file, then against PostgreSQL. Each journey runs the browser-mounted `/http` route and owned HTTP checks for account and group authorization, cross-group denial, one shared duplicate contribution/history record, archive/restore, separate personal feedback, provider-review expiry and replay denial, picker selection, and data survival after stopping and starting the owned Next server. It also verifies that the mapped PostgreSQL tables exist for accounts/sessions, groups, titles/contributors, personal progress/feedback, picker inputs, and metadata review/page lifecycle.

If the optional local prerequisite is not available, the command exits non-zero with:

```text
PostgreSQL portability requires Docker Desktop with Docker Compose. Install and start Docker, then rerun; no PostgreSQL proof ran.
```

That is an honest prerequisite result, not a successful PostgreSQL claim. This repository does not contain hosted PostgreSQL credentials or a production deployment configuration.

## SQLite remains normal

The regular setup and durable SQLite proof remain unchanged and work without Docker:

```powershell
pnpm db:init
pnpm prisma:check
pnpm prisma:baseline:verify
pnpm prisma:cutover:verify
pnpm db:verify:backup
pnpm prisma:sqlite:portability
```

## Provider-specific protections and limits

The portable domain service continues to use repository contracts. The PostgreSQL schema is in `prisma/postgresql/schema.prisma`; its provider migration is in `prisma/postgresql/migrations/`. Both providers use foreign keys, unique indexes, compound ownership keys, input validation, server-selected repository configuration, bounded transactions, and the same HTTP contract.

SQLite additionally uses `STRICT` tables, `PRAGMA foreign_keys`, `busy_timeout`, `secure_delete`, and its existing migration ledger checks. PostgreSQL instead uses typed booleans, native foreign keys, matching `CHECK` constraints, provider-specific genre/timestamp triggers, and `SET LOCAL lock_timeout` inside write transactions. WAL and SQLite file snapshot/restore are deliberately not PostgreSQL features; PostgreSQL backup/restore and any hosted deployment are outside this disposable proof.

The PostgreSQL generated client is created only by `prisma:postgres:start` and is ignored by Git. That keeps normal SQLite development independent of a PostgreSQL engine. The server accepts PostgreSQL only when its server environment selects `WATCHNEXT_HTTP_PRISMA_PROVIDER=postgresql`; a browser request cannot select the provider.

## Evidence on this checkout

On 2026-10-26 this Windows checkout validated the PostgreSQL Prisma schema and generated the PostgreSQL client. Docker Desktop/Compose was not installed, so no PostgreSQL container, migration application, HTTP journey, browser proof, or success result was recorded here. Run the owned commands above on a Docker-enabled computer to collect that disposable local evidence; do not describe it as hosted-production evidence.
