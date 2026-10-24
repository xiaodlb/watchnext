import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MockPicker } from "../../app/mock/picker";
import { MockEntry } from "../../app/mock/preview";
import { createMockService } from "../../frontend/mock/service";
import { titleDraft } from "../../frontend/mock/library";
import { selectDemo } from "../../frontend/service/contracts";
import type { ContextIdentity, FrontendService, MockScenario, PickerOutcome, PickerService, ServiceResult } from "../../frontend/service/contracts";
beforeEach(() => { vi.useFakeTimers(); window.history.replaceState(null, "", "/mock"); }); afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const advance = async (ms = 80) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
async function done<T>(p: Promise<T>, ms = 80) { await vi.advanceTimersByTimeAsync(ms); return p; }
function ok<T>(r: ServiceResult<T>) { if (r.kind !== "success") throw Error(r.kind); return r; }
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const click = (name: string) => fireEvent.click(button(name));
const region = () => within(screen.getByRole("region", { name: "Pick for me" }));
const checkbox = (name: string) => region().getByRole("checkbox", { name }) as HTMLInputElement;
const radio = (name: string) => region().getByRole("radio", { name }) as HTMLInputElement;
const time = () => region().getByLabelText("Available time (whole minutes)") as HTMLInputElement;
const feedback = () => document.querySelector(".picker-feedback") as HTMLElement;
const heading = () => region().queryByRole("heading", { level: 3 })?.textContent ?? null;
async function signedIn(s: FrontendService, user = "Demo.Owner", group = "friday") {
  const read = async () => ok(await done(s.context.read())).context;
  ok(await done(s.accounts.signIn({ username: user, password: "synthetic password" }, await read())));
  ok(await done(s.groups.select(group, await read())));
  return { current: await read() } as { current: ContextIdentity };
}
type Wrapped = FrontendService & { picker: { [K in keyof PickerService]: ReturnType<typeof vi.fn> & PickerService[K] } };
function wrap(s: FrontendService, override: Partial<PickerService> = {}): Wrapped {
  return { ...s, picker: { getInputs: vi.fn(override.getInputs ?? s.picker.getInputs), pick: vi.fn(override.pick ?? s.picker.pick), next: vi.fn(override.next ?? s.picker.next), restart: vi.fn(override.restart ?? s.picker.restart) } } as unknown as Wrapped;
}
async function mount(s: FrontendService, identity: { current: ContextIdentity }, onViewDetails = vi.fn(), scenario: MockScenario = "ready") {
  const view = render(<MockPicker service={s} identity={identity} scenario={scenario} announced={false} onViewDetails={onViewDetails} />);
  click("Load picker"); await advance();
  return { ...view, onViewDetails, setScenario: (next: MockScenario) => view.rerender(<MockPicker service={s} identity={identity} scenario={next} announced={false} onViewDetails={onViewDetails} />) };
}
const choose = (viewers: string[], minutes: string, mood = "Funny") => { for (const v of viewers) fireEvent.click(checkbox(v)); fireEvent.change(time(), { target: { value: minutes } }); fireEvent.click(radio(mood)); };

it("defaults: nothing preselected, rewatches off, presets only fill the field, native fieldsets and baseline idle text", async () => {
  const s = createMockService(); await mount(s, await signedIn(s));
  expect(region().getByText("Picking in Synthetic Friday friends")).toBeTruthy();
  expect([checkbox("Demo.Owner").checked, checkbox("Demo.Viewer").checked]).toEqual([false, false]);
  expect(time().value).toBe(""); expect(time().getAttribute("inputmode")).toBe("numeric"); expect(region().getAllByRole("radio").map(r => (r as HTMLInputElement).checked)).toEqual([false, false, false, false, false]);
  expect(region().getAllByRole("radio").map(r => r.parentElement?.textContent)).toEqual(["Funny", "Relaxing", "Exciting", "Dark", "Emotional"]);
  expect(checkbox("Rewatches OK").checked).toBe(false);
  expect(region().getByRole("group", { name: "Who’s watching?" }).tagName).toBe("FIELDSET"); expect(region().getByRole("group", { name: "Mood" }).tagName).toBe("FIELDSET");
  expect(["20 min", "45 min", "1 h 30 min", "2 h 30 min"].map(name => button(name).getAttribute("aria-pressed"))).toEqual(["false", "false", "false", "false"]);
  click("1 h 30 min"); expect(time().value).toBe("90"); expect(button("1 h 30 min").getAttribute("aria-pressed")).toBe("true"); expect(button("Pick for me").disabled).toBe(false);
  expect(feedback().textContent).toBe("Choose your viewers, time and mood, then pick."); expect(screen.queryByText(/Rating|note/i)).toBeNull();
});

