# Private backup and separate restore

Use the repository's native SQLite snapshot helper, not a copy of a live main file. SQLite's **VACUUM INTO** reads a consistent committed snapshot, including WAL content, and creates a standalone logical copy with deleted free-page content removed. It leaves the source unchanged; logical primary keys/history/provenance are preserved, although hidden SQLite rowids/file layout need not be byte-identical. [SQLite VACUUM INTO](https://sqlite.org/lang_vacuum.html#vacuum_with_an_into_clause), [WAL rules](https://sqlite.org/wal.html).

## Take a backup

Stop **every** dev/production server and maintenance command using the source file. Keep its main file and any WAL/SHM/journal sidecars together at their existing paths; do not delete or manually mix them. The helper lets SQLite read the committed state, so no blind live-file copy, manual WAL checkpoint/copy order or sidecar copying is needed. Stopping writers gives a clear presentation backup boundary; an interrupted snapshot is a failure, not a usable backup. Use reliable private local storage with sufficient space.

In the same PowerShell configuration as [setup](local-setup.md), using an explicit initialized current source:

```powershell
$source = $env:WATCHNEXT_DATABASE_PATH
$backupDirectory = Join-Path $env:LOCALAPPDATA 'WatchNext Private Backups'
New-Item -ItemType Directory -Force -Path $backupDirectory | Out-Null
$backup = Join-Path $backupDirectory 'watchnext-2026-10-18.sqlite'
pnpm db:snapshot "$source" "$backup"
```

Choose a **new filename** each time. The command requires two absolute local paths, an existing valid current WatchNext source and a new destination whose parent already exists. It refuses existing destinations (even empty), same source/destination, aliases/links, URI/relative/network paths and pre-existing destination sidecars. It opens source read-only, reserves a new private output exclusively, uses a bound SQLite filename, validates migration history/foreign keys/integrity and verifies output. It performs no source expiry cleanup, migration or provider lookup. Failed owned output is removed when its original reservation can still be identified; do not use any interrupted/unverified file.

Before pulling new migrations, take a backup with the matching old source revision/tooling. The current helper intentionally rejects a source with pending/mismatched history rather than pretending a failed validation is a backup. Migration recovery never means editing applied checksums or deleting user data.

## Restore to a new file

Keep all servers/writers stopped. Restore by snapshotting the backup to another **new separate** path, not by overwriting the original or a normal/demo default. For example:

```powershell
$restoreDirectory = Join-Path $env:LOCALAPPDATA 'WatchNext Restored Review'
New-Item -ItemType Directory -Force -Path $restoreDirectory | Out-Null
$restored = Join-Path $restoreDirectory 'restored-2026-10-18.sqlite'
pnpm db:snapshot "$backup" "$restored"
$env:WATCHNEXT_DATABASE_PATH = $restored
$env:WATCHNEXT_APP_ORIGIN = 'http://127.0.0.1:3000'
pnpm db:init
pnpm metadata:maintain
pnpm build
pnpm start
```

For the Prisma-selected server, point both server settings to that **restored** new file before starting; do not point Prisma at the original while inspecting a restore:

```powershell
$env:WATCHNEXT_HTTP_REPOSITORY = 'prisma'
$env:WATCHNEXT_HTTP_PRISMA_DATABASE_URL = "file:$($restored.Replace('\','/'))"
pnpm start
```

For a native-to-Prisma cutover, work only on a new snapshot copy: (1) stop writers and snapshot the existing initialized native file, (2) copy that snapshot again to a new owned working path, (3) with `DATABASE_URL` set to the working copy, run `prisma migrate resolve --applied 20261025000000_native_sqlite_baseline`, and (4) inspect IDs, native `schema_migrations`, accounts/password hashes, memberships, titles/history and `PRAGMA foreign_key_check` before selecting Prisma. Never run `prisma db push` or `prisma migrate reset`. If anything fails, stop using the working copy and make a new copy from the untouched backup; rollback means selecting the untouched original/backup in a stopped server, never overwriting either file.

Open http://127.0.0.1:3000 and sign in/select an active account group; for separate legacy groups rejoin with the privately retained invitation and select a name. Initialization validates/applies legitimate current migrations; the same-revision repeat is a no-op. Maintenance must complete before presentation; repeat it deliberately if a large pending batch remains. Keep original and backup untouched while inspecting the restored copy. To resume the original later, stop this server and explicitly select the original `$source`; no file is moved/merged. Do not copy old sidecars onto the new standalone snapshot. Never delete an unfamiliar journal to make SQLite open.

Backups include versioned password hashes/salts/parameters, recovery digests, account-session hashes/expiry/revocation/context revisions, owners/membership status/removal/invite generations, group/profile/history, invitation/session **hashes**, imported fields and their original provenance/deadlines. They do not contain recoverable plaintext invite links or optional environment keys. Keep any needed raw link and optional key configuration privately and separately; neither Git nor issue attachments is an access delivery channel. A restored session is not verified identity, and old browser credentials/revocation state may differ from the live original. Rejoin/reselect deliberately; expired/invalid review or cycle handles require a new lookup/pick.

## Expiry still applies to every retained copy

Copying is not a new provider retrieval. The helper preserves original acquired-field timestamps/deadlines exactly. Offline maintenance on the restored file clears expired provider values while keeping identities, contributions, independently authored progress/completion/ratings/notes and user corrections. It does not silently maintain the original backup/source.

Retained backups themselves still contain acquired data until separately maintained/deleted. Do not keep old provider snapshots indefinitely: use the same configured-file maintenance on a deliberately selected writable private copy before its deadline, then create a verified sanitized new snapshot if retaining it, and retire the older retained copy under your local data policy. No external scheduler or powered-off physical erasure is installed. `secure_delete`/VACUUM remove ordinary SQLite cell/free-page copies in the maintained/new file, not OS snapshots, cloud backups, SSD remnants or an already-copied old backup. Manage those separately; no indefinite API-retention permission follows from this guide. [Lifecycle and external-policy limits](metadata-lifecycle.md).

## Executed isolated verification

```sh
pnpm db:verify:backup
pnpm test tests/db/backup.test.ts
```

The synthetic fixture has multiple named members, all title types, joint contributions, independent coordinates/timestamps/completion, ratings/multiline notes, an archived entry and acquired-field provenance. It deliberately holds committed content only in WAL while the writer is idle, snapshots/restores to new paths, verifies every logical row/ID/ledger/deadline plus source main/WAL and sentinel bytes, then runs the **real** offline maintenance command only on the restored file. Expired acquired title/runtime clear, original deadlines remain, member history/constraints remain, and the deleted acquired title is absent from ordinary restored main-file bytes. This is a WAL-aware fixture, not a claim that arbitrary concurrent writers were stopped by automation. All fixture data/processes are owned temporary resources; normal/demo data is never a validation target.

## Snapshot-time account security

An authenticated restore is the **security state at snapshot time**. Later password resets, recovery-code rotations, session revocations, participant removals or invite rotations cannot be reconstructed from an older file. A previously current code/session/invitation may become valid again when deliberately restoring that older state; restore does not automatically revoke every session or issue a replacement code. Keep backups private and treat post-snapshot security changes as absent. Raw passwords, recovery codes, session/invite/review credentials and optional provider keys are not stored in the database. Restoring a digest cannot reveal a lost code.

Supported `pnpm test:e2e` additionally creates real accounts/groups/history in the UI, recovers the same populated owner, revokes prior sessions and removes a member. `tests/e2e/account-storage.mjs` compares every logical table through committed WAL to a new backup/restore and a fresh-process digest; original main/WAL stay byte-identical. Real offline maintenance clears an acquired pending review/runtime/cover only in the restored copy before browser presentation, preserving authored title/history and security state. Normal/demo/unrelated sentinels stay unchanged. This extends rather than replaces the legacy-only storage fixture.
