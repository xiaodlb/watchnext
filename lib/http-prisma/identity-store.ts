import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";
import type { GroupContext, Identity, IdentityGroupRepository } from "../repositories/contracts";

export type PrismaAccount = {
  id: string; username: string; key: string; password_version: number; password_algorithm: string;
  password_hash: string; password_salt: string; password_n: number; password_r: number;
  password_p: number; password_maxmem: number; recovery: string;
};
export type PrismaSession = { token: string; accountId: string; expires: number; revoked: boolean; revision: number; groupId: string | null };
export type PrismaMember = { id: string; groupId: string; accountId: string | null; name: string; color: string; active: boolean; generation: number; removedAt: number | null };
export type PrismaGroup = { id: string; name: string; kind: "account" | "legacy"; owner: string | null; generation: number };
export type PrismaInvite = { token: string; groupId: string; generation: number; revoked: boolean };
export type PrismaPending = { token: string; groupId: string; generation: number; expires: number; revision: number };
export type PrismaLegacy = { token: string; groupId: string; profileId: string | null; revision: number };
export type PrismaIdentitySnapshot = {
  accounts: PrismaAccount[]; sessions: PrismaSession[]; groups: PrismaGroup[]; members: PrismaMember[];
  invites: PrismaInvite[]; pending: PrismaPending[]; legacy: PrismaLegacy[];
};

const url = () => {
  if (process.env.WATCHNEXT_HTTP_PRISMA_ISOLATED !== "1") throw new Error("Prisma HTTP identity mode is limited to an explicitly isolated owned database in #49.");
  const configured = process.env.WATCHNEXT_HTTP_PRISMA_DATABASE_URL;
  if (!configured || !configured.startsWith("file:")) throw new Error("Prisma HTTP mode requires WATCHNEXT_HTTP_PRISMA_DATABASE_URL=file:<owned temporary database>.");
  return configured;
};

type Cache = { url: string; client: PrismaClient };
const globalCache = globalThis as typeof globalThis & { __watchnextPrismaIdentity?: Cache };
export function prismaIdentityClient() {
  const databaseUrl = url();
  if (globalCache.__watchnextPrismaIdentity?.url === databaseUrl) return globalCache.__watchnextPrismaIdentity.client;
  const created = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  globalCache.__watchnextPrismaIdentity = { url: databaseUrl, client: created };
  return created;
}

/** Adapter-local SQLite setup/ledger check. Prisma maps rows; it does not replace native guards. */
export function verifyPrismaIdentitySQLiteAdapter() {
  const databaseUrl = url();
  const filename = decodeURIComponent(databaseUrl.slice("file:".length).split("?")[0]).replace(/^\/+([A-Za-z]:)/, "$1");
  if (!filename || !/^[A-Za-z]:[\\/]|^\//.test(filename)) throw new Error("Prisma HTTP identity mode requires an absolute owned file path.");
  const db = new DatabaseSync(filename, { open: false });
  try {
    db.open(); db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;");
    const rows = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: string }>;
    if (rows.length !== 5 || rows.map((row) => row.version).join(",") !== "0001,0002,0003,0004,0005") throw new Error("Prisma HTTP identity database must have the immutable native migration ledger.");
  } finally { db.close(); }
}

const bigint = (value: number) => BigInt(value);
const paletteToHex: Record<string, string> = { blue: "#2563eb", purple: "#7c3aed", teal: "#0f766e", rose: "#e11d48", amber: "#d97706", slate: "#475569" };
const hexToPalette = new Map(Object.entries(paletteToHex).map(([name, value]) => [value.toLowerCase(), name]));
const storedColor = (value: string) => paletteToHex[value] ?? value;
const visibleColor = (value: string) => hexToPalette.get(value.toLowerCase()) ?? value;

