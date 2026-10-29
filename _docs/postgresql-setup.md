# PostgreSQL preparation

Local `pnpm dev` uses PostgreSQL by default and does not migrate or copy any
existing WatchNext data. The schema and initial migration are under
`prisma/postgresql/`. Set `WATCHNEXT_POSTGRES_URL` to the connection string in
your shell or ignored `.env.local`. The separate generated Prisma client is
ignored by Git and is generated automatically on first launch if absent.

The existing SQLite database is separate and remains unchanged. To explicitly
use SQLite locally, set `WATCHNEXT_HTTP_PRISMA_PROVIDER=sqlite` before `pnpm dev`.
The Docker launcher is unchanged and still selects SQLite.

You can validate and generate the PostgreSQL client without connecting to the
database:

```powershell
$env:WATCHNEXT_POSTGRES_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DATABASE'
pnpm prisma:postgres:validate
pnpm prisma:postgres:generate
```

The URL shown above is an example, not a production credential. Keep actual
credentials out of Git. Neither command applies migrations or writes user data.

## Initialize a selected PostgreSQL database

For a fresh, explicitly selected PostgreSQL database, replace the placeholders
with that database's connection details and run from the project root:

```powershell
$env:WATCHNEXT_POSTGRES_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DATABASE?schema=public'
pnpm exec prisma migrate deploy --schema prisma/postgresql/schema.prisma
```

This applies the checked-in PostgreSQL migrations to the selected database; it
does not copy data from SQLite or reset it. For an existing PostgreSQL database,
make a verified backup first and confirm the target before applying migrations.
Never commit the actual connection string or credentials.

The initial migration was applied to the separate local PostgreSQL database,
and a two-session account/group/watchlist journey was performed against it.
PostgreSQL and SQLite do not share data. Migrations remain explicit: `pnpm dev`
does not apply them. The Docker production launcher has not been switched to
PostgreSQL.
