# Repository boundaries for the Prisma iteration

The interfaces in `lib/repositories/contracts.ts` are intentionally portable. Domain services pass identities, group contexts and saved-title records; they never accept a Prisma client or SQLite connection. A SQLite adapter retains `BEGIN IMMEDIATE`, foreign-key/busy/secure-delete configuration, native-ledger checks and trigger-aware errors.

- **#49:** implement account/session/recovery, groups, account memberships, invitations and legacy-context repositories against these identity/group boundaries.
- **#50:** implement saved titles, contributors, progress/feedback/history, metadata provenance/reviews and picker-read projections.
- **#51:** choose and wire the complete Prisma-backed repository set into the actual HTTP application. It must preserve all authorization and service invariants and verify restart/backup behavior.

Neither #48 nor the contracts switch the running storage or use Prisma as a generic portability claim.