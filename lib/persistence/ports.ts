/**
 * WatchNext repository ports — issue #48 (type-only; see _docs/prisma-baseline.md §10).
 *
 * This module declares the storage-neutral repository contracts that every adapter must satisfy:
 * memory (#44–#46), Prisma SQLite (#49–#51) and the optional PostgreSQL adapter (#52). It has no runtime
 * exports and no imports from node:sqlite, Prisma or generated/, and nothing imports it in #48.
 *
 * Reconciliation rule with #44: #44 is developed in parallel and may introduce its own repository
 * interfaces. Before #49 implementation starts, the #49 PM merges both sets into ONE interface module.
 * Interfaces already used by working #44 HTTP code are canonical for their names and shapes; #48 ports
 * and invariants not covered by #44 are added to that module and duplicate #48 declarations are deleted.
 * Two parallel interface sets must never remain. If #44 has not landed when #49 starts, #49 consumes
 * this module and #44 aligns with it on merge under the same rule.
 *
 * Signature rules:
 * - readonly domain DTOs: string IDs and hashes, boolean (never 0/1), Unix-second number, ISO string;
 * - every method is asynchronous;
 * - concurrency-guarded writes take expected values and return a discriminated WriteResult; driver
 *   errors (SQLite codes, Prisma P-codes) never leak through a port.
 *
 * Portable invariants (domain services and every adapter uphold them; #49/#50 share one contract suite):
 * - live session/membership/context authority is checked on every request;
 * - every record is owned by exactly one group and is only reachable inside that group;
 * - one shared title per group identity (manual key or provider pair), with unique contributors;
 * - removing the last own contribution archives the title; restore keeps the same ID and history;
 * - members write only their own progress, rating and note;
 * - no content type or numbering change once member history exists;
 * - a saved timestamp never exceeds the title's current duration at write time;
 * - at most 10 genres per title;
 * - group access mode and owner are immutable; invite generations and context revisions are monotonic;
 * - memberships are never deleted; the owner always stays active; rejoin needs a newer generation;
 * - legacy sessions exist only in legacy groups;
 * - pending invitation intents and review snapshots are consumed at most once;
 * - only hashes of credentials, session tokens, invitation tokens and handles are stored;
 * - metadata expiry clears acquired fields only and never touches member history;
 * - unit-of-work transactions are all-or-nothing and use conditional (compare-and-set) writes.
 *
 * Adapter-specific enforcement (defence in depth beneath the portable checks):
 * - SQLite: STRICT tables, CHECKs, the 18 native triggers, composite foreign keys, PRAGMA secure_delete
 *   before expiry deletes, busy timeout, immediate-lock transaction behaviour and SQLite string semantics.
 * - PostgreSQL (#52, only if it runs): rewritten CHECKs, PL/pgSQL triggers or equivalent constraints,
 *   SERIALIZABLE or row locks with retry; no secure_delete equivalent (documented limit).
 * - Memory: enforced in code; data is lost on restart.
 */

// ---------------------------------------------------------------------------------------------
// Shared result shapes and primitives
// ---------------------------------------------------------------------------------------------

/** Opaque string identifiers. */
export type AccountId = string;
export type GroupId = string;
export type MemberId = string;
export type TitleId = string;
export type InvitationId = string;
/** Lowercase hex SHA-256 digests; raw secrets never cross a port. */
export type Sha256Hex = string;
/** ISO-8601 UTC text timestamp, e.g. 2026-10-20T10:00:00.000Z. */
export type IsoTimestamp = string;
/** Integer Unix seconds (account sessions and pending intents). */
export type UnixSeconds = number;

export type WriteFailureReason = "stale" | "conflict" | "not_found";
export type WriteFailure = { readonly ok: false; readonly reason: WriteFailureReason };
/** Result of every concurrency-guarded write. */
export type WriteResult<T = undefined> = ({ readonly ok: true } & (T extends undefined ? unknown : { readonly value: T })) | WriteFailure;

