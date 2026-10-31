# Compose end-to-end test

From the repository root, with Docker Desktop running and Node.js 24 and pnpm
11.25.0 installed:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm test:e2e:compose
```

For the full picker acceptance run, leave the optional picker-only probe
variables unset. In PowerShell, clear them before running the command:

```powershell
Remove-Item Env:WATCHNEXT_PICKER_UI_ONLY, Env:WATCHNEXT_PICKER_EXACT_ONLY -ErrorAction SilentlyContinue
pnpm test:e2e:compose
```

In a POSIX shell, run:

```sh
env -u WATCHNEXT_PICKER_UI_ONLY -u WATCHNEXT_PICKER_EXACT_ONLY pnpm test:e2e:compose
```

These variables are only for focused diagnostics and skip the rest of the full
two-session scenario.

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

## PostgreSQL migration idempotency

```sh
pnpm test:e2e:migrations
```

This test starts PostgreSQL first in a unique Compose project, verifies its
fresh owned volume has no `_prisma_migrations` table, then starts the real app.
It checks that `20261026000000_watchnext_portability` has exactly one
successful migration-history row, creates and opens a synthetic title, restarts
only the test app service, and verifies the migration row and title again.
Cleanup removes only verified resources belonging to this test project.

The test builds the current checkout by default. Set `WATCHNEXT_E2E_IMAGE` to
an existing image only when that image contains the exact product source under
test; this skips the build and fails if the image is missing.

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
## Group access isolation

```sh
pnpm test:e2e:isolation
```

This check creates two independent accounts, each with a separate group and a
unique title, in an isolated Compose project. It verifies that each account can
see its own group and title, while the other group's name and title remain
absent from the group workspace, watchlist and `GET /v1/library`. It also opens
the other account's title URL directly and requests `GET /v1/library/{id}`;
neither response may expose the foreign title. The test uses separate browser
contexts, blocks requests outside the test app, generates synthetic data, and
removes only its verified Compose resources. It retains no credentials,
recovery codes, cookies or invitation URLs.

By default the command builds the current checkout. To skip the build, set
`WATCHNEXT_E2E_IMAGE` to an already built image for the exact product source
being tested. The command checks that image exists and never pulls or retags it.
## PostgreSQL outage and recovery

```sh
pnpm test:e2e:database-recovery
```

This test creates a synthetic account, group, and saved title in a new Compose
project. It stops only that project's verified PostgreSQL container while the
app remains running, checks that a title save produces a visible error instead
of a success page, then starts the same PostgreSQL container and volume again.
It verifies the original title is still available, the failed title was not
saved, and a new save succeeds after recovery. Cleanup is limited to resources
whose Compose ownership labels match the generated project.

The test builds the current checkout by default. Set `WATCHNEXT_E2E_IMAGE` to
an existing image only when that image contains the exact product source under
test; this skips the build and fails if the image is missing. Use the pinned
Playwright Chromium and ensure Docker Desktop is running.
