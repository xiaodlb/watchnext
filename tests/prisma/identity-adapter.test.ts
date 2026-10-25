// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../db/migrate";
import { handleMemory, resetHttpMemoryForTests } from "../../lib/http-memory/service";
import { resetPrismaIdentityForTests } from "../../lib/http-prisma/identity-store";

const origin = "http://127.0.0.1:3000";
const password = "Synthetic Prisma password";
const roots: string[] = [];
const request = (path: string, value?: unknown, cookie?: string, method = "POST") => new Request(`${origin}/v1/${path}`, { method, headers: { ...(method === "GET" ? {} : { origin, "content-type": "application/json" }), ...(cookie ? { cookie } : {}) }, ...(value === undefined ? {} : { body: JSON.stringify(value) }) });
const cookieOf = (response: Response, name: string) => `${name}=${/[^=]+=([^;]+)/.exec(response.headers.get("set-cookie") ?? "")?.[1]}`;

function setupPrisma() {
  const root = mkdtempSync(join(tmpdir(), "watchnext-prisma-identity-"));
  roots.push(root);
  const database = join(root, "identity.sqlite");
  const native = new DatabaseSync(database);
  try { migrate(native); } finally { native.close(); }
  process.env.WATCHNEXT_HTTP_MEMORY = "1";
  process.env.WATCHNEXT_HTTP_REPOSITORY = "prisma";
  process.env.WATCHNEXT_HTTP_PRISMA_ISOLATED = "1";
  process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL = `file:${database.replace(/\\/g, "/")}`;
  return database;
}

