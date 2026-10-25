// @vitest-environment node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

const schema = readFileSync("prisma/schema.prisma", "utf8");
const migration = readFileSync("prisma/migrations/20261025000000_native_sqlite_baseline/migration.sql", "utf8");
const requiredModels = ["SchemaMigration", "Group", "Invitation", "Member", "Title", "TitleGenre", "Mood", "TitleMood", "Contributor", "Progress", "Rating", "Note", "GroupSession", "Account", "AccountSession", "AccountMembership", "MetadataField", "MetadataReview", "PendingGroupInvitation"];
const requiredTables = ["schema_migrations", "groups", "invitations", "members", "titles", "title_genres", "moods", "title_moods", "contributors", "progress", "ratings", "notes", "group_sessions", "accounts", "account_sessions", "account_memberships", "metadata_fields", "metadata_reviews", "pending_group_invitations"];

it("maps every owned native table and keeps the baseline tied to immutable native migrations", () => {
  for (const model of requiredModels) expect(schema).toContain(`model ${model}`);
  for (const table of requiredTables) {
    expect(schema).toContain(`@@map("${table}")`);
    expect(migration).toContain(`CREATE TABLE ${table}`);
  }
  for (const native of ["0001_initial.sql", "0002_group_sessions.sql", "0003_metadata_lifecycle.sql", "0004_accounts_memberships.sql", "0005_account_context.sql"]) {
    expect(migration).toContain(`BEGIN native/${native}`);
    expect(migration).toContain(`'${native}'`);
  }
  expect(schema).toContain("relationMode = \"foreignKeys\"");
});

it("proves the owned-copy Prisma baseline preserves all seeded native rows", () => {
  const result = spawnSync(process.execPath, ["scripts/prisma/verify-baseline.mjs"], { cwd: process.cwd(), encoding: "utf8" });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("owned populated native copy baselined");
  expect(result.stdout).toContain("fresh isolated Prisma baseline setup");
  expect(result.stderr).toBe("");
});