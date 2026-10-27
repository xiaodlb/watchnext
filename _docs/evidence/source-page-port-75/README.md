# Source page port evidence — issue #75

These screenshots come from a production build with a disposable SQLite database,
a real signed-in account, an authorised group, and six synthetic saved titles.
The browser fixture uses the pinned Together Tonight source at
[`1e4afe7`](https://github.com/xiaodlb/together-tonight-watchlist/tree/1e4afe7edfeccc4b56dc56f192a0b8d9ca937edb)
as the page-composition reference. It does not inject mock WatchNext data or
metadata responses into the application. Search fixture responses only stand in
for the external provider.

| Page | Desktop 1280px | Mobile 375px | Source route |
| --- | --- | --- | --- |
| Account entry | [image](sign-in-1280.png) | [image](sign-in-375.png) | `index.tsx` |
| Account creation | [image](register-1280.png) | [image](register-375.png) | `index.tsx` |
| Shared list | [image](watchlist-1280.png) | [image](watchlist-375.png) | `watchlist.tsx` |
| Add | [image](add-1280.png) | [image](add-375.png) | `add.tsx` |
| Search results | [image](search-1280.png) | [image](search-375.png) | `search.tsx` |
| Title detail | [image](detail-1280.png) | [image](detail-375.png) | `title.$id.tsx` |
| Picker inputs | [image](picker-input-1280.png) | [image](picker-input-375.png) | `pick.tsx` |
| Picker result | [image](picker-result-1280.png) | [image](picker-result-375.png) | `pick.tsx` |

## Comparison against the pinned source

The source screenshot pack is [`../../references/lovable-2026-10-19/`](../../references/lovable-2026-10-19/). It includes desktop sign-in, watchlist, Add and picker, and mobile sign-in. There are no source screenshots of registration, search results, detail, picker result, or the signed-in mobile views; those comparisons use the pinned route JSX and `src/styles.css`, not a claimed screenshot match. The local captures show synthetic data only; the account creation images were taken with all fields empty, before any recovery code appeared.

| State | Source comparison and observed result |
| --- | --- |
| Sign-in | Compared to `sign-in-desktop.png` and `sign-in-mobile.png`: centered WatchNext brand and tagline, tabbed white account card and stacked input controls. WatchNext has real account/recovery links and explanatory text. |
| Registration | No source capture: compared both local widths to the registration branch of `index.tsx`. The same centered two-tab card contains stacked username/password controls; WatchNext adds password confirmation for its real account flow. |
| Shell and watchlist | Desktop compared to `watchlist-desktop.png`; mobile compared to `ui-kit.tsx` and `watchlist.tsx`. Logo, contextual pill, three primary destinations, heading, filter controls and cover-led five/two-column grid are present. WatchNext adds a More menu for real group, archive and account actions, and uses actual names and progress. |
| Add | Desktop compared to `add-desktop.png`; mobile compared to `add.tsx`. A bounded column contains separate compact search and manual cards, four type tiles, duration/genre fields, mood chips and save action. WatchNext adds provider choices, validation and episode-specific fields. |
| Search | No source capture: compared to `search.tsx` at both widths. Back link, query heading and form, provider chips, count and preview cards are present. The source uses a prototype combined catalog; WatchNext uses one real provider at a time and labels automatic selection “Auto source” rather than claiming combined results. |
| Detail | No source capture: compared to `title.$id.tsx`. Cover, metadata and title appear side by side on desktop and stack on mobile, followed by progress, rating, notes and group feedback. WatchNext retains extra real metadata and separate save actions, so this view is taller. |
| Picker input and result | Input desktop compared to `picker-desktop.png`; result and mobile compared to `pick.tsx`. Both use a bounded surface with viewer, time and mood chips and a full-width action; the result is a cover-led card. WatchNext shows actual viewer/eligibility guidance and safe pick-cycle feedback. |

These are composition comparisons, not pixel measurements. The screenshot set does not establish live provider availability or human testing.

## Reproduce

```powershell
$env:WATCHNEXT_CAPTURE_75_EVIDENCE='1'
pnpm test:visual-reference
```

The standard `pnpm test:visual-reference` checks page geometry, expected
controls and committed screenshot dimensions without overwriting these files.
The source is a prototype; WatchNext preserves its account, group, provider,
SQLite, and personal-progress behavior. This is a page-composition comparison,
not a pixel-identity claim.