it("errors: baseline messages are associated with their fields, focus moves to the announced feedback and invalid input creates no cycle", async () => {
  const s = wrap(createMockService()); await mount(s, await signedIn(s));
  click("Pick for me"); await advance();
  const viewersError = region().getByText("Select at least one viewer."); expect(region().getByRole("group", { name: "Who’s watching?" }).getAttribute("aria-describedby")).toBe(viewersError.id);
  expect(feedback().getAttribute("role")).toBe("alert"); expect(document.activeElement).toBe(feedback()); expect(feedback().textContent).toBe("Review the highlighted choices and try again.");
  fireEvent.click(checkbox("Demo.Viewer")); expect(region().queryByText("Select at least one viewer.")).toBeNull();
  fireEvent.change(time(), { target: { value: "045" } }); click("Pick for me"); await advance();
  const timeError = region().getByText("Enter whole minutes from 1 to 1440."); expect(time().getAttribute("aria-invalid")).toBe("true"); expect(time().getAttribute("aria-describedby")).toBe(`mock-picker-time-hint ${timeError.id}`);
  fireEvent.change(time(), { target: { value: "90" } }); click("Pick for me"); await advance();
  const moodError = region().getByText("Choose exactly one supported mood."); expect(region().getByRole("group", { name: "Mood" }).getAttribute("aria-describedby")).toBe(moodError.id);
  expect(s.picker.pick).toHaveBeenCalledTimes(3); expect(button("Pick for me")).toBeTruthy();
  fireEvent.click(radio("Funny")); click("Pick for me"); await advance();
  const first = await (s.picker.pick.mock.results[3].value as Promise<ServiceResult<PickerOutcome>>); const value = ok(first).value; expect(value.kind === "picked" ? value.cycle.cycleId : value.kind).toBe("cycle-1");
});

