import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/lib/auth";

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("account workspace refresh", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("retries a stale workspace response after the account context changes", async () => {
    const firstContext = { revision: 3, mode: "account", groupId: "group-a" } as const;
    const secondContext = { revision: 4, mode: "account", groupId: "group-b" } as const;
    const groupA = { id: "group-a", name: "First watchlist", kind: "account", generation: 1 };
    const groupB = { id: "group-b", name: "Second watchlist", kind: "account", generation: 1 };
    const firstWorkspace = {
      mode: "account", memberships: [groupA], selected: groupA, members: [], profileId: null,
      currentMemberId: "member-a", canManage: true, pending: null, context: firstContext,
    };
    const latestWorkspace = {
      mode: "account", memberships: [groupA, groupB], selected: groupB, members: [], profileId: null,
      currentMemberId: "member-b", canManage: true, pending: null, context: secondContext,
    };
    const oldWorkspaceResponse = deferred<Response>();
    let auth: ReturnType<typeof useAuth> | null = null;
    let contextReads = 0;
    let workspaceReads = 0;

    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const route = String(input);
      if (route === "/v1/context") {
        contextReads++;
        const context = contextReads === 1 ? firstContext : secondContext;
        return Promise.resolve(jsonResponse({
          context,
          account: { id: "account-a", username: "watcher", memberships: ["group-a", ...(contextReads === 1 ? [] : ["group-b"])] },
          group: context.groupId === "group-a" ? groupA : groupB,
        }));
      }
      if (route === "/v1/groups/current") {
        workspaceReads++;
        return workspaceReads === 1 ? oldWorkspaceResponse.promise : Promise.resolve(jsonResponse(latestWorkspace));
      }
      if (route === "/v1/context/group-selection") return Promise.resolve(jsonResponse({ context: secondContext }));
      throw new Error(`Unexpected request ${route}`);
    }));

    function Probe() {
      auth = useAuth();
      return <output data-testid="groups">{auth.workspace?.memberships.map(group => group.name).join(",") ?? ""}</output>;
    }

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(workspaceReads).toBe(1));
    await auth!.request("context/group-selection", "PUT", { groupId: "group-b" });
    oldWorkspaceResponse.resolve(jsonResponse(firstWorkspace));

    await waitFor(() => expect(screen.getByTestId("groups")).toHaveTextContent("First watchlist,Second watchlist"));
    expect(contextReads).toBe(2);
    expect(workspaceReads).toBe(2);
  });

  it("does not let an older same-context refresh overwrite a newer membership list", async () => {
    const context = { revision: 7, mode: "account", groupId: "group-a" } as const;
    const groupA = { id: "group-a", name: "First watchlist", kind: "account", generation: 1 };
    const groupB = { id: "group-b", name: "Second watchlist", kind: "account", generation: 1 };
    const workspaceA = {
      mode: "account", memberships: [groupA], selected: groupA, members: [], profileId: null,
      currentMemberId: "member-a", canManage: true, pending: null, context,
    };
    const workspaceAandB = {
      ...workspaceA, memberships: [groupA, groupB],
    };
    const oldWorkspaceResponse = deferred<Response>();
    let auth: ReturnType<typeof useAuth> | null = null;
    let oldRefresh: Promise<void> | null = null;
    let workspaceReads = 0;

    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => {
      const route = String(input);
      if (route === "/v1/context") {
        return Promise.resolve(jsonResponse({
          context,
          account: { id: "account-a", username: "watcher", memberships: ["group-a", "group-b"] },
          group: groupA,
        }));
      }
      if (route === "/v1/groups/current") {
        workspaceReads++;
        if (workspaceReads === 1) return Promise.resolve(jsonResponse(workspaceA));
        if (workspaceReads === 2) return oldWorkspaceResponse.promise;
        return Promise.resolve(jsonResponse(workspaceAandB));
      }
      throw new Error(`Unexpected request ${route}`);
    }));

    function Probe() {
      auth = useAuth();
      return <>
        <output data-testid="groups">{auth.workspace?.memberships.map(group => group.name).join(",") ?? ""}</output>
        <button type="button" onClick={() => { oldRefresh = auth!.refresh(); }}>Start older refresh</button>
      </>;
    }

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("groups")).toHaveTextContent("First watchlist"));

    fireEvent.click(screen.getByRole("button", { name: "Start older refresh" }));
    await waitFor(() => expect(workspaceReads).toBe(2));
    await act(async () => { await auth!.refresh(); });
    expect(screen.getByTestId("groups")).toHaveTextContent("First watchlist,Second watchlist");

    await act(async () => {
      oldWorkspaceResponse.resolve(jsonResponse(workspaceA));
      await oldRefresh;
    });
    expect(screen.getByTestId("groups")).toHaveTextContent("First watchlist,Second watchlist");
    expect(workspaceReads).toBe(3);
  });
});
