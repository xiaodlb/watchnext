import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { MockEntry } from "../../app/mock/preview";
import { selectDemo } from "../../frontend/service/contracts";
beforeEach(() => { vi.useFakeTimers(); window.history.replaceState(null, "", "/mock"); }); afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const advance = async (ms = 80) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));
const fill = (name: string, value: string) => fireEvent.change(screen.getByLabelText(name, { exact: true }), { target: { value } });
const input = (name: string) => screen.getByLabelText(name, { exact: true }) as HTMLInputElement;
const personal = () => within(screen.getByRole("region", { name: "Personal progress and feedback" }));
const history = () => within(screen.getByRole("list", { name: "Group-visible personal history" }));
const scenario = (value: string) => fireEvent.change(screen.getByLabelText("Simulated response"), { target: { value } });
async function setup(user = "Demo.Owner", group = "Synthetic Friday friends") { render(<MockEntry selection={selectDemo("mock", "ready")} />); click("Sign in"); fill("Username", user); fill("Password", "synthetic password"); click("Sign in to demo"); await advance(); click("Load groups"); await advance(); click(`Select ${group}`); await advance(); click("Load library"); await advance(); }
async function open(name: string) { click(`Details: ${name}`); await advance(); }

it("P02/P03 watch panel: field errors keep drafts and focus, exact readback, completion ignores unsaved input, group history attribution", async () => {
  await setup(); expect(screen.queryByText("Personal progress, ratings and notes")).toBeNull(); await open("Together Tonight");
  for (const heading of ["Your watch progress", "Your rating", "Your note", "Group-visible personal history"]) expect(personal().getByRole("heading", { name: heading })).toBeTruthy();
  expect(personal().getByText("Saved timestamp: 5:00. Completion: Not finished.")).toBeTruthy(); expect(history().getAllByRole("listitem")).toHaveLength(2);
  expect(history().getByText("Demo.Owner").parentElement?.textContent).toContain("(You)"); expect(history().getAllByText("Manual timestamp: 5:00")).toHaveLength(2); expect(history().getByText("Record ID: history-friday-owner")).toBeTruthy();
  fill("Stopped at", "1:60"); click("Save timestamp"); await advance();
  expect(input("Stopped at").value).toBe("1:60"); expect(input("Stopped at").getAttribute("aria-invalid")).toBe("true"); expect(document.activeElement).toBe(input("Stopped at"));
  expect(personal().getByText(/two-digit seconds/).id).toBe("personal-timestamp-error"); expect(input("Stopped at").getAttribute("aria-describedby")).toContain("personal-timestamp-error"); expect(personal().getByRole("alert").textContent).toContain("Nothing was changed");
  fill("Stopped at", "70:00"); click("Save timestamp"); await advance(); expect(personal().getByText("Saved timestamp: 1:10:00. Completion: Not finished.")).toBeTruthy(); expect(input("Stopped at").value).toBe("1:10:00"); expect(personal().getByText("Timestamp saved. Completion is unchanged.")).toBeTruthy();
  fill("Stopped at", "0:30"); click("Mark complete"); await advance(); expect(personal().getByText("Saved timestamp: 1:10:00. Completion: Finished.")).toBeTruthy(); expect(input("Stopped at").value).toBe("1:10:00"); expect(personal().getByText("Marked complete. Your stored timestamp is unchanged.")).toBeTruthy();
  click("Undo completion"); await advance(); expect(personal().getByText("Completion undone. Your stored timestamp is unchanged.")).toBeTruthy();
  click("Clear timestamp"); await advance(); expect(personal().getByText("Saved timestamp: Not recorded. Completion: Not finished.")).toBeTruthy(); expect(input("Stopped at").value).toBe("");
  fill("Stopped at", "0:00"); click("Save timestamp"); await advance(); expect(personal().getByText("Saved timestamp: 0:00. Completion: Not finished.")).toBeTruthy(); expect(history().getByText("Manual timestamp: 0:00")).toBeTruthy();
});

