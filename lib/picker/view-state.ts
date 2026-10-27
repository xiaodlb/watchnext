import type { Profile } from "../profile-state";
import type { CandidateTier } from "./ranking";
import type { EpisodeTarget } from "./types";
export type PickerPageView = { groupId: string; groupName: string; members: Profile[]; hasActiveProfile: boolean };
export type PickerField = "viewers" | "availableMinutes" | "mood" | "rewatches" | "form";
export type PickView = {
  id: string; title: string; contentType: string; durationSeconds: number; tier: CandidateTier; message: string;
  target: { readonly kind: "item" } | EpisodeTarget; rewatchers: Profile[]; viewers: Profile[];
  availableMinutes: string; requestedMood: string; rewatches: boolean; watchUrl: string | null; coverUrl?: string | null;
};
export type PickState = { kind: "idle" } | ({ requestId: string; groupId: string } & (
  { kind: "invalid"; errors: Partial<Record<PickerField, string>> } |
  { kind: "error"; message: string } | { kind: "picked"; pick: PickView; cursor?: string; refreshed?: boolean; pageId?: string; intentId?: string } |
  { kind: "exhausted"; cursor: string; pageId: string; intentId: string; refreshed: boolean } |
  { kind: "conflict"; message: string } |
  { kind: "no_match"; message: string; reasons: string[]; links: { href: string; label: string }[]; refreshed?: boolean }
));
export type PickAction = (form: FormData) => Promise<PickState>;
