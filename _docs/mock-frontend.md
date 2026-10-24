# Isolated mock frontend foundation — issue #42

This page documents the **complete synthetic mock frontend phase**: the #42 foundation, the #55–#60 domain increments and the #61 integration and evidence. `/mock` exercises one typed asynchronous service with deterministic Ready/Slow/Unavailable outcomes, and it always labels itself **Synthetic demo only / not real authentication**. Independent QA accepted #55 at `269abbc`, #56 at `391d312`, #57 at `1a95c60`, #58 at `89deec3`, #59 at `033c656` and #60 at `b6132ad`. The #61 integration ([evidence](mock-integration.md)) is Engineer-implemented and tested; its independent QA is pending. Existing production routes remain the normal default; their business operations are unchanged. "Tested" here means automated checks; no human hands-on test has happened yet (that is #53).

## Open the preview

Use the existing Node24/pnpm11.25 setup and the committed frozen dependencies. Work in your own checkout/output; do not restart someone else's running server. No new package, service, provider key or `db:init` is needed for this preview.

For a manual isolated local session in PowerShell, choose an unused port and a new owned folder:

```powershell
pnpm install --frozen-lockfile
$previewDir = Join-Path ([IO.Path]::GetTempPath()) ('watchnext-preview-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $previewDir | Out-Null
$env:WATCHNEXT_DATABASE_PATH = Join-Path $previewDir 'unused.sqlite'
$env:WATCHNEXT_APP_ORIGIN = 'http://127.0.0.1:3100'
$env:YOUTUBE_API_KEY = ''
$env:KINOPOISK_UNOFFICIAL_API_KEY = ''
pnpm dev --port 3100
```

The same in a POSIX shell (bash, zsh); #61 actually ran this block once with `pnpm dev` and once with `pnpm build && pnpm start` ([results](mock-integration.md#launch-and-isolation-evidence)):

```sh
pnpm install --frozen-lockfile
previewDir="$(mktemp -d)"
export WATCHNEXT_DATABASE_PATH="$previewDir/unused.sqlite"
export WATCHNEXT_APP_ORIGIN="http://127.0.0.1:3100"
export YOUTUBE_API_KEY="" KINOPOISK_UNOFFICIAL_API_KEY=""
pnpm dev --port 3100            # or: pnpm build && pnpm start --port 3100
```

Open **http://127.0.0.1:3100/mock**. Stop only this server with Ctrl+C when finished. Do **not** initialize that unused database. With the pinned Next.js 16.4.1, `pnpm dev` appends a generated "nextjs-agent-rules" block to `AGENTS.md` and rewrites `next-env.d.ts`; those are framework-generated changes, so discard them rather than committing them (and keep any `next-env.d.ts` change the user already had). To use the existing supported production launcher instead, stop dev, keep the same environment, run `pnpm build`, then `pnpm start --port 3100`, and open the same URL. The owned browser check below actually builds/serves the production entry with the existing privacy preload; dev is the existing supported development launcher, not a new mode script. Normal `/` still presents the actual account/legacy entry. Exit demo deliberately returns there; it does not turn that page into mock data.

The path is the explicit selector: there is **no global mode environment variable** and no production query switch. `/mock?mode=mock&scenario=slow` is a valid synthetic entry; default scenario is Ready. On this path, any mode except absent/exact mock, or any scenario except absent/ready/slow/unavailable (including repeated selectors), shows a safe unsupported-selection error and no working preview controls. `/mock?mode=http` cannot enable a future HTTP adapter. Arbitrary member/group/query claims are not consumed as authority. `/?mode=mock` and `/watchlist?mode=mock` keep their existing production behavior; failures never fall back to demo data.

## Actual state and lifetime

1. Press **Load preview**: context appears only after the service completes, showing Synthetic workspace, its current synthetic account (or anonymous), no group and its revision.
2. Choose **Slow** to observe pending state and **Cancel request**. Choose **Unavailable** for an announced retryable error, then Ready and Load to retry. Failed/canceled reads keep the last displayed successful context.
3. **Reset demo** aborts a superseded UI request, restores this service instance's seeds (accounts, groups, library, personal records, picker cycles and the synthetic metadata clock) with their original IDs, clears private disclosures and advances the context revision, so any identity captured before Reset gets `stale`. It does not reset the application, a database, the separate seeded academic demo or another preview tab. Canceling before reset commits leaves that revision unchanged.
4. A new tab/reload creates a new service instance at revision 0. No cookies, localStorage, sessionStorage, filesystem storage or backend persistence is used. State belongs to the mounted preview; browser history/bfcache may restore a live in-memory document, so use Reset or reload for an explicit fresh context. No durable cross-navigation/session guarantee is claimed.

