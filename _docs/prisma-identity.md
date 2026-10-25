# Prisma identity/group adapter (#49)

`#49` adds an **isolated evaluation adapter** for the account and group portion of the versioned HTTP API. It is intentionally not the ordinary application runtime: #50 still owns library/history persistence and #51 alone may select a complete durable application composition.

## Selection boundary

The `/v1` route continues to call the same HTTP service and accepts no adapter, database, account, group or member selector from a request. A server operator can select the adapter only with all of these trusted process settings:

```text
WATCHNEXT_HTTP_REPOSITORY=prisma
WATCHNEXT_HTTP_PRISMA_ISOLATED=1
WATCHNEXT_HTTP_PRISMA_DATABASE_URL=file:/absolute/path/to/a/new-owned-test.sqlite
```

The `ISOLATED` flag is a deliberate #49 guard. It prevents accidentally treating an ordinary WatchNext database as a partially durable application: only account/session/group/legacy tables are durable here. Do not put these values in `.env.local`, use a normal/default/demo database, or run this setting against the user's development server. Without this exact selection, the existing HTTP route retains its explicit process-memory behavior.

## Persisted scope and invariants

Prisma maps ordinary reads and writes for accounts, password/recovery digests, account sessions, account groups, members/memberships, invitations, pending invitation intents, legacy group sessions and legacy profiles. Every selected A01–A05, G01–G08 and L01–L04 route enters the portable `IdentityGroupRepository.execute` contract and then the direct Prisma adapter; there is no request-local in-memory projection and no snapshot copy-back.

The existing raw cookie value, password and recovery code are never stored as adapter values. Session, invitation and pending-intent keys are SHA-256 hashes already produced by the HTTP service. Credentials are returned only through the existing one-time response/cookie paths. The selected group, context revision, active membership status and invite generation are re-read from durable rows for every request; request fields remain stale-intent claims, never authority.

Every mapped mutation uses a Prisma interactive SQLite transaction. The transaction connection enables foreign keys, a five-second busy timeout and secure delete before conditional revision/generation writes; duplicate, stale and replayed writes therefore fail without partially changing a row set. The immutable native migrations and their `schema_migrations` ledger remain the schema authority. Existing `STRICT`, `CHECK`, foreign-key and trigger constraints are not reproduced in application code. `#49` does not use `prisma db push`, reset, or alter native migration files.

## Isolated verification

Run from the repository root:

```text
pnpm prisma:check
pnpm prisma:baseline:verify
pnpm prisma:identity:verify
pnpm contract:verify
```

`prisma:identity:verify` creates a new temporary database, applies the immutable native migrations there, starts the adapter in isolated mode, and removes its directory afterward. It covers account/group/legacy flow continuation across a clean service/client reset, pending invite persistence, recovery/logout denial, rotation/removal/new-generation rejoin, duplicate-account rollback and foreign-key integrity. The complete test suite adds malformed/extra-body and unknown-route parity plus controlled stale-revision races. It never reads, migrates, resets or attaches the normal/default/demo path, M-drive runtime, `.env.local` or a user server.

## Limits

Saved titles, contributions, progress, ratings, notes, metadata/reviews and picker projections are not durable in this adapter; #50 owns those repositories. Normal runtime selection, a full browser/UI durable run, backup/restore and native-to-Prisma upgrade operation are #51 work. SQLite remains single-host/file storage; its busy/locking behavior is not a multi-host sharing solution. A portable interface is not evidence of a tested PostgreSQL deployment; that remains post-MVP #52.
