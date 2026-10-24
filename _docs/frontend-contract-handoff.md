# Typed frontend contract handoff to #43

October 19, 2026 · written by the #61 Engineer from the source of `frontend/service/contracts.ts` and `frontend/mock/*` as accepted through [#60](https://github.com/xiaodlb/watchnext/issues/60). It hands every typed operation of the one mounted mock service to [#43](https://github.com/xiaodlb/watchnext/issues/43), which owns the root `openapi.yml`. **This page creates no OpenAPI file, route handler, HTTP adapter, path, HTTP method, status code or ORM code.** The coverage proof is the matrix in [mock integration](mock-integration.md); the row-by-row requirements are in the [operation inventory](operation-inventory.md).

## Shared result shape

Every asynchronous method returns `Promise<ServiceResult<T>>`:

| Outcome | Shape | Meaning for #43 |
| --- | --- | --- |
| success | `{ kind: "success"; value: T; context: ContextIdentity }` | `value` is the typed result below; `context` is the identity the caller must send with its next write. |
| failure | `{ kind: "failure"; error: { code; message; retryable; fields? } }` | `code` is one of the `ServiceFailure` codes; `fields` maps field keys to messages. In the mock every failure is `retryable: true` except `invalid_selection`. |
| stale | `{ kind: "stale"; message }` | The caller's `expected: ContextIdentity` (or the context captured by a read) no longer matches. Nothing was written. A real server answers this from its session/membership/generation, not from a client value. |
| cancelled | `{ kind: "cancelled"; message }` | The caller aborted (`RequestOptions.signal`). Nothing was written. Client-side only; an HTTP adapter maps an aborted fetch to it. |

`ContextIdentity` is `{ mode: "mock"; instance; revision }`. In the mock it is a synthetic coordination tag that a sign-in, sign-out, group selection, mode change, profile change, join, removal, rotation, creation or Reset advances. It is **not** a credential and grants nothing; later stages must derive identity from the live session and membership generation.

Failure codes and field keys (`FieldErrors`): `invalid_selection` (`mode`, `scenario`), `demo_unavailable` (mock-only Unavailable scenario), `invalid_account` (`username`, `password`, `confirmation`), `invalid_credentials`, `invalid_proof` (`proof` is the form field), `group_access`, `group_input`, `invite_invalid`, `library_access`, `library_input`, `library_conflict`, `personal_access`, `personal_input` (`positionState`, `nextSeason`, `nextEpisode`, `timestamp`, `completed`, `rating`, `note`), `picker_access`, `picker_input` (`viewers`, `availableMinutes`, `mood`, `rewatches`, `form`). The picker's cycle conflict is a **success** outcome (`PickerOutcome.kind === "conflict"`), not a failure code.

`RequestOptions` is `{ signal?: AbortSignal; scenario?: "ready" | "slow" | "unavailable" }`; `ProviderOptions` adds `outcome?: ProviderOutcome`. `scenario` and `outcome` are mock-only test switches (see below).

## Operations

Columns: inventory ID and proposed name → actual typed method; inputs and success type; failures beyond the shared `demo_unavailable` / `stale` / `cancelled`; required context; the later stage that owns real HTTP with memory storage. Every write takes `expected: ContextIdentity` and `options?: RequestOptions` as its last two parameters unless stated.

### Accounts (#44)

| Inventory → actual | Inputs → success | Failures | Required context |
| --- | --- | --- | --- |
| A01 `accounts.register` → `accounts.register` | `AccountInput { username; password; confirmation }` → `PrivateDisclosure { code; next: "account" }` (once-only recovery code) | `invalid_account` with `username`/`password`/`confirmation` | expected identity; signs the new account in |
| A02 `accounts.signIn` → `accounts.signIn` | `AccountInput { username; password }` → `MockContext` | `invalid_credentials` (same message for unknown and wrong) | expected identity |
| A03 `accounts.signOut` → `accounts.signOut` | none → `MockContext` (account `null`) | none beyond shared; absent session is a safe success | expected identity |
| A04 `accounts.recover` → `accounts.recover` | `AccountInput { username; password; confirmation; proof }` → `PrivateDisclosure { code; next: "signin" }` | `invalid_account`, `invalid_proof` | expected identity; signs the target out |
| A05 `accounts.getContext` → `accounts.read` | `options` only → `MockContext { identity; label; account; group }` | shared only | none; stale if the context changes while pending |
| A05 `groups.listMemberships` → `groups.read` | see G06 | | |

### Groups and legacy (#44)

