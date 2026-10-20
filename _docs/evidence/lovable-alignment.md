# Lovable alignment evidence — issue #63

## Reference and delivery boundary

- Reference source: `M:/webf2/WatchNextAgent/frontend-reference`, pinned at `1e4afe7edfeccc4b56dc56f192a0b8d9ca937edb`.
- Local delivery branch: `codex/lovable-alignment`; the implementation begins at `b47c12f` and the QA repair is recorded by the follow-up commit.
- The reference was used for presentation only. The local app retains its Next routes, real identity/group/data behavior, SQLite-facing implementation, provider safety checks and account recovery. No reference store, router, telemetry, fixture credentials, recovery code, or media assets were copied.

## Capture method

All local captures use the normal production-built Next application at an owned loopback origin. The protected states are created through the repository's existing isolated `prepareDemo` fixture and then reached through normal invite, group, profile and route actions. The data is synthetic and the fixture's database is outside the repository and normal user database; invite secrets are not saved in this repository or shown in images. Candidate lookup uses the repository's existing test-only provider transport, not a live provider or a copied reference store.

The screenshots use Chromium at the fixed 1280 × 900 and 375 × 812 viewports. Full-page capture is used for every state. The recorded source screenshots are in `_docs/references/lovable-2026-10-19/`; that source pack contains sign-in at both widths and post-login library/Add/picker at desktop only. It does **not** contain post-login mobile, search, or detail captures, so those states have inspected-source and local functional evidence rather than a fabricated claimed source pixel pair.

## Captured route/state pairs

| State | 1280 × 900 | 375 × 812 | How it was reached |
| --- | --- | --- | --- |
| Signed-out sign-in | `sign-in-desktop.png` | `sign-in-mobile.png` | Normal `/` entry, empty fields |
| Authorized library | `protected/library-desktop.png` | `protected/library-mobile.png` | Real fixture invite, selected Anna profile, `/watchlist` |
| Add form | `protected/add-desktop.png` | `protected/add-mobile.png` | Normal Add navigation |
| Candidate search | `protected/search-desktop.png` | `protected/search-mobile.png` | Real query/lookup and search-result route |
| Picker inputs | `protected/picker-input-desktop.png` | `protected/picker-input-mobile.png` | Normal picker with real fixture viewer/time/mood selection |
| Picker result | `protected/picker-result-desktop.png` | `protected/picker-result-mobile.png` | Normal picker result after Pick action |
| Title detail | `protected/detail-desktop.png` | `protected/detail-mobile.png` | Normal title detail route for fixture content |

## Sign-in comparison and tolerance

`sign-in-desktop-overlay.png` and `sign-in-mobile-overlay.png` overlay the pinned-source capture and local capture at 50% opacity. They were inspected together with the originals. The fixed geometry acceptance threshold is **2 CSS pixels** for the matched card region; it is set before the final comparison. The local card bounds come from Chromium's DOM layout inspection and source bounds from the recorded pinned reference screenshot:

| Viewport | Reference card (x, y, width, height) | Local card | Largest absolute difference | Result |
| --- | --- | --- | --- | --- |
| 1280 × 900 | 416, 300, 448, 390 | 416, 299.734, 448, 389.609 | 0.391px | Pass |
| 375 × 812 | 16, 268, 343, 393 | 16, 267.344, 343, 394 | 1px | Pass |

The card-boundary pixel tolerance is a maximum one-pixel edge displacement (under the required two-pixel geometry limit). A whole-page 1% content diff is deliberately not claimed: the real app has required account/recovery/discovery copy and the prototype has different static form copy and a Lovable badge. Those narrow dynamic text regions are visible in the overlay; no card, field, navigation, or layout region is masked. The visible geometry and color/focus treatment, rather than an invalid whole-page semantic diff, are the comparison evidence.

The mobile capture also verifies that signed-out pages do not show the signed-in fixed bottom navigation. Protected captures verify the desktop sticky navigation and the signed-in 375px bottom Watchlist/Add/Pick navigation without overlap.

## Functional and accessibility inspection

- `/watchlist` type chips filter only the already-authorized rendered list; the server query and picker preferences are unchanged.
- The fixture journey used actual group/profile route actions and real protected routes; Add/search, picker and title detail are not fabricated screenshots.
- At both target widths, the main controls remain visible, labelled and keyboard-focusable; the responsive views have no horizontal overflow and preserve the existing skip-link/focus styles.
- The actual visual differences are limited to truthful application content absent from the prototype: real account/recovery/discovery links, actual selected group/person/title text, and real safety/error/empty states. They are not presented as source-identical content.

## Verification

- `pnpm typecheck` — passed after the explicit local Next navigation declaration resolves the installed framework's declaration lookup.
- `pnpm build` — passed. The pre-existing Turbopack migration-filesystem tracing warning remains.
- `pnpm test` — passed: 106 files, 1091 tests. The isolated-fixture audit race repair is covered by the normal suite.

The visual evidence is implementation proof for independent QA, not a substitute for its verdict. No normal user server, data, credentials, or provider secret was changed.

