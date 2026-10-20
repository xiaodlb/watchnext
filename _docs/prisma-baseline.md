# Prisma mapping and data-preserving SQLite baseline — issue #48

October 20, 2026 · **PM-groomed plan for authorized [#48](https://github.com/xiaodlb/watchnext/issues/48), implemented by the Engineer in commits `ef7f38e` (toolchain, schema, baseline) and `7c811a1` (ports, evidence test); independent QA PASS at `69b0bc8`.** Rows marked *executed* were run by `tests/db/prisma-baseline.test.ts` at those commits (see [§12](#12-engineer-execution-record)). Rows still marked *PM probe* record a feasibility probe the PM ran in a throwaway scratch directory outside the repository, on synthetic files, so the defaults below are not guesses. A probe is **not** repository evidence and does not replace the test below.

## 1. Authority, scope and the missing prerequisite

The user authorized #48–#54 on 2026-10-20. #43–#47 are being implemented at the same time by another agent on upstream branch `codex/backend-preparation`. The quote and the ownership split are recorded in [process.md](process.md#authorization-for-issues-43-54-october-20-2026).

#48 nominally depends on #47 (complete UI-to-HTTP wiring), which is not done. #48 therefore does **not** depend on any #44–#47 code. Everything it adds sits beside the native application:

- a pinned Prisma toolchain, `prisma.config.ts` and a real `prisma/schema.prisma` that maps every existing table, column, key, relation and default;
- one Prisma **baseline** migration that reproduces native migrations 0001–0005 exactly, recorded only on owned populated copies with `migrate resolve --applied`;
- type-only repository port declarations in `lib/persistence/ports.ts`, imported by nothing;
- one focused test, `tests/db/prisma-baseline.test.ts`, holding all the evidence.

The native runtime is unchanged: `db/**`, `lib/**` apart from the new ports file, `app/**`, `frontend/**`, `scripts/**` and `db/migrations/*.sql` stay as they are. `pnpm db:init`, `getDatabase()`, snapshot and maintenance still use `node:sqlite`. #48 adds no runtime selector (#51), no ORM repository (#49/#50) and no PostgreSQL (#52). Installing Prisma does not make the app portable. Portability needs real repositories (#49/#50), runtime use (#51) and, optionally, an actual disposable PostgreSQL run (#52).

## 2. Pinned tooling (exact defaults)

Dependency choice made under the October 15 delegated dependency authority quoted in [plan.md](plan.md). No purchases.

| Package | Exact version | Section | Why |
| --- | --- | --- | --- |
| `prisma` (CLI) | **7.10.0** | devDependencies | Latest stable 7.x that is at least two weeks old (published 2026-08-25). 7.10.1 (2026-10-15) is too new; 8.0.0 is only a release candidate. Engines field `^20.19 \|\| ^22.12 \|\| >=24.0` allows Node 24. |
| `@prisma/client` | **7.10.0** | dependencies | Matches the CLI exactly. Uses the `prisma-client` generator (no Rust query engine). |
| `@prisma/adapter-better-sqlite3` | **7.10.0** | dependencies | Prisma 7 needs a driver adapter for SQLite. This is the official SQLite adapter. Its `better-sqlite3` dependency (`^12.6.0`) must resolve in the lockfile to **12.11.1** (2026-06-15, bundled SQLite 3.53.2; Node's `node:sqlite` is 3.53.4). |

**Adapter decision.** No official adapter wraps `node:sqlite`; `@prisma/adapter-node-sqlite` does not exist on npm. The alternatives were rejected:

- `@prisma/adapter-libsql` uses a forked engine and an async client, and is still a second SQLite copy.
- A custom `node:sqlite` adapter would mean maintaining unofficial driver code.

The official better-sqlite3 adapter brings these obligations:

- **pnpm 11 build approval.** pnpm 11.25 blocks install scripts with `ERR_PNPM_IGNORED_BUILDS`. Add this to `pnpm-workspace.yaml`:
  ```yaml
  allowBuilds:
    '@prisma/engines': true
    better-sqlite3: true
    prisma: true
  ```
  `@prisma/engines` downloads the schema-engine binary from `binaries.prisma.sh`. It is needed for `db pull`, `migrate diff`, `migrate status`, `migrate resolve` and `migrate deploy`. `better-sqlite3` installs a prebuilt binary or compiles one. *Executed:* after deleting `node_modules`, `pnpm install --frozen-lockfile` finished in this Linux container (Node 24.22.0, pnpm 11.25.0) without `ERR_PNPM_IGNORED_BUILDS`; the schema-engine binary and the `better_sqlite3.node` build were present. The Windows prebuild is **not verified** here.
- **Two SQLite library copies.** `node:sqlite` and better-sqlite3 each link their own SQLite. If two copies open the **same database file at the same time in one process**, closing one copy's handle can drop the other's POSIX locks ([SQLite: multiple copies](https://www.sqlite.org/howtocorrupt.html)). Rule for #48–#51: in one process, never keep a native and a Prisma connection open on the same file at once. Close one before opening the other. Separate processes are fine, including the Prisma CLI and the snapshot/maintenance CLIs. #51 removes the overlap by switching the whole runtime.
- **The adapter creates missing files.** It calls `new Database(path)`, which silently creates an empty file. Every adapter construction must pass `{ url, fileMustExist: true }`.

## 3. Files and configuration (exact)

| Path | Content |
| --- | --- |
| `prisma.config.ts` | `defineConfig({ schema: "prisma/schema.prisma", migrations: { path: "prisma/migrations" }, datasource? })`. Include `datasource: { url, shadowDatabaseUrl? }` **only** when `WATCHNEXT_PRISMA_DATABASE_URL` / `WATCHNEXT_PRISMA_SHADOW_DATABASE_URL` are set. No fallback URL. It never reads `WATCHNEXT_DATABASE_PATH`, never calls `resolveDatabasePath()`, never loads `.env*` (Prisma 7 does not load them automatically). *Executed (V1/S1):* `validate`/`generate` work without a URL and create no file in the owned root; `migrate status` fails with "The datasource.url property is required in your Prisma config file when using prisma migrate status". |
| `prisma/schema.prisma` | `generator client { provider = "prisma-client"; output = "../generated/prisma"; runtime = "nodejs"; moduleFormat = "esm" }` with the default extensionless imports. *Executed:* `pnpm typecheck` passes with and without `generated/` present; the test loads the client by a computed path so a fresh checkout typechecks before `prisma generate`. Also `datasource db { provider = "sqlite" }` and the 19 models below. |
| `prisma/migrations/migration_lock.toml` | `provider = "sqlite"`. This is the SQLite-specific history. A future PostgreSQL schema and migrations (#52) live in their own path. |
| `prisma/migrations/0_native_0005_baseline/migration.sql` | The canonical dump of a native-migrated 0001–0005 database (§6). 265 lines; byte-equal to the regenerated dump (B4). |
| `generated/` | Added to `.gitignore`; output of `prisma generate`. Nothing in `app/lib/db/frontend/scripts` imports it in #48. |
| `package.json` scripts | Only `prisma:generate` (`prisma generate`) and `prisma:validate` (`prisma validate`). Neither touches a database. No migrate/push/reset scripts before #51. |

## 4. Entity map — all 19 existing tables

Model names are PascalCase with `@@map("<table>")`. Fields are camelCase with `@map("<column>")`. *PM probe:* renaming this way keeps `migrate diff` empty. All tables are SQLite `STRICT`. The "SQL-only" column lists what Prisma cannot express; §5 says how each is preserved.

| Table → model | Keys / uniques (Prisma) | Relations (composite where noted) | SQL-only rules kept by native DDL |
| --- | --- | --- | --- |
| `schema_migrations` → `NativeMigration` | `@id version` | — | Native ledger. Read-only for Prisma code; only `db/migrate.ts` writes it. |
| `groups` → `Group` | `@id id`; `@@unique([id, accessMode], map: "groups_id_mode")` | `ownerAccountId` → `Account?` | name 1–80 trimmed; mode `legacy`/`account` with null/non-null owner; generation 1–2147483647; triggers `group_access_immutable`, `group_generation_monotonic` |
| `invitations` → `Invitation` | `@id`; `tokenHash @unique(map: "sqlite_autoindex_invitations_2")`; `@@unique([id, groupId], map: "invitations_id_group")` | → `Group` | non-empty hash; generation bound; revocation nullable |
| `members` → `Member` | `@id`; `@@unique([groupId, nameKey], map: "sqlite_autoindex_members_2")`; `@@unique([id, groupId], map: "sqlite_autoindex_members_3")` | → `Group`; back-relation `accountMemberships AccountMembership[]` (**list**, see note) | name 1–40, no NUL; non-empty key; `#rrggbb` GLOB color |
| `titles` → `Title` | `@id`; uniques `(groupId, contentType, titleKey)` `_2`, `(groupId, providerNamespace, providerId)` `_3`, `(id, groupId)` `_4`, `(id, groupId, numberingStyle)` `_5`, each with `map: "sqlite_autoindex_titles_N"`; `@@index([groupId, archived], map: "titles_active")` | → `Group` | nullable acquired title/key/type/duration only when `metadata_unavailable=1` with a provider pair; type/numbering pairing; provider pair both-or-neither; duration 1–86400; flags 0/1; trigger `protect_history_type` |
| `title_genres` → `TitleGenre` | `@@id([titleId, genreKey])` | → `Title` | label 1–40, no NUL; triggers `genre_limit`, `genre_limit_move` (≤10) |
| `moods` → `Mood` | `@id code`; `label @unique(map: "sqlite_autoindex_moods_2")` | — | code limited to the five fixed moods; **seed rows** |
| `title_moods` → `TitleMood` | `@@id([titleId, moodCode])` | → `Title`, → `Mood` | — |
| `contributors` → `Contributor` | `@@id([titleId, memberId])` | **composite** `(titleId, groupId)` → `Title(id, groupId)`, `(memberId, groupId)` → `Member(id, groupId)` | — |
| `progress` → `Progress` | `@@id([titleId, memberId])` | **composite** `(titleId, groupId, numberingStyle)` → `Title`, `(memberId, groupId)` → `Member` | state/coordinate truth table; coordinates 1–9999; timestamp 0–86400; triggers `timestamp_insert`, `timestamp_update` |
| `ratings` → `Rating` | `@@id([titleId, memberId])` | composite title/member as above | score 1–10 |
| `notes` → `Note` | `@@id([titleId, memberId])` | composite title/member as above | body 1–2000 code points, no NUL |
| `group_sessions` → `LegacySession` | `@id tokenHash` | → `Group`; composite `(invitationId, groupId)` → `Invitation`; optional `(activeMemberId, groupId)` → `Member` | hash length 64; context revision bound; triggers `group_session_legacy_insert/update`, `legacy_context_monotonic` |
| `metadata_fields` → `MetadataField` | `@@id([titleId, field])`; `@@index([origin, expiresAt], map: "metadata_expiry")` | → `Title` | field and origin enums; provider rows need retrieval/expiry; cleared 0/1 |
| `metadata_reviews` → `MetadataReview` | `@id handleHash`; `@@index([expiresAt], map: "metadata_review_expiry")` | → `Group`; composite `(memberId, groupId)` → `Member` | `session_id` deliberately has **no FK**: it holds either kind of session hash |
| `accounts` → `Account` | `@id`; `usernameKey @unique(map: "sqlite_autoindex_accounts_2")` | — | username charset/length; `username_key = lower(username)`; scrypt tuple bounds incl. power-of-two N; hex-only hash/salt/digest lengths |
| `account_sessions` → `AccountSession` | `@id tokenHash`; `@@index([accountId, expiresAt], map: "account_sessions_account")` | → `Account`; `selectedGroupId` → `Group?` | hex hash; integer Unix seconds with expiry > creation; revoked ≥ created; trigger `account_context_monotonic` |
| `account_memberships` → `AccountMembership` | `@@id([accountId, groupId])`; `memberId @unique(map: "sqlite_autoindex_account_memberships_1")`; `@@index([groupId, status, accountId], map: "account_memberships_live")` | → `Account`; composite `(groupId, groupMode)` → `Group(id, accessMode)`; composite `(memberId, groupId)` → `Member` | `group_mode='account'`; status/removal truth table; generations; triggers `membership_*` (7) |
| `pending_group_invitations` → `PendingGroupInvitation` | `@id intentHash`; `@@index([expiresAt], map: "pending_group_invitations_expiry")` | → `Invitation` | hex hash; non-negative expiry |

**Mapping rules.**

1. **Account membership is a list relation on `Member`.** Prisma rejects a one-to-one relation whose composite FK `(member_id, group_id)` is not itself unique (P1012). Adding `@@unique([memberId, groupId])` would create a new index, which is drift. Keep `accountMemberships AccountMembership[]` on `Member`. The native `UNIQUE(member_id)` still guarantees at most one membership per member.
2. **Expression defaults must use `dbgenerated`.** Write the nine `strftime` defaults (`created_at` on groups, invitations, members, titles, contributors, group_sessions, accounts and account_memberships, plus `schema_migrations.applied_at`) as `@default(dbgenerated("(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))"))`. Introspection prints them as a string literal, `@default("strftime(...)")`. *PM probe:* with the literal form, the Prisma client **wrote the literal text `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` into `created_at`**, which would corrupt D18 creation-order tie-breaks. With `dbgenerated`, SQLite stored a real `2026-…Z` value. *Executed (P2):* Prisma creates omitting `createdAt`/`appliedAt` stored ISO `…Z` values in all nine columns (11 rows on a throwaway copy). The cost is a known representational diff, handled exactly in §7 check D3 (*executed*).
3. **Inline-UNIQUE names stay.** Keep every introspected `map: "sqlite_autoindex_*"`. *PM probe:* dropping one makes `migrate diff` propose `DROP INDEX` / `CREATE UNIQUE INDEX`.
4. **0/1 flags stay `Int`.** This covers `archived`, `metadata_unavailable`, `cleared` and `completed`. Prisma `Boolean` declares `BOOLEAN`, which a STRICT table cannot hold. *PM probe:* `Boolean` makes diff rebuild `titles`. Repositories convert to booleans at the port boundary.
5. **Integers stay `Int`; time keeps its two forms.** Use `Int` for every INTEGER column, including Unix-second session times and `context_revision` (up to 9007199254740990). *PM probe:* the adapter read 4000000000 and wrote 5000000000 through `Int`. `BigInt` makes diff rebuild `account_sessions`. ISO text timestamps remain `String`; Unix seconds remain `Int`.
6. **Relations are never automatic.** All relations use `onDelete: NoAction, onUpdate: NoAction`. Nothing cascades, matching "no automatic history deletion".
7. **Raw SQL integers are `bigint`.** The adapter sets `defaultSafeIntegers(true)`, so `$queryRaw` returns integers as `bigint`. Raw SQL in adapters must convert them explicitly.

## 5. SQL-only object inventory and preservation

**Strategy.** Native SQL stays the only DDL authority for SQLite. The Prisma baseline migration is a byte-exact canonical dump of the native result, so Prisma's history and shadow database contain the same STRICT tables, CHECKs, triggers and indexes. Prisma never generates or applies SQLite DDL on its own (§8).

| Object class | Count | Preservation | Verified by (§7) |
| --- | --- | --- | --- |
| Triggers | **18**: `genre_limit`, `genre_limit_move`, `timestamp_insert`, `timestamp_update`, `protect_history_type`, `group_access_immutable`, `group_generation_monotonic`, `membership_generation_insert`, `membership_generation_update`, `membership_identity_immutable`, `membership_preserve`, `membership_owner_active_insert`, `membership_owner_active_update`, `membership_rejoin_generation`, `group_session_legacy_insert`, `group_session_legacy_update`, `account_context_monotonic`, `legacy_context_monotonic` | Verbatim in native DDL and in the baseline dump. Prisma introspection and diff **do not see triggers**. | I1, C1 |
| Explicit indexes | **8**: `invitations_id_group` (unique), `titles_active`, `metadata_expiry`, `metadata_review_expiry`, `account_sessions_account`, `groups_id_mode` (unique), `account_memberships_live`, `pending_group_invitations_expiry` | Mapped with exact `map:` names and in the dump | D1–D3, I1 |
| Partial / expression indexes | **0** | The inventory asserts none appear | I1 |
| SQLite autoindexes | **29**: 19 back primary keys; 10 back inline UNIQUE constraints | The 10 UNIQUE ones keep `map: "sqlite_autoindex_*"`; primary keys map to `@id`/`@@id` | D1–D3, I1 |
| CHECK constraints | Every table (see §4) | Native DDL/dump only. Prisma cannot model CHECK. | I1, C1 |
| STRICT typing | 19 of 19 tables | Native DDL/dump. `pragma_table_list.strict = 1` for all. | I1 |
| Foreign keys | **27** edges, **13** composite | Prisma `@relation(fields, references)` plus native DDL | D1–D3, C1 |
| Expression defaults | 9 `strftime` columns | `dbgenerated` (§4 rule 2) | D3, P2 |
| Seed data | 5 `moods` rows | Native 0001 and baseline dump `INSERT` | I1 |
| Native ledger | 5 rows with SHA-256 checksums | Untouched; baseline dump inserts the identical rows for the deploy-onto-empty path | I1, B4 |
| `PRAGMA foreign_keys=ON` | per connection | Native sets it explicitly. *Executed (C1):* a Prisma adapter connection reads `PRAGMA foreign_keys` = 1. The #49 adapter must assert it. | C1 |
| `PRAGMA busy_timeout=5000` | per connection | Native sets it explicitly; better-sqlite3 defaults to 5000 ms | — (#49) |
| `PRAGMA secure_delete=ON` | per connection, before expiry deletes | Native `expireMetadata` sets it. *PM probe:* a Prisma connection reports 0. #50's SQLite adapter must run `PRAGMA secure_delete=ON` after connecting, before expiry/review deletes, and keep the existing physical-byte regression. | — (#50) |
| `PRAGMA defer_foreign_keys` | migration 0003 only | Historical rebuild step; not needed at runtime | — |
| Transactions | `BEGIN IMMEDIATE` in 16 native modules | Adapter uses **deferred** `BEGIN` plus an in-process mutex. Cross-process write races can hit `SQLITE_BUSY` on lock upgrade. #49/#50 must prove race/rollback parity with conditional writes, using immediate locking or an equivalent, and must not weaken existing concurrency tests. | — (#49/#50) |
| Error classes | — | *Executed (C1):* every trigger `RAISE(ABORT)` surfaced as Prisma **`P2003` "Foreign key constraint violated"** (observed codes in §12). The real `meta.driverAdapterError.cause.originalCode = "SQLITE_CONSTRAINT_TRIGGER"` and `originalMessage` are in the error metadata. Adapters must translate using `originalCode`/`originalMessage`, never `P2003` alone. | C1 records observed codes |
| Demo `demo_ownership` table | demo files only | Not part of the normal schema. Demo databases are never baselined in #48; the inventory treats the extra table as drift (#51 decides). | — |

## 6. Baseline procedure (owned copies only in #48)

**Canonical dump** (`0_native_0005_baseline/migration.sql`), produced from a fresh native `migrate()` database:

1. a header comment line;
2. every `sqlite_master` row with non-null `sql` whose name does not start with `sqlite_` or `_prisma_migrations`, in `rowid` order, each written as `<sql>;\n`;
3. the five `moods` inserts;
4. five `INSERT INTO schema_migrations(version, filename, checksum)` rows whose checksums equal the SHA-256 of the committed `db/migrations` files, CRLF-normalized.

The test regenerates this dump and requires byte equality.

**Paths:**

| Path | Steps | Notes |
| --- | --- | --- |
| **A. New file (supported)** | Native `migrate()` (as `db:init` does) on an empty owned file → `prisma migrate resolve --applied 0_native_0005_baseline` | Native ledger authoritative |
| **B. Deploy onto empty (proof only)** | `prisma migrate deploy` on an empty owned file | Must produce the same inventory as A: `sqlite_master`, STRICT flags, ledger rows, moods. Native `assertCurrentSchema` passes. *Executed (I1):* identical inventory, native guard passes. Not a supported operator command before #51. |
| **C. Upgrade a populated 0005 copy** | 1. Stop writers (operator). 2. `pnpm db:snapshot <src> <new backup>`. 3. `assertCurrentSchema`, `integrity_check`, `foreign_key_check` are clean. 4. Canonical inventory equals path A, **and** `migrate diff --from-migrations prisma/migrations --to-config-datasource --exit-code` is empty. 5. `migrate status` shows the baseline not applied; if already applied, stop as a no-op. 6. `migrate resolve --applied 0_native_0005_baseline`. 7. Re-verify the logical snapshot and inventory (only `_prisma_migrations` added). | *Executed (F1, F2, path A):* diff empty, resolve marked applied, status "up to date", native guard still passes with `_prisma_migrations` present; only `_prisma_migrations` and its autoindex were added. |
| **D. Upgrade an older populated copy (0001–0003 / 0004)** | Native `migrate()` to 0005 first (the existing delivered upgrade), then path C | Older native ledgers are never resolved directly |
| **Refusals** | Ledger missing or mismatched → stop before step 6. Inventory drift (for example a trigger removed on an owned copy, or an extra demo table) → stop, **even though Prisma diff is empty**. A second resolve is never attempted. | Shows Prisma's own diff is not enough |

## 7. Evidence plan

Test file: `tests/db/prisma-baseline.test.ts` (`// @vitest-environment node`). Optional helper: `tests/db/prisma-baseline-fixture.ts`. Command: `pnpm test tests/db/prisma-baseline.test.ts`.

**Isolation rules for the test:**

- One `mkdtempSync(join(tmpdir(), "watchnext-prisma-baseline-"))` root, with the existing containment check before cleanup.
- Prisma CLI runs as a child process with an explicit environment: owned `file:` URLs only; `WATCHNEXT_DATABASE_PATH` (every `WATCHNEXT_*`, `PRISMA_*` and `DATABASE_URL` variable) removed; `HOME`, `XDG_DATA_HOME`, `LOCALAPPDATA` (plus `USERPROFILE`, `APPDATA`, `XDG_CACHE_HOME`, `XDG_CONFIG_HOME`) pointed into the owned root; `CHECKPOINT_DISABLE=1`. *As executed:* the test starts the pinned CLI as `node node_modules/prisma/build/index.js` (the binary `pnpm exec prisma` runs) so pnpm itself never reads the redirected home.
- No normal or demo path is ever named. Native and Prisma connections are opened one after the other, never both at once (§2).

| ID | Check | Status |
| --- | --- | --- |
| F1 | Populated fixture, current: every one of the 19 tables has at least one row. Covers both group modes, removed+rejoined memberships, revoked/expired/live sessions, `context_revision` 9007199254740990, all four title types incl. archived and `metadata_unavailable` NULL fields, 10 genres on one title, every progress state, a timestamp kept above a later-corrected duration, ratings, a multiline Unicode note, provider/user/cleared provenance, a review, a pending intent and a legacy session. | **executed**: all 19 tables populated; coverage assertions pass; path C preserved every value |
| F2 | Populated fixture, older ledger: legacy data at 0001–0003 → native upgrade → path C | **executed**: 0001–0003 data, native 0004/0005 upgrade, path C preserved every value |
| V1 | `prisma validate` and `prisma generate` succeed | **executed**: both exit 0 without a URL; no file created in the owned root |
| D1 | `db pull --print` on F1 yields exactly the 19 tables and the same column set as the committed schema (compared programmatically) | **executed**: raw introspection with a bare datasource-only schema; 19 tables, identical column names, scalar types, optionality and index `map` names |
| D2 | `migrate diff --from-migrations prisma/migrations --to-config-datasource --exit-code` on F1, F2 and path A → empty | **executed**: exit 0, "No difference detected" for path A, F1, F2 (and, deliberately, the dropped-trigger copy) |
| D3 | `migrate diff --from-config-datasource --to-schema <temp copy> --exit-code` → empty, where the temp copy replaces **exactly nine** `dbgenerated("(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))")` with the introspected literal and changes nothing else | **executed**: exactly 9 replacements asserted and reversible; exit 0, "No difference detected" on F1 |
| I1 | Canonical inventory equal across native, path A, path B and post-resolve F1/F2: normalized `sqlite_master` incl. 18 triggers / 8 indexes / 0 partial, STRICT flags, ledger, moods. A copy with one trigger dropped is caught by I1 while D2 stays empty. | **executed**: 19 STRICT tables, 18 triggers, 8 explicit + 29 automatic indexes, 0 partial, 27 FK edges (13 composite), 5 moods, 5 ledger rows; equal for native, A, B, F1, F2; dropped trigger refused |
| B1 | The real `scripts/db/snapshot.mjs` creates a new backup before resolve | **executed**: `node scripts/db/snapshot.mjs` child process before every resolve |
| B2 | After resolve, the full logical snapshot of all 19 tables is identical: IDs, password/recovery/session hashes, scrypt tuples, expiries, revocations, context revisions, generations, membership status, history, provenance, deadlines. `integrity_check` is ok, `foreign_key_check` is empty, native `assertCurrentSchema` passes. Exactly one finished `_prisma_migrations` row. | **executed**: snapshots equal; integrity ok, 0 FK violations, native guard passes, one finished row with `applied_steps_count` 0 |
| B3 | Rollback: restoring the backup to a new file gives a pre-baseline snapshot with no `_prisma_migrations`. On another owned copy, `DROP TABLE _prisma_migrations` gives the pre-baseline inventory (the baseline is purely additive). | **executed**: restored file equals the pre-baseline snapshot and `sqlite_master`; dropped-ledger copy equals the pre-baseline `sqlite_master` exactly |
| B4 | The baseline SQL equals the regenerated canonical dump; its checksums equal those of the committed native files | **executed**: equal (LF); the five checksums equal the committed files |
| P1 | With the generated client and `PrismaBetterSqlite3({ url, fileMustExist: true })`, every row of every model on F1 equals the native read | **executed**: every row of all 19 models equal, including `context_revision` 9007199254740990 |
| P2 | A Prisma `create` that omits `createdAt` stores an ISO `…Z` timestamp, not the text `strftime` | **executed**: 11 rows across all nine `dbgenerated` columns store ISO `…Z` |
| C1 | Through Prisma on the baselined copy, each class is rejected with the logical snapshot unchanged and the observed `originalCode` recorded: CHECK, STRICT type, composite cross-group FK, uniqueness, and the triggers (11th genre, membership delete, mode change, generation decrease, non-increasing revision, legacy session into an account group, timestamp above duration, type change with history). Also asserts `PRAGMA foreign_keys = 1`. | **executed**: all 12 rejected, snapshot unchanged, codes in §12; `PRAGMA foreign_keys` = 1 |
| S1 | Safety: commands that need a datasource fail without `WATCHNEXT_PRISMA_DATABASE_URL`. No package script contains `migrate dev`, `migrate reset`, `db push`, `db execute`, `--force-reset` or `--accept-data-loss`. The isolated default database path does not exist after the run. `lib/persistence/ports.ts` has no runtime exports and is not imported, and neither are `@prisma/client` or `generated/`, anywhere in `app/ lib/ db/ frontend/ scripts/`. | **executed**: all assertions pass (see §12) |

**Required commands for Engineer and QA, run serially:**

```text
pnpm install --frozen-lockfile
pnpm prisma:validate
pnpm prisma:generate
pnpm test tests/db/prisma-baseline.test.ts
pnpm test
pnpm typecheck
pnpm build
pnpm db:verify
pnpm db:verify:persistence
pnpm db:verify:backup
git diff --check
```

`pnpm test:e2e` / `pnpm test:mock` are not required because no runtime path changes; QA may still run them. No command touches a normal or demo database.

## 8. Forbidden Prisma commands against SQLite

Never run `prisma migrate dev`, `migrate reset`, `db push` or `db execute`, and never use `--force-reset` / `--accept-data-loss`. These would let Prisma generate DDL. *PM probe:* a schema mismatch made `migrate diff --script` emit `new_titles`/`new_members` table rebuilds without STRICT, CHECKs or triggers, plus `PRAGMA writable_schema` rewrites. Allowed commands: `validate`, `format`, `generate`, `db pull --print`, `migrate diff`, `migrate status`, `migrate resolve` (owned copies) and `migrate deploy` (empty owned files). Future schema changes need their own groomed decision. The default rule is a new immutable native `NNNN_*.sql` file plus a Prisma migration with identical SQL, verified by I1.

## 9. Backup and rollback recipe

1. **Before:** stop every writer of the file. With the pre-upgrade checkout, run `pnpm db:snapshot "<absolute source>" "<new absolute backup>"` ([backup-restore.md](backup-restore.md)). Keep source sidecars in place.
2. **Baseline:** follow path C on the selected file. In #48 this is executed only on owned copies; the operator command belongs to #51.
3. **Roll back (supported):** keep writers stopped. Run `pnpm db:snapshot "<backup>" "<new restore path>"`, select the restored path, then `pnpm db:init` (a no-op at the same revision) and `pnpm metadata:maintain`. Never overwrite the original. Restored security state is snapshot-time.
4. **Roll back (diagnostic, owned copy only):** `DROP TABLE _prisma_migrations` restores the exact pre-baseline schema, because the baseline adds nothing else.
5. Any failure before resolve leaves the source unchanged. A failed resolve is a Prisma ledger write only; recover with step 3.

## 10. Repository ports

Type-only declarations go in **`lib/persistence/ports.ts`**. The module has no runtime exports and no imports from `node:sqlite`, Prisma or `generated/`, and nothing imports it in #48.

**Signature rules:**

- Signatures use readonly domain DTOs: string IDs and hashes, `boolean` (not 0/1), Unix-second `number`, ISO `string`.
- Concurrency-guarded writes take expected values and return a discriminated result (`{ ok: true, … } | { ok: false, reason: "stale" | "conflict" | "not_found" }`). They do not leak driver errors.
- Every port method is asynchronous.

| Port | Minimum operations (names indicative) |
| --- | --- |
| `UnitOfWork` | `run(work: (repos) => Promise<T>)`: all-or-nothing; every write in `work` commits or none does |
| `AccountRepository` | find by id / username key; insert with the full credential tuple; replace credentials when the expected recovery digest matches |
| `AccountSessionRepository` | insert; find live (hash, now); revoke one / all for account except current; select group with expected context revision |
| `GroupRepository` | create legacy group; create account group with owner; find; advance invite generation from the expected value |
| `MemberRepository` | insert; list by group; find by normalized name key |
| `MembershipRepository` | join; remove at generation; rejoin at newer generation; find active / by member |
| `InvitationRepository` / `PendingInvitationRepository` | insert hashed; resolve by hash; revoke older generations; insert intent; consume once; purge expired |
| `LegacySessionRepository` | insert; find; select member with expected context revision |
| `TitleRepository` | find by manual identity / provider identity / id within group; insert with moods and genres; update metadata; archive / restore by id |
| `ContributionRepository` | add; remove own; count remaining |
| `PersonalHistoryRepository` | own progress / rating / note upsert and clear; group-visible history read |
| `MetadataProvenanceRepository` / `ReviewSnapshotRepository` | record origins and corrections; expire due fields (bounded batch); insert bounded review; consume once; purge expired |
| `PickerProjectionRepository` | read-only active titles plus selected viewers' progress |

**Portable invariants.** Domain services and *every* adapter (memory #44–#46, Prisma SQLite #49–#51, optional PostgreSQL #52) must uphold these. #49/#50 test them with one shared contract suite:

- live session/membership/context authority on every request;
- group-scoped ownership of every record;
- one shared title per group identity, with unique contributors;
- the last own removal archives; restore keeps the same ID and history;
- members write only their own personal records;
- no type/numbering change once history exists;
- timestamp ≤ current duration at write;
- at most 10 genres;
- immutable group mode and owner; monotonic invite generations and context revisions;
- memberships are never deleted; the owner always stays active; rejoin needs a newer generation;
- legacy sessions only in legacy groups;
- single-use intents and review consumption;
- only hashes of credentials are stored;
- expiry clears acquired fields and never touches history;
- all-or-nothing transactions with conditional (compare-and-set) writes.

**Adapter-specific enforcement.**

- **SQLite.** STRICT, CHECKs, the 18 triggers, composite FKs, `secure_delete`, busy timeout, immediate-lock transaction behaviour, and SQLite string semantics (`length` = code points, `GLOB`, `instr(…, char(0))`). These are defence in depth beneath the portable service checks.
- **PostgreSQL (#52, if it runs).** Rewritten CHECKs (`char_length`, regex), PL/pgSQL triggers or equivalent constraints, SERIALIZABLE or row locks with retry. There is no `secure_delete` equivalent; that limit must be documented.
- **Memory.** Enforced in code; data is lost on restart.

**Reconciliation rule with #44.** #44 is developed in parallel and may introduce its own repository interfaces for the memory backend.

1. Before #49 implementation starts, the #49 PM merges both sets into **one** interface module.
2. Interfaces already used by working #44 HTTP code are canonical for their names and shapes.
3. #48 ports and invariants not covered by #44 are added to that module; duplicate #48 declarations are then deleted.
4. Two parallel interface sets must never remain.
5. If #44 has not landed when #49 starts, #49 consumes `lib/persistence/ports.ts`, and #44 aligns with it on merge under the same rule.

**Applied by the #49 PM (October 20, 2026).** The #44 seam on `codex/http-phase` (`IdentityGroupRepository<State>`: synchronous `read()`/`reset()` of a mutable whole state) is not an operation-level persistence interface, and a durable adapter cannot implement it. `lib/persistence/ports.ts` therefore stays the one persistence port module. Clause 2 applies only to operation-level asynchronous interfaces. The exact rule and the #44 integration path are in [prisma-identity.md §2](prisma-identity.md#2-seam-decision-option-b-libpersistenceportsts-stays-canonical).

## 11. Open hazards handed to #49–#52

- No same-process native/Prisma co-open on one file (§2).
- Deferred `BEGIN` versus native `BEGIN IMMEDIATE` (§5).
- `fileMustExist: true` on every adapter construction.
- `bigint` raw results (§4 rule 7).
- Trigger errors mislabelled as `P2003` (§5).
- `secure_delete` per connection (§5).
- `_prisma_migrations` will appear in normal databases only after #51's explicit operator upgrade. Whole-table comparisons in existing backup/E2E fixtures must then account for it deliberately.
- Next bundling of the native `better-sqlite3` module is untested until #51.
- The Windows better-sqlite3 prebuild is unverified.

## 12. Engineer execution record

Commits `ef7f38e` and `7c811a1` on `claude/trusting-meitner-longv2`, Linux container, Node 24.22.0, pnpm 11.25.0. Run serially:

| Command | Result |
| --- | --- |
| `rm -rf node_modules && pnpm install --frozen-lockfile` | exit 0, no `ERR_PNPM_IGNORED_BUILDS`; schema engine and `better_sqlite3.node` present |
| `pnpm prisma:validate` / `pnpm prisma:generate` | exit 0 / exit 0 (client written to git-ignored `generated/prisma`) |
| `pnpm test tests/db/prisma-baseline.test.ts` | 16/16 passed, about 19 s |
| `pnpm typecheck` | exit 0, with and without `generated/` |
| `pnpm test` | first run 1099/1100: `tests/e2e-lifecycle.test.ts` "cleans a partially initialized fixture…" hit its 5 s default timeout under load (passes alone in under 1 s); one unchanged rerun 1100/1100 (105 files) |
| `pnpm build` | exit 0, only the known `db/migrate.ts` tracing warning |
| `pnpm db:verify`, `pnpm db:verify:persistence`, `pnpm db:verify:backup` | all PASS |
| `git diff --check` (staged) | clean |

**C1 observed codes** (Prisma code / `originalCode`): CHECK `P2039` / `SQLITE_CONSTRAINT_CHECK`; STRICT type (raw update) `P2010` / `SQLITE_CONSTRAINT_DATATYPE`; composite cross-group FK `P2003` / `SQLITE_CONSTRAINT_FOREIGNKEY`; duplicate title key `P2002` / `SQLITE_CONSTRAINT_UNIQUE`; 11th genre, membership delete, group mode change, invite-generation decrease, non-increasing context revision, legacy session in an account group, timestamp above duration and type change with history all `P2003` / `SQLITE_CONSTRAINT_TRIGGER`, each with its own native `RAISE` message asserted in `originalMessage`.

**Execution notes.**

- Path C, the refusals and the rollback recipe are executed as test code on owned copies. The operator baseline command, `_prisma_migrations` in normal databases and runtime use of the client remain #51.
- The canonical dump writes the five mood rows as five single-row `INSERT` statements. B4 compares bytes; a CRLF working copy (Windows `core.autocrlf`) is CRLF-normalized first, exactly like native migration checksums.
- D1 introspects with a bare datasource-only schema, so the committed schema cannot enrich the output.
- Every Prisma connection in the test passes `fileMustExist: true`, and a per-file guard refuses a native open while a Prisma handle is open on the same file (and the reverse).
- Still *PM probe* only, not re-executed: `Boolean`/`BigInt`/missing `sqlite_autoindex_*` map drift (§4 rules 3–5), `secure_delete` = 0 on Prisma connections and deferred `BEGIN` (#50), Prisma writes above 2³¹ beyond the C1 revision attempt. Not verified: the Windows better-sqlite3 prebuild, Next bundling of better-sqlite3, any PostgreSQL behaviour. Nothing here claims runtime ORM use or portability.
