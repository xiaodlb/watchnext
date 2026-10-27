# Together Tonight comparison evidence — issue #73

These are production screenshots from WatchNext's isolated browser fixture at
commit `2c723df` plus the card-layout correction in this evidence update. The
fixture creates a disposable SQLite database, a synthetic account named
`VisualRegressionUser`, a group and six synthetic titles. It does not use the
normal local database or a live metadata service.

## Reproduce

From the repository root with Chromium installed:

```powershell
$env:WATCHNEXT_CAPTURE_73_EVIDENCE='1'
pnpm test:visual-reference
```

The command production-builds the current branch and overwrites only this
documented synthetic capture set. Its normal form, `pnpm test:visual-reference`,
checks the current interface and verifies that every committed PNG is an image
at its stated viewport width; it does not overwrite evidence.

## Source and comparison boundary

The visual source is the pinned public Together Tonight checkout at
`M:/webf2/WatchNextAgent/frontend-reference`, commit
[`1e4afe7`](https://github.com/xiaodlb/together-tonight-watchlist/tree/1e4afe7edfeccc4b56dc56f192a0b8d9ca937edb).
The original observed images are retained in
[`../../references/lovable-2026-10-19/`](../../references/lovable-2026-10-19/).

This is a composition review, not a claim of pixel identity. WatchNext keeps
real account, group, provider-safety, archive and progress behavior that does
not exist in the prototype. Screens without a captured prototype counterpart
are compared against its inspected route and style source; they are clearly
marked below.

| Screen | WatchNext 1280px | WatchNext 375px | Reference basis | Reviewed composition |
| --- | --- | --- | --- | --- |
| Sign in | [image](sign-in-1280.png) | [image](sign-in-375.png) | [desktop](../../references/lovable-2026-10-19/sign-in-desktop.png), [mobile](../../references/lovable-2026-10-19/sign-in-mobile.png), `src/routes/index.tsx` | Centred bounded white account surface, pale canvas, explicit fields and full-width blue action. |
| Shared watchlist | [image](watchlist-1280.png) | [image](watchlist-375.png) | [desktop](../../references/lovable-2026-10-19/watchlist-desktop.png), `src/routes/watchlist.tsx` | Five desktop / two mobile cover-card columns, group heading, Add action, All/Mine control, chips, progress and contributor avatar/name hierarchy. No source mobile capture was available. |
| Add title | [image](add-1280.png) | [image](add-375.png) | [desktop](../../references/lovable-2026-10-19/add-desktop.png), `src/routes/add.tsx` | Narrow grouped working column, clear controls and one primary save path. Mobile comes from route/style-source review because the reference has no mobile capture. |
| Provider search | [image](search-1280.png) | [image](search-375.png) | `src/routes/search.tsx`, `src/styles.css` | Bounded search/review cards and preserved real provider-safe outcome handling. No public captured reference screen was available. |
| Title detail | [image](detail-1280.png) | [image](detail-375.png) | `src/routes/title.$id.tsx`, `src/styles.css` | Cover-led desktop detail and stacked mobile detail; 2:3 film media and separately tested 16:9 YouTube media. No public captured reference screen was available. |
| Picker, inputs | [image](picker-input-1280.png) | [image](picker-input-375.png) | [desktop](../../references/lovable-2026-10-19/picker-desktop.png), `src/routes/pick.tsx` | Bounded selection surface, viewer controls and a clear blue action. |
| Picker, result | [image](picker-result-1280.png) | [image](picker-result-375.png) | `src/routes/pick.tsx`, `src/styles.css` | Result card follows the same bounded surface; the public prototype capture did not include a result state. |

## Automated checks tied to this record

`tests/fixtures/together-tonight-regression.mjs` drives the real production
application through these states. It verifies exact 1280px/375px PNG geometry,
screen state, five/two-column layout, cover ratios, visible progress and
contributors, compact mobile More access for Group/Archive/Account, no legacy
utility strip, and no horizontal overflow. It intentionally uses no mock route
and deletes its owned database/server after each run.