export type GroupAccessMode = "legacy" | "account";
export type ContentType = "movie" | "series" | "anime" | "youtube";
export type NumberingStyle = "none" | "season_episode" | "continuous";
export type MoodCode = "funny" | "relaxing" | "exciting" | "dark" | "emotional";
export type PositionState = "unknown" | "not_started" | "in_progress";
export type MembershipStatus = "active" | "removed";
export type MetadataFieldName = "title" | "contentType" | "duration" | "genres" | "sourceUrl" | "watchUrl" | "coverUrl";
export type MetadataOrigin = "provider" | "user";

// ---------------------------------------------------------------------------------------------
// Domain DTOs (booleans, never 0/1)
// ---------------------------------------------------------------------------------------------

export type ScryptCredential = {
  readonly version: 1;
  readonly algorithm: "scrypt";
  readonly hash: string;
  readonly salt: string;
  readonly n: number;
  readonly r: number;
  readonly p: number;
  readonly maxmem: number;
};

export type AccountRecord = {
  readonly id: AccountId;
  readonly username: string;
  readonly usernameKey: string;
  readonly credential: ScryptCredential;
  readonly recoveryDigest: Sha256Hex;
  readonly createdAt: IsoTimestamp;
};

export type AccountSessionRecord = {
  readonly tokenHash: Sha256Hex;
  readonly accountId: AccountId;
  readonly createdAt: UnixSeconds;
  readonly expiresAt: UnixSeconds;
  readonly revokedAt: UnixSeconds | null;
  readonly selectedGroupId: GroupId | null;
  readonly contextRevision: number;
};

export type GroupRecord = {
  readonly id: GroupId;
  readonly name: string;
  readonly accessMode: GroupAccessMode;
  readonly ownerAccountId: AccountId | null;
  readonly inviteGeneration: number;
  readonly createdAt: IsoTimestamp;
};

export type MemberRecord = {
  readonly id: MemberId;
  readonly groupId: GroupId;
  readonly name: string;
  readonly nameKey: string;
  readonly avatarColor: string;
  readonly createdAt: IsoTimestamp;
};

export type MembershipRecord = {
  readonly accountId: AccountId;
  readonly groupId: GroupId;
  readonly memberId: MemberId;
  readonly status: MembershipStatus;
  readonly joinedInviteGeneration: number;
  readonly removedInviteGeneration: number | null;
  readonly removedAt: IsoTimestamp | null;
  readonly createdAt: IsoTimestamp;
};

export type InvitationRecord = {
  readonly id: InvitationId;
  readonly groupId: GroupId;
  readonly tokenHash: Sha256Hex;
  readonly generation: number;
  readonly revokedAt: IsoTimestamp | null;
  readonly createdAt: IsoTimestamp;
};

export type PendingInvitationRecord = {
  readonly intentHash: Sha256Hex;
  readonly invitationId: InvitationId;
  readonly expiresAt: UnixSeconds;
};

export type LegacySessionRecord = {
  readonly tokenHash: Sha256Hex;
  readonly groupId: GroupId;
  readonly invitationId: InvitationId;
  readonly activeMemberId: MemberId | null;
  readonly contextRevision: number;
  readonly createdAt: IsoTimestamp;
};

export type ProviderIdentity = { readonly namespace: string; readonly id: string };

export type TitleRecord = {
  readonly id: TitleId;
  readonly groupId: GroupId;
  /** Null only while metadata is unavailable for a provider title. */
  readonly title: string | null;
  readonly titleKey: string | null;
  readonly contentType: ContentType | null;
  readonly durationSeconds: number | null;
  readonly numberingStyle: NumberingStyle;
  readonly provider: ProviderIdentity | null;
  readonly sourceUrl: string | null;
  readonly watchUrl: string | null;
  readonly coverUrl: string | null;
  readonly metadataUnavailable: boolean;
  readonly archived: boolean;
  readonly genres: readonly { readonly key: string; readonly label: string }[];
  readonly moods: readonly MoodCode[];
  readonly createdAt: IsoTimestamp;
};

