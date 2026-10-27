import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Search } from "lucide-react";
import { AppShell, Btn, Chip, Cover } from "@/components/ui-kit";
import { fmtMin, useStore, type Kind, type SearchCandidate } from "@/lib/store";

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
  const { titles, search, select } = useStore();
  const [src, setSrc] = useState<"all" | "film" | "yt">("all");
  const [text, setText] = useState(q);
  const [list, setList] = useState<SearchCandidate[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  useEffect(() => {
    let active = true;
    if (!q.trim()) { setList([]); return; }
    setLoading(true); setError(""); setList([]);
    const isVideoLink = /(?:youtu\.be|youtube\.com)/i.test(q);
    const sources = isVideoLink ? ["youtube" as const] : src === "film" ? ["kinopoisk" as const] : src === "yt" ? ["youtube" as const] : ["kinopoisk" as const, "youtube" as const];
    void Promise.allSettled(sources.map(source => search(q, source))).then(results => {
      if (!active) return;
      const candidates: SearchCandidate[] = [];
      const failures: string[] = [];
      for (const result of results) {
        if (result.status === "rejected") { failures.push(result.reason instanceof Error ? result.reason.message : "Search is unavailable."); continue; }
        candidates.push(...result.value.candidates);
        if (result.value.review) {
          const review = result.value.review; const d = review.draft;
          candidates.push({ id: review.providerId, title: d.title ?? "YouTube video", kind: "YouTube", minutes: Math.ceil((d.duration?.seconds ?? 0) / 60), coverUrl: d.coverUrl, handle: review.handle, source: "review" });
          if (typeof window !== "undefined") sessionStorage.setItem(`watchnext_search_review_${review.handle}`, JSON.stringify(review));
        }
      }
      setList(candidates); setError(failures.join(" ")); setLoading(false);
    });
    return () => { active = false; };
  }, [q, src]);
  async function review(c: SearchCandidate) {
    setBusy(c.id); setError("");
    try {
      const raw = c.source === "review" ? JSON.parse(sessionStorage.getItem(`watchnext_search_review_${c.handle}`) ?? "null") : await select(c);
      if (!raw?.draft) throw new Error("The selected title could not be loaded. Search again.");
      sessionStorage.setItem("watchnext_review", JSON.stringify(raw));
      const typeMap: Record<string, Kind> = { movie: "Movie", series: "Series", anime: "Anime", youtube: "YouTube" };
      await nav({ to: "/add", search: { q: raw.draft.title ?? c.title, kind: typeMap[raw.draft.contentType] ?? c.kind } });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review this title."); }
    finally { setBusy(""); }
  }

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
      <p className="mt-4 text-sm text-muted-foreground" aria-live="polite">{loading ? "Searching…" : `${list.length} results`}</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm">{error} You can still add a title manually.</p>}
      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((c) => {
          const inList = titles.some((t) => t.title === c.title && t.kind === c.kind);
          return (
            <li key={c.title} className="surface flex gap-4 p-3">
              <Cover t={{ ...c, hue: 0 }} className={c.kind === "YouTube" ? "w-40 shrink-0 self-start" : "w-24 shrink-0"} />
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="font-bold leading-snug">{c.title}</p>
                <p className="text-sm text-muted-foreground">{c.kind} · {c.channel ?? c.year} · {fmtMin(c.minutes)}</p>
                <div className="mt-auto pt-3">
                  {inList ? (
                    <span className="text-sm font-semibold text-success">Already in your list</span>
                  ) : (
                    <Btn variant="secondary" disabled={!!busy} className="w-full" onClick={() => void review(c)}>{busy === c.id ? "Loading…" : "Review & add"}</Btn>
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
