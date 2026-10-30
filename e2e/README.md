# Compose end-to-end test

From the repository root, with Docker Desktop running and Node.js 24 and pnpm
11.25.0 installed:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e:compose
```

The command builds the current checkout using `docker-compose.yaml`, starts an
isolated Compose project on a free loopback port, and exercises the real app
with two separate browser contexts and a fresh PostgreSQL volume. It registers
and signs in a group owner, shares the actual invitation, joins as a second
account, adds a title as the second account, and checks that the owner sees it
after refreshing the watchlist. Existing containers, ports, and databases are
not used. Only resources carrying the new test project's ownership labels are
removed on completion. No screenshots, traces, credentials or invitation
links are retained. No live metadata provider is called.

By default the test builds its own app image. To reuse an **already built image
for the exact checkout under test**, set `WATCHNEXT_E2E_IMAGE` to its local image
name before running. This skips the build and fails if the image does not
exist. It is the caller's responsibility to ensure that image matches the
checkout; otherwise the result does not verify current source. The test never
pulls or retags that image.

The test adapts the two-session example to WatchNext, which has groups and
watchlists rather than interview sessions or a canvas. The UI currently needs
a refresh to see another session's new title; this test does not claim realtime
updates. Docker needs sufficient disk space, and Chromium must already be
installed. A missing dependency or a failed assertion exits non-zero.

## Compose readiness

```sh
pnpm test:e2e:readiness
```

This separate check builds the current checkout, observes PostgreSQL become
healthy before WatchNext starts, and opens the real homepage and context API
with Playwright. It then starts another isolated project with a test-only
healthcheck that always fails and verifies that Compose refuses to start the
app. Both projects use separate temporary volumes and are cleaned up only
after their ownership is checked. Failures report the affected stage and exit
nonzero; no private pages, credentials, or invitation links are retained.

As with the two-session command, `WATCHNEXT_E2E_IMAGE` optionally chooses an
existing local image and skips the build. Use this only when the image matches
the checkout; the caller is responsible for that match. Docker and the pinned
Playwright Chromium must be available.
