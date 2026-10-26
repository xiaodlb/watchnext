/**
 * #48 portable repository contracts. They deliberately do not expose SQLite connections or Prisma clients.
 * #49 owns implementations for identity/groups; #50 owns title/history/metadata; #51 alone chooses the
 * complete Prisma-backed HTTP application composition.
 */
export type Identity = { accountId: string; username: string };
export type GroupContext = { groupId: string; memberId: string; generation: number };
export type SavedTitleRecord = { id: string; groupId: string; archived: boolean };
export type MetadataContextKind = "page" | "review";
export type MetadataContext = { handle: string; kind: MetadataContextKind; groupId: string; memberId: string; sessionId: string; scope: string; expiresAt: string; payload: Record<string, unknown> };
export type MetadataContextInput = { groupId: string; memberId: string; sessionId: string; kind: MetadataContextKind; scope: string; payload: Record<string, unknown>; expiresAt?: Date; parentHandle?: string };
export type MetadataContextClaim = { handle: string; groupId: string; memberId: string; sessionId: string };
export type PickerProjection = { titles: unknown[]; progress: unknown[] };

/** Every #49 HTTP identity/group operation. #50 owns every omitted library path. */
export type IdentityGroupOperationPath =
  | "context"
  | "auth/register" | "auth/login" | "auth/logout" | "auth/recovery"
  | "groups" | "groups/current" | "groups/pending/join"
  | "groups/current/members/remove" | "groups/current/invitations/rotate"
  | "invitations/resolve" | "context/group-selection" | "context/mode"
  | "legacy/groups" | "legacy/groups/current/profiles" | "legacy/context/profile";
export type IdentityGroupOperation = { request: Request; path: IdentityGroupOperationPath };

export interface IdentityGroupRepository {
  /** Executes every account/group/legacy route through the adapter, never a mutable memory projection. */
  execute(operation: IdentityGroupOperation): Promise<Response>;
  readIdentity(sessionHash: string, now: number): Promise<Identity | null>;
  readContext(identity: Identity, sessionHash: string): Promise<GroupContext | null>;
  createAccountGroup(input: { accountId: string; groupName: string; memberName: string }): Promise<GroupContext>;
}

export interface LibraryHistoryRepository {
  readTitle(groupId: string, titleId: string): Promise<SavedTitleRecord | null>;
  saveSharedTitle(input: { groupId: string; memberId: string; title: SavedTitleRecord }): Promise<SavedTitleRecord>;
  /** #50 adapters provide durable list/save/history/review operations without exposing a database handle. */
  list(groupId: string, actorMemberId: string, archived?: boolean, mine?: boolean): Promise<unknown[]>;
  removeContribution(groupId: string, memberId: string, titleId: string): Promise<{ archived: boolean; titleId: string }>;
  patchPersonal(groupId: string, memberId: string, titleId: string, patch: Record<string, unknown>): Promise<unknown>;
  /** Pending metadata page/review snapshots are durable, owner-bound and one-time consumable. */
  createMetadataContext(input: MetadataContextInput): Promise<MetadataContext>;
  consumeMetadataContext(input: MetadataContextClaim, expectedKind: MetadataContextKind): Promise<Record<string, unknown>>;
  clearExpiredMetadata(at?: Date): Promise<number>;
  pickerProjection(groupId: string, actorMemberId: string, memberIds: string[]): Promise<PickerProjection>;
  /** Legacy review aliases preserve the current service's review vocabulary. */
  createReview(input: { groupId: string; memberId: string; sessionId: string; payload: Record<string, unknown>; expiresAt?: Date; scope?: string; parentHandle?: string }): Promise<unknown>;
  consumeReview(input: { handle: string; groupId: string; memberId: string; sessionId: string }): Promise<Record<string, unknown>>;
}

/** Adapter-local operations which Prisma does not replace. #49/#50 use these through SQLite adapters. */
export interface SQLiteAdapterOperations {
  immediateTransaction<T>(operation: () => Promise<T>): Promise<T>;
  verifyNativeMigrationLedger(): Promise<void>;
  enableSecureDelete(): Promise<void>;
}
