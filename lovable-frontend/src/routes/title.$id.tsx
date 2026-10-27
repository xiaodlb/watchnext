import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { AppShell, Avatar, Btn, Cover } from "@/components/ui-kit";
import { fmtMin, member, useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/title/$id")({
  head: () => ({
    meta: [
      { title: "Title details · WatchNext" },
      { name: "description", content: "Progress, ratings and notes for a title on your shared list." },
      { property: "og:title", content: "Title details · WatchNext" },
      { property: "og:description", content: "Track where you are and what you thought." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Details />
    </AppShell>
  ),
});

function Details() {
  const { id } = Route.useParams();
  const { titles, update } = useStore();
  const nav = useNavigate();
  const t = titles.find((x) => x.id === id);
  const [note, setNote] = useState(t?.note ?? "");
  const [progress, setProgress] = useState(t?.progress ?? "");
  const [saved, setSaved] = useState(false);

  if (!t) return <p>Title not found. <Link to="/watchlist" className="text-primary underline">Back to watchlist</Link></p>;
  const episodic = t.kind === "Series" || t.kind === "Anime";

  const save = () => {
    update(t.id, { note: note.trim(), progress: progress.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <>
      <button onClick={() => nav({ to: "/watchlist" })} className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"><ArrowLeft className="h-4 w-4" aria-hidden /> Watchlist</button>
      <div className="mt-4 grid gap-8 md:grid-cols-[18rem_1fr]">
        <div className="mx-auto w-full max-w-xs"><Cover t={t} /></div>
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t.kind} · {t.channel ?? t.year}</p>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{t.title}</h1>
          <p className="mt-2 text-muted-foreground">{fmtMin(t.minutes)}{episodic ? " per episode" : ""} · {t.genres.join(", ")}</p>
          <div className="mt-3 flex flex-wrap gap-2">{t.moods.map((m) => <span key={m} className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-secondary-foreground">{m}</span>)}</div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Added by {t.addedBy.map((a) => <span key={a} className="inline-flex items-center gap-1"><Avatar id={a} /> {a === "me" ? "You" : member(a).name}</span>)}
          </div>

          <section className="surface mt-6 space-y-5 p-6">
            <h2 className="text-xl font-bold">Your progress</h2>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">{episodic ? "Next episode to watch" : "Stopped at (H:MM:SS)"}</span>
              <input className="field" value={progress} onChange={(e) => setProgress(e.target.value)} placeholder={episodic ? "e.g. S1 · E5" : "e.g. 0:42:10"} />
            </label>
            <Btn variant={t.done ? "primary" : "secondary"} onClick={() => update(t.id, { done: !t.done })} aria-pressed={t.done}>
              <Check className="h-4 w-4" aria-hidden /> {t.done ? "Watched" : "Mark as watched"}
            </Btn>

            <div>
              <p className="mb-2 text-sm font-semibold">Your rating</p>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Rating 1 to 10">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} role="radio" aria-checked={t.rating === n} onClick={() => update(t.id, { rating: t.rating === n ? undefined : n })} className={cn("h-11 w-11 rounded-lg border font-bold", t.rating && n <= t.rating ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground")}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-semibold">Your note <span className="font-normal text-muted-foreground">(visible to the group)</span></span>
              <textarea className="field min-h-28" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            <div className="flex items-center gap-3">
              <Btn onClick={save}>Save</Btn>
              <span aria-live="polite" className="text-sm font-semibold text-success">{saved ? "Saved" : ""}</span>
            </div>
          </section>

          {t.otherNotes.length > 0 && (
            <section className="mt-6">
              <h2 className="text-xl font-bold">From the group</h2>
              <ul className="mt-3 space-y-3">
                {t.otherNotes.map((o) => (
                  <li key={o.by} className="surface flex gap-3 p-4">
                    <Avatar id={o.by} size="md" />
                    <div>
                      <p className="font-semibold">{member(o.by).name} {o.rating && <span className="ml-2 text-sm text-primary">★ {o.rating}/10</span>}</p>
                      {o.note && <p className="whitespace-pre-line text-muted-foreground">{o.note}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
