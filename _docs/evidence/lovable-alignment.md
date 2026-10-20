# Lovable alignment evidence — issue #63

## Reference and scope

- Reference source: `M:/webf2/WatchNextAgent/frontend-reference`, commit `1e4afe7edfeccc4b56dc56f192a0b8d9ca937edb`.
- Local implementation: `codex/lovable-alignment` (commit recorded with the implementation).
- No reference store, router, error reporting, analytics, fixture account data, recovery code, or media files were copied. The local Next routes retain their real account, group, metadata, picker and SQLite-facing behavior.

## Recorded local captures

These captures use the normal Next app on an owned loopback development server and no entered credentials. The active normal database did not have a selected group, so protected `/watchlist` renders its honest access-error state rather than fabricated sample cards.

| Local route / state | 1280 × 900 | 375 × 812 | Result |
| --- | --- | --- | --- |
| `/` — signed-out, empty fields | `sign-in-desktop.png` | `sign-in-mobile.png` | The source light palette, centered 448px form, tabs, fields and primary action are present. The local security links and legacy-group discovery remain visible. |
| `/watchlist` — no current group | `watchlist-desktop.png` | `watchlist-mobile.png` | The real access error uses the shared shell and responsive navigation; it does not substitute source fixture titles. |

The source screenshots available before this issue are retained under `_docs/references/lovable-2026-10-19/`: `sign-in-desktop.png`, `sign-in-mobile.png`, `watchlist-desktop.png`, `add-desktop.png` and `picker-desktop.png`.

## Visual comparison notes

- Shared foundation values are derived from `src/styles.css` and `src/components/ui-kit.tsx` in the pinned source: system sans, pale blue-gray background, navy foreground, `#1d4ed8` primary, 8px controls, 16px surfaces, 1152px shell, 768px mobile switch, desktop sticky header and fixed mobile Watchlist/Add/Pick navigation.
- The local authentication form intentionally keeps real password/recovery semantics and hints. The reference prototype's arbitrary-password text and static recovery behavior are not copied.
- Library, Add/search, picker and detail views use the same shared tokens, cover fallback, responsive grids/columns and card controls. A real selected account/group or the documented owned demo is required to capture those protected routes without inventing data.
- The captures are reviewed UI evidence, not a claim of an unmasked pixel-perfect comparison: reference content, account state and available source screenshots differ. QA must independently inspect relevant protected-route evidence before an exact-match verdict.

## Verification

- `pnpm test tests/navigation.test.tsx tests/home.test.tsx tests/watchlist-view.test.tsx tests/detail-view.test.tsx` — passed (21 tests after the client-side type-filter test).
- `pnpm build` — passed. It retains the pre-existing Turbopack migration-filesystem tracing warning.
- `pnpm typecheck` could not run in this checkout because the generated Next type declarations resolve `next/navigation.js` without the framework exports and `next/cache` is missing. `pnpm build` completes Next's own TypeScript stage successfully.