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
both accounts, signs each out and back in, creates a group and joins it using
the actual invitation. It checks both group workspaces for the two independent
members. Each user then adds a different title; both refreshed watchlists must
show both entries and the correct contributor. Finally, both users save the
same YouTube link and the scenario checks that it remains one shared entry with
both contributors. The users also save different progress timestamps, ratings,
and notes for a shared movie; after reload, each sees their own progress and the
other member's attributed rating and note. Existing containers, ports, and
databases are not used. Only resources carrying the new test project's
ownership labels are removed on completion. No screenshots, traces, credentials
or invitation links are retained. No live metadata provider is called.

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

## PostgreSQL persistence after restart

```sh
pnpm test:e2e:compose:restart
```

This starts the real application and PostgreSQL in a fresh uniquely named
Compose project, creates two accounts, a group, and a shared title, then signs
out both accounts. It runs `docker compose down` without `--volumes`, verifies
the test-owned PostgreSQL volume is still present, and starts the same project
again. Fresh browser contexts sign in to both accounts and verify that the
group, membership, and one shared title persisted. Cleanup removes only
resources whose Compose ownership labels match the generated project. It never
uses or removes the user's containers or database volumes, and it does not
retain screenshots, traces, recovery codes, credentials, or invitation links.

By default the command builds the current checkout. To skip building, set
`WATCHNEXT_E2E_IMAGE` to a local image that contains the exact application code
under test; the command fails if that image is missing. The restart always uses
the same image and the same project-owned PostgreSQL volume.
