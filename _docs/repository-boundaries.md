# Repository boundaries for the Prisma iteration

The interfaces in `lib/repositories/contracts.ts` are intentionally portable. Domain services pass identities, group contexts and saved-title records; they never accept a Prisma client or SQLite connection. A SQLite adapter retains `BEGIN IMMEDIATE`, foreign-key/busy/secure-delete configuration, native-ledger checks and trigger-aware errors.

- **#49:** `lib/http-prisma/identity-store.ts` implements account/session/recovery, groups, account memberships, invitations and legacy context. The HTTP composition seam selects it only with trusted `WATCHNEXT_HTTP_REPOSITORY=prisma`, an explicit isolated-mode guard and a `file:` URL; see [prisma-identity.md](prisma-identity.md). It deliberately persists no library/history projection.
- **#50:** implement saved titles, contributors, progress/feedback/history, metadata provenance/reviews and picker-read projections.
- **#51:** choose and wire the complete Prisma-backed repository set into the actual HTTP application. It must preserve all authorization and service invariants and verify restart/backup behavior.

Neither #48 nor the contracts switch the running storage or use Prisma as a generic portability claim.
