import Link from "next/link";
import type { TitleDetails, MemberHistory } from "../../../lib/title-details";
import { contentTypes, durationLabel } from "../../../lib/title-state";
import { initials } from "../../../lib/profile-state";
import { Cover } from "../cover";
import { ContributionControls } from "../contribution-controls";
import type { ContributionAction } from "../../../lib/contribution-state";
import { RefreshControls, type RefreshState } from "../refresh-controls";
import { EpisodeControls } from "../episode-controls";
import { episodeStyle, projectEpisodeProgress, type EpisodeAction } from "../../../lib/episode-progress-state";
import { WatchControls } from "../watch-controls";
import { formatWatchTimestamp, projectWatchProgress, type WatchAction } from "../../../lib/watch-progress-state";
import { RatingControls } from "../rating-controls";
import type { RatingAction } from "../../../lib/rating-state";
import { NoteControls } from "../note-controls";
import type { NoteAction } from "../../../lib/note-state";

function position(history: MemberHistory, episodic: boolean) {
  if (!episodic) return history.timestampSeconds === null ? "Manual timestamp: Not recorded" : `Manual timestamp: ${formatWatchTimestamp(history.timestampSeconds)}`;
  if (history.positionState === null) return "Next episode: Not recorded";
  if (history.positionState === "unknown") return "Next episode: Unknown";
  const next = history.nextSeason === null ? `Episode ${history.nextEpisode}` : `Season ${history.nextSeason}, episode ${history.nextEpisode}`;
  return `${history.positionState === "not_started" ? "Not started — " : "Next: "}${next}`;
}
export function DetailView({ detail, contributionAction, contributionSaved = false, refreshAction, episodeAction, watchAction, ratingAction, noteAction }: { detail: TitleDetails; contributionAction?: ContributionAction; contributionSaved?: boolean; refreshAction?: (previous: RefreshState, form: FormData) => Promise<RefreshState>; episodeAction?: EpisodeAction; watchAction?: WatchAction; ratingAction?: RatingAction; noteAction?: NoteAction }) {
  const episodic = detail.numberingStyle !== "none";
  const editable = detail.canEdit && !detail.archived;
  const own = detail.history.find(member => member.id === detail.activeMemberId);
  return <div className="page-content source-detail-page"><div className="page-heading source-detail-back"><Link href="/watchlist">← Watchlist</Link>
    {(detail.title === null || detail.contentType === null || detail.durationSeconds === null) && <p role="status">Imported metadata is unavailable. Your group’s saved identity and history remain. Refresh metadata or supply your own corrections.</p>}
    {refreshAction && detail.activeMemberId && <RefreshControls action={refreshAction} />}
    {editable && <Link className="button" href={`/watchlist/${encodeURIComponent(detail.id)}/edit`}>Edit title</Link>}
    {contributionSaved && editable && <p role="status">Your contribution is saved. This title is on the watchlist.</p>}
    {detail.archived && <div className="archive-notice"><strong>Archived</strong><p>This title is outside the active watchlist. Restore it before editing. Your group’s history is preserved.</p></div>}
  </div>
    <section className="detail-metadata source-detail-layout" aria-labelledby="metadata-heading"><Cover key={detail.coverUrl} url={detail.coverUrl} title={detail.title} video={detail.contentType === "youtube"} /><div className="source-detail-summary"><h2 className="visually-hidden" id="metadata-heading">Title information</h2><p className="source-detail-kind">{contentTypes.find((type) => type.value === detail.contentType)?.label ?? "Content type unavailable"}{detail.providerNamespace ? ` · ${detail.providerNamespace}` : ""}</p><h1 className="detail-title">{detail.title ?? "Metadata unavailable"}</h1><p className="source-detail-duration">{durationLabel(detail.durationSeconds)}{episodic ? " per episode" : ""}{detail.genres.length ? ` · ${detail.genres.join(", ")}` : ""}</p><div className="source-detail-moods">{detail.moods.map(mood => <span key={mood}>{mood}</span>)}</div><dl>
      <dt>Content type</dt><dd>{contentTypes.find((type) => type.value === detail.contentType)?.label ?? "Content type unavailable"}</dd><dt>{episodic ? "Typical episode duration" : "Full duration"}</dt><dd>{durationLabel(detail.durationSeconds)}</dd>
      {episodic && <><dt>Episode numbering</dt><dd>{detail.numberingStyle === "continuous" ? "Continuous numbering" : "Season + episode"}</dd></>}
      <dt>Genres</dt><dd>{detail.genres.join(", ") || "Not specified"}</dd><dt>Moods</dt><dd>{detail.moods.join(", ") || "Not specified"}</dd>
      <dt>Added by</dt><dd>{detail.contributors.length ? <ul className="contributor-list">{detail.contributors.map((member) => <li key={member.id}><span className="avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{initials(member.name)}</span><span className="profile-name">{member.name}</span>{member.inactive && <span> · Inactive participant</span>}</li>)}</ul> : "No current contributors"}</dd>
      <dt>Source</dt><dd>{detail.sourceUrl ? <a href={detail.sourceUrl} target="_blank" rel="noopener noreferrer">Source (external)</a> : "No source saved"}</dd>
      <dt>Provider metadata</dt><dd>{detail.providerNamespace && detail.providerId ? `${detail.providerNamespace}: ${detail.providerId}` : "Not provided"}</dd></dl>
      {detail.watchUrl ? <a className="button" href={detail.watchUrl} target="_blank" rel="noopener noreferrer">{episodic ? "Open series (external)" : "Watch externally"}</a> : <><p>No viewing link saved</p>{editable && <Link href={`/watchlist/${encodeURIComponent(detail.id)}/edit`}>Add viewing link</Link>}</>}
      <p>Watching externally does not update your progress. Record changes manually.</p>
    </div><div className="source-detail-lower">
    {contributionAction && <ContributionControls archived={detail.archived} canRemove={editable} memberId={detail.activeMemberId} action={contributionAction} />}
    {episodeAction && episodeStyle(detail.numberingStyle) && !detail.archived && <>{detail.activeMemberId && own ? <EpisodeControls key={`${detail.id}-${detail.activeMemberId}-${detail.numberingStyle}`} initial={projectEpisodeProgress(detail.activeMemberId, detail.numberingStyle, own)} name={own.name} unavailable={detail.title === null || detail.contentType === null || detail.durationSeconds === null} action={episodeAction} /> : <section className="placeholder" aria-labelledby="episode-progress-heading"><h2 id="episode-progress-heading">Your episode progress</h2><p>Choose your profile to record your own next episode and completion.</p><Link className="button" href="/group">Choose profile</Link></section>}</>}
    {watchAction && detail.numberingStyle === "none" && !detail.archived && <>{detail.activeMemberId && own ? <WatchControls key={`${detail.id}-${detail.activeMemberId}-watch`} initial={projectWatchProgress(detail.activeMemberId, detail.durationSeconds, own)} name={own.name} action={watchAction} /> : <section className="placeholder" aria-labelledby="watch-progress-heading"><h2 id="watch-progress-heading">Your watch progress</h2><p>Choose your profile to record your own timestamp and completion.</p><Link className="button" href="/group">Choose profile</Link></section>}</>}
    {ratingAction && !detail.archived && <>{detail.activeMemberId && own ? <RatingControls key={`${detail.id}-${detail.activeMemberId}-rating`} member={own} score={own.rating} action={ratingAction} /> : <section className="placeholder" aria-labelledby="rating-heading"><h2 id="rating-heading">Your rating</h2><p>Choose your profile to save your own whole-title score.</p><Link className="button" href="/group">Choose profile</Link></section>}</>}
    {noteAction && !detail.archived && <>{detail.activeMemberId && own ? <NoteControls key={`${detail.id}-${detail.activeMemberId}-note`} member={own} body={own.note} action={noteAction} /> : <section className="placeholder" aria-labelledby="note-heading"><h2 id="note-heading">Your note</h2><p>Choose your profile to save your own whole-title note.</p><Link className="button" href="/group">Choose profile</Link></section>}</>}
    <section className="source-group-feedback" aria-labelledby="history-heading"><h2 id="history-heading">From the group</h2>{detail.history.length === 0 ? <p>No member history recorded.</p> : <ul className="history-list">{detail.history.map((member) => <li key={member.id}><article className="placeholder" aria-labelledby={`history-${member.id}`}>
      <div className="active-profile"><span className="avatar" style={{ backgroundColor: member.color }} aria-hidden="true">{initials(member.name)}</span><h3 className="profile-name" id={`history-${member.id}`}>{member.name}</h3>{member.inactive && <span>Inactive participant</span>}</div>
      <p>{position(member, episodic)}</p>{member.timestampSeconds !== null && detail.durationSeconds !== null && member.timestampSeconds > detail.durationSeconds && <p className="timestamp-warning">This saved timestamp exceeds the current duration. It has been preserved and needs correction.</p>}
      <p>Completion: {member.completed === null ? "Not recorded" : member.completed ? "Finished" : "Not finished"}</p><p>Rating: {member.rating === null ? "Not rated" : `${member.rating}/10`}</p>
      <p className="personal-note">{member.note ?? "No notes"}</p>
    </article></li>)}</ul>}</section></div></section>
  </div>;
}
