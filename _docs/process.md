- Tasks are GitHub issues, one at a time
- Read the acceptance criteria before starting and before closing
- Commit regularly

Planning-only requests stop after PM documents and issues. Creating a groomed issue does not start the Engineer/QA lifecycle. After that phase, the user explicitly authorized the October 18 enhancement (#31–#40): “выполни оставшиеся ишшюс на гитхабе” (implement the remaining GitHub issues). Refresh PM grooming and implement sequentially through the lifecycle below; closure requires fresh independent QA PASS. This supersedes the earlier planning pause, not the feature boundaries. See `_docs/account-discovery-enhancement.md`.

## New graded iteration: planning boundary and scoped workflow

The initial first step authorized graded plan/specification/issues/workflow documents only. The later user frontend request and Lovable reference authorize #41 then #42 through prerequisite PM/Engineer/QA; later contract/backend/ORM stages are not authorized by that request. [Graded MVP](graded-mvp.md) describes issues #41–#54; do not start other stages merely because they exist. Original #1–#40 are closed after final independent QA at baseline `441fcaae660e273d6fc373f8757be562d9139b78`, preserved by `graded-baseline-2026-10-19`.

For new issues labeled `mvp` or `user-test-bug`, the teacher workflow supersedes the older closure rule below: PM grooms; for genuine reported bugs QA adds runnable regression cases before Engineer repair; Engineer implements/tests/comments and leaves open; QA independently posts criterion-by-criterion PASS/FAIL and **QA closes only after actual PASS**. On FAIL return to Engineer. QA may change regression tests during bug grooming, never product implementation. Orchestrator coordinates, not closes these new issues. Historical closure of #1–#40 is not rewritten. Human hands-on testing must be real; [bug template](user-test-bug-template.md), [manual checklist](manual-testing.md) and [iteration log](iteration-log.md) retain actual evidence. Optional ideas are `post-mvp`.

## Roles (all work)

- PM - grooms a task before anyone implements it, follows _docs/team/pm.md
- Engineer - implements one groomed task, follows _docs/team/software-engineer.md
- QA - checks the result against the acceptance criteria, follows _docs/team/qa-engineer.md

## Orchestrator

The main session is the orchestrator. It launches the PM, the engineer
and QA as subagents. It does not groom, implement or test itself.

## Lifecycle

1. Pick the next open issue from the backlog
2. PM grooms it
3. Engineer implements it
4. QA verifies it
5. On FAIL, back to step 3 with the QA comment as input
6. On PASS, close the issue
7. Repeat until the backlog is empty

## Rules

- Do not skip step 2
- The engineer does not close the issue
- QA does not fix product code; for new graded user-test bugs it adds regression tests during grooming, then independently verifies.
- Historical/default non-graded work uses orchestrator closure after QA PASS. New `mvp`/`user-test-bug` issues use QA closure after its actual PASS, as scoped above.