it("P04/P05 rating and note: exact errors, explicit clears ignore drafts, counts, inert multi-line notes and over-limit retention", async () => {
  await setup(); await open("Together Tonight");
  fill("Rating (1–10)", "8.0"); click("Save rating"); await advance(); expect(input("Rating (1–10)").value).toBe("8.0"); expect(document.activeElement).toBe(input("Rating (1–10)")); expect(personal().getByText(/whole-number rating from 1 to 10/)).toBeTruthy();
  fill("Rating (1–10)", " 9 "); click("Save rating"); await advance(); expect(personal().getByText("Your saved rating: 9/10.")).toBeTruthy(); expect(input("Rating (1–10)").value).toBe("9"); expect(history().getByText("Rating: 9/10")).toBeTruthy();
  fill("Rating (1–10)", "5"); click("Clear my rating"); await advance(); expect(personal().getByText("Your saved rating: Not rated.")).toBeTruthy(); expect(input("Rating (1–10)").value).toBe(""); expect(personal().getByText("Your rating is cleared. Not rated.")).toBeTruthy(); expect(history().getByText("Rating: Not rated")).toBeTruthy();
  const note = screen.getByLabelText("Your note text") as HTMLTextAreaElement; expect(note.getAttribute("maxlength")).toBeNull();
  fill("Your note text", "  Line one\r\nLine <script>two</script> https://example.test  "); expect(personal().getByText("55 / 2000 Unicode code points after normalization and trimming.")).toBeTruthy();
  click("Save note"); await advance(); expect(personal().getByText("Your whole-title note is saved.")).toBeTruthy(); const saved = history().getByText(/Line one/); expect(saved.textContent).toBe("Line one\nLine <script>two</script> https://example.test"); expect(saved.className).toContain("note"); expect(document.querySelector("script")).toBeNull(); expect(within(saved).queryByRole("link")).toBeNull();
  const over = "😀".repeat(2001); fill("Your note text", over); expect(personal().getByText("2001 / 2000 Unicode code points after normalization and trimming.")).toBeTruthy(); click("Save note"); await advance(); expect(note.value).toBe(over); expect(personal().getByText(/has not been shortened/)).toBeTruthy(); expect(history().getByText(/Line one/)).toBeTruthy();
  click("Clear my note"); await advance(); expect(note.value).toBe(""); expect(personal().getByText("Your note is cleared. No notes.")).toBeTruthy(); expect(history().getAllByText("No notes")).toHaveLength(1);
  fill("Your note text", " \n "); click("Save note"); await advance(); expect(personal().getByText("Your note is cleared. No notes.")).toBeTruthy();
});

