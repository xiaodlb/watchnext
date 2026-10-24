import { avatarColors } from "../service/contracts";
import type { AccountSummary, AvatarColor, ContextIdentity, GroupService, GroupSummary, GroupWorkspace, InviteDisclosure, MemberSummary, RequestOptions, ServiceResult } from "../service/contracts";
type Member = { id: string; accountId: string | null; name: string; color: AvatarColor; active: boolean; generation: number; removedAtGeneration: number | null; references: MemberSummary["references"] };
type Group = { id: string; name: string; kind: "account" | "legacy"; owner: string | null; generation: number; invite: string; members: Member[] };
type Hooks = {
  account: () => AccountSummary | null;
  identity: () => ContextIdentity;
  bump: () => void;
  code: () => string;
  now: () => number;
  gate: <T>(expected: ContextIdentity, options: RequestOptions, commit: () => ServiceResult<T>) => Promise<ServiceResult<T>>;
};
/** Synthetic service-local authority only; never a real authentication boundary. */
export function createMockGroups(h: Hooks) {
  let groups: Group[] = [], selected: string | null = null, profileId: string | null = null, mode: "account" | "legacy" = "account", counter = 0;
  let pending: { groupId: string; generation: number; expiresAt: number; accountId: string | null; revision: number } | null = null;
  const refs = (id: string) => Object.freeze({ contributions: Object.freeze([`contribution-${id}`]), history: Object.freeze([`history-${id}`]) });
  const member = (id: string, accountId: string | null, name: string, color: AvatarColor, seeded = false): Member => ({ id, accountId, name, color, active: true, generation: 1, removedAtGeneration: null, references: seeded ? refs(id) : Object.freeze({ contributions: Object.freeze([]), history: Object.freeze([]) }) });
  function reset() {
    groups = [
      { id: "friday", name: "Synthetic Friday friends", kind: "account", owner: "seeded-owner", generation: 1, invite: "SYNTHETIC-FRIDAY-INITIAL", members: [member("friday-owner", "seeded-owner", "Demo.Owner", "purple", true), member("friday-viewer", "seeded-viewer", "Demo.Viewer", "blue", true)] },
      { id: "weekend", name: "Synthetic weekend pair", kind: "account", owner: "seeded-viewer", generation: 1, invite: "SYNTHETIC-WEEKEND-INITIAL", members: [member("weekend-viewer", "seeded-viewer", "Demo.Viewer", "blue", true), { ...member("weekend-retired", "seeded-retired", "Past participant", "slate", true), active: false, generation: 2, removedAtGeneration: 1 }] },
      { id: "legacy-sample", name: "Separate legacy sample", kind: "legacy", owner: null, generation: 1, invite: "SYNTHETIC-LEGACY-INITIAL", members: [member("legacy-sample-profile", null, "Legacy sample", "teal", true)] },
    ]; selected = null; profileId = null; mode = "account"; counter = 0; pending = null;
  }
  reset();
  const summary = (g: Group): GroupSummary => Object.freeze({ id: g.id, name: g.name, kind: g.kind, generation: g.generation });
  const own = (g: Group) => g.members.find(m => m.accountId === h.account()?.id && m.active);
  const accessible = (): Group | undefined => groups.find(g => g.id === selected && g.kind === mode && (mode === "legacy" || !!own(g)));
  const denied = (message = "This synthetic group or member is not available to your current identity."): ServiceResult<never> => ({ kind: "failure", error: { code: "group_access", message, retryable: true } });
  const invalid = (message: string): ServiceResult<never> => ({ kind: "failure", error: { code: "group_input", message, retryable: true } });
  const badInvite = (): ServiceResult<never> => ({ kind: "failure", error: { code: "invite_invalid", message: "This synthetic invite or pending intent is missing, expired or revoked. Resolve a current invite and try again.", retryable: true } });
  const validName = (name: string, max: number) => name.length > 0 && [...name].length <= max && !name.includes("\0");
  const memberships = (accountId: string) => groups.filter(g => g.kind === "account" && g.members.some(m => m.accountId === accountId && m.active)).map(summary);
  function workspace(): GroupWorkspace {
    const g = accessible(), account = h.account();
    const intent = pending && pending.expiresAt > h.now() && pending.revision === h.identity().revision && (!pending.accountId || pending.accountId === account?.id) && groups.find(x => x.id === pending!.groupId && x.generation === pending!.generation);
    return Object.freeze({ mode, memberships: account ? memberships(account.id) : [], selected: g ? summary(g) : null, members: g ? g.members.map(m => Object.freeze({ ...m, owner: g.owner === m.accountId && g.kind === "account", you: mode === "account" ? m.accountId === account?.id : m.id === profileId })) : [], profileId: g?.kind === "legacy" ? profileId : null, canManage: !!g && g.kind === "account" && g.owner === account?.id, pending: intent ? { needsAccount: !account, groupName: account ? intent.name : null } : null });
  }
  const result = (): ServiceResult<GroupWorkspace> => ({ kind: "success", value: workspace(), context: h.identity() });
  function changed(keepPending = false) { h.bump(); if (!keepPending) pending = null; }
  function accountChanged(before: AccountSummary | null, after: AccountSummary | null) {
    selected = null; profileId = null; mode = "account";
    if (pending && !before && after && !pending.accountId && pending.revision === h.identity().revision - 1) { pending.accountId = after.id; pending.revision = h.identity().revision; }
    else pending = null;
  }
  const run = <T>(expected: ContextIdentity, options: RequestOptions | undefined, commit: () => ServiceResult<T>) => h.gate(expected, options ?? {}, commit);
  function create(name: string, kind: "account" | "legacy"): ServiceResult<InviteDisclosure> {
    const value = name.trim(); if (!validName(value, 80)) return invalid("Group name must contain 1-80 characters without NUL.");
    const account = h.account(); if (kind === "account" && !account) return denied("Sign in to a synthetic account before creating an account group.");
    const id = `created-group-${++counter}`, invite = h.code();
    const g: Group = { id, name: value, kind, owner: kind === "account" ? account!.id : null, generation: 1, invite, members: kind === "account" ? [member(`member-${id}`, account!.id, account!.username, "blue")] : [] };
    groups.push(g); mode = kind; selected = kind === "account" ? id : null; profileId = null; changed();
    return { kind: "success", value: { invite, kind }, context: h.identity() };
  }
  const service: GroupService = Object.freeze<GroupService>({
    read: (options = {}) => run(h.identity(), options, result),
    create: (name, expected, options) => run(expected, options, () => create(name, "account")),
    createLegacy: (name, expected, options) => run(expected, options, () => create(name, "legacy")),
    select: (id, expected, options) => run(expected, options, () => {
      const g = groups.find(g => g.id === id && g.kind === "account"); if (!g || !own(g)) return denied();
      mode = "account"; selected = id; profileId = null; changed(); return result();
    }),
    mode: (next, expected, options) => run(expected, options, () => {
      if (next !== "account" && next !== "legacy") return invalid("Choose account or legacy mode.");
      mode = next; selected = null; profileId = null; changed(); return result();
    }),
    resolve: (invite, expected, options) => run(expected, options, () => {
      const g = groups.find(g => g.invite === invite); if (!g) return badInvite();
      if (g.kind === "legacy") { mode = "legacy"; selected = g.id; profileId = null; changed(); return result(); }
      changed(); pending = { groupId: g.id, generation: g.generation, expiresAt: h.now() + 600000, accountId: h.account()?.id ?? null, revision: h.identity().revision }; return result();
    }),
    join: (expected, options) => run(expected, options, () => {
      const account = h.account(); if (!account) return denied("Sign in or register, then explicitly Join the pending synthetic group.");
      const p = pending, g = p && groups.find(g => g.id === p.groupId && g.kind === "account" && g.generation === p.generation);
      if (!p || !g || p.expiresAt <= h.now() || p.revision !== h.identity().revision || p.accountId !== account.id) return badInvite();
      let m = g.members.find(m => m.accountId === account.id);
      if (m && !m.active && g.generation <= m.removedAtGeneration!) return denied("A removed member needs a newer invitation generation before rejoining.");
      if (!m) { m = member(`member-${g.id}-${account.id}`, account.id, account.username, "teal"); g.members.push(m); }
      else if (!m.active) { m.active = true; m.generation++; }
      mode = "account"; selected = g.id; profileId = null; changed(); return result();
    }),
    remove: (id, generation, expected, options) => run(expected, options, () => {
      const g = accessible(), account = h.account(); if (!g || g.kind !== "account" || g.owner !== account?.id) return denied("Only the current synthetic creator can remove participants.");
      const m = g.members.find(m => m.id === id); if (!m || m.accountId === g.owner || m.generation !== generation) return denied("Cannot remove yourself, a foreign member or a stale membership generation.");
      if (m.active) { m.active = false; m.removedAtGeneration = g.generation; m.generation++; changed(); }
      return result();
    }),
    rotate: (generation, expected, options) => run<InviteDisclosure>(expected, options, () => {
      const g = accessible(); if (!g || g.kind !== "account" || g.owner !== h.account()?.id) return denied("Only the current synthetic creator can rotate invitations.");
      if (g.generation !== generation) return denied("The invitation generation changed. Read current management before retrying.");
      g.generation++; g.invite = h.code(); changed(); return { kind: "success", value: { invite: g.invite, kind: "account" }, context: h.identity() };
    }),
    createProfile: (name, color, expected, options) => run(expected, options, () => {
      const g = accessible(); if (!g || g.kind !== "legacy") return denied("Resolve a separate legacy invitation before choosing a profile.");
      const normalized = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
      if (!validName(normalized, 40) || !avatarColors.includes(color)) return invalid("Use a 1-40 character profile name without NUL and one of the six labeled colors.");
      if (g.members.some(m => m.name.toLowerCase() === normalized.toLowerCase())) return invalid("That normalized name already exists in this legacy group.");
      const m = member(`profile-${++counter}`, null, normalized, color); g.members.push(m); profileId = m.id; changed(); return result();
    }),
    selectProfile: (id, expected, options) => run(expected, options, () => {
      const g = accessible(), m = g?.members.find(m => m.id === id); if (!g || g.kind !== "legacy" || !m) return denied();
      profileId = m.id; changed(); return result();
    }),
  });
  return { service, reset, accountChanged, memberships, workspace, current: () => { const g = accessible(); return g ? summary(g) : null; } };
}
