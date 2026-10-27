# Together Tonight visual reference

WatchNext's local interface adapts the page structure of the public Together Tonight Watchlist project.
The source was supplied by the project owner
and inspected from the read-only local checkout at
`M:/webf2/WatchNextAgent/frontend-reference`, commit
[`1e4afe7`](https://github.com/xiaodlb/together-tonight-watchlist/tree/1e4afe7edfeccc4b56dc56f192a0b8d9ca937edb).

## What is adapted

| Together Tonight source | WatchNext presentation |
| --- | --- |
| `src/styles.css` | pale canvas, navy text, white rounded surfaces, blue primary actions, muted controls and responsive spacing in `app/styles.css` |
| `src/components/ui-kit.tsx` | compact WatchNext brand/header, card/cover/avatar vocabulary and desktop/mobile navigation in `app/layout.tsx` and `app/components/navigation.tsx` |
| `src/routes/index.tsx` | centred account-entry card and account-choice tabs on `/`, `/register` and recovery routes |
| `src/routes/watchlist.tsx` | shared-list heading, Add action, All/Added by me control, content-type chips, responsive cover grid and contributor treatment on `/watchlist` |
| `src/routes/add.tsx` and `src/routes/search.tsx` | separate compact search and manual-entry cards, four type tiles, and a wide search-results composition with query input, source chips and preview cards on `/watchlist/add` |
| `src/routes/title.$id.tsx` | cover-led title detail on `/watchlist/[id]`; films/series retain portrait covers and YouTube entries retain a 16:9 preview |
| `src/routes/pick.tsx` | bounded picker form and result-card composition on `/pick` |

The source's varied gradient cover fallback with title text and simple geometric icon treatment are
recreated in local components and CSS. WatchNext does not copy its bundled runtime, mock
store, fixture titles, mock account handling, recovery code, telemetry or
client-side mutations.

## Behaviour boundary

All screens above continue to render WatchNext's real server-authorized data
and existing flows: account sessions, group membership, SQLite/Prisma storage,
title/provider validation, contributions, archive/restore, personal progress,
ratings, notes and picker eligibility/cycling. The reference is not a source
of product data or authentication behaviour. A visual adaptation must never
replace an existing real action with a mock control.

## Verification boundary

The issue #75 production screenshots are in [source-page-port-75](evidence/source-page-port-75/README.md).
The intended viewport checks are 1280px desktop and 375px mobile. The mobile
layout uses the reference-style Watchlist/Add/Pick bottom navigation with safe
content padding; desktop retains the compact header and all additional
WatchNext destinations. See `_docs/testing-guidelines.md` for the repeatable
production-browser command and `_docs/evidence/lovable-alignment.md` for the
earlier captured comparison evidence. This document records visual provenance;
it does not claim a pixel-identical copy or replace human usability testing.
