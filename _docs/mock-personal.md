# Mock personal progress and feedback handoff — issue #59

Status: **Implemented, independently QA-passed at `033c656`.** Engineering started after prerequisite [#58](https://github.com/xiaodlb/watchnext/issues/58) received its independent QA PASS at `89deec3`. See [Engineer implementation and evidence](#engineer-implementation-and-evidence). [#59](https://github.com/xiaodlb/watchnext/issues/59) owns P01–P05 and the personal portions of U06 in the [operation inventory](operation-inventory.md). Read the [mock library](mock-library.md), [mock entry](mock-entry.md), [mock frontend](mock-frontend.md), [API](api.md) sections for issues #20–#23, [decisions](decisions.md) D03–D07, D10–D13 and D23–D25, [specification](specification.md) FR09–FR11, [design system](design-system.md) and [testing guidelines](testing-guidelines.md).

Every rule below is an **engineering default derived from the completed baseline**: `lib/episode-progress.ts`, `lib/watch-progress.ts`, `lib/ratings.ts`, `lib/notes.ts`, their `*-state.ts` helpers and `app/watchlist/[id]/detail-view.tsx` at baseline tag `graded-baseline-2026-10-19`. These defaults are **not new user answers**. Where the inventory wording differs from the baseline source, the source decides. The one known case is P01's "NULL type denied". The baseline allows own episode progress on a NULL-type title whose retained numbering is episodic, and shows an unavailable-metadata notice. It denies a structure mismatch.

## One bounded frontend increment

Extend the mounted `/mock` typed service and the existing shared library records. Do not build a parallel personal store. Add typed `progress` and `feedback` namespaces with the inventory operation names: `progress.saveEpisode`, `progress.saveTimestamp`, `progress.clearTimestamp`, `progress.setCompleted`, `feedback.saveRating`, `feedback.clearRating`, `feedback.saveNote` and `feedback.clearNote`. Each operation takes the title ID, the operation input, the claimed member ID and the claimed title kind/numbering the form was rendered for, the expected `ContextIdentity` and `RequestOptions`. The member and numbering claims are stale-form checks only and never grant authority. Each operation returns the committed own record together with the title's current group-visible history. The W03 detail read returns structured history and the current actor's own projection and capability, which is `null` when there is no actor. Personal panels in the existing library detail consume these results. The production routes, Server Actions, schema and dependencies stay unchanged.

| ID | Required behavior (baseline source) |
| --- | --- |
| P01 | **Episodic titles only.** The title must have retained `season_episode` or `continuous` numbering and a type that is series, anime or NULL. Coordinates mean the *next* episode to watch. An absent record is shown as **Unknown / Not recorded**. Explicit **Unknown** stores a recorded state with no coordinates. **Not started** stores S1E1, or E1 for continuous numbering. **In progress** takes coordinates written as one to four digits after trimming, with a value from 1 to 9999. So `0007` is 7, while `0`, `10000`, `2.5`, `1e3`, `+1`, `-1`, letters and blank are field errors. Season/episode numbering requires both coordinates. Continuous numbering rejects a supplied season. Unknown and Not started reject entered coordinates. Backward corrections and manual season changes are allowed. No catalog, season length or automatic advance is ever inferred. A save leaves completion unchanged. |
| P02 | **Non-episodic titles only.** The title must have `none` numbering and a type that is movie, YouTube or NULL. **Stopped at** accepts `M:SS` or `H:MM:SS` after trimming. Seconds must be exactly two digits from 00 to 59. In the three-part form, minutes must also be exactly two digits from 00 to 59. So `70:00` and `1:10:00` are both 4200 seconds. Signs, fractions, single-digit seconds, `1:60` and unsafe integers are rejected without rounding. A new value must satisfy 0 ≤ seconds ≤ the current usable full runtime (1–86400) at commit time. A value equal to the runtime is accepted and does not mark the title complete. A blank save or **Clear timestamp** stores "absent", which is different from a saved `0:00`. Clearing an absent record is a no-op and creates no record. The display uses `H:MM:SS` from one hour and `M:SS` below that. If the runtime is unavailable, the field is read-only, Save timestamp is disabled and a notice is shown. The service still rejects a forged non-blank value, and Clear and completion still work. A shortened runtime keeps an older out-of-range value and shows a beyond-duration warning. Re-entering that value is rejected, while a correction or clear works. |
| P03 | **Completion is a separate flag.** **Mark complete** and **Undo completion** change only that flag and ignore unsaved inputs. After success, the inputs reset to the stored values. Coordinates and timestamps are never rewritten, and completion is never inferred from a position. Completing an absent record creates Unknown or no-timestamp progress plus the flag. `setCompleted(false)` on an absent record creates an explicit not-finished record. |
| P04 | **One whole-title rating per member, for all four types.** The rating text, after trimming, must be the canonical integer `1`–`10`. So `0`, `11`, `7.5`, `8.0`, `1e1`, `+5`, `08`, whitespace and blank are errors, and a blank save never clears a rating. **Clear my rating** is a separate intent: it ignores the unsaved field, and the rating reads back as **Not rated**, never 0. Clearing an absent rating is a no-op. Repeating an identical save changes nothing. Rating needs no completion, contribution, type or runtime. |
| P05 | **One plain-text whole-title note per member.** CRLF and bare CR are converted to LF, then outer Unicode `White_Space` and U+FEFF are trimmed. The note may be up to 2000 code points after normalization: exactly 2000 supplementary characters succeed, and 2001 fail without truncation. There is no `maxLength`, and the count is announced. NUL is rejected. A blank or whitespace-only save clears the note, with the message "Your note is cleared. No notes." **Clear my note** ignores the unsaved draft, even an over-limit one. Clearing an absent note is a no-op. The note is shown as inert text that wraps, with line breaks preserved and no links or HTML. Prefer reusing the client-safe `inspectNoteDraft`/`noteLimit` helpers. |
| U06 (personal) | Labels are native and errors are associated with their fields. Announced status text reuses the baseline wording where it fits. Pending disables the panel's operations without trapping focus, and Cancel stays reachable. Validation moves focus to the error or announces it. A failure keeps the entered draft. History is readable by everyone with group access. Absent states show as **Not recorded**, **Not rated** and **No notes**. There is no horizontal overflow at 375px or 1280px. |

## Ownership and authority

- **Account mode:** the writer is the live active membership of the signed-in synthetic account in the selected group.
- **Legacy mode:** the writer is the selected profile in the same group. Browsing without a profile shows every member's history and an honest *Choose profile* explanation, not working-looking controls.
- **No other-member writes:** no operation accepts a target member. A claimed member that is not the live actor fails with a safe message, and nothing is written.
- **Capabilities don't grant impersonation:** being the group owner, a creator or a contributor never allows writing another member's record. Being a non-contributor never blocks your own record.
- **Personal writes stay personal:** they never add a contribution, change Mine, restore an archived title, or change the title revision, metadata, origins or deadlines.
- **Commit-time checks:** after the scenario delay, every mutation rechecks the context identity, membership or profile, that the title is in the same group, that it is active (not archived), the claimed numbering and kind, and the current runtime.
- **Denied cases:** these all fail without a write: a missing, foreign or cross-group title, an archived title, a structure mismatch, a changed member or profile, sign-out, a group or mode switch, member removal, and rejoin before commit. Inactive or removed participants' records stay read-only and attributed.
- **Last write wins:** competing writes by the same member keep the last successfully committed intent for each field and change no other field. No version protocol is added, matching the baseline.

## Fixture lifecycle

At service creation, on **Reset demo** and on reload, the existing seeded summary strings become structured records. Every existing record ID and member attribution is kept, so seeded member `references.history` stay valid. The table lists the seeds; members not listed have no record.

| Title (ID) | Structure | Seeded records |
| --- | --- | --- |
| Together Tonight (`joint-movie`) | Movie, 5400 s | `history-friday-owner` and `history-friday-viewer`: 5:00, not finished, 8/10, plain note |
| Short Laughs (`saved-series`) | Series, `season_episode` | `history-saved-series-friday-viewer`: In progress S1E2, not finished, 8/10, note. Demo.Owner has no record, which reads as Unknown. |
| Paper Stars (`saved-anime`) | Anime, `continuous` | `history-saved-anime-friday-viewer`: In progress E2, 8/10, note. **New:** `personal-saved-anime-friday-owner`: explicit Not started (E1), no rating or note |
| A Small Good Idea (`saved-video`) | YouTube, 900 s | `history-saved-video-friday-owner`: 5:00, 8/10, note. **New:** `personal-saved-video-friday-viewer`: saved `0:00`, not finished |
| Saved for Another Day (`archived-movie`) | Archived movie | `history-archived-movie-friday-owner`: readable, no writes until restored |
| My retained title correction (`expired-video`) | NULL type and runtime, `none` | `history-expired-video-friday-viewer`: 5:00 retained. Runtime is unavailable, so only clear, completion, rating and note work. |
| Past participant's film (`weekend-movie`) | Movie | `history-weekend-retired`: inactive participant, read-only. **New:** `personal-weekend-movie-weekend-viewer`: Finished with no timestamp |
| Weekend retained history (`weekend-archive`) | Archived movie | `history-weekend-viewer` |
| Legacy sample film (`legacy-movie`) | Movie | `history-legacy-sample-profile` |

- **Record identity:** each group, title and member has exactly one record. A new record gets the stable ID `personal-<titleId>-<memberId>` on its first state-creating write. Records are never reassigned or deleted by personal clears, archive or restore, metadata edits, #58 duplicate saves, refresh, synthetic-time expiry, member removal or rejoin. Rejoin reattaches the same member's records.
- **Clearing:** a clear empties only its own field.
- **Type and numbering guard (D10):** a type or numbering change is blocked if any progress state exists (including explicit Unknown or completion only), or any rating or note. A record with no progress and a cleared rating and note does not block.
- **Group-visible history:** it lists every member of the group in member order. Inactive members are labeled, and absent values use the baseline wording.
- **Read stability:** reads that change nothing return unchanged records.
- **No storage:** records are per mounted service instance and volatile. Nothing goes to storage, cookies or a backend.

Pending and error injection uses only the existing Ready (80 ms), Slow (1200 ms) and Unavailable (300 ms) scenarios with cancel. Slow shows pending and disables duplicate submits. Canceled, unavailable and stale results write nothing and keep the draft. Leaving explicitly (switching account, group, profile or mode, or opening another title) discards the old view and announces that unsaved drafts were discarded. A draft is never applied to another identity.

## Evidence and limits

**Focused tests** go in `tests/frontend/personal.test.ts` and `personal-ui.test.tsx`. They map P01–P05 and personal U06 to:

- every save, clear, complete and undo variant;
- exact boundaries and field errors;
- absent versus explicit Unknown versus saved zero;
- other-member, owner and contributor non-impersonation, legacy profiles and stale claims;
- archive, structure and runtime changes and expiry during a held response;
- cancellation, unavailability and no-write rollback;
- retained drafts;
- record ID preservation through archive, restore, metadata edits and removal.

**Browser journey:** add `tests/fixtures/mock-personal-journey.mjs` to the existing `pnpm test:mock` current-source run at both 375px and 1280px. It drives the actual detail controls: episode, timestamp, completion, rating and note save, clear and undo; readback after reload of the detail; group-visible attribution across two synthetic accounts and a legacy profile; archive denial; the shortened-runtime warning; the unavailable-runtime notice; slow, cancel, unavailable and retry; context-change discard; keyboard and focus; and a 2000-code-point note without overflow.

**Preserved checks:** the absent database, empty keys, import isolation, local-only traffic, sentinels and owned cleanup. Existing #55–#58 assertions stay unchanged, except a minimal documented update where the history shape changes from summary strings to structured fields. Identity, attribution and preservation checks are never weakened.

**Scope limits:** this is synthetic volatile modeling, not real authorization, persistence or human testing. The picker and its use of these records belong to [#60](https://github.com/xiaodlb/watchnext/issues/60). Whole-phase evidence belongs to [#61](https://github.com/xiaodlb/watchnext/issues/61), then [#43](https://github.com/xiaodlb/watchnext/issues/43).

## Engineer implementation and evidence

Implemented in commit `63b661c` (code and tests). These are Engineer results, not an independent QA PASS.

- **Contracts:** `frontend/service/contracts.ts` adds `ProgressService`/`FeedbackService` with the eight named operations, the structured `LibraryHistory` record (`progress` episode/watch or null, `rating`, `note`), `OwnPersonal`, `PersonalEntry`, `PersonalPanel` (on every `LibraryTitle` as `personal`), `PersonalClaim` and `PersonalCommit` (`record`, `own`, `history`), plus the `personal_access`/`personal_input` failure codes and field keys.
- **Service:** `frontend/mock/personal.ts` mutates the existing library rows through the library's gate (expiry, scenario delay, cancel, stale context). Each commit rechecks the live actor (account membership or selected legacy profile), the member and numbering claims, same-group title, archive, structure and current runtime, then replaces only the actor's frozen record and the row's history array. Unchanged writes and absent clears keep the same record and array references; a fully cleared record is kept with its ID. `frontend/mock/library.ts` seeds structured records with the unchanged IDs, adds the three new seeds, projects `personal` and applies the D10 guard to blocking records only. `frontend/mock/service.ts` wires the namespaces and removes the personal pending domain.
- **Pure helpers:** client-safe copies of `parseWatchTimestamp`, `formatWatchTimestamp`, `usableRuntime`, `parseRating`, coordinate parsing and `inspectNoteDraft`/`noteLimit`. They are copies rather than imports because the existing isolation test only allows `frontend/` and `app/mock/` in the mock import closure. `tests/frontend/personal.test.ts` asserts equality with the production `lib/` helpers over boundary corpora. No `lib/` file changed.
- **UI:** `app/mock/personal.tsx`, mounted in library detail, renders the own episode or watch, rating and note panels (or the honest Choose profile / archived explanation) and the group-visible history with member order, You/Inactive labels, record IDs and the baseline absent wording. Pending disables the panel operations, moves focus to the reachable **Cancel personal request** and keeps library navigation available. Field errors are associated and focused; a failure keeps every draft. Back to titles and opening another title announce that unsaved personal drafts were discarded; account, group, profile and mode changes keep the existing library reset announcement.

Engineering interpretations, recorded rather than silently changing criteria:

- The member **and** numbering claims are checked for all eight operations, including rating and note. A rating or note never requires a type, runtime or completion, but a form opened for a numbering that has since changed is treated as stale.
- "Changed runtime" at commit time means a timestamp is validated against the runtime current at commit; a runtime change does not invalidate rating, note, clear or completion.
- "Synthetic-time expiry" fails a held write only when the expiry removes what that write depends on (for example, an imported runtime). Expiry never changes numbering.
- Wrapping labels were replaced by `htmlFor` labels on the note textarea and position select, so their accessible names stay exact.

Minimal documented adaptations of earlier assertions (identity, attribution and preservation checks are unchanged):

- `tests/frontend/preview.test.tsx` and the foundation browser step now expect **one** "Not available yet" domain (the picker), because #59 removes the personal pending domain as the issue requires.
- `tests/frontend/library-ui.test.tsx` and `tests/fixtures/mock-library-journey.mjs` count the two seeded notes inside the **Group-visible personal history** list. The own note textarea now also contains the actor's note, so a page-wide count would be three.

Verification on `63b661c`, run serially:

- `pnpm test tests/frontend`: 13 files, 81 tests passed (new `personal.test.ts` 12 tests, `personal-ui.test.tsx` 5 tests).
- `pnpm typecheck`: passed.
- `pnpm test`: 100 files, 1,039 tests passed on the first run.
- `pnpm test:mock`: PASS, 16 of 16 steps, including the new personal journey at 375 and 1280 pixels, with all isolation, sentinel and cleanup flags true.
- `git diff --check`: passed.

Limits: synthetic volatile modeling only. No real authorization, persistence, database, provider or production change, no picker logic, no human testing and no screenshot inspection is claimed.
