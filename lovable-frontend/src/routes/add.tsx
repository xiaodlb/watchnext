import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Search } from "lucide-react";
import { AppShell, Btn, Chip, kindIcon } from "@/components/ui-kit";
import { KINDS, MOODS, useStore, type Kind, type Mood } from "@/lib/store";

type AddSearch = { q?: string | undefined; kind?: Kind | undefined; minutes?: number | undefined; moods?: string | undefined; genres?: string | undefined };

export const Route = createFileRoute("/add")({
  validateSearch: (s: Record<string, unknown>): AddSearch => ({
    q: typeof s["q"] === "string" ? s["q"] : undefined,
    kind: KINDS.includes(s["kind"] as Kind) ? (s["kind"] as Kind) : undefined,
    minutes: typeof s["minutes"] === "number" ? s["minutes"] : undefined,
    moods: typeof s["moods"] === "string" ? s["moods"] : undefined,
    genres: typeof s["genres"] === "string" ? s["genres"] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Add a title · WatchNext" },
      { name: "description", content: "Add a movie, series, anime or YouTube video to your shared list." },
      { property: "og:title", content: "Add a title · WatchNext" },
      { property: "og:description", content: "Search or enter details manually." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <AddTitle />
    </AppShell>
  ),
});

function AddTitle() {
  const s = Route.useSearch();
  const nav = useNavigate();
  const { add } = useStore();
  const [query, setQuery] = useState("");
  const [title, setTitle] = useState(s["q"] ?? "");
  const [kind, setKind] = useState<Kind>(s["kind"] ?? "Movie");
  const [minutes, setMinutes] = useState(s["minutes"] ? String(s["minutes"]) : "");
  const [moods, setMoods] = useState<Mood[]>((s["moods"]?.split(",").filter(Boolean) as Mood[]) ?? []);
  const [genres, setGenres] = useState(s["genres"] ?? "");
  const [err, setErr] = useState("");
  const episodic = kind === "Series" || kind === "Anime";

  const save = (e: FormEvent) => {
    e.preventDefault();
    const m = Number(minutes);
    if (!title.trim()) return setErr("Add a title.");
    if (!Number.isInteger(m) || m < 1) return setErr("Add a runtime in whole minutes.");
    if (!moods.length) return setErr("Pick at least one mood.");
    const id = add({ title: title.trim(), kind, minutes: m, moods, genres: genres.split(",").map((g) => g.trim()).filter(Boolean).slice(0, 10), hue: Math.floor(Math.random() * 360) });
    nav({ to: "/title/$id", params: { id } });
  };

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-extrabold tracking-tight">Add a title</h1>
      <p className="mt-1 text-lg text-muted-foreground">Search to autofill details, or type them in yourself.</p>

      <form
        className="surface mt-6 flex flex-col gap-3 p-4 sm:flex-row"
        onSubmit={(e) => { e.preventDefault(); if (query.trim()) nav({ to: "/search", search: { q: query.trim() } }); }}
      >
        <label className="flex-1">
          <span className="sr-only">Search title or paste YouTube link</span>
          <input className="field" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search a title or paste a YouTube link" />
        </label>
        <Btn type="submit"><Search className="h-4 w-4" aria-hidden /> Search</Btn>
      </form>

      <form onSubmit={save} className="surface mt-6 space-y-6 p-6 md:p-8">
        {s["q"] && <p className="rounded-lg bg-secondary p-3 text-sm font-semibold text-secondary-foreground">Details filled from search. Check them, choose moods, then save.</p>}
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Type</legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {KINDS.map((k) => {
              const Icon = kindIcon[k];
              return (
                <button type="button" key={k} aria-pressed={kind === k} onClick={() => setKind(k)} className={`flex min-h-14 items-center justify-center gap-2 rounded-lg border font-semibold ${kind === k ? "border-primary bg-secondary text-secondary-foreground" : "border-input bg-card text-muted-foreground"}`}>
                  <Icon className="h-4 w-4" aria-hidden /> {k === "YouTube" ? "YouTube video" : k}
                </button>
              );
            })}
          </div>
        </fieldset>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold">Title</span>
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">{episodic ? "Typical episode length (min)" : "Runtime (min)"}</span>
            <input className="field" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value.replace(/\D/g, ""))} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold">Genres <span className="font-normal text-muted-foreground">(optional, comma separated)</span></span>
            <input className="field" value={genres} onChange={(e) => setGenres(e.target.value)} />
          </label>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Moods <span className="font-normal text-muted-foreground">(at least one)</span></legend>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <Chip key={m} active={moods.includes(m)} onClick={() => setMoods(moods.includes(m) ? moods.filter((x) => x !== m) : [...moods, m])}>{m}</Chip>
            ))}
          </div>
        </fieldset>
        {err && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive">{err}</p>}
        <Btn type="submit" className="w-full sm:w-auto">Save to list</Btn>
      </form>
    </div>
  );
}
