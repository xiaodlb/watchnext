# Initial design baseline

## Together Tonight page composition — issue #75

The current page structure follows the pinned Together Tonight source mapped in
[`together-tonight-reference.md`](together-tonight-reference.md). Keep the compact
white header and mobile bottom navigation; use a five-column desktop/two-column
mobile cover grid, varied title-bearing fallback covers, separate compact search
and manual Add cards, a wide search-results page state, a cover-led detail with
personal controls below it, and a narrow chip-driven picker. Preserve live
account and group context, real provider decisions, and saved progress. Capture
both 1280px and 375px production screenshots before declaring a visual change done.

Current account/discovery delivery and historical boundaries are mapped in [enhancement-audit.md](enhancement-audit.md). Account groups use live authenticated membership/context identity; only separate legacy groups use trusted selectable names. Later issue-specific sections supersede first-release restrictions without converting old groups.

## Account/discovery extension

Keep the existing visual palette and accessible responsive conventions. #32 uses real Register/Sign in forms, focused actionable feedback, disabled pending submission, cleared passwords and a private once-only recovery save/copy/Continue view. #33 reuses them for Forgot password/Reset, with a masked saved code, exact new-password confirmation, honest no-backdoor explanation and once-only replacement that continues to sign-in. Secret fields clear on failure; no old code is redisplayed. Explicit Legacy group access stays separate. The account page displays actual identity and honest group availability without fake controls. [The enhancement scope](account-discovery-enhancement.md) defines the remaining account group switcher, creator controls and All/Added by me tabs. Current account identity is not an arbitrary member selector. Future creator removal needs confirmation and visible retained-history explanation; preview images need safe real sources and stable fallback. Do not claim later screens exist. Owning issues #32–#40 require keyboard and 375px/1280px checks.

