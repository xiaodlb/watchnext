import { defineConfig } from "prisma/config";

// Issue #48: the Prisma CLI may only reach an explicitly named database URL.
// No fallback, no WATCHNEXT_DATABASE_PATH, no OS default path and no .env loading:
// without WATCHNEXT_PRISMA_DATABASE_URL, datasource commands fail with "datasource.url ... required".
const url = process.env.WATCHNEXT_PRISMA_DATABASE_URL;
const shadowDatabaseUrl = process.env.WATCHNEXT_PRISMA_SHADOW_DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  ...(url ? { datasource: { url, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } } : {}),
});
