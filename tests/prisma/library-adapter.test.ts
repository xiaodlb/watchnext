// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { migrate } from "../../db/migrate";
import { PrismaLibraryRepository } from "../../lib/http-prisma/library-store";
import { prismaIdentityClient, resetPrismaIdentityForTests } from "../../lib/http-prisma/identity-store";
import { MemoryLibraryRepository } from "../../lib/repositories/memory-library-store";

const roots: string[] = [];
function savedId(outcome: { title?: { id: string } | null }) { if (!outcome.title) throw new Error("Expected a saved title."); return outcome.title.id; }
const draft = (title: string, contentType: "movie" | "series" | "anime" | "youtube", durationSeconds: number) => ({
  title, contentType, durationSeconds,
  numberingStyle: contentType === "movie" || contentType === "youtube" ? "none" as const : "season_episode" as const,
  genres: ["Comedy"], moods: ["funny"], watchUrl: "https://example.test/watch", sourceUrl: "https://example.test/source", coverUrl: "https://example.test/cover.jpg",
});

async function setup() {
  const root = mkdtempSync(join(tmpdir(), "watchnext-prisma-library-")); roots.push(root);
  const database = join(root, "library.sqlite"); const native = new DatabaseSync(database);
  try { migrate(native); } finally { native.close(); }
  process.env.WATCHNEXT_HTTP_PRISMA_ISOLATED = "1";
  process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL = `file:${database.replace(/\\/g, "/")}`;
  const db = prismaIdentityClient();
  await db.group.create({ data: { id: "group-a", name: "Shared A", accessMode: "legacy", inviteGeneration: 1 } });
  await db.group.create({ data: { id: "group-b", name: "Private B", accessMode: "legacy", inviteGeneration: 1 } });
  await db.member.createMany({ data: [
    { id: "alice", groupId: "group-a", name: "Alice", nameKey: "alice", avatarColor: "#2563eb" },
    { id: "bob", groupId: "group-a", name: "Bob", nameKey: "bob", avatarColor: "#0f766e" },
    { id: "cara", groupId: "group-b", name: "Cara", nameKey: "cara", avatarColor: "#7c3aed" },
  ] });
  return { database, db, repository: new PrismaLibraryRepository(db) };
}

async function accountContext(db: ReturnType<typeof prismaIdentityClient>) {
  const accountId = "account-a", tokenHash = "a".repeat(64), groupId = "account-group", memberId = "account-member";
  await db.account.create({ data: { id: accountId, username: "Account.A", usernameKey: "account.a", passwordVersion: 1, passwordAlgorithm: "scrypt", passwordHash: "b".repeat(128), passwordSalt: "c".repeat(32), passwordN: 16384, passwordR: 8, passwordP: 1, passwordMaxmem: 33554432, recoveryDigest: "d".repeat(64) } });
  await db.group.create({ data: { id: groupId, name: "Account group", accessMode: "account", ownerAccountId: accountId, inviteGeneration: 1 } });
  await db.member.create({ data: { id: memberId, groupId, name: "Account member", nameKey: "account member", avatarColor: "#2563eb" } });
  await db.accountMembership.create({ data: { accountId, groupId, groupMode: "account", memberId, status: "active", joinedInviteGeneration: 1 } });
  const now = Math.floor(Date.now() / 1000);
  await db.accountSession.create({ data: { tokenHash, accountId, createdAt: BigInt(now - 1), expiresAt: BigInt(now + 60), contextRevision: BigInt(0), selectedGroupId: groupId } });
  return { groupId, memberId, access: { accountId, sessionHash: tokenHash, contextRevision: 0 } };
}

