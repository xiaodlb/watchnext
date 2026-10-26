/**
 * The #51 production composition.  Identity/group routes remain in the #49
 * adapter; this file owns every content/history route and deliberately talks
 * only to the #50 Prisma repository/client.  It must never delegate a Prisma
 * request to the process-memory HTTP service.
 */
import { createHash, randomUUID } from "node:crypto";
import { AuthError } from "../accounts/security";
import { rankCandidates } from "../picker/ranking";
import { PrismaLibraryError, PrismaLibraryRepository, type LibraryDraft, type PersonalPatch } from "./library-store";
import { prismaIdentityClient, verifyPrismaIdentityAdapter } from "./identity-store";
import { handlePrismaIdentity } from "./identity-service";
import { metadataProvidersForHttp } from "../http-memory/service";
import { lookupMetadata } from "../metadata/lookup";

type Input = Record<string, unknown>;
type Context = { mode: "account" | "legacy"; groupId: string; memberId: string | null; revision: number; accountId: string | null; sessionHash: string; sessionId: string };
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const now = () => Math.floor(Date.now() / 1000);
const origin = () => process.env.WATCHNEXT_APP_ORIGIN ?? "http://127.0.0.1:3000";
const json = (value: unknown, status = 200, headers: HeadersInit = {}) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", ...headers } });
const fail = (status: number, message: string) => json({ error: { code: status === 409 ? "conflict" : "validation_failed", message, retryable: false } }, status);
const cookie = (request: Request, name: string) => {
  const values = (request.headers.get("cookie") ?? "").split(";").map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : undefined;
};
const contextDto = (c: Context) => ({ mode: c.mode, revision: c.revision, groupId: c.groupId });
function expected(input: Input, c: Context) { if (input.expectedContextRevision !== c.revision) throw new AuthError("This form is stale. Reload and try again."); }
async function input(request: Request): Promise<Input> {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("content-type") ?? "")) throw new AuthError("Request body must be JSON.");
  const text = await request.text();
  if (Buffer.byteLength(text) > 4096) throw new AuthError("Request body is too large.");
  try { const parsed: unknown = JSON.parse(text || "{}"); if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") throw Error(); return parsed as Input; } catch { throw new AuthError("Request body is invalid."); }
}
function requireMutation(request: Request) { if (request.method === "GET" || request.headers.get("origin") !== origin() || request.headers.get("sec-fetch-site") === "cross-site") throw new AuthError("Request origin is not allowed."); }
function libraryInput(value: Input): LibraryDraft {
  if (typeof value.title !== "string" || typeof value.contentType !== "string" || !Number.isInteger(value.durationSeconds) || typeof value.numberingStyle !== "string" || !Array.isArray(value.genres) || !Array.isArray(value.moods)) throw new AuthError("The saved title is invalid.");
  return { title: value.title, contentType: value.contentType as LibraryDraft["contentType"], durationSeconds: value.durationSeconds as number, numberingStyle: value.numberingStyle as LibraryDraft["numberingStyle"], genres: value.genres.filter((v): v is string => typeof v === "string"), moods: value.moods.filter((v): v is string => typeof v === "string"), watchUrl: typeof value.watchUrl === "string" ? value.watchUrl : null, sourceUrl: typeof value.sourceUrl === "string" ? value.sourceUrl : null, coverUrl: typeof value.coverUrl === "string" ? value.coverUrl : null };
}
function safeUrl(value: string | null) { try { if (!value) return null; const parsed = new URL(value); return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : null; } catch { return null; } }
const palette = new Map([["#2563eb", "blue"], ["#7c3aed", "purple"], ["#0f766e", "teal"], ["#e11d48", "rose"], ["#d97706", "amber"], ["#475569", "slate"]]);
const memberDto = (m: any) => ({ id: m.id, name: m.name, color: palette.get(String(m.avatarColor).toLowerCase()) ?? m.avatarColor, ...(m.inactive ? { inactive: true } : {}) });

