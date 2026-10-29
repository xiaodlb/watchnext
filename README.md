# WatchNext

WatchNext is a local shared watchlist. Its interface comes from the
[Together Tonight prototype](https://github.com/xiaodlb/together-tonight-watchlist)
and its API uses PostgreSQL via Prisma for local development.

## Start locally

Install Node.js 24.15.0 or later in the 24.x release line and pnpm 11.25.0.
In PowerShell, from the project directory, run:

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

Open **http://127.0.0.1:3000**. Keep the terminal open; Ctrl+C stops the
frontend and the private API. Ports 3000 and 3100 must be available. The
first `pnpm dev` installs the pinned frontend dependencies and generates the
PostgreSQL Prisma client if needed. The PostgreSQL server and migrated database
must already exist; see [PostgreSQL setup](_docs/postgresql-setup.md). Startup
does not create, migrate, or reset either database.

Set `WATCHNEXT_POSTGRES_URL` in the shell or untracked `.env.local` to your
PostgreSQL connection string. SQLite remains available as an explicit local
option; it is separate from PostgreSQL and retains its existing data. Set
`WATCHNEXT_HTTP_PRISMA_PROVIDER=sqlite` to use it, and optionally set
`WATCHNEXT_DATABASE_PATH` to select its file. `WATCHNEXT_APP_ORIGIN` defaults
to `http://127.0.0.1:3000`; if you
change it, open that exact address. `WATCHNEXT_BACKEND_PORT` selects another
private API port. Provider API keys are optional; manual entries remain
available when lookup is not configured.

The default launcher is for local development. The existing `pnpm build` and
`pnpm start` commands operate the Next API server alone. The Docker setup below
builds and runs the API and Together Tonight production frontend together. The
Docker launcher still uses SQLite; local PostgreSQL configuration does not
change the Docker setup.

## Run in Docker

The image builds the frontend and the existing Node.js API. TanStack Start
renders pages on the server, so the single container runs that production
renderer privately while the API serves the public port and forwards page and
asset requests to it. No Vite development server is used.

From the project directory, build the image and create a persistent volume:

```sh
docker build -t watchnext .
docker volume create watchnext-data
docker run --rm -v watchnext-data:/data --entrypoint node watchnext scripts/db/init.mjs
docker run --rm -p 127.0.0.1:3000:3000 -v watchnext-data:/data -e WATCHNEXT_APP_ORIGIN=http://127.0.0.1:3000 watchnext
```

Open `http://127.0.0.1:3000`. The explicit initialization command creates or
migrates the SQLite database in the named volume without resetting existing
records. Keep using the same volume to retain data. For a bind mount, its
directory must be writable by the image's non-root `node` user. For deployment
behind HTTPS, publish through a TLS reverse proxy and set `WATCHNEXT_APP_ORIGIN`
to the exact public origin, such as `https://watch.example.com`; browser writes
and invitation links use this value. Pass optional provider keys as runtime
environment variables, never as build arguments or committed files.

The image does not import the database from your laptop automatically. To move
existing data, follow the SQLite-safe [backup and restore guide](_docs/backup-restore.md).

## Project documents

- [Product specification](_docs/specification.md)
- [Database and migrations](_docs/database.md)
- [API documentation](_docs/api.md)
- [Backup and restore](_docs/backup-restore.md)
- [Development process](_docs/process.md)

Older UI-specific documentation and tests describe the removed Next frontend
and may no longer match the current interface. Existing legacy-group and
account-mode sessions have limitations when both are active at once.
