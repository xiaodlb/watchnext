# Graded iteration log

| Date | Stage | Observed evidence/status |
| --- | --- | --- |
| October 19, 2026 | Pre-graded baseline | Existing issues 1–40 closed; final [QA PASS](https://github.com/xiaodlb/watchnext/issues/40#issuecomment-6263933927), commit 441fcaae660e273d6fc373f8757be562d9139b78/tag graded-baseline-2026-10-19. Historical automation is not new hands-on user testing. |
| October 19, 2026 | Planning first step | Graded plan/specification/workflow and issues 41–54 created; no new architecture implemented, no new app/test run or user testing claimed. |

## Frontend mock phase (#41, #42, #55–#61)

All entries below are **mock mode** and **automated** (agent roles and scripted Chromium), not human hands-on testing; human testing remains #53. Commands were run serially by the Engineer and re-run by independent QA as recorded in each issue's QA comment. Screenshots before #61 were inspected and deleted with the owned fixture; #61 commits a synthetic set.

| Issue | Commit(s) | Change | Commands and results | Screenshots | QA verdict |
| --- | --- | --- | --- | --- | --- |
| #41 | `e5e66f2` | Operation inventory (40 domain rows, U01–U06) and Lovable reference pack; docs only | Link, checksum, diff and UTF-8 checks; no app tests (docs-only) | Five public Lovable captures in `_docs/references/lovable-2026-10-19/` (reference, not our app) | Independent QA accepted |
| #42 | `7cca7d4`, `d6b5082` | Typed context/result/scenario foundation, `/mock` shell, Reset, `pnpm test:mock` | 13 focused tests; full suite 90 files / 971 tests; typecheck; `test:mock` both widths. An initial smoke wrongly expected an auth-error view with a missing production DB and was corrected without production change | Inspected, deleted | Independent QA accepted |
| #55 | `3246c95`, `43479ab`, `269abbc` | Synthetic accounts A01–A05 | Focused frontend tests, full suite, typecheck, `test:mock` with account journey (see [mock accounts](mock-accounts.md)) | Inspected, deleted | QA PASS, closed at `269abbc` |
| #56 | `08e52d6`, `85c5cb7`, `391d312` | Groups, owner and legacy G01–G08/L01–L04 | 7 files / 34 focused tests, full suite, typecheck, `test:mock`; a correction after QA review fixed the successful group-context display (`391d312`) | Inspected, deleted | QA PASS, closed at `391d312` |
| #57 | `d5cdf38`, `1a95c60` | Saved library W01–W03/W06–W08, read-only M06 | 9 files / 47 focused tests, full suite, typecheck, `test:mock` with library journey | Inspected, deleted | QA PASS, closed at `1a95c60` |
| #58 | `dab42d9`, `6a35478`, `89deec3` | Manual/provider entry W04–W05/M01–M06 | Focused, full suite, typecheck, `test:mock`. **QA FAIL 6272419253**: Title search auto-applied ID-shaped text; repaired in `89deec3` with three regressions that failed first | Inspected, deleted | QA PASS at `89deec3` after the FAIL |
| #59 | `63b661c`, `033c656` | Personal progress, completion, ratings, notes P01–P05 | 13 files / 81 focused tests; full suite 100 files / 1,039 tests (first run); typecheck; `test:mock` | None claimed | QA PASS at `033c656` |
| #60 | `8be83f2`, `b6132ad` | Picker and Pick again K01–K04 | 15 files / 107 focused tests; `tests/picker` 9 files / 245 tests unchanged; full suite 102 files / 1,065 tests (first run); typecheck; `test:mock` 18/18 steps | None claimed | QA PASS at `b6132ad` |
| #61 | `6154ca0`, `cfe2148`, docs `0c83ecd`/`62121ba`; QA repair `0ac6ac1` and its documentation commit | Connected integration, coverage matrix, operation sweep, evidence capture, two integration fixes (library focus steal, demo-credential notice), docs and #43 handoff. **QA FAIL at `62121ba`**: three handoff pages kept a stale "QA pending" status; QA also saw the new route probe time out twice under host load. Repaired: status lines corrected, probe no longer waits for network idle | See [mock integration results](mock-integration.md#engineer-results-61) | 14 committed synthetic PNGs in [`evidence/mock-frontend/`](evidence/mock-frontend/), each opened by the Engineer | QA FAIL at `62121ba`; repaired, independent QA re-check pending |

For each future entry record issue/commit, actual change, commands and results, mock/memory/SQLite/PostgreSQL mode, human versus automated actor, safe screenshot reference and QA verdict/closure. For a genuine bug link steps/expected/actual, PM grooming, QA-added regression, Engineer repair and final QA PASS. Failed attempts remain recorded; never replace them with invented success. Deadline/grade and full-chat export remain unknown/pending until supplied.