export type NewTitle = Omit<TitleRecord, "archived" | "createdAt">;
export type TitleMetadataUpdate = Partial<Pick<TitleRecord, "title" | "titleKey" | "contentType" | "durationSeconds" | "numberingStyle" | "sourceUrl" | "watchUrl" | "coverUrl" | "genres" | "moods" | "metadataUnavailable">>;

export type ContributionRecord = {
  readonly groupId: GroupId;
  readonly titleId: TitleId;
  readonly memberId: MemberId;
  readonly createdAt: IsoTimestamp;
};

export type ProgressRecord = {
  readonly groupId: GroupId;
  readonly titleId: TitleId;
  readonly memberId: MemberId;
  readonly numberingStyle: NumberingStyle;
  readonly positionState: PositionState;
  readonly nextSeason: number | null;
  readonly nextEpisode: number | null;
  readonly timestampSeconds: number | null;
  readonly completed: boolean;
};

export type RatingRecord = { readonly groupId: GroupId; readonly titleId: TitleId; readonly memberId: MemberId; readonly score: number };
export type NoteRecord = { readonly groupId: GroupId; readonly titleId: TitleId; readonly memberId: MemberId; readonly body: string };

export type MemberHistory = {
  readonly progress: ProgressRecord | null;
  readonly rating: RatingRecord | null;
  readonly note: NoteRecord | null;
};

export type MetadataFieldRecord = {
  readonly titleId: TitleId;
  readonly field: MetadataFieldName;
  readonly origin: MetadataOrigin;
  readonly cleared: boolean;
  readonly retrievedAt: IsoTimestamp | null;
  readonly expiresAt: IsoTimestamp | null;
};

export type ReviewSnapshotRecord = {
  readonly handleHash: Sha256Hex;
  readonly groupId: GroupId;
  readonly memberId: MemberId;
  /** Either an account or a legacy session hash; deliberately not a foreign key. */
  readonly sessionId: Sha256Hex;
  readonly expiresAt: IsoTimestamp;
  readonly payload: string;
};

export type PickerTitleProjection = Pick<TitleRecord, "id" | "groupId" | "title" | "contentType" | "durationSeconds" | "numberingStyle" | "moods" | "watchUrl" | "createdAt">;
export type PickerProjection = {
  readonly titles: readonly PickerTitleProjection[];
  readonly viewerProgress: readonly ProgressRecord[];
};

/** Scope every group-owned operation: adapters must never cross it. */
export type GroupScope = { readonly groupId: GroupId };

// ---------------------------------------------------------------------------------------------
// Repository ports
// ---------------------------------------------------------------------------------------------

export interface AccountRepository {
  findById(id: AccountId): Promise<AccountRecord | null>;
  findByUsernameKey(usernameKey: string): Promise<AccountRecord | null>;
  /** Fails with `conflict` when the username key is taken. */
  insert(account: Omit<AccountRecord, "createdAt">): Promise<WriteResult<AccountRecord>>;
  /** Compare-and-set on the recovery digest the caller verified. */
  replaceCredentials(input: { readonly accountId: AccountId; readonly expectedRecoveryDigest: Sha256Hex; readonly credential: ScryptCredential; readonly recoveryDigest: Sha256Hex }): Promise<WriteResult>;
}