/** Portable #48 contract implementation; it exposes no Prisma/SQLite value to callers. */
export class PrismaIdentityGroupRepository implements IdentityGroupRepository {
  async readIdentity(sessionHash: string, at: number): Promise<Identity | null> {
    const session = await prismaIdentityClient().accountSession.findUnique({ where: { tokenHash: sessionHash }, include: { account: true } });
    if (!session || session.revokedAt !== null || Number(session.expiresAt) <= at) return null;
    return { accountId: session.accountId, username: session.account.username };
  }

  async readContext(identity: Identity, sessionHash: string): Promise<GroupContext | null> {
    const session = await prismaIdentityClient().accountSession.findUnique({ where: { tokenHash: sessionHash } });
    if (!session || session.accountId !== identity.accountId || session.revokedAt !== null || !session.selectedGroupId) return null;
    const membership = await prismaIdentityClient().accountMembership.findUnique({ where: { accountId_groupId: { accountId: identity.accountId, groupId: session.selectedGroupId } } });
    if (!membership || membership.status !== "active" || membership.groupMode !== "account") return null;
    return { groupId: membership.groupId, memberId: membership.memberId, generation: membership.joinedInviteGeneration };
  }

  async createAccountGroup(input: { accountId: string; groupName: string; memberName: string }): Promise<GroupContext> {
    return prismaIdentityClient().$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { id: input.accountId } });
      if (!account) throw new Error("Account is unavailable.");
      const groupId = randomUUID(), memberId = randomUUID();
      await tx.group.create({ data: { id: groupId, name: input.groupName, accessMode: "account", ownerAccountId: account.id, inviteGeneration: 1 } });
      await tx.member.create({ data: { id: memberId, groupId, name: input.memberName, nameKey: input.memberName.toLocaleLowerCase(), avatarColor: paletteToHex.blue } });
      await tx.accountMembership.create({ data: { accountId: account.id, groupId, groupMode: "account", memberId, status: "active", joinedInviteGeneration: 1 } });
      return { groupId, memberId, generation: 1 };
    });
  }
}

/**
 * #49 identity/group persistence. Prisma owns mapped ordinary reads and writes.
 * The HTTP service obtains a request-local projection, then atomically commits it through this module.
 * Library/history maps are deliberately absent: #50 owns those tables and #51 selects a complete runtime.
 */
export async function readPrismaIdentitySnapshot(): Promise<PrismaIdentitySnapshot> {
  const db = prismaIdentityClient();
  const [accounts, sessions, groups, members, memberships, invitations, pending, legacy] = await Promise.all([
    db.account.findMany(), db.accountSession.findMany(), db.group.findMany(), db.member.findMany(),
    db.accountMembership.findMany(), db.invitation.findMany(), db.pendingGroupInvitation.findMany(), db.groupSession.findMany(),
  ]);
  const membershipByMember = new Map(memberships.map((entry) => [entry.memberId, entry]));
  return {
    accounts: accounts.map((entry) => ({
      id: entry.id, username: entry.username, key: entry.usernameKey, password_version: entry.passwordVersion,
      password_algorithm: entry.passwordAlgorithm, password_hash: entry.passwordHash, password_salt: entry.passwordSalt,
      password_n: entry.passwordN, password_r: entry.passwordR, password_p: entry.passwordP,
      password_maxmem: entry.passwordMaxmem, recovery: entry.recoveryDigest,
    })),
    sessions: sessions.map((entry) => ({ token: entry.tokenHash, accountId: entry.accountId, expires: Number(entry.expiresAt), revoked: entry.revokedAt !== null, revision: Number(entry.contextRevision), groupId: entry.selectedGroupId })),
    groups: groups.map((entry) => ({ id: entry.id, name: entry.name, kind: entry.accessMode as "account" | "legacy", owner: entry.ownerAccountId, generation: entry.inviteGeneration })),
    members: members.map((entry) => {
      const membership = membershipByMember.get(entry.id);
      return { id: entry.id, groupId: entry.groupId, accountId: membership?.accountId ?? null, name: entry.name, color: visibleColor(entry.avatarColor), active: membership?.status !== "removed", generation: membership?.joinedInviteGeneration ?? 1, removedAt: membership?.status === "removed" ? membership.removedInviteGeneration ?? null : null };
    }),
    invites: invitations.map((entry) => ({ token: entry.tokenHash, groupId: entry.groupId, generation: entry.generation, revoked: entry.revokedAt !== null })),
    pending: pending.map((entry) => { const invitation = invitations.find((candidate) => candidate.id === entry.invitationId); const session = sessions.find((candidate) => candidate.tokenHash === entry.intentHash); return { token: entry.intentHash, groupId: invitation?.groupId ?? "", generation: invitation?.generation ?? 0, expires: Number(entry.expiresAt), revision: session ? Number(session.contextRevision) : 0 }; }),
    legacy: legacy.map((entry) => ({ token: entry.tokenHash, groupId: entry.groupId, profileId: entry.activeMemberId, revision: Number(entry.contextRevision) })),
  };
}