async function context(request: Request, write = false): Promise<Context> {
  const db = prismaIdentityClient();
  const accountRaw = cookie(request, "watchnext_account_session");
  if (accountRaw) {
    const session: any = await db.accountSession.findUnique({ where: { tokenHash: hash(accountRaw) }, include: { account: true } });
    if (!session || session.revokedAt !== null || Number(session.expiresAt) <= now() || !session.selectedGroupId) throw new AuthError("Current group access is unavailable.");
    const membership: any = await db.accountMembership.findUnique({ where: { accountId_groupId: { accountId: session.accountId, groupId: session.selectedGroupId } } });
    if (!membership || membership.status !== "active" || membership.groupMode !== "account") throw new AuthError("Current group access is unavailable.");
    return { mode: "account", groupId: membership.groupId, memberId: membership.memberId, revision: Number(session.contextRevision), accountId: session.accountId, sessionHash: session.tokenHash, sessionId: session.tokenHash };
  }
  const legacyRaw = cookie(request, "watchnext_session");
  const session: any = legacyRaw && await db.groupSession.findUnique({ where: { tokenHash: hash(legacyRaw) } });
  if (!session) throw new AuthError("Legacy access is required.");
  if (write && !session.activeMemberId) throw new AuthError("Choose a profile before changing this library.");
  return { mode: "legacy", groupId: session.groupId, memberId: session.activeMemberId, revision: Number(session.contextRevision), accountId: null, sessionHash: session.tokenHash, sessionId: session.tokenHash };
}
function access(c: Context) { return c.mode === "account" ? { accountId: c.accountId!, sessionHash: c.sessionHash, contextRevision: c.revision } : undefined; }
async function rawTitle(id: string, c: Context) {
  const db = prismaIdentityClient();
  const t: any = await db.title.findUnique({ where: { id_groupId: { id, groupId: c.groupId } }, include: { genres: true, titleMoods: { include: { mood: true } }, contributors: { include: { member: true } }, progress: true, ratings: true, notes: true, metadataFields: true } });
  if (!t) throw new AuthError("Title access is unavailable.");
  return t;
}
function revision(t: any) {
  const material = JSON.stringify([t.title, t.contentType, t.durationSeconds, t.numberingStyle, t.archived, t.watchUrl, t.sourceUrl, t.coverUrl, t.genres.map((x: any) => x.label).sort(), t.titleMoods.map((x: any) => x.moodCode).sort(), t.contributors.map((x: any) => x.memberId).sort(), t.metadataFields.map((x: any) => [x.field, x.origin, x.cleared]).sort()]);
  return parseInt(hash(material).slice(0, 12), 16) % 900000000;
}
function dto(t: any, c: Context) {
  const progress = new Map(t.progress.map((x: any) => [x.memberId, x])); const ratings = new Map(t.ratings.map((x: any) => [x.memberId, x])); const notes = new Map(t.notes.map((x: any) => [x.memberId, x]));
  const contributors = t.contributors.map((x: any) => memberDto(x.member));
  const members = new Map(t.contributors.map((x: any) => [x.member.id, x.member]));
  for (const x of t.progress) if (!members.has(x.memberId)) members.set(x.memberId, { id: x.memberId, name: "Former member", avatarColor: "slate", inactive: true });
  for (const x of t.ratings) if (!members.has(x.memberId)) members.set(x.memberId, { id: x.memberId, name: "Former member", avatarColor: "slate", inactive: true });
  for (const x of t.notes) if (!members.has(x.memberId)) members.set(x.memberId, { id: x.memberId, name: "Former member", avatarColor: "slate", inactive: true });
  const personal = (memberId: string) => { const p: any = progress.get(memberId); const r: any = ratings.get(memberId); const n: any = notes.get(memberId); return { positionState: p?.positionState ?? "unknown", nextSeason: p?.nextSeason ?? null, nextEpisode: p?.nextEpisode ?? null, timestampSeconds: p?.timestampSeconds ?? null, completed: p?.completed ?? false, rating: r?.score ?? null, note: n?.body ?? null }; };
  const own = c.memberId && t.contributors.some((x: any) => x.memberId === c.memberId);
  return { id: t.id, groupId: t.groupId, revision: revision(t), archived: t.archived, title: t.title, contentType: t.contentType, durationSeconds: t.durationSeconds, numberingStyle: t.numberingStyle, genres: t.genres.map((x: any) => x.label), moods: t.titleMoods.map((x: any) => x.moodCode), watchUrl: safeUrl(t.watchUrl), sourceUrl: safeUrl(t.sourceUrl), coverUrl: safeUrl(t.coverUrl), contributors, history: [...members.values()].map((m: any) => ({ ...memberDto(m), ...personal(m.id) })), personal: c.memberId ? personal(c.memberId) : null, canEdit: !t.archived && !!own, canRemove: !t.archived && !!own, canRefresh: !t.archived && !!own && !!t.providerNamespace, canRestore: t.archived && !!c.memberId };
}
async function titleDto(id: string, c: Context) { return dto(await rawTitle(id, c), c); }
async function responseTitle(id: string, c: Context, status = 200) { const title = await titleDto(id, c); return json({ title, own: title.personal, history: title.history, context: contextDto(c) }, status); }