async function nativeFixture() {
  const root = mkdtempSync(join(tmpdir(), "watchnext-prisma-native-fixture-")); roots.push(root);
  const database = join(root, "native.sqlite"), native = new DatabaseSync(database);
  try {
    migrate(native);
    native.exec(`
      INSERT INTO groups(id,name) VALUES ('native-group','Native fixture');
      INSERT INTO members(id,group_id,name,name_key,avatar_color) VALUES ('native-member','native-group','Native Member','native member','#2563eb');
      INSERT INTO titles(id,group_id,title,title_key,content_type,duration_seconds,numbering_style,provider_namespace,provider_id,watch_url,cover_url)
        VALUES ('native-title','native-group','Native original','native original','movie',600,'none','youtube','native-provider','https://example.test/native-watch','https://example.test/native-cover');
      INSERT INTO title_moods(title_id,mood_code) VALUES ('native-title','funny');
      INSERT INTO title_genres(title_id,genre_key,label) VALUES ('native-title','comedy','Comedy');
      INSERT INTO contributors(group_id,title_id,member_id) VALUES ('native-group','native-title','native-member');
      INSERT INTO progress(group_id,title_id,member_id,numbering_style,position_state,timestamp_seconds) VALUES ('native-group','native-title','native-member','none','in_progress',120);
      INSERT INTO ratings(group_id,title_id,member_id,score) VALUES ('native-group','native-title','native-member',9);
      INSERT INTO notes(group_id,title_id,member_id,body) VALUES ('native-group','native-title','native-member','Native history');
      INSERT INTO metadata_fields(title_id,field,origin,retrieved_at,expires_at) VALUES ('native-title','title','provider','2030-01-01T00:00:00.000Z','2030-01-31T00:00:00.000Z');
    `);
  } finally { native.close(); }
  process.env.WATCHNEXT_HTTP_PRISMA_ISOLATED = "1";
  process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL = `file:${database.replace(/\\/g, "/")}`;
  const db = prismaIdentityClient();
  return { database, db, repository: new PrismaLibraryRepository(db) };
}

