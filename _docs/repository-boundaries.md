# Repository boundaries for the Prisma iteration

The interfaces in `lib/repositories/contracts.ts` are intentionally portable. Domain services pass identities, group contexts and saved-title records; they never accept a Prisma client or SQLite connection. Each Prisma adapter owns its interactive transaction, applies SQLite foreign-key/busy/secure-delete connection safeguards, and leaves native-ledger checks and trigger-aware errors authoritative.

- **#49:** `lib/http-prisma/identity-store.ts` implements account/session/recovery, groups, account memberships, invitations and legacy context. The HTTP composition seam selects it only with trusted `WATCHNEXT_HTTP_REPOSITORY=prisma`, an explicit isolated-mode guard and a `file:` URL; see [prisma-identity.md](prisma-identity.md). It deliberately persists no library/history projection.
- **#50:** `lib/http-prisma/library-store.ts` persists saved titles, contributors, progress/feedback/history, metadata provenance/reviews and guarded picker-read projections. Its optional trusted context projection is rechecked against #49's live account membership/session revision inside each operation; #51 supplies that projection at the real HTTP composition point.
- **#51:** choose and wire the complete Prisma-backed repository set into the actual HTTP application. It must preserve all authorization and service invariants and verify restart/backup behavior.

Neither #48 nor the contracts switch the running storage or use Prisma as a generic portability claim. #49's direct identity/group repository remains the #50 prerequisite; #51 alone switches the normal application to the complete Prisma repository set.
