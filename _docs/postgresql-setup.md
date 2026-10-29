# PostgreSQL preparation

This preparation keeps SQLite as the default and does not migrate or copy any
existing WatchNext data. The PostgreSQL schema and its initial migration are
under `prisma/postgresql/`. The HTTP Prisma adapters select PostgreSQL only when
the server is explicitly configured with
`WATCHNEXT_HTTP_PRISMA_PROVIDER=postgresql` and a PostgreSQL URL in
`WATCHNEXT_HTTP_PRISMA_DATABASE_URL`. The separate generated Prisma client is
ignored by Git and can be prepared without connecting to the database:

```powershell
$env:WATCHNEXT_POSTGRES_URL='postgresql://USER:PASSWORD@127.0.0.1:5432/DATABASE'
pnpm prisma:postgres:validate
pnpm prisma:postgres:generate
```

The URL shown above is an example, not a production credential. Keep actual
credentials out of Git. Neither command applies migrations or writes user data.

The PostgreSQL migration has not been applied or validated against a database
in this preparation step. Its compatibility with the current application's
account, group, watchlist and picker flows still requires a separate authorized
integration step and verification. `pnpm dev` and the Docker launcher still
select SQLite; changing their configuration is outside this preparation.
The PostgreSQL database starts empty and does not contain existing SQLite data.
