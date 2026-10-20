# Lovable alignment evidence — issue #63

## Reference and delivery boundary

- Reference source: `M:/webf2/WatchNextAgent/frontend-reference`, pinned at `1e4afe7edfeccc4b56dc56f192a0b8d9ca937edb`.
- Local delivery branch: `codex/lovable-alignment`; the implementation begins at `b47c12f` and the QA repair is recorded by the follow-up commit.
- The reference was used for presentation only. The local app retains its Next routes, real identity/group/data behavior, SQLite-facing implementation, provider safety checks and account recovery. No reference store, router, telemetry, fixture credentials, recovery code, or media assets were copied.

## Capture method

All local captures use the normal production-built Next application at an owned loopback origin. The refreshed library/Add captures were made with a disposable fixture: a synthetic group and profile were created through normal invite and group actions, then a manual title was saved through the normal Add form. The data is synthetic and the fixture database is outside the repository and normal user database; invite secrets are not saved in this repository or shown in images. Candidate lookup uses the repository's existing test-only provider transport, not a live provider or a copied reference store.

The screenshots use Chromium at the fixed 1280 × 900 and 375 × 812 viewports. Full-page capture is used for every state. The refreshed `protected/library-*` and `protected/add-*` images were checked after the final header/card changes; both widths had no horizontal overflow and a visible keyboard focus outline on the Add link. The recorded source screenshots are in `_docs/references/lovable-2026-10-19/`; that source pack contains sign-in at both widths and post-login library/Add/picker at desktop only. It does **not** contain post-login mobile, search, or detail captures, so those states have inspected-source and local functional evidence rather than a fabricated claimed source pixel pair.

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

## Visual review

The reference provides direction for a **Lovable-like appearance**, not a pixel-perfect reproduction. The source and local captures were reviewed at 1280 × 900 and 375 × 812 for the shared light palette, centred authentication surface, bounded forms, compact header, card grid, rounded controls and the signed-in mobile bottom navigation. The screenshot files listed above are retained as the review record.

The final review deliberately does not use overlays, pixel-difference percentages or CSS-pixel thresholds. WatchNext has real identity, group, recovery, access-error and provider-safe states that are absent from the prototype, so a numerical image-match claim would be misleading. The review instead checks that these real states use the same visual language and remain understandable.

The mobile capture verifies that signed-out pages do not show signed-in navigation. Protected captures verify that the primary Watchlist/Add/Pick routes fit above the bottom bar and that Group, Archive and Account stay reachable through the compact utility links.

## Functional and accessibility inspection

- `/watchlist` type chips filter only the already-authorized rendered list; the server query and picker preferences are unchanged.
- The desktop header gives Watchlist, Add and Pick for me the primary hierarchy, shows the actual active group/person when one is available, and keeps Group, Archive and Account as secondary destinations. On small screens the same secondary destinations appear in the utility row above the fixed primary navigation.
- The library uses the actual group name and current title total in its heading, with separate All / Added by me controls and the existing truthful card metadata, covers and contributors.
- The fixture journey used actual group/profile route actions and real protected routes; Add/search, picker and title detail are not fabricated screenshots.
- At both target widths, the main controls remain visible, labelled and keyboard-focusable; the responsive views have no horizontal overflow and preserve the existing skip-link/focus styles.
- The actual visual differences are limited to truthful application content absent from the prototype: real account/recovery/discovery links, actual selected group/person/title text, and real safety/error/empty states. They are not presented as source-identical content.

## Verification

- `pnpm typecheck` — passed after the explicit local Next navigation declaration resolves the installed framework's declaration lookup.
- `pnpm build` — passed. The pre-existing Turbopack migration-filesystem tracing warning remains.
- `pnpm test` — passed: 106 files, 1091 tests. The isolated-fixture audit race repair is covered by the normal suite.

The visual evidence is implementation proof for independent QA, not a substitute for its verdict. No normal user server, data, credentials, or provider secret was changed.
