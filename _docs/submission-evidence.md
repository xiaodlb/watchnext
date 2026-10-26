# Submission evidence index

This index gives a reviewer a short route through the WatchNext graded-MVP evidence. It deliberately reports pending human evidence rather than filling gaps with generated claims.

- [Specification](specification.md) — consolidated product behavior.
- [Process](process.md) and [team roles](team/) — PM, Engineer, QA and orchestrator workflow.
- [Backlog](tasks.md) — GitHub issue index.
- [Design references](design-references.md) — Lovable source and observed reference evidence.
- [OpenAPI contract](../openapi.yml) and [API guide](api.md) — service contract.
- [Database](database.md), [Prisma baseline](prisma-baseline.md), [repository boundaries](repository-boundaries.md), [backup/restore](backup-restore.md) — persistence and recovery.
- [Testing guidelines](testing-guidelines.md), [iteration log](iteration-log.md), [submission matrix](submission-matrix.md) — verification trail.
- [Brainstorming evidence](brainstorming-evidence.md) — authentic available excerpts and explicit source gap.
- [Manual test checklist](manual-testing.md) and [user-test bug template](user-test-bug-template.md) — pending real human-test stage.

At this revision, automated architecture work through #51 is QA-closed. #53 requires real human observations; #54 cannot be closed until those observations and final evidence verification are complete. #52 PostgreSQL portability is post-MVP and has not been claimed as executed without a local Docker/PostgreSQL engine.