it("scenario 1 through the controls: result content, Pick again order, All matches shown, explicit Start again, keyboard submit and link attributes", async () => {
  const s = createMockService(); const view = await mount(s, await signedIn(s));
  choose(["Demo.Viewer"], "90"); fireEvent.submit(time().form!); await advance();
  expect(feedback().textContent).toBe("Your suggestion is ready."); expect(document.activeElement).toBe(feedback());
  const result = within(screen.getByRole("region", { name: "Together Tonight" }));
  for (const text of ["Exact match", "Movie · Full duration: 90 min", "Matches your mood and fits your available time.", "Requested: 90 minutes · Funny · Rewatches off", "External watching does not update progress. Update your own progress in details."]) expect(result.getByText(text)).toBeTruthy();
  expect(within(result.getByRole("list", { name: "Watching together" })).getByText("Demo.Viewer")).toBeTruthy(); expect(result.queryByRole("list", { name: "Rewatching" })).toBeNull();
  const link = result.getByRole("link", { name: "Watch (external)" }); expect([link.getAttribute("href"), link.getAttribute("target"), link.getAttribute("rel")]).toEqual(["https://example.test/watch/sample", "_blank", "noopener noreferrer"]);
  expect(result.queryByText(/8\/10|Synthetic personal note/)).toBeNull();
  fireEvent.click(result.getByRole("button", { name: "View details" })); expect(view.onViewDetails).toHaveBeenCalledWith("joint-movie");
  expect(button("Pick again")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Pick for me" })).toBeNull();
  click("Pick again"); await advance(); expect(heading()).toBe("Short Laughs");
  const series = within(screen.getByRole("region", { name: "Short Laughs" })); expect(series.getByText("Season 1, episode 2")).toBeTruthy(); expect(series.getByText("Series · Typical episode duration: 24 min")).toBeTruthy(); expect(series.getByRole("link", { name: "Open series (external)" }).getAttribute("rel")).toBe("noopener noreferrer");
  click("Pick again"); await advance(); expect(heading()).toBe("Paper Stars"); expect(region().getByText("Episode 2")).toBeTruthy();
  click("Pick again"); await advance(); expect(heading()).toBe("A Small Good Idea"); expect(region().getByText("YouTube video · Full duration: 15 min")).toBeTruthy();
  click("Pick again"); await advance(); expect(heading()).toBe("All matches shown"); expect(feedback().textContent).toBe("All matches shown. Choose Start again to begin explicitly.");
  expect(region().getByText("You’ve seen every match in this tier. Choose Start again to begin a freshly checked cycle. No other tier has been added.")).toBeTruthy();
  click("Start again"); await advance(); expect(heading()).toBe("Together Tonight"); expect(button("Pick again")).toBeTruthy();
});

it("catch-up, rewatching and missing-link results; over-budget and different-mood disclosures; no-match reasons with suggestion-only actions", async () => {
  const base = createMockService(); const identity = await signedIn(base);
  const video = ok(await done(base.library.detail("saved-video", identity.current))).value;
  ok(await done(base.library.save("saved-video", video.revision, { ...titleDraft(video), watchUrl: "" }, undefined, identity.current)));
  const view = await mount(base, identity);
  choose(["Demo.Owner", "Demo.Viewer"], "90"); fireEvent.click(checkbox("Rewatches OK")); click("Pick for me"); await advance(); click("Pick again"); await advance();
  const paper = within(screen.getByRole("region", { name: "Paper Stars" }));
  expect(paper.getByText("Episode 1")).toBeTruthy(); expect(paper.getByText("Catch-up episode for the least advanced viewer.")).toBeTruthy();
  expect(within(paper.getByRole("list", { name: "Rewatching" })).getByText("Demo.Viewer")).toBeTruthy(); expect(within(paper.getByRole("list", { name: "Watching together" })).getAllByRole("listitem").map(li => li.textContent)).toEqual(["DDemo.Owner", "DDemo.Viewer"]);
  click("Pick again"); await advance(); const asgi = within(screen.getByRole("region", { name: "A Small Good Idea" })); expect(asgi.getByText("No viewing link saved.")).toBeTruthy(); expect(asgi.queryByRole("link")).toBeNull();
  fireEvent.click(checkbox("Demo.Owner")); fireEvent.click(checkbox("Rewatches OK")); fireEvent.change(time(), { target: { value: "14" } }); click("Pick for me"); await advance();
  expect(region().getByText("Alternative suggestion")).toBeTruthy(); expect(region().getByText("1 minute longer than your available time.").className).toBe("notice");
  click("Pick again"); await advance(); expect(heading()).toBe("All matches shown");
  fireEvent.change(time(), { target: { value: "90" } }); fireEvent.click(radio("Relaxing")); click("Pick for me"); await advance();
  expect(region().getByText("Requested Relaxing; different mood: Funny. Within your available time.")).toBeTruthy();
  fireEvent.click(radio("Funny")); fireEvent.change(time(), { target: { value: "9" } }); click("Pick for me"); await advance();
  expect(feedback().textContent).toBe("No match for these settings."); expect(heading()).toBe("No match");
  expect(within(region().getByRole("list", { name: "No-match reasons" })).getAllByRole("listitem").map(li => li.textContent)).toEqual(["Some saved titles need usable title, type, duration or mood details.", "No viewer-eligible title meets the requested mood/time or permitted alternatives."]);
  expect(time().value).toBe("9"); expect(radio("Funny").checked).toBe(true); expect(checkbox("Demo.Viewer").checked).toBe(true); expect(button("Pick for me")).toBeTruthy();
  click("View details to review progress or metadata"); expect(view.onViewDetails).toHaveBeenCalledWith("expired-video");
});

it("pending, cancel and Unavailable retry reuse the same logical intent and step; duplicates are blocked and inputs stay editable", async () => {
  const s = wrap(createMockService()); const view = await mount(s, await signedIn(s));
  choose(["Demo.Viewer"], "90"); click("Pick for me"); await advance(); expect(heading()).toBe("Together Tonight");
  view.setScenario("slow"); click("Pick again");
  expect(button("Finding a pick…").disabled).toBe(true); expect(document.activeElement).toBe(button("Cancel pick")); expect(time().disabled).toBe(false); expect(checkbox("Demo.Owner").disabled).toBe(false);
  expect(feedback().textContent).toBe("Finding a pick for Demo.Viewer · 90 minutes · Funny · Rewatches off…"); expect(heading()).toBeNull();
  fireEvent.submit(time().form!); expect(s.picker.next).toHaveBeenCalledTimes(1);
  click("Cancel pick"); await advance(1300); expect(feedback().textContent).toContain("Pick canceled"); expect(document.activeElement).toBe(feedback()); expect(button("Retry pick")).toBeTruthy();
  view.setScenario("unavailable"); click("Retry pick"); await advance(300);
  expect(feedback().textContent).toBe("We couldn’t pick right now. Your inputs are still here. Please try again."); expect(feedback().getAttribute("role")).toBe("alert"); expect(button("Retry pick")).toBeTruthy();
  view.setScenario("ready"); click("Retry pick"); await advance(); expect(heading()).toBe("Short Laughs");
  const calls = s.picker.next.mock.calls; expect(calls).toHaveLength(3); expect(new Set(calls.map(c => c[1])).size).toBe(1); expect(new Set(calls.map(c => JSON.stringify(c[0]))).size).toBe(1);
  click("Pick again"); await advance(); expect(heading()).toBe("Paper Stars"); expect(s.picker.next.mock.calls[3][1]).not.toBe(calls[0][1]);
});

it("late responses from an older input generation are ignored, and editing discards the result, cycle and retry intent", async () => {
  let release: (value: ServiceResult<PickerOutcome>) => void = () => {};
  const real = createMockService(); const identity = await signedIn(real);
  const s = wrap(real, { pick: (...args) => { if ((args[0] as { availableMinutes: string }).availableMinutes === "33") return new Promise(resolve => { release = resolve; }); return real.picker.pick(...args); } });
  await mount(s, identity);
  choose(["Demo.Viewer"], "90"); click("Pick for me"); await advance(); expect(heading()).toBe("Together Tonight");
  fireEvent.click(radio("Relaxing")); expect(heading()).toBeNull(); expect(button("Pick for me")).toBeTruthy();
  fireEvent.click(radio("Funny")); click("Pick for me"); await advance(); expect(heading()).toBe("Together Tonight"); expect(s.picker.next).not.toHaveBeenCalled();
  fireEvent.change(time(), { target: { value: "33" } }); click("Pick for me"); expect(button("Finding a pick…")).toBeTruthy();
  fireEvent.change(time(), { target: { value: "90" } }); expect(button("Pick for me").disabled).toBe(false);
  await act(async () => { release({ kind: "success", value: { kind: "picked", refreshed: false, cycle: { cycleId: "late", step: "late-1" }, candidate: { id: "saved-video", title: "Late stale answer", contentType: "youtube", durationSeconds: 900, tier: "exact", message: "late", target: { kind: "item" }, rewatchers: [], viewers: [], availableMinutes: "33", requestedMood: "Funny", rewatches: false, watchUrl: null } }, context: identity.current }); await Promise.resolve(); });
  expect(screen.queryByText("Late stale answer")).toBeNull(); expect(heading()).toBeNull(); expect(feedback().textContent).toBe("Choose your viewers, time and mood, then pick.");
  click("Pick for me"); await advance(); expect(heading()).toBe("Together Tonight");
});

it("refreshed and conflict views: a selected change shows the refresh notice, synthetic expiry conflicts and Start a new cycle recovers", async () => {
  let clock = Date.parse("2026-10-19T12:00:00.000Z"); const s = wrap(createMockService({ now: () => clock })); const identity = await signedIn(s, "Demo.Viewer");
  await mount(s, identity); choose(["Demo.Viewer"], "90"); click("Pick for me"); await advance();
  const detail = ok(await done(s.library.detail("joint-movie", identity.current))).value;
  await act(async () => { ok(await done(s.progress.setCompleted("joint-movie", true, { memberId: detail.personal.own!.memberId, numberingStyle: "none" }, identity.current))); });
  click("Pick again"); await advance(); expect(region().getByText("List changed; picks refreshed.")).toBeTruthy(); expect(heading()).toBe("Short Laughs");
  await act(async () => { ok(await done(s.feedback.saveRating("saved-series", "4", { memberId: detail.personal.own!.memberId, numberingStyle: "season_episode" }, identity.current))); });
  click("Pick again"); await advance(); expect(region().queryByText("List changed; picks refreshed.")).toBeNull(); expect(heading()).toBe("Paper Stars");
  clock += 30 * 60000; click("Pick again"); await advance();
  expect(heading()).toBe("Start a new picking cycle"); expect(feedback().getAttribute("role")).toBe("alert"); expect(feedback().textContent).toBe("This picking cycle expired or changed. Start a new cycle to continue safely.");
  expect(screen.queryByRole("link")).toBeNull(); click("Start a new cycle"); await advance(); expect(heading()).toBe("Short Laughs"); expect(s.picker.pick).toHaveBeenCalledTimes(2);
});

it("legacy group with no profiles shows the honest empty state with a working create-profile action", async () => {
  const s = createMockService(); const read = async () => ok(await done(s.context.read())).context;
  ok(await done(s.groups.mode("legacy", await read()))); const invite = ok(await done(s.groups.createLegacy("Empty legacy", await read()))).value.invite; ok(await done(s.groups.resolve(invite, await read())));
  render(<><h2 id="mock-groups">Groups</h2><MockPicker service={s} identity={{ current: await read() }} scenario="ready" announced={false} onViewDetails={vi.fn()} /></>);
  click("Load picker"); await advance();
  expect(region().getByText("No group members yet. Create a named profile before choosing viewers.")).toBeTruthy(); expect(region().queryByRole("checkbox")).toBeNull(); expect(screen.queryByRole("button", { name: "Pick for me" })).toBeNull();
  click("Create a profile"); expect(document.activeElement).toBe(document.getElementById("mock-groups"));
});

it("inside /mock: View details opens the library detail, Load groups keeps the pick, a group switch clears and announces, add-title focuses Add", async () => {
  render(<MockEntry selection={selectDemo("mock", "ready")} />);
  const fill = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
  click("Sign in"); fill("Username", "Demo.Viewer"); fill("Password", "synthetic password"); click("Sign in to demo"); await advance();
  click("Load groups"); await advance(); click("Select Synthetic Friday friends"); await advance();
  click("Load picker"); await advance(); choose(["Demo.Viewer"], "90"); click("Pick for me"); await advance(); expect(heading()).toBe("Together Tonight");
  fireEvent.click(within(screen.getByRole("region", { name: "Together Tonight" })).getByRole("button", { name: "View details" })); await advance();
  expect(screen.getByRole("heading", { name: "Title details: Together Tonight" })).toBeTruthy(); expect(window.location.pathname).toBe("/mock");
  click("Load groups"); await advance(); expect(heading()).toBe("Together Tonight");
  click("Select Synthetic weekend pair"); await advance();
  expect(region().getByText("Picker context changed; previous picks and selections were cleared.")).toBeTruthy(); expect(heading()).toBeNull(); expect(region().queryByRole("checkbox")).toBeNull();
  click("Load picker"); await advance(); expect(region().getAllByRole("checkbox").map(c => c.parentElement?.textContent)).toEqual(["DDemo.Viewer", "Rewatches OK"]); expect(checkbox("Rewatches OK").checked).toBe(false);
  fill("New group name", "Picker empty group"); click("Create account group"); await advance(); click("Continue to groups"); await advance();
  click("Load picker"); await advance(); choose(["Demo.Viewer"], "30"); click("Pick for me"); await advance();
  expect(region().getByText("There are no active saved titles to pick from.")).toBeTruthy(); click("Add a title"); expect(document.activeElement).toBe(document.getElementById("mock-entry"));
});
