"use client";

/**
 * The real-memory UI adapter.  It deliberately knows only the fixed same-origin
 * `/v1` contract: callers cannot provide an API origin, actor id, mock outcome,
 * reset clock, or database handle.  The server derives authority from cookies.
 */
import type {
  AccountInput, AvatarColor, ContextIdentity, EntryPage, EntryReview, EntrySaved,
  EntrySource, FrontendService, GroupWorkspace, LibraryDraft, LibraryList,
  LibrarySave, LibraryTitle, MockContext, OwnPersonal, PersonalCommit,
  PickerCycleHandle, PickerInput, PickerInputs, PickerOutcome, ProviderOptions,
  RequestOptions, ServiceResult,
} from "./contracts";
import { libraryFilter } from "./contracts";

const instance = "same-origin-http-memory";
// Per browser module only: identifiers are display projections, never sent as authority.
let currentAccountId = "";
let currentMemberId = "";
type Json = Record<string, unknown>;
const cancelled = <T>(): ServiceResult<T> => ({ kind: "cancelled", message: "The request was canceled. No later response was applied." });
const stale = <T>(message = "This workspace changed. Reload the current view before trying again."): ServiceResult<T> => ({ kind: "stale", message });
const identity = (value: unknown): ContextIdentity => {
  const v = value && typeof value === "object" ? value as Json : {};
  const revision = typeof v.revision === "number" && Number.isInteger(v.revision) ? v.revision : 0;
  return { mode: "http", instance, revision };
};
const member = (value: unknown, self = false) => {
  const v = value && typeof value === "object" ? value as Json : {};
  return { id: String(v.id ?? ""), accountId: typeof v.accountId === "string" ? v.accountId : null, name: String(v.name ?? "Former member"), color: (typeof v.color === "string" ? v.color : "slate") as AvatarColor, owner: v.owner === true, you: self, active: v.inactive !== true && v.active !== false, generation: typeof v.generation === "number" ? v.generation : 0, removedAtGeneration: typeof v.removedAt === "number" ? v.removedAt : null, references: { contributions: [], history: [] } };
};
const personal = (raw: unknown, title: Json, me: Json | undefined): OwnPersonal | null => {
  if (!raw || !me?.id) return null;
  const v = raw as Json, kind = title.contentType === "series" || title.contentType === "anime" ? "episode" : "watch";
  return {
    memberId: String(me.id), memberName: String(me.name ?? "You"), recordId: null,
    progress: kind === "episode" ? { kind, numberingStyle: title.numberingStyle === "continuous" ? "continuous" : "season_episode", recorded: true, position: (v.positionState === "in_progress" || v.positionState === "not_started") ? v.positionState : "unknown", season: typeof v.nextSeason === "number" ? v.nextSeason : null, episode: typeof v.nextEpisode === "number" ? v.nextEpisode : null, completed: v.completed === true, metadataUnavailable: title.durationSeconds == null } : { kind, recorded: true, timestampSeconds: typeof v.timestampSeconds === "number" ? v.timestampSeconds : null, completed: v.completed === true, fullDurationSeconds: typeof title.durationSeconds === "number" ? title.durationSeconds : null, runtimeAvailable: typeof title.durationSeconds === "number", beyondDuration: false },
    rating: typeof v.rating === "number" ? v.rating : null, note: typeof v.note === "string" ? v.note : null,
  };
};
const title = (raw: unknown): LibraryTitle => {
  const v = raw && typeof raw === "object" ? raw as Json : {};
  const contributors = Array.isArray(v.contributors) ? v.contributors.map(item => member(item)) : [];
  const historyRaw = Array.isArray(v.history) ? v.history : [];
  const self = contributors.find(item => item.id === currentMemberId) ?? undefined;
  const own = personal(v.personal, v, self);
  const history = historyRaw.map(item => { const x = item && typeof item === "object" ? item as Json : {}; const m = member(x); const p = personal(x, v, { id: m.id, name: m.name }); return { member: m, record: p ? { id: `${String(v.id)}:${m.id}`, memberId: m.id, progress: p.progress?.kind === "episode" ? { kind: "episode" as const, position: p.progress.position, season: p.progress.season, episode: p.progress.episode, completed: p.progress.completed } : p.progress?.kind === "watch" ? { kind: "watch" as const, timestampSeconds: p.progress.timestampSeconds, completed: p.progress.completed } : null, rating: p.rating, note: p.note } : null, beyondDuration: false }; });
  return { id: String(v.id ?? ""), groupId: String(v.groupId ?? ""), revision: typeof v.revision === "number" ? v.revision : 0, createdBy: "", providerId: null, archived: v.archived === true, title: typeof v.title === "string" ? v.title : null, contentType: ["movie", "series", "anime", "youtube"].includes(String(v.contentType)) ? v.contentType as LibraryTitle["contentType"] : null, durationSeconds: typeof v.durationSeconds === "number" ? v.durationSeconds : null, numberingStyle: ["none", "season_episode", "continuous"].includes(String(v.numberingStyle)) ? v.numberingStyle as LibraryTitle["numberingStyle"] : "none", genres: Array.isArray(v.genres) ? v.genres.filter(x => typeof x === "string") as string[] : [], moods: Array.isArray(v.moods) ? v.moods.filter(x => typeof x === "string") as string[] : [], watchUrl: typeof v.watchUrl === "string" ? v.watchUrl : null, sourceUrl: typeof v.sourceUrl === "string" ? v.sourceUrl : null, coverUrl: typeof v.coverUrl === "string" ? v.coverUrl : null, origins: {}, availability: v.archived === true ? "Archived title" : "Saved HTTP-memory title", contributors, history: history.flatMap(x => x.record ? [x.record] : []), historyMembers: history.map(x => x.member), personal: { own, history, writable: Boolean(own) && v.archived !== true, reason: own ? null : "Choose your active member or profile before editing personal records." }, canEdit: v.canEdit === true, canRemove: v.canRemove === true, canRefresh: v.canRefresh === true, canRestore: v.canRestore === true };
};
const contextValue = (data: Json): MockContext => { const raw = data.account && typeof data.account === "object" ? data.account as Json : null; currentAccountId = raw ? String(raw.id ?? "") : ""; if (!raw) currentMemberId = ""; return { identity: identity(data.context), label: "HTTP memory workspace", account: raw ? { id: currentAccountId, username: String(raw.username ?? ""), seeded: false, memberships: Array.isArray(raw.memberships) ? raw.memberships as string[] : [] } : null, group: data.group && typeof data.group === "object" ? { id: String((data.group as Json).id ?? ""), name: String((data.group as Json).name ?? ""), kind: (data.group as Json).kind === "legacy" ? "legacy" : "account", generation: typeof (data.group as Json).generation === "number" ? (data.group as Json).generation as number : 0 } : null }; };
function workspace(data: Json): GroupWorkspace {
  const selected = data.selected && typeof data.selected === "object" ? data.selected as Json : null;
  const members = Array.isArray(data.members) ? data.members.map(item => member(item, (item as Json)?.id === data.profileId || (item as Json)?.accountId === currentAccountId)) : [];
  currentMemberId = members.find(item => item.you)?.id ?? currentMemberId;
  return { mode: data.mode === "legacy" ? "legacy" : "account", memberships: Array.isArray(data.memberships) ? data.memberships.map(item => { const x = item as Json; return { id: String(x.id ?? ""), name: String(x.name ?? ""), kind: x.kind === "legacy" ? "legacy" : "account", generation: typeof x.generation === "number" ? x.generation : 0 }; }) : [], selected: selected ? { id: String(selected.id ?? ""), name: String(selected.name ?? ""), kind: selected.kind === "legacy" ? "legacy" : "account", generation: typeof selected.generation === "number" ? selected.generation : 0 } : null, members, profileId: typeof data.profileId === "string" ? data.profileId : null, canManage: data.canManage === true, pending: data.pending && typeof data.pending === "object" ? { needsAccount: (data.pending as Json).needsAccount === true, groupName: typeof (data.pending as Json).groupName === "string" ? (data.pending as Json).groupName as string : null } : null };
}
function draft(value: LibraryDraft) {
  const mins = /^\d+$/.test(value.minutes) ? Number(value.minutes) : NaN, secs = /^\d+$/.test(value.seconds) ? Number(value.seconds) : NaN;
  return { title: value.title, contentType: value.contentType, durationSeconds: Number.isSafeInteger(mins) && Number.isSafeInteger(secs) ? mins * 60 + secs : null, numberingStyle: value.numberingStyle, genres: value.genres ? value.genres.split(",").map(x => x.trim()).filter(Boolean) : [], moods: [...value.moods], watchUrl: value.watchUrl || null, sourceUrl: value.sourceUrl || null, coverUrl: value.coverUrl || null };
}
async function request<T>(path: string, method: string, body: Json | undefined, options?: RequestOptions, map?: (value: Json) => T): Promise<ServiceResult<T>> {
  if (options?.signal?.aborted) return cancelled();
  try {
    const response = await fetch(`/v1/${path}`, { method, credentials: "same-origin", signal: options?.signal, headers: method === "GET" ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    const json: unknown = await response.json().catch(() => null);
    if (!json || typeof json !== "object") return { kind: "failure", error: { code: "library_access", message: "The server returned an unreadable response. Your draft is still here.", retryable: true } };
    const data = json as Json;
    if (!response.ok) { const e = data.error && typeof data.error === "object" ? data.error as Json : {}; const code = String(e.code ?? "request_failed"); return code === "conflict" ? stale(String(e.message ?? "The server context changed.")) : { kind: "failure", error: { code: code as never, message: String(e.message ?? "The request could not be completed."), retryable: e.retryable === true } }; }
    return { kind: "success", value: map ? map(data) : data as T, context: identity(data.context) };
  } catch (error) { return options?.signal?.aborted ? cancelled() : { kind: "failure", error: { code: "library_access", message: "The HTTP service is unavailable. Your entered draft is still here; retry when it is running.", retryable: true } }; }
}
const expected = (context: ContextIdentity) => ({ expectedContextRevision: context.revision });
const http = () => ({ mode: "http" as const,
  context: { initialIdentity: identity({}), read: (o?: RequestOptions) => request("context", "GET", undefined, o, contextValue), reset: async () => stale<MockContext>("HTTP memory has no browser reset. Restart the owned server to clear its process memory.") },
  accounts: {
    read: (o?: RequestOptions) => request("context", "GET", undefined, o, contextValue),
    register: (input: AccountInput, x: ContextIdentity, o?: RequestOptions) => request("auth/register", "POST", { ...input, ...expected(x) }, o, data => ({ code: String(data.recoveryCode ?? ""), next: "account" })),
    signIn: (input: AccountInput, x: ContextIdentity, o?: RequestOptions) => request("auth/login", "POST", { ...input, ...expected(x) }, o, contextValue),
    signOut: (x: ContextIdentity, o?: RequestOptions) => request("auth/logout", "POST", expected(x), o, contextValue),
    recover: (input: AccountInput, x: ContextIdentity, o?: RequestOptions) => request("auth/recovery", "POST", { ...input, ...expected(x) }, o, data => ({ code: String(data.recoveryCode ?? ""), next: "signin" })),
  },
  groups: {
    read: (o?: RequestOptions) => request("groups/current", "GET", undefined, o, workspace),
    create: (name: string, x: ContextIdentity, o?: RequestOptions) => request("groups", "POST", { name, ...expected(x) }, o, data => ({ invite: String(data.invite ?? ""), kind: "account" as const })),
    select: (groupId: string, x: ContextIdentity, o?: RequestOptions) => request("context/group-selection", "PUT", { groupId, ...expected(x) }, o, workspace),
    resolve: (invite: string, x: ContextIdentity, o?: RequestOptions) => request("invitations/resolve", "POST", { invite, ...expected(x) }, o, workspace),
    join: (x: ContextIdentity, o?: RequestOptions) => request("groups/pending/join", "POST", expected(x), o, workspace),
    mode: (mode: "account" | "legacy", x: ContextIdentity, o?: RequestOptions) => request("context/mode", "PUT", { mode, ...expected(x) }, o, workspace),
    remove: (memberId: string, generation: number, x: ContextIdentity, o?: RequestOptions) => request("groups/current/members/remove", "POST", { memberId, generation, confirmed: true, ...expected(x) }, o, workspace),
    rotate: (generation: number, x: ContextIdentity, o?: RequestOptions) => request("groups/current/invitations/rotate", "POST", { generation, confirmed: true, ...expected(x) }, o, data => ({ invite: String(data.invite ?? ""), kind: "account" as const })),
    createLegacy: (name: string, x: ContextIdentity, o?: RequestOptions) => request("legacy/groups", "POST", { name, ...expected(x) }, o, data => ({ invite: String(data.invite ?? ""), kind: "legacy" as const })),
    createProfile: (name: string, color: AvatarColor, x: ContextIdentity, o?: RequestOptions) => request("legacy/groups/current/profiles", "POST", { name, color, ...expected(x) }, o, workspace),
    selectProfile: (profileId: string, x: ContextIdentity, o?: RequestOptions) => request("legacy/groups/current/profiles/selection", "PUT", { profileId, ...expected(x) }, o, workspace),
  },
  library: {
    list: (filter: unknown, archived: boolean, x: ContextIdentity, o?: RequestOptions) => { const f = libraryFilter(filter).filter; return request(`library${archived ? "/archive" : ""}?filter=${archived ? "all" : f}`, "GET", undefined, o, data => ({ mode: data.mode === "legacy" ? "legacy" as const : "account" as const, filter: f, archived, notice: null, items: Array.isArray(data.items) ? data.items.map(title) : [] })); },
    detail: (id: string, x: ContextIdentity, o?: RequestOptions) => request(`library/${encodeURIComponent(id)}`, "GET", undefined, o, title),
    editDraft: (id: string, x: ContextIdentity, o?: RequestOptions) => request(`library/${encodeURIComponent(id)}/edit`, "GET", undefined, o, data => title({ ...(data.draft as Json), id: data.id, revision: data.revision, archived: false, contributors: [], history: [], personal: null, canEdit: true, canRemove: true, canRefresh: false, canRestore: false })),
    save: (id: string, revision: number, value: LibraryDraft, confirmation: string | undefined, x: ContextIdentity, o?: RequestOptions) => request(`library/${encodeURIComponent(id)}`, "PATCH", { ...draft(value), revision, identityChangeConfirmed: Boolean(confirmation), ...expected(x) }, o, data => data.status === "confirmation" ? { status: "confirmation" as const, handle: "http-identity-confirmation", message: "Confirm the changed title identity for this draft." } : { status: "saved" as const, title: title(data.title) }),
    removeOwn: (id: string, revision: number, x: ContextIdentity, o?: RequestOptions) => request(`library/${encodeURIComponent(id)}/contribution/remove`, "POST", { revision, confirmed: true, ...expected(x) }, o, data => title(data.title)),
    restore: (id: string, revision: number, x: ContextIdentity, o?: RequestOptions) => request(`library/archive/${encodeURIComponent(id)}/restore`, "POST", { revision, ...expected(x) }, o, data => title(data.title)),
  },
  entry: {
    search: (source: EntrySource, kind: "title" | "link", query: string, x: ContextIdentity, o?: ProviderOptions) => request("metadata/search", "POST", { source, kind, query, ...expected(x) }, o, data => ({ ...data, source, candidates: Array.isArray(data.candidates) ? data.candidates : [], draft: data.draft ? { ...(data.draft as Json), minutes: String(Math.floor(Number((data.draft as Json).durationSeconds ?? 0) / 60)), seconds: String(Number((data.draft as Json).durationSeconds ?? 0) % 60), genres: Array.isArray((data.draft as Json).genres) ? ((data.draft as Json).genres as string[]).join(", ") : "", moods: [] } : undefined }) as unknown as EntryPage | EntryReview),
    page: (handle: string, direction: "next" | "previous", x: ContextIdentity, o?: ProviderOptions) => request(`metadata/pages/${encodeURIComponent(handle)}`, "POST", { direction, ...expected(x) }, o, data => data as EntryPage),
    select: (handle: string, id: string, x: ContextIdentity, o?: ProviderOptions) => request(`metadata/pages/${encodeURIComponent(handle)}/candidates/${encodeURIComponent(id)}`, "POST", expected(x), o, data => ({ ...data, source: data.source === "kinopoisk" ? "kinopoisk" : "youtube", draft: { ...(data.draft as Json), minutes: String(Math.floor(Number((data.draft as Json).durationSeconds ?? 0) / 60)), seconds: String(Number((data.draft as Json).durationSeconds ?? 0) % 60), genres: Array.isArray((data.draft as Json).genres) ? ((data.draft as Json).genres as string[]).join(", ") : "", moods: [] } }) as unknown as EntryReview),
    adopt: async () => stale<EntryReview>("The HTTP review is already the current editable draft."), discard: () => {}, cancelLookup: () => {},
    save: (value: LibraryDraft, typical: boolean, review: string | undefined, confirmation: string | undefined, x: ContextIdentity, o?: RequestOptions) => review ? request(`metadata/reviews/${encodeURIComponent(review)}/save`, "POST", { ...draft(value), typicalDurationConfirmed: typical, ...expected(x) }, o, entrySaved) : request("library/manual", "POST", { ...draft(value), ...expected(x) }, o, entrySaved),
    refresh: (id: string, x: ContextIdentity, o?: ProviderOptions) => request(`library/${encodeURIComponent(id)}/metadata/refresh`, "POST", expected(x), o, data => title(data.title)),
    advanceTime: async () => stale<{ now: number }>("The HTTP workspace has no client time-control."),
  },
  progress: {
    saveEpisode: (id, input, claim, x, o) => request(`library/${encodeURIComponent(id)}/progress/episode`, "PUT", { position: input.position, season: input.season === "" ? null : Number(input.season), episode: input.episode === "" ? null : Number(input.episode), ...expected(x) }, o, commit),
    saveTimestamp: (id, timestamp, claim, x, o) => request(`library/${encodeURIComponent(id)}/progress/timestamp`, "PUT", { timestampSeconds: seconds(timestamp), ...expected(x) }, o, commit),
    clearTimestamp: (id, claim, x, o) => request(`library/${encodeURIComponent(id)}/progress/timestamp`, "DELETE", expected(x), o, commit),
    setCompleted: (id, completed, claim, x, o) => request(`library/${encodeURIComponent(id)}/progress/completed`, "PUT", { completed, ...expected(x) }, o, commit),
  },
  feedback: {
    saveRating: (id, score, claim, x, o) => request(`library/${encodeURIComponent(id)}/rating`, "PUT", { score: Number(score), ...expected(x) }, o, commit), clearRating: (id, claim, x, o) => request(`library/${encodeURIComponent(id)}/rating`, "DELETE", expected(x), o, commit), saveNote: (id, note, claim, x, o) => request(`library/${encodeURIComponent(id)}/note`, "PUT", { note, ...expected(x) }, o, commit), clearNote: (id, claim, x, o) => request(`library/${encodeURIComponent(id)}/note`, "DELETE", expected(x), o, commit),
  },
  picker: {
    getInputs: (x, o) => request("picker/inputs", "GET", undefined, o, data => ({ ...data, viewers: Array.isArray(data.viewers) ? data.viewers.map(item => { const m = member(item); return { id: m.id, name: m.name, color: m.color }; }) : [] }) as unknown as PickerInputs),
    pick: (value: PickerInput, intentId: string, x, o) => request("picker/pick", "POST", { viewerIds: value.viewerIds, availableMinutes: Number(value.availableMinutes), mood: value.mood, rewatches: value.rewatches, intentId, ...expected(x) }, o, picker),
    next: (cycle: PickerCycleHandle, intentId: string, x, o) => request(`picker/cycles/${encodeURIComponent(cycle.cycleId)}/next`, "POST", { step: cycle.step, intentId, ...expected(x) }, o, picker),
    restart: (value: PickerInput, cycle: PickerCycleHandle, intentId: string, x, o) => request(`picker/cycles/${encodeURIComponent(cycle.cycleId)}/restart`, "POST", { viewerIds: value.viewerIds, availableMinutes: Number(value.availableMinutes), mood: value.mood, rewatches: value.rewatches, step: cycle.step, intentId, ...expected(x) }, o, picker),
  },
} satisfies FrontendService);
function seconds(value: string) { const parts = value.trim().split(":").map(Number); return parts.length === 2 && parts.every(Number.isInteger) ? parts[0] * 60 + parts[1] : Number(value); }
function entrySaved(data: Json): EntrySaved { return data.status === "confirmation" ? { status: "confirmation", handle: String(data.handle ?? ""), message: "Confirm the archived matching title.", matchId: String(data.titleId ?? "") } : { status: "saved", title: title(data.title) }; }
function commit(data: Json): PersonalCommit { const ownRaw = data.own ?? data.record; const own = personal(ownRaw, { contentType: "movie", durationSeconds: null }, { id: "self", name: "You" })!; return { record: null, own, history: [] }; }
function picker(data: Json): PickerOutcome { if (data.kind === "picked") { const c = data.candidate as Json; return { kind: "picked", refreshed: data.refreshed === true, candidate: { id: String(c.id), title: String(c.title), contentType: c.contentType as never, durationSeconds: Number(c.durationSeconds), tier: c.tier as never, message: String(c.message ?? ""), target: c.target as never, rewatchers: Array.isArray(c.rewatchingViewerIds) ? c.rewatchingViewerIds as never : [], viewers: [], availableMinutes: "", requestedMood: "", rewatches: false, watchUrl: typeof c.watchUrl === "string" ? c.watchUrl : null }, cycle: data.cycle as PickerCycleHandle }; } if (data.kind === "exhausted") return { kind: "exhausted", refreshed: data.refreshed === true, cycle: data.cycle as PickerCycleHandle }; if (data.kind === "conflict") return { kind: "conflict", refreshed: false, message: String(data.message ?? "Picker context changed.") }; return { kind: "no_match", refreshed: data.refreshed === true, message: String(data.message ?? "No matching title."), reasons: [], suggestions: [] }; }
export const createHttpService = (): FrontendService => http();