Established for [issue #6](https://github.com/xiaodlb/watchnext/issues/6) on October 15, 2026 under the user's delegated design authority recorded in [plan.md](plan.md). These are reasoned implementation choices, **not individually user-approved visuals**. Keep this guide and `app/styles.css` consistent when extending the app.

## Intent

A calm, light interface for shared movie nights: pale neutral background, white content surfaces, dark navy text, and one restrained blue accent. Use real content and clear availability states. Never invent group members, titles, counts, or working actions to fill a screen. User-facing copy describes the product rather than issues, implementation, or frameworks.

## Colors

| CSS token | Value | Use |
| --- | --- | --- |
| `--color-background` | `#f4f6fa` | Page background, quiet labels |
| `--color-surface` | `#ffffff` | Header, content cards, controls |
| `--color-text` | `#17233b` | Headings and primary text |
| `--color-muted` | `#526078` | Supporting text and inactive navigation |
| `--color-border` | `#d8deea` | Decorative separators/card borders, not sole control outlines |
| `--color-accent` | `#1d4ed8` | Links, active navigation, primary controls |
| `--color-accent-soft` | `#eaf0ff` | Active navigation and decorative icon backgrounds |
| `--color-focus` | `#b45309` | Visible three-pixel focus outline |

Use dark text on white/pale surfaces and white text on blue primary controls. Muted text stays readable; do not use pale border gray for text. Active navigation uses background, border, weight, and `aria-current="page"`, not color alone. Focus uses a 3px outline with 4px offset and must remain visible.

## Fixed avatar palette for D14

Later profile work uses this small fixed palette with **white initials**; names remain visible beside avatars so color is never the only identity cue. The entries are tokens already defined in shared CSS, not invented member records.

| Label | Token | Background |
| --- | --- | --- |
| Blue | `--avatar-blue` | `#1d4ed8` |
| Purple | `--avatar-purple` | `#6d28d9` |
| Teal | `--avatar-teal` | `#0f766e` |
| Rose | `--avatar-rose` | `#be123c` |
| Amber | `--avatar-amber` | `#92400e` |
| Slate | `--avatar-slate` | `#475569` |

Each background supports at least 4.5:1 white-text contrast. Color choice UI in #9 must label each choice, retain visible keyboard focus, and expose selection without relying on hue alone. No profile picker is implemented by this baseline.

## Typography and spacing

- System sans-serif stack; no remote fonts or font downloads. Body 1rem, line height 1.6; supporting introductions 1.125rem; labels remain at least 0.75rem.
- One descriptive `h1` per page, fluid from 2.25rem to 3.5rem. Section `h2` runs 1.4rem to 1.8rem. Use logical heading order, with the application name kept in the header as text rather than another heading.
- Use the shared spacing scale: 4, 8, 12, 16, 24, 32, and 48px (`--space-1/2/3/4/6/8/12` at the normal root size). Use rem-based spacing and allow text to wrap.
- Shared shell is at most 70rem, with 24px side gutters on wider screens and 16px on small screens. Main content is bounded to 52rem; introductory prose to 44rem. Cards use the shared 16px radius and responsive padding from 24px to 48px.

## Shell, navigation, and responsive behavior

`app/layout.tsx` owns the header, skip link, main landmark and footer. `Navigation` uses Next links/pathname for `/`, `/watchlist`, `/pick`, `/archive`; subroutes retain their owning non-root destination. Shared page/card/field styles keep real feature screens consistent.

The header places brand and navigation side by side on wide screens. At 46rem and below it stacks them, and navigation wraps into as many rows as needed. No hamburger/menu dependency or hidden navigation exists. Do not hide overflow to mask layout problems. The baseline is checked at 375px and 1280px on all four routes. Keep controls and text unclipped with no horizontal page overflow.

The skip link is first in keyboard order, visible when focused, and targets `#main-content`. The main landmark has `tabIndex=-1` so activating the link moves focus there. Every interactive element keeps a visible focus outline. Navigation touch targets have at least 44px height.

## Reusable controls and states

Shared `.button` and `.field` styles establish 44px minimum height, system typography, 8px corner radius, and visible focus. A field uses a darker outline than decorative cards. Use an actual label with each field; do not make placeholders serve as labels. Use links for navigation and buttons for actions. Disabled buttons are visibly muted with the native disabled attribute; never show an enabled action before its behavior exists.

Delivered pages expose real group/profile/watchlist/detail/picker/archive operations with honest empty/loading/error/success states. The #6 scaffold's historical Not available yet placeholders have been replaced; never reintroduce fake counts or enabled actions without behavior. Describe the user's situation and provide actions that actually work.

No animation is needed for this baseline. Honor reduced-motion preferences when motion is added. Do not remove focus, force fixed heights around text, or introduce per-page palettes and spacing without updating this document.

## Account groups and mode-aware product UI — issue #34

Navigation includes Account groups at both representative widths. The account page displays actual active memberships, selected group, separate create/join/switch actions, private once-only invitation copy/manual fallback and explicit separate legacy access. Pending actions disable competing controls synchronously; errors retain nonsecret inputs and focus the announced message, with Reload account for stale context. Loading and storage-error states are real. After authentication/group/mode change use full navigation so old rendered action context is discarded. Never expose arbitrary profile selection in account groups: the group page shows the signed-in member and actual membership names/colors; legacy profile controls remain in legacy mode only. Owners follow the same contributor-only edit rules as other members. No owner-management placeholder controls are presented before #35.

## Creator controls — issue #35

On account /group, show all actual participants with fixed palette/avatar, visible Active/Inactive status and Creator/You indicators. Only the creator sees Remove for active nonowner participants and Rotate invite. Use an inline named confirmation with focused heading and explicit retained-history/access-loss or old-link/member-access explanation; Cancel writes nothing. Disable competing actions while pending and announce/focus result or safe retry error. Preserve a failed confirmation with Reload group guidance. Never present these controls in legacy mode or imply ownership permits metadata editing. Historical list/detail attribution adds Inactive participant without renaming or hiding people; archive uses the same labels. The once-only new invite field supports copy/manual fallback, explains local-only links and clears on departure/reload/back.

## Lookup and shared previews — issue #38

Add title exposes explicit Manual, YouTube title/link intent and Kinopoisk search. Candidate cards reserve image space with concise actual channel/runtime or year/type hints and explicit Review actions. Real page controls announce page/limit/empty results. Clean selection fills the editable form immediately; use an inline Replace details / Keep my details confirmation only for genuine edits, naming the fields replaced and preserving moods. Imported selected context shows a safe preview and short missing-runtime/film-interpretation guidance; avoid policy essays or another Apply step. Save remains explicit and mood/episode requirements remain visible.

Reuse Cover everywhere:16:9 videos,2:3 posters, useful alt, no-referrer and stable No cover fallback through missing/unsafe/broken/cached failures. Unsupported authored URL values render fallback without altering ownership/storage. Cards use the existing palette, spacing, focus outline and responsive minmax grid; long names/buttons wrap at375px. Result feedback must contain useful text when focused. Focus clean selected review/deliberate replacement; never steal focus from a metadata field edited while a request was pending. No new palette/image service/dependency is introduced.

## All / Added by me — issue #39

Only the active account-group watchlist exposes a labeled Watchlist filter navigation with real All titles and Added by me links. The current link uses aria-current plus the existing accent-soft background, border and weight; keyboard focus stays visible and controls wrap on narrow screens. No identity appears in filter links. Mine keeps the same one-card metadata/cover/detail layout and all contributor names/colors/inactive labels.

Empty Mine says You haven’t added any titles and offers Show all titles/Add a title, while empty All retains Your watchlist is empty. Unsupported input and legacy account-only notices use accessible fixed feedback. Loading keeps the requested URL; storage retry preserves valid Mine and explains that fact. Legacy and archive expose no authenticated Mine control. No new palette/filter framework/category sort or personal copies are introduced.