export interface AccountSessionRepository {
  insert(session: Omit<AccountSessionRecord, "revokedAt" | "selectedGroupId" | "contextRevision">): Promise<WriteResult>;
  /** Unrevoked and unexpired at `now`, or null. */
  findLive(tokenHash: Sha256Hex, now: UnixSeconds): Promise<AccountSessionRecord | null>;
  revoke(tokenHash: Sha256Hex, now: UnixSeconds): Promise<WriteResult>;
  revokeAllForAccountExcept(accountId: AccountId, keepTokenHash: Sha256Hex | null, now: UnixSeconds): Promise<number>;
  /** Advances the context revision only when it still equals `expectedContextRevision`. */
  selectGroup(input: { readonly tokenHash: Sha256Hex; readonly groupId: GroupId | null; readonly expectedContextRevision: number }): Promise<WriteResult<{ readonly contextRevision: number }>>;
}

export interface GroupRepository {
  createLegacy(group: Pick<GroupRecord, "id" | "name">): Promise<WriteResult<GroupRecord>>;
  createAccountGroup(group: Pick<GroupRecord, "id" | "name"> & { readonly ownerAccountId: AccountId }): Promise<WriteResult<GroupRecord>>;
  find(id: GroupId): Promise<GroupRecord | null>;
  /** Monotonic: succeeds only when the current generation equals `expectedGeneration`. */
  advanceInviteGeneration(input: { readonly groupId: GroupId; readonly expectedGeneration: number }): Promise<WriteResult<{ readonly inviteGeneration: number }>>;
}

export interface MemberRepository {
  insert(member: Omit<MemberRecord, "createdAt">): Promise<WriteResult<MemberRecord>>;
  listByGroup(scope: GroupScope): Promise<readonly MemberRecord[]>;
  findByNameKey(scope: GroupScope, nameKey: string): Promise<MemberRecord | null>;
}

export interface MembershipRepository {
  join(input: { readonly accountId: AccountId; readonly groupId: GroupId; readonly memberId: MemberId; readonly inviteGeneration: number }): Promise<WriteResult<MembershipRecord>>;
  /** Never deletes; the owner cannot be removed. */
  remove(input: { readonly accountId: AccountId; readonly groupId: GroupId; readonly atGeneration: number; readonly removedAt: IsoTimestamp }): Promise<WriteResult>;
  /** Requires a generation newer than the removal generation. */
  rejoin(input: { readonly accountId: AccountId; readonly groupId: GroupId; readonly inviteGeneration: number }): Promise<WriteResult<MembershipRecord>>;
  findActive(accountId: AccountId, groupId: GroupId): Promise<MembershipRecord | null>;
  findByMember(memberId: MemberId): Promise<MembershipRecord | null>;
}

export interface InvitationRepository {
  insert(invitation: Omit<InvitationRecord, "revokedAt" | "createdAt">): Promise<WriteResult<InvitationRecord>>;
  resolveByHash(tokenHash: Sha256Hex): Promise<InvitationRecord | null>;
  revokeOlderGenerations(input: { readonly groupId: GroupId; readonly belowGeneration: number; readonly revokedAt: IsoTimestamp }): Promise<number>;
}

export interface PendingInvitationRepository {
  insert(intent: PendingInvitationRecord): Promise<WriteResult>;
  /** Single use: a second consume returns `not_found`. */
  consume(intentHash: Sha256Hex, now: UnixSeconds): Promise<WriteResult<PendingInvitationRecord>>;
  purgeExpired(now: UnixSeconds): Promise<number>;
}

export interface LegacySessionRepository {
  /** Legacy groups only. */
  insert(session: Omit<LegacySessionRecord, "activeMemberId" | "contextRevision" | "createdAt">): Promise<WriteResult>;
  find(tokenHash: Sha256Hex): Promise<LegacySessionRecord | null>;
  selectMember(input: { readonly tokenHash: Sha256Hex; readonly memberId: MemberId | null; readonly expectedContextRevision: number }): Promise<WriteResult<{ readonly contextRevision: number }>>;
}

