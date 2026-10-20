import { libraryFilter, libraryMoods } from "../service/contracts";
import { createMockEntry } from "./entry";
import { blocksStructureChange, createMockPersonal, personalPanel, seededHistory, seedPersonal } from "./personal";
import { createMockPicker } from "./picker";
import type { ContextIdentity, GroupWorkspace, LibraryDraft, LibraryHistory, LibraryList, LibrarySave, LibraryService, LibraryTitle, LibraryType, Numbering, RequestOptions, ServiceResult } from "../service/contracts";
export type Metadata = { -readonly [K in "title" | "contentType" | "durationSeconds" | "numberingStyle" | "genres" | "moods" | "watchUrl" | "sourceUrl" | "coverUrl"]: LibraryTitle[K] };
export type Row = Metadata & { id: string; groupId: string; revision: number; createdBy: string; providerId: string | null; archived: boolean; contributions: { id: string; memberId: string; active: boolean }[]; history: readonly LibraryHistory[]; origins: Record<string, "authored" | "provider" | "unavailable">; deadlines?:Record<string,number>; availability: string; /** Internal original creation instant (canonical UTC ISO, ms) for D18 ordering; never projected into LibraryTitle. */ createdAt: string };
type Hooks = { identity: () => ContextIdentity; workspace: () => GroupWorkspace; now:()=>number; gate: <T>(expected: ContextIdentity, options: RequestOptions, commit: () => ServiceResult<T>) => Promise<ServiceResult<T>> };
export function safeLibraryUrl(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return (url.protocol === "https:" || url.protocol === "http:") && !url.username && !url.password ? value : null; } catch { return null; }
}
const normalized = (value: string) => value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase();
export function titleDraft(t: LibraryTitle): LibraryDraft {
  return { title: t.title ?? "", contentType: t.contentType ?? "", minutes: t.durationSeconds === null ? "" : String(Math.floor(t.durationSeconds / 60)), seconds: t.durationSeconds === null ? "" : String(t.durationSeconds % 60), numberingStyle: t.numberingStyle, genres: t.genres.join(", "), moods: [...t.moods], watchUrl: t.watchUrl ?? "", sourceUrl: t.sourceUrl ?? "", coverUrl: t.coverUrl ?? "" };
}
const seedCreatedAt = Date.parse("2026-10-01T00:00:00.000Z");
export function createMockLibrary(h: Hooks) {
  let rows: Row[] = [], confirmations = new Map<string, string>(), sequence = 0;
  const failure = (message: string, code: "library_access" | "library_input" | "library_conflict" = "library_access"): ServiceResult<never> => ({ kind: "failure", error: { code, message, retryable: true } });
  function reset() {
    const create = (id: string, groupId: string, title: string, type: LibraryType, contributors: string[], duration = 1500, numbering: Numbering = "none"): Row => ({ id, groupId, revision: 1, createdBy: contributors[0] ?? "friday-owner", providerId: null, archived: false, title, contentType: type, durationSeconds: duration, numberingStyle: numbering, genres: ["Synthetic comedy"], moods: ["funny"], watchUrl: "https://example.test/watch/sample", sourceUrl: "https://example.test/source/sample", coverUrl: "/mock-cover.svg", contributions: contributors.map(memberId => ({ id: ["joint-movie","weekend-movie","legacy-movie"].includes(id) ? `contribution-${memberId}` : `contribution-${id}-${memberId}`, memberId, active: true })), history: Object.freeze(contributors.map(memberId => seededHistory(["joint-movie","weekend-movie","legacy-movie"].includes(id) ? `history-${memberId}` : `history-${id}-${memberId}`, memberId, numbering))), origins: { title: "authored", contentType: "authored", durationSeconds: "provider", genres: "provider", moods: "authored", watchUrl: "authored", sourceUrl: "provider", coverUrl: "provider", numberingStyle: "authored" }, availability: "Synthetic saved metadata; no live provider lookup.", createdAt: "" });
    rows = [create("joint-movie", "friday", "Together Tonight", "movie", ["friday-owner", "friday-viewer"], 5400), create("saved-series", "friday", "Short Laughs", "series", ["friday-viewer"], 1440, "season_episode"), create("saved-anime", "friday", "Paper Stars", "anime", ["friday-viewer"], 1380, "continuous"), create("saved-video", "friday", "A Small Good Idea", "youtube", ["friday-owner"], 900), create("archived-movie", "friday", "Saved for Another Day", "movie", ["friday-owner"]), create("expired-video", "friday", "My retained title correction", "youtube", ["friday-viewer"]), create("weekend-movie", "weekend", "Past participant's film", "movie", ["weekend-retired"]), create("legacy-movie", "legacy-sample", "Legacy sample film", "movie", ["legacy-sample-profile"])];
    rows[4].archived = true; rows[4].contributions.forEach(c => { c.active = false; });
    Object.assign(rows[5], { providerId: "synthetic-youtube-expired", contentType: null, durationSeconds: null, genres: [], sourceUrl: null, coverUrl: null, availability: "Imported metadata unavailable: synthetic provider deadline expired. Your authored title and history remain.", origins: { ...rows[5].origins, contentType: "unavailable", durationSeconds: "unavailable", genres: "unavailable", sourceUrl: "unavailable", coverUrl: "unavailable" } });
    rows[2].coverUrl = "https://unsafe.example.test/never-request.svg"; rows[3].coverUrl = "/missing-mock-cover.svg";
    const weekendArchive = create("weekend-archive", "weekend", "Weekend retained history", "movie", ["weekend-viewer"]);
    weekendArchive.archived = true; weekendArchive.contributions[0].id = "contribution-weekend-viewer"; weekendArchive.contributions[0].active = false;
    weekendArchive.history = Object.freeze([Object.freeze({...weekendArchive.history[0],id:"history-weekend-viewer"})]); rows.push(weekendArchive);
    // #60: fixed seed creation instants in reset() order (joint-movie 0 ... weekend-archive 8).
    rows.forEach((row, k) => { row.createdAt = new Date(seedCreatedAt + k * 1000).toISOString(); });
    seedPersonal(rows); confirmations.clear(); sequence = 0;
  }
  reset();
  const access = () => { const w = h.workspace(); return w.selected ? w : null; };
  const actor = (w: GroupWorkspace) => w.members.find(m => m.active && m.you)?.id ?? null;
  const find = (id: string, w: GroupWorkspace) => rows.find(r => r.id === id && r.groupId === w.selected?.id);
  const contributed = (r: Row, memberId: string | null) => !!memberId && r.contributions.some(c => c.active && c.memberId === memberId);
  function project(r: Row, w: GroupWorkspace): LibraryTitle {
    const current = actor(w), contributors = r.contributions.filter(c => c.active).map(c => w.members.find(m => m.id === c.memberId)).filter(m => !!m);
    return Object.freeze({ id: r.id, groupId: r.groupId, revision: r.revision, createdBy: r.createdBy, providerId: r.providerId, archived: r.archived, title: r.title, contentType: r.contentType, durationSeconds: r.durationSeconds, numberingStyle: r.numberingStyle, genres: Object.freeze([...r.genres]), moods: Object.freeze([...r.moods]), watchUrl: r.watchUrl, sourceUrl: r.sourceUrl, coverUrl: r.coverUrl, origins: Object.freeze({...r.origins}), availability: r.availability, contributors: Object.freeze(contributors), history: r.history, historyMembers: Object.freeze(w.members.filter(m => r.history.some(x => x.memberId === m.id))), personal: personalPanel(r, w), canEdit: !r.archived && contributed(r,current), canRemove: !r.archived && contributed(r,current), canRefresh: !r.archived && !!r.providerId && !!current && (w.mode === "legacy" || contributed(r,current)), canRestore: r.archived && !!current });
  }
  const result = <T>(value: T): ServiceResult<T> => ({ kind: "success", value, context: h.identity() });
  const run = <T>(expected: ContextIdentity, options: RequestOptions | undefined, f: () => ServiceResult<T>) => {entry.expire();return h.gate(expected, options ?? {},()=>{entry.expire();return f();});};
  function validate(d: LibraryDraft): Metadata | string {
    const title = d.title.trim(); if (!title || [...title].length > 200 || title.includes("\0")) return "Title must contain 1-200 characters without NUL.";
    if (!["movie","series","anime","youtube"].includes(d.contentType)) return "Choose Movie, Series, Anime or YouTube.";
    if (!/^\d+$/.test(d.minutes) || !/^\d+$/.test(d.seconds) || Number(d.seconds) > 59) return "Enter whole minutes and seconds from 0 to 59.";
    const durationSeconds = Number(d.minutes) * 60 + Number(d.seconds); if (!Number.isSafeInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > 86400) return "Duration must be 1-86400 whole seconds.";
    const episodic = d.contentType === "series" || d.contentType === "anime";
    if (episodic ? !["season_episode","continuous"].includes(d.numberingStyle) : d.numberingStyle !== "none") return "Use seasonal or continuous numbering for series/anime; none for movies/videos.";
    const moods = [...new Set(d.moods)]; if (!moods.length || moods.some(m => !(libraryMoods as readonly string[]).includes(m))) return "Select at least one of the five labeled moods.";
    const genres = d.genres.trim() ? d.genres.split(",").map(x => x.trim()) : [];
    if (genres.some(g => !g || [...g].length > 40 || g.includes("\0"))) return "Genres must contain 1-40 characters without empty segments or NUL.";
    const unique = genres.filter((g,i) => genres.findIndex(x => x.toLowerCase() === g.toLowerCase()) === i); if (unique.length > 10) return "Use at most ten distinct genres.";
    for (const value of [d.watchUrl,d.sourceUrl]) if (value && !safeLibraryUrl(value)) return "Optional watch/source links must be HTTP(S) without embedded credentials.";
    if (d.coverUrl && !["/mock-cover.svg","/missing-mock-cover.svg"].includes(d.coverUrl) && !safeLibraryUrl(d.coverUrl)) return "Use a safe optional cover URL or the local synthetic cover.";
    return { title, contentType: d.contentType as LibraryType, durationSeconds, numberingStyle: d.numberingStyle, genres: unique, moods, watchUrl: d.watchUrl || null, sourceUrl: d.sourceUrl || null, coverUrl: d.coverUrl || null };
  }
  const service = Object.freeze<LibraryService>({
    list: (filter, archived, expected, options) => run<LibraryList>(expected, options, () => {
      const w = access(); if (!w) return failure("Select an accessible synthetic group before browsing its library.");
      const chosen = libraryFilter(filter), legacyMine = chosen.filter === "mine" && w.mode === "legacy";
      const mine = !archived && !legacyMine && chosen.filter === "mine";
      return result({ mode: w.mode, filter: mine ? "mine" : "all", archived, notice: legacyMine ? "Mine is available for account groups only. Showing All." : chosen.notice, items: rows.filter(r => r.groupId === w.selected!.id && r.archived === archived && (!mine || contributed(r,actor(w)))).map(r => project(r,w)) });
    }),
    detail: (id, expected, options) => run(expected, options, () => { const w = access(), r = w && find(id,w); return w && r ? result(project(r,w)) : failure("This title is missing or outside your current group."); }),
    editDraft: (id, expected, options) => run(expected, options, () => { const w = access(), r = w && find(id,w); return w && r && !r.archived && contributed(r,actor(w)) ? result(project(r,w)) : failure("Only a current contributor can edit an active title."); }),
    save: (id, revision, draft, confirmation, expected, options) => run<LibrarySave>(expected, options, () => {
      const w = access(), r = w && find(id,w); if (!w || !r || r.archived || !contributed(r,actor(w))) return failure("Only a current contributor can edit an active title.");
      if (r.revision !== revision) return failure("This title changed. Keep your attempted draft and reopen current details before retrying.","library_conflict");
      const metadata = validate(draft); if (typeof metadata === "string") return failure(metadata,"library_input");
      if (r.history.some(blocksStructureChange) && ((r.contentType !== null && r.contentType !== metadata.contentType) || r.numberingStyle !== metadata.numberingStyle)) return failure("Existing history requires the retained type and numbering structure.","library_input");
      if (rows.some(x => x.id !== r.id && x.groupId === r.groupId && x.contentType === metadata.contentType && normalized(x.title ?? "") === normalized(metadata.title!))) return failure("An active or archived title already uses this name and type.","library_input");
      const sensitive = normalized(r.title ?? "") !== normalized(metadata.title!) || r.contentType !== metadata.contentType;
      const signature = JSON.stringify([id,revision,expected,metadata]);
      if (sensitive && (!confirmation || confirmations.get(confirmation) !== signature)) { const handle = `edit-confirmation-${++sequence}`; confirmations.set(handle,signature); return result({status:"confirmation",handle,message:"Confirm the changed title identity for this exact draft and revision."}); }
      for (const field of Object.keys(metadata) as (keyof Metadata)[]) if (JSON.stringify(r[field]) !== JSON.stringify(metadata[field])) r.origins[field] = "authored";
      Object.assign(r,metadata); r.revision++; if (confirmation) confirmations.delete(confirmation); return result({status:"saved",title:project(r,w)});
    }),
    removeOwn: (id, revision, expected, options) => run(expected, options, () => {
      const w = access(), r = w && find(id,w), memberId = w && actor(w); if (!w || !r || !memberId) return failure("Select your own current member/profile before removing a contribution.");
      if (!contributed(r,memberId)) return result(project(r,w));
      if (r.revision !== revision || r.archived) return failure("This title changed. Reload before confirming removal.","library_conflict");
      r.contributions.find(c => c.memberId === memberId && c.active)!.active = false; r.archived = !r.contributions.some(c => c.active); r.revision++; return result(project(r,w));
    }),
    restore: (id, revision, expected, options) => run(expected, options, () => {
      const w = access(), r = w && find(id,w), memberId = w && actor(w); if (!w || !r || !memberId) return failure("Select your own current member/profile before restoring.");
      if (!r.archived && contributed(r,memberId)) return result(project(r,w));
      if (!r.archived || r.revision !== revision) return failure("This archive entry changed. Reload before restoring.","library_conflict");
      const c = r.contributions.find(c => c.memberId === memberId); if (c) c.active = true; else r.contributions.push({id:`contribution-${id}-${memberId}`,memberId,active:true}); r.archived = false; r.revision++; return result(project(r,w));
    }),
  });
  const entry=createMockEntry({rows:()=>rows,access,actor,find,contributed,project,validate,identity:h.identity,now:h.now,clearEditConfirmations:()=>confirmations.clear(),gate:h.gate});
  const personal=createMockPersonal({access,actor,find,identity:h.identity,run});
  // Read-only snapshot accessor and the synthetic metadata clock for the picker; it never writes rows.
  const picker=createMockPicker({access,actor,rows:():readonly Readonly<Row>[]=>rows,clock:entry.now,safeUrl:safeLibraryUrl,identity:h.identity,run});
  return {service,expire:entry.expire,entry:entry.service,progress:personal.progress,feedback:personal.feedback,picker:picker.service,reset:()=>{reset();entry.reset();picker.reset();}};
}
