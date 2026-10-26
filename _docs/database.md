# SQLite schema and migrations

Current account/discovery delivery and historical boundaries are mapped in [enhancement-audit.md](enhancement-audit.md). Account groups use live authenticated membership/context identity; only separate legacy groups use trusted selectable names. Later issue-specific sections supersede first-release restrictions without converting old groups.

For an independent synthetic presentation database, use `pnpm demo:prepare`; see [demo data](demo-data.md) for owned paths, explicit reset, private invitation output and isolated checks. This does not change normal connection/init resolution or applied migration history.

Issues: [#4](https://github.com/xiaodlb/watchnext/issues/4) supplies the schema; [#5](https://github.com/xiaodlb/watchnext/issues/5) supplies persistent local access. The foundation uses Node.js **24.15+ within 24.x**, TypeScript, built-in **`node:sqlite` / `DatabaseSync`**, and ordered SQL migrations. No ORM, driver, or dependency was added. Synchronous access suits this small local academic app; connections use a bounded five-second busy timeout. Node 24 strips the source TypeScript directly for CLI use. [Node SQLite documentation](https://nodejs.org/api/sqlite.html)

## Decisions and scope

Read [the schema-affecting decision gate](decisions.md#schema-affecting-approval-gate) and D01–D17, D23–D25, D27. D01/D02 are explicitly user-approved. The remaining entries were resolved as **delegated decisions** on October 15, 2026 under the directive quoted in [the plan](plan.md), adopting their recorded recommendations/rationale. They are not presented as separate explicit answers.

In particular, D08/D09 define manual/provider identities; D03 defines stored position as **next to watch**; D04–D07 define unknown progress, numbering bounds, transitions, and completed-series rewatches; D11–D13 define one title-level rating/note per member; D14 defines group-unique normalized names. D17 uses whole seconds, and D23–D25 separate manual timestamp from completion while retaining old timestamps when duration is corrected.

The database module supplies storage rather than UI/authorization. The app now implements sessions, guards, duplicate confirmation, progress/feedback, transactional archive/restore, provider review/lifecycle and picker/cycles through their owning #7–#27 increments. D18–D22/D26/D28 are resolved there. Migration `0003_metadata_lifecycle.sql` adds nullable acquired fields/provenance/reviews; see below and [the lifecycle guide](metadata-lifecycle.md). [Provider research](metadata-providers.md) does not establish authenticated availability.

## Normal persistent database setup

Run this **explicit setup command** before the app first needs database access, and again after pulling new migrations:

```text
pnpm db:init
```

It creates the parent directory and database if missing, applies committed migrations through `db/migrate.ts`, closes the setup connection, and prints the selected path/applied versions. Repeating it preserves existing user rows. It never seeds, resets, deletes, or silently switches databases. Normal access requires an initialized current schema and does **not** automatically migrate or create a missing database; it reports `run pnpm db:init` instead. Initialization is the only normal command that creates/migrates a file.

The server-only environment variable is **`WATCHNEXT_DATABASE_PATH`**. An unset variable uses the stable OS-user-data default:

| OS | Default file |
| --- | --- |
| Windows | `%LOCALAPPDATA%\WatchNext\watchnext.sqlite`; if LOCALAPPDATA is unset, `<home>\AppData\Local\WatchNext\watchnext.sqlite` |
| macOS | `<home>/Library/Application Support/WatchNext/watchnext.sqlite` |
| Linux/other | `$XDG_DATA_HOME/WatchNext/watchnext.sqlite` when set, otherwise `<home>/.local/share/WatchNext/watchnext.sqlite` |

The local-user-data base must be absolute. An override may be an absolute filename or a relative filename resolved against the **process working directory**; launch commands from the repository root for consistent relative paths. Spaces are supported and should be quoted by the shell. Blank/whitespace-only values, NUL, `:memory:`, SQLite `file:` URIs, directory destinations, and inaccessible/unwritable paths fail clearly without falling back. Use a dedicated file owned by the current user; errors include the chosen path on the server to help diagnose setup/permissions.

Example PowerShell override for a **local** drive:

```powershell
$env:WATCHNEXT_DATABASE_PATH = 'C:\Users\your-name\AppData\Local\WatchNext Demo\watchnext.sqlite'
$env:WATCHNEXT_APP_ORIGIN = 'http://127.0.0.1:3000'
pnpm db:init
pnpm dev
```

Alternatively put `WATCHNEXT_DATABASE_PATH="C:/Users/your-name/AppData/Local/WatchNext Demo/watchnext.sqlite"` in untracked `.env.local`. The initialization command loads `.env.local` with Node's built-in environment-file option; Next loads it for dev/start. Shell environment values take precedence. Do not use `NEXT_PUBLIC_` for configuration. Remove the override to use the default; this does not move or merge data.

Use reliable local storage, **not a shared/network drive or a cloud-sync folder**. The repository may be on `M:`, but the default deliberately follows local user storage instead of that repository location. SQLite locking and journals depend on filesystem behavior; an override to a network location is an operator choice, not a supported sharing solution. Keep database, journal, `.env.local`, and generated outputs out of Git.

## Shared server entry and connection lifecycle

Next server components/actions import **`getDatabase` and `closeDatabase` from `db/server.ts`**. Its `import "server-only"` marker produces a clear framework build error if imported from a Client Component. The Node-only connection core also rejects browser execution and imports native Node filesystem/SQLite APIs. Paths and the driver are never passed as client props or imported through UI utilities. Next supplies the server-only marker internally, so no package was added. [Next server-only boundary](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)

Standalone Node setup/check scripts use `db/connection.ts`, the same connection/configuration implementation behind that wrapper. `getDatabase(environment?)` resolves configuration, opens only an existing writable file, enables foreign keys and a 5000ms busy timeout, verifies committed migration history **without writing it**, and caches one connection per process through `globalThis` so development module reloads reuse it. A changed path while open throws; call `closeDatabase()` before switching. Do not close after every request. A process exit releases its handles; an explicit server shutdown hook or tests should call `closeDatabase()`, which safely closes/resets even when called repeatedly. Do not pass per-request untrusted environment/path values to this interface.

The setup function `initializeDatabase(environment?)` creates/migrates a file using its own connection and always closes it. A corrupt database, read-only file, permission error, pending schema, or invalid history is surfaced; no catch creates a replacement database. The five-second timeout bounds lock waits rather than retrying forever. This is one local process connection, not a distributed pool or concurrent-write retry framework.

## Verify persistence without touching normal user data

```text
pnpm db:verify:persistence
```

This command accepts no database arguments and always creates its own `watchnext-persistence-*` directory under the OS temporary directory. It overrides configuration for three separate Node processes through the shared `db/connection.ts` entry: one initializes/writes `Unchanged restart example`, a fresh one reads the unchanged record, and another initializes an independent file and confirms the record is absent. It prints three `PASS` results and an isolation summary, exits nonzero on failure, and removes only its verified temporary directory. The worker refuses to run without an explicit fixture path under that directory. It never uses the normal configured/default database or reads a `.env.local` file.

`tests/db/persistence.test.ts` also exercises close/reopen, repeat initialization, connection reuse/close/reset, foreign keys/timeout, default paths using an isolated user-data base, alternate paths with spaces, relative-path rules, explicit initialization requirements, corrupt destinations, and invalid/unwritable paths. `tests/db/server-boundary.test.ts` creates an isolated minimal Next fixture and confirms a client import fails with the server-only boundary message. It uses Webpack because the temporary dependency junction is outside Turbopack's filesystem root; the normal app still builds with its existing Turbopack setup. All fixture directories are checked before recursive cleanup.

## Run from the repository root

Install dependencies using the existing lockfile if needed:

```text
pnpm install --frozen-lockfile
```

Create a new isolated database, apply migrations, and print its absolute path and table names:

```text
pnpm db:migrate:temp
```

This command always creates a fresh `watchnext-schema-*` directory under the OS temporary directory, with `schema.sqlite` inside. It deliberately accepts **no database-path arguments** and does not read a normal database environment variable. The printed database is retained for inspection. It contains schema and fixed mood definitions, no member fixtures, personal information, or usable invitation credentials. Remove that named temporary directory when inspection is finished.

Run the complete migration/constraint acceptance fixtures in another fresh temporary database:

```text
pnpm db:verify
```

Expected result: twelve named `PASS` lines followed by a summary; a failed assertion prints `FAIL` and exits nonzero. The fixture database and its empty temporary directory are removed when finished, including on failure. The command rejects extra arguments, never accepts a normal data path, and never touches user databases. All fixture names/IDs/notes are synthetic; the invitation fixture is an unusable example hash.

Run the regular suite, including these same fixtures plus migration failure/retry/history tests:

```text
pnpm test
pnpm test tests/db/schema.test.ts
pnpm typecheck
pnpm build
```

The fixtures validate reads as well as rejected writes, including the four content types, multiple moods, independent member histories, provider scope, cross-group/orphan associations, bounds, archive identity/history, and repeat migration. Migration tests also verify atomic rollback, safe retry, immutable checksums, and invalid version history.

## Data dictionary

### Additive account foundation — issue #31

`0004_accounts_memberships.sql` adds storage only. Migrations 0001–0003 are unchanged. Existing groups receive `access_mode='legacy'`, `owner_account_id=NULL`, and invite generation 1; existing invitations receive generation 1. Every original column and business row is preserved, including revoked invites, legacy sessions, unavailable metadata, provenance, reviews and personal history. The migration does not create accounts or claim a legacy profile. Mode and owner are immutable after group insertion; a new account group must be inserted explicitly with `access_mode='account'` and a real owner account. At the #31 schema boundary, application routes still used legacy groups; runtime credentials and live account group authorization are now described under #32–#34 below.

| Storage | Contract |
| --- | --- |
| `accounts` | Stable ID, display `username` and unique lowercase `username_key`; 3–32 ASCII letters/digits/underscore/dot/hyphen, no surrounding whitespace. Server validation in #32 trims input before insertion. No password/recovery default values. |
| Password columns | Version 1 / `scrypt`; 64-byte derived key and 16-byte salt encoded as lowercase hex, explicit N/r/p/maxmem integers. SQL checks power-of-two N (16384–1048576), r (1–32), p (1–16), maxmem (16 MiB–2147483647 bytes). These are storage bounds, not the chosen runtime work factor or a claim that hashing is implemented; #32 chooses an appropriate compatible tuple and asynchronous resource limits. |
| `recovery_digest` | 32-byte lowercase hex digest only; #32/#33 generate/show the private code and replace/revoke credentials. No plaintext code copy. |
| `account_sessions` | SHA-256-sized lowercase hex token hash; account FK, integer UTC Unix seconds `created_at`/`expires_at` (expiry strictly later), nullable `revoked_at` at/after creation. Account-global, separate from legacy `group_sessions`; no raw cookie, active profile or group authority. #32 performs live expiry/revocation checks. |
| `groups` additions | Immutable `legacy`/`account` mode with null/non-null owner respectively. Owner FK prevents orphan ownership; no ownership transfer. `invite_generation` is positive, bounded to 2147483647 and cannot decrease. |
| `invitations.generation` | Positive bounded generation of issuance, default 1 for existing legacy behavior. #34/#35 issue and validate actual invite generations and revoke old invites transactionally; the column alone does not implement rotation/access. |
| `account_memberships` | PK `(account_id,group_id)` and unique `member_id`; composite FKs require an account-mode group and that member's actual group. Identity mapping is immutable and cannot be deleted; status changes between active and removed retain the same member/history. Indexed `(group_id,status,account_id)` supports future live guards. |

Memberships record `joined_invite_generation`; removed status requires `removed_at` and `removed_invite_generation >= joined_invite_generation`. Active status has null removal fields. Generations cannot exceed the group's current generation. Reactivation of a removed membership requires a strictly newer joined generation than its removal generation. The owner cannot be marked removed. #35 must still verify a valid newly shared invite, current owner/membership and race conditions on every request: SQL structure alone is not request authorization. Removing a membership never removes its contributions, titles, progress, ratings, notes or display identity, even when it was the last contributor. There is no account/group deletion cascade.

Legacy `group_sessions` inserts and updates into account groups are rejected by triggers; account memberships cannot reference legacy groups. Having a legacy member ID never establishes account ownership. The #31 migration alone does not make a new mode reachable. Runtime account parsing and live group ownership are delivered through #32/#34, while owner removal/rotation controls remain #35.

`pnpm test tests/db/accounts.test.ts` uses owned temporary files for fresh/populated/repeated migration, complete original-column snapshots, failed-DDL rollback/retry, normalized account uniqueness, orphan/duplicate/cross-group/cross-mode rejection, removals/rejoin history and competing connections with transactional rollback. Existing schema/persistence/backup and legacy browser journeys remain regression gates. Normal user databases are never initialized/migrated by these tests.

All tables use SQLite `STRICT` typing. Integer storage rejects fractional values that cannot be losslessly converted. Foreign keys are explicitly enabled for each migration connection; future app connections must do the same. [STRICT tables](https://www.sqlite.org/stricttables.html), [foreign-key requirements](https://www.sqlite.org/foreignkeys.html)

| Table | Keys and stored data | Important invariants |
| --- | --- | --- |
| `schema_migrations` | Four-digit version primary key, filename, SHA-256 checksum, UTC application time | Applied files are immutable; only the next ordered prefix may be applied. |
| `groups` | Text ID, display name, UTC creation time | Display name 1–80 trimmed characters; IDs are caller-generated opaque IDs. |
| `invitations` | Text ID, group ID, unique token hash, optional revocation timestamp, UTC creation time | Store a cryptographic hash of an eventual high-entropy bearer token, never its plaintext. Token generation/rotation/resolution is #7/#8. |
| `members` | Text ID, group ID, display name, normalized `name_key`, avatar hex color, UTC creation time | Name 1–40 Unicode code points; unique `(group_id, name_key)`; a name may exist in another group. Palette selection is a UI/server responsibility. |
| `titles` | Stable ID/group, title/key/type/duration, numbering, provider pair, optional source/watch/cover URLs, archive/metadata-unavailable flags, creation time | Manual metadata is required; acquired title/key/type/duration may genuinely become NULL only in the unavailable-provider state. Known runtime is integer 1–86400. Types are movie/series/anime/youtube; numbering is none/season_episode/continuous. Provider pair is both present or absent; preserved numbering/history is not inferred from expired values. |
| `title_genres` | Title ID, normalized genre key, display label | Unique title/key; at most ten labels, each 1–40 code points; optional. |
| `moods` | Fixed code and display label | Seeded Funny, Relaxing, Exciting, Dark, Emotional; custom codes rejected. |
| `title_moods` | Title ID + mood code primary key | Several distinct moods per title; foreign keys reject unknown titles/moods. |
| `contributors` | Group ID, title/member composite primary key, UTC save time | Only same-group associations; repeated contribution rejected. |
| `progress` | Group ID, title/member composite primary key, numbering style, position state, optional next season/episode/timestamp, independent completion boolean | Same-group member/title and matching numbering style required. See state rules below. |
| `ratings` | Group ID, title/member composite primary key, integer score | Same group; 1–10 only; clearing deletes a row rather than storing zero. |
| `notes` | Group ID, title/member composite primary key, plain-text body | Same group; 1–2000 Unicode code points; clearing deletes a row. Embedded NUL is rejected so SQLite length cannot undercount text. |
| `group_sessions` | SHA-256 session hash primary key, group ID, backing invitation ID, nullable active member ID, UTC creation time | Added by immutable `0002_group_sessions.sql`; composite foreign keys ensure invitation/member belong to the session group. No raw cookie/invite credentials stored. |

Identifiers are stable across archive/restore. `archived = 1` is excluded by delivered active-list/picker queries; `0` is active. No SQL automation trigger or cascade deletes history. The #15 application service transactionally removes own contributions, archives on the final removal and restores the same entry/history.

Issue #8 adds only the sessions migration and an invitation ID/group unique index. Re-run `pnpm db:init` to apply it to an existing local database. Session validity is checked against the current invitation revocation state on every access; browser cookie lifetime and server invalidation policy are documented in [api.md](api.md). Session rows do not supply verified personal identity and are not profile records.

Composite foreign keys reference `(title_id, group_id)` and `(member_id, group_id)` in every contributor/progress/feedback table. Progress also references the title's numbering style. Consequently a valid member ID from the wrong group fails even when both records exist. This provides data consistency, not request authorization or proof of a profile's identity.

## Identity and validation boundaries

Server validators produce keys using Unicode NFKC, outer trimming, internal-whitespace collapse and locale-independent lowercase (D08/D14). SQLite's NOCASE alone is insufficient; display casing stays separate. Delivered form/service writes normalize server-side and never accept caller-supplied keys blindly.

Titles have unique `(group_id, content_type, title_key)` keys, including archived entries. Manual matching therefore requires confirmation or a distinguishable title such as a year suffix, rather than silent history merging. Known provider identities are unique by `(group_id, provider_namespace, provider_id)`, including archived entries. Different providers and groups may share an external identifier; many manual entries can have NULL provider fields. A duplicate import must add a contributor rather than overwrite metadata (D27), implemented in #13/#19.

The schema validates structural bounds, group consistency, and identity uniqueness. Features must also enforce semantic validation: keys are normalized, at least one mood is present when committing a title, colors come from the UI palette, labels/notes are trimmed, and links are safe HTTP/HTTPS values. A title and its moods are created in one application transaction; requiring a mood via an immediate row trigger would prevent inserting the parent before its children. These feature checks remain in their owning issues and are not claimed as SQL constraints here.

History-sensitive content type/numbering changes are blocked by a trigger once progress, ratings, or notes exist, preserving member meaning (D10). Ordinary metadata corrections leave history untouched. Identity edits still need collision handling and confirmation at the application layer.

## Progress and time representation

- Whole-second `duration_seconds` is the full movie/video runtime or one typical episode runtime. There is no episode catalog or per-episode runtime table. Picker matching does not subtract personal timestamps.
- `position_state = unknown` on episodic content has NULL episode/season. No progress row also means unknown episodic progress; neither fabricates episode 1. For movies/videos an absent row means not marked completed with no timestamp.
- `not_started` on episodic content explicitly stores episode 1, and season 1 for season/episode numbering. `in_progress` stores the next positive episode, with a positive season only for season/episode mode. Coordinates are integer 1–9999. The schema never infers season lengths.
- `none` numbering forbids episode coordinates; episodic styles forbid timestamps. A composite foreign key rejects a progress style different from its title.
- `completed` is a separate 0/1 flag. Episode coordinates survive completion/undo; delivered controls and eligibility/rewatch logic preserve that distinction.
- Movie/video timestamp is NULL for not recorded, or an integer from zero through the current full duration. Triggers reject new out-of-range timestamps. Older timestamps above a corrected runtime remain, with delivered warning/correction/clearing controls. Completion alone does not erase/revalidate that historical position; timestamps never automatically mark completion.

## Migration contract and recovery

`db/migrate.ts` reads `db/migrations/NNNN_name.sql` lexically, rejects duplicate versions, enables foreign keys, and sets a five-second busy timeout. A `schema_migrations` ledger records version, filename, checksum, and application time. Checksums normalize CRLF to LF so Windows checkout line endings do not invalidate an unchanged migration.

Every pending migration and its ledger record run inside one `BEGIN IMMEDIATE` batch transaction. A failed SQL statement or history check rolls back the batch. The empty ledger table may exist after a first failed attempt, but none of the new schema/data/versions survive. Correct the unapplied file and retry. Already-applied files must never be rewritten; add a new numbered migration instead. Missing, changed, or reordered applied history causes a clear failure rather than reapplication. Repeat migration with unchanged files returns an empty list and preserves all fixtures.

There are no down migrations, migration framework or automatic destructive normal resets. Explicit initialization and read-only normal-access checks reuse this mechanism. Use [the new-file SQLite snapshot/restore recipe](backup-restore.md) and `pnpm db:verify:backup` for isolated WAL/deadline/history verification. Databases, sidecars, environment files and logs are Git-ignored.
## Live account context — issue #34

Additive `0005_account_context.sql` preserves applied 0001–0004 and every business ID/value. `account_sessions.selected_group_id` is a nullable group reference; `context_revision` is a bounded nonnegative integer on both account and legacy sessions. Update triggers require revisions to increase. A group FK alone grants no access: runtime selection reads must also join the actual account's active membership and account-mode group. Group/mode switching advances revisions transactionally, invalidating old bound actions/reviews/cycles even after switching back. Account-session expiry/password material and existing personal history are unchanged.

`pending_group_invitations` stores only a SHA-256 continuation credential hash, invitation FK and absolute expiry. The service creates 32-byte random credentials, limits them to ten minutes/1000 pending rows, and revalidates the current invitation generation on protected join. No raw invitation or continuation credential is persisted. Create/join/switch use immediate transactions; join consumes the intent atomically with stable membership and selection. Separate-process competing join tests prove one winner and no partial member/membership rows. Removed-member history remains linked to the original member on allowed newer-generation rejoin. Owner removal/rotation UI is #35, while the existing status/generation guards are already enforced.

The populated upgrade test compares all original columns/ledger/history before and after 0005, reruns without change, and verifies FK/revision enforcement plus failed-migration rollback/retry. `pnpm db:verify` now applies all five ordered migrations. Tests and browser fixtures use explicitly initialized owned databases only.

## Imported metadata lifecycle foundation — issue #19

Migration `0003_metadata_lifecycle.sql` rebuilds only `titles` to allow genuinely null acquired title/key/type/duration when `metadata_unavailable=1` and a provider identity exists. Ordinary manual rows still require real title/type/positive runtime; no zero or invented value is stored. Numbering, identity, contributions and history remain intact. `metadata_fields` stores origins/deadlines without duplicate acquired values, and `metadata_reviews` stores short-lived group/member/session-bound review state. Cleared provider fields retain deadline/origin rows for later guarded refresh, with no original-value copy.

SQLite replacement uses deferred foreign keys inside the migration transaction. An assertion checks actual foreign keys before resetting SQLite's pending deferred DROP counter; foreign_keys stays enabled. Populated upgrade/rollback fixtures verify history/associations/ledger. Runtime access runs bounded expiry cleanup; pending large batches fail safely rather than expose expired fields. The delivered review/refresh integration is documented in [metadata lifecycle](metadata-lifecycle.md).

## Prisma mapping baseline (issue #48)

`prisma/schema.prisma` maps this native schema and immutable migration ledger. With the explicit server-only #51 selection, the complete HTTP runtime uses the Prisma repository composition; without it the intentionally ephemeral memory composition is selected. Read [prisma-baseline.md](prisma-baseline.md) for the owned-copy-only validation commands and recovery procedure, and [prisma-constraint-inventory.md](prisma-constraint-inventory.md) before any adapter work. Prisma does not replace the native `CHECK` constraints, triggers, `STRICT` tables, transaction/busy configuration, secure deletion or migration-ledger verification.

The #49 identity and #50 library adapters are composed by #51 behind trusted server configuration, documented in [prisma-identity.md](prisma-identity.md). The runtime URL must be an explicit initialized owned `file:` database; it cannot be chosen by a request and has no memory/native fallback.
