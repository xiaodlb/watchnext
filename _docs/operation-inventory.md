# Frontend operation inventory and staged handoff

October 19, 2026 · #41 documentation only. Baseline: **441fcaae660e273d6fc373f8757be562d9139b78**, tag **graded-baseline-2026-10-19**, accepted through closed issues #1–#40. Current source inventory was read at d8b99cd6eb8ef90c9e0abd9e61ca63d81ec44308; no application changes are delivered here. Requirement IDs refer to [specification.md](specification.md); visual observations/provenance are in [design-references.md](design-references.md).

The subsequent frontend request authorizes #41 and then #42 after its prerequisites. It does **not** authorize the later contract/backend/ORM implementation merely because these operations are mapped. These are **proposed typed mock-service operations**, not existing exported interfaces or REST paths. Current UI uses native server reads, Next Server Actions and limited account/group HTTP handlers. The split frontend phase (#42/#55–#61) must implement the complete service, not an unused mock beside unchanged database calls.

## Common contract and state language

Each service operation has typed input/output and asynchronous success/failure variants. The proposed boundary supports cancellation, a request/context identity, field-level validation, stale/context-changed outcomes and actionable retry. The domain increments extend #42 with real TypeScript types; #43 maps each operation ID to the validated root OpenAPI contract, including auth, methods, inputs/results and errors. This document does not preempt that design with invented runnable endpoints.

- **S** success/readback: show actual returned data or a clearly acknowledged mutation; no decorative fake working controls.
- **E** empty/absent/unavailable: distinguish a genuinely empty list, no personal record, missing title and unauthorized access. For operations without a collection, the row names the appropriate absent state rather than a meaningless empty screen.
- **P** pending/loading: route/service loading, disabled duplicate submission and input retention; loading never masquerades as an empty successful result.
- **F** validation/service failure: safe visible announced error, focused feedback and usable retry. Keep drafts except deliberate secret clearing.
- **C** stale/cancel/context change: discard late results and departed views; group/profile/membership changes cannot apply another context's data. Version conflicts require a fresh explicit action, never silent overwrite.

**Every operation below requires P/F/C**, with row-specific S/E cases. Read-only links, local draft edits and clipboard handling are separated below; they must not be turned into fake backend mutations. Real server authority in later stages derives the member from the session, not a caller-supplied ID. Mock errors demonstrate interactions only, not real authentication/security.

