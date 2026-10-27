import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "./auth";

export type Kind = "Movie" | "Series" | "Anime" | "YouTube";
export type Mood = "Funny" | "Relaxing" | "Exciting" | "Dark" | "Emotional";
export const MOODS: Mood[] = ["Funny", "Relaxing", "Exciting", "Dark", "Emotional"];
export const KINDS: Kind[] = ["Movie", "Series", "Anime", "YouTube"];
export type Member = { id: string; name: string; color: string; you?: boolean };
export type Title = {
  id: string; title: string; kind: Kind; year?: string; channel?: string; minutes: number; durationSeconds: number;
  moods: Mood[]; genres: string[]; addedBy: string[]; hue: number; progress: string; done: boolean;
  rating?: number | undefined; note: string; otherNotes: { by: string; rating?: number | undefined; note: string }[];
  coverUrl?: string | null; watchUrl?: string | null; sourceUrl?: string | null; revision: number; numberingStyle: string;
  canRemove: boolean; canEdit: boolean;
};
type Raw = any;
export type Draft = { title: string; kind: Kind; minutes: number; durationSeconds?: number; moods: Mood[]; genres: string[]; hue?: number; watchUrl?: string | null; coverUrl?: string | null; sourceUrl?: string | null; numberingStyle?: string };
export type SearchCandidate = { id: string; title: string; kind: Kind; minutes: number; year?: string; channel?: string; coverUrl?: string | null; handle: string; source: string };
type Store = {
  titles: Title[]; archived: Title[]; members: Member[]; member: (id: string) => Member; groupName: string; loading: boolean; error: string;
  reload: () => Promise<void>; add: (draft: Draft, reviewHandle?: string) => Promise<string>;
  update: (id: string, patch: Partial<Title>) => Promise<void>; edit: (id: string, draft: Draft) => Promise<void>; remove: (id: string) => Promise<void>; loadArchive: () => Promise<void>; restore: (id: string) => Promise<void>;
  search: (query: string, source: "youtube" | "kinopoisk") => Promise<{candidates: SearchCandidate[]; review?: Raw}>;
  select: (candidate: SearchCandidate) => Promise<Raw>;
  pick: (viewerIds: string[], minutes: number, mood: Mood) => Promise<Raw>;
  nextPick: (cycleId: string, step: string) => Promise<Raw>;
};
const StoreCtx = createContext<Store | null>(null);
const kinds: Record<string, Kind> = { movie: "Movie", series: "Series", anime: "Anime", youtube: "YouTube" };
const colorClasses: Record<string, string> = { blue: "bg-avatar-blue", purple: "bg-avatar-purple", teal: "bg-avatar-teal", rose: "bg-avatar-rose", amber: "bg-avatar-amber", slate: "bg-avatar-slate" };
const memberColor = (color: unknown) => colorClasses[String(color)] ?? "bg-avatar-slate";
const moodLabel = (value: string) => (value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()) as Mood;
const timeLabel = (seconds: number) => `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
function mapTitle(raw: Raw, ownMemberId: string | null): Title {
  const personal = raw.personal?.own ?? raw.personal ?? {};
  const episode = raw.contentType === "series" || raw.contentType === "anime";
  let progress = "";
  if (episode && personal.positionState === "in_progress" && personal.nextEpisode) progress = personal.nextSeason ? `S${personal.nextSeason} · E${personal.nextEpisode}` : `E${personal.nextEpisode}`;
  else if (!episode && typeof personal.timestampSeconds === "number") progress = timeLabel(personal.timestampSeconds);
  return {
    id: String(raw.id), title: raw.title ?? "Untitled", kind: kinds[raw.contentType] ?? "Movie",
    minutes: Math.ceil((raw.durationSeconds ?? 0) / 60), durationSeconds: raw.durationSeconds ?? 0, moods: (raw.moods ?? []).map(moodLabel), genres: raw.genres ?? [],
    addedBy: (raw.contributors ?? []).map((p: Raw) => String(p.id)), hue: Array.from(String(raw.id)).reduce((n, ch) => n + ch.charCodeAt(0), 0) % 360,
    progress, done: personal.completed === true, rating: typeof personal.rating === "number" ? personal.rating : undefined,
    note: personal.note ?? "", otherNotes: (raw.history ?? []).filter((p: Raw) => p.id !== ownMemberId && (p.note || p.rating)).map((p: Raw) => ({ by: String(p.id ?? p.memberId), rating: p.rating ?? undefined, note: p.note ?? "" })),
    coverUrl: raw.coverUrl, watchUrl: raw.watchUrl, sourceUrl: raw.sourceUrl, revision: raw.revision, numberingStyle: raw.numberingStyle ?? "none", canRemove: raw.canRemove === true, canEdit: raw.canEdit === true,
  };
}
function draftBody(draft: Draft) {
  const contentType = draft.kind.toLowerCase();
  return { title: draft.title, contentType, durationSeconds: draft.durationSeconds ?? draft.minutes * 60, numberingStyle: draft.numberingStyle ?? (contentType === "series" ? "season_episode" : contentType === "anime" ? "continuous" : "none"), genres: draft.genres, moods: draft.moods.map(m => m.toLowerCase()), watchUrl: draft.watchUrl || null, sourceUrl: draft.sourceUrl || null, coverUrl: draft.coverUrl || null, typicalDurationConfirmed: contentType === "series" || contentType === "anime" };
}
export function StoreProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const requestRef = useRef(auth.request); requestRef.current = auth.request;
  const [titles, setTitles] = useState<Title[]>([]), [archived, setArchived] = useState<Title[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState("");
  const groupId = auth.context?.groupId;
  const ownMemberId = auth.workspace?.currentMemberId ?? auth.workspace?.profileId ?? null;
  const currentGroup = useRef(groupId); currentGroup.current = groupId;
  async function reload() {
    if (!groupId) { setTitles([]); return; }
    setLoading(true); setError("");
    try { const data = await requestRef.current("library"); if (currentGroup.current === groupId && data.context?.groupId === groupId) setTitles((data.items ?? []).map((item: Raw) => mapTitle(item, ownMemberId))); }
    catch (e) { if (currentGroup.current === groupId) setError(e instanceof Error ? e.message : "Could not load the watchlist."); }
    finally { if (currentGroup.current === groupId) setLoading(false); }
  }
  useEffect(() => { setTitles([]); setArchived([]); void reload(); }, [groupId, ownMemberId]);
  const rawMembers = auth.workspace?.members ?? [];
  const allMembers: Member[] = rawMembers.map((m: Raw) => ({ id: String(m.id), name: String(m.name), color: memberColor(m.color), you: m.you === true || m.id === auth.workspace?.profileId || m.id === auth.workspace?.currentMemberId }));
  const members = allMembers.filter(m => !rawMembers.find(raw => raw.id === m.id)?.inactive);
  function member(id: string): Member { return allMembers.find(m => m.id === id) ?? { id, name: "Former member", color: "bg-avatar-slate" }; }
  async function add(draft: Draft, reviewHandle?: string) {
    const path = reviewHandle ? `metadata/reviews/${encodeURIComponent(reviewHandle)}/save` : "library/manual";
    let result = await requestRef.current(path, "POST", draftBody(draft));
    if (result.status === "confirmation" && result.handle) {
      if (!window.confirm("This title already exists. Add your name to the existing entry?")) throw new Error("Saving cancelled.");
      result = await requestRef.current(`library/confirmations/${encodeURIComponent(result.handle)}/confirm`, "POST", { confirmed: true });
    }
    if (!result.title?.id) throw new Error("The title could not be saved.");
    await reload(); return String(result.title.id);
  }
  async function update(id: string, patch: Partial<Title>) {
    const base = `library/${encodeURIComponent(id)}`; const item = titles.find(t => t.id === id); if (!item) throw new Error("Title not found.");
    if (Object.prototype.hasOwnProperty.call(patch, "done")) await requestRef.current(`${base}/progress/completed`, "PUT", { completed: patch.done });
    if (Object.prototype.hasOwnProperty.call(patch, "rating")) await requestRef.current(`${base}/rating`, patch.rating == null ? "DELETE" : "PUT", patch.rating == null ? {} : { score: patch.rating });
    if (Object.prototype.hasOwnProperty.call(patch, "note")) await requestRef.current(`${base}/note`, patch.note ? "PUT" : "DELETE", patch.note ? { note: patch.note } : {});
    if (Object.prototype.hasOwnProperty.call(patch, "progress")) {
      const value = patch.progress?.trim() ?? "";
      if (item.kind === "Series" || item.kind === "Anime") {
        const match = item.numberingStyle === "continuous" ? /^(?:E\s*)?(\d+)$/i.exec(value) : /^(?:S\s*)?(\d+)\s*(?:[.·,:-]\s*)?(?:E\s*)?(\d+)$/i.exec(value);
        if (value && !match) throw new Error(item.numberingStyle === "continuous" ? "Enter an episode such as E5." : "Enter a season and episode such as S1 E5.");
        await requestRef.current(`${base}/progress/episode`, "PUT", { position: value ? "in_progress" : "not_started", season: item.numberingStyle === "continuous" ? null : match ? Number(match[1]) : null, episode: match ? Number(match[item.numberingStyle === "continuous" ? 1 : 2]) : null });
      } else if (!value) await requestRef.current(`${base}/progress/timestamp`, "DELETE", {});
      else { const parts = value.split(":").map(Number); if (parts.length !== 3 || parts.some(n => !Number.isInteger(n) || n < 0) || parts[1]! >= 60 || parts[2]! >= 60) throw new Error("Enter a timestamp as H:MM:SS."); await requestRef.current(`${base}/progress/timestamp`, "PUT", { timestampSeconds: parts[0]! * 3600 + parts[1]! * 60 + parts[2]! }); }
    }
    await reload();
  }
  async function remove(id: string) { const item = titles.find(t => t.id === id); if (!item) return; await requestRef.current(`library/${encodeURIComponent(id)}/contribution/remove`, "POST", { revision: item.revision, confirmed: true }); await reload(); }
  async function loadArchive() {
    if (!groupId) return;
    setLoading(true); setError("");
    try { const result = await requestRef.current("library/archive"); if (currentGroup.current === groupId) setArchived((result.items ?? []).map((item: Raw) => mapTitle(item, ownMemberId))); }
    catch (cause) { if (currentGroup.current === groupId) setError(cause instanceof Error ? cause.message : "Could not load the archive."); }
    finally { if (currentGroup.current === groupId) setLoading(false); }
  }
  async function restore(id: string) {
    const item = archived.find(t => t.id === id); if (!item) throw new Error("Archived title not found.");
    await requestRef.current(`library/archive/${encodeURIComponent(id)}/restore`, "POST", { revision: item.revision });
    await Promise.all([reload(), loadArchive()]);
  }
  async function edit(id: string, draft: Draft) {
    const item = titles.find(t => t.id === id); if (!item) throw new Error("Title not found.");
    const path = `library/${encodeURIComponent(id)}/edit`;
    const body = { ...draftBody(draft), revision: item.revision, identityChangeConfirmed: false };
    const result = await requestRef.current(path, "PATCH", body);
    if (result.status === "confirmation") {
      if (!window.confirm("This changes the shared title identity. Continue?")) throw new Error("Editing cancelled.");
      await requestRef.current(path, "PATCH", { ...body, identityChangeConfirmed: true });
    }
    await reload();
  }
  async function search(query: string, source: "youtube" | "kinopoisk") {
    const data = await requestRef.current("metadata/search", "POST", { source, kind: source === "youtube" && /(?:youtu\.be|youtube\.com)/i.test(query) ? "link" : "title", query });
    if (data.draft) return { candidates: [], review: data };
    return { candidates: (data.candidates ?? []).map((c: Raw) => ({ id: String(c.identity?.externalId ?? c.id), title: c.title ?? "Untitled", kind: kinds[c.contentType ?? (source === "youtube" ? "youtube" : "movie")] ?? "Movie", minutes: Math.ceil((c.duration?.seconds ?? c.durationSeconds ?? 0) / 60), year: c.year ? String(c.year) : undefined, channel: c.channelTitle ?? c.channel, coverUrl: c.coverUrl, handle: data.handle, source })) };
  }
  async function select(candidate: SearchCandidate) { return requestRef.current(`metadata/pages/${encodeURIComponent(candidate.handle)}/candidates/${encodeURIComponent(candidate.id)}`, "POST", {}); }
  async function pick(viewerIds: string[], minutes: number, mood: Mood) { return requestRef.current("picker/pick", "POST", { viewerIds, availableMinutes: minutes, mood: mood.toLowerCase(), rewatches: false, intentId: crypto.randomUUID() }); }
  async function nextPick(cycleId: string, step: string) { return requestRef.current(`picker/cycles/${encodeURIComponent(cycleId)}/next`, "POST", { step, intentId: crypto.randomUUID() }); }
  return <StoreCtx.Provider value={{ titles, archived, members, member, groupName: auth.workspace?.selected?.name ?? "Your watchlist", loading, error, reload, add, update, edit, remove, loadArchive, restore, search, select, pick, nextPick }}>{children}</StoreCtx.Provider>;
}
export function useStore() { const value = useContext(StoreCtx); if (!value) throw new Error("StoreProvider missing"); return value; }
export const fmtMin = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`;
