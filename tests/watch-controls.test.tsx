import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WatchControls } from "../app/watchlist/watch-controls";
import { DetailView } from "../app/watchlist/[id]/detail-view";
import { projectWatchProgress, type WatchState } from "../lib/watch-progress-state";
import type { TitleDetails } from "../lib/title-details";
afterEach(cleanup);
const initial = projectWatchProgress("anna", 5400, null);
const detail: TitleDetails = { id: "title", title: "Movie", contentType: "movie", durationSeconds: 5400, numberingStyle: "none", archived: false, canEdit: false, activeMemberId: "anna", coverUrl: null, sourceUrl: null, watchUrl: null, providerNamespace: null, providerId: null, genres: [], moods: [], contributors: [], history: [{ id: "anna", name: "Anna", color: "#1d4ed8", positionState: null, nextSeason: null, nextEpisode: null, timestampSeconds: null, completed: null, rating: null, note: null }] };
it("shows honest absence and manual format guidance without writing or substituting zero", () => {
  const action = vi.fn(async (): Promise<WatchState> => ({ kind: "idle" })); render(<WatchControls initial={initial} name="Anna" action={action} />);
  expect((screen.getByLabelText("Stopped at") as HTMLInputElement).value).toBe(""); expect(screen.getByText(/Saved timestamp: Not recorded/)).toBeTruthy(); expect(screen.getByText(/M:SS or H:MM:SS/)).toBeTruthy(); expect(screen.getByText(/watching externally does not update/)).toBeTruthy(); expect(action).not.toHaveBeenCalled();
});
it("associates validation and preserves entered text through validation and storage retry", async () => {
  let calls = 0; render(<WatchControls initial={initial} name="Anna" action={async () => ++calls === 1 ? { kind: "invalid", error: "Use whole seconds.", message: "Check Stopped at." } : { kind: "error", message: "Please try again." }} />);
  fireEvent.change(screen.getByLabelText("Stopped at"), { target: { value: "1e2:00" } }); fireEvent.click(screen.getByText("Save timestamp")); await screen.findByText("Use whole seconds.");
  expect(screen.getByLabelText("Stopped at").getAttribute("aria-invalid")).toBe("true"); expect(screen.getByLabelText("Stopped at").getAttribute("aria-describedby")).toContain("watch-timestamp-error");
  fireEvent.click(screen.getByText("Save timestamp")); await screen.findByText("Please try again."); expect((screen.getByLabelText("Stopped at") as HTMLInputElement).value).toBe("1e2:00");
});
it("pending blocks duplicate operations and completion success restores the actual saved timestamp", async () => {
  let release!: (state: WatchState) => void; const saved = { ...initial, recorded: true, timestampSeconds: 4200 };
  render(<WatchControls initial={saved} name="Anna" action={() => new Promise(done => { release = done; })} />);
  fireEvent.change(screen.getByLabelText("Stopped at"), { target: { value: "invalid unsaved text" } }); fireEvent.click(screen.getByText("Mark complete")); await screen.findByText("Saving watch progress…"); expect(screen.getByText("Clear timestamp").matches(":disabled")).toBe(true);
  await act(async () => release({ kind: "saved", progress: { ...saved, completed: true }, message: "Marked complete." }));
  expect((screen.getByLabelText("Stopped at") as HTMLInputElement).value).toBe("1:10:00"); expect(screen.getByText("Undo completion")).toBeTruthy();
});
it("preserves oversized history with warning, and unavailable runtime allows only safe clear/completion", () => {
  const action = async (): Promise<WatchState> => ({ kind: "idle" }); const view = render(<WatchControls initial={projectWatchProgress("anna", 3600, { timestampSeconds: 4200, completed: true })} name="Anna" action={action} />);
  expect(screen.getByText(/beyond the current full duration/)).toBeTruthy(); expect((screen.getByLabelText("Stopped at") as HTMLInputElement).value).toBe("1:10:00");
  view.rerender(<WatchControls initial={projectWatchProgress("anna", null, { timestampSeconds: 4200, completed: true })} name="Anna" action={action} />);
  expect(screen.getByText(/a new timestamp cannot be validated/)).toBeTruthy(); expect((screen.getByLabelText("Stopped at") as HTMLInputElement).readOnly).toBe(true); expect(screen.getByText("Save timestamp").matches(":disabled")).toBe(true); expect(screen.getByText("Clear timestamp").matches(":disabled")).toBe(false); expect(screen.getByText("Undo completion").matches(":disabled")).toBe(false);
});
it("profile navigation/read-only history and type/archive boundaries stay real", () => {
  const action = async (): Promise<WatchState> => ({ kind: "idle" }); const view = render(<DetailView detail={{ ...detail, activeMemberId: null }} watchAction={action} episodeAction={async () => ({ kind: "idle" })} />);
  expect(screen.getByRole("link", { name: "Choose profile" }).getAttribute("href")).toBe("/group"); expect(screen.getByText("From the group")).toBeTruthy();
  view.rerender(<DetailView detail={{ ...detail, archived: true }} watchAction={action} />); expect(screen.queryByText("Save timestamp")).toBeNull();
  for (const contentType of ["series", "anime"]) { view.rerender(<DetailView detail={{ ...detail, contentType, numberingStyle: "continuous" }} watchAction={action} episodeAction={async () => ({ kind: "idle" })} />); expect(screen.queryByText("Your watch progress")).toBeNull(); expect(screen.getByText("Your episode progress")).toBeTruthy(); }
  view.rerender(<DetailView detail={{ ...detail, title: null, contentType: null, durationSeconds: null }} watchAction={action} />); expect(screen.getByText("Clear timestamp")).toBeTruthy();
});
