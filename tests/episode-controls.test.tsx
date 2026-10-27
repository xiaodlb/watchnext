import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EpisodeControls } from "../app/watchlist/episode-controls";
import { DetailView } from "../app/watchlist/[id]/detail-view";
import type { TitleDetails } from "../lib/title-details";
import type { EpisodeProgress, EpisodeState } from "../lib/episode-progress-state";
afterEach(cleanup);
const initial: EpisodeProgress = { memberId: "anna", numberingStyle: "season_episode", recorded: false, positionState: "unknown", nextSeason: null, nextEpisode: null, completed: false };
const detail: TitleDetails = { id: "title", title: "Series", contentType: "series", durationSeconds: 1440, numberingStyle: "season_episode", archived: false, canEdit: false, activeMemberId: "anna", coverUrl: null, sourceUrl: null, watchUrl: null, providerNamespace: null, providerId: null, genres: [], moods: [], contributors: [], history: [{ id: "anna", name: "Anna", color: "#1d4ed8", positionState: null, nextSeason: null, nextEpisode: null, timestampSeconds: null, completed: null, rating: null, note: null }] };
it("starts absent progress as Unknown without inferred coordinate inputs or an automatic action", () => {
  const action = vi.fn(async (): Promise<EpisodeState> => ({ kind: "idle" })); render(<EpisodeControls initial={initial} name="Anna" unavailable={false} action={action} />);
  expect(screen.getByText(/Unknown \/ Not recorded/)).toBeTruthy(); expect(screen.queryByLabelText("Next episode to watch")).toBeNull(); expect(action).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Episode position"), { target: { value: "in_progress" } });
  expect((screen.getByLabelText("Next season to watch") as HTMLInputElement).value).toBe(""); expect((screen.getByLabelText("Next episode to watch") as HTMLInputElement).value).toBe("");
});
it("associates field errors and retains entered coordinates on validation and storage retry", async () => {
  let calls = 0;
  render(<EpisodeControls initial={initial} name="Anna" unavailable={false} action={async () => ++calls === 1 ? { kind: "invalid", errors: { nextEpisode: "Use whole numbers." }, message: "Check your position." } : { kind: "error", message: "Please try again." }} />);
  fireEvent.change(screen.getByLabelText("Episode position"), { target: { value: "in_progress" } }); fireEvent.change(screen.getByLabelText("Next season to watch"), { target: { value: "2" } }); fireEvent.change(screen.getByLabelText("Next episode to watch"), { target: { value: "1e2" } });
  fireEvent.click(screen.getByText("Save episode progress")); await screen.findByText("Use whole numbers.");
  expect(screen.getByLabelText("Next episode to watch").getAttribute("aria-invalid")).toBe("true"); expect(screen.getByLabelText("Next episode to watch").getAttribute("aria-describedby")).toContain("next-episode-error");
  fireEvent.click(screen.getByText("Save episode progress")); await screen.findByText("Please try again."); expect((screen.getByLabelText("Next episode to watch") as HTMLInputElement).value).toBe("1e2");
});
it("announces pending and disables duplicate operations, then shows completion/undo from the stored result", async () => {
  let release!: (state: EpisodeState) => void;
  render(<EpisodeControls initial={{ ...initial, numberingStyle: "continuous" }} name="Anna" unavailable action={() => new Promise(done => { release = done; })} />);
  fireEvent.click(screen.getByText("Mark complete")); await screen.findByText("Saving episode progress…");
  expect(screen.getByText("Save episode progress").matches(":disabled")).toBe(true); expect(screen.queryByLabelText("Next season to watch")).toBeNull();
  await act(async () => release({ kind: "saved", progress: { ...initial, numberingStyle: "continuous", recorded: true, completed: true }, message: "Marked complete." }));
  expect(screen.getByText("Undo completion")).toBeTruthy(); expect(screen.getByText(/metadata is unavailable/)).toBeTruthy();
});
it("no selected profile gets real navigation; archived and movie/video details expose no episodic mutations", () => {
  const action = async (): Promise<EpisodeState> => ({ kind: "idle" });
  const view = render(<DetailView detail={{ ...detail, activeMemberId: null }} episodeAction={action} />);
  expect(screen.getByRole("link", { name: "Choose profile" }).getAttribute("href")).toBe("/group"); expect(screen.getByText("From the group")).toBeTruthy(); expect(screen.queryByText("Save episode progress")).toBeNull();
  view.rerender(<DetailView detail={{ ...detail, archived: true }} episodeAction={action} />); expect(screen.queryByText("Save episode progress")).toBeNull();
  for (const contentType of ["movie", "youtube"]) { view.rerender(<DetailView detail={{ ...detail, contentType, numberingStyle: "none" }} episodeAction={action} />); expect(screen.queryByText("Your episode progress")).toBeNull(); }
  view.rerender(<DetailView detail={{ ...detail, title: null, contentType: null, durationSeconds: null }} episodeAction={action} />); expect(screen.getByText("Save episode progress")).toBeTruthy();
});
