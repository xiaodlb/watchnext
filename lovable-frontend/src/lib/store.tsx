import { createContext, useContext, useState, type ReactNode } from "react";

export type Kind = "Movie" | "Series" | "Anime" | "YouTube";
export type Mood = "Funny" | "Relaxing" | "Exciting" | "Dark" | "Emotional";
export const MOODS: Mood[] = ["Funny", "Relaxing", "Exciting", "Dark", "Emotional"];
export const KINDS: Kind[] = ["Movie", "Series", "Anime", "YouTube"];

export type Member = { id: string; name: string; color: string };
export type Title = {
  id: string;
  title: string;
  kind: Kind;
  year?: string;
  channel?: string;
  minutes: number;
  moods: Mood[];
  genres: string[];
  addedBy: string[];
  hue: number;
  progress: string;
  done: boolean;
  rating?: number | undefined;
  note: string;
  otherNotes: { by: string; rating?: number | undefined; note: string }[];
};

export const MEMBERS: Member[] = [
  { id: "me", name: "Aliya", color: "bg-avatar-blue" },
  { id: "timur", name: "Timur", color: "bg-avatar-teal" },
  { id: "dana", name: "Dana", color: "bg-avatar-rose" },
];

const SEED: Title[] = [
  { id: "1", title: "Past Lives", kind: "Movie", year: "2023", minutes: 106, moods: ["Emotional", "Relaxing"], genres: ["Drama", "Romance"], addedBy: ["me", "dana"], hue: 30, progress: "", done: false, note: "", otherNotes: [{ by: "dana", note: "Save for a quiet Sunday.", rating: undefined }] },
  { id: "2", title: "Severance", kind: "Series", year: "2022", minutes: 50, moods: ["Dark", "Exciting"], genres: ["Thriller", "Sci-fi"], addedBy: ["timur"], hue: 200, progress: "S1 · E4", done: false, rating: 9, note: "Don't spoil the finale for Dana!", otherNotes: [{ by: "timur", rating: 10, note: "Best show in years." }] },
  { id: "3", title: "Frieren: Beyond Journey's End", kind: "Anime", year: "2023", minutes: 24, moods: ["Relaxing", "Emotional"], genres: ["Fantasy", "Adventure"], addedBy: ["me"], hue: 150, progress: "E12", done: false, rating: 10, note: "Episode 10 made me cry.", otherNotes: [] },
  { id: "4", title: "How I Built a Tiny House in 30 Days", kind: "YouTube", channel: "Kirsten Dirksen", minutes: 18, moods: ["Relaxing"], genres: ["DIY"], addedBy: ["dana"], hue: 90, progress: "", done: false, note: "", otherNotes: [] },
  { id: "5", title: "The Grand Budapest Hotel", kind: "Movie", year: "2014", minutes: 99, moods: ["Funny", "Exciting"], genres: ["Comedy"], addedBy: ["timur", "me"], hue: 340, progress: "0:42:10", done: false, note: "", otherNotes: [] },
  { id: "6", title: "Abbott Elementary", kind: "Series", year: "2021", minutes: 22, moods: ["Funny"], genres: ["Comedy", "Mockumentary"], addedBy: ["dana"], hue: 50, progress: "S2 · E1", done: false, note: "", otherNotes: [{ by: "dana", rating: 8, note: "" }] },
  { id: "7", title: "Dune: Part Two", kind: "Movie", year: "2024", minutes: 166, moods: ["Exciting", "Dark"], genres: ["Sci-fi", "Epic"], addedBy: ["me"], hue: 60, progress: "", done: true, rating: 9, note: "Rewatch in IMAX if it comes back.", otherNotes: [] },
  { id: "8", title: "Why Japan's Trains Are Never Late", kind: "YouTube", channel: "Wendover Productions", minutes: 14, moods: ["Relaxing", "Exciting"], genres: ["Documentary"], addedBy: ["timur"], hue: 0, progress: "", done: false, note: "", otherNotes: [] },
  { id: "9", title: "Spy × Family", kind: "Anime", year: "2022", minutes: 24, moods: ["Funny", "Exciting"], genres: ["Action", "Comedy"], addedBy: ["dana", "timur"], hue: 280, progress: "Not started", done: false, note: "", otherNotes: [] },
];