export interface TitleRepository {
  findByManualIdentity(scope: GroupScope, contentType: ContentType, titleKey: string): Promise<TitleRecord | null>;
  findByProviderIdentity(scope: GroupScope, provider: ProviderIdentity): Promise<TitleRecord | null>;
  findById(scope: GroupScope, id: TitleId): Promise<TitleRecord | null>;
  /** Inserts the title with its moods and at most 10 genres; `conflict` on a duplicate identity. */
  insert(title: NewTitle): Promise<WriteResult<TitleRecord>>;
  /** Refuses type/numbering changes once history exists (`conflict`). */
  updateMetadata(scope: GroupScope, id: TitleId, update: TitleMetadataUpdate): Promise<WriteResult<TitleRecord>>;
  archive(scope: GroupScope, id: TitleId): Promise<WriteResult>;
  /** Restores the same ID with its history. */
  restore(scope: GroupScope, id: TitleId): Promise<WriteResult>;
}

export interface ContributionRepository {
  add(contribution: Omit<ContributionRecord, "createdAt">): Promise<WriteResult>;
  removeOwn(scope: GroupScope, titleId: TitleId, memberId: MemberId): Promise<WriteResult>;
  countRemaining(scope: GroupScope, titleId: TitleId): Promise<number>;
}

export interface PersonalHistoryRepository {
  upsertOwnProgress(progress: ProgressRecord): Promise<WriteResult>;
  clearOwnProgress(scope: GroupScope, titleId: TitleId, memberId: MemberId): Promise<WriteResult>;
  upsertOwnRating(rating: RatingRecord): Promise<WriteResult>;
  clearOwnRating(scope: GroupScope, titleId: TitleId, memberId: MemberId): Promise<WriteResult>;
  upsertOwnNote(note: NoteRecord): Promise<WriteResult>;
  clearOwnNote(scope: GroupScope, titleId: TitleId, memberId: MemberId): Promise<WriteResult>;
  /** Group-visible history for one title, keyed by member. */
  readGroupHistory(scope: GroupScope, titleId: TitleId): Promise<ReadonlyMap<MemberId, MemberHistory>>;
}

export interface MetadataProvenanceRepository {
  recordOrigins(scope: GroupScope, fields: readonly MetadataFieldRecord[]): Promise<WriteResult>;
  recordUserCorrection(scope: GroupScope, titleId: TitleId, field: MetadataFieldName): Promise<WriteResult>;
  /** Bounded batch: clears acquired fields due at `now`; never touches member history. */
  expireDue(now: IsoTimestamp, limit: number): Promise<number>;
}

export interface ReviewSnapshotRepository {
  insert(review: ReviewSnapshotRecord): Promise<WriteResult>;
  /** Single use and bound to group, member and session. */
  consume(input: { readonly handleHash: Sha256Hex; readonly groupId: GroupId; readonly memberId: MemberId; readonly sessionId: Sha256Hex; readonly now: IsoTimestamp }): Promise<WriteResult<ReviewSnapshotRecord>>;
  purgeExpired(now: IsoTimestamp): Promise<number>;
}

export interface PickerProjectionRepository {
  /** Read-only: active titles plus the selected viewers' progress. */
  read(scope: GroupScope, viewerIds: readonly MemberId[]): Promise<PickerProjection>;
}

export type Repositories = {
  readonly accounts: AccountRepository;
  readonly accountSessions: AccountSessionRepository;
  readonly groups: GroupRepository;
  readonly members: MemberRepository;
  readonly memberships: MembershipRepository;
  readonly invitations: InvitationRepository;
  readonly pendingInvitations: PendingInvitationRepository;
  readonly legacySessions: LegacySessionRepository;
  readonly titles: TitleRepository;
  readonly contributions: ContributionRepository;
  readonly personalHistory: PersonalHistoryRepository;
  readonly metadataProvenance: MetadataProvenanceRepository;
  readonly reviewSnapshots: ReviewSnapshotRepository;
  readonly picker: PickerProjectionRepository;
};

export interface UnitOfWork {
  /** All-or-nothing: every write inside `work` commits, or none does. */
  run<T>(work: (repositories: Repositories) => Promise<T>): Promise<T>;
}
