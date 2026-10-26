import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prismaIdentityClient } from "./identity-store";
import type { LibraryHistoryRepository, SavedTitleRecord } from "../repositories/contracts";
import { inspectNoteDraft } from "../note-state";

export type LibraryDraft = {
  title: string; contentType: "movie" | "series" | "anime" | "youtube"; durationSeconds: number;
  numberingStyle: "none" | "season_episode" | "continuous"; genres: string[]; moods: string[];
  watchUrl?: string | null; sourceUrl?: string | null; coverUrl?: string | null;
};
export type ProviderIdentity = { namespace: "youtube" | "kinopoisk_unofficial"; externalId: string };
export type PersonalPatch = Partial<{ positionState: "unknown" | "not_started" | "in_progress"; nextSeason: number | null; nextEpisode: number | null; timestampSeconds: number | null; completed: boolean; rating: number | null; note: string | null }>;
export type DurableReview = { handle: string; groupId: string; memberId: string; sessionId: string; expiresAt: string; payload: Record<string, unknown> };
/** A trusted request projection from #49. It is optional until #51 selects this adapter at runtime. */
export type LibraryAccessContext = { accountId?: string; sessionHash?: string; contextRevision?: number };

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const iso = (value: Date) => value.toISOString();
const fixedMoods = new Set(["funny", "relaxing", "exciting", "dark", "emotional"]);
const titleKey = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();

export class PrismaLibraryError extends Error {}

/**
 * #50 direct content/history/provenance adapter. It is intentionally not selected
 * by the production HTTP composition until #51; every method is portable at the
 * boundary and every durable mutation occurs on one SQLite transaction connection.
 */
export class PrismaLibraryRepository implements LibraryHistoryRepository {
  constructor(private readonly db: PrismaClient = prismaIdentityClient()) {}

