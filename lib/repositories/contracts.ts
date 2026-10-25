/**
 * #48 portable repository contracts. They deliberately do not expose SQLite connections or Prisma clients.
 * #49 owns implementations for identity/groups; #50 owns title/history/metadata; #51 alone chooses the
 * complete Prisma-backed HTTP application composition.
 */
export type Identity = { accountId: string; username: string };
export type GroupContext = { groupId: string; memberId: string; generation: number };
export type SavedTitleRecord = { id: string; groupId: string; archived: boolean };

export interface IdentityGroupRepository {
  readIdentity(sessionHash: string, now: number): Promise<Identity | null>;
  readContext(identity: Identity, sessionHash: string): Promise<GroupContext | null>;
  createAccountGroup(input: { accountId: string; groupName: string; memberName: string }): Promise<GroupContext>;
}

export interface LibraryHistoryRepository {
  readTitle(groupId: string, titleId: string): Promise<SavedTitleRecord | null>;
  saveSharedTitle(input: { groupId: string; memberId: string; title: SavedTitleRecord }): Promise<SavedTitleRecord>;
}

/** Adapter-local operations which Prisma does not replace. #49/#50 use these through SQLite adapters. */
export interface SQLiteAdapterOperations {
  immediateTransaction<T>(operation: () => Promise<T>): Promise<T>;
  verifyNativeMigrationLedger(): Promise<void>;
  enableSecureDelete(): Promise<void>;
}