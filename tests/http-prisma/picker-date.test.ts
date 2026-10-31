// @vitest-environment node
import { expect, it } from "vitest";
import { rankCandidates } from "../../lib/picker/ranking";
import { rankingCreatedAt } from "../../lib/http-prisma/ranking-date";

it.each([
  new Date("2026-10-30T08:30:00.000Z"),
  "2026-10-30 08:30:00.000+00",
  "2026-10-30T08:30:00Z",
])("normalizes Prisma DateTime values before exact-match ranking: %s", value => {
  const createdAt = rankingCreatedAt(value);
  const result = rankCandidates({
    groupId: "group-1",
    members: [{ id: "member-1", groupId: "group-1" }],
    titles: [{
      id: "title-1", groupId: "group-1", archived: false, title: "Eligible saved title",
      contentType: "movie", durationSeconds: 20 * 60, numberingStyle: "none",
      moods: ["funny"], createdAt,
    }],
    progress: [],
    selectedViewerIds: ["member-1"],
    availableMinutes: 25,
    mood: "funny",
    rewatches: false,
  });

  expect(result).toMatchObject({ kind: "ranked", tier: "exact", candidates: [{ titleId: "title-1" }] });
});

it.each(["not-a-date", "2026-02-30 08:30:00.000+00", null])("rejects invalid Prisma timestamps: %s", value => {
  expect(rankingCreatedAt(value)).toBe("");
});