| Inventory → actual | Inputs → success | Failures | Required context |
| --- | --- | --- | --- |
| G01 `groups.create` → `groups.create` | `name` → `InviteDisclosure { invite; kind: "account" }` (once-only), selects the new group | `group_input` (1–80 chars, no NUL), `group_access` (not signed in) | expected identity, signed-in account |
| G02 `invites.resolve` → `groups.resolve` | `invite` → `GroupWorkspace` (legacy: selects the group; account: a pending intent, private name hidden while anonymous) | `invite_invalid` | expected identity; intent bound to revision, generation and 600 s |
| G03 `groups.joinPending` → `groups.join` | none → `GroupWorkspace` | `group_access` (anonymous, removed at the current generation), `invite_invalid` | signed-in account, current pending intent of the same revision and generation |
| G04 `groups.select` → `groups.select` | `groupId` → `GroupWorkspace` | `group_access` (foreign or removed) | expected identity, active membership |
| G05 `groups.useLegacyMode` → `groups.mode` | `"account" \| "legacy"` → `GroupWorkspace` | `group_input` | expected identity |
| G06 `groups.getManagement` → `groups.read` | `options` only → `GroupWorkspace { mode; memberships; selected; members; profileId; canManage; pending }` | shared only | none; stale if the context changes while pending |
| G07 `groups.removeMember` → `groups.remove` | `memberId`, `memberGeneration` → `GroupWorkspace` (member kept inactive) | `group_access` (not creator, self, foreign, stale generation) | creator of the selected account group, member generation |
| G08 `groups.rotateInvite` → `groups.rotate` | `generation` → `InviteDisclosure` (once-only) | `group_access` (not creator, generation changed) | creator, invitation generation |
| L01 `legacy.createGroup` → `groups.createLegacy` | `name` → `InviteDisclosure { kind: "legacy" }` | `group_input` | expected identity; no account ownership |
| L02 `legacy.getProfiles` → `groups.read` / `groups.resolve` | as G06 / G02 in legacy mode | as above | resolved legacy group |
| L03 `legacy.createProfile` → `groups.createProfile` | `name`, `AvatarColor` → `GroupWorkspace` (selects it) | `group_access` (no legacy group), `group_input` (name, palette, normalized duplicate) | selected legacy group |
| L04 `legacy.selectProfile` → `groups.selectProfile` | `profileId` → `GroupWorkspace` | `group_access` (wrong group or missing) | selected legacy group |

### Library, entry and metadata (#45)

| Inventory → actual | Inputs → success | Failures | Required context |
| --- | --- | --- | --- |
| W01 `library.list` → `library.list(filter, false, …)` | `filter: unknown` (`all`/`mine`, anything else → All with a notice) → `LibraryList` | `library_access` (no group) | selected group; Mine from the live member, legacy has All only |
| W02 `library.listArchived` → `library.list(filter, true, …)` | → `LibraryList { archived: true }` | `library_access` | selected group |
| W03 `library.getTitle` → `library.detail` | `id` → `LibraryTitle` (contributors, attributed history, `personal: PersonalPanel`, capabilities) | `library_access` (missing or foreign) | selected group; no profile needed for legacy browsing |
| W04 `library.saveManual` → `entry.save` | `LibraryDraft`, `typicalConfirmed`, `reviewHandle: undefined`, `confirmation` → `EntrySaved` (`saved` with `LibraryTitle`, or `confirmation` with `handle`, `matchId`) | `library_input` (validation, typical-duration consent, form-supplied provenance) | own active member or selected legacy profile |
| W05 `library.confirmSave` → `entry.save` with `confirmation` | same inputs plus the returned confirmation handle → `EntrySaved` | `library_input` (expired or changed confirmation, conflicting provider identities) | confirmation bound to the exact draft, match ID and revision |
| W06 `library.getEditDraft` / `library.updateTitle` → `library.editDraft` / `library.save` | `id` → `LibraryTitle`; `id`, `revision`, `LibraryDraft`, `confirmation` → `LibrarySave` (`saved` or `confirmation`) | `library_access` (not a contributor, archived), `library_input`, `library_conflict` (revision changed) | active contribution, captured title revision, identity-change confirmation |
| W07 `library.removeOwnContribution` → `library.removeOwn` | `id`, `revision` → `LibraryTitle` (archived when it was the last contribution) | `library_access`, `library_conflict` | own member/profile, revision |
| W08 `library.restore` → `library.restore` | `id`, `revision` → `LibraryTitle` (same ID, own contribution restored) | `library_access`, `library_conflict` | own member/profile, revision |
| M01 `metadata.search` → `entry.search` | `source`, `kind: "title" \| "link"`, `query` → `EntryPage \| EntryReview` | `library_input` (invalid query, provider outcome, superseded lookup) | own member or legacy profile; supersedes earlier lookups |
| M02 `metadata.page` → `entry.page` | `pageHandle`, `"next" \| "previous"` → `EntryPage` | `library_input` (expired, superseded, five-visit limit) | page handle bound to source, query and context |
| M03 `metadata.selectCandidate` → `entry.select` | `pageHandle`, `candidateId` → `EntryReview` | `library_input` (not contained, unavailable item) | page handle |
| M04 `metadata.saveReviewed` → `entry.adopt` + `entry.save` | `reviewHandle` → `EntryReview` (marks it applied); then `entry.save(draft, typicalConfirmed, reviewHandle, confirmation, …)` → `EntrySaved` | `library_input` (expired, consumed or unapplied review) | review handle bound to context; provider identity is server-owned |
| M05 `metadata.refreshTitle` → `entry.refresh` | `id` (+ `ProviderOptions.outcome`) → `LibraryTitle` | `library_input` (no contribution, unavailable item, provider outcome) | active contribution (account) or selected legacy profile |
| M06 internal `lifecycle.ensureFresh` | **no public method** | — | internal maintenance run inside every gated call; never a client endpoint |

