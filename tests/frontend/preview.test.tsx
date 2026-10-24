import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockEntry } from "../../app/mock/preview";
import { selectDemo } from "../../frontend/service/contracts";
import { Navigation } from "../../app/components/navigation";
const route = vi.hoisted(() => ({ pathname: "/mock" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const advance = async (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const choose = (value: string) => fireEvent.change(screen.getByLabelText("Simulated response"), { target: { value } });
it("uses actual async read/reset state, retains the warning and marks all domains unavailable", async () => {
  render(<MockEntry selection={selectDemo(undefined, undefined)} />);
  expect(screen.getByLabelText("Synthetic demo notice").textContent).toContain("not real authentication");
  expect(screen.queryAllByText("Not available yet")).toHaveLength(0); expect(screen.queryByText("Personal progress, ratings and notes")).toBeNull(); expect(screen.queryByText("Picker and Pick again")).toBeNull(); expect(screen.queryByRole("link")).toBeNull();
  click("Load preview"); expect((screen.getByRole("button", { name: "Load preview" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getAllByRole("status")[0].textContent).toContain("Loading"); expect(screen.queryByText("Demo revision: 0")).toBeNull();
  await advance(80); expect(screen.getByText("Demo revision: 0")).toBeTruthy();
  click("Reset demo"); await advance(80); expect(screen.getByText("Demo revision: 1")).toBeTruthy();
  expect(screen.getByLabelText("Synthetic demo notice")).toBeTruthy(); expect(document.activeElement).toBe(screen.getAllByRole("status")[0]);
});
it("exposes failure/retry and cancel without clearing or overwriting the last successful context", async () => {
  render(<MockEntry selection={selectDemo("mock", "ready")} />);
  click("Load preview"); await advance(80); choose("unavailable"); click("Load preview"); await advance(300);
  expect(screen.getByRole("alert").textContent).toContain("Choose Ready and retry"); expect(screen.getByText("Demo revision: 0")).toBeTruthy();
  expect(document.activeElement).toBe(screen.getByRole("alert"));
  choose("slow"); click("Load preview"); click("Cancel request"); await advance(1200);
  expect(screen.getAllByRole("status")[0].textContent).toContain("canceled"); expect(screen.getByText("Demo revision: 0")).toBeTruthy();
  choose("ready"); click("Load preview"); await advance(80); expect(screen.getAllByRole("status")[0].textContent).toBe("Synthetic preview ready.");
});
it("reset supersedes a slow read and canceled reset never commits or wins later", async () => {
  render(<MockEntry selection={selectDemo("mock", "slow")} />);
  click("Load preview"); click("Reset demo"); await advance(80); expect(screen.getByText("Demo revision: 1")).toBeTruthy();
  await advance(1200); expect(screen.getAllByRole("status")[0].textContent).toBe("Synthetic preview ready.");
  click("Reset demo"); click("Cancel request"); await advance(80); expect(screen.getByText("Demo revision: 1")).toBeTruthy();
  choose("ready"); click("Load preview"); await advance(80); expect(screen.getByText("Demo revision: 1")).toBeTruthy();
});
it("changing scenario discards the pending result; leaving releases all pending work", async () => {
  const rendered = render(<MockEntry selection={selectDemo("mock", "slow")} />);
  click("Load preview"); choose("unavailable"); await advance(1200); expect(screen.queryByLabelText("Synthetic context")).toBeNull();
  expect(screen.getAllByRole("status")[0].textContent).toContain("canceled"); click("Load preview");
  rendered.unmount(); await advance(300); expect(vi.getTimerCount()).toBe(0);
});
it("invalid entry selection is visibly rejected without exposing working preview controls", () => {
  render(<MockEntry selection={selectDemo("http", "ready")} />);
  expect(screen.getByRole("alert").textContent).toContain("Unsupported preview selection");
  expect(screen.getByLabelText("Synthetic demo notice")).toBeTruthy(); expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByRole("link").getAttribute("href")).toBe("/mock");
});
it("only the explicit mock path gets isolated navigation; production prefixes keep existing destinations", () => {
  route.pathname = "/mock"; const rendered = render(<Navigation />);
  expect(screen.getByRole("navigation", { name: "Mock preview navigation" })).toBeTruthy();
  expect(screen.getAllByRole("link").map(link => link.getAttribute("href"))).toEqual(["/mock", "/"]);
  for (const pathname of ["/", "/watchlist", "/mockery"]) {
    route.pathname = pathname; rendered.rerender(<Navigation />);
    expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy(); expect(screen.getAllByRole("link")).toHaveLength(6);
  }
});