async function updateTitle(id: string, c: Context, value: Input) {
  if (!c.memberId) throw new AuthError("Choose a profile before changing this library.");
  const before = await rawTitle(id, c); expected(value, c); if (value.revision !== revision(before)) throw new AuthError("This title changed while you were editing.");
  if (before.archived || !before.contributors.some((x: any) => x.memberId === c.memberId)) throw new AuthError("Only contributors can edit this title.");
  const draft = libraryInput(value); const normalized = draft.title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase();
  const identityChanged = before.titleKey !== normalized || before.contentType !== draft.contentType;
  if (identityChanged && value.identityChangeConfirmed !== true) return json({ status: "confirmation", title: dto(before, c), context: contextDto(c) });
  const db = prismaIdentityClient();
  await db.$transaction(async (tx: any) => {
    const duplicate = await tx.title.findFirst({ where: { groupId: c.groupId, contentType: draft.contentType, titleKey: normalized, NOT: { id } } }); if (duplicate) throw new AuthError("Another saved title uses this name and type.");
    await tx.title.update({ where: { id }, data: { title: draft.title.normalize("NFKC").trim().replace(/\s+/gu, " "), titleKey: normalized, contentType: draft.contentType, durationSeconds: draft.durationSeconds, numberingStyle: draft.numberingStyle, watchUrl: draft.watchUrl ?? null, sourceUrl: draft.sourceUrl ?? null, coverUrl: draft.coverUrl ?? null } });
    await tx.titleGenre.deleteMany({ where: { titleId: id } }); for (const label of [...new Map(draft.genres.map(label => [label.toLocaleLowerCase(), label])).values()]) await tx.titleGenre.create({ data: { titleId: id, genreKey: label.toLocaleLowerCase(), label } });
    await tx.titleMood.deleteMany({ where: { titleId: id } }); for (const code of [...new Set(draft.moods.map(v => v.toLocaleLowerCase()))]) { await tx.mood.upsert({ where: { code }, create: { code, label: code[0].toUpperCase() + code.slice(1) }, update: {} }); await tx.titleMood.create({ data: { titleId: id, moodCode: code } }); }
    for (const field of ["title", "contentType", "duration", "genres", "watchUrl", "sourceUrl", "coverUrl"]) await tx.metadataField.upsert({ where: { titleId_field: { titleId: id, field } }, create: { titleId: id, field, origin: "user", cleared: false }, update: { origin: "user", cleared: false, expiresAt: null } });
  });
  return responseTitle(id, c);
}