/** The only direct adapter-local transaction point. Prisma maps ordinary rows; SQLite transaction semantics stay here. */
export async function writePrismaIdentitySnapshot(snapshot: PrismaIdentitySnapshot): Promise<void> {
  const db = prismaIdentityClient();
  await db.$transaction(async (tx) => {
    // Native triggers and FK constraints remain authoritative. Prisma is used for every mapped ordinary row write.
    for (const account of snapshot.accounts) await tx.account.upsert({ where: { id: account.id }, create: {
      id: account.id, username: account.username, usernameKey: account.key, passwordVersion: account.password_version,
      passwordAlgorithm: account.password_algorithm, passwordHash: account.password_hash, passwordSalt: account.password_salt,
      passwordN: account.password_n, passwordR: account.password_r, passwordP: account.password_p,
      passwordMaxmem: account.password_maxmem, recoveryDigest: account.recovery,
    }, update: {
      username: account.username, usernameKey: account.key, passwordVersion: account.password_version,
      passwordAlgorithm: account.password_algorithm, passwordHash: account.password_hash, passwordSalt: account.password_salt,
      passwordN: account.password_n, passwordR: account.password_r, passwordP: account.password_p,
      passwordMaxmem: account.password_maxmem, recoveryDigest: account.recovery,
    } });
    for (const group of snapshot.groups) await tx.group.upsert({ where: { id: group.id }, create: {
      id: group.id, name: group.name, accessMode: group.kind, inviteGeneration: group.generation,
      ...(group.owner ? { ownerAccount: { connect: { id: group.owner } } } : {}),
    }, update: { name: group.name, inviteGeneration: group.generation } });
    for (const member of snapshot.members) await tx.member.upsert({ where: { id: member.id }, create: {
      id: member.id, groupId: member.groupId, name: member.name, nameKey: member.name.toLocaleLowerCase(), avatarColor: storedColor(member.color),
    }, update: { name: member.name, nameKey: member.name.toLocaleLowerCase(), avatarColor: storedColor(member.color) } });
    for (const member of snapshot.members.filter((entry) => entry.accountId)) {
      await tx.accountMembership.upsert({ where: { accountId_groupId: { accountId: member.accountId!, groupId: member.groupId } }, create: {
        accountId: member.accountId!, groupId: member.groupId, groupMode: "account", memberId: member.id,
        status: member.active ? "active" : "removed", joinedInviteGeneration: member.generation,
        ...(member.active ? {} : { removedInviteGeneration: member.removedAt ?? member.generation, removedAt: new Date().toISOString() }),
      }, update: member.active ? { status: "active", joinedInviteGeneration: member.generation, removedInviteGeneration: null, removedAt: null } : {
        status: "removed", removedInviteGeneration: member.removedAt ?? member.generation, removedAt: new Date().toISOString(),
      } });
    }
    for (const invite of snapshot.invites) await tx.invitation.upsert({ where: { tokenHash: invite.token }, create: {
      id: randomUUID(), groupId: invite.groupId, tokenHash: invite.token, generation: invite.generation,
      ...(invite.revoked ? { revokedAt: new Date().toISOString() } : {}),
    }, update: { generation: invite.generation, revokedAt: invite.revoked ? new Date().toISOString() : null } });
    for (const session of snapshot.sessions) {
      const existing = await tx.accountSession.findUnique({ where: { tokenHash: session.token } });
      if (!existing) await tx.accountSession.create({ data: {
        tokenHash: session.token, accountId: session.accountId, createdAt: bigint(Math.max(0, session.expires - 604800)), expiresAt: bigint(session.expires),
        contextRevision: bigint(session.revision), selectedGroupId: session.groupId,
        ...(session.revoked ? { revokedAt: bigint(Math.max(0, session.expires - 604800)) } : {}),
      } });
      else {
        const update: { expiresAt?: bigint; selectedGroupId?: string | null; revokedAt?: bigint | null; contextRevision?: bigint } = {};
        if (Number(existing.expiresAt) !== session.expires) update.expiresAt = bigint(session.expires);
        if (existing.selectedGroupId !== session.groupId) update.selectedGroupId = session.groupId;
        if ((existing.revokedAt !== null) !== session.revoked) update.revokedAt = session.revoked ? bigint(Math.max(0, session.expires - 604800)) : null;
        if (Number(existing.contextRevision) !== session.revision) update.contextRevision = bigint(session.revision);
        if (Object.keys(update).length) await tx.accountSession.update({ where: { tokenHash: session.token }, data: update });
      }
    }
    for (const legacy of snapshot.legacy) {
      const invitation = snapshot.invites.find((invite) => invite.groupId === legacy.groupId && !invite.revoked);
      if (!invitation) continue;
      const existing = await tx.invitation.findUnique({ where: { tokenHash: invitation.token } });
      if (!existing) continue;
      const prior = await tx.groupSession.findUnique({ where: { tokenHash: legacy.token } });
      if (!prior) await tx.groupSession.create({ data: { tokenHash: legacy.token, groupId: legacy.groupId, invitationId: existing.id, activeMemberId: legacy.profileId, contextRevision: bigint(legacy.revision) } });
      else {
        const update: { activeMemberId?: string | null; contextRevision?: bigint } = {};
        if (prior.activeMemberId !== legacy.profileId) update.activeMemberId = legacy.profileId;
        if (Number(prior.contextRevision) !== legacy.revision) update.contextRevision = bigint(legacy.revision);
        if (Object.keys(update).length) await tx.groupSession.update({ where: { tokenHash: legacy.token }, data: update });
      }
    }
    const retained = new Set(snapshot.pending.map((entry) => entry.token));
    const previous = await tx.pendingGroupInvitation.findMany({ select: { intentHash: true } });
    for (const entry of previous) if (!retained.has(entry.intentHash)) await tx.pendingGroupInvitation.delete({ where: { intentHash: entry.intentHash } });
    for (const entry of snapshot.pending) {
      const group = snapshot.groups.find((item) => item.id === entry.groupId);
      const invitation = snapshot.invites.find((item) => item.groupId === entry.groupId && item.generation === entry.generation && !item.revoked);
      if (!group || !invitation) continue;
      const databaseInvite = await tx.invitation.findUnique({ where: { tokenHash: invitation.token } });
      if (!databaseInvite) continue;
      await tx.pendingGroupInvitation.upsert({ where: { intentHash: entry.token }, create: { intentHash: entry.token, invitationId: databaseInvite.id, expiresAt: bigint(entry.expires) }, update: { invitationId: databaseInvite.id, expiresAt: bigint(entry.expires) } });
    }
  }, { timeout: 10_000 });
}

export async function resetPrismaIdentityForTests() {
  const cached = globalCache.__watchnextPrismaIdentity;
  if (cached) await cached.client.$disconnect();
  delete globalCache.__watchnextPrismaIdentity;
}
