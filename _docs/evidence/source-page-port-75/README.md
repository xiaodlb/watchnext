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
| Shared list | [image](watchlist-1280.png) | [image](watchlist-375.png) | `watchlist.tsx` |
| Add | [image](add-1280.png) | [image](add-375.png) | `add.tsx` |
| Search results | [image](search-1280.png) | [image](search-375.png) | `search.tsx` |
| Title detail | [image](detail-1280.png) | [image](detail-375.png) | `title.$id.tsx` |
| Picker inputs | [image](picker-input-1280.png) | [image](picker-input-375.png) | `pick.tsx` |
| Picker result | [image](picker-result-1280.png) | [image](picker-result-375.png) | `pick.tsx` |

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
