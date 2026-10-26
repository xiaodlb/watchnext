# Prisma identity/group adapter (#49)

`#49` added the account and group portion of the versioned HTTP API. In #51 it is composed with the #50 library repository into the complete durable Prisma HTTP application.

## Selection boundary

The `/v1` route accepts no adapter, database, account, group or member selector from a request. The process owner selects exactly one composition before starting the server:

```text
WATCHNEXT_HTTP_REPOSITORY=prisma
WATCHNEXT_HTTP_PRISMA_DATABASE_URL=file:/absolute/path/to/an-initialized-owned-watchnext.sqlite
```

Both values are server environment variables, never browser fields, cookies, URLs or client configuration. The URL must be an absolute `file:` URL whose native `0001`–`0005` ledger has already been initialized. `WATCHNEXT_HTTP_REPOSITORY=memory` (or an unset selector) explicitly runs the previous process-memory composition, which is intentionally ephemeral and never reads, migrates, copies or replaces the Prisma file. Do not use `prisma db push` or `prisma migrate reset`.

## Persisted scope and invariants

Prisma maps ordinary reads and writes for accounts, password/recovery digests, account sessions, account groups, members/memberships, invitations, pending invitation intents, legacy group sessions and legacy profiles. Every selected A01–A05, G01–G08 and L01–L04 route enters the portable `IdentityGroupRepository.execute` contract and then the direct Prisma adapter; there is no request-local in-memory projection and no snapshot copy-back.

The existing raw cookie value, password and recovery code are never stored as adapter values. Session, invitation and pending-intent keys are SHA-256 hashes already produced by the HTTP service. Credentials are returned only through the existing one-time response/cookie paths. The selected group, context revision, active membership status and invite generation are re-read from durable rows for every request; request fields remain stale-intent claims, never authority.

Every mapped mutation uses a Prisma interactive SQLite transaction. The transaction connection enables foreign keys, a five-second busy timeout and secure delete before conditional revision/generation writes; duplicate, stale and replayed writes therefore fail without partially changing a row set. The immutable native migrations and their `schema_migrations` ledger remain the schema authority. Existing `STRICT`, `CHECK`, foreign-key and trigger constraints are not reproduced in application code. `#49` does not use `prisma db push`, reset, or alter native migration files.

## Verification

Run from the repository root:

```text
pnpm prisma:check
pnpm prisma:baseline:verify
pnpm prisma:identity:verify
pnpm prisma:library:verify
pnpm prisma:cutover:verify
pnpm contract:verify
```

`prisma:cutover:verify` creates only a new temporary database, applies the immutable native migrations, then exercises the selected complete HTTP route: sign-up, group creation, manual save, imported YouTube review/save, personal timestamp/rating/note and picker. It clears process/client state and proves that the same cookie sees the durable title/history after restart. The suite never reads, migrates, resets or attaches the normal/default/demo path, M-drive runtime, `.env.local` or a user server.

## Limits

SQLite remains single-host/file storage; its busy/locking behavior is not a multi-host sharing solution. A portable interface is not evidence of a tested PostgreSQL deployment; that remains post-MVP #52.
