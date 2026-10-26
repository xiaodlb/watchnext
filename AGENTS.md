# WatchNext agent instructions

## Commands

- `pnpm install --frozen-lockfile` - install dependencies
- `pnpm dev` - start the local development server
- `pnpm test` - run the whole suite once
- `pnpm test:mock` - build current source and run isolated no-database mock-foundation smoke; read `_docs/mock-frontend.md`
- `pnpm test:e2e` - build current source and run isolated serial production-browser journeys; first install Chromium as documented in `_docs/testing-guidelines.md`
- `pnpm test tests/home.test.tsx` - run one test file
- `pnpm typecheck` - check TypeScript types
- `pnpm metadata:maintain` - explicitly clear expired imported fields/reviews in the initialized configured database; tests must use an isolated path
- `pnpm build` - create a production build
- `pnpm db:migrate:temp` - create and inspect an isolated temporary schema database
- `pnpm db:verify` - run isolated SQLite migration and constraint acceptance checks
- `pnpm db:init` - explicitly initialize/migrate the configured normal local database (not a test command)
- `pnpm db:verify:persistence` - verify fresh-process persistence using isolated temporary files
- `pnpm db:snapshot '<absolute source>' '<new absolute destination>'` - explicit private SQLite-consistent snapshot/restore; read `_docs/backup-restore.md`, never overwrite an existing destination
- `pnpm db:verify:backup` - isolated WAL-aware snapshot/restore/expiry verification; never uses normal/demo storage
- `pnpm prisma:identity:verify` - run isolated #49 Prisma identity/group persistence and authorization checks
- `pnpm prisma:library:verify` - run isolated #50 Prisma library/history/provenance persistence checks
- `pnpm verify:fresh-checkout` - from clean committed source, install and verify the documented setup/dev/production/demo/tests in an owned temporary local clone; see `_docs/enhancement-audit.md`
- `pnpm start` - serve the production build locally

Use Node.js 24.15.0 or newer within the 24.x release line and pnpm 11.25.0. This is a Next.js and TypeScript project; Python/uv/pytest commands do not apply.

## Rules

- Dependencies are added in `package.json`. During the authorized backlog run, suitable necessary dependencies may be chosen under the user's delegated authority; document the choice and rationale, prefer built-in tools when suitable, and do not purchase services.

The user approved the initial Next.js, React, TypeScript, type definitions, Vitest, jsdom, and React Testing Library dependencies for issue #1. On October 15, 2026 the user delegated remaining suitable product and dependency choices without further questions; see the source quote in `_docs/plan.md`.

## Project context

The initial graded step was documentation/backlog/workflow only. A subsequent user frontend request and Lovable reference authorize **#41 reference/inventory, #42 mock foundation, then sequential frontend-domain increments #55–#61 after prerequisites**, through PM/Engineer/independent QA. Read `_docs/graded-mvp.md`, `_docs/operation-inventory.md`, `_docs/design-references.md` and `_docs/specification.md`; #43–#54 remain planned, not authorized by this frontend request. Baseline tag `graded-baseline-2026-10-19` preserves the completed app. For new `mvp`/`user-test-bug` issues, QA adds regression cases during genuine bug grooming and closes only after actual PASS; `_docs/process.md` scopes this exception without rewriting historical closures. Preserve user M-drive runtime/data.

