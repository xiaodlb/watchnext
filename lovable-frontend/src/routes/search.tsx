import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { AppShell, Btn, Chip, Cover } from "@/components/ui-kit";
import { CATALOG, fmtMin, useStore } from "@/lib/store";

export const Route = createFileRoute("/search")({
  validateSearch: (s: Record<string, unknown>) => ({ q: typeof s["q"] === "string" ? s["q"] : "" }),
  head: () => ({
    meta: [
      { title: "Search results · WatchNext" },
      { name: "description", content: "Find movies, series, anime and YouTube videos to add." },
      { property: "og:title", content: "Search results · WatchNext" },
      { property: "og:description", content: "Preview posters and thumbnails before adding." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Results />
    </AppShell>
  ),
});

function Results() {
  const { q } = Route.useSearch();
  const nav = useNavigate();
  const { titles } = useStore();
  const [src, setSrc] = useState<"all" | "film" | "yt">("all");
  const [text, setText] = useState(q);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  let list = CATALOG.filter((c) => words.some((w) => c.title.toLowerCase().includes(w) || c.genres.some((g) => g.toLowerCase().includes(w)) || c.kind.toLowerCase() === w));
  if (!list.length) list = CATALOG; // prototype: always show something
  list = list.filter((c) => src === "all" || (src === "yt" ? c.kind === "YouTube" : c.kind !== "YouTube"));

  return (
    <>
      <Link to="/add" className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"><ArrowLeft className="h-4 w-4" aria-hidden /> Back to add</Link>
      <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Results for “{q}”</h1>
      <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={(e) => { e.preventDefault(); nav({ to: "/search", search: { q: text } }); }}>
        <label className="flex-1"><span className="sr-only">Search</span><input className="field" value={text} onChange={(e) => setText(e.target.value)} /></label>
        <Btn type="submit"><Search className="h-4 w-4" aria-hidden /> Search</Btn>
      </form>
      <div className="mt-4 flex flex-wrap gap-2">
        <Chip active={src === "all"} onClick={() => setSrc("all")}>All sources</Chip>
        <Chip active={src === "film"} onClick={() => setSrc("film")}>Movies & shows</Chip>
        <Chip active={src === "yt"} onClick={() => setSrc("yt")}>YouTube</Chip>
      </div>
      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">{list.length} results</p>
      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const inList = titles.some((t) => t.title === c.title && t.kind === c.kind);
          return (
            <li key={c.title} className="surface flex gap-4 p-3">
              <Cover t={c} className={c.kind === "YouTube" ? "w-40 shrink-0 self-start" : "w-24 shrink-0"} />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="font-bold leading-snug">{c.title}</p>
                <p className="text-sm text-muted-foreground">{c.kind} · {c.channel ?? c.year} · {fmtMin(c.minutes)}</p>
                <p className="text-sm text-muted-foreground">{c.genres.join(", ")}</p>
                <div className="mt-auto pt-3">
                  {inList ? (
                    <span className="text-sm font-semibold text-success">Already in your list</span>
                  ) : (
                    <Btn variant="secondary" className="w-full" onClick={() => nav({ to: "/add", search: { q: c.title, kind: c.kind, minutes: c.minutes, genres: c.genres.join(", ") } })}>Review & add</Btn>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
