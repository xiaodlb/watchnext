import { ensureFreshMetadata } from "./metadata/lifecycle";
import type { DatabaseSync } from "node:sqlite";
import { authorizeRequest } from "./request-access";
import type { Profile } from "./profile-state";
import { parseWatchlistFilter, type WatchlistFilter } from "./watchlist-filter";
import { safeExternalUrl } from "./urls";

export type WatchlistProgress = { positionState: string | null; nextSeason: number | null; nextEpisode: number | null; timestampSeconds: number | null; completed: boolean | null };
export type WatchlistItem = { id: string; title: string | null; contentType: string | null; durationSeconds: number | null; numberingStyle: string; coverUrl: string | null; moods: string[]; contributors: Profile[]; progress?: WatchlistProgress | null };
export type WatchlistView = { activeMemberId: string | null; items: WatchlistItem[]; filter?:WatchlistFilter; canFilter?:boolean; filterNotice?:string };

/** Group access permits browsing even before a profile is selected. */
export function readWatchlist(db: DatabaseSync, request: Request, archived = false, filter:unknown=undefined): WatchlistView {
  const context = authorizeRequest(db, request); ensureFreshMetadata(db);
  const requested=parseWatchlistFilter(filter),canFilter=!archived&&context.mode==="account",mine=canFilter&&requested.filter==="mine";
  const where="t.group_id=? AND t.archived=?"+(mine?" AND EXISTS(SELECT 1 FROM contributors own WHERE own.group_id=t.group_id AND own.title_id=t.id AND own.member_id=?)":"");
  const parameters=mine?[context.groupId,Number(archived),context.activeMemberId!]:[context.groupId,Number(archived)];
  // The shared card can truthfully show only the active viewer's own progress.
  // A missing row is presented as "Not started" in the UI; it never implies a
  // group-wide completion state.
  const items: WatchlistItem[] = db.prepare(`SELECT t.id,t.title,t.content_type,t.duration_seconds,t.numbering_style,t.cover_url,
    p.member_id AS progress_member_id,p.position_state,p.next_season,p.next_episode,p.timestamp_seconds,p.completed
    FROM titles t LEFT JOIN progress p ON p.group_id=t.group_id AND p.title_id=t.id AND p.member_id=?
    WHERE ${where} ORDER BY t.created_at DESC,t.id ASC`)
    .all(context.activeMemberId, ...parameters).map((row) => ({ id: row.id as string, title: row.title as string | null, contentType: row.content_type as string | null,
      durationSeconds: row.duration_seconds as number | null, numberingStyle: row.numbering_style as string, coverUrl: safeExternalUrl(row.cover_url), moods: [], contributors: [],
      progress: row.progress_member_id === null ? null : { positionState: row.position_state as string | null, nextSeason: row.next_season as number | null, nextEpisode: row.next_episode as number | null, timestampSeconds: row.timestamp_seconds as number | null, completed: row.completed === null ? null : row.completed === 1 } }));
  const byId = new Map(items.map((item) => [item.id, item]));
  for (const row of db.prepare(`SELECT tm.title_id,m.label FROM title_moods tm JOIN moods m ON m.code=tm.mood_code
    JOIN titles t ON t.id=tm.title_id WHERE ${where} ORDER BY m.rowid`).all(...parameters)) byId.get(row.title_id as string)?.moods.push(row.label as string);
  for (const row of db.prepare(`SELECT c.title_id,m.id,m.name,m.avatar_color,a.status FROM contributors c
    JOIN members m ON m.id=c.member_id AND m.group_id=c.group_id JOIN titles t ON t.id=c.title_id AND t.group_id=c.group_id
    LEFT JOIN account_memberships a ON a.member_id=m.id AND a.group_id=m.group_id
    WHERE ${where} ORDER BY c.created_at,m.id`).all(...parameters)) byId.get(row.title_id as string)?.contributors.push({ id: row.id as string, name: row.name as string, color: row.avatar_color as string,...(row.status==="removed"?{inactive:true}:{}) });
  const filterNotice=archived?undefined:requested.notice??(!canFilter&&requested.filter==="mine"?"Added by me is available in account groups only. Showing your shared list.":undefined);
  return { activeMemberId: context.activeMemberId, items,...(canFilter?{canFilter:true,filter:requested.filter}:{}),...(filterNotice?{filterNotice}:{}) };
}
