import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Shuffle } from "lucide-react";
import { AppShell, Avatar, Btn, Chip, Cover } from "@/components/ui-kit";
import { fmtMin, MOODS, useStore, type Mood } from "@/lib/store";

export const Route = createFileRoute("/pick")({
  head: () => ({
    meta: [
      { title: "Pick for me · WatchNext" },
      { name: "description", content: "Get one suggestion that fits your time and mood." },
      { property: "og:title", content: "Pick for me · WatchNext" },
      { property: "og:description", content: "Tell us your time and mood, get one thing to watch." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Pick />
    </AppShell>
  ),
});

const TIMES = [20, 45, 90, 150];

function Pick() {
  const { titles, members, pick, nextPick } = useStore();
  const [minutes, setMinutes] = useState(45);
  const [mood, setMood] = useState<Mood | null>(null);
  const [viewers, setViewers] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = result?.candidate ? titles.find(x => x.id === result.candidate.id) : null;
  const reset = () => { setResult(null); setError(""); };
  async function runPick() {
    if (!mood) return; setBusy(true); setError("");
    try { setResult(await pick(viewers, minutes, mood)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not select a title."); }
    finally { setBusy(false); }
  }
  async function runNext() {
    if (!result?.cycle) return; setBusy(true); setError("");
    try { setResult(await nextPick(result.cycle.cycleId, result.cycle.step)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not select another title."); }
    finally { setBusy(false); }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Pick for me</h1>
      <p className="mt-1 text-lg text-muted-foreground">One suggestion from your list. No endless scrolling.</p>

      <div className="surface mt-6 space-y-6 p-6 md:p-8">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Who's watching?</legend>
          <div className="flex flex-wrap gap-2">
            {members.map((m) => (
              <Chip key={m.id} active={viewers.includes(m.id)} onClick={() => { reset(); setViewers(viewers.includes(m.id) ? viewers.filter((v) => v !== m.id) : [...viewers, m.id]); }}>
                <span className="flex items-center gap-2"><Avatar id={m.id} /> {m.you ? "You" : m.name}</span>
              </Chip>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">How much time do you have?</legend>
          <div className="flex flex-wrap items-center gap-2">
            {TIMES.map((m) => <Chip key={m} active={minutes === m} onClick={() => { reset(); setMinutes(m); }}>{fmtMin(m)}</Chip>)}
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              or
              <input className="field w-24" inputMode="numeric" aria-label="Minutes available" value={minutes} onChange={(e) => { reset(); setMinutes(Math.min(1440, Number(e.target.value.replace(/\D/g, "")) || 0)); }} />
              min
            </label>
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">What's the mood?</legend>
          <div className="flex flex-wrap gap-2">
            {MOODS.map((m) => <Chip key={m} active={mood === m} onClick={() => { reset(); setMood(m); }}>{m}</Chip>)}
          </div>
        </fieldset>
        <Btn className="w-full" disabled={busy || !mood || !viewers.length || minutes < 1} onClick={() => void runPick()}>
          <Shuffle className="h-4 w-4" aria-hidden /> Pick something
        </Btn>
      </div>
      {error && <p role="alert" className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm">{error}</p>}

      <div aria-live="polite">
        {result && (
          result.kind === "picked" && t ? (
            <section className="surface mt-6 grid gap-6 p-6 sm:grid-cols-[10rem_1fr]">
              <Cover t={t} className="mx-auto w-40" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-primary">Tonight's pick</p>
                <h2 className="text-3xl font-extrabold">{t.title}</h2>
                <p className="text-muted-foreground">{t.kind} · {fmtMin(t.minutes)}{t.kind === "Series" || t.kind === "Anime" ? " episode" : ""}{t.progress && ` · Next: ${t.progress}`}</p>
                {result.candidate?.message && <p className="mt-2 rounded-lg bg-muted p-2 text-sm">{result.candidate.message}</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/title/$id" params={{ id: t.id }} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground">Let's watch</Link>
                  <Btn variant="secondary" disabled={busy || !result.cycle} onClick={() => void runNext()}>Pick again</Btn>
                </div>
              </div>
            </section>
          ) : (
            <section className="surface mt-6 p-6 text-center">
              <p className="font-semibold">{result.message ?? (result.kind === "exhausted" ? "You've seen every option." : "Nothing fits right now. Try more time or another mood.")}</p>
              {result.kind === "exhausted" && <Btn variant="ghost" className="mt-2" onClick={() => void runPick()}>Start again</Btn>}
            </section>
          )
        )}
      </div>
    </div>
  );
}