### Personal progress and feedback (#46)

All eight methods take `id`, the operation input, `claim: PersonalClaim { memberId; numberingStyle }`, `expected` and `options`, and return `PersonalCommit { record; own; history }`. The claim is a stale-form check only: the live actor and the current title decide; a claim for another member is `personal_access`.

| Inventory → actual | Input | Failures |
| --- | --- | --- |
| P01 `progress.saveEpisode` → same | `EpisodeInput { position; season; episode }` | `personal_input` (`positionState`, `nextSeason`, `nextEpisode`), `personal_access` (structure, archived, impersonation) |
| P02 `progress.saveTimestamp` / `clearTimestamp` → same | `timestamp` text / none | `personal_input` (`timestamp`), `personal_access` |
| P03 `progress.setCompleted` → same | `completed: boolean` | `personal_input` (`completed`), `personal_access` |
| P04 `feedback.saveRating` / `clearRating` → same | `score` text / none | `personal_input` (`rating`), `personal_access` |
| P05 `feedback.saveNote` / `clearNote` → same | `body` text / none | `personal_input` (`note`), `personal_access` |

### Picker (#46)

| Inventory → actual | Inputs → success | Failures | Required context |
| --- | --- | --- | --- |
| K01 `picker.getInputs` → same | none → `PickerInputs { groupId; groupName; mode; viewers; canAddTitle }` | `picker_access` | selected group; active members only (legacy: every profile) |
| K02 `picker.pick` → same | `PickerInput { viewerIds; availableMinutes; mood; rewatches }`, `intentId` → `PickerOutcome` (`picked` with `cycle`, `no_match`, `conflict`) | `picker_input`, `picker_access` | selected group; idempotent per logical intent |
| K03 `picker.next` → same | `PickerCycleHandle { cycleId; step }`, `intentId` → `PickerOutcome` (`picked`, `exhausted`, `conflict`; `refreshed` flag) | `picker_access` | cycle handle of this context and group, current step |
| K04 `picker.restart` → same | `PickerInput`, `PickerCycleHandle`, `intentId` → `PickerOutcome` | `picker_input`, `picker_access` | same input key as the cycle, after exhaustion or a data change |

## Client-only, internal and mock-only members

- **Client-only (no endpoint):** U01 draft/import handling, including the synchronous `entry.discard(handle)` and `entry.cancelLookup(expected)`, which only drop page-local lookup state; U02 copy and once-only disclosure; U03 All/Mine/archive navigation (it reuses `library.list`); U04 cover preview and fallback; U05 external links; U06 navigation, focus and announced states.
- **Internal:** M06 metadata expiry. It runs inside the service gate before and after each commit and is never called by the UI.
- **Mock-only, not part of the HTTP contract:** `context.initialIdentity`, `context.read`, `context.reset` (Reset demo), `entry.advanceTime` (synthetic clock), the `scenario` field of `RequestOptions` and the `outcome` field of `ProviderOptions`.

## What the mock does not prove

The mock shows interaction states only. It does **not** prove authentication, password hashing, session or cookie protection, origin/CSRF checks, real authorization against a database, throttling, provider entitlement, quota, licensing or live availability, durable persistence, restart behavior, cross-process concurrency, physical deletion or scheduled expiry. The fixture credentials (`Demo.Owner` / `Demo.Viewer` / `synthetic password`) are a synthetic demo, not security evidence. #44–#46 must implement and test all of these against real server state; #43 must not copy mock behavior as a security claim.
