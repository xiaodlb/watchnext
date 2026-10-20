"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { WatchlistView } from "../../lib/watchlist";
import { contentTypes, durationLabel } from "../../lib/title-state";
import { initials } from "../../lib/profile-state";
import { Cover } from "./cover";
import { ContributionControls } from "./contribution-controls";
import type { ContributionState } from "../../lib/contribution-state";

export function WatchlistContent({ view, archived = false, contributionAction }: { view: WatchlistView; archived?: boolean; contributionAction?: (id: string, previous: ContributionState, form: FormData) => Promise<ContributionState> }) {
  const selected = Boolean(view.activeMemberId);
  const [type, setType] = useState<"all" | "movie" | "series" | "anime" | "youtube">("all");
  const visibleItems = useMemo(() => type === "all" ? view.items : view.items.filter((item) => item.contentType === type), [type, view.items]);
  const types = [{ value: "all", label: "All" }, { value: "movie", label: "Movies" }, { value: "series", label: "Series" }, { value: "anime", label: "Anime" }, { value: "youtube", label: "YouTube" }] as const;
  return <div className="page-content watchlist-page"><div className="page-heading"><p className="eyebrow">Shared list</p><h1>{archived ? "Archive" : "Your watchlist"}</h1><p className="page-introduction">{archived ? "Saved history, ready whenever your group wants to return." : "All the things your group has been meaning to watch."}</p>
    {archived ? <><p>{selected ? "Restore a title to add your name and bring it back to the watchlist." : "Choose a profile before restoring a title."}</p>{!selected && <Link className="button" href="/group">Choose profile</Link>}</> : selected ? <Link className="button" href="/watchlist/add">Add title</Link> : <><p>Choose a profile before adding a title.</p><Link className="button" href="/group">Choose profile</Link></>}
  </div>
  {!archived&&view.canFilter&&<nav className="watchlist-filters" aria-label="Watchlist filter"><a className="button button-secondary" href="/watchlist" aria-label="All titles" aria-current={view.filter!=="mine"?"page":undefined}>All</a><a className="button button-secondary" href="/watchlist?filter=mine" aria-current={view.filter==="mine"?"page":undefined}>Added by me</a></nav>}
  {!archived&&view.filterNotice&&<p role="status">{view.filterNotice}</p>}
  {view.items.length>0&&!archived&&<><div className="type-chips" aria-label="Content type filter">{types.map(option=><button key={option.value} type="button" className="type-chip" aria-pressed={type===option.value} onClick={()=>setType(option.value)}>{option.label}</button>)}</div><p className="watchlist-count" aria-live="polite">{visibleItems.length} {visibleItems.length===1?"title":"titles"}</p></>}
  {view.items.length===0&&view.canFilter&&view.filter==="mine"?<section className="placeholder"><h2>You haven’t added any titles</h2><p>Your group’s shared list may have titles from others. Add something you want to watch.</p><a className="button button-secondary" href="/watchlist">Show all titles</a>{" "}<Link className="button" href="/watchlist/add">Add a title</Link></section>:view.items.length === 0 ? <section className="placeholder"><h2>{archived ? "Your archive is empty" : "Your watchlist is empty"}</h2><p>{archived ? "Titles appear here when their last contribution is removed." : "Add the first thing your group wants to watch."}</p></section> : visibleItems.length===0 ? <section className="placeholder"><h2>No {types.find(option=>option.value===type)?.label.toLowerCase()} titles</h2><p>Try another type to see the rest of this shared list.</p></section> : <ul className="watchlist-items">
    {visibleItems.map((item) => <li key={item.id}><article className="watchlist-card" aria-labelledby={`title-${item.id}`}>
      <Cover key={`${item.id}:${item.coverUrl}`} url={item.coverUrl} title={item.title} video={item.contentType === "youtube"} />
      <div className="watchlist-metadata"><h2 id={`title-${item.id}`}>{item.title ?? "Metadata unavailable"}</h2><p>{contentTypes.find((type) => type.value === item.contentType)?.label ?? "Content type unavailable"}</p>
        <p>{item.numberingStyle === "none" ? "Full duration" : "Typical episode duration"}: {durationLabel(item.durationSeconds)}</p>
        <p>Moods: {item.moods.join(", ") || "Not specified"}</p>
        <p className="field-label">Added by</p>{item.contributors.length ? <ul className="contributor-list">{item.contributors.map((member) => <li key={member.id}><span className="avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{initials(member.name)}</span><span className="profile-name">{member.name}</span>{member.inactive && <span> · Inactive participant</span>}</li>)}</ul> : <p>No current contributors</p>}
        <Link href={`/watchlist/${encodeURIComponent(item.id)}`} aria-label={`View details: ${item.title ?? "Metadata unavailable"}`}>View details</Link>
        {archived && contributionAction && <ContributionControls archived canRemove={false} memberId={view.activeMemberId} action={contributionAction.bind(null, item.id)} />}
      </div>
    </article></li>)}
  </ul>}
  </div>;
}