afterEach(async () => {
  resetHttpMemoryForTests();
  await resetPrismaIdentityForTests();
  delete process.env.WATCHNEXT_HTTP_MEMORY;
  delete process.env.WATCHNEXT_HTTP_REPOSITORY;
  delete process.env.WATCHNEXT_HTTP_PRISMA_ISOLATED;
  delete process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL;
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("persists account, group, invitation and legacy context across a clean service restart", async () => {
  const database = setupPrisma();
  const registered = await handleMemory(request("auth/register", { username: "Prisma.Owner", password, confirmation: password }), ["auth", "register"]);
  expect(registered.status).toBe(200);
  const registration = await registered.json() as any;
  const owner = cookieOf(registered, "watchnext_account_session");
  const group = await handleMemory(request("groups", { expectedContextRevision: 1, name: "Prisma group" }, owner), ["groups"]);
  expect(group.status).toBe(200);
  const groupValue = await group.json() as any;
  expect((await handleMemory(request("context", undefined, owner, "GET"), ["context"])).status).toBe(200);
  expect((await handleMemory(request("context/group-selection", { expectedContextRevision: 2, groupId: groupValue.context.groupId }, owner, "PUT"), ["context", "group-selection"])).status).toBe(200);
  expect((await handleMemory(request("context/mode", { expectedContextRevision: 3, mode: "account" }, owner, "PUT"), ["context", "mode"])).status).toBe(200);
  const second = await handleMemory(request("auth/register", { username: "Prisma.Member", password, confirmation: password }), ["auth", "register"]);
  const memberCookie = cookieOf(second, "watchnext_account_session");
  expect((await handleMemory(request("invitations/resolve", { invite: groupValue.invite }, memberCookie), ["invitations", "resolve"])).status).toBe(200);
  // Pending invitation intent is durable too: a fresh process can continue the same account join.
  resetHttpMemoryForTests(); await resetPrismaIdentityForTests();
  expect((await handleMemory(request("groups/pending/join", { expectedContextRevision: 1 }, memberCookie), ["groups", "pending", "join"])).status).toBe(200);
  const legacy = await handleMemory(request("legacy/groups", { name: "Prisma legacy" }), ["legacy", "groups"]);
  const legacyValue = await legacy.json() as any;
  const opened = await handleMemory(request("invitations/resolve", { invite: legacyValue.invite }), ["invitations", "resolve"]);
  const legacyCookie = cookieOf(opened, "watchnext_session");
  const profile = await handleMemory(request("legacy/groups/current/profiles", { expectedContextRevision: 1, name: "Legacy Sam", color: "teal" }, legacyCookie), ["legacy", "groups", "current", "profiles"]);
  expect(profile.status).toBe(200); const profileValue = await profile.json() as any;
  expect((await handleMemory(request("legacy/context/profile", { expectedContextRevision: 2, profileId: profileValue.profileId }, legacyCookie, "PUT"), ["legacy", "context", "profile"])).status).toBe(200);
  expect((await handleMemory(request("not-a-route", undefined, owner, "GET"), ["not-a-route"])).status).toBe(404);
  resetHttpMemoryForTests(); await resetPrismaIdentityForTests();
  expect((await handleMemory(request("groups/current", undefined, memberCookie, "GET"), ["groups", "current"])).status).toBe(200);
  expect((await handleMemory(request("legacy/groups/current/profiles", undefined, legacyCookie, "GET"), ["legacy", "groups", "current", "profiles"])).status).toBe(200);
  const db = new DatabaseSync(database);
  try {
    expect(db.prepare("SELECT count(*) AS count FROM accounts").get()).toMatchObject({ count: 2 });
    expect(db.prepare("SELECT count(*) AS count FROM account_memberships").get()).toMatchObject({ count: 2 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(JSON.stringify(db.prepare("SELECT password_hash,recovery_digest FROM accounts").all())).not.toContain(registration.recoveryCode);
  } finally { db.close(); }
});

it("keeps removal, rotation and newer-generation rejoin authorization server-derived", async () => {
  setupPrisma();
  const ownerRegistration = await handleMemory(request("auth/register", { username: "Owner.Rotation", password, confirmation: password }), ["auth", "register"]);
  const owner = cookieOf(ownerRegistration, "watchnext_account_session");
  const created = await handleMemory(request("groups", { expectedContextRevision: 1, name: "Rotating group" }, owner), ["groups"]);
  const first = await created.json() as any;
  const memberRegistration = await handleMemory(request("auth/register", { username: "Member.Rotation", password, confirmation: password }), ["auth", "register"]);
  const member = cookieOf(memberRegistration, "watchnext_account_session");
  await handleMemory(request("invitations/resolve", { invite: first.invite }, member), ["invitations", "resolve"]);
  const joined = await handleMemory(request("groups/pending/join", { expectedContextRevision: 1 }, member), ["groups", "pending", "join"]);
  const joinedValue = await joined.json() as any;
  const memberId = joinedValue.members.find((entry: any) => entry.name === "Member.Rotation").id;
  const rotated = await handleMemory(request("groups/current/invitations/rotate", { expectedContextRevision: 2, confirmed: true, generation: 1 }, owner), ["groups", "current", "invitations", "rotate"]);
  expect(rotated.status).toBe(200); const rotatedValue = await rotated.json() as any;
  expect((await handleMemory(request("groups/current/members/remove", { expectedContextRevision: 3, memberId, confirmed: true }, owner), ["groups", "current", "members", "remove"])).status).toBe(200);
  expect((await handleMemory(request("groups/current", undefined, member, "GET"), ["groups", "current"])).status).toBeGreaterThanOrEqual(400);
  // Removal happened at generation 2, so its replacement invite must advance once more.
  const replacement = await handleMemory(request("groups/current/invitations/rotate", { expectedContextRevision: 3, confirmed: true, generation: 2 }, owner), ["groups", "current", "invitations", "rotate"]);
  expect(replacement.status).toBe(200); const replacementValue = await replacement.json() as any;
  const relogin = await handleMemory(request("auth/login", { username: "Member.Rotation", password }), ["auth", "login"]);
  const newMember = cookieOf(relogin, "watchnext_account_session");
  expect((await handleMemory(request("invitations/resolve", { invite: rotatedValue.invite }, newMember), ["invitations", "resolve"])).status).toBeGreaterThanOrEqual(400);
  expect((await handleMemory(request("invitations/resolve", { invite: replacementValue.invite }, newMember), ["invitations", "resolve"])).status).toBe(200);
  expect((await handleMemory(request("groups/pending/join", { expectedContextRevision: 1 }, newMember), ["groups", "pending", "join"])).status).toBe(200);
});

it("keeps memory transient while Prisma preserves recovery logout and duplicate-write outcomes", async () => {
  process.env.WATCHNEXT_HTTP_MEMORY = "1";
  const transient = await handleMemory(request("auth/register", { username: "Memory.User", password, confirmation: password }), ["auth", "register"]);
  const transientCookie = cookieOf(transient, "watchnext_account_session");
  resetHttpMemoryForTests();
  expect((await handleMemory(request("context", undefined, transientCookie, "GET"), ["context"])).status).toBe(200);
  const database = setupPrisma();
  const registered = await handleMemory(request("auth/register", { username: "Prisma.User", password, confirmation: password }), ["auth", "register"]);
  const value = await registered.json() as any;
  const session = cookieOf(registered, "watchnext_account_session");
  expect((await handleMemory(request("groups", { expectedContextRevision: 1, name: "Parity group" }, session), ["groups"])).status).toBe(200);
  expect((await handleMemory(request("auth/register", { username: "Prisma.User", password, confirmation: password }), ["auth", "register"])).status).toBeGreaterThanOrEqual(400);
  expect((await handleMemory(request("auth/recovery", { username: "Prisma.User", proof: value.recoveryCode, password: "Replacement synthetic password", confirmation: "Replacement synthetic password" }), ["auth", "recovery"])).status).toBe(200);
  expect((await handleMemory(request("groups/current", undefined, session, "GET"), ["groups", "current"])).status).toBeGreaterThanOrEqual(400);
  const db = new DatabaseSync(database);
  try { expect(db.prepare("SELECT count(*) AS count FROM accounts").get()).toMatchObject({ count: 1 }); expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]); } finally { db.close(); }
});
