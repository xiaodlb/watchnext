import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export type SessionContext = { revision: number; mode: "anonymous" | "account" | "legacy"; groupId: string | null };
export type Group = { id: string; name: string; kind: string; generation: number };
export type Workspace = {
  mode: "account" | "legacy";
  memberships: Group[];
  selected: Group | null;
  members: { id: string; name: string; color: string; inactive?: boolean }[];
  profileId: string | null;
  currentMemberId: string | null;
  canManage: boolean;
  pending: { needsAccount: boolean; groupName: string | null } | null;
  context: SessionContext;
};

type Auth = {
  user: string | null;
  accountId: string | null;
  context: SessionContext;
  workspace: Workspace | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  request: (path: string, method?: string, body?: Record<string, unknown>) => Promise<any>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, confirmation: string) => Promise<string>;
  recover: (username: string, proof: string, password: string, confirmation: string) => Promise<string>;
  logout: () => Promise<void>;
  createGroup: (name: string) => Promise<string>;
  selectGroup: (groupId: string) => Promise<void>;
  resolveInvitation: (invite: string) => Promise<any>;
  joinGroup: () => Promise<void>;
};

const anonymous: SessionContext = { revision: 0, mode: "anonymous", groupId: null };
const AuthContext = createContext<Auth | null>(null);
function sameContext(a?: SessionContext, b?: SessionContext) {
  return Boolean(a && b && a.revision === b.revision && a.mode === b.mode && a.groupId === b.groupId);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<SessionContext>(anonymous);
  const contextRef = useRef(context);
  const [user, setUser] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const adopt = useCallback((next?: SessionContext) => {
    if (next && typeof next.revision === "number") {
      contextRef.current = next;
      setContext(next);
    }
  }, []);

  const request = useCallback(async (path: string, method = "GET", body: Record<string, unknown> = {}) => {
    const route = path.replace(/^\/?v1\//, "").replace(/^\//, "");
    const started = contextRef.current;
    const isMutation = method !== "GET";
    const noRevision = ["auth/login", "auth/register", "auth/recovery", "invitations/resolve", "legacy/groups"].includes(route);
    const payload = isMutation ? { ...body, ...(!noRevision ? { expectedContextRevision: contextRef.current.revision } : {}) } : undefined;
    const response = await fetch(`/v1/${route}`, {
      method,
      credentials: "same-origin",
      cache: "no-store",
      ...(isMutation ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error?.message || data?.message || "The request could not be completed.");
    const current = contextRef.current;
    if (noRevision || (current.revision === started.revision && current.mode === started.mode && current.groupId === started.groupId)) adopt(data.context);
    return data;
  }, [adopt]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      // A context change can race either request (for example, when a group is
      // selected while an older workspace fetch is in flight). Discarding that
      // response is correct, but returning silently leaves the authenticated
      // UI without its workspace until another refresh happens. Retry against
      // the latest context a few times instead.
      for (let attempt = 0; attempt < 3; attempt++) {
        const session = await request("context");
        const nextContext = session.context as SessionContext;
        if (!sameContext(contextRef.current, nextContext)) continue;
        if (nextContext.mode === "anonymous") {
          setUser(null);
          setAccountId(null);
          setWorkspace(null);
          return;
        }

        const nextWorkspace = await request("groups/current");
        if (!sameContext(nextWorkspace.context, contextRef.current) || !sameContext(nextContext, contextRef.current)) continue;

        setUser(session.account?.username ?? null);
        setAccountId(session.account?.id ?? null);
        setWorkspace(nextWorkspace);
        if (nextContext.mode === "legacy") setUser(nextWorkspace.members.find((m: { id: string }) => m.id === nextWorkspace.profileId)?.name ?? null);
        return;
      }
      throw new Error("The group workspace changed while it was loading. Please try again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to connect to WatchNext.");
      throw cause;
    } finally { setLoading(false); }
  }, [request, adopt]);

  useEffect(() => { void refresh().catch(() => {}); }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    await request("auth/login", "POST", { username, password });
    await refresh();
  }, [request, refresh]);
  const register = useCallback(async (username: string, password: string, confirmation: string) => {
    const result = await request("auth/register", "POST", { username, password, confirmation });
    // Registration has already committed and its recovery code is disclosed
    // only once; a later context refresh must never discard that code.
    await refresh().catch(() => {});
    return result.recoveryCode as string;
  }, [request, refresh]);
  const recover = useCallback(async (username: string, proof: string, password: string, confirmation: string) => {
    const result = await request("auth/recovery", "POST", { username, proof, password, confirmation });
    await refresh().catch(() => {});
    return result.recoveryCode as string;
  }, [request, refresh]);
  const logout = useCallback(async () => { await request("auth/logout", "POST"); await refresh(); }, [request, refresh]);
  const createGroup = useCallback(async (name: string) => { const result = await request("groups", "POST", { name }); await refresh().catch(() => {}); return result.invite as string; }, [request, refresh]);
  const selectGroup = useCallback(async (groupId: string) => { await request("context/group-selection", "PUT", { groupId }); await refresh(); }, [request, refresh]);
  const resolveInvitation = useCallback((invite: string) => request("invitations/resolve", "POST", { invite }), [request]);
  const joinGroup = useCallback(async () => { await request("groups/pending/join", "POST"); await refresh(); }, [request, refresh]);

  return <AuthContext.Provider value={{ user, accountId, context, workspace, loading, error, refresh, request, login, register, recover, logout, createGroup, selectGroup, resolveInvitation, joinGroup }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider missing");
  return value;
}