The completed October 18 account/discovery enhancement (#31–#40) was **authorized for sequential implementation**: after the planning-only phase, the user explicitly said “выполни оставшиеся ишшюс на гитхабе” (implement the remaining GitHub issues). This supersedes the planning pause; all issues #1–#40 are now closed after independent QA; final #40 PASS is https://github.com/xiaodlb/watchnext/issues/40#issuecomment-6263933927. The completed baseline is 441fcaae660e273d6fc373f8757be562d9139b78. That earlier run is finished and does not authorize new graded implementation. Read `_docs/account-discovery-enhancement.md`, then refresh the selected issue through PM → Engineer → independent QA, one issue at a time. New authenticated groups supersede the first-release no-account restriction only within this enhancement; legacy groups stay separate with no claiming/migration. Preserve the user's running dev server and existing `next-env.d.ts` changes; use a separate owned checkout/build output for verification.

WatchNext is an academic web app that helps couples and friends choose something from their shared saved watchlist. The stack is Next.js, TypeScript and SQLite, served locally at configured `http://127.0.0.1:3000` by default. First-release feature implementation and verification are mapped in `_docs/completion-audit.md`; live issue QA/closure remains authoritative. Do not treat old task delivery boundaries as unimplemented features or reopen resolved delegated decisions.

- Product requirements: `_docs/plan.md`.
- Work process: `_docs/process.md`.
- Backlog index: `_docs/tasks.md`.
- Repository: https://github.com/xiaodlb/watchnext.
- Task descriptions and live task state: GitHub issues linked from the backlog index.

## Documents

- `_docs/specification.md` - consolidated current requirements and baseline limits.
- `_docs/graded-mvp.md` - planned graded stages and scoped QA workflow; not implemented architecture.
- `_docs/submission-matrix.md` - teacher-source mapped evidence checklist; planned/tested/user-confirmed are distinct.
- `_docs/mock-frontend.md` - implemented isolated #42 foundation/entry/state lifetime; domain follow-ups remain pending.
- `_docs/operation-inventory.md` - complete route/action/FR/NFR map and bounded #42 synthetic mock-service handoff.
- `_docs/design-references.md` - actually observed Lovable screenshots/access limits and baseline source priority.

- `_docs/account-discovery-enhancement.md` - authorized account/multi-group/autofill/preview requirements, explicit answers versus engineering defaults and preservation constraints.
- `_docs/enhancement-audit.md` - current twelve-answer/source/verification map; independent issue QA remains authoritative.

- `_docs/process.md` - how work is organized.
- `_docs/plan.md` - agreed product scope and unresolved decisions.
- `_docs/tasks.md` - links to the GitHub backlog issues.
- `_docs/database.md` - SQLite schema, migrations, validation boundaries, and isolated verification commands.
- _docs/prisma-baseline.md - #48 isolated Prisma mapping/baseline procedure and recovery boundary.
- _docs/prisma-constraint-inventory.md - native SQLite protections Prisma cannot express.
- _docs/repository-boundaries.md - #49–#51 portable repository/adaptor handoff.
- `_docs/prisma-identity.md` - #49 adapter selection, isolation guard, verification and limits.
- `_docs/local-setup.md` - actual install/init/dev/production operation and troubleshooting.
- `_docs/backup-restore.md` - explicit private WAL-safe snapshots and separate restore/deadline handling.
- `_docs/completion-audit.md` - dated requirement/backlog evidence and verification limits.
- `_docs/metadata-lifecycle.md` - trusted review/save, field origins, nullable metadata and refresh/expiry; read before touching metadata consumers.
- Before grooming an issue, read `_docs/team/pm.md` and `_docs/task-template.md`.
- Before implementing a groomed issue, read `_docs/team/software-engineer.md`.
- Before checking finished work against an issue, read `_docs/team/qa-engineer.md`.
- Before writing tests, read `_docs/testing-guidelines.md`.
- For anything touching the UI, read `_docs/design-system.md` when available.
- Before adding or changing API behavior, read `_docs/api.md` when available.

The design system, API guide and testing guidelines are available at `_docs/design-system.md`, `_docs/api.md` and `_docs/testing-guidelines.md`; follow them for relevant work. Keep these guides consistent with approved or delegated project decisions.

## Start each session

1. Read this file, `_docs/process.md`, `_docs/plan.md`, and `_docs/tasks.md`.
2. Inspect the working tree and recent commits before making changes. Preserve existing work.
3. Identify the task using the rules below, then read its full GitHub issue, relevant comments, and affected files.
4. State the issue number, intended outcome, and relevant verification briefly before implementation.

## Orchestration

The frontend-only authorization originally named #41/#42. #42 is now split into foundation #42 followed by #55–#61 within the same authorized scope; follow that explicit backlog order before #43. Each increment is independently groomed/implemented/QA-closed. #43 and later backend/ORM stages remain outside this frontend request. Do not treat the smaller foundation PASS as complete frontend delivery.

- The main session orchestrates issue work according to `_docs/process.md`; it delegates grooming, implementation, and verification to PM, Engineer, and QA subagents rather than doing those roles itself.
- For an authorized backlog run, select the next open issue in backlog order and launch the PM first, even if the issue was groomed previously. Pass the issue and relevant document links to each role.
- Launch the Engineer after PM grooming, then QA after implementation. If QA returns FAIL, send the QA comment to the Engineer and repeat implementation and verification.
- Close an issue only after QA posts PASS for the current implementation. An older verdict does not cover later changes. Historical/default issues use orchestrator closure; new graded `mvp`/`user-test-bug` issues use QA closure after its actual PASS. Engineer always leaves open. For genuine new user-test bugs, QA adds runnable regression cases after PM grooming and before Engineer repair; it never fixes product implementation.
- Continue to the next issue until the authorized backlog run is complete. Workflow documentation alone does not start a backlog run. The current run and suitable remaining product/dependency choices are explicitly authorized as recorded in `_docs/plan.md`; record reasoned delegated decisions before using them.

## Identify the intended task

- An issue number or URL in the user's request selects that task. A concrete request without an issue may be handled within its stated scope; find the matching backlog issue when one exists.
- For a request to continue existing work, use the current branch, uncommitted changes, recent commits, and issue status to identify the unfinished task. Do not assume that the lowest-numbered issue is the task already in progress.
- If the user explicitly asks to start the next backlog task, inspect open issues in backlog order and choose the earliest unfinished task whose prerequisites are ready. Check the repository for actual completion instead of relying only on issue state, and announce the selection.
- If the task remains ambiguous, ask one concise question rather than guessing which feature to build.
- Do not start application implementation merely because a session begins, this file is read, or an issue exists. A request to plan, discuss, or edit documentation remains limited to that work.
- The backlog begins with issue #1, setting up an empty project with a passing test. Verify its current state before treating it as the next task; do not use this sentence as permanent task status.
- If GitHub is unavailable, use the local index and repository evidence. Ask for the issue description when it is needed rather than inventing missing acceptance criteria.

## Keep work bounded

- Complete one selected issue at a time unless the user explicitly requests a broader scope.
- Each issue is designed for one focused session. Document unmet prerequisites and use fixtures or stubs when appropriate instead of silently implementing other issues.
- `_docs/plan.md` records agreed requirements. Record suitable resolutions of unresolved product decisions with rationale and the delegated-authority source before relying on them. Distinguish delegated choices from explicit user answers.
- Do not introduce mixed watch sessions, embedded playback, automatic progress tracking or public hosting without a scope change. Account signup is delivered under the later #31-#40 authorization; legacy profile claiming remains excluded.

## Product rules to preserve

- One shared title entry per group, with multiple contributors; any contributor may edit the shared metadata.
- Removing the last contribution archives the title. Saving it again restores the same entry, including personal history.
- Each member has independent progress, a 1–10 rating, and notes; ratings and notes are visible to the group.
- Account groups derive identity from the live hashed account session and active membership/context generation; only separate legacy groups use trusted name selection. Validate current access and target record ownership on every server request.
- Picks use selected viewers, mood, and full item duration; series use a typical episode duration. Saved timestamps do not reduce the duration used for matching.
- Rewatches are off by default. Follow the plan's episode eligibility rules and rank matching items longest-first within the available time.
- Ratings do not influence picks. Content opens through external links.
- Manual entry must remain usable when YouTube or Кинопоиск lookup is unavailable.

## Implementation and verification

- Use the selected stack and existing repository conventions. Propose missing libraries only when required by the selected task, document material choices, and follow the dependency authorization rule above before adding them.
- Keep SQLite access and provider credentials on the server. Never commit secrets, local databases, journals, or generated dependency folders.
- Use the commands defined in `package.json` and documented above; do not claim checks passed without running them.
- Run verification appropriate to the change and the issue's acceptance criteria. Isolate tests from normal user databases and mock external metadata providers where appropriate.
- Documentation-only changes require content, link, and diff checks rather than application tests.

## Git and handoff

- The user has authorized committing and pushing project changes to `xiaodlb/watchnext`; continue that workflow unless later instructions change it.
- Inspect the current branch and remote before committing. Stage only files belonging to the task and never overwrite unrelated work or force-push shared history.
- Reference the issue number in relevant commits without automatic closing keywords such as `Fixes`, `Closes`, or `Resolves`. Engineers leave issues open and post an implementation summary comment as required by `_docs/team/software-engineer.md`; completing implementation does not authorize closing the issue.
- Keep `_docs/tasks.md` as the issue index; do not duplicate live issue state or full task descriptions there.
- For a session handoff, report the issue number, completed work, verification results, commit/push state, and any remaining work. For partial work, make the unfinished scope explicit so the next session can identify what to continue.

## Communication

Keep updates short and use plain language. Ask one question at a time when user input is needed, and distinguish verified results from assumptions or proposed decisions.

- `_docs/http-ui.md` - explicit #47 HTTP-memory UI entry, typed adapter and request map.
