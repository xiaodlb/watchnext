# Issue #73 QA regression — Together Tonight visual shell

This records the pre-repair QA regression for the genuine 2026-10-26 user report. It uses no screenshots or user storage.

## Runnable check

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:visual-reference
```

The check creates an isolated SQLite database, starts production WatchNext, creates a real account and group, saves a manual portrait film and YouTube entry, then verifies `/`, `/watchlist`, add/search controls, detail and `/pick` at 1280px and 375px. It never uses `/mock` or production/user data. Provider-autofill behavior remains covered by the dedicated metadata journeys; this regression isolates the reported screen-shell defect.

## Pre-repair expected failure

At main `1e8c454`, the final 375px assertion is expected to fail: the real WatchNext shell renders the visible `Other destinations` Group/Archive/Account strip in addition to its fixed Watchlist/Add/Pick bottom navigation. The Together Tonight reference uses only the compact primary bottom navigation. This is a source-derived screen-shell regression, not a pixel comparison.

## Repair gate

The check must pass after repair while retaining real authorised flows and: a centred account card; shared-list heading/Add action, All/Added by me controls and type chips; 2:3 film and 16:9 YouTube geometry at both widths; a real picker; visible primary mobile actions; and no horizontal clipping or second utility strip at 375px.