All operations participate in the **frontend mock phase (#42 foundation and #55–#61 domain/integration increments) → #43 contract inventory → #47 HTTP UI wiring → #51 durable full-UI integration**. The `Adapters` column gives additional memory-domain and Prisma-repository ownership. **#48** maps every persisted operation before #49/#50 implement it. **#52** is optional post-MVP, never a prerequisite for required submission. Every frontend increment must pass QA before #43; a #42 foundation PASS alone does not complete the mock phase.

## Account, group and legacy screens

All rows also carry NFR02 security, NFR03 privacy and NFR04 accessibility/state requirements. NFR01 / NFR05 apply to mode/runtime isolation and verified startup.

| ID / FR | Current route and source | Proposed service operation / result | Required S/E and specific P/F/C cases | Adapters |
| --- | --- | --- | --- | --- |
| A01 FR01/FR02 | `/register`; `app/components/account-form.tsx`, `/api/account/register` | `accounts.register(credentials)` → once-only recovery reveal + current context | S confirmed signup/private code/save-and-continue; E signed-out form; F duplicate/invalid confirmation; clear password after response; lost reveal cannot be fetched again; C departure removes secret. | #44 / #49 |
| A02 FR01/FR02 | `/login`; same form, `/api/account/login` | `accounts.signIn(credentials)` → current account/context | S actual identity; E signed out; F unknown/wrong same safe error, busy/throttled; clear password; invitation continuation remains private. | #44 / #49 |
| A03 FR02 | `/account`; same form, `/api/account/logout` | `accounts.signOut()` → signed-out context | S current session signed out; E already absent session safely handled; P disable repeat; F retry; C old view cannot reappear through back/navigation. | #44 / #49 |
| A04 FR02 | `/recover`; account form, `/api/account/recover` | `accounts.recover(username,code,newPassword)` → once-only replacement, then signed-out | S replacement shown once/all old target sessions invalid; E no saved proof/no bypass explanation; F wrong/consumed proof, malformed password, lost success; C late/departed secret erased. | #44 / #49 |
| A05 FR01-04 | `/account`, `app/account/page.tsx`, `group-panel.tsx` | `accounts.getContext()` and `groups.listMemberships()` → account, mode, groups, pending invitation, revision | S own groups/current selection; E no groups/no pending invitation or anonymous; F safe storage/retry; C removed/expired session cannot display cached groups. | #44 / #49 |
| G01 FR03 | `/account`; `app/account/group-panel.tsx`, `/api/groups/create` | `groups.create(name,expectedContext)` → selected group + private once-only invite | S newly created group/stable own member; E initial no groups; F bounded name, rollback; C stale context cannot create under another identity. | #44 / #49 |
| G02 FR03/FR04 | `/invite/<token>`, `/invite`, `/access-error`; route handlers | `invites.resolve(privateToken)` → token-free continuation or safe invalid result | S signed-out continuation or legacy access; E invalid/revoked/expired link; P no private group disclosure; F retry; C rotated/removed generation or context switch invalidates pending intent. | #44 / #49 |
| G03 FR03/FR04 | `/account`; group panel, `/api/groups/join` | `groups.joinPending(expectedContext)` → selected stable membership | S explicit Join; E no current invitation; F stale/invalid intent; C removal/rotation before or during join denies; idempotent join/new-generation rejoin keeps IDs/history. | #44 / #49 |
| G04 FR03 | `/account`; group panel, `/api/groups/switch` | `groups.select(groupId,expectedContext)` → new context | S this browser's group only; E no active membership; F foreign/removed group; C away-and-back advances context, other browser stays independent. | #44 / #49 |
| G05 FR04 | `/account`; `/api/groups/legacy` | `groups.useLegacyMode(expectedContext)` → explicit separate mode | S navigation to legacy entry; E no selected legacy group; F retry; C no account member impersonation, copying or claiming. | #44 / #49 |
| G06 FR04 | `/group`; `management-panel.tsx`, `lib/accounts/management.ts` | `groups.getManagement()` → members, creator capability, generations/context | S real names/colors/active-inactive state; E inaccessible group; F retry; C live permissions/current membership rechecked. Noncreator gets no owner controls. | #44 / #49 |
| G07 FR04 | `/group`; management panel, `/api/groups/remove` | `groups.removeMember(target,expectedGeneration,context)` → retained inactive member | S confirm removal/retained-history feedback; E target already removed handled safely; F cannot self-remove/foreign target; C pending provider/reviews/cycles invalid, pre-rejoin action never revives. Cancel writes nothing. | #44 / #49 |
| G08 FR04 | `/group`; management panel, `/api/groups/rotate` | `groups.rotateInvite(expectedGeneration,context)` → new once-only private link | S explicit confirmation/private copy; E old raw link is not retrievable; F rollback/retry; C concurrent rotation/old pending intent denied, active members retain access. Cancel writes nothing. | #44 / #49 |
| L01 FR03/FR04 | `/`; `create-group-form.tsx`, `app/actions/create-group.ts` | `legacy.createGroup(name)` → private legacy invitation | S separate trusted-name group; E initial entry; F invalid name/config/retry; C no account ownership/claiming attached. | #44 / #49 |
| L02 FR04 | `/group`; `profile-panel.tsx`, `app/group/actions.ts` | `legacy.getProfiles()` → current group/profiles/active profile | S trusted named colored profiles; E no profiles/no active profile; F invalid invitation/session; C wrong/changed group view hidden. | #44 / #49 |
| L03 FR04 | `/group`; same panel/action | `legacy.createProfile(name,color)` → new active profile | S atomic create/select; E initial profile creation; F normalized duplicate/name/palette errors; C stale session/group loses authority. | #44 / #49 |
| L04 FR04 | `/group`; same panel/action | `legacy.selectProfile(profileId)` → new context | S selected profile retained on reload; E absent profile selection; F wrong-group/missing profile; C old forms/reviews/picker invalidated. Account mode never offers impersonating profile selection. | #44 / #49 |

## Shared library, entry and metadata

All rows require NFR02-04, including group-scoped reads, own-contribution authority, safe errors, focus, source/secret privacy and image fallback. Nullable expired metadata remains honest rather than fabricated.

| ID / FR | Current route and source | Proposed service operation / result | Required S/E and specific P/F/C cases | Adapters |
| --- | --- | --- | --- | --- |
| W01 FR05/FR08/FR14 | `/watchlist?filter=all|mine`; `watchlist-view.tsx`, `read-boundary.tsx`, `lib/watchlist.ts` | `library.list({filter})` → active cards, all adders/inactive labels, filter capability | S one card/title/all names/colors/duration/mood/preview; E empty All versus empty Mine; F invalid/repeated filter becomes All notice, retry read error; C back/reload/group switch/current membership reauthorization. Legacy has All only. | #45 / #50 |
| W02 FR07/FR08/FR14 | `/archive`; same list view | `library.listArchived()` → read-only retained titles/history | S archive cards/safe previews; E empty archive; F retry/access; C archived/departed data cannot enter active picks or Mine. | #45 / #50 |
| W03 FR05/FR07/FR09/FR10/FR11/FR14 | `/watchlist/<id>`; `detail-view.tsx`, `detail-error.tsx`, `cover.tsx` | `library.getTitle(id)` → details, permissions, contributors, attributed history, provenance availability | S own controls + shared history/inactive attribution; E missing/foreign title or expired metadata shown safely; F retry; C access revoked/archived/stale profile hides writes; no active profile required for legitimate legacy browsing. | #45 + #46 projections / #50 |
| W04 FR05/FR06 | `/watchlist/add`; `title-form.tsx`, `title-fields.tsx`, `actions.ts` | `library.saveManual(draft)` → created, existing, confirmation, archived-match or conflict | S saved readback for Movie/Series/Anime/YouTube; E empty draft; F title/runtime/genre/mood/link/numbering validation; P retain draft; C changed context/confirmation cannot mutate another title. Full versus typical duration, optional NULL fields preserved. | #45 / #50 |
| W05 FR06/FR07 | Same form and summary/detail navigation | `library.confirmSave(matchId,draft,expectedRevision)` → contribution/restore/existing | S one shared title/new own adder or same-ID restoration; E no current match; F identity conflict/distinguish work; C stale match/race uses current identity, cancel has no writes; metadata/history unchanged by duplicate. | #45 / #50 |
| W06 FR07 | `/watchlist/<id>/edit`; `edit-form.tsx`, edit `actions.ts` | `library.getEditDraft(id)` / `library.updateTitle(id,draft,revision,confirmation)` → saved/conflict | S contributor correction; E missing/archived/no permission; F malformed/collision, explicit sensitive identity confirmation; C stale-write denial, history-compatible NULL-type recovery only. Cancel retains original. | #45 / #50 |
| W07 FR07/FR08 | Detail/summary; `contribution-controls.tsx`, `contribution-actions.ts` | `library.removeOwnContribution(id,confirmation)` → active or archived | S remaining adders or final archive; E already absent idempotent; F retry/rollback; C never remove another's contribution, Mine hides own removed item without losing shared history. Cancel writes nothing. | #45 / #50 |
| W08 FR07/FR08 | Archived detail; same controls/action | `library.restore(id)` → same ID + own contribution | S active title/history/Mine inclusion restored; E missing/foreign title; F retry; C already-restored/races don't duplicate identity; archived titles remain read-only before restore. | #45 / #50 |
| M01 FR12/FR13 | Add; `lookup-panel.tsx`, `lookup-actions.ts` | `metadata.search({source,kind,query})` → candidates or ready review | S YouTube title or strict link/ID; Kinopoisk title choices with channel/runtime or year/type; E no results; F invalid query/not configured/quota/network/deadline/cancel; C latest query/context only, no live fetch in mock mode. | #45 / #50 |
| M02 FR12 | Same lookup panel/action | `metadata.page(handle,direction)` → page snapshot | S explicit next/previous; E empty/filtered page, absent navigation/limit reached; F safe error/retry; C handles bind source/query/context, no silent crawling; five visits/chain. | #45 / #50 |
| M03 FR12/FR13 | Same lookup panel/action | `metadata.selectCandidate(handle,id)` → trusted selected-detail review | S exact selected ID/details; E missing/unavailable candidate; F mismatched response/retry; C stale/foreign/expired handle or selection supersession cannot import. No per-candidate speculative detail fetch. | #45 / #50 |
| M04 FR05/FR06/FR12/FR13/FR14 | Add; `saveTitleAction` review branch | `metadata.saveReviewed(handle,editedDraft,confirmation)` → shared save outcome | S explicit Save after available-field autofill; E missing required metadata blocked; F manual mood/runtime/type/episode numbering and typical-duration confirmation; C server-owned provider identity/provenance, actual corrections retained, stale/expired context denied. Duplicate/restore use W05 semantics. | #45 / #50 |
| M05 FR13/FR14 | Detail; `refresh-controls.tsx`, `refresh-actions.ts` | `metadata.refreshTitle(id)` → fresh field projection or unavailable | S verified acquired fields refreshed; E unavailable/missing provider fields remain NULL; F unconfigured/quota/error/manual correction alternative; C newer user corrections never overwritten; reauthorize after await. | #45 / #50 |
| M06 FR14 | All relevant loaders; `lib/metadata/lifecycle.ts` | Read operations project current metadata after `lifecycle.ensureFresh` repository work | S fresh values/corrections/history; E due imported values/reviews physically cleared; F honest unavailable/manual path; C no deadline renewal by read/restore. This is internal lifecycle behavior, **not a new client cleanup endpoint**. | #45 / #50 + #51 physical-deletion parity |

## Personal records and picker

All mutations bind the current session member, not a client-selected author; group-visible history and archived read-only behavior survive every stage. NFR02-04 apply to each row.

| ID / FR | Current route and source | Proposed service operation / result | Required S/E and specific P/F/C cases | Adapters |
| --- | --- | --- | --- | --- |
| P01 FR09 | Detail; `episode-controls.tsx`, `episode-actions.ts` | `progress.saveEpisode(id,position)` → own record | S Unknown versus explicit Not started/in-progress next-to-watch; E no record is Unknown; F season/episode1-9999/numbering mismatch; C changed member/archived/NULL type denied; keep completion independent. | #46 / #50 |
| P02 FR10 | Detail; `watch-controls.tsx`, `watch-actions.ts` | `progress.saveTimestamp(id,seconds)` / `clearTimestamp(id)` | S saved zero/nonzero versus absent; E unavailable runtime warns, no guess; F M:SS/H:MM:SS/bounds; C shortened runtime preserves older oversized value, access/context/archived denial. | #46 / #50 |
| P03 FR09/FR10 | Both progress panels/actions | `progress.setCompleted(id,completed)` → own flag | S complete/undo retain coordinates/position; E absent position still allowed under current bounds; F rollback/retry; C no automatic completion/position inference or other-member writes. | #46 / #50 |
| P04 FR11 | Detail; `rating-controls.tsx`, `rating-actions.ts` | `feedback.saveRating(id,score)` / `clearRating(id)` | S integer 1–10/Not rated and shared author; E absent rating; F fractions/range; C own only/stale/archived denial, no completion gate, preserve notes/progress. | #46 / #50 |
| P05 FR11 | Detail; `note-controls.tsx`, `note-actions.ts` | `feedback.saveNote(id,text)` / `clearNote(id)` | S plain text/newlines/author; E blank clear/absent note; F 2000-code-point limit/no truncation; C own only/stale/archived denial, retain draft/error focus and ratings/progress. | #46 / #50 |
| K01 FR15 | `/pick`; `page.tsx`, `picker.tsx`, `load-error.tsx` | `picker.getInputs()` → current eligible viewer choices/context | S real active members; E no members/no group, never fake users; F load/retry; C removed profiles/foreign group excluded, draft selections invalidated visibly. | #46 / #50 projection + #51 integration |
| K02 FR15/FR16 | Same UI; `app/pick/actions.ts` | `picker.pick(inputs,requestId)` → one disclosed tier/result + cycle | S exact title/episode/full runtime/viewer rewatch labels or one allowed fallback; E honest no eligible/no fit/no saved titles reasons; F invalid time/mood/viewers; C fresh context/progress/lifecycle, rewatches default off. No history write. | #46 / #50 projection + #51 integration |
| K03 FR17 | Same picker/action | `picker.next(cycle,logicalRequestId)` → next item or exhausted | S same-tier ordered no repeats; E explicit exhaustion; F retry replays same logical position; C relevant data/progress or input/context change resets safely, never widens tier or advances on error. | #46 / #50 projection + #51 integration |
| K04 FR17 | Same picker/action | `picker.restart(inputs,expectedCycle)` → explicit new cycle | S deliberate Start again after exhaustion; E missing/expired/evicted/restarted cycle needs fresh start; F retry; C no stale/foreign cursor authority, page-local bounded cycle not durable viewing history. | #46 / #50 projection + #51 integration |

## Local interactions, images and operator boundaries

These remain in #42/#55–#61, then #47/#51 UI coverage; #43 must explicitly mark them **client-only**, reusing the corresponding operation's DTO rather than inventing endpoints:

- **U01 FR13:** edit draft, choose source/type, clean automatic merge, dirty Replace/Keep, cancel/ignore late response, start fresh manual/drop import. Preserve unrelated mood/manual edits. Removing import authority must be explicit, never a hidden provider relabel. M03/M04 establish/save authority.
- **U02 FR02/FR04, NFR03/FR04:** copy once-only recovery/invite with manual selection fallback, secret visibility/save-and-continue and departure erasure. No retrieval endpoint for a discarded raw code/link; no permanent browser storage/logs.
- **U03 FR08:** All/Mine URL/back/reload controls and navigation to group/account/archive/detail/saved summary. W01 performs each current read; no client identity parameter grants authority. Prototype type-filter chips are observed design only, not a new required feature/API.
- **U04 FR14:** preview layout/fallback from safe source DTO, broken image handling, no-referrer and aspect ratio. Baseline host/path rules remain; no image proxy/download/cache is introduced.
- **U05 FR05/FR15, NFR03:** open validated external source/watch link with safe destination handling. No embedded playback, auto tracking, third-party account action or progress mutation.
- **U06 NFR04:** navigation, skip link, focus recovery, labels/announcements, cancellation and confirm dialogs. Disabled pending controls must not trap keyboard focus. Generic access/not-found/retry views are distinct from empty success.

NFR05 operator commands (explicit initialization, migration, metadata maintenance, WAL snapshot/new-path restore and verified launchers) are **not frontend HTTP operations**. #48/#51 must retain/test their full-domain SQLite/ORM adaptation, original IDs/security history/deadlines and physical expiry. Mock mode must not invoke them or touch normal/demo storage. Memory-mode restart proves loss of only its isolated in-memory data; durable mode proves restart/backup preservation. Future selectors/commands are not runnable until their owning issues implement/document them.

## Responsive screen-family handoff at 375px / 1280px

The **current baseline** has historical actual two-width browser/QA evidence in [enhancement-audit.md](enhancement-audit.md), with source shell/fields in `app/layout.tsx`, `app/styles.css` and [design-system.md](design-system.md). #41 reads/reuses it; it does not rerun the app or claim new baseline screenshots. The **Lovable** observations are limited to the capture table in design-references; mobile watchlist/Add/Pick and other absent screens are not inferred.

| Family | 1280px baseline to retain / available reference | 375px requirement / remaining mock wireframe needs |
| --- | --- | --- |
| Entry/account/signup/login/recovery/private reveal | Existing separate account/legacy routes; observed Lovable centered sign-in surface only | Verified preview sign-in fits 375px; reuse baseline stacked form/focus. #42 must wireframe signup confirmation, once-only code, errors/throttle/retry, not copy prototype's fake-auth claim into real mode. |
| Account groups/invitation/creator administration | Existing membership list, explicit Join/switch, private invite confirmation/remove/rotate | Stack cards and full labels; fit long group/member names; confirmation/revoked/stale/pending states. No observed Lovable owner/group/recovery screen. |
| Legacy entry/profile chooser/access errors | Existing independent trusted-name group/profile palette and access error | Wrap palette/name controls; no account impersonation or merging. Baseline is reference, not unseen prototype coverage. |
| Active library/All-Mine/archive | Existing honest list + observed desktop card hierarchy/adders/duration; archive stays reachable | Reflow cards/navigation without hiding actions or horizontal overflow; empty All/Mine/archive, read error/retry and stale view need mock scenarios. No post-login mobile reference captured. |
| Add/manual/search/candidates/review | Observed desktop type choices/title/runtime/genre/moods/search; complete baseline has seconds/numbering/provenance/confirmation | Stack fields/candidate paging, preserve draft/keyboard controls. Provide all four type branches, unknown/expired fields, manual fallback, dirty/stale races and safe image fallback rather than only the observed blank movie form. |
| Detail/edit/own history/contribution/archive restore | Existing permissions/history and safe preview components; no inspected Lovable detail/edit interactions | Stack attributed records and actions; long Unicode notes/link labels wrap. Wireframe read-only archive, conflicts, missing metadata and independent progress/rating/note/clear/undo. |
| Picker/result/cycle | Observed desktop viewer/time presets/custom minutes/mood control arrangement; baseline supplies rewatch/tier/cycle semantics | Wrap viewer/mood chips, numeric entry and result; wireframe eligible/no-match/fallback, rewatch names, exhaustion/restart/errors/context reset. Never drop Rewatches OK or progress truth tables because not visible in preview capture. |

## Synthetic fixture and isolation policy for #42

Use clearly labeled **Mock preview / synthetic data**, seeded fictional personas (for example Demo Viewer A/B/C), fictional titles and stable synthetic IDs in two distinct groups plus separate legacy profiles. Preserve one title per shared identity and all contributors. Supply all four content types, both episode numbering styles, Unknown/Not started/zero/completed distinctions, one joint/sole/inactive contributor, archive/history restoration, missing/expired metadata and deterministic picker tiers/cycle scenarios. Public preview sample film names/art are reference content, not a license or production data seed.

The mock adapter has **no imports of db/server, SQLite, provider keys or native server mutations**, no real-network provider calls, no normal DB path, no automatic migration/reset and no reuse of real accounts/codes/invites/browser storage. Mock persona selection and fake auth outcomes are test state only, never security claims. Secret-looking fixture values stay ephemeral and masked/once-only in screenshots; do not enter real credentials. Use safe local synthetic previews/fallback or outbound mocks in tests, never scrape/download arbitrary art. Make scenario reset explicitly mock-only and incapable of resetting other modes.

Use deterministic opt-in service scenarios for S/E/P/F/C (including canceled/late success/error), not decorative page-only state. Production handlers remain authoritative in later HTTP modes; mocks never prove authorization, password hashing, session protection, network entitlement or persistence. The HTTP adapter must eventually implement the same frontend-facing interface without normal-data fallback. #42 owns its exact selector/scripts/type implementation and actual walkthrough evidence; none is invented as runnable here.

## Split frontend ownership and complete phase checklist

The earlier #42 whole-phase task was too large for the one-session rule. Requirements are retained in these independently groomed owners; nothing below is silently removed:

| Issue | Bounded ownership |
| --- | --- |
| [#42](https://github.com/xiaodlb/watchnext/issues/42) | Typed async result/context/scenario foundation, explicit isolated mock shell/entry/reset, production default unchanged |
| [#55](https://github.com/xiaodlb/watchnext/issues/55) | A01–A05 account/recovery and account U02/U06 interactions |
| [#56](https://github.com/xiaodlb/watchnext/issues/56) | G01–G08/L01–L04 group/owner/legacy and group U02/U03/U06 |
| [#57](https://github.com/xiaodlb/watchnext/issues/57) | W01–W03/W06–W08 saved library/Mine/detail/edit/archive; read-only M06 expiry presentation; U03/U04/U05/U06 |
| [#58](https://github.com/xiaodlb/watchnext/issues/58) | W04–W05/M01–M06 manual/provider Add/review/refresh; U01/U04/U06; completes M06 across entry and reads |
| [#59](https://github.com/xiaodlb/watchnext/issues/59) | P01–P05 personal progress/completion/feedback and U06 |
| [#60](https://github.com/xiaodlb/watchnext/issues/60) | K01–K04 picker/results/cycle and U03/U05/U06 |
| [#61](https://github.com/xiaodlb/watchnext/issues/61) | Connected all-40-operation/six-U-group integration, full regression/two-width evidence and #43 handoff |

Execute in that order, with each issue's focused checks and independent QA. The following retained whole-phase checklist belongs to final integration #61, not the small #42 foundation:

- [ ] Every A/G/L/W/M/P/K operation and U interaction above is reachable in the actual mock UI and routed through the centralized typed service boundary, including existing page reads and all clear/undo/confirm/retry variants. No direct native DB/server-action/provider bypass remains in mock mode; real baseline mode is preserved and isolated.
- [ ] FR01-FR17 and NFR01-NFR05 coverage maps back to operation IDs; every applicable S/E/P/F/C case has a service scenario and meaningful UI verification, with both personas/groups and no missing legacy/archive/owner/recovery/detail screen.
- [ ] Reuse the existing full accessible baseline, adapting only observed visual lessons (spacing/cards/blue action/centered forms) under source priority. Record unseen-screen mock wireframes rather than claim Lovable fidelity or introduce unrelated type-filter features.
- [ ] Two-width keyboard walkthrough covers actual routes, navigation/focus, all content-type/missing-field branches, once-only secrets, manual/provider review/dedup/restore and truthful picker state; no overflow, fake working controls, secret captures or hidden-only demo.
- [ ] Mock isolation/scenario reset is proven without opening normal SQLite, native account credentials, provider secrets or live provider traffic. Actual mock-mode command/selector is documented and independently tested, not assumed from this plan.
- [ ] #43 receives every service operation/result/error/auth/context requirement plus explicit client-only/internal exclusions. #47 and #51 must demonstrate the same UI over real HTTP/memory then durable SQLite, preserving full behavior and honest mode labels. The frontend phase cannot claim those later stages complete.

QA independently checks this inventory/reference issue and owns actual PASS/closure for mvp. Engineer leaves #41 open; no #42 code starts as part of this document.

## #41 documentation verification

Engineer checked 362 local Markdown file targets, every FR01-FR17 and NFR01-NFR05, 40 unique domain-operation rows plus six client-only interactions, five original PNG byte/checksum/dimension labels and the exact preserved baseline tag. Current/baseline diff whitespace and UTF-8 checks passed. No app/test/schema/dependency/runtime files changed and no application tests/build/server or normal-data operations ran for this documentation issue. This records Engineer checks, not independent QA PASS.

## Implemented foundation boundary after #42 split

Only the context/result/scenario/read-reset and explicit isolated `/mock` entry are implemented by #42; [exact behavior/commands](mock-frontend.md). The 40 domain rows and six U groups above remain the full phase target, distributed across #55–#60 and final #61. Proposed domain methods above are not implemented merely because this foundation exists. #43 waits for all of those owners. Native production routes remain unchanged and must not be mistaken for mock-service phase completion.

## Account increment #55

A01-A05 and account portions of U02/U06 are implemented through the typed client-only account namespace and internal `/mock` forms; [actual behavior/verification](mock-accounts.md). Independently QA-accepted at `269abbc`. Earlier foundation-only statements describe the #42 delivery boundary.

Current frontend state: #42 and #55–#60 are independently QA-accepted (#55 `269abbc`, #56 `391d312`, #57 `1a95c60`, #58 `89deec3`, #59 `033c656`, #60 `b6132ad`); #61 integration below is Engineer-tested with independent QA pending. Earlier per-issue counts and boundaries above are historical. No backend, OpenAPI or ORM stage is implemented.

## #61 integration

The completed [coverage matrix](mock-integration.md#coverage-matrix) maps all 40 domain rows and U01–U06 to typed methods, `/mock` surfaces, S/E/P/F/C tests and 375/1280 journey steps; `tests/frontend/coverage.test.ts` checks it against this page. Historical rows above are unchanged. Evidence for each whole-phase checklist item:

- Every operation reachable through the one typed service, no bypass, baseline isolated: [coverage matrix](mock-integration.md#coverage-matrix), [route coverage](mock-integration.md#route-coverage), `tests/frontend/isolation.test.ts` and the zero non-GET/Server Action/outside-request checks in [launch and isolation evidence](mock-integration.md#launch-and-isolation-evidence).
- FR01–FR17 and NFR01–NFR05 mapped to operation IDs, S/E/P/F/C with service scenarios and UI checks: [FR/NFR trace](mock-integration.md#frnfr-trace) and the operation sweep in `tests/frontend/integration.test.ts`.
- Baseline reused with observed visual lessons, no fidelity claim: [reference versus implemented (#61)](design-references.md#reference-versus-implemented-61).
- Two-width keyboard walkthrough with no overflow, fake controls or secret captures: `tests/fixtures/mock-integration-journey.mjs` in `pnpm test:mock` and the [screenshot evidence table](mock-integration.md#screenshot-evidence-table).
- Isolation and Reset proven without normal SQLite, credentials, provider secrets or live traffic; the mock command and selector documented and tested: [launch and isolation evidence](mock-integration.md#launch-and-isolation-evidence) and [mock frontend](mock-frontend.md).
- #43 receives every operation, result, error, auth/context need and the client-only/internal exclusions: [frontend contract handoff](frontend-contract-handoff.md). #47 and #51 remain later stages; the frontend phase does not claim them.