Ready waits 80ms, Slow 1200ms, Unavailable 300ms; callers cannot supply arbitrary delays or indefinite pending. Abort removes the timer/listener. Reset requires the captured instance/revision; two competing resets have one success, stale reads/results after a reset are rejected. These identities are synthetic coordination tags, **not authentication credentials**. Real security remains in the existing application and future server stages.

## Typed boundary and isolation

- `frontend/service/contracts.ts`: concrete context identity, discriminated success/failure/field/stale/cancel results, request signal/scenario and checked demo selection. Success is parameterized by an actual value type, not an untyped generic acknowledgement.
- `frontend/mock/service.ts`: per-instance `FrontendService.context.read/reset`; no native/server/database/auth/provider imports, environment reads, cookies, persistence or fetch. It implements every namespace: context, accounts, groups/legacy, library, entry/metadata, progress, feedback and picker (all 40 domain rows; see the [coverage matrix](mock-integration.md#coverage-matrix)).
- `app/mock/page.tsx` and `preview.tsx`: explicit entry, input-selection errors, persistent notice, real pending/error/cancel/reset/readback and focused feedback. `preview.module.css` reuses existing light tokens/controls and narrow layouts; no claim of complete Lovable UI parity.
- `Navigation` switches only on the explicit mock path. Its mock links do not prefetch production screens/actions; Exit uses deliberate navigation. Normal links/destinations remain unchanged outside that path.

Do not enter real credentials or use normal/provider data. Domain follow-ups must continue the [synthetic policy](operation-inventory.md), not reinterpret this foundation as server authorization. There is no HTTP/OpenAPI/ORM implementation here.

## Domain handoff - all domains accepted, integration under #61

The [implemented #55 account handoff](mock-accounts.md) documents exact validation, once-only recovery, navigation lifetime and bounded evidence. It is independently QA-closed at `269abbc`.

The [#56 group/owner/invitation/legacy handoff](mock-groups.md) documents the accepted domain and its generation/lifetime checks; independent QA closed it at `391d312`. The [#57 library handoff](mock-library.md) is independently QA-closed at `1a95c60`. The [#58 manual/provider entry handoff](mock-entry.md) documents the implemented Add, review/shared-save and metadata lifecycle increment; independent QA passed at `89deec3`. The [#59 personal progress/feedback handoff](mock-personal.md) documents the implemented P01–P05 increment; independent QA passed at `033c656`. The [#60 picker/Pick again handoff](mock-picker.md) documents the implemented K01–K04 increment; independent QA passed at `b6132ad`. The [#61 integration and evidence page](mock-integration.md) holds the completed coverage matrix, launch and isolation results and the committed synthetic screenshots; the typed contract for #43 is in [frontend contract handoff](frontend-contract-handoff.md). #61 independent QA is pending.

| Owner | Inventory coverage |
| --- | --- |
| #55 (QA accepted) | Accounts/recovery A01–A05 |
| #56 (QA accepted) | Account groups/owner G01–G08 and legacy L01–L04 |
| #57 (QA accepted) | Saved library/Mine/detail/edit/archive W01–W03/W06–W08 |
| #58 (QA PASS at `89deec3`) | Manual/provider Add and lifecycle W04–W05/M01–M06 |
| #59 (QA PASS at `033c656`) | Personal progress/completion/feedback P01–P05 |
| #60 (QA PASS at `b6132ad`) | Picker/cycle K01–K04 |
| #61 (Engineer-tested, QA pending) | All 40 domain operations/six U groups integrated and complete phase evidence; [integration evidence](mock-integration.md), [#43 handoff](frontend-contract-handoff.md) |

[The full inventory](operation-inventory.md), [observed references](design-references.md) and [graded plan](graded-mvp.md) remain authoritative. A #42 PASS is not full frontend completion; #43 waits for all follow-ups/final integration. Backend/ORM issues remain outside frontend authorization.

## Verification commands and limits

```sh
pnpm test tests/frontend
pnpm test
pnpm typecheck
pnpm exec playwright install chromium
pnpm test:mock
```

`test:mock` **builds current selected source**, then starts its own privacy-protected production server with a deliberately absent configured database, empty provider keys and isolated home/default paths. Pinned Chromium uses 375px / 1280px contexts to exercise real service state, pending/failure/retry/cancel/reset/reload/two-tab isolation, invalid/repeated selectors, keyboard/overflow and unchanged production/query routes. Mock requests are restricted to its entry/framework assets; no production action/API/external request is permitted. Neighboring synthetic normal/demo/file sentinels remain byte-identical. No database is initialized or imported by the harness. Its own server/browser/temp files are cleaned after success/failure; it never kills by name or touches a user's normal server.

Focused tests also prove stale/reset races, abort cleanup, typed selectors and a recursively checked client-safe import closure. The ordinary suite retains native crypto/default timeouts and full discovery. Existing build tracing warning is unchanged. No full-domain/real-auth/mock-phase-completion or genuine user-test claim is made; #61 owns the complete frontend walkthrough. Runtime/results are recorded in the Engineer issue handoff and independently checked by QA.

Engineer verification: 13 focused foundation tests pass; ordinary suite passes **90 files / 971 tests**, unchanged security cost/timeouts/discovery; typecheck passes. `pnpm test:mock` current-source production build and both-width smoke pass, including owned cleanup and unchanged sentinels. Synthetic-only screenshots at 375px / 1280px were inspected for layout/focus/warning and deleted with the fixture. An initial smoke expected an auth-error view despite deliberately missing production DB; it was corrected to compare the existing load-error view against the same forged-query route, without changing production code. These are Engineer results, not independent QA PASS. Verification used owned M-drive temp/cache/browser paths because C storage was constrained; the runner itself has no machine-specific path.

The account extension adds real synthetic registration/sign-in/sign-out/recovery/context forms to the same service instance; see [account implementation](mock-accounts.md). Foundation-only verification numbers above are historical #42 evidence, not the new total. `test:mock` now additionally runs the full account journey at both widths while preserving every foundation isolation/sentinel assertion.

The [group/legacy implementation](mock-groups.md) extends the same typed service with G01-G08/L01-L04 and group U02/U03/U06 interactions. `test:mock` now runs creator removal/rotation/rejoin, anonymous account continuation and separate legacy create/resolve/profile at both widths, preserving foundation/account isolation checks. Earlier issue-specific counts are historical evidence.

The [implemented saved library](mock-library.md) adds W01-W03/W06-W08 and readonly M06, with actual All/Mine/archive/detail/edit/remove-own/restore and local synthetic art. Add/provider and metadata lifecycle are implemented under [#58](mock-entry.md); older issue-specific counts describe their historical verification.

The [personal increment](mock-personal.md) adds P01–P05 and personal U06 to the same service and library detail: own episode/watch progress, completion, rating and note panels and a group-visible attributed history. `test:mock` now also runs `mock-personal-journey.mjs` at both widths.

The [picker increment](mock-picker.md) adds K01–K04 and the picker parts of U03/U05/U06: a **Pick for me** region over the same service that calls the unchanged baseline ranking, with Pick again cycles, refresh notices and suggestion-only no-match actions. No domain is listed as not available any more; `test:mock` also runs `mock-picker-journey.mjs` at both widths.

The [#61 integration](mock-integration.md) adds `tests/frontend/integration.test.ts` (connected 12-step journey, stable IDs, cross-domain stale/cancel, M06 in the gate, Reset and the per-method Slow+abort/Unavailable/stale sweep), `tests/frontend/coverage.test.ts` (the matrix checked against the inventory, the live service and the test files) and `mock-integration-journey.mjs`, which `test:mock` runs once at each width, plus eleven forged-query production route probes and whole-run cookie/`Set-Cookie`/request checks. `WATCHNEXT_MOCK_EVIDENCE_DIR=<absolute new folder outside the repository>` makes `test:mock` also save the seven evidence screens at both widths there and print the folder; without it nothing is captured. The committed synthetic set is `_docs/evidence/mock-frontend/` ([table](mock-integration.md#screenshot-evidence-table)). The fixture credentials (`Demo.Owner` / `Demo.Viewer` / `synthetic password`) are a synthetic demo, not security evidence.
