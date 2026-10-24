import { getDatabase } from "../../db/server";
import { getActiveGroup } from "../../lib/access";

/** A small truthful group/person pill; it never relies on browser fixtures. */
export async function ContextBadge() {
  try {
    const context = await getActiveGroup();
    const member = context.activeMemberId
      ? getDatabase().prepare("SELECT name FROM members WHERE id=? AND group_id=?")
        .get(context.activeMemberId, context.groupId) as { name?: string } | undefined
      : undefined;
    const identity = member?.name ?? (context.mode === "account" ? "Account member" : "Choose profile");
    return <span className="context-badge" title={`${context.groupName} · ${identity}`}>
      <span className="context-badge-group">{context.groupName}</span>
      <span aria-hidden="true">·</span>
      <span>{identity}</span>
    </span>;
  } catch {
    return null;
  }
}