async function picker(c: Context, value: Input) {
  if (!c.memberId || !Array.isArray(value.viewerIds) || !value.viewerIds.every(v => typeof v === "string") || !Number.isInteger(value.availableMinutes) || typeof value.mood !== "string" || typeof value.rewatches !== "boolean") throw new AuthError("Choose viewers, whole available minutes, one mood, and a rewatch setting.");
  const db = prismaIdentityClient();
  const members: any[] = c.mode === "account" ? await db.member.findMany({ where: { groupId: c.groupId, accountMembership: { is: { status: "active" } } } }) : await db.member.findMany({ where: { groupId: c.groupId } });
  const titles: any[] = await db.title.findMany({ where: { groupId: c.groupId }, include: { titleMoods: true, progress: true } });
  const ranked = rankCandidates({ groupId: c.groupId, members: members.map(m => ({ id: m.id, groupId: c.groupId })), titles: titles.map(t => ({ id: t.id, groupId: t.groupId, archived: t.archived, title: t.title, contentType: t.contentType, durationSeconds: t.durationSeconds, numberingStyle: t.numberingStyle, moods: t.titleMoods.map((m: any) => m.moodCode), createdAt: t.createdAt })), progress: titles.flatMap(t => t.progress.map((p: any) => ({ titleId: t.id, memberId: p.memberId, groupId: t.groupId, numberingStyle: p.numberingStyle, completed: p.completed, positionState: p.positionState, nextSeason: p.nextSeason, nextEpisode: p.nextEpisode }))), selectedViewerIds: value.viewerIds as string[], availableMinutes: value.availableMinutes as number, mood: value.mood as any, rewatches: value.rewatches });
  if (ranked.kind === "ranked") {
    const candidate = ranked.candidates[0], title = titles.find(value => value.id === candidate.titleId);
    if (!title) throw new AuthError("The selected title is no longer available.");
    return json({ kind: "picked", refreshed: false, candidate: { id: title.id, title: title.title, contentType: title.contentType, durationSeconds: candidate.durationSeconds, watchUrl: safeUrl(title.watchUrl), target: candidate.target, rewatchingViewerIds: candidate.rewatchingViewerIds.map((id: string) => memberDto(members.find(member => member.id === id) ?? { id, name: "Former member", avatarColor: "slate", inactive: true })), tier: candidate.tier, message: candidate.message, availableMinutes: value.availableMinutes, requestedMood: value.mood, rewatches: value.rewatches === true }, cycle: { cycleId: randomUUID(), step: "0" }, context: contextDto(c) });
  }
  if (ranked.kind === "no_match") return json({ kind: "no_match", refreshed: false, message: ranked.message, reasons: ranked.reasons, actions: ranked.actions, context: contextDto(c) });
  throw new AuthError(ranked.message);
}

