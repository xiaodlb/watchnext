# Prisma native-SQLite baseline (#48)

Prisma is configured for schema/client generation only in this issue. The running Next.js application still uses the native SQLite storage layer. The pinned **Prisma 6.19.3** and `@prisma/client` 6.19.3 support Node 18.18+, therefore the project’s Node 24.x requirement. The packages are intentionally allowed to run their checked post-install scripts through `pnpm-workspace.yaml` so their engine/client artifacts are present.

Run the isolated tooling checks from the repository root:

```text
pnpm prisma:check
pnpm prisma:baseline:verify
```

Both commands own a new temporary directory and accept no database path. The first validates `prisma/schema.prisma` and generates the client against an isolated URL without creating a file. The second creates a populated native `0001`–`0005` fixture, copies it, marks only the copy as Prisma-baselined, checks every business table and native checksum, then verifies a fresh isolated setup. They cannot initialize, attach, reset, or modify the normal/default/demo database.

## What the baseline means

`prisma/migrations/20261025000000_native_sqlite_baseline/migration.sql` is a source-controlled baseline. It reproduces the immutable native `0001`–`0005` table/trigger/index schema and inserts the exact native `schema_migrations` ledger checksums for a **new empty disposable database**. A pre-existing native database is never deployed to. It is registered with:

```text
node node_modules/prisma/build/index.js migrate resolve --applied 20261025000000_native_sqlite_baseline --schema prisma/schema.prisma
```

with `DATABASE_URL` set to an explicitly-created working-copy `file:` URL. This only adds Prisma’s `_prisma_migrations` record; it must not change the native application ledger or business rows. `prisma db push`, `prisma migrate reset`, and edits to `db/migrations/0001`–`0005` are forbidden.

For a fresh owned disposable file, execute the baseline SQL through Prisma and then mark it resolved. The verifier performs this exact sequence. The migration uses the raw native DDL because Prisma does not represent the existing SQLite triggers, `CHECK`s, `STRICT` tables, or application migration ledger.

## Upgrade procedure for a future authorized operator

1. Stop after verifying the target is an explicit **new, local working-copy path**. Refuse the configured normal path, the OS default `WatchNext/watchnext.sqlite`, any demo path, `.env.local`, M-drive runtime file, `:memory:`, URI, or an existing destination. Do not use this procedure during ordinary development.
2. Before any write, create a distinct verified backup with `pnpm db:snapshot '<explicit source>' '<new explicit backup>'`. Confirm the backup is new and snapshot verification succeeds.
3. Copy that backup to another new owned working copy. Hash the original and backup. Set `DATABASE_URL` only for that working copy, run `prisma migrate resolve --applied 20261025000000_native_sqlite_baseline`, and inspect it with a read-only ledger/data comparison.
4. Verify native `schema_migrations` has exactly `0001`–`0005` with original checksums; verify hashes, identities, history, metadata fields/reviews, invitations, membership/context generations and `PRAGMA foreign_key_check`.
5. On any failure, stop. The source and backup remain reviewable. Discard the working copy. The concrete rollback is to make a **new** working copy from the untouched backup; never overwrite the backup or silently replace a normal database.

No normal operational command switches to Prisma in #48. #51 may choose a durable runtime only after #49 and #50 provide complete repository implementations and independent QA accepts it.