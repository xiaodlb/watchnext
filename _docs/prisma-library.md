# Prisma library adapter (#50)

`PrismaLibraryRepository` owns durable title, contribution, personal-history and metadata-review rows. Its methods expose domain values only; callers never receive a Prisma client or SQLite connection. It handles manual and provider identities, all four content types, fixed moods/genres, archive/restore and the picker’s active-only projection.

Every mutation runs through one interactive Prisma SQLite transaction. The adapter applies foreign keys, a busy timeout and `secure_delete` on that transaction connection; a competing writer is either serialized or rejected, never silently retried. Provider review handles are random 256-bit values, stored only as SHA-256 hashes, bound to group/member/session and deleted only on success or expiry. An optional trusted #49 account/session context is rechecked inside the transaction, including membership status and context revision.

Provider-field expiry clears only still-provider-owned values and provenance rows are marked cleared. User-owned corrections, contributors and progress/rating/note history are retained. SQLite's native trigger/check constraints remain authoritative for numbering, timestamps, ratings, notes and foreign keys: Prisma maps the rows but does not replace those protections. `secure_delete` is a best-effort active-database cleanup setting, not a claim about WAL files, backups or the operating system.

Run `pnpm prisma:library:verify` for the isolated adapter suite. It creates only temporary native `0001`–`0005` files, includes concurrent-client/rollback and populated-fixture preservation checks, and never reads or initializes normal local storage. The suite is the adapter boundary verification, not a production-runtime selector.

The production HTTP selection remains deliberately unchanged in #50. #51 switches the complete route set only after both identity and library adapters have passed their isolated preservation and race checks.
