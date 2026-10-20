# Prisma identity and group repositories — issue #49

October 20, 2026 · **PM-groomed plan for authorized [#49](https://github.com/xiaodlb/watchnext/issues/49). Nothing here is implemented yet.** Rows marked *PM probe* record what the PM ran against the pinned #48 toolchain in a throwaway scratch directory outside the repository, on synthetic files. A probe is **not** repository evidence and does not replace the tests below.

Authority: the user authorized #48–#54 on 2026-10-20 ([process.md](process.md#authorization-for-issues-43-54-october-20-2026)). #49's prerequisite #48 has an independent QA PASS at `69b0bc8`. Mapping, baseline and hazards come from [prisma-baseline.md](prisma-baseline.md); this document uses its IDs (F1, F2, C1, §10 and so on).

## 1. What #49 delivers

Real Prisma-backed repositories for accounts, account sessions, recovery, groups, members, account memberships, invitations, pending invitation intents and legacy sessions. They run against isolated, natively migrated SQLite files. The repositories are proved with:

- one shared contract suite that runs against a memory adapter and the Prisma adapter;
- the same HTTP suite against both adapters;
- a real process restart that keeps Prisma data and loses memory data.

#49 does **not** change the production default. The native `node:sqlite` runtime, `/v1` memory mode from #44 and `/mock` behave exactly as before. There is no runtime storage selector (that is #51) and no content, history or provenance repository (that is #50).

## 2. Seam decision: option (b), `lib/persistence/ports.ts` stays canonical

### What the other agent's #44 seam is

Upstream branch `codex/http-phase` at `24829e2` was inspected read-only. It is not QA-closed and is still changing. Its seam is `lib/http-memory/repository.ts`:

```ts
export interface IdentityGroupRepository<State> { read(): State; reset(): void; }
```

`lib/http-memory/service.ts` mutates the returned `State` (Maps of accounts, sessions, groups, invites, pending and legacy entries) in place, synchronously, with no write call and no transaction.

A durable adapter cannot implement that seam honestly:

- `read()` is synchronous, but the Prisma client is asynchronous;
- writes happen by mutating the object, so there is nothing to persist except the whole state;
- implementing it would mean loading every row and flushing every row back, which is the full-snapshot fallback that criterion 1 rules out and which loses cross-process races.

A "thin adapter from Prisma to the #44 seam" is therefore impossible. The only thin adapter possible goes the other way: the #44 HTTP service calls operation-level asynchronous ports.

### Options compared

| | (a) Implement the #44 seam; merge `codex/http-phase` now | **(b) Implement `ports.ts`; integrate #44 through ports (chosen)** |
| --- | --- | --- |
| Can a Prisma adapter satisfy it? | No (see above) | Yes. Async, operation-level, `UnitOfWork`. |
| What joins our branch, and when | Now: 13 unaccepted upstream commits. They include the 10,471-line `openapi.yml`, `scripts/verify-openapi.mjs`, a `package.json` script, `frontend/service/http-contract.ts`, a `tests/frontend/coverage.test.ts` edit, `.env.example`, #44 code still in QA repair, and #45–#47 grooming documents. | Part A: nothing. Part B: the #44 SHA that has independent QA PASS, brought in by one merge commit. |
| Ownership | Edits #44 files while the other agent is still editing them | #44 files change only under the rule in §2.3 |
| Our QA scope | Has to cover or exclude unreviewed upstream work | Covers #49. Upstream work arrives with its own QA verdict. |

### 2.3 Reconciliation rule (supersedes the interpretation of prisma-baseline §10 clause 2)

1. **One persistence port module.** `lib/persistence/ports.ts` stays the only persistence port set and stays type-only, with zero runtime exports. #49 may change identity port shapes so that they cover every native identity operation and every #44 HTTP operation (A01–A05, G01–G08, L01–L04), as §4 lists. #49 does not change the content ports; they belong to #50.
2. **What counts as an upstream interface used by working code.** An upstream interface counts only when it is operation-level, asynchronous and implementable by a durable adapter without loading or flushing the whole state. `IdentityGroupRepository<State>` and `ProcessMemoryRepository<State>` fail this test. They may remain as #44's in-process holder; for example, the memory port adapter may keep its Maps inside `ProcessMemoryRepository`. They are never a second persistence seam.
3. **One memory adapter.** #49 adds `lib/persistence/memory/identity.ts`, which implements the identity ports. If the #44 owner writes their own ports-based memory adapter, the two are merged into one at Part B. Two memory adapters must never remain.
4. **Bringing #44 in (Part B).** Bring in the #44 head that has an independent QA PASS with `git merge --no-ff <qa-passed-sha>`. Never rebase, cherry-pick, squash or force-push. Record the upstream SHA and its QA verdict in the merge message and in the pull request. Resolve conflicts (most likely `package.json` scripts) minimally, and keep both sides' intent. If upstream later rewrites history, merge again; never rewrite ours. Fetch upstream read-only with:
   `git fetch https://github.com/xiaodlb/watchnext codex/http-phase:refs/remotes/upstream/http-phase`
5. **Who routes the #44 HTTP service through ports.**
   - **B1 (preferred).** The #44 owner adopts `UnitOfWork` plus the identity ports before #44's QA closure. The orchestrator sends them §4 and this rule.
   - **B2 (fallback).** If #44 is QA-closed with the state-holder seam, #49 refactors `lib/http-memory/service.ts` in the commit after the merge. Allowed only after the orchestrator records that #44 is closed and its owner no longer edits those files. The refactor must preserve behaviour. #44's own tests, `tests/http-memory.test.ts` included, must pass **unchanged** against the memory adapter **before** any Prisma wiring is added. The static check in that test (`service.ts` does not mention `node:sqlite`, `db/` or `getDatabase`) keeps passing.
6. **Divergences are findings.** The parity suite may expose a #44 behaviour that the native constraints reject, for example a legacy profile name longer than 40 code points. Report it to the #44 owner through the orchestrator as a defect. Do not hide it in the Prisma adapter. As defence in depth, the adapter maps the constraint failure to the same safe validation outcome and never to a 500 error.
7. **No deferral.** #49 closes only after Part B's memory-versus-Prisma HTTP parity and the restart proof have actually run at one SHA. If Part B is blocked, #49 stays open; it is never moved to #51.

## 3. Two parts, one closure

| Part | Depends on | Content | Gate |
| --- | --- | --- | --- |
| **A**: ports, adapters, domain contract | #48 only (done) | Identity port changes. Prisma and memory adapters. A shared port-level contract suite run against both adapters. Races and rollback, cross-process races, populated F1/F2 copies, native/Prisma cross-reading. Suite stabilization. | The Engineer may commit Part A and request an interim QA check. That check is labelled **not closable**. |
| **B**: HTTP parity and restart | QA-passed #44 that reaches storage only through ports (rule 5, B1 or B2) | Merge, the shared HTTP contract suite run against both adapters, a test-only server restart harness, the full gates | One QA PASS for **all** criteria at one SHA closes #49 |

## 4. Identity ports: operations the adapters must provide

Names are indicative; shapes follow prisma-baseline §10 signature rules: readonly DTOs, booleans not 0/1, Unix-second `number`, ISO `string`, `WriteResult` for compare-and-set writes, everything async. Each item maps to the native code it must match.

| Port | Operations (each inside a `UnitOfWork`) | Native reference |
| --- | --- | --- |
| `AccountRepository` | `findById`, `findByUsernameKey` (returns the full scrypt tuple and recovery digest); `insert` (`conflict` on a duplicate key); `replaceCredentials` as compare-and-set on `expectedRecoveryDigest` | `lib/accounts/service.ts` register/login/recover |
| `AccountSessionRepository` | `insert` with an **explicit** `createdAt`, `expiresAt` and initial `contextRevision` (#44 uses 1 and native uses the default 0; the adapter stores exactly what it is given); `findLive(hash, now)` = not revoked and `expires_at > now`; `revoke(hash, now)` sets `revoked_at = max(created_at, now)` once, and a second call is a no-op; `revokeAllForAccountExcept`; `selectGroup` as compare-and-set on `expectedContextRevision`, advancing by exactly 1 | `issueSession`, `logoutAccount`, `select()` |
| `GroupRepository` | `createLegacy`, `createAccountGroup`, `find`, `advanceInviteGeneration` as compare-and-set, refused at 2147483647 | `createGroup`, `rotateGroupInvite` |
| `MemberRepository` | `insert`, `findById(scope)`, `listByGroup`, `findByNameKey` | `member()`, `changeProfile` |
| `MembershipRepository` | `join`; `remove(atGeneration, removedAt)` (records the removal generation once; an already-removed membership is `already_removed` with no write); `rejoin` (needs a generation newer than `removed_invite_generation` and keeps the same `member_id`); `findActive`, `findByMember`; `listActiveGroupsForAccount`; `listForGroup` with member rows | `member()`, `removeParticipant`, `accountGroups`, `readGroupManagement` |
| `InvitationRepository` | `insert`, `resolveByHash` (with group mode and current generation), `revokeAllActive(groupId, revokedAt)` | `beginAccountInvite`, rotate |
| `PendingInvitationRepository` | `replace` (delete then insert), `findLive(hash, now)`, `consume` (single use: a second call is `not_found`), `purgeExpired`, `countLive` | `beginAccountInvite`, `joinAccountGroup` |
| `LegacySessionRepository` | `insert` with an explicit `invitationId` and initial `contextRevision`; `find` (the invitation must not be revoked and the group must be legacy); `selectMember` as compare-and-set; `advanceContext`; `delete` | `acceptInvitation`, `requireSession`, `invalidateLegacy`, `changeProfile` |
| `UnitOfWork` | `run(work)` for writes and `read(work)` for read-only work. Both are all-or-nothing; see §5. | every `BEGIN IMMEDIATE` block |

**Mapping defaults where #44 and the native schema differ** (delegated engineering defaults, none needs a schema change):

- **Colors.** The HTTP enum (`blue`, `purple`, `teal`, `rose`, `amber`, `slate`) maps one-to-one to the native `#rrggbb` values in `avatarPalette` (`lib/profile-state.ts`). Ports and storage carry the hex value; the HTTP layer translates.
- **Pending intent.** #44 binds a pending invitation to the account session and its context revision. It is stored in the existing table with `intent_hash = SHA-256("watchnext-pending-v1:" + sessionTokenHash + ":" + contextRevision)`, the resolved `invitation_id` and `expires_at = now + 600`. Joining recomputes the hash from the live session. A changed revision finds nothing, which equals #44's revision check. The generation is checked through the invitation (not revoked, and generation equal to the group's). If the native 1,000-row cap is applied, both adapters apply it at the service layer.
- **Removal.** #44 keeps `removedAt` as a generation number. Ports and storage use `removed_invite_generation` plus an ISO `removed_at`.
- **Legacy session.** The service passes the resolved invitation id, which the native composite FK requires.
- **Times.** Session and intent times are integer Unix seconds (`Math.floor`) and are never stored as floats. ISO text comes from the database default or from `toISOString()`, both `…sssZ`.
- **Identifiers.** The service generates IDs and secrets (`randomUUID`, 32-byte base64url). The adapter stores exactly the DTO values and never generates IDs or hashes.

## 5. Prisma adapter rules (exact defaults)

| Topic | Default | Why |
| --- | --- | --- |
| Opening | `openPrismaIdentityStore({ path })`. `path` must be absolute. Relative paths, `:memory:`, `file:` URLs, `?`, `#` and NUL are refused. Construct `new PrismaBetterSqlite3({ url: "file:" + path, fileMustExist: true })`. The opener never reads `WATCHNEXT_DATABASE_PATH`, `WATCHNEXT_PRISMA_DATABASE_URL` or `.env*`; the caller always passes the path. | The adapter otherwise creates missing files (prisma-baseline §2). Selection belongs to #51. |
| Open guard | After connecting: set `PRAGMA secure_delete=ON` and read it back; verify `foreign_keys = 1` and `busy_timeout = 5000`; read `schema_migrations` and require the exact 0001–0005 filenames and CRLF-normalized checksums of `db/migrations` (the same rule as native `assertCurrentSchema`). Otherwise disconnect and refuse. `_prisma_migrations` is neither required nor written. Never migrate, create tables or baseline. | Mirrors native `getDatabase`. `secure_delete` is a deliberate superset of native behaviour, so deleted intent and session hashes are overwritten; #50 relies on it too. *PM probe:* a fresh Prisma connection reads `foreign_keys` 1 and `busy_timeout` 5000. |
| Same-file rule | In one process, the opener refuses when the shared native connection (`globalThis.__watchNextDatabase`) is open on the same resolved path. Tests keep the #48 per-file open-handle guard: native and Prisma handles never overlap on one file in one process. Separate processes are fine. | Two SQLite library copies (prisma-baseline §2) |
| Every operation inside a transaction | Every port call, **reads included**, runs inside `prisma.$transaction(async tx => …, { maxWait: 5000, timeout: 10000 })`. Repositories receive only `tx` and never the top-level client. Slow asynchronous work such as scrypt never runs inside a unit of work; it runs before the unit, and the unit then compares and sets. | *PM probe:* with the official adapter, a top-level query sent while another interactive transaction is open runs **on the same connection inside that transaction**. A top-level read saw an uncommitted group. A top-level `create` reported success and was then **silently rolled back** with the other transaction. Only transactions take the adapter's mutex. |
| Immediate locking | The first statement of every write unit is the adapter-local constant `UPDATE groups SET name = name WHERE 0`. Read units skip it. | The adapter issues deferred `BEGIN`. *PM probe:* with this leading no-op write, a separate process's `BEGIN IMMEDIATE` (busy timeout 0) got `database is locked` until commit. With a read-only start it acquired the lock at once. So the leading write gives `BEGIN IMMEDIATE` serialization. Native files use `journal_mode=delete`. |
| Monotonic columns | Never include an unchanged `contextRevision` or `inviteGeneration` in Prisma `data`. Advance with `updateMany({ where: { …, contextRevision: expected }, data: { contextRevision: { increment: 1 } } })` and treat `count !== 1` as `stale`. | The triggers fire on `UPDATE OF` even when the value is equal. Compare-and-set gives `stale` rather than a trigger abort. |
| Error mapping | Read `meta.driverAdapterError.cause.originalCode` / `originalMessage`, never the `P2003` code alone. `SQLITE_CONSTRAINT_UNIQUE` (P2002) → `conflict`. `SQLITE_CONSTRAINT_TRIGGER` with a known native `RAISE` message → `conflict` (generation, owner, mode) or `stale` (revision). `SQLITE_CONSTRAINT_CHECK` (P2039) → `conflict`, which the service shows as a validation failure. `SQLITE_CONSTRAINT_FOREIGNKEY` → `not_found`. `SQLITE_BUSY` and P2028 (a transaction `maxWait` or `timeout`) → throw `PersistenceBusyError` (retryable). Anything else is rethrown as `PersistenceError` without the SQL, the path or the driver text. | Observed codes are in prisma-baseline §12. The HTTP layer maps `PersistenceBusyError` to the contract's existing retryable shape (`503 service_unavailable`, `retryable: true`). The #44 owner should confirm that mapping. |
| Raw SQL | Allowed **only** in `lib/persistence/prisma/sqlite-specific.ts`: the lock statement, the three PRAGMAs and the ledger read. A test scans `lib/persistence/**` and fails if `$queryRaw`, `$executeRaw` or `Unsafe` appears anywhere else, or if that file contains a statement outside this list. Raw integers come back as `bigint` and are converted explicitly. | "Narrow, adapter-local, documented" (criterion 2) |
| Imports | `lib/persistence/prisma/**` may import `@prisma/adapter-better-sqlite3` and `generated/prisma`. Nothing else in `app/ lib/ db/ frontend/ scripts/` may import them. Nothing imports `node:sqlite` or the native `lib/accounts` / `lib/sessions` database functions into the adapter. `.next/server` contains no Prisma chunk after `pnpm build`. | No production wiring before #51; no native fallback |
| Generated client | Add a root `"postinstall": "prisma generate"`, so `pnpm install --frozen-lockfile` produces the git-ignored `generated/`, and typecheck, build and tests work on a fresh checkout. `generate` opens no database. If pnpm refuses to run it, stop and report rather than commit generated code. | Adapter modules import the generated types statically |
| Lifecycle | `close()` calls `$disconnect()` and is idempotent. Exactly one client exists per opened path per process. | — |

## 6. Invariants the contract suite must prove (both adapters unless marked)

1. **Exact values.**
   - Inserted and read-back rows keep IDs, `username`/`username_key`, the scrypt tuple (`version 1`, `scrypt`, 128-hex hash, 32-hex salt, N 131072, r 8, p 1, maxmem 268435456), the recovery digest and token hashes byte for byte.
   - Session `created_at`, `expires_at` and `revoked_at` stay integers.
   - In storage (Prisma), every column's `typeof()` and `quote()` equals what native code writes for the same DTO, read back natively after the Prisma handle is closed.
2. **Sessions.**
   - Live means `expires_at > now`, and the boundary second is dead.
   - Revocation is `max(created_at, now)` and idempotent.
   - Logout revokes only the current session.
   - Recovery revokes every session of the target account, and no other account's.
3. **Single-use recovery.**
   - `replaceCredentials` with a stale digest returns `stale` and changes nothing.
   - Two concurrent recoveries with the same proof produce exactly one success; the account then holds the winner's hash, salt and digest.
4. **Context epochs.**
   - `selectGroup` and `selectMember` advance by exactly 1, as compare-and-set; a stale expectation returns `stale` without a write.
   - An account mode change also advances the legacy session.
   - At `context_revision = 9007199254740990`, an advance returns a failure and rolls back. It never wraps and never surfaces a raw CHECK error.
5. **Generations, owner, remove and rejoin.**
   - Rotation is compare-and-set, revokes all active invitations and inserts exactly one at generation + 1. Two concurrent rotations give one success.
   - The owner cannot be removed: service refusal, and the trigger as backstop maps to `conflict`.
   - Removal records the generation once, a second removal makes no write, and membership rows are never deleted.
   - Rejoin at a generation not newer than the removal generation is refused. Rejoin at a newer one keeps the same `member_id`.
   - Pending intents created before a rotation are refused at join.
   - Join racing removal leaves one consistent final state with no partial rows.
6. **Legacy separation.**
   - A legacy session in an account group is refused.
   - Account operations never read or change legacy groups, members or sessions.
   - Profile names are unique per group by name key.
7. **Rollback.** A unit of work whose second write fails, by an injected throw or by a trigger, leaves the full logical snapshot unchanged.
8. **Same-process isolation (Prisma regression for the §5 probe).** While a unit of work holds uncommitted writes and then fails, a concurrent unit started from another request neither sees those writes nor loses its own committed write.
9. **Cross-process races (Prisma).**
   - Two child processes, each with its own client on one owned file, race rotation, recovery, and join against removal.
   - The outcomes match the native `tests/accounts/management-concurrency.test.ts` expectations.
   - No `SQLITE_BUSY` escapes as an unmapped error.
   - Afterwards `foreign_key_check` is empty.
   - One race runs a native worker against a Prisma worker on the same file and serializes the same way.
10. **Populated copies (Prisma, reusing #48 F1/F2).**
    - Build F1 and F2 with `tests/db/prisma-baseline-fixture.ts` on owned copies, then close the native handle.
    - The adapter reads every account, session, membership, invitation, intent and legacy session exactly as the native read: live, revoked and expired classification at a fixed `now`, removed and rejoined status, and revision 9007199254740990.
    - Then run representative writes: register, select, rotate, remove, rejoin and legacy profile.
    - The logical snapshot diff equals exactly the expected rows. Legacy groups and all content tables are unchanged.
    - Native `assertCurrentSchema`, `integrity_check` and `foreign_key_check` pass afterwards.
    - Native readers (`currentAccount`, `accountSession`, `requestContext`, `requireSession`) accept the Prisma-written sessions and contexts, and the adapter reads natively written rows.
    - One copy is first baselined (path C), proving the adapter works with and without `_prisma_migrations`.
11. **Refusals (Prisma).**
    - A missing path is refused and the file is not created.
    - An empty or un-migrated file and a mismatched ledger are refused, and the file bytes are unchanged.
    - A relative path or a URL is refused.

## 7. Restart proof without the #51 selector (Part B)

A **test-only** harness, `tests/fixtures/identity-http-server.mjs`, runs under `node --import ./tests/fixtures/save-resolver.mjs`.

- It takes `mode` (`memory` | `prisma`), an owned absolute file path and a port.
- It builds the repositories, then serves the same storage-neutral `/v1` handler that the Next catch-all route calls, over `node:http` on `127.0.0.1`.
- It is a real OS process with real sockets and cookie headers.
- It lives under `tests/`, so no `app/`/`lib/` runtime path can select Prisma, and the Next route keeps its memory-only, env-gated behaviour.

*PM probe:* a plain Node 24 child process with the existing resolver loaded `db/migrate.ts` and the generated `client.ts` and queried through the adapter, so no new dependency is needed. In-repo modules resolve `@prisma/adapter-better-sqlite3` normally; the probe script lived outside the repo and needed the full path.

`tests/http-identity-restart.test.ts` drives two cookie jars through real HTTP:

1. register owner and member, create a group, resolve and join, select;
2. rotate, then remove, then rejoin with the new link;
3. create a legacy group, a profile and a selection;
4. record the recovery code;
5. send SIGTERM (bounded 10-second stop) and start a new process on the same file.

**Prisma mode:**
- old cookies are still authenticated with the same account and group IDs, names, member IDs, generation, membership status, removal generation and context revisions;
- the legacy cookie still sees its profile;
- the pre-restart recovery code works once and fails the second time.

After the server exits, a native read of the file passes the guard, integrity and FK checks.

**Memory mode, same script:**
- after the restart, old cookies are anonymous and login fails;
- `/v1/context` has `account: null`.

Both runs:
- use an owned `mkdtemp` root with a containment check;
- redirect `HOME`/`XDG_DATA_HOME`/`LOCALAPPDATA` and strip `WATCHNEXT_*`/`PRISMA_*`/`DATABASE_URL`;
- leave the isolated default database path absent and a neighbouring sentinel unchanged.

## 8. Shared suites and parity

- **Port-level suite:** `tests/persistence/identity-contract.ts` exports `defineIdentityContract(label, factory)`. The `.ts` name keeps it out of test discovery. It runs from `tests/persistence/identity-memory.test.ts` and `tests/persistence/identity-prisma.test.ts`. The same case list must run for both; a test asserts that the two registered case-name lists are equal.
- **HTTP suite:** `tests/http-identity-contract.ts` contains at least every case of #44's `tests/http-memory.test.ts`, covering all 17 operations. It adds the §6 cases that are observable over HTTP: stale revisions, replayed recovery, rotation, removal and rejoin races, rollback, and foreign or duplicate cookies. It runs from `tests/http-identity-memory.test.ts` and `tests/http-identity-prisma.test.ts` through the storage-neutral handler with injected repositories. #44's own test file stays unchanged and passing.

## 9. Suite stability (in scope)

At #48, QA saw `tests/e2e-lifecycle.test.ts` › "cleans a partially initialized fixture…" exceed its 5-second default timeout (8.1 s) once in four full runs. The likely cause is CPU contention from roughly 25 Prisma CLI processes in `tests/db/prisma-baseline.test.ts` on four cores with two Vitest workers. #49 adds more process-heavy tests, so it must stabilize the suite:

- New #49 tests spawn **no** Prisma CLI process, except at most one `migrate resolve` for the baselined-copy case. Fixtures come from native `migrate()` or F1/F2.
- Preferred fix: in `vitest.config.mts`, run the process-heavy files (`tests/db/prisma-baseline.test.ts`, the cross-process race test and the restart test) as a separate project with `sequence.groupOrder` after the default group, with one worker. Vitest 5.0.5 supports `groupOrder`. An equivalent load reduction is acceptable if it is measured and documented.
- The discovered file set must be identical before and after the change apart from the new files: same count, no duplicates, and `@vitest-environment` comments still honoured.
- Raising a timeout is **not** an acceptable fix on its own. Default timeouts, worker caps for the default group, crypto cost and assertions stay unchanged.
- Evidence: three **consecutive** full `pnpm test` runs pass at the final SHA with no rerun in between, with durations recorded. Any failure resets the count and is reported.

## 10. Bounded files

- **Part A:**
  - `lib/persistence/ports.ts` (identity shapes; stays type-only);
  - `lib/persistence/prisma/{open,unit-of-work,errors,sqlite-specific,identity}.ts`, which may be split per repository;
  - `lib/persistence/memory/identity.ts`;
  - `tests/persistence/*`;
  - `tests/fixtures/prisma-identity-worker.mjs`;
  - additive exports only in `tests/db/prisma-baseline-fixture.ts`;
  - `tests/db/prisma-baseline.test.ts`, but only to narrow S1 (allow the `lib/persistence/prisma/**` imports and the single `postinstall` script, and keep every other check) and to reduce load;
  - `vitest.config.mts`;
  - `package.json` (`postinstall` only);
  - docs: this file, `prisma-baseline.md`, `database.md`, `testing-guidelines.md`.
- **Part B:**
  - the merge commit;
  - `lib/http-memory/{service,repository}.ts` (only under B2, behaviour-preserving);
  - `tests/http-identity-*.ts`;
  - `tests/fixtures/identity-http-server.mjs`;
  - docs.
- **Not touched:** `db/**`, `db/migrations/*.sql`, `prisma/schema.prisma`, `prisma/migrations/**`, `frontend/**`, `scripts/**`, `app/**` (except upstream files arriving by merge), other `lib/**`, other existing tests, normal, demo and user databases. No new dependency, no schema change. If a requirement seems to need a schema change, stop and report it to the PM.

## 11. Verification commands (serial; no normal database)

```text
rm -rf node_modules generated && pnpm install --frozen-lockfile   # generated/ appears via postinstall
pnpm prisma:validate
pnpm prisma:generate
pnpm test tests/persistence
pnpm test tests/db/prisma-baseline.test.ts
pnpm test tests/http-memory.test.ts tests/http-identity-memory.test.ts tests/http-identity-prisma.test.ts tests/http-identity-restart.test.ts   # Part B
pnpm test        # three consecutive passing runs, durations recorded
pnpm typecheck
pnpm build       # then: no Prisma/adapter reference in .next/server
pnpm db:verify
pnpm db:verify:persistence
pnpm db:verify:backup
pnpm test:mock   # Part B: the merged /v1 route must not disturb /mock
git diff --check
```

`pnpm test:e2e` is optional; the native runtime does not change. Results go into §12 below. Unexecuted items stay labelled planned.

## 12. Execution record

*Planned. To be filled in by the Engineer with commits, commands and actual results.*
