# Issue #73 QA regression — Together Tonight visual shell

This records the pre-repair QA regression for the genuine 2026-10-26 user report and its repaired, inspectable screen evidence. It never accesses user storage. The retained images use only the test's synthetic account, group and title names; they contain no password, recovery code, invite link, session value or database file.

## Runnable check

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:visual-reference
```

To deliberately refresh the committed synthetic screen record after an intentional presentation change, run:

```sh
$env:WATCHNEXT_CAPTURE_73_EVIDENCE='1' # PowerShell
pnpm test:visual-reference
```

The ordinary command validates the committed image set instead of rewriting it. The capture mode is explicit because it writes the fourteen synthetic PNGs under [`../together-tonight-73/`](../together-tonight-73/).

The check creates an isolated SQLite database, starts production WatchNext, creates a real account and group, saves five manual film/series entries plus a YouTube entry, then verifies `/`, `/watchlist`, add/search controls, detail and `/pick` at 1280px and 375px. It never uses `/mock` or production/user data. Provider-autofill behavior remains covered by the dedicated metadata journeys; this regression isolates the reported screen-composition defect.

For the list composition it measures the live browser boxes, rather than trusting a class name: at 1280px it requires five card columns in a 1090px-or-wider centred grid with compact 200–230px cards; at 375px it requires two readable card columns. It also requires portrait 2:3 non-video covers, contributor avatars and a visible progress state on the card.

The browser records named captures for both 1280px and 375px: sign-in, watchlist, Add, provider-search results, film detail, picker inputs and picker result. The same real fixture checks the bounded working surfaces, 2:3/16:9 cover geometry, mobile compact utility disclosure and no horizontal overflow. The test parses every PNG header and requires its exact viewport width and a full-page height, rather than treating a byte count as visual evidence. The committed capture set is inspected alongside the pinned source reference; see [`../together-tonight-73/README.md`](../together-tonight-73/README.md).

## Pre-repair expected failure

At main `1e8c454`, the first strengthened desktop run builds a real isolated production app, persists all six titles, captures the 1280px grid, and then fails because a rendered film/series card has no visible `Not started`, `Next: …`, or `Watched` progress state. The source card composition communicates that status below type/runtime, so a multi-column grid alone is insufficient. The pre-existing final 375px assertion also fails because the real shell renders a visible `Other destinations` Group/Archive/Account strip in addition to its fixed Watchlist/Add/Pick bottom navigation. The Together Tonight reference uses only the compact primary bottom navigation. This is a source-derived screen-composition regression, not a pixel comparison.

## Repair gate

The check must pass after repair while retaining real authorised flows and: a centred account card; shared-list heading/Add action, All/Added by me controls and type chips; the checked five-column/2-column card composition; contributor and progress details; 2:3 film and 16:9 YouTube geometry at both widths; real bounded Add/search/detail/picker compositions at both widths; a real picker result; visible primary mobile actions; a reachable compact Group/Archive/Account disclosure; and no horizontal clipping or second utility strip at 375px.
