import { getDatabase } from "../../db/server";
import { getActiveGroup } from "../../lib/access";
import Link from "next/link";
import { initials } from "../../lib/profile-state";

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

export async function HeaderAccount() {
  try {
    const context = await getActiveGroup();
    const member = context.activeMemberId
      ? getDatabase().prepare("SELECT name, avatar_color FROM members WHERE id=? AND group_id=?")
        .get(context.activeMemberId, context.groupId) as { name?: string; avatar_color?: string } | undefined
      : undefined;
    if (!member?.name) return null;
    return <Link className="header-account" href={context.mode === "account" ? "/account" : "/group"} aria-label={context.mode === "account" ? "Account and sign out" : "Group profile"} title={member.name}>
      <span className="avatar" style={{ backgroundColor: member.avatar_color }} aria-hidden="true">{initials(member.name)}</span>
    </Link>;
  } catch { return null; }
}
