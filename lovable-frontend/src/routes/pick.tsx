import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Shuffle } from "lucide-react";
import { AppShell, Avatar, Btn, Chip, Cover } from "@/components/ui-kit";
import { fmtMin, MEMBERS, MOODS, pickFor, useStore, type Mood } from "@/lib/store";

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
  const { titles } = useStore();
  const [minutes, setMinutes] = useState(45);
  const [mood, setMood] = useState<Mood | null>(null);
  const [viewers, setViewers] = useState<string[]>(["me", "timur"]);
  const [idx, setIdx] = useState<number | null>(null);
  const result = mood ? pickFor(titles, minutes, mood) : null;
  const t = result && idx !== null ? result.list[idx] : null;
  const reset = () => setIdx(null);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">Pick for me</h1>
      <p className="mt-1 text-lg text-muted-foreground">One suggestion from your list. No endless scrolling.</p>

      <div className="surface mt-6 space-y-6 p-6 md:p-8">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Who's watching?</legend>
          <div className="flex flex-wrap gap-2">
            {MEMBERS.map((m) => (
              <Chip key={m.id} active={viewers.includes(m.id)} onClick={() => { reset(); setViewers(viewers.includes(m.id) ? viewers.filter((v) => v !== m.id) : [...viewers, m.id]); }}>
                <span className="flex items-center gap-2"><Avatar id={m.id} /> {m.id === "me" ? "You" : m.name}</span>
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
        <Btn className="w-full" disabled={!mood || !viewers.length || minutes < 1} onClick={() => setIdx(0)}>
          <Shuffle className="h-4 w-4" aria-hidden /> Pick something
        </Btn>
      </div>

      <div aria-live="polite">
        {result && idx !== null && (
          t ? (
            <section className="surface mt-6 grid gap-6 p-6 sm:grid-cols-[10rem_1fr]">
              <Cover t={t} className="mx-auto w-40" />
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-primary">Tonight's pick</p>
                <h2 className="text-3xl font-extrabold">{t.title}</h2>
                <p className="text-muted-foreground">{t.kind} · {fmtMin(t.minutes)}{t.kind === "Series" || t.kind === "Anime" ? " episode" : ""}{t.progress && ` · Next: ${t.progress}`}</p>
                {result.tier === "over" && <p className="mt-2 rounded-lg bg-muted p-2 text-sm">Runs {t.minutes - minutes} min over your time.</p>}
                {result.tier === "mood" && <p className="mt-2 rounded-lg bg-muted p-2 text-sm">Nothing {mood?.toLowerCase()} fits, so this is a different mood ({t.moods.join(", ")}).</p>}
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link to="/title/$id" params={{ id: t.id }} className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-semibold text-primary-foreground">Let's watch</Link>
                  <Btn variant="secondary" onClick={() => setIdx(idx + 1)}>Pick again</Btn>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{idx + 1} of {result.list.length} options</p>
              </div>
            </section>
          ) : (
            <section className="surface mt-6 p-6 text-center">
              <p className="font-semibold">{result.list.length ? "You've seen every option." : "Nothing fits right now. Try more time or another mood."}</p>
              {result.list.length > 0 && <Btn variant="ghost" className="mt-2" onClick={() => setIdx(0)}>Start again</Btn>}
            </section>
          )
        )}
      </div>
    </div>
  );
}