afterEach(async () => {
  await resetPrismaIdentityForTests();
  delete process.env.WATCHNEXT_HTTP_PRISMA_ISOLATED;
  delete process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("persists four shared content types, contributors, archive/restore and personal history", async () => {
  const { db, repository } = await setup();
  const saved = [] as Array<{ id: string }>;
  for (const [name, type] of [["Film", "movie"], ["Series", "series"], ["Anime", "anime"], ["Video", "youtube"]] as const) {
    const outcome = await repository.save({ groupId: "group-a", memberId: "alice", draft: draft(name, type, 1200) });
    expect(outcome.kind).toBe("created"); saved.push({ id: savedId(outcome) });
  }
  const first = saved[0].id;
  const duplicate = await repository.save({ groupId: "group-a", memberId: "bob", draft: draft("Film", "movie", 1200) });
  expect(duplicate.kind).toBe("existing");
  expect(await db.contributor.count({ where: { titleId: first } })).toBe(2);
  await repository.patchPersonal("group-a", "alice", first, { positionState: "in_progress", timestampSeconds: 42, rating: 8, note: "Keep this note" });
  expect(await repository.removeContribution("group-a", "alice", first)).toMatchObject({ archived: false });
  expect(await repository.removeContribution("group-a", "bob", first)).toMatchObject({ archived: true });
  const confirmation = await repository.save({ groupId: "group-a", memberId: "alice", draft: draft("Film", "movie", 1200) });
  expect(confirmation).toMatchObject({ kind: "confirmation", id: first });
  const restored = await repository.save({ groupId: "group-a", memberId: "alice", draft: draft("Film", "movie", 1200), confirmArchivedId: first });
  expect(restored).toMatchObject({ kind: "restored" });
  expect(savedId(restored)).toBe(first);
  expect(await db.progress.findUnique({ where: { titleId_memberId: { titleId: first, memberId: "alice" } } })).toMatchObject({ timestampSeconds: 42 });
  expect(await db.rating.findUnique({ where: { titleId_memberId: { titleId: first, memberId: "alice" } } })).toMatchObject({ score: 8 });
  expect(await db.note.findUnique({ where: { titleId_memberId: { titleId: first, memberId: "alice" } } })).toMatchObject({ body: "Keep this note" });
  expect((await repository.list("group-a", "alice")).map((value: any) => value.contentType).sort()).toEqual(["anime", "movie", "series", "youtube"]);
});

it("keeps personal values group-bound and rolls back invalid writes without orphan rows", async () => {
  const { db, repository } = await setup();
  const created = await repository.save({ groupId: "group-a", memberId: "alice", draft: draft("Guarded", "movie", 900) });
  const titleId = savedId(created);
  await expect(repository.patchPersonal("group-a", "cara", titleId, { rating: 5 })).rejects.toThrow(/unavailable|access/i);
  await expect(repository.patchPersonal("group-b", "cara", titleId, { rating: 5 })).rejects.toThrow(/unavailable|access/i);
  await expect(repository.patchPersonal("group-a", "alice", titleId, { rating: 99 })).rejects.toThrow();
  expect(await db.progress.count({ where: { titleId } })).toBe(0);
  expect(await db.rating.count({ where: { titleId } })).toBe(0);
  expect(await db.$queryRawUnsafe<Array<{ problems: unknown }>>("PRAGMA foreign_key_check")).toEqual([]);
});

it("binds metadata reviews, expires/replays safely, retains manual fields and filters archived picker rows", async () => {
  const { db, repository } = await setup();
  const created = await repository.save({ groupId: "group-a", memberId: "alice", draft: draft("Imported", "youtube", 600), provider: { namespace: "youtube", externalId: "vid-1" }, providerFields: ["title", "duration"] });
  const titleId = savedId(created);
  const otherGroup = await repository.save({ groupId: "group-b", memberId: "cara", draft: draft("Imported elsewhere", "youtube", 600), provider: { namespace: "youtube", externalId: "vid-1" } });
  expect(savedId(otherGroup)).not.toBe(titleId);
  const review = await repository.createReview({ groupId: "group-a", memberId: "alice", sessionId: "session-a", payload: { titleId, kind: "review" } });
  await expect(repository.consumeReview({ handle: review.handle, groupId: "group-a", memberId: "bob", sessionId: "session-a" })).rejects.toThrow(/review/i);
  const valid = await repository.createReview({ groupId: "group-a", memberId: "alice", sessionId: "session-a", payload: { titleId } });
  await expect(repository.consumeReview({ handle: valid.handle, groupId: "group-a", memberId: "alice", sessionId: "other" })).rejects.toThrow(/review/i);
  const expired = await repository.createReview({ groupId: "group-a", memberId: "alice", sessionId: "session-a", payload: { titleId }, expiresAt: new Date(Date.now() - 1) });
  await expect(repository.consumeReview({ handle: expired.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).rejects.toThrow(/review/i);
  const consumable = await repository.createReview({ groupId: "group-a", memberId: "alice", sessionId: "session-a", payload: { titleId } });
  expect(await repository.consumeReview({ handle: consumable.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).toMatchObject({ titleId });
  await expect(repository.consumeReview({ handle: consumable.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).rejects.toThrow(/review/i);
  await repository.removeContribution("group-a", "alice", titleId);
  expect((await repository.pickerProjection("group-a", "alice", ["alice"])).titles).toEqual([]);
  expect(await db.metadataField.findUnique({ where: { titleId_field: { titleId, field: "title" } } })).toMatchObject({ origin: "provider", cleared: false });
});

it("preserves a valid review for its owner, clears only expired provider fields, and retains manual corrections", async () => {
  const { db, repository } = await setup();
  const created = await repository.save({ groupId: "group-a", memberId: "alice", draft: draft("Provider fields", "youtube", 600), provider: { namespace: "youtube", externalId: "provider-fields" }, providerFields: ["title", "duration", "genres", "coverUrl"] });
  const titleId = savedId(created);
  const review = await repository.createReview({ groupId: "group-a", memberId: "alice", sessionId: "session-a", payload: { titleId } });
  await expect(repository.consumeReview({ handle: review.handle, groupId: "group-a", memberId: "bob", sessionId: "session-a" })).rejects.toThrow(/review/i);
  expect(await repository.consumeReview({ handle: review.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).toMatchObject({ titleId });
  await db.title.update({ where: { id: titleId }, data: { coverUrl: "https://example.test/my-cover.jpg" } });
  await db.metadataField.update({ where: { titleId_field: { titleId, field: "coverUrl" } }, data: { origin: "user", retrievedAt: null, expiresAt: null } });
  expect(await repository.clearExpiredMetadata(new Date(Date.now() + 31 * 86400000))).toBe(3);
  expect(await db.title.findUnique({ where: { id: titleId } })).toMatchObject({ title: null, titleKey: null, durationSeconds: null, coverUrl: "https://example.test/my-cover.jpg", metadataUnavailable: true });
  expect(await db.titleGenre.count({ where: { titleId } })).toBe(0);
  expect(await db.metadataField.findUnique({ where: { titleId_field: { titleId, field: "title" } } })).toMatchObject({ cleared: true, origin: "provider" });
  expect(await db.metadataField.findUnique({ where: { titleId_field: { titleId, field: "coverUrl" } } })).toMatchObject({ cleared: false, origin: "user" });
});

it("rechecks an account context at the write boundary and leaves history unchanged on a stale request", async () => {
  const { db, repository } = await setup();
  const context = await accountContext(db);
  const created = await repository.save({ groupId: context.groupId, memberId: context.memberId, access: context.access, draft: draft("Context film", "movie", 600) });
  await db.accountSession.update({ where: { tokenHash: context.access.sessionHash }, data: { contextRevision: BigInt(1) } });
  const titleId = savedId(created);
  await expect(repository.patchPersonal(context.groupId, context.memberId, titleId, { rating: 8 }, context.access)).rejects.toThrow(/access/i);
  expect(await db.progress.count({ where: { titleId } })).toBe(0);
  expect(await db.rating.count({ where: { titleId } })).toBe(0);
});

it("keeps one durable row when competing Prisma clients save an identical provider identity", async () => {
  const { database, db } = await setup();
  const a = new PrismaClient({ datasources: { db: { url: `file:${database.replace(/\\/g, "/")}` } } });
  const b = new PrismaClient({ datasources: { db: { url: `file:${database.replace(/\\/g, "/")}` } } });
  try {
    const first = new PrismaLibraryRepository(a).save({ groupId: "group-a", memberId: "alice", draft: draft("Race film", "movie", 600), provider: { namespace: "youtube", externalId: "race-id" } });
    const second = new PrismaLibraryRepository(b).save({ groupId: "group-a", memberId: "bob", draft: draft("Race film", "movie", 600), provider: { namespace: "youtube", externalId: "race-id" } });
    const result = await Promise.allSettled([first, second]);
    expect(result.some((entry) => entry.status === "fulfilled")).toBe(true);
    const titles = await db.title.findMany({ where: { groupId: "group-a", providerNamespace: "youtube", providerId: "race-id" } });
    expect(titles).toHaveLength(1);
    expect(await db.contributor.count({ where: { titleId: titles[0].id } })).toBeGreaterThanOrEqual(1);
    expect(await db.$queryRawUnsafe<Array<{ problems: unknown }>>("PRAGMA foreign_key_check")).toEqual([]);
  } finally { await Promise.all([a.$disconnect(), b.$disconnect()]); }
});

it("reads and writes beside a populated native fixture without changing its IDs, provenance, or history", async () => {
  const { db, repository } = await nativeFixture();
  const before = {
    title: await db.title.findUnique({ where: { id: "native-title" } }),
    progress: await db.progress.findUnique({ where: { titleId_memberId: { titleId: "native-title", memberId: "native-member" } } }),
    rating: await db.rating.findUnique({ where: { titleId_memberId: { titleId: "native-title", memberId: "native-member" } } }),
    note: await db.note.findUnique({ where: { titleId_memberId: { titleId: "native-title", memberId: "native-member" } } }),
    metadata: await db.metadataField.findUnique({ where: { titleId_field: { titleId: "native-title", field: "title" } } }),
  };
  expect((await repository.list("native-group", "native-member"))[0]).toMatchObject({ id: "native-title", provider: { namespace: "youtube", externalId: "native-provider" } });
  await repository.save({ groupId: "native-group", memberId: "native-member", draft: draft("A separate title", "movie", 601) });
  expect({
    title: await db.title.findUnique({ where: { id: "native-title" } }),
    progress: await db.progress.findUnique({ where: { titleId_memberId: { titleId: "native-title", memberId: "native-member" } } }),
    rating: await db.rating.findUnique({ where: { titleId_memberId: { titleId: "native-title", memberId: "native-member" } } }),
    note: await db.note.findUnique({ where: { titleId_memberId: { titleId: "native-title", memberId: "native-member" } } }),
    metadata: await db.metadataField.findUnique({ where: { titleId_field: { titleId: "native-title", field: "title" } } }),
  }).toEqual(before);
  expect(await db.$queryRawUnsafe<Array<{ problems: unknown }>>("PRAGMA foreign_key_check")).toEqual([]);
});

it("persists one-time pending pages and reviews with expiry, supersession, parent consumption, and malformed cleanup", async () => {
  const { db, repository } = await setup();
  const first = await repository.createPendingPage({ groupId: "group-a", memberId: "alice", sessionId: "session-a", scope: "youtube-search", payload: { page: 1 } });
  const second = await repository.createPendingPage({ groupId: "group-a", memberId: "alice", sessionId: "session-a", scope: "youtube-search", payload: { page: 2 } });
  await expect(repository.consumePendingPage({ handle: first.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).rejects.toThrow(/review/i);
  const review = await repository.createReview({ groupId: "group-a", memberId: "alice", sessionId: "session-a", scope: "youtube-search", parentHandle: second.handle, payload: { candidate: "video-2" } });
  await expect(repository.consumePendingPage({ handle: second.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).rejects.toThrow(/review/i);
  expect(await repository.consumeReview({ handle: review.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).toEqual({ candidate: "video-2" });
  await expect(repository.consumeReview({ handle: review.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).rejects.toThrow(/review/i);
  const expired = await repository.createPendingPage({ groupId: "group-a", memberId: "alice", sessionId: "session-a", scope: "expired", payload: { private: "expired" }, expiresAt: new Date(Date.now() - 1) });
  await expect(repository.consumePendingPage({ handle: expired.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).rejects.toThrow(/review/i);
  const cleanup = await repository.createPendingPage({ groupId: "group-a", memberId: "alice", sessionId: "session-a", scope: "cleanup", payload: { private: "cleanup" }, expiresAt: new Date(Date.now() - 1) });
  expect(await repository.clearExpiredMetadata()).toBe(1);
  await expect(repository.consumePendingPage({ handle: cleanup.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).rejects.toThrow(/review/i);
  const malformedHandle = "malformed-page-handle";
  await db.metadataReview.create({ data: { handleHash: (await import("node:crypto")).createHash("sha256").update(malformedHandle).digest("hex"), groupId: "group-a", memberId: "alice", sessionId: "session-a", expiresAt: new Date(Date.now() + 600000).toISOString(), payload: "not-json" } });
  await expect(repository.consumePendingPage({ handle: malformedHandle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).rejects.toThrow(/review/i);
  expect(await db.metadataReview.findMany()).toEqual([]);
});

it("keeps the portable memory and Prisma adapters aligned for library, feedback, picker, and review lifecycle", async () => {
  const { repository: prisma } = await setup();
  const memory = new MemoryLibraryRepository([{ groupId: "group-a", memberId: "alice" }, { groupId: "group-a", memberId: "bob" }]);
  const input = { groupId: "group-a", memberId: "alice", draft: draft("Parity film", "movie", 600) };
  const prismaSaved = await prisma.save(input), memorySaved = await memory.save(input);
  const prismaId = savedId(prismaSaved), memoryId = savedId(memorySaved);
  await Promise.all([
    prisma.save({ ...input, memberId: "bob" }), memory.save({ ...input, memberId: "bob" }),
    prisma.patchPersonal("group-a", "alice", prismaId, { positionState: "in_progress", timestampSeconds: 42, rating: 8, note: "Parity note" }),
    memory.patchPersonal("group-a", "alice", memoryId, { positionState: "in_progress", timestampSeconds: 42, rating: 8, note: "Parity note" }),
  ]);
  const prismaList = await prisma.list("group-a", "alice"), memoryList = await memory.list("group-a", "alice");
  expect(prismaList.map((item: any) => ({ title: item.title, type: item.contentType, moods: item.moods, rating: item.ratings[0]?.score, note: item.notes[0]?.body }))).toEqual(memoryList.map((item: any) => ({ title: item.title, type: item.contentType, moods: item.moods, rating: item.ratings[0]?.score, note: item.notes[0]?.body })));
  expect((await prisma.pickerProjection("group-a", "alice", ["alice"])).titles.map((item: any) => item.title)).toEqual((await memory.pickerProjection("group-a", "alice", ["alice"])).titles.map((item: any) => item.title));
  const prismaPage = await prisma.createPendingPage({ groupId: "group-a", memberId: "alice", sessionId: "session-a", scope: "parity", payload: { page: 1 } });
  const memoryPage = await memory.createMetadataContext({ groupId: "group-a", memberId: "alice", sessionId: "session-a", kind: "page", scope: "parity", payload: { page: 1 } });
  const prismaReview = await prisma.createReview({ groupId: "group-a", memberId: "alice", sessionId: "session-a", scope: "parity", parentHandle: prismaPage.handle, payload: { selected: "video" } });
  const memoryReview = await memory.createReview({ groupId: "group-a", memberId: "alice", sessionId: "session-a", scope: "parity", parentHandle: memoryPage.handle, payload: { selected: "video" } });
  expect(await prisma.consumeReview({ handle: prismaReview.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" })).toEqual(await memory.consumeReview({ handle: memoryReview.handle, groupId: "group-a", memberId: "alice", sessionId: "session-a" }));
  await Promise.all([prisma.removeContribution("group-a", "alice", prismaId), prisma.removeContribution("group-a", "bob", prismaId), memory.removeContribution("group-a", "alice", memoryId), memory.removeContribution("group-a", "bob", memoryId)]);
  expect((await prisma.pickerProjection("group-a", "alice", ["alice"])).titles).toEqual([]);
  expect((await memory.pickerProjection("group-a", "alice", ["alice"])).titles).toEqual([]);
});
