# HTTP contract — issue #43

`openapi.yml` is the root OpenAPI 3.1.1 contract for the future `/v1` HTTP API. It maps all 40 inventory IDs, including the two operation pairs represented by separate HTTP methods. M06 is explicitly internal metadata lifecycle behavior, so it has no endpoint. U01–U06 stay browser interactions and do not become fake server endpoints.

The contract keeps the accepted mock DTO vocabulary where it represents product data: account/group context, title draft and read models, provider pages/reviews, personal records and picker outcomes. The future HTTP adapter uses the inventory map in `frontend/service/http-contract.ts`; it must not change the mock service or introduce a parallel product.

Identity is always derived from the live account or legacy session and the current server membership. `expectedContextRevision`, title revisions, group generations, profile/title IDs and opaque handles are stale-intent claims only. Every mutation requires its declared method, JSON body and configured same-origin check. Account and legacy cookies are distinct; sensitive authenticated responses are private/no-store, while recovery and invite disclosures are also no-referrer and once-only.

Opaque invitation, confirmation, provider page/review and picker handles bind to their context and purpose. Pending invites last 600 seconds. Provider pages/reviews last ten minutes and allow five page visits per chain. A cancelled browser request only discards the response locally: after a server commit it cannot promise rollback, so retries use the documented handle or logical intent ID.

Run `node scripts/verify-openapi.mjs` to validate the JSON-compatible YAML syntax, schema references, unique operation IDs, complete inventory mapping, cookie/security semantics and synthetic request/response examples. `pnpm test tests/openapi-contract.test.ts` runs the same validation under Vitest. The examples use `example.test` and synthetic identifiers only; no real credential, invitation, provider key or user data is present.
