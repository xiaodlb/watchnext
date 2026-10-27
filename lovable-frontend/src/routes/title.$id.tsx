import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check } from "lucide-react";
import { AppShell, Avatar, Btn, Chip, Cover } from "@/components/ui-kit";
import { fmtMin, KINDS, MOODS, useStore, type Draft, type Kind, type Mood, type Title } from "@/lib/store";
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
  const { titles, update, edit, remove, member, loading } = useStore();
  const nav = useNavigate();
  const t = titles.find((x) => x.id === id);
  const [note, setNote] = useState(t?.note ?? "");
  const [progress, setProgress] = useState(t?.progress ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setNote(t?.note ?? ""); setProgress(t?.progress ?? ""); }, [t?.id, loading]);

  if (!t) return <p>{loading ? "Loading title…" : "Title not found."} <Link to="/watchlist" className="text-primary underline">Back to watchlist</Link></p>;
  const episodic = t.kind === "Series" || t.kind === "Anime";

  const apply = async (patch: Parameters<typeof update>[1]) => {
    setBusy(true); setError("");
    try { await update(t.id, patch); setSaved(true); setTimeout(() => setSaved(false), 2000); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save changes."); }
    finally { setBusy(false); }
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
            Added by {t.addedBy.map((a) => <span key={a} className="inline-flex items-center gap-1"><Avatar id={a} /> {member(a).you ? "You" : member(a).name}</span>)}
          </div>

          <section className="surface mt-6 space-y-5 p-6">
            <h2 className="text-xl font-bold">Your progress</h2>
            <label className="block">
              <span className="mb-1 block text-sm font-semibold">{episodic ? "Next episode to watch" : "Stopped at (H:MM:SS)"}</span>
              <input className="field" value={progress} onChange={(e) => setProgress(e.target.value)} placeholder={episodic ? "e.g. S1 · E5" : "e.g. 0:42:10"} />
            </label>
            <Btn disabled={busy} variant={t.done ? "primary" : "secondary"} onClick={() => void apply({ done: !t.done })} aria-pressed={t.done}>
              <Check className="h-4 w-4" aria-hidden /> {t.done ? "Watched" : "Mark as watched"}
            </Btn>

            <div>
              <p className="mb-2 text-sm font-semibold">Your rating</p>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Rating 1 to 10">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} disabled={busy} role="radio" aria-checked={t.rating === n} onClick={() => void apply({ rating: t.rating === n ? undefined : n })} className={cn("h-11 w-11 rounded-lg border font-bold", t.rating && n <= t.rating ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground")}>
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
              <Btn disabled={busy} onClick={() => void apply({ note: note.trim(), progress: progress.trim() })}>Save</Btn>
              <span aria-live="polite" className="text-sm font-semibold text-success">{saved ? "Saved" : ""}</span>
            </div>
          </section>
          {error && <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-3 text-sm">{error}</p>}
          {t.canEdit && (editing ? <EditTitle key={t.id} title={t} onCancel={() => setEditing(false)} onSave={async draft => { await edit(t.id, draft); setEditing(false); }} /> : <button className="mt-4 block text-sm font-semibold text-primary underline" onClick={() => setEditing(true)}>Edit title</button>)}
          {t.watchUrl && <a className="mt-4 inline-flex min-h-11 items-center font-semibold text-primary underline" href={t.watchUrl} target="_blank" rel="noopener noreferrer">Open watch link</a>}
          {t.canRemove && <button disabled={busy} className="mt-4 block text-sm text-destructive underline" onClick={async () => { if (!window.confirm("Remove your contribution from this title?")) return; setBusy(true); try { await remove(t.id); await nav({ to: "/watchlist" }); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove title."); setBusy(false); } }}>Remove my contribution</button>}

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

function EditTitle({ title, onCancel, onSave }: { title: Title; onCancel: () => void; onSave: (draft: Draft) => Promise<void> }) {
  const [name, setName] = useState(title.title), [kind, setKind] = useState<Kind>(title.kind), [minutes, setMinutes] = useState(String(title.minutes));
  const [genres, setGenres] = useState(title.genres.join(", ")), [moods, setMoods] = useState<Mood[]>(title.moods), [watchUrl, setWatchUrl] = useState(title.watchUrl ?? "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  return <form className="surface mt-4 space-y-4 p-6" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setError("");
    try { await onSave({ title: name, kind, minutes: Number(minutes), ...(Number(minutes) === title.minutes && title.durationSeconds > 0 ? { durationSeconds: title.durationSeconds } : {}), genres: genres.split(",").map(v => v.trim()).filter(Boolean), moods, watchUrl, coverUrl: title.coverUrl ?? null, sourceUrl: title.sourceUrl ?? null, ...(kind === title.kind ? { numberingStyle: title.numberingStyle } : {}) }); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not edit title."); }
    finally { setBusy(false); }
  }}>
    <h2 className="text-xl font-bold">Edit title</h2>
    <label className="block text-sm font-semibold">Title<input className="field mt-1" value={name} onChange={event => setName(event.target.value)} required maxLength={200} /></label>
    <label className="block text-sm font-semibold">Type<select className="field mt-1" value={kind} onChange={event => setKind(event.target.value as Kind)}>{KINDS.map(value => <option key={value}>{value}</option>)}</select></label>
    <label className="block text-sm font-semibold">{kind === "Series" || kind === "Anime" ? "Typical episode length (min)" : "Runtime (min)"}<input className="field mt-1" type="number" min="1" max="1440" value={minutes} onChange={event => setMinutes(event.target.value)} required /></label>
    <label className="block text-sm font-semibold">Genres<input className="field mt-1" value={genres} onChange={event => setGenres(event.target.value)} /></label>
    <fieldset><legend className="mb-2 text-sm font-semibold">Moods</legend><div className="flex flex-wrap gap-2">{MOODS.map(mood => <Chip key={mood} active={moods.includes(mood)} onClick={() => setMoods(moods.includes(mood) ? moods.filter(m => m !== mood) : [...moods, mood])}>{mood}</Chip>)}</div></fieldset>
    <label className="block text-sm font-semibold">Watch link<input className="field mt-1" type="url" value={watchUrl} onChange={event => setWatchUrl(event.target.value)} /></label>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <div className="flex gap-2"><Btn disabled={busy || moods.length === 0} type="submit">Save changes</Btn><Btn disabled={busy} type="button" variant="secondary" onClick={onCancel}>Cancel</Btn></div>
  </form>;
}
