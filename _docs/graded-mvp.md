# Graded MVP plan

October 19, 2026 · **Frontend request now authorizes #41 reference/inventory and #42 full typed mock UI after prerequisites. Later architecture stages remain planned, not implemented/authorized by this plan.**

**October 20, 2026 update:** the user separately authorized #43–#47 (another agent, upstream `codex/backend-preparation`) and #48–#54 (this run). See [process.md](process.md#authorization-for-issues-43-54-october-20-2026). #48 is groomed in [prisma-baseline.md](prisma-baseline.md) and has independent QA PASS at `69b0bc8`. #49 is groomed in [prisma-identity.md](prisma-identity.md); its HTTP parity part waits for a QA-passed #44 that uses the shared ports. The phase order and evidence rules below are unchanged.

## Baseline and goal

The complete current WatchNext feature set is described in [specification.md](specification.md). All original issues 1–40 are closed after independent QA; [final verdict](https://github.com/xiaodlb/watchnext/issues/40#issuecomment-6263933927). Preserve exact baseline 441fcaae660e273d6fc373f8757be562d9139b78 and annotated tag **graded-baseline-2026-10-19**.

The graded iteration changes architectural delivery/evidence, not product scope. Keep **all** account/recovery, legacy separation, group/invite/owner, four-type library, manual/provider autofill/previews, own progress/feedback, picker/cycle, archive/restore, shared attribution and Mine behavior. Do not reduce “MVP” to one unused demo screen or add unrelated features.

Teacher requirements available in this session are summarized as: complete frontend with mock data first, root OpenAPI contract, real HTTP backend with in-memory storage, real full-domain ORM-backed SQLite with documented database-specific limits, genuine hands-on user testing/bug iterations, and traceable reference/brainstorming/implementation evidence. The teacher rubric text is available in the user conversation and must be mapped faithfully in the evidence task. The deadline is **unknown**; do not invent it or guarantee a grade.

## Architecture target — planned

Keep Next.js/TypeScript and Next Route Handlers, one repository and the existing local academic deployment. No mandatory FastAPI/Python/new backend repository. A centralized typed frontend service has explicit mock and HTTP adapters. Real HTTP handlers invoke domain services through repository interfaces, with isolated memory and Prisma-backed durable adapters. Pure eligibility/ranking and security rules remain shared.

[Prisma supported databases](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases) include SQLite/PostgreSQL; [baselining guidance](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining) addresses existing important data and custom database elements. These support a proposed tool choice, not proof this project is already database-independent. Pin a compatible version only in the future owning issue.

Prisma must actually implement the complete application repositories, not one unused table. Preserve current stable IDs, password/recovery/session hashes, memberships/generations/context, titles/contributions/history, nullable imported fields, deadlines and immutable native migration evidence. Enumerate SQLite triggers/checks/secure deletion/transaction assumptions; retain equivalent domain/DB protections and adapter-specific SQL where genuinely necessary. Baselining never means reset/db push of normal data. The required MVP uses real full-domain ORM/repositories with documented SQLite-specific limits. Optional PostgreSQL proof is post-mvp #52, not a grading gate; any future claim of tested portability needs actual disposable execution, not schema generation alone.

Mock UI uses only clearly synthetic data and makes no real-security claim. Memory backend has real server authentication/permissions/native crypto and loses data on restart. Prisma SQLite persists across restart. These modes must never read/reset/migrate the normal database accidentally. CLI backup/maintenance remain legitimate operator operations, not frontend HTTP shortcuts.

## Sequential backlog and phase gates

The original complete-frontend #42 was too large for one session. It is now a small typed service/mode foundation, followed by bounded account, group/legacy, library, Add/review, personal-record and picker increments plus final integration. **#42 → #55 → #56 → #57 → #58 → #59 → #60 → #61 all precede #43.** This preserves the original full scope and frontend authorization; foundation closure alone is not complete phase evidence. Later HTTP/backend/ORM work remains planned. QA refresh/acceptance applies independently to each increment.

Thirteen required issues carry mvp; optional #52 carries post-mvp. Creation alone did not authorize implementation. The user subsequently requested frontend work and supplied Lovable editor/public-preview references; PM [refreshed #41](https://github.com/xiaodlb/watchnext/issues/41#issuecomment-6265752332) and recorded the accessible-preview correction. This authorizes #41 and #42 only, sequentially through PM/Engineer/independent QA. #41 supplies [the full operation inventory](operation-inventory.md), [observed design pack](design-references.md) and [source-mapped matrix](submission-matrix.md); it does not implement #42. #43 onward still need their owning authorization/prerequisites. Live issues remain authoritative.

| Order | Issue | Phase/evidence |
| --- | --- | --- |
| 1 | [#41 Inventory/reference pack](https://github.com/xiaodlb/watchnext/issues/41) | Full-operation inventory, rubric mapping, references/wireframes and real chat-source inventory |
| 2 | [#42 Typed mock foundation](https://github.com/xiaodlb/watchnext/issues/42) | Isolated typed service/context/shell/reset only |
| 3 | [#55 Accounts/recovery: A01–A05](https://github.com/xiaodlb/watchnext/issues/55) | Bounded frontend increment; all precede #43 |
| 4 | [#56 Groups/owner/legacy: G01–G08/L01–L04](https://github.com/xiaodlb/watchnext/issues/56) | Bounded frontend increment; all precede #43 |
| 5 | [#57 Saved library/Mine/detail/edit/archive](https://github.com/xiaodlb/watchnext/issues/57) | Bounded frontend increment; all precede #43 |
| 6 | [#58 Manual/provider Add/review: W04/W05/M](https://github.com/xiaodlb/watchnext/issues/58) | Bounded frontend increment; all precede #43 |
| 7 | [#59 Personal progress/feedback: P01–P05](https://github.com/xiaodlb/watchnext/issues/59) | Bounded frontend increment; all precede #43 |
| 8 | [#60 Picker/cycle: K01–K04](https://github.com/xiaodlb/watchnext/issues/60) | Bounded frontend increment; all precede #43 |
| 9 | [#61 All-operation integration and phase evidence](https://github.com/xiaodlb/watchnext/issues/61) | Bounded frontend increment; all precede #43 |
| 10 | [#43 root openapi.yml](https://github.com/xiaodlb/watchnext/issues/43) | Validated complete HTTP schemas/examples/auth/errors and operation map |
| 11 | [#44 Memory identity/groups HTTP](https://github.com/xiaodlb/watchnext/issues/44) | Real server auth/recovery/group/legacy context over memory repository |
| 12 | [#45 Memory library/provider HTTP](https://github.com/xiaodlb/watchnext/issues/45) | Real shared saves/lookup/reviews/expiry and archive/Mine |
| 13 | [#46 Memory personal/picker HTTP](https://github.com/xiaodlb/watchnext/issues/46) | Real own history/feedback and full picker/cycle truth tables |
| 14 | [#47 Complete UI-to-HTTP wiring](https://github.com/xiaodlb/watchnext/issues/47) | Every operation demonstrated over HTTP; restart proves memory loss |
| 15 | [#48 Prisma mapping/baseline](https://github.com/xiaodlb/watchnext/issues/48) | Data-safe schema/constraint inventory and owned populated upgrade copies |
| 16 | [#49 Prisma identity/group repositories](https://github.com/xiaodlb/watchnext/issues/49) | Actual durable auth/group use and parity tests |
| 17 | [#50 Prisma library/history repositories](https://github.com/xiaodlb/watchnext/issues/50) | Actual durable library/provenance/history and picker projections |
| 18 | [#51 Full Prisma SQLite integration](https://github.com/xiaodlb/watchnext/issues/51) | Same full HTTP UI, restart/backup/restore/upgrade evidence |
| 19 | [#53 Genuine user testing/bugs](https://github.com/xiaodlb/watchnext/issues/53) | Hands-on checklist and actual user-test-bug regression iterations |
| 20 | [#54 Submission package](https://github.com/xiaodlb/watchnext/issues/54) | Complete accurate matrix, artifacts/commands and QA closures |
| Optional | [#52 Real PostgreSQL portability](https://github.com/xiaodlb/watchnext/issues/52) | Post-MVP only; no dependency for #53/#54 |

Each issue identifies dependencies/files/limits. Full feature coverage is checked at every phase; a phase may use mock provider transport but not fake application writes. Existing baseline regressions remain meaningful. Current commands still describe the native-SQL baseline. The explicit `/mock` entry and `pnpm test:mock` are implemented, with [commands and lifetime](mock-frontend.md); all mock domains are implemented (#55–#60 QA-accepted) and integration #61 awaits independent QA. **Future HTTP/ORM selectors/commands do not exist yet**: owning issues must introduce, document and verify them; do not present proposed names as runnable. No empty openapi.yml is created in this first step.

## Teacher workflow for this iteration

The scoped rules below supersede earlier orchestrator-closure/no-QA-test-change rules **only for new mvp/user-test-bug issues**, without rewriting closed 1–40.

1. PM grooms the issue, checkable acceptance criteria and scope.
2. For an actual user-test-bug, QA adds concrete runnable regression case(s) reproducing the reported defect before Engineer work, recording expected versus observed failure. QA may edit tests, never product implementation. Use a reviewable red-regression commit/branch until fixed; do not skip the case.
3. Engineer implements/fixes against criteria and QA regressions, runs full required checks, commits and comments; leaves issue open.
4. QA independently verifies each criterion/current commit and tests; posts PASS/FAIL with commands/results. On FAIL, Engineer fixes. **QA closes mvp/user-test-bug only after actual PASS.** Orchestrator coordinates/observes closure.
5. Human user really exercises the application and reports genuine findings; automation is separately labeled. No invented bug count, user experience, screenshot or successful test.
6. Optional unrequested ideas are post-mvp; do not inflate tasks toward an arbitrary 100-issue target.

Labels mvp, post-mvp and user-test-bug are available. Existing closed issues are not retagged/reopened. Use [bug template](user-test-bug-template.md), [manual checklist](manual-testing.md) and [iteration log](iteration-log.md).

## Evidence and preservation

Maintain [design references](design-references.md), [brainstorming provenance](brainstorming-evidence.md), [submission matrix](submission-matrix.md) and the living specification as implementation changes. Mark planned, implemented, tested and user-confirmed evidence distinctly. Full original chat export must come from actual available messages or user export; never reconstruct missing assistant turns from numeric answers.

The initial #41 documentation step changed no app/runtime/data. #42 implemented only the isolated mock foundation; domain work was delivered by its mapped follow-ups #55–#61. All implementation/verification uses owned checkouts and disposable DB/browser/provider fixtures, keeping the user's M server/.next/next-env.d.ts and normal/demo data untouched. User screenshots use synthetic personas and mask passwords/codes/tokens/invitations. Do not stop their server, buy services, inspect keys, or silently migrate their DB. Baseline tag is a code reference, not permission to reset user data.

Current frontend status: #42 and #55–#60 are independently QA-accepted; [#61 integration and evidence](mock-integration.md) is Engineer-tested with independent QA pending. #43 onward remain planned; no HTTP/OpenAPI/ORM implementation is claimed.
