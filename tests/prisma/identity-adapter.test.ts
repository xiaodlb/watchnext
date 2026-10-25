// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrate } from "../../db/migrate";
import { handleMemory, resetHttpMemoryForTests } from "../../lib/http-memory/service";
import { resetPrismaIdentityForTests } from "../../lib/http-prisma/identity-store";
import { security } from "../../lib/accounts/security";

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
  expect(relogin.status).toBe(200); const newMember = cookieOf(relogin, "watchnext_account_session");
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

it("keeps every #49 route's invalid method/body parity and atomically rejects a same-revision race", async () => {
  const database = setupPrisma();
  const routes = ["context", "auth/register", "auth/login", "auth/logout", "auth/recovery", "groups", "groups/current", "groups/pending/join", "groups/current/members/remove", "groups/current/invitations/rotate", "invitations/resolve", "context/group-selection", "context/mode", "legacy/groups", "legacy/groups/current/profiles", "legacy/context/profile"];
  for (const path of routes) {
    const prisma = await handleMemory(request(path, undefined, undefined, "GET"), path.split("/"));
    const saved = { memory: process.env.WATCHNEXT_HTTP_MEMORY, repository: process.env.WATCHNEXT_HTTP_REPOSITORY, isolated: process.env.WATCHNEXT_HTTP_PRISMA_ISOLATED, url: process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL };
    process.env.WATCHNEXT_HTTP_MEMORY = "1"; delete process.env.WATCHNEXT_HTTP_REPOSITORY; delete process.env.WATCHNEXT_HTTP_PRISMA_ISOLATED; delete process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL;
    const memory = await handleMemory(request(path, undefined, undefined, "GET"), path.split("/"));
    for (const [name, value] of Object.entries({ WATCHNEXT_HTTP_MEMORY: saved.memory, WATCHNEXT_HTTP_REPOSITORY: saved.repository, WATCHNEXT_HTTP_PRISMA_ISOLATED: saved.isolated, WATCHNEXT_HTTP_PRISMA_DATABASE_URL: saved.url })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    expect(prisma.status).toBe(memory.status);
  }
  const extra = new Request(`${origin}/v1/auth/register`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ username: "Extra.Fields", password, confirmation: password, untrusted: true }) });
  expect((await handleMemory(extra, ["auth", "register"])).status).toBeGreaterThanOrEqual(400);
  const malformed = new Request(`${origin}/v1/auth/register`, { method: "POST", headers: { origin, "content-type": "application/json" }, body: "{" });
  expect((await handleMemory(malformed, ["auth", "register"])).status).toBeGreaterThanOrEqual(400);

  const registered = await handleMemory(request("auth/register", { username: "Race.Owner", password, confirmation: password }), ["auth", "register"]);
  const session = cookieOf(registered, "watchnext_account_session");
  const [first, second] = await Promise.all([
    handleMemory(request("groups", { expectedContextRevision: 1, name: "First race group" }, session), ["groups"]),
    handleMemory(request("groups", { expectedContextRevision: 1, name: "Second race group" }, session), ["groups"]),
  ]);
  expect([first.status, second.status].sort()).toEqual([200, 409]);
  const db = new DatabaseSync(database);
  try {
    expect(db.prepare("SELECT count(*) AS count FROM groups WHERE access_mode='account'").get()).toMatchObject({ count: 1 });
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally { db.close(); }
});

