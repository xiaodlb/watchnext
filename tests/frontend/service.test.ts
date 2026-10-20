// @vitest-environment node
import { afterEach, beforeEach, expect, expectTypeOf, it, vi } from "vitest";
import { createMockService, scenarioDelays } from "../../frontend/mock/service";
import { selectDemo } from "../../frontend/service/contracts";
import type { MockContext, MockScenario, ServiceResult } from "../../frontend/service/contracts";
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
async function finish<T>(promise: Promise<T>, delay = 80) { await vi.advanceTimersByTimeAsync(delay); return promise; }
it("returns a concrete context asynchronously and resets only its own instance", async () => {
  const first = createMockService(), second = createMockService(); let settled = false;
  const pending = first.context.read().then(result => { settled = true; return result; });
  await vi.advanceTimersByTimeAsync(79); expect(settled).toBe(false);
  const read = await finish(pending, 1); expectTypeOf(read).toEqualTypeOf<ServiceResult<MockContext>>();
  expect(read.kind).toBe("success"); if (read.kind !== "success") throw Error("Expected context");
  expect(read.value).toMatchObject({ account: null, group: null, identity: { revision: 0, mode: "mock" } });
  const reset = await finish(first.context.reset(read.context)); expect(reset.kind).toBe("success");
  if (reset.kind !== "success") throw Error("Expected reset"); expect(reset.context.revision).toBe(1);
  const other = await finish(second.context.read()); expect(other.kind).toBe("success");
  if (other.kind !== "success") throw Error("Expected other context"); expect(other.context.revision).toBe(0);
  expect(other.context.instance).not.toBe(read.context.instance);
  expect((await second.context.reset(read.context)).kind).toBe("stale");
  expect((await first.context.reset(read.context)).kind).toBe("stale");
});
it("bounds deterministic scenarios and exposes typed actionable failure without mutating context", async () => {
  expect(Math.max(...Object.values(scenarioDelays))).toBeLessThanOrEqual(1200);
  const service = createMockService(); const failure = await finish(service.context.read({ scenario: "unavailable" }), 300);
  expect(failure).toMatchObject({ kind: "failure", error: { code: "demo_unavailable", retryable: true } });
  const retry = await finish(service.context.read()); expect(retry.kind).toBe("success");
  if (retry.kind === "success") expect(retry.context.revision).toBe(0);
  expect(await service.context.read({ scenario: "arbitrary" as MockScenario })).toMatchObject({ kind: "failure", error: { code: "invalid_selection", fields: { scenario: expect.any(String) } } });
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels before and during read/reset without committing state or leaving timers", async () => {
  const service = createMockService(); const stopped = new AbortController(); stopped.abort();
  expect((await service.context.read({ signal: stopped.signal })).kind).toBe("cancelled");
  const controller = new AbortController(); const read = service.context.read({ scenario: "slow", signal: controller.signal });
  controller.abort(); expect((await read).kind).toBe("cancelled"); expect(vi.getTimerCount()).toBe(0);
  const resetController = new AbortController(); const reset = service.context.reset(service.context.initialIdentity, { signal: resetController.signal });
  resetController.abort(); expect((await reset).kind).toBe("cancelled");
  const current = await finish(service.context.read()); if (current.kind !== "success") throw Error("Expected context"); expect(current.context.revision).toBe(0);
});
it("stales pending reads and permits only one competing reset for the captured context", async () => {
  const service = createMockService(); const old = service.context.read({ scenario: "slow" });
  const one = service.context.reset(service.context.initialIdentity), two = service.context.reset(service.context.initialIdentity);
  await vi.advanceTimersByTimeAsync(80); expect((await one).kind).toBe("success"); expect((await two).kind).toBe("stale");
  await vi.advanceTimersByTimeAsync(1120); expect((await old).kind).toBe("stale");
  const now = await finish(service.context.read()); if (now.kind !== "success") throw Error("Expected context"); expect(now.context.revision).toBe(1);
});
it("rejects unsupported or repeated selectors safely rather than silently selecting production or a persona", () => {
  expect(selectDemo(undefined, undefined)).toEqual({ kind: "success", value: { mode: "mock", scenario: "ready" } });
  for (const [mode, scenario] of [["http", undefined], ["production", "ready"], [["mock", "mock"], "ready"], ["mock", ["slow", "ready"]], ["mock", "<unsafe>"]]) {
    const result = selectDemo(mode, scenario); expect(result.kind).toBe("failure");
    if (result.kind === "failure") { expect(result.error.code).toBe("invalid_selection"); expect(result.error.fields).toBeTruthy(); expect(result.error.message).not.toContain("<unsafe>"); }
  }
});
it("executes every foundation scenario and reset without network or process configuration access", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => { throw Error("Network forbidden"); });
  const service = createMockService();
  for (const scenario of ["ready", "slow", "unavailable"] as const) await finish(service.context.read({ scenario }), scenarioDelays[scenario]);
  await finish(service.context.reset(service.context.initialIdentity)); expect(fetch).not.toHaveBeenCalled();
});
