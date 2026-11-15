import { beforeEach, describe, expect, it, vi } from "vitest";

const counters = vi.hoisted(() => new Map<string, ReturnType<typeof vi.fn>>());
vi.mock("@opentelemetry/api", () => ({
  metrics: { getMeter: () => ({ createCounter: (name: string) => {
    const add = vi.fn(); counters.set(name, add); return { add };
  } }) },
}));

describe("application metric outcomes", () => {
  let recordApplicationMetrics: typeof import("../lib/telemetry/metrics").recordApplicationMetrics;
  let recordTitleException: typeof import("../lib/telemetry/metrics").recordTitleException;
  beforeEach(async () => {
    vi.resetModules();
    counters.clear();
    ({ recordApplicationMetrics, recordTitleException } = await import("../lib/telemetry/metrics"));
  });

  it("counts successful group creation only", async () => {
    await recordApplicationMetrics("POST", ["groups"], new Response("{}", { status: 200 }));
    await recordApplicationMetrics("POST", ["groups"], new Response("{}", { status: 400 }));
    await recordApplicationMetrics("GET", ["groups"], new Response("{}"));
    expect(counters.get("watchnext.groups.created")).toHaveBeenCalledTimes(1);
  });

  it("counts actual creations and failures, not duplicate contributions", async () => {
    const path = ["library", "manual"];
    await recordApplicationMetrics("POST", path, Response.json({ status: "created" }));
    await recordApplicationMetrics("POST", path, Response.json({ status: "contributed" }));
    await recordApplicationMetrics("POST", path, new Response("{}", { status: 400 }));
    recordTitleException("POST", ["metadata", "reviews", "private-handle", "save"]);
    expect(counters.get("watchnext.titles.created")).toHaveBeenCalledTimes(1);
    expect(counters.get("watchnext.titles.creation.failures")).toHaveBeenCalledTimes(2);
    expect(counters.get("watchnext.titles.creation.failures")).toHaveBeenCalledWith(1);
  });
});
