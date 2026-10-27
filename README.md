# WatchNext

WatchNext is a local shared watchlist. Its interface comes from the
[Together Tonight prototype](https://github.com/xiaodlb/together-tonight-watchlist)
and its API uses the existing WatchNext SQLite database via Prisma.

## Start locally

Install Node.js 24.15.0 or later in the 24.x release line and pnpm 11.25.0.
In PowerShell, from the project directory, run:

```powershell
pnpm install --frozen-lockfile
pnpm db:init
pnpm dev
```

Open **http://127.0.0.1:3000**. Keep the terminal open; Ctrl+C stops the
frontend and the private API. Ports 3000 and 3100 must be available. The
first `pnpm dev` installs the pinned frontend dependencies and generates the
Prisma client if needed. `pnpm db:init` creates or migrates the configured
database without resetting existing data.

By default, WatchNext stores its SQLite file in the OS-local data directory.
Set `WATCHNEXT_DATABASE_PATH` in the shell or `.env.local` to use a different
database. `WATCHNEXT_APP_ORIGIN` defaults to `http://127.0.0.1:3000`; if you
change it, open that exact address. `WATCHNEXT_BACKEND_PORT` selects another
private API port. Provider API keys are optional; manual entries remain
available when lookup is not configured.

The default launcher is for local development. The existing `pnpm build` and
`pnpm start` commands operate the Next API server alone; they do not build or
start the Together Tonight frontend. A combined production launcher is not
provided.

## Project documents

- [Product specification](_docs/specification.md)
- [Database and migrations](_docs/database.md)
- [API documentation](_docs/api.md)
- [Backup and restore](_docs/backup-restore.md)
- [Development process](_docs/process.md)

Older UI-specific documentation and tests describe the removed Next frontend
and may no longer match the current interface. Existing legacy-group and
account-mode sessions have limitations when both are active at once.