it("matches the complete valid A/G/L operation matrix between memory and selected Prisma", async () => {
  async function scenario(kind: "memory" | "prisma") {
    resetHttpMemoryForTests(); await resetPrismaIdentityForTests();
    // The production rate limit is intentionally process-wide.  This isolated
    // parity fixture must not inherit attempts from the preceding fixtures.
    for (const key of ["all", "memory", "prisma"]) {
      security.signupTotal.clear(key);
      security.recoveryTotal.clear(key);
    }
    if (kind === "prisma") setupPrisma();
    else {
      process.env.WATCHNEXT_HTTP_MEMORY = "1";
      delete process.env.WATCHNEXT_HTTP_REPOSITORY; delete process.env.WATCHNEXT_HTTP_PRISMA_ISOLATED; delete process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL;
    }
    const suffix = kind === "prisma" ? "Prisma" : "Memory";
    const ownerRegister = await handleMemory(request("auth/register", { username: `${suffix}.Owner`, password, confirmation: password }), ["auth", "register"]);
    if (ownerRegister.status !== 200) throw new Error(`${kind} owner registration failed: ${await ownerRegister.text()}`);
    const ownerValue = await ownerRegister.json() as any, owner = cookieOf(ownerRegister, "watchnext_account_session");
    const group = await handleMemory(request("groups", { expectedContextRevision: 1, name: `${suffix} group` }, owner), ["groups"]);
    expect(group.status).toBe(200);
    const groupValue = await group.json() as any;
    const ownerCurrent = await handleMemory(request("groups/current", undefined, owner, "GET"), ["groups", "current"]);
    const selected = await handleMemory(request("context/group-selection", { expectedContextRevision: 2, groupId: groupValue.context.groupId }, owner, "PUT"), ["context", "group-selection"]);
    const mode = await handleMemory(request("context/mode", { expectedContextRevision: 3, mode: "account" }, owner, "PUT"), ["context", "mode"]);
    const memberRegister = await handleMemory(request("auth/register", { username: `${suffix}.Member`, password, confirmation: password }), ["auth", "register"]);
    const member = cookieOf(memberRegister, "watchnext_account_session");
    const resolveAccount = await handleMemory(request("invitations/resolve", { invite: groupValue.invite }, member), ["invitations", "resolve"]);
    const join = await handleMemory(request("groups/pending/join", { expectedContextRevision: 1 }, member), ["groups", "pending", "join"]);
    const joined = await join.json() as any, memberId = joined.members.find((entry: any) => entry.name === `${suffix}.Member`).id;
    const rotate = await handleMemory(request("groups/current/invitations/rotate", { expectedContextRevision: 4, confirmed: true, generation: 1 }, owner), ["groups", "current", "invitations", "rotate"]);
    const remove = await handleMemory(request("groups/current/members/remove", { expectedContextRevision: 5, memberId, confirmed: true }, owner), ["groups", "current", "members", "remove"]);
    const logout = await handleMemory(request("auth/logout", { expectedContextRevision: 2 }, member), ["auth", "logout"]);
    const ownerRecovery = await handleMemory(request("auth/recovery", { username: `${suffix}.Owner`, proof: ownerValue.recoveryCode, password: "Replacement synthetic password", confirmation: "Replacement synthetic password" }), ["auth", "recovery"]);
    const legacyGroup = await handleMemory(request("legacy/groups", { name: `${suffix} legacy` }), ["legacy", "groups"]);
    const legacyValue = await legacyGroup.json() as any;
    const resolveLegacy = await handleMemory(request("invitations/resolve", { invite: legacyValue.invite }), ["invitations", "resolve"]);
    const legacy = cookieOf(resolveLegacy, "watchnext_session");
    const profile = await handleMemory(request("legacy/groups/current/profiles", { expectedContextRevision: 1, name: `${suffix} profile`, color: "teal" }, legacy), ["legacy", "groups", "current", "profiles"]);
    const profileValue = await profile.json() as any;
    const profileRead = await handleMemory(request("legacy/groups/current/profiles", undefined, legacy, "GET"), ["legacy", "groups", "current", "profiles"]);
    const profileSelect = await handleMemory(request("legacy/context/profile", { expectedContextRevision: 2, profileId: profileValue.profileId }, legacy, "PUT"), ["legacy", "context", "profile"]);
    const contextRead = await handleMemory(request("context", undefined, legacy, "GET"), ["context"]);
    return [ownerRegister, group, ownerCurrent, selected, mode, memberRegister, resolveAccount, join, rotate, remove, logout, ownerRecovery, legacyGroup, resolveLegacy, profile, profileRead, profileSelect, contextRead].map((response) => response.status);
  }
  expect(await scenario("memory")).toEqual(await scenario("prisma"));
});

