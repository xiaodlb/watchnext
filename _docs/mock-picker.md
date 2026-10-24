# Mock picker and Pick again handoff — issue #60

Status: **Implemented, independently QA-passed at `b6132ad`.** Engineering started after prerequisite [#59](https://github.com/xiaodlb/watchnext/issues/59) received its independent QA PASS at `033c656`. See [Engineer implementation and evidence](#engineer-implementation-and-evidence). [#60](https://github.com/xiaodlb/watchnext/issues/60) owns K01–K04 and the picker portions of U03, U05 and U06 in the [operation inventory](operation-inventory.md).

Read these first:

- the [mock personal](mock-personal.md), [mock library](mock-library.md), [mock entry](mock-entry.md), [mock groups](mock-groups.md) and [mock frontend](mock-frontend.md) handoffs;
- the pure-algorithm contracts: [eligibility](eligibility.md), [ranking](ranking.md) and the [picking cycle](picking-cycle.md);
- [API](api.md) sections for issues #24–#27, [decisions](decisions.md) D03–D07 and D17–D22, and [specification](specification.md) FR15–FR17;
- the [design system](design-system.md), the observed [desktop picker reference](references/lovable-2026-10-19/picker-desktop.png) and its [provenance](design-references.md);
- the [testing guidelines](testing-guidelines.md).

Every rule below is an **engineering default derived from the completed baseline**, not a new user answer. The baseline sources are `lib/picker/eligibility.ts`, `ranking.ts`, `types.ts`, `cycle.ts`, `server.ts` and `app/pick/picker.tsx` at tag `graded-baseline-2026-10-19`; these files have not changed since that tag. D18–D22 are delegated decisions from October 17, not explicit approvals. Where the inventory wording differs from the baseline source, the source decides. Where the mock model genuinely cannot copy the baseline, the difference is listed under [Resolved differences](#resolved-differences).

## Reuse the pure algorithm, not the server path

The mock picker must **call the baseline ranking itself**, not a copy. `rankCandidates` already recomputes `evaluateEligibility` on the same snapshot, so one call covers eligibility, tiers and ordering.

| Baseline module | Use from mock code? | Why |
| --- | --- | --- |
| `lib/picker/ranking.ts` (`rankCandidates` and its exported types) | **Import unchanged** | Pure; it imports only `./eligibility`, `./types` and `../title-state` |
| `lib/picker/eligibility.ts`, `lib/picker/types.ts` | **Import unchanged** (directly or through ranking) | Pure, with no imports beyond each other and `title-state` |
| `lib/title-state.ts` (`fixedMoods`, `contentTypes`, `durationLabel`) | **Import unchanged** | Constants and formatting only, with no imports |
| `lib/picker/cycle.ts` | **No** | Imports `node:crypto`. The mock re-implements the cycle protocol below. It may copy the three-line `candidateIdentity` format, with a test asserting byte-identical output against the baseline function. |
| `lib/picker/server.ts`, `server-only.ts` | **No** | Imports `node:sqlite`, request access, metadata lifecycle and `server-only` |
| `lib/picker/view-state.ts`, `app/pick/*` | **No** | Bound to the production `PickState` cursor protocol, Server Action `FormData`, `next/link` production routes and `crypto.randomUUID` page IDs. Copy the baseline wording and global classes instead. |

**Isolation test.** `tests/frontend/isolation.test.ts` currently allows relative imports only under `frontend/` and `app/mock/`. Extend it with an **exact-file allowlist**, not a `lib/` directory wildcard, for `lib/picker/ranking.ts`, `lib/picker/eligibility.ts`, `lib/picker/types.ts` and `lib/title-state.ts`. If #59 has already added an exact allowlist, extend that one. Every allowed file is still visited recursively under the same forbidden-pattern checks. Add explicit assertions that `lib/picker/cycle.ts`, `server.ts`, `server-only.ts`, `view-state.ts`, `db/` and `app/pick/` never enter the mock closure. No production picker file changes. The baseline `tests/picker/*` stay unchanged and must still pass.

## Typed operations

Add a `picker` namespace to the same mounted `FrontendService`. The names follow the inventory. Every call takes the expected `ContextIdentity` and `RequestOptions`, runs through the existing `gate` (scenario delay, abort, stale check and metadata maintenance), and builds a **fresh snapshot after the delay**, immediately before it commits.

| ID | Operation | Required behavior |
| --- | --- | --- |
| K01 | `picker.getInputs()` | Returns the selected group's ID, name and mode, the eligible viewer list (`id`, `name`, `color`) in member order, and whether a current actor can add a title. **Account groups:** only active members; removed participants such as `weekend-retired` are never offered. **Legacy groups:** every profile, and no selected profile is required. With no accessible group, it returns a safe `picker_access` failure. A legacy group with no profiles returns an empty list, which the UI shows honestly as *No group members yet* with a working way to create a profile. It never invents users. |
| K02 | `picker.pick(input, intentId)` | A deliberate **new cycle**. `input` is `{viewerIds, availableMinutes, mood, rewatches}`, and `rewatches` is an explicit boolean that the UI starts as `false`. The service builds the snapshot and calls `rankCandidates` once. `invalid_selection`, `invalid_input` and `invalid_ranking` become a `picker_input` failure with field errors (`viewers`, `availableMinutes`, `mood`, `rewatches` or `form`) using the baseline messages, and no cycle is created. A ranked result returns only the **current** candidate's display model plus a cycle handle; the full tier stays in the service. An empty result returns `no_match`. |
| K03 | `picker.next(cycle, intentId)` | Revalidates with a fresh snapshot and the canonical inputs stored in the cycle. It returns the next candidate of the **same tier**, then `exhausted` after the last one. It never appends another tier. |
| K04 | `picker.restart(input, cycle, intentId)` | Allowed only after exhaustion, or when the data has changed (a refreshed result). It returns the current first candidate. If the supplied inputs differ from the cycle's canonical inputs, it returns `conflict`. |

**Outcome union.** The `success` value is one of:

- `picked`: the current candidate and the cycle handle;
- `exhausted`: the cycle handle;
- `no_match`: reasons and suggested actions;
- `conflict`: a message.

Each outcome also carries `refreshed: boolean`. Cancelled, stale and unavailable results keep the existing `ServiceResult` variants. **Picking writes nothing.** It never changes progress, completion, ratings, notes, contributions, archive state, title revisions, metadata or Mine. The only data change allowed during a pick is the existing #58 expiry maintenance, which `gate` already runs before every read.

### Snapshot projection

- **Titles:** every title in the selected group, including archived ones, whatever the library panel's All/Mine/archive view shows. Each is projected to `RankingTitle`: `id`, `groupId`, `archived`, `title`, `contentType`, `durationSeconds`, `numberingStyle`, `moods` and `createdAt`. Watch, source and cover links, genres, origins and availability notes are not projected into the ranking, but they are part of the fingerprint.
- **Members:** the K01 viewer list for the same group.
- **Progress:** one `EligibilityProgress` row per #59 record **that has a progress state**: an explicit episode state, a timestamp, or a completion flag.
  - The row carries `titleId`, `memberId`, `groupId`, the stored numbering style, a boolean `completed`, `positionState` (`unknown`, `not_started` or `in_progress`) and `nextSeason`/`nextEpisode`. Use NULL coordinates for Unknown and for `none` numbering.
  - A record that holds only a rating or a note projects **no row**. An absent record projects no row. Never manufacture Not started.
  - Timestamps, ratings and notes never reach `rankCandidates`.
  - If #59 does not store a numbering style on the record, project the title's current numbering. The D10 guard keeps the two equal.
- **`createdAt` (new internal field):** each library row gets an original creation instant in canonical UTC ISO form with milliseconds.
  - Seeds use `2026-10-01T00:00:00.000Z` plus *k* × 1000 ms, where *k* is the row's position in the existing `reset()` order: `joint-movie` 0, `saved-series` 1, `saved-anime` 2, `saved-video` 3, `archived-movie` 4, `expired-video` 5, `weekend-movie` 6, `legacy-movie` 7 and `weekend-archive` 8.
  - A new #58 save gets `max(metadata-clock instant, newest existing createdAt + 1 ms)`. Creation order then always matches save order, even with an injected clock.
  - Edits, contributions, removal, restore, refresh and expiry never change `createdAt`, and **Reset demo** restores the seed values.
  - `createdAt` is not added to the public `LibraryTitle`, so the #57/#58 projections stay unchanged.

### Display model (copy the baseline result wording)

- **Header:** the tier label (**Exact match** or **Alternative suggestion**), the title, the type label, and **Full duration** or **Typical episode duration** with `durationLabel`.
- **Explanation:** the candidate's `message` exactly as ranking returns it, such as *1 minute longer than your available time.* or *Requested Relaxing; different mood: Funny. Within your available time.*
- **Episode target:** *Season N, episode M* or *Episode M*, plus *Restart from the first episode.* or *Catch-up episode for the least advanced viewer.* when they apply.
- **People:** **Rewatching** and **Watching together** name lists, with avatar colors. Viewers appear in the order they were selected.
- **Requested line:** *Requested: N minutes · Mood · Rewatches OK/off*.
- **Details:** **View details** opens the existing mock library detail for that title ID inside `/mock`, never a production route.
- **External link:** a link validated with `safeLibraryUrl`, using `target="_blank"` and `rel="noopener noreferrer"`. Its label is **Watch (external)**, or **Open series (external)** for episodic titles. Without a safe link, show *No viewing link saved.*
- **Hint:** *External watching does not update progress. Update your own progress in details.*
- **Not shown:** ratings and notes never appear in the picker.

**No-match view.** Show the ranking message and these reason labels, in the fixed reason order:

| Reason | Label |
| --- | --- |
| `no_active_titles` | There are no active saved titles to pick from. |
| `progress_required` | Selected viewers need valid next-episode progress. |
| `viewer_ineligible` | Completion or different next episodes prevent a shared pick with these settings. |
| `metadata_incomplete` | Some saved titles need usable title, type, duration or mood details. |
| `time_mood_excluded` | No viewer-eligible title meets the requested mood/time or permitted alternatives. |

Actions are suggestions only:

- `add_title` focuses the mock Add panel. In a legacy group without a selected profile, it reads *Choose profile to add a title*.
- `set_progress` and `complete_metadata` open the mock detail of the first affected same-group title.
- The other reasons give text guidance only.

Nothing turns on Rewatches, changes the time or mood, restores titles or writes history.

## Cycle protocol and lifetime

The mock follows the baseline [picking cycle](picking-cycle.md) semantics with in-memory records owned by the service. There is no crypto, no randomness, no storage and no network.

- **Record contents:** a stable synthetic `cycleId`, the captured `ContextIdentity`, the group, the canonical inputs, the semantic fingerprint, the current index, the current **step token**, and only the last accepted logical intent (`id`, action, input step, index, output step, refreshed). It holds no titles, names, ratings or notes.
- **Step tokens:** deterministic synthetic coordination tags, for example `cycle-3-step-2`. A new token is issued on every accepted advance, and replays return the same token. Tokens are **not** credentials and grant no authority.
- **Handle:** the UI holds only the `{cycleId, step}` handle and its pending logical intent, in React memory. There is no URL parameter, storage or cookie.
- **Bounds:** at most **512** cycles per service instance; at capacity the oldest is evicted. Each cycle lives a fixed **30 minutes from its accepted start**, measured on the instance's synthetic metadata clock (the same clock the #58 time controls advance). Advances and retries do not extend it.
- **End of life:** **Reset demo** clears every cycle, and a reload creates a new instance with none.
- **Context changes:** account, group, mode or profile changes and Reset all bump the context revision. A captured cycle then gets `stale` from `gate` and is unusable. The UI discards it.
- **`conflict` cases:** these return `conflict` with *This picking cycle expired or changed. Start a new cycle to continue safely.*, and no candidate:
  - an unknown, expired, evicted, foreign-group or foreign-identity cycle;
  - a wrong or tampered step;
  - `next` after exhaustion;
  - `restart` before exhaustion when the data has not changed;
  - a restart with different inputs.

  The UI then offers **Start a new cycle**, which calls `pick` with a new intent.
- **Idempotent retry:** if the same `intentId` arrives again with the same action and input step, the service revalidates and returns **the same logical position and output step**. It consumes no extra index. If the data changed in between, it returns the refreshed first result. An older intent, or the same intent with a different action, step or inputs, returns `conflict`. A `pick` that repeats the last accepted start intent of an existing same-context cycle returns that cycle instead of creating a second one.
- **Error, cancel and stale consume nothing:** the service computes the whole outcome first, then commits the index and step synchronously in the same call. Unavailable, canceled and stale results leave the cycle unchanged. Two different intents with the same old step produce one accepted advance and one `conflict`.

**Semantic fingerprint.** This is the D22 reset rule, copied from the baseline. The service compares a deterministic fingerprint of these values:

- every group title, including archived ones: ID, title text and normalized identity, type, duration, numbering, archive state, `createdAt`, provider ID, watch/source/cover links, sorted moods and sorted genres;
- the sorted active `(titleId, memberId)` contributions;
- the selected viewers, as a sorted set, with their name and color;
- the selected viewers' projected progress: numbering, state, coordinates, completion, and a timestamp that keeps absent and `0` distinct;
- the chosen tier and the ordered candidate identities.

These are excluded: ratings, notes, unselected members' records, title revision counters, origins, deadlines, availability text, the library filter, the active legacy profile and viewer order.

When the fingerprint changes, the next action returns the current first candidate, or a `no_match`, with `refreshed: true`. The UI shows **List changed; picks refreshed.** before that result, and the notice survives an idempotent retry. Nothing widens a tier or edits progress to make an item eligible.

## UI defaults (`app/mock/picker.tsx`)

**Region.** Add a **Pick for me** region (`aria-labelledby` its heading) to the existing mounted `/mock` preview. It is reachable once a group is selected, and **Load picker** calls `getInputs`. The observed Lovable desktop layout is visual guidance only. Mobile behavior, results and cycles follow the baseline.

**Controls** (nothing preselected):

- **Who's watching?** is a fieldset of native checkboxes, styled as chips with avatar color and name.
- **Available time (whole minutes)** is a text field with `inputMode="numeric"` and the hint *Enter 1–1440 minutes. Picks use the full movie/video or one typical episode duration.*
- Four preset buttons, **20 min**, **45 min**, **1 h 30 min** and **2 h 30 min**, only fill the field with 20, 45, 90 or 150. `aria-pressed` reflects whether the field equals that value.
- **Mood** is a fieldset of five native radios with the fixed labels.
- **Rewatches OK** is a checkbox, unchecked.

**Main button labels** (baseline wording):

| State | Label |
| --- | --- |
| No cycle yet | **Pick for me** |
| Active cycle | **Pick again** |
| Exhausted | **Start again** |
| Conflict | **Start a new cycle** |
| After an error | **Retry pick** |
| Pending | **Finding a pick…** |

An active, unchanged cycle never shows a second button that silently starts over.

**Status messages.** Announced messages use the baseline text:

- *Choose your viewers, time and mood, then pick.*
- *Your suggestion is ready.*
- *All matches shown. Choose Start again to begin explicitly.*
- *No match for these settings.*
- the error text *We couldn't pick right now. Your inputs are still here. Please try again.*
- the pending summary *Finding a pick for {names} · {N} minutes · {Mood} · Rewatches OK/off…*

The **All matches shown**, **Start a new picking cycle** and **No match** sections keep the baseline explanations.

**Submission behavior:**

- **One request at a time:** a synchronous guard plus a disabled submit button blocks duplicate requests.
- **Inputs stay editable while pending:** **Cancel pick** stays reachable, and focus is never trapped.
- **Editing discards:** editing any input immediately hides the result and discards the cycle handle and any retry intent. A late response from an earlier input generation, group or context is ignored.
- **Retries:** after an error or cancel, the next submit reuses the same logical intent and step.
- **Invalid input:** field errors are associated with their fields, and focus moves to the announced feedback.

**Context and navigation:**

- **Leaving the context:** a change of account, group, mode or profile, or **Reset demo**, remounts the picker. Selections, results and the cycle are cleared, Rewatches returns to off, and the region announces *Picker context changed; previous picks and selections were cleared.*
- **No retained picks:** the picker adds no URL state. Back and forward never restore a pick, and a reload starts clean.
- **Layout:** long titles and names wrap with no horizontal overflow at 375px or 1280px.

## Fixture scenarios (existing seeds, no new titles)

These outcomes were computed with the baseline `rankCandidates` on the seeds below plus the #59 personal seeds from [mock personal](mock-personal.md). All seeded titles are mood **Funny**. **No new library titles or personal seeds are needed**, so the #57–#59 counts and IDs stay valid. The only new seed data is `createdAt`. Friday viewers are Demo.Owner (`friday-owner`) and Demo.Viewer (`friday-viewer`). Either signed-in Friday account may select either viewer: picking is not a write, so it is not impersonation.

| # | Group, viewers, time, mood, rewatches | Expected result |
| --- | --- | --- |
| 1 | Friday, Viewer, 90, Funny, off | Exact tier: Together Tonight → Short Laughs S1E2 → Paper Stars Episode 2 → A Small Good Idea → **All matches shown** → Start again → Together Tonight |
| 2 | Friday, Owner + Viewer, 90, Funny, off | Exact: Together Tonight → A Small Good Idea. Short Laughs is excluded (Owner Unknown); Paper Stars is excluded (different positions E1/E2). |
| 3 | Same as 2, with rewatches on | Exact: Together Tonight → Paper Stars Episode 1 (catch-up, Demo.Viewer rewatching) → A Small Good Idea. Short Laughs stays excluded: Unknown still blocks. |
| 4 | Friday, Owner, 25, Funny, off | Exact: Paper Stars Episode 1 (explicit Not started) → A Small Good Idea |
| 5 | Friday, Viewer, 14, Funny | Over-budget tier, one item: A Small Good Idea, *1 minute longer than your available time.* → exhausted |
| 6 | Friday, Viewer, 10, Funny | Over-budget: A Small Good Idea, *5 minutes longer…* (the inclusive +300 s boundary) |
| 7 | Friday, Viewer, 9, Funny | No match: `metadata_incomplete` (the expired video) and `time_mood_excluded` (+360 s is never offered) |
| 8 | Friday, Viewer, 90, Relaxing | Different-mood tier: Together Tonight → Short Laughs → Paper Stars → A Small Good Idea, each *Requested Relaxing; different mood: Funny…* |
| 9 | Friday, Owner, 5, Funny | No match: `progress_required`, `metadata_incomplete` and `time_mood_excluded` |
| 10 | Friday, Owner + Viewer, 5, Funny, off | No match with four reasons: `progress_required`, `viewer_ineligible`, `metadata_incomplete` and `time_mood_excluded` |
| 11 | Weekend, Viewer, 30, Funny, off / on | Off: no match, `viewer_ineligible` (completed via the #59 seed). On: Past participant's film, with Demo.Viewer rewatching. Past participant is not offered as a viewer. |
| 12 | Legacy sample, Legacy sample, 25, Funny, no profile selected | Exact: Legacy sample film |
| 13 | A new account group (#56) | One viewer (the creator); no match: `no_active_titles` with the add-title action |
| 14 | A new legacy group with no profiles | Empty K01 viewer list with the create-profile action. No pick form is shown. |

**States reached through earlier domains.** Reaching these states by using the earlier domains' real operations is the evidence that results reflect mutations made there:

- **Restart:** with #59, Demo.Owner and Demo.Viewer each mark Paper Stars complete. Scenario 3's inputs with rewatches on then give Paper Stars Episode 1, *Restart from the first episode.*, with both viewers rewatching.
- **Completed movie:** with #59, Demo.Viewer marks Together Tonight complete. Scenario 1 with rewatches off then no longer offers it, and the active cycle refreshes. With rewatches on, it is offered with Demo.Viewer rewatching.
- **Ties and creation order:** with #58, save a Funny movie of exactly 15:00. *Viewer, 15, Funny* then gives A Small Good Idea before the new title: equal 900 s, and the older `createdAt` wins. 900 s also fits a 900 s budget exactly.
- **One-second disclosure:** in a new account group, #58 saves of 25:01 and 25:00 Funny movies against a 25-minute budget give *1 second longer…* (over-budget) and an exact match. Save one at a time.
- **Multi-mood:** with #57, Demo.Owner edits A Small Good Idea's moods to Funny + Relaxing. A Relaxing request then gives the **exact** tier, since a title matches when any of its moods matches.
- **Reset triggers:** each of these makes the next **Pick again** show **List changed; picks refreshed.**:
  - removing a contribution that archives a title (#57), or restoring it;
  - editing a duration, mood, title or link (#57);
  - a duplicate save that adds a contributor (#58);
  - refreshing `expired-video` (#58);
  - a selected viewer's episode, timestamp or completion change (#59).
- **No-reset changes:** each of these leaves the sequence unchanged with no notice:
  - rating and note changes (#59);
  - an unselected member's progress (#59);
  - switching the library filter to Mine, or reading a detail.
- **Expired cycle:** three **Advance synthetic time ten minutes** clicks (#58) reach the 30-minute lifetime, and **Pick again** then returns `conflict`, recovered by **Start a new cycle**. The thirty-one-days step also clears the seeded provider durations, so later picks honestly show `metadata_incomplete`. Run it last or after Reset.

## Evidence plan and limits

**Focused tests: `tests/frontend/picker.test.ts`.** It covers:

- **Reuse:** the mock calls the real `rankCandidates`, and its candidate identity equals the baseline `candidateIdentity`.
- **Truth table:** every [eligibility](eligibility.md) truth-table row, for both numbering styles and both rewatch values, run through the mock projection of #59-shaped records. It also checks that rating-only or note-only records and absent records project no row.
- **Scenarios:** rows 1–14 and the states reached through earlier domains above, run through the real service.
- **Input validation:** viewers (empty, duplicate, removed, foreign or unknown); time (`0`, `1441`, `045`, ` 45`, `45.0`, `1e2`, `+5` and blank fail; `1` and `1440` pass); mood (blank, a display label, unsupported); a forged non-boolean rewatches value.
- **Cycle protocol:** sequence, one-item and all-tier exhaustion, explicit restart, `next` after exhaustion, restart before exhaustion, tampered or unknown steps, foreign cycles, expiry at 30 synthetic minutes and eviction at the 513th cycle.
- **Idempotence:** same-intent replay, older-intent replay and competing intents.
- **No advance on failure:** Unavailable, cancel and stale results consume nothing.
- **Resets:** semantic reset and non-reset cases; canonical viewer order.
- **No writes:** a deep comparison shows library rows, personal records and revisions unchanged after picks.
- **Context changes:** account, group, mode, profile and Reset changes give `stale`, and a legacy pick works without a profile.

**Focused tests: `tests/frontend/picker-ui.test.tsx`.** It covers:

- **Defaults:** nothing preselected and rewatches off.
- **Interaction:** labels and keyboard use; error association and focus; pending, cancel and retry with the same intent; ignored late responses; edits that discard the result.
- **Views:** the exhausted, conflict and refreshed notices; no-match reasons and actions.
- **Result content:** the internal details action; external link attributes; no ratings or notes shown.

**Browser journey.** Add `tests/fixtures/mock-picker-journey.mjs` with one call from `tests/fixtures/mock-foundation-browser-check.mjs`, at **375px and 1280px**. It drives the real controls through:

- scenario 1's full cycle and restart;
- scenarios 2–3 with rewatcher and catch-up labels;
- the tier disclosures in 5–8;
- a no-match with actions;
- an input edit that discards the cycle;
- a selected-progress change, archive and restore that refresh the list;
- rating, note and unselected changes that do not;
- Slow with Cancel and Unavailable with retry, without skipping a candidate;
- the conflict from synthetic time, recovered by **Start a new cycle**;
- the weekend and legacy cases;
- keyboard and focus, with no horizontal overflow.

It never follows the external link. Every existing check must keep passing: absent database, empty keys, local-only traffic, sentinels and owned cleanup. The only allowed assertion change is the foundation check's "Not available yet" count, which drops when the picker leaves the pending-domain list; document that change.

**Commands.** Run `pnpm test tests/frontend`, `pnpm exec vitest run tests/picker` (unchanged), `pnpm test`, `pnpm typecheck` and `pnpm test:mock`, and record the actual results. Optional screenshots stay synthetic and are cleaned up. Make no human-test or screenshot-inspection claim unless it actually happened.

**Scope limits.** This is synthetic, volatile modeling, not real authorization, persistence or a durable viewing history. Whole-phase integration belongs to [#61](https://github.com/xiaodlb/watchnext/issues/61), followed by OpenAPI [#43](https://github.com/xiaodlb/watchnext/issues/43) and the memory picker backend [#46](https://github.com/xiaodlb/watchnext/issues/46).

## Resolved differences

1. **Isolation.** The issue requires reuse of the pure functions, but the current isolation test allows no `lib/` imports. Resolved with the exact-file allowlist above. The baseline `cycle.ts` is not client-safe, so the cycle protocol is re-implemented and only the candidate identity format is shared, with an equality test.
2. **No server cursors.** The issue says no actual cursors are used, while the baseline uses random opaque 43-character cursors. The mock uses deterministic, service-owned synthetic step tokens with the same rotation, replay and conflict semantics. They are coordination tags, not secrets.
3. **Request versus intent.** The inventory names `pick(inputs,requestId)` and `next(cycle,logicalRequestId)`. The baseline separates a transport request ID from the logical `intentId`. The mock has no transport, so operations take the logical `intentId`, and the UI's per-call sequence handles late responses.
4. **Creation order.** D18 needs the original creation time, which mock rows lack. Resolved with the deterministic internal `createdAt` defined above.
5. **Lifetime clock.** The baseline measures 30 minutes of real process time. The mock uses the instance's synthetic metadata clock, so expiry is testable without waiting.
6. **Legacy profile switching.** The baseline legacy `pickerOwnerKey` excludes the active profile, so switching profiles keeps the picker. In the mock, profile selection bumps the shared context revision, consistent with #56 and #59, so the picker is discarded and announced. The invariant kept: the active profile is never substituted for the selected viewers and never changes candidates. The same inputs give the same first result before and after a switch.

## Engineer implementation and evidence

These are Engineer results, not an independent QA PASS.

- **Contracts:** `frontend/service/contracts.ts` adds `PickerService` (`getInputs`, `pick`, `next`, `restart`) on the same `FrontendService`, the `PickerInputs`/`PickerInput`/`PickerCycleHandle`/`PickerCandidate`/`PickerOutcome` types, the `picker_access`/`picker_input` failure codes and the `viewers`/`availableMinutes`/`mood`/`rewatches`/`form` field keys.
- **Service:** `frontend/mock/picker.ts` runs every operation through the library gate (expiry maintenance, delay, cancel, stale context), builds a fresh snapshot after the delay and calls the unchanged baseline `rankCandidates` once. It holds cycles in a per-instance map (512, oldest evicted, 30 minutes on the synthetic metadata clock from start), computes each outcome before committing index and step synchronously, and uses the D22 fingerprint above. It never writes rows. `frontend/mock/library.ts` adds the internal `createdAt` (seed order, never projected into `LibraryTitle`), a read-only rows accessor and the wiring; `frontend/mock/entry.ts` stamps new saves and exposes the metadata clock; `frontend/mock/service.ts` mounts `picker` and empties the pending-domain list.
- **UI:** `app/mock/picker.tsx` is the **Pick for me** region with **Load picker**, the baseline labels, statuses, result, exhausted, conflict and no-match sections. `app/mock/preview.tsx` remounts it (with the context-changed announcement) only when the context revision changes or Reset starts, so library, entry and personal mutations reach it as **List changed; picks refreshed.** `app/mock/library.tsx` opens a detail by ID for **View details** and the no-match detail action.
- **Isolation:** `tests/frontend/isolation.test.ts` keeps every earlier check and adds the exact four-file allowlist plus assertions that `cycle.ts`, `server.ts`, `server-only.ts`, `view-state.ts`, `db/` and `app/pick/` stay out of the closure. No `lib/`, `app/pick/` or `tests/picker/` file changed.

Adaptations, recorded rather than silently changing criteria:

1. **Numbering on records:** #59 records store no numbering style, so the projection uses the title's current numbering, as anticipated above.
2. **Refreshing `expired-video`:** its seeded provider ID is not a refreshable fixture identity, so its refresh fails safely and changes nothing (no notice). The refresh trigger is shown with a YouTube-link provider save that is then refreshed.
3. **Expiry during a cycle:** with the UI time controls, the 30-minute lifetime always ends before a 30-day field deadline, so in the UI an expiry shows as `conflict`, then **Start a new cycle** gives the honest fresh result. The refresh-on-expiry rule itself is proven with an injected clock that starts a cycle ten minutes before the deadline.
4. **Zero-item results:** `pick` creates no cycle for a no-match, so it returns no handle and no advance action.
5. **Malformed intents or handles** return `conflict`. Validation errors report the first baseline error, in the baseline order (rewatches, viewers, time, mood).
6. **Panel actions:** **Add a title** focuses the Add panel heading; **Choose profile to add a title** and **Create a profile** focus the groups panel (the profile-name field when it is shown).
7. **Layout fix:** the journey found that a long unbroken saved title overflowed the existing Add panel's saved-entry status at 375px. `.card` in `preview.module.css` now uses `overflow-wrap: anywhere`; no markup changed.
8. **Documented assertion update:** the preview test and the foundation browser step now expect **zero** "Not available yet" domains, because the picker leaves the pending list. The empty "Upcoming previews" section is no longer rendered.

Verification, run serially:

- `pnpm test tests/frontend`: 15 files, 107 tests passed (new `picker.test.ts` 16 tests, `picker-ui.test.tsx` 9 tests, one new isolation test).
- `pnpm exec vitest run tests/picker`: 9 files, 245 tests passed (unchanged baseline).
- `pnpm typecheck`: passed.
- `pnpm test`: 102 files, 1,065 tests passed.
- `pnpm test:mock`: PASS, 18 of 18 steps, including `mock-picker-journey.mjs` at 375 and 1280 pixels, with every isolation, sentinel and cleanup flag true.
- Spot mutations (removing the refresh rule, the step check, lifetime purge, selected-viewer filtering or eviction) each made the focused tests fail.

Limits: synthetic, volatile modeling only. No production picker, route, schema, dependency or `lib/` change, no persistent history, no human testing and no screenshot inspection is claimed.
