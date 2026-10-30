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
builds and runs the API and Together Tonight production frontend together,
using PostgreSQL by default.

## Run in Docker

The image builds the frontend and the existing Node.js API. TanStack Start
renders pages on the server, so the single container runs that production
renderer privately while the API serves the public port and forwards page and
asset requests to it. No Vite development server is used.

### Run the whole application with Docker Compose

With Docker Desktop running, from the project directory run:

```powershell
docker compose up --build
```

Open **http://localhost:8100**. Compose starts PostgreSQL and waits for it to
accept connections before starting WatchNext. WatchNext applies any pending
PostgreSQL migrations on startup without resetting the database. Press Ctrl+C
to stop both services; `docker compose up` starts them again. Data stays in the
Compose `postgres-data` named volume between runs.

This is a **separate, initially empty database** from the earlier standalone
`watchnext-postgres` container and its `watchnext-postgres-data` volume. It does
not import or overwrite those accounts or films. Do not start a second
PostgreSQL container on the same data directory. `docker compose down` stops
and removes the Compose containers and network but keeps the data volume; do
not add `--volumes` unless you intend to permanently delete that database.

The included username and password are local-development defaults only. To
change them for a new database, set `WATCHNEXT_COMPOSE_DB_USER`,
`WATCHNEXT_COMPOSE_DB_PASSWORD`, and `WATCHNEXT_COMPOSE_DB_NAME` in your shell
or ignored `.env` file before first startup. Changing them later does not alter
the credentials or database in an existing PostgreSQL volume; create database
credentials separately when needed. `WATCHNEXT_COMPOSE_PORT` changes the host
port and the corresponding origin together. For a public deployment, choose
strong credentials, configure backups and an HTTPS reverse proxy, and adapt
the public origin; the loopback-only Compose settings are for local use.

### Run using the existing standalone PostgreSQL container

The PostgreSQL server and its migrated database must already exist. To use the
existing local `watchnext-postgres` container, connect it once to a dedicated
Docker network. This leaves its existing `watchnext-postgres-data` volume and
published local port untouched:

```powershell
docker network create watchnext-network
docker network connect watchnext-network watchnext-postgres
```

From the project directory, build the image and supply the PostgreSQL URL at
runtime. Replace `USER`, `PASSWORD`, and `DATABASE` with the credentials and
database already configured for your PostgreSQL container. The hostname is the
Docker container name, not `127.0.0.1` (which refers to the app container).
Do not commit your actual credentials.

```powershell
docker build -t watchnext .
$env:WATCHNEXT_POSTGRES_URL='postgresql://USER:PASSWORD@watchnext-postgres:5432/DATABASE?schema=public'
docker run --rm --name watchnext-app --network watchnext-network -p 127.0.0.1:3000:3000 -e WATCHNEXT_POSTGRES_URL -e WATCHNEXT_APP_ORIGIN=http://127.0.0.1:3000 watchnext
```

Open `http://127.0.0.1:3000` and keep the terminal open. If the local `pnpm dev`
server is already using port 3000, stop it first. PostgreSQL data stays in its
own named volume when the app container stops. Docker startup does not create,
migrate, reset, or copy the database: apply migrations deliberately as described
in [PostgreSQL setup](_docs/postgresql-setup.md).

For deployment behind HTTPS, publish through a TLS reverse proxy and set
`WATCHNEXT_APP_ORIGIN` to the exact public origin, such as
`https://watch.example.com`; browser writes and invitation links use this value.
Pass optional provider keys as runtime environment variables, never as build
arguments or committed files. The example PostgreSQL credentials are for local
development; use separate secure credentials and backups in production.

For the existing SQLite Docker volume, explicitly set
`WATCHNEXT_HTTP_PRISMA_PROVIDER=sqlite`, mount `watchnext-data:/data`, and
initialize that separate database with `scripts/db/init.mjs` if needed. Switching
providers does not transfer records between SQLite and PostgreSQL.

## Project documents

- [Product specification](_docs/specification.md)
- [Database and migrations](_docs/database.md)
- [API documentation](_docs/api.md)
- [Backup and restore](_docs/backup-restore.md)
- [Development process](_docs/process.md)

Older UI-specific documentation and tests describe the removed Next frontend
and may no longer match the current interface. Existing legacy-group and
account-mode sessions have limitations when both are active at once.
