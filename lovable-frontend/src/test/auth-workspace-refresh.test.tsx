import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
});