export const CATALOG: Omit<Title, "id" | "addedBy" | "progress" | "done" | "note" | "otherNotes">[] = [
  { title: "Interstellar", kind: "Movie", year: "2014", minutes: 169, moods: ["Emotional", "Exciting"], genres: ["Sci-fi"], hue: 220 },
  { title: "Inside Out 2", kind: "Movie", year: "2024", minutes: 96, moods: ["Funny", "Emotional"], genres: ["Animation"], hue: 320 },
  { title: "The Bear", kind: "Series", year: "2022", minutes: 30, moods: ["Exciting", "Emotional"], genres: ["Drama"], hue: 20 },
  { title: "Shōgun", kind: "Series", year: "2024", minutes: 58, moods: ["Dark", "Exciting"], genres: ["Historical"], hue: 10 },
  { title: "Your Name", kind: "Anime", year: "2016", minutes: 106, moods: ["Emotional"], genres: ["Romance", "Fantasy"], hue: 250 },
  { title: "Delicious in Dungeon", kind: "Anime", year: "2024", minutes: 24, moods: ["Funny", "Relaxing"], genres: ["Fantasy"], hue: 110 },
  { title: "I Spent 100 Days in the Wilderness", kind: "YouTube", channel: "Outdoor Boys", minutes: 32, moods: ["Exciting"], genres: ["Adventure"], hue: 130 },
  { title: "The Insane Engineering of the Panama Canal", kind: "YouTube", channel: "Real Engineering", minutes: 21, moods: ["Relaxing"], genres: ["Documentary"], hue: 190 },
  { title: "Paddington 2", kind: "Movie", year: "2017", minutes: 103, moods: ["Funny", "Relaxing"], genres: ["Family"], hue: 40 },
];

type Ctx = {
  user: string | null;
  signIn: (name: string) => void;
  signOut: () => void;
  titles: Title[];
  update: (id: string, patch: Partial<Title>) => void;
  add: (t: Omit<Title, "id" | "addedBy" | "progress" | "done" | "note" | "otherNotes">) => string;
};
const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<string | null>(null);
  const [titles, setTitles] = useState<Title[]>(SEED);
  const update = (id: string, patch: Partial<Title>) =>
    setTitles((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const add: Ctx["add"] = (t) => {
    const existing = titles.find((x) => x.kind === t.kind && x.title.toLowerCase() === t.title.toLowerCase());
    if (existing) {
      if (!existing.addedBy.includes("me")) update(existing.id, { addedBy: [...existing.addedBy, "me"] });
      return existing.id;
    }
    const id = String(Date.now());
    setTitles((ts) => [{ ...t, id, addedBy: ["me"], progress: "", done: false, note: "", otherNotes: [] }, ...ts]);
    return id;
  };
  return (
    <StoreCtx.Provider value={{ user, signIn: setUser, signOut: () => setUser(null), titles, update, add }}>
      {children}
    </StoreCtx.Provider>
  );
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}

export const member = (id: string) => MEMBERS.find((m) => m.id === id) ?? MEMBERS[0];
export const fmtMin = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ""}`.trim() : `${m}m`);

export function pickFor(titles: Title[], minutes: number, mood: Mood) {
  const pool = titles.filter((t) => !t.done);
  const exact = pool.filter((t) => t.moods.includes(mood) && t.minutes <= minutes).sort((a, b) => b.minutes - a.minutes);
  if (exact.length) return { tier: "exact" as const, list: exact };
  const over = pool.filter((t) => t.moods.includes(mood) && t.minutes <= minutes + 5).sort((a, b) => a.minutes - b.minutes);
  if (over.length) return { tier: "over" as const, list: over };
  const other = pool.filter((t) => t.minutes <= minutes).sort((a, b) => b.minutes - a.minutes);
  return { tier: other.length ? ("mood" as const) : ("none" as const), list: other };
}