it("P01 episode panel: Unknown / Not recorded, field errors, readback and non-contributor own writes; continuous hides season", async () => {
  await setup(); await open("Short Laughs"); expect(personal().getByText("Saved position: Unknown / Not recorded. Completion: Not finished.")).toBeTruthy(); expect(history().getByText("Next episode: Not recorded")).toBeTruthy(); expect(history().getByText("Next: Season 1, episode 2")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Episode position"), { target: { value: "in_progress" } }); fill("Next season to watch", ""); fill("Next episode to watch", "0"); click("Save episode progress"); await advance();
  expect(input("Next season to watch").getAttribute("aria-invalid")).toBe("true"); expect(input("Next episode to watch").getAttribute("aria-invalid")).toBe("true"); expect(document.activeElement).toBe(input("Next season to watch")); expect(input("Next episode to watch").value).toBe("0");
  fill("Next season to watch", "2"); fill("Next episode to watch", "0007"); click("Save episode progress"); await advance(); expect(personal().getByText("Saved position: Next: Season 2, episode 7. Completion: Not finished.")).toBeTruthy(); expect(input("Next episode to watch").value).toBe("7");
  click("Mark complete"); await advance(); expect(personal().getByText("Saved position: Next: Season 2, episode 7. Completion: Finished.")).toBeTruthy(); fireEvent.change(screen.getByLabelText("Episode position"), { target: { value: "not_started" } }); click("Save episode progress"); await advance(); expect(personal().getByText("Saved position: Not started — Season 1, episode 1. Completion: Finished.")).toBeTruthy();
  expect(history().getByText("Record ID: personal-saved-series-friday-owner")).toBeTruthy(); click("Back to titles"); await advance(); expect(screen.getByText(/unsaved personal drafts were discarded/)).toBeTruthy(); click("My contributions"); await advance(); expect(screen.queryByRole("button", { name: "Details: Short Laughs" })).toBeNull();
  click("All saved titles"); await advance(); await open("Paper Stars"); expect(personal().getByText("Saved position: Not started — episode 1. Completion: Not finished.")).toBeTruthy(); fireEvent.change(screen.getByLabelText("Episode position"), { target: { value: "in_progress" } }); expect(screen.queryByLabelText("Next season to watch")).toBeNull();
});

it("unavailable runtime, archived and legacy profile-free states are honest; leaving a title or context discards drafts", async () => {
  await setup(); await open("My retained title correction");
  expect(input("Stopped at").readOnly).toBe(true); expect((screen.getByRole("button", { name: "Save timestamp" }) as HTMLButtonElement).disabled).toBe(true); expect(personal().getByText(/Full duration is unavailable/)).toBeTruthy(); expect(input("Stopped at").getAttribute("aria-describedby")).toContain("personal-runtime-notice");
  click("Mark complete"); await advance(); expect(personal().getByText("Saved timestamp: Not recorded. Completion: Finished.")).toBeTruthy(); fill("Rating (1–10)", "4"); click("Save rating"); await advance(); expect(personal().getByText("Your saved rating: 4/10.")).toBeTruthy();
  fill("Your note text", "Unsaved draft"); click("Back to titles"); await advance(); await open("My retained title correction"); expect((screen.getByLabelText("Your note text") as HTMLTextAreaElement).value).toBe("");
  click("Back to titles"); await advance(); click("Open archive"); await advance(); await open("Saved for Another Day"); expect(personal().getByText(/Archived title: personal history stays readable/)).toBeTruthy(); expect(personal().queryByRole("button", { name: "Save rating" })).toBeNull(); expect(history().getByText("Record ID: history-archived-movie-friday-owner")).toBeTruthy();
  click("All saved titles"); await advance(); await open("Together Tonight"); fill("Your note text", "Draft for old identity"); click("Select Synthetic Friday friends"); await advance(); expect(screen.queryByDisplayValue("Draft for old identity")).toBeNull(); expect(screen.getByText(/Previous private details and unsaved drafts were cleared/)).toBeTruthy();
  click("Separate legacy mode"); await advance(); fill("Synthetic invite", "SYNTHETIC-LEGACY-INITIAL"); click("Resolve synthetic invite"); await advance(); click("Load library"); await advance(); await open("Legacy sample film");
  expect(personal().getByText(/Choose profile: legacy browsing shows every member's history/)).toBeTruthy(); expect(personal().queryByRole("button", { name: "Save rating" })).toBeNull(); expect(screen.queryByLabelText("Stopped at")).toBeNull(); expect(history().getByText("Legacy sample")).toBeTruthy(); expect(history().getByText("Manual timestamp: 5:00")).toBeTruthy();
  click("Use profile Legacy sample"); await advance(); click("Load library"); await advance(); await open("Legacy sample film"); fill("Rating (1–10)", "3"); click("Save rating"); await advance(); expect(history().getByText("Rating: 3/10")).toBeTruthy(); expect(history().getByText("Record ID: history-legacy-sample-profile")).toBeTruthy();
});

it("U06 pending disables operations without trapping focus, Cancel and unavailable keep drafts and write nothing, retry succeeds", async () => {
  await setup(); await open("Together Tonight"); scenario("slow"); fill("Rating (1–10)", "6"); click("Save rating");
  expect((screen.getByRole("button", { name: "Save rating" }) as HTMLButtonElement).disabled).toBe(true); expect((screen.getByRole("button", { name: "Clear my note" }) as HTMLButtonElement).disabled).toBe(true); const cancel = screen.getByRole("button", { name: "Cancel personal request" }); expect(document.activeElement).toBe(cancel); expect((screen.getByRole("button", { name: "Back to titles" }) as HTMLButtonElement).disabled).toBe(false);
  expect(personal().getByText("Saving your rating…")).toBeTruthy(); click("Cancel personal request"); await advance(1200); expect(personal().getByText(/Personal request canceled/)).toBeTruthy(); expect(input("Rating (1–10)").value).toBe("6"); expect(personal().getByText("Your saved rating: 8/10.")).toBeTruthy();
  scenario("unavailable"); click("Save rating"); await advance(300); expect(personal().getByRole("alert").textContent).toContain("Your entered draft is kept"); expect(input("Rating (1–10)").value).toBe("6"); expect(history().getAllByText("Rating: 8/10")).toHaveLength(2);
  scenario("slow"); fill("Your note text", "Pending note"); click("Save note"); scenario("ready"); await advance(1200); expect(personal().getByText(/Personal request canceled/)).toBeTruthy(); expect((screen.getByLabelText("Your note text") as HTMLTextAreaElement).value).toBe("Pending note");
  click("Save rating"); await advance(); expect(personal().getByText("Your saved rating: 6/10.")).toBeTruthy(); expect(history().getAllByText(/Rating: [68]\/10/).map(n => n.textContent)).toEqual(["Rating: 6/10", "Rating: 8/10"]);
});