it("denies untrusted, stale, cross-account and cross-mode Prisma identity operations", async () => {
  setupPrisma();
  for (const key of ["all", "memory", "prisma"]) {
    security.signupTotal.clear(key);
    security.recoveryTotal.clear(key);
  }
  const denied = async (response: Promise<Response>) => expect((await response).status).toBeGreaterThanOrEqual(400);

  // Account routes: anonymous group access, bad credentials/recovery and malformed group choice.
  await denied(handleMemory(request("groups", { expectedContextRevision: 1, name: "No session" }), ["groups"]));
  const ownerRegistration = await handleMemory(request("auth/register", { username: "Denied.Owner", password, confirmation: password }), ["auth", "register"]);
  const owner = cookieOf(ownerRegistration, "watchnext_account_session");
  const ownerValue = await ownerRegistration.json() as any;
  await denied(handleMemory(request("auth/register", { username: "Denied.Owner", password, confirmation: password }), ["auth", "register"]));
  await denied(handleMemory(request("auth/login", { username: "Denied.Owner", password: "the wrong password" }), ["auth", "login"]));
  await denied(handleMemory(request("auth/recovery", { username: "Denied.Owner", proof: "not-the-code", password: "Replacement synthetic password", confirmation: "Replacement synthetic password" }), ["auth", "recovery"]));
  await denied(handleMemory(request("groups/current", undefined, undefined, "GET"), ["groups", "current"]));
  await denied(handleMemory(request("groups/pending/join", { expectedContextRevision: 1 }), ["groups", "pending", "join"]));
  await denied(handleMemory(request("invitations/resolve", { invite: `${origin}/invite/not-real` }), ["invitations", "resolve"]));

  const created = await handleMemory(request("groups", { expectedContextRevision: 1, name: "Denied group" }, owner), ["groups"]);
  const group = await created.json() as any;
  await denied(handleMemory(request("context/group-selection", { expectedContextRevision: 2, groupId: "not-a-membership" }, owner, "PUT"), ["context", "group-selection"]));
  await denied(handleMemory(request("context/mode", { expectedContextRevision: 1, mode: "not-a-mode" }, owner, "PUT"), ["context", "mode"]));
  // The stale revision is checked inside the transaction; a concurrent caller cannot overwrite selection.
  await denied(handleMemory(request("context/mode", { expectedContextRevision: 1, mode: "account" }, owner, "PUT"), ["context", "mode"]));

  const memberRegistration = await handleMemory(request("auth/register", { username: "Denied.Member", password, confirmation: password }), ["auth", "register"]);
  const member = cookieOf(memberRegistration, "watchnext_account_session");
  expect((await handleMemory(request("invitations/resolve", { invite: group.invite }, member), ["invitations", "resolve"])).status).toBe(200);
  const joined = await handleMemory(request("groups/pending/join", { expectedContextRevision: 1 }, member), ["groups", "pending", "join"]);
  const joinedValue = await joined.json() as any;
  const ownerMemberId = joinedValue.members.find((entry: any) => entry.name === "Denied.Owner").id;
  // A member cannot manage invitations or remove the owner.
  await denied(handleMemory(request("groups/current/invitations/rotate", { expectedContextRevision: 2, confirmed: true, generation: 1 }, member), ["groups", "current", "invitations", "rotate"]));
  await denied(handleMemory(request("groups/current/members/remove", { expectedContextRevision: 2, confirmed: true, memberId: ownerMemberId }, member), ["groups", "current", "members", "remove"]));

  // Legacy-only paths reject account credentials and an unrelated profile id.
  await denied(handleMemory(request("legacy/groups", { name: "" }), ["legacy", "groups"]));
  await denied(handleMemory(request("legacy/groups/current/profiles", undefined, owner, "GET"), ["legacy", "groups", "current", "profiles"]));
  const legacyGroup = await handleMemory(request("legacy/groups", { name: "Denied legacy" }), ["legacy", "groups"]);
  const legacyInvite = (await legacyGroup.json() as any).invite;
  const legacyResponse = await handleMemory(request("invitations/resolve", { invite: legacyInvite }), ["invitations", "resolve"]);
  const legacy = cookieOf(legacyResponse, "watchnext_session");
  await denied(handleMemory(request("legacy/context/profile", { expectedContextRevision: 1, profileId: "not-a-profile" }, legacy, "PUT"), ["legacy", "context", "profile"]));

  // Logout revokes the durable account session, so every later group read is denied.
  expect((await handleMemory(request("auth/logout", { expectedContextRevision: 2 }, member), ["auth", "logout"])).status).toBe(200);
  await denied(handleMemory(request("groups/current", undefined, member, "GET"), ["groups", "current"]));
  expect(ownerValue.recoveryCode).toEqual(expect.any(String));
});
