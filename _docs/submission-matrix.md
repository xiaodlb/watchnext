# Graded MVP submission matrix

This is a truthful map of the teacher requirements to the current repository state. It distinguishes implemented evidence, automation, real human observations and external prerequisites. It does not promise a grade or invent an unrecorded user test.

**Reviewed main revision:** `a8da187cf0891354f243b9f32f47b8c1cb8dbab9` (October 26, 2026). The later submission-preparation branch will replace this line with its merged revision only after the remaining human prerequisite is complete.

## Delivery evidence

| Teacher requirement | Evidence | Status |
| --- | --- | --- |
| GitHub Issues plus PM → Engineer → independent QA process | [_docs/process.md](process.md), [roles](team/), issue index [_docs/tasks.md](tasks.md), and QA closures [#41](https://github.com/xiaodlb/watchnext/issues/41)–[#51](https://github.com/xiaodlb/watchnext/issues/51) | Implemented and issue-auditable. |
| Design reference from a non-generic design tool | [Lovable reference record](design-references.md), committed comparison/evidence images under `_docs/evidence/lovable-alignment/`, merged [PR #64](https://github.com/xiaodlb/watchnext/pull/64) | Implemented reference-led visual work. It is a similar visual language, not a pixel-for-pixel claim. |
| Frontend → typed mock service iteration | [Mock frontend](mock-frontend.md), [operation inventory](operation-inventory.md), [mock integration](mock-integration.md), #41–#42 and #55–#61 issue history | Implemented and automated; it is not human testing. |
| Versioned OpenAPI contract | [openapi.yml](../openapi.yml), [API guide](api.md), merged [PR #65](https://github.com/xiaodlb/watchnext/pull/65), QA-closed [#43](https://github.com/xiaodlb/watchnext/issues/43) | Implemented. |
| In-memory HTTP iteration | QA-closed [#44](https://github.com/xiaodlb/watchnext/issues/44), [#45](https://github.com/xiaodlb/watchnext/issues/45), [#46](https://github.com/xiaodlb/watchnext/issues/46), [#47](https://github.com/xiaodlb/watchnext/issues/47); [HTTP UI map](http-ui.md) | Implemented and kept as an explicit stage of the history. |
| SQLite plus DBMS-agnostic ORM | [Prisma baseline](prisma-baseline.md), [constraint inventory](prisma-constraint-inventory.md), [repository boundaries](repository-boundaries.md), QA-closed [#48](https://github.com/xiaodlb/watchnext/issues/48)–[#51](https://github.com/xiaodlb/watchnext/issues/51), merged [PRs #66–#69](https://github.com/xiaodlb/watchnext/pulls?q=is%3Apr+is%3Aclosed+%2366+OR+%2367+OR+%2368+OR+%2369) | Implemented for the required SQLite delivery. |
| Final connected frontend/backend | [#47](https://github.com/xiaodlb/watchnext/issues/47) proves the interim HTTP UI; [#51 QA evidence](https://github.com/xiaodlb/watchnext/issues/51#issuecomment-6411272282) proves the durable Prisma HTTP path and browser restart | Implemented and automated. |
| Markdown records in the repository | `AGENTS.md`, `_docs/`, specifications, runbooks, evidence files and this matrix | Implemented. No ordinary databases, secrets or credentials are included. |
| Brainstorming chat evidence | [brainstorming-evidence.md](brainstorming-evidence.md) | Partial authentic excerpts only. A complete original export is unavailable and is not reconstructed. |
| Automated execution and testing | [testing-guidelines.md](testing-guidelines.md), [iteration log](iteration-log.md), individual issue QA comments | Implemented automation. The exact commands below are reproducible. |
| Genuine hands-on testing and user-test-bug workflow | [manual checklist](manual-testing.md), [user-test bug template](user-test-bug-template.md), [#53](https://github.com/xiaodlb/watchnext/issues/53) | **Pending a real human run.** No invented observations or fake bugs are recorded. |
| Close all `mvp` and `user-test-bug` labels | GitHub issues #41–#51 are closed; [#53](https://github.com/xiaodlb/watchnext/issues/53) and [#54](https://github.com/xiaodlb/watchnext/issues/54) remain open | **Pending #53 and #54.** There are currently zero genuine `user-test-bug` issues. |
| Optional PostgreSQL portability | [#52](https://github.com/xiaodlb/watchnext/issues/52) and its runbook | Post-MVP and optional. Its local Docker prerequisite was unavailable when last checked; it is not represented as executed. |

## Iteration and merge trail

1. Lovable-style visual alignment: [PR #64](https://github.com/xiaodlb/watchnext/pull/64).
2. Contract, in-memory backend and typed HTTP UI: [PR #65](https://github.com/xiaodlb/watchnext/pull/65), including #43–#47.
3. Prisma mapping baseline: [PR #66](https://github.com/xiaodlb/watchnext/pull/66), #48.
4. Prisma identity/groups: [PR #67](https://github.com/xiaodlb/watchnext/pull/67), #49.
5. Prisma library/history/metadata: [PR #68](https://github.com/xiaodlb/watchnext/pull/68), #50.
6. Durable Prisma SQLite cutover, backup/restore and restart checks: [PR #69](https://github.com/xiaodlb/watchnext/pull/69), #51.

The original pre-graded reference remains tag `graded-baseline-2026-10-19` at `441fcaae660e273d6fc373f8757be562d9139b78`.

## Reproducible clean-checkout verification

Use a clean checkout, Node.js 24.x and pnpm 11.25.0. The detailed setup and private database handling are in [local setup](local-setup.md), [database](database.md) and [backup/restore](backup-restore.md).

```powershell
pnpm install --frozen-lockfile
pnpm prisma:check
pnpm prisma:baseline:verify
pnpm prisma:identity:verify
pnpm prisma:library:verify
pnpm prisma:cutover:verify
pnpm db:verify
pnpm db:verify:backup
pnpm contract:verify
pnpm test
pnpm typecheck
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

Run manual testing only with synthetic data in a separate, owned database. The checklist records tester, date, revision, expected result and actual observation for every case. A genuine observed bug must use the template, receive the `user-test-bug` label, PM grooming, QA regression coverage, an Engineer repair and a final QA PASS before closure.

## Remaining prerequisites before hand-in

- Complete #53 with a real person’s manual observations. If the person finds a real bug, create and resolve the corresponding `user-test-bug` issue; if not, record zero actual bugs.
- Update the reviewed revision and status rows after #53, run the final documented commands at that revision, and obtain #54 QA PASS.
- #52 remains optional post-MVP. If Docker Desktop/Compose becomes available, run its documented disposable PostgreSQL verification and update its own evidence. Do not block the required SQLite submission or misstate PostgreSQL as tested.