/** Complete Prisma-selected HTTP surface. Identity is intentionally composed, never copied. */
export async function handlePrismaApplication(request: Request, path: string[]): Promise<Response> {
  const key = path.join("/");
  try {
    verifyPrismaIdentityAdapter();
    // #49 owns all account/group/legacy state transitions.
    if (["context", "auth/register", "auth/login", "auth/logout", "auth/recovery", "groups/current", "groups", "context/group-selection", "invitations/resolve", "groups/pending/join", "context/mode", "groups/current/members/remove", "groups/current/invitations/rotate", "legacy/groups", "legacy/groups/current/profiles", "legacy/context/profile"].some(prefix => key === prefix)) return handlePrismaIdentity(request, path);
    if (request.method !== "GET") requireMutation(request);
    const body = request.method === "GET" ? {} : await input(request);
    const c = await context(request, request.method !== "GET"); const repo = new PrismaLibraryRepository();
    if (key === "library" && request.method === "GET") { const mine = new URL(request.url).searchParams.get("filter") === "mine" && c.mode === "account"; const rows = await repo.list(c.groupId, c.memberId!, false, mine, access(c)); return json({ mode: c.mode, filter: mine ? "mine" : "all", archived: false, notice: null, items: (await Promise.all(rows.filter(Boolean).map((row: any) => titleDto(row.id, c)))), context: contextDto(c) }); }
    if (key === "library/archive" && request.method === "GET") { const rows = await repo.list(c.groupId, c.memberId!, true, false, access(c)); return json({ mode: c.mode, filter: "all", archived: true, notice: null, items: await Promise.all(rows.filter(Boolean).map((row: any) => titleDto(row.id, c))), context: contextDto(c) }); }
    let match = /^library\/([^/]+)$/.exec(key);
    if (match && request.method === "GET") return json({ ...(await titleDto(match[1], c)), context: contextDto(c) });
    if (key === "library/manual" && request.method === "POST") { expected(body, c); if (!c.memberId) throw new AuthError("Choose a profile before changing this library."); const saved = await repo.save({ groupId: c.groupId, memberId: c.memberId, draft: libraryInput(body), access: access(c) }); if (saved.kind === "confirmation") return json({ status: "confirmation", handle: saved.id, context: contextDto(c) }); return json({ status: saved.kind, title: await titleDto((saved as any).title.id, c), context: contextDto(c) }); }
    match = /^library\/confirmations\/([^/]+)\/confirm$/.exec(key);
    if (match && request.method === "POST") { expected(body, c); if (body.confirmed !== true || !c.memberId) throw new AuthError("Explicit confirmation is required."); const saved = await repo.saveSharedTitle({ groupId: c.groupId, memberId: c.memberId, title: { id: match[1], groupId: c.groupId, archived: false }, access: access(c) }); return json({ status: "restored", title: await titleDto(saved.id, c), context: contextDto(c) }); }
    match = /^library\/([^/]+)\/edit$/.exec(key);
    if (match && request.method === "GET") { const t = await rawTitle(match[1], c); if (t.archived || !c.memberId || !t.contributors.some((x: any) => x.memberId === c.memberId)) throw new AuthError("Only contributors can edit this title."); return json({ id: t.id, revision: revision(t), draft: { title: t.title, contentType: t.contentType, durationSeconds: t.durationSeconds, numberingStyle: t.numberingStyle, genres: t.genres.map((g: any) => g.label), moods: t.titleMoods.map((m: any) => m.moodCode), watchUrl: safeUrl(t.watchUrl), sourceUrl: safeUrl(t.sourceUrl), coverUrl: safeUrl(t.coverUrl) }, context: contextDto(c) }); }
    if (match && request.method === "PATCH") return updateTitle(match[1], c, body);
    match = /^library\/([^/]+)\/contribution\/remove$/.exec(key);
    if (match && request.method === "POST") { expected(body, c); if (!c.memberId) throw new AuthError("Choose a profile before changing this library."); const before = await rawTitle(match[1], c); if (body.revision !== revision(before) || body.confirmed !== true) throw new AuthError("This title changed while you were deciding."); await repo.removeContribution(c.groupId, c.memberId, match[1], access(c)); return responseTitle(match[1], c); }
    match = /^library\/archive\/([^/]+)\/restore$/.exec(key);
    if (match && request.method === "POST") { expected(body, c); if (!c.memberId) throw new AuthError("Choose a profile before changing this library."); const before = await rawTitle(match[1], c); if (body.revision !== revision(before)) throw new AuthError("This title changed while you were deciding."); await repo.saveSharedTitle({ groupId: c.groupId, memberId: c.memberId, title: { id: match[1], groupId: c.groupId, archived: false }, access: access(c) }); return responseTitle(match[1], c); }
    match = /^library\/([^/]+)\/progress\/episode$/.exec(key);
    if (match && request.method === "PUT") { expected(body, c); if (!c.memberId) throw new AuthError("Choose a profile before changing this library."); await repo.patchPersonal(c.groupId, c.memberId, match[1], { positionState: body.position === "in_progress" || body.position === "not_started" ? body.position : "unknown", nextSeason: Number.isInteger(body.season) ? body.season as number : null, nextEpisode: Number.isInteger(body.episode) ? body.episode as number : null }, access(c)); return responseTitle(match[1], c); }
    match = /^library\/([^/]+)\/progress\/timestamp$/.exec(key);
    if (match && request.method === "PUT") { expected(body, c); if (!c.memberId || !Number.isInteger(body.timestampSeconds)) throw new AuthError("Choose a whole timestamp."); await repo.patchPersonal(c.groupId, c.memberId, match[1], { timestampSeconds: body.timestampSeconds as number }, access(c)); return responseTitle(match[1], c); }
    if (match && request.method === "DELETE") { expected(body, c); if (!c.memberId) throw new AuthError("Choose a profile before changing this library."); await repo.patchPersonal(c.groupId, c.memberId, match[1], { timestampSeconds: null }, access(c)); return responseTitle(match[1], c); }
    match = /^library\/([^/]+)\/progress\/completed$/.exec(key);
    if (match && request.method === "PUT") { expected(body, c); if (!c.memberId || typeof body.completed !== "boolean") throw new AuthError("Choose whether this item is complete."); await repo.patchPersonal(c.groupId, c.memberId, match[1], { completed: body.completed }, access(c)); return responseTitle(match[1], c); }
    match = /^library\/([^/]+)\/rating$/.exec(key);
    if (match && (request.method === "PUT" || request.method === "DELETE")) { expected(body, c); if (!c.memberId) throw new AuthError("Choose a profile before changing this library."); if (request.method === "PUT" && (!Number.isInteger(body.score) || (body.score as number) < 1 || (body.score as number) > 10)) throw new AuthError("Choose a whole rating from 1 to 10."); await repo.patchPersonal(c.groupId, c.memberId, match[1], { rating: request.method === "DELETE" ? null : body.score as number }, access(c)); return responseTitle(match[1], c); }
    match = /^library\/([^/]+)\/note$/.exec(key);
    if (match && (request.method === "PUT" || request.method === "DELETE")) { expected(body, c); if (!c.memberId) throw new AuthError("Choose a profile before changing this library."); if (request.method === "PUT" && typeof body.note !== "string") throw new AuthError("Enter a note."); await repo.patchPersonal(c.groupId, c.memberId, match[1], { note: request.method === "DELETE" ? null : body.note as string }, access(c)); return responseTitle(match[1], c); }
    if (key === "picker/inputs" && request.method === "GET") { const db = prismaIdentityClient(); const members: any[] = c.mode === "account" ? await db.member.findMany({ where: { groupId: c.groupId, accountMembership: { is: { status: "active" } } } }) : await db.member.findMany({ where: { groupId: c.groupId } }); return json({ groupId: c.groupId, mode: c.mode, viewers: members.map(memberDto), canAddTitle: true, context: contextDto(c) }); }
    if (key === "picker/pick" && request.method === "POST") { expected(body, c); return picker(c, body); }
    if (key === "metadata/search" && request.method === "POST") {
      expected(body, c); if (!c.memberId || typeof body.query !== "string" || !body.query.trim() || (body.source !== "youtube" && body.source !== "kinopoisk")) throw new AuthError("Enter a supported metadata search.");
      const source = body.source === "youtube" ? "youtube" : "kinopoisk_unofficial", provider = metadataProvidersForHttp()[source]!, navigation: { next?: string; previous?: string } = {};
      const result: any = await lookupMetadata(provider, body.kind === "link" ? { kind: "detail", externalId: body.query.trim() } : { kind: "search", text: body.query.trim() }, { signal: request.signal, onPage: page => Object.assign(navigation, page) });
      if (result.kind === "no_match") return json({ ...result, context: contextDto(c) });
      if (result.kind === "candidates") { const review = await repo.createPendingPage({ groupId: c.groupId, memberId: c.memberId, sessionId: c.sessionId, scope: source, payload: { source, query: body.query.trim(), candidates: result.candidates, next: navigation.next, previous: navigation.previous, visits: 1 }, access: access(c) }); return json({ handle: review.handle, source: body.source, query: body.query.trim(), page: 1, visits: 1, previous: !!navigation.previous, next: !!navigation.next, candidates: result.candidates, context: contextDto(c) }); }
      if (result.kind === "available" || result.kind === "incomplete") { const review = await repo.createReview({ groupId: c.groupId, memberId: c.memberId, sessionId: c.sessionId, scope: source, payload: { source, item: result.item }, access: access(c) }); return json({ handle: review.handle, source: body.source, providerId: result.item.identity.externalId, draft: { ...result.item, moods: [] }, expiresAt: review.expiresAt, notice: "Review imported fields before saving.", context: contextDto(c) }); }
      return json({ ...result, context: contextDto(c) }, 422);
    }
    match = /^metadata\/pages\/([^/]+)\/candidates\/([^/]+)$/.exec(key);
    if (match && request.method === "POST") {
      expected(body, c); if (!c.memberId) throw new AuthError("Choose a profile before changing this library."); const page: any = await repo.consumePendingPage({ groupId: c.groupId, memberId: c.memberId, sessionId: c.sessionId, handle: match[1], access: access(c) }); const source = page.source === "youtube" ? "youtube" : "kinopoisk_unofficial", candidate = Array.isArray(page.candidates) && page.candidates.find((value: any) => value?.identity?.externalId === match![2]); if (!candidate) throw new AuthError("The selected candidate is unavailable."); const result: any = await lookupMetadata(metadataProvidersForHttp()[source]!, { kind: "detail", externalId: candidate.identity.externalId }, { signal: request.signal }); if (result.kind !== "available" && result.kind !== "incomplete") return json({ ...result, context: contextDto(c) }, 422); const review = await repo.createReview({ groupId: c.groupId, memberId: c.memberId, sessionId: c.sessionId, scope: source, payload: { source, item: result.item }, access: access(c) }); return json({ handle: review.handle, source: page.source, providerId: result.item.identity.externalId, draft: { ...result.item, moods: [] }, expiresAt: review.expiresAt, notice: "Review imported fields before saving.", context: contextDto(c) });
    }
    match = /^metadata\/reviews\/([^/]+)\/save$/.exec(key);
    if (match && request.method === "POST") {
      expected(body, c); if (!c.memberId) throw new AuthError("Choose a profile before changing this library."); const review: any = await repo.consumeReview({ groupId: c.groupId, memberId: c.memberId, sessionId: c.sessionId, handle: match[1], access: access(c) }); const imported = review.item; if (!imported || !review.source) throw new AuthError("This review is no longer available."); const record = { ...body, title: body.title ?? imported.title, contentType: body.contentType ?? imported.contentType, durationSeconds: body.durationSeconds ?? imported.duration?.seconds, genres: body.genres ?? imported.genres, watchUrl: body.watchUrl ?? imported.watchUrl, sourceUrl: body.sourceUrl ?? imported.sourceUrl, coverUrl: body.coverUrl ?? imported.coverUrl }; if ((record.contentType === "series" || record.contentType === "anime") && body.typicalDurationConfirmed !== true) throw new AuthError("Confirm the typical episode duration before saving."); const saved = await repo.save({ groupId: c.groupId, memberId: c.memberId, draft: libraryInput(record), provider: { namespace: review.source, externalId: imported.identity.externalId }, providerFields: ["title", "contentType", "duration", "genres", "watchUrl", "sourceUrl", "coverUrl"], access: access(c) }); if (saved.kind === "confirmation") return json({ status: "confirmation", handle: saved.id, context: contextDto(c) }); return json({ status: saved.kind, title: await titleDto((saved as any).title.id, c), context: contextDto(c) });
    }
    return fail(404, "HTTP operation is unavailable.");
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "The request could not be completed.";
    const status = /stale|access|Authentication|origin|invalid|Current group/i.test(message) ? 409 : 422;
    return fail(status, message);
  }
}
