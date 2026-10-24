import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MockEntryForm } from "../../app/mock/entry";
import { createHttpService } from "../../frontend/service/http-service";

const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const wait = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

it("M01–M04: HTTP UI applies a provider review and explicitly saves it through the typed adapter", async () => {
  const requests: Array<{ path: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = vi.fn(async (path: string, init: RequestInit) => {
    requests.push({ path, body: JSON.parse(String(init.body)) });
    if (path === "/v1/metadata/search") return reply({ handle: "review-1", source: "youtube", providerId: "AbCdEf12345", draft: { title: "HTTP YouTube", contentType: "youtube", duration: { seconds: 120, meaning: "exact" }, numberingStyle: "none", genres: ["Comedy"], watchUrl: "https://youtube.example/watch", sourceUrl: "https://youtube.example/source", coverUrl: null }, expiresAt: Date.now() + 60000, notice: "Review imported fields.", context: { revision: 4 } });
    if (path === "/v1/metadata/reviews/review-1/save") return reply({ status: "created", title: { id: "title-1", groupId: "group-1", revision: 1, archived: false, title: "HTTP YouTube", contentType: "youtube", duration: { seconds: 120, meaning: "exact" }, numberingStyle: "none", genres: ["Comedy"], moods: ["funny"], watchUrl: null, sourceUrl: null, coverUrl: null, contributors: [], history: [], personal: null, canEdit: true, canRemove: true, canRefresh: true, canRestore: false }, context: { revision: 4 } });
    throw new Error(`unexpected ${path}`);
  }) as typeof fetch;
  const service = createHttpService(), identity = { current: service.context.initialIdentity };
  render(<MockEntryForm service={service} identity={identity} scenario="ready" real changed={() => {}} />);
  const panel = within(screen.getByRole("region", { name: "Add to your shared library" }));
  fireEvent.change(screen.getByLabelText("Lookup query"), { target: { value: "WatchNext" } });
  fireEvent.click(panel.getByRole("button", { name: "Search metadata" }));
  await wait();
  expect((screen.getByLabelText("Entry title") as HTMLInputElement).value).toBe("HTTP YouTube");
  expect(panel.queryByRole("button", { name: "Replace details" })).toBeNull();
  fireEvent.click(panel.getByRole("checkbox", { name: "funny" }));
  fireEvent.click(panel.getByRole("button", { name: "Save entry" }));
  await wait();
  expect(requests.map(request => request.path)).toEqual(["/v1/metadata/search", "/v1/metadata/reviews/review-1/save"]);
  expect(requests[1].body).toMatchObject({ title: "HTTP YouTube", durationSeconds: 120, moods: ["funny"], expectedContextRevision: 4 });
  expect(panel.getByText(/Saved entry: HTTP YouTube/)).toBeTruthy();
});


it("maps provider candidates to visible IDs and keeps the selected review for adoption", async () => {
  globalThis.fetch = vi.fn().mockResolvedValue(reply({ handle: "page-1", source: "kinopoisk", query: "Comedy", page: 1, visits: 1, previous: false, next: false, candidates: [{ identity: { externalId: "424242" }, title: "HTTP Kino", year: 2024, contentType: "movie", duration: { seconds: 5700 }, coverUrl: "https://example.test/poster.jpg" }], context: { revision: 5 } })) as typeof fetch;
  const service = createHttpService();
  const result = await service.entry.search("kinopoisk", "title", "Comedy", service.context.initialIdentity);
  expect(result).toMatchObject({ kind: "success", value: { handle: "page-1", candidates: [{ id: "424242", title: "HTTP Kino", durationSeconds: 5700 }] } });
});
