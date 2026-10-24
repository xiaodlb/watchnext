# HTTP-memory frontend workspace

Issue #47 adds the explicit [`/http`](/http) entry. It is separate from `/mock` and from the normal SQLite-backed pages. The browser adapter in `frontend/service/http-service.ts` only calls same-origin `/v1` endpoints with `credentials: "same-origin"`; it has no configurable origin, actor ID, mock scenario, reset value, local write store, or database import path.

Start this isolated phase with `WATCHNEXT_HTTP_MEMORY=1`, then open `/http`. The banner states the actual lifetime: server process memory survives a reload in that process and disappears when the owned server restarts. `/mock` remains the synthetic phase-one demonstration.

## Request map

| Inventory area | Client service | HTTP route family |
| --- | --- | --- |
| A01–A05 | `accounts`, `context` | `auth/*`, `context` |
| G01–G08, L01–L04 | `groups` | `groups*`, `legacy/groups*`, `invitations/resolve`, `context/*` |
| W01–W08 | `library` | `library`, `library/archive`, `library/{id}*` |
| M01–M05 | `entry` | `metadata/*`, `library/{id}/metadata/refresh` |
| P01–P05 | `progress`, `feedback` | `library/{id}/progress/*`, `rating`, `note` |
| K01–K04 | `picker` | `picker/*` |

The adapter converts form-only minute/second, timestamp, rating and picker text to declared numeric DTO fields before sending requests. It retains form state in the mounted views on validation, conflict, malformed-response, or network failure. An aborted request ignores its late response locally; it does not claim to undo a committed server mutation.

## Verification

- `pnpm test tests/frontend/http-service.test.ts` checks fixed same-origin paths, cookie credentials, stale revision serialization, numeric picker serialization, and no mock fallback.
- `pnpm typecheck` and `pnpm build` check the shared UI and production bundle.
- `pnpm test:mock` continues to exercise the explicitly selectable synthetic mode without a database.
- `pnpm test:e2e` remains the production browser regression suite for the existing normal product. The isolated real-memory HTTP route is exercised through the #44–#46 transport journey; a fuller visible all-operation browser matrix remains a QA focus for this issue.