  private async write<T>(operation: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRawUnsafe("PRAGMA foreign_keys=ON");
      await tx.$queryRawUnsafe("PRAGMA busy_timeout=5000");
      await tx.$queryRawUnsafe("PRAGMA secure_delete=ON");
      return operation(tx);
    }, { maxWait: 5000, timeout: 8000 });
  }

  private async liveMember(tx: Prisma.TransactionClient, groupId: string, memberId: string, access?: LibraryAccessContext) {
    const member = await tx.member.findUnique({ where: { id_groupId: { id: memberId, groupId } } });
    if (!member) throw new PrismaLibraryError("Member access is unavailable.");
    const accountMembership = await tx.accountMembership.findUnique({ where: { memberId_groupId: { memberId, groupId } } });
    if (accountMembership && accountMembership.status !== "active") throw new PrismaLibraryError("Member access is unavailable.");
    if (access?.accountId) {
      if (!accountMembership || accountMembership.accountId !== access.accountId || accountMembership.status !== "active") throw new PrismaLibraryError("Member access is unavailable.");
      if (access.sessionHash) {
        const session = await tx.accountSession.findUnique({ where: { tokenHash: access.sessionHash } });
        if (!session || session.accountId !== access.accountId || session.selectedGroupId !== groupId || session.revokedAt !== null || Number(session.expiresAt) <= Math.floor(Date.now() / 1000) || (access.contextRevision !== undefined && Number(session.contextRevision) !== access.contextRevision)) throw new PrismaLibraryError("Member access is unavailable.");
      }
    }
    return member;
  }

  private validate(input: LibraryDraft) {
    const title = input.title.normalize("NFKC").trim().replace(/\s+/gu, " ");
    if (!title || [...title].length > 200 || /\p{Cc}/u.test(title)) throw new PrismaLibraryError("Title must contain 1–200 plain characters.");
    if (!["movie", "series", "anime", "youtube"].includes(input.contentType)) throw new PrismaLibraryError("Unsupported content type.");
    if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 1 || input.durationSeconds > 86400) throw new PrismaLibraryError("Duration must be 1–86400 seconds.");
    const episodic = input.contentType === "series" || input.contentType === "anime";
    if (episodic !== (input.numberingStyle === "season_episode" || input.numberingStyle === "continuous")) throw new PrismaLibraryError("Numbering style does not match content type.");
    const moods = [...new Set(input.moods.map((m) => m.toLocaleLowerCase()))];
    if (!moods.length || moods.some((m) => !fixedMoods.has(m))) throw new PrismaLibraryError("Use at least one fixed mood.");
    const genres = [...new Map(input.genres.map((g) => [g.trim().toLocaleLowerCase(), g.trim()])).values()];
    if (genres.length > 10 || genres.some((g) => !g || [...g].length > 40 || /\p{Cc}/u.test(g))) throw new PrismaLibraryError("Use up to ten plain genre labels.");
    return { ...input, title, titleKey: titleKey(title), moods, genres };
  }

  private async dto(titleId: string) {
    const value = await this.db.title.findUnique({ where: { id: titleId }, include: { genres: true, titleMoods: { include: { mood: true } }, contributors: { include: { member: true } }, progress: true, ratings: true, notes: true, metadataFields: true } });
    if (!value) return null;
    return {
      id: value.id, groupId: value.groupId, archived: value.archived, title: value.title, contentType: value.contentType,
      durationSeconds: value.durationSeconds, numberingStyle: value.numberingStyle, provider: value.providerNamespace && value.providerId ? { namespace: value.providerNamespace, externalId: value.providerId } : null,
      genres: value.genres.map((g) => g.label), moods: value.titleMoods.map((m) => m.mood.code),
      contributors: value.contributors.map((c) => ({ id: c.member.id, name: c.member.name })),
      progress: value.progress, ratings: value.ratings, notes: value.notes,
      metadata: value.metadataFields.map((m) => ({ field: m.field, origin: m.origin, cleared: m.cleared, retrievedAt: m.retrievedAt, expiresAt: m.expiresAt })),
    };
  }

  async readTitle(groupId: string, titleId: string): Promise<SavedTitleRecord | null> {
    const title = await this.db.title.findUnique({ where: { id_groupId: { id: titleId, groupId } } });
    return title ? { id: title.id, groupId: title.groupId, archived: title.archived } : null;
  }

  async list(groupId: string, actorMemberId: string, archived = false, mine = false, access?: LibraryAccessContext) {
    await this.write((tx) => this.liveMember(tx, groupId, actorMemberId, access));
    const rows = await this.db.title.findMany({ where: { groupId, archived, ...(mine ? { contributors: { some: { memberId: actorMemberId } } } : {}) }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
    return Promise.all(rows.map((row) => this.dto(row.id)));
  }

  async saveSharedTitle(input: { groupId: string; memberId: string; title: SavedTitleRecord; access?: LibraryAccessContext }): Promise<SavedTitleRecord> {
    return this.write(async (tx) => {
      await this.liveMember(tx, input.groupId, input.memberId, input.access);
      const title = await tx.title.findUnique({ where: { id_groupId: { id: input.title.id, groupId: input.groupId } } });
      if (!title) throw new PrismaLibraryError("Title access is unavailable.");
      await tx.contributor.upsert({ where: { titleId_memberId: { titleId: title.id, memberId: input.memberId } }, create: { groupId: input.groupId, titleId: title.id, memberId: input.memberId }, update: {} });
      if (title.archived) await tx.title.update({ where: { id: title.id }, data: { archived: false } });
      return { id: title.id, groupId: title.groupId, archived: false };
    });
  }

  async save(input: { groupId: string; memberId: string; draft: LibraryDraft; provider?: ProviderIdentity | null; providerFields?: string[]; confirmArchivedId?: string | null; access?: LibraryAccessContext }) {
    const draft = this.validate(input.draft);
    return this.write(async (tx) => {
      await this.liveMember(tx, input.groupId, input.memberId, input.access);
      const existing = input.provider
        ? await tx.title.findFirst({ where: { groupId: input.groupId, providerNamespace: input.provider.namespace, providerId: input.provider.externalId } })
        : await tx.title.findFirst({ where: { groupId: input.groupId, contentType: draft.contentType, titleKey: draft.titleKey } });
      if (existing) {
        if (existing.archived && input.confirmArchivedId !== existing.id) return { kind: "confirmation" as const, id: existing.id };
        await tx.contributor.upsert({ where: { titleId_memberId: { titleId: existing.id, memberId: input.memberId } }, create: { groupId: input.groupId, titleId: existing.id, memberId: input.memberId }, update: {} });
        if (existing.archived) await tx.title.update({ where: { id: existing.id }, data: { archived: false } });
        return { kind: existing.archived ? "restored" as const : "existing" as const, title: await this.titleInTransaction(tx, existing.id) };
      }
      const id = randomUUID();
      await tx.title.create({ data: { id, groupId: input.groupId, title: draft.title, titleKey: draft.titleKey, contentType: draft.contentType, durationSeconds: draft.durationSeconds, numberingStyle: draft.numberingStyle, providerNamespace: input.provider?.namespace ?? null, providerId: input.provider?.externalId ?? null, watchUrl: draft.watchUrl ?? null, sourceUrl: draft.sourceUrl ?? null, coverUrl: draft.coverUrl ?? null } });
      await tx.contributor.create({ data: { groupId: input.groupId, titleId: id, memberId: input.memberId } });
      for (const genre of draft.genres) await tx.titleGenre.create({ data: { titleId: id, genreKey: genre.toLocaleLowerCase(), label: genre } });
      for (const mood of draft.moods) { await tx.mood.upsert({ where: { code: mood }, create: { code: mood, label: mood[0].toUpperCase() + mood.slice(1) }, update: {} }); await tx.titleMood.create({ data: { titleId: id, moodCode: mood } }); }
      const imported = new Set(input.providerFields ?? []);
      for (const field of ["title", "contentType", "duration", "genres", "watchUrl", "sourceUrl", "coverUrl"]) await tx.metadataField.upsert({ where: { titleId_field: { titleId: id, field } }, create: { titleId: id, field, origin: imported.has(field) ? "provider" : "user", retrievedAt: imported.has(field) ? iso(new Date()) : null, expiresAt: imported.has(field) ? iso(new Date(Date.now() + 30 * 86400000)) : null }, update: {} });
      return { kind: "created" as const, title: await this.titleInTransaction(tx, id) };
    });
  }

  private async titleInTransaction(tx: Prisma.TransactionClient, id: string) {
    const title = await tx.title.findUnique({ where: { id }, include: { genres: true, titleMoods: { include: { mood: true } }, contributors: { include: { member: true } }, progress: true, ratings: true, notes: true, metadataFields: true } });
    if (!title) throw new PrismaLibraryError("Saved title is unavailable.");
    return title;
  }

  async removeContribution(groupId: string, memberId: string, titleId: string, access?: LibraryAccessContext) {
    return this.write(async (tx) => {
      await this.liveMember(tx, groupId, memberId, access);
      const title = await tx.title.findUnique({ where: { id_groupId: { id: titleId, groupId } } }); if (!title) throw new PrismaLibraryError("Title access is unavailable.");
      await tx.contributor.deleteMany({ where: { titleId, memberId } });
      const left = await tx.contributor.count({ where: { titleId } });
      if (!left) await tx.title.update({ where: { id: titleId }, data: { archived: true } });
      return { archived: left === 0, titleId };
    });
  }

  async patchPersonal(groupId: string, memberId: string, titleId: string, patch: PersonalPatch, access?: LibraryAccessContext) {
    return this.write(async (tx) => {
      await this.liveMember(tx, groupId, memberId, access);
      const title = await tx.title.findUnique({ where: { id_groupId: { id: titleId, groupId } } }); if (!title || title.archived) throw new PrismaLibraryError("Personal progress is unavailable.");
      if (patch.rating != null && (!Number.isInteger(patch.rating) || patch.rating < 1 || patch.rating > 10)) throw new PrismaLibraryError("Rating must be a whole number from 1 to 10.");
      if (patch.note != null) {
        const note = inspectNoteDraft(patch.note);
        if (note.error || !note.normalized) throw new PrismaLibraryError(note.error ?? "Note cannot be empty.");
        patch = { ...patch, note: note.normalized };
      }
      const progress = await tx.progress.upsert({ where: { titleId_memberId: { titleId, memberId } }, create: { groupId, titleId, memberId, numberingStyle: title.numberingStyle }, update: {} });
      const progressPatch: Prisma.ProgressUpdateInput = {};
      for (const key of ["positionState", "nextSeason", "nextEpisode", "timestampSeconds", "completed"] as const) if (key in patch) (progressPatch as Record<string, unknown>)[key] = patch[key];
      if (Object.keys(progressPatch).length) await tx.progress.update({ where: { titleId_memberId: { titleId, memberId } }, data: progressPatch });
      if ("rating" in patch) { if (patch.rating == null) await tx.rating.deleteMany({ where: { titleId, memberId } }); else await tx.rating.upsert({ where: { titleId_memberId: { titleId, memberId } }, create: { groupId, titleId, memberId, score: patch.rating }, update: { score: patch.rating } }); }
      if ("note" in patch) { if (patch.note == null) await tx.note.deleteMany({ where: { titleId, memberId } }); else await tx.note.upsert({ where: { titleId_memberId: { titleId, memberId } }, create: { groupId, titleId, memberId, body: patch.note }, update: { body: patch.note } }); }
      return this.titleInTransaction(tx, titleId);
    });
  }

  async createReview(input: { groupId: string; memberId: string; sessionId: string; payload: Record<string, unknown>; expiresAt?: Date; access?: LibraryAccessContext }) : Promise<DurableReview> {
    return this.write(async (tx) => {
      await this.liveMember(tx, input.groupId, input.memberId, input.access);
      await tx.metadataReview.deleteMany({ where: { expiresAt: { lte: iso(new Date()) } } });
      const raw = randomBytes(32).toString("base64url"), expiresAt = input.expiresAt ?? new Date(Date.now() + 600000);
      const pending = await tx.metadataReview.count({ where: { groupId: input.groupId, memberId: input.memberId, sessionId: input.sessionId, expiresAt: { gt: iso(new Date()) } } });
      if (pending >= 20) throw new PrismaLibraryError("Too many pending metadata reviews.");
      await tx.metadataReview.create({ data: { handleHash: hash(raw), groupId: input.groupId, memberId: input.memberId, sessionId: input.sessionId, expiresAt: iso(expiresAt), payload: JSON.stringify(input.payload) } });
      return { handle: raw, groupId: input.groupId, memberId: input.memberId, sessionId: input.sessionId, expiresAt: iso(expiresAt), payload: input.payload };
    });
  }

  async consumeReview(input: { handle: string; groupId: string; memberId: string; sessionId: string; access?: LibraryAccessContext }) {
    return this.write(async (tx) => {
      await this.liveMember(tx, input.groupId, input.memberId, input.access);
      const handleHash = hash(input.handle);
      const review = await tx.metadataReview.findUnique({ where: { handleHash } });
      if (!review || review.groupId !== input.groupId || review.memberId !== input.memberId || review.sessionId !== input.sessionId) throw new PrismaLibraryError("This review is no longer available.");
      if (review.expiresAt <= iso(new Date())) { await tx.metadataReview.delete({ where: { handleHash } }); throw new PrismaLibraryError("This review is no longer available."); }
      await tx.metadataReview.delete({ where: { handleHash } });
      let payload: unknown; try { payload = JSON.parse(review.payload); } catch { throw new PrismaLibraryError("This review is no longer available."); }
      return payload as Record<string, unknown>;
    });
  }

  async clearExpiredMetadata(at = new Date()) {
    return this.write(async (tx) => {
      const fields = await tx.metadataField.findMany({ where: { origin: "provider", expiresAt: { lte: iso(at) }, cleared: false } });
      for (const field of fields) {
        // The native lifecycle permits partial retained user data alongside
        // metadataUnavailable. Never touch a field whose origin is user.
        const clear: Prisma.TitleUpdateInput = field.field === "title" ? { title: null, titleKey: null, metadataUnavailable: true }
          : field.field === "contentType" ? { contentType: null, metadataUnavailable: true }
            : field.field === "duration" ? { durationSeconds: null, metadataUnavailable: true }
              : field.field === "sourceUrl" ? { sourceUrl: null }
                : field.field === "watchUrl" ? { watchUrl: null }
                  : field.field === "coverUrl" ? { coverUrl: null } : {};
        if (field.field === "genres") await tx.titleGenre.deleteMany({ where: { titleId: field.titleId } });
        if (Object.keys(clear).length) await tx.title.update({ where: { id: field.titleId }, data: clear });
        await tx.metadataField.update({ where: { titleId_field: { titleId: field.titleId, field: field.field } }, data: { cleared: true } });
      }
      await tx.metadataReview.deleteMany({ where: { expiresAt: { lte: iso(at) } } });
      return fields.length;
    });
  }

  async pickerProjection(groupId: string, actorMemberId: string, memberIds: string[], access?: LibraryAccessContext) {
    await this.write((tx) => this.liveMember(tx, groupId, actorMemberId, access));
    const titles = await this.db.title.findMany({ where: { groupId, archived: false }, include: { titleMoods: { include: { mood: true } }, progress: true } });
    return { titles: titles.map((title) => ({ id: title.id, groupId: title.groupId, archived: title.archived, title: title.title, contentType: title.contentType, durationSeconds: title.durationSeconds, numberingStyle: title.numberingStyle, moods: title.titleMoods.map((m) => m.mood.code), createdAt: title.createdAt })), progress: titles.flatMap((title) => title.progress.filter((row) => memberIds.includes(row.memberId))) };
  }
}
