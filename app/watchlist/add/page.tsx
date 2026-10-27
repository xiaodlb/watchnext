import Link from "next/link";
import { getDatabase } from "../../../db/server";
import { getGroupRequest } from "../../../lib/access";
import { readSavedTitle, requireTitleMember } from "../../../lib/manual-titles";
import { contentTypes, durationLabel, type SavedTitle } from "../../../lib/title-state";
import { AccessErrorMessage } from "../../components/access-error";
import { saveTitleAction } from "./actions";
import { TitleForm } from "./title-form";
import { authorizeRequest } from "../../../lib/request-access";
import { lookupTitleAction, selectCandidateAction, pageCandidatesAction } from "./lookup-actions";
export const dynamic = "force-dynamic";

export default async function AddTitlePage({ searchParams }: { searchParams: Promise<{ saved?: string | string[] }> }) {
  let saved: SavedTitle | undefined;
  let memberName: string;
  let contextKey: string, accountMode: boolean;
  try {
    const db = getDatabase(), request = await getGroupRequest();
    const context = requireTitleMember(db, request);
    contextKey=context.contextKey; accountMode=context.mode === "account";
    const id = (await searchParams).saved;
    if (id !== undefined) { if (typeof id !== "string") throw new Error(); saved = readSavedTitle(db, request, id); }
    memberName = db.prepare("SELECT name FROM members WHERE id=? AND group_id=?").get(context.activeMemberId!, context.groupId)!.name as string;
  } catch {
    // Distinguish a valid group needing profile selection from unavailable group access.
    try { if (!authorizeRequest(getDatabase(), await getGroupRequest()).activeMemberId) return <div className="page-content"><h1>Choose a profile first</h1><p>Select who is saving this title.</p><Link className="button" href="/group">Open group and select a profile</Link></div>; } catch { return <AccessErrorMessage />; }
    return <AccessErrorMessage />;
  }
  return <div className="page-content source-add-page"><div className="page-heading"><h1>Add a title</h1><p className="page-introduction">Search to autofill details, or type them in yourself.</p><p className="source-save-context">Saving as <strong className="profile-name">{memberName}</strong> · <Link href="/group">{accountMode ? "Group members" : "Change profile"}</Link></p></div>
    {saved && <section className="placeholder saved-summary" aria-labelledby="saved-heading"><h2 id="saved-heading">Title saved</h2><p className="saved-title-name">{saved.title ?? "Metadata unavailable"}</p>
      <dl><dt>Content type</dt><dd>{contentTypes.find((type) => type.value === saved.contentType)?.label ?? "Content type unavailable"}</dd>
        <dt>{saved.numberingStyle === "none" ? "Full duration" : "Typical episode duration"}</dt><dd>{durationLabel(saved.durationSeconds)}</dd>
        <dt>Numbering</dt><dd>{saved.numberingStyle === "none" ? "None" : saved.numberingStyle === "continuous" ? "Continuous numbering" : "Season + episode"}</dd>
        <dt>Moods</dt><dd>{saved.moods.join(", ")}</dd><dt>Genres</dt><dd>{saved.genres.join(", ") || "None"}</dd>
        <dt>Watch link</dt><dd>{saved.watchUrl ? <a href={saved.watchUrl} rel="noreferrer">{saved.watchUrl}</a> : "Not provided"}</dd>
        <dt>Added by</dt><dd>{saved.contributors.join(", ")}</dd></dl><Link href={`/watchlist/add?saved=${encodeURIComponent(saved.id)}`}>Reopen saved summary</Link>{" · "}<Link href={`/watchlist/${encodeURIComponent(saved.id)}`}>Open details, refresh or correct metadata</Link>
    </section>}
    <TitleForm key={contextKey+(saved?.id ?? "new")} action={saveTitleAction.bind(null,contextKey)} lookup={lookupTitleAction.bind(null,contextKey)} select={selectCandidateAction.bind(null,contextKey)} page={pageCandidatesAction.bind(null,contextKey)} />
  </div>;
}
