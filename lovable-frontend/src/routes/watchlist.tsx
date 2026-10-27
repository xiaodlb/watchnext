import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Plus } from "lucide-react";
import { AppShell, Avatar, Chip, Cover } from "@/components/ui-kit";
import { fmtMin, KINDS, useStore, type Kind } from "@/lib/store";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist · WatchNext" },
      { name: "description", content: "Your group's shared list of movies, series, anime and videos." },
      { property: "og:title", content: "Watchlist · WatchNext" },
      { property: "og:description", content: "Everything your group wants to watch, in one place." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => (
    <AppShell>
      <Watchlist />
    </AppShell>
  ),
});

function Watchlist() {
  const { titles, archived, members, member, groupName, loading, error, reload, loadArchive, restore } = useStore();
  const [scope, setScope] = useState<"all" | "mine">("all");
  const [kind, setKind] = useState<Kind | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [restoreError, setRestoreError] = useState("");
  const list = titles.filter((t) => (scope === "all" || t.addedBy.some(id => members.some(m => m.id === id && m.you))) && (!kind || t.kind === kind));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight md:text-5xl">{showArchive ? "Archive" : groupName}</h1>
          <p className="mt-1 text-lg text-muted-foreground">Shared watchlist · {titles.length} titles</p>
        </div>
        <Link to="/add" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" aria-hidden /> Add title
        </Link>
      </div>

      <button className="mt-4 text-sm font-semibold text-primary underline" onClick={() => { setShowArchive(!showArchive); setRestoreError(""); if (!showArchive) void loadArchive(); }}>
        {showArchive ? "Back to watchlist" : "View archive"}
      </button>
      {showArchive && <section className="mt-6" aria-label="Archived titles">
        {restoreError && <p role="alert" className="mb-3 text-destructive">{restoreError}</p>}
        {loading ? <p>Loading archive…</p> : error ? <p role="alert">{error}</p> : archived.length === 0 ? <p>No archived titles.</p> :
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{archived.map(t => <li key={t.id} className="surface flex flex-col gap-2 p-3"><Cover t={t} /><p className="font-bold">{t.title}</p><BtnRestore onRestore={async () => { try { await restore(t.id); } catch (cause) { setRestoreError(cause instanceof Error ? cause.message : "Could not restore title."); } }} /></li>)}</ul>}
      </section>}

      {!showArchive && <><div className="mt-6 flex flex-wrap items-center gap-2">
        <div className="mr-2 inline-grid grid-cols-2 rounded-lg border bg-card p-1" role="tablist" aria-label="Who added">
          {(["all", "mine"] as const).map((s) => (
            <button key={s} role="tab" aria-selected={scope === s} onClick={() => setScope(s)} className={`min-h-10 rounded-md px-4 text-sm font-semibold ${scope === s ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {s === "all" ? "All" : "Added by me"}
            </button>
          ))}
        </div>
        {KINDS.map((k) => (
          <Chip key={k} active={kind === k} onClick={() => setKind(kind === k ? null : k)}>{k}</Chip>
        ))}
      </div>

      {loading ? <p className="mt-8">Loading your watchlist…</p> : error ? <div role="alert" className="surface mt-8 p-6">{error} <button className="text-primary underline" onClick={() => void reload()}>Try again</button></div> : list.length === 0 ? (
        <div className="surface mt-8 p-10 text-center">
          <p className="text-lg font-semibold">Nothing here yet</p>
          <p className="text-muted-foreground">Try another filter or add something new.</p>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {list.map((t) => (
            <li key={t.id}>
              <Link to="/title/$id" params={{ id: t.id }} className="surface group flex h-full flex-col p-2 transition-shadow hover:shadow-md">
                <div className="flex flex-1 items-center">
                  <Cover t={t} className="w-full" />
                </div>
                <div className="p-2">
                  <p className="font-bold leading-snug group-hover:text-primary">{t.title}</p>
                  <p className="text-sm text-muted-foreground">
                    {t.kind} · {fmtMin(t.minutes)}{t.kind === "Series" || t.kind === "Anime" ? "/ep" : ""}
                  </p>
                  <p className="mt-1 text-sm font-semibold text-primary">{t.done ? "✓ Watched" : t.progress ? `Next: ${t.progress}` : "Not started"}</p>
                  <div className="mt-2 flex items-center gap-1" aria-label={`Added by ${t.addedBy.map((a) => member(a).name).join(", ")}`}>
                    {t.addedBy.map((a) => <Avatar key={a} id={a} />)}
                    <span className="ml-1 truncate text-xs text-muted-foreground">{t.addedBy.map((a) => (member(a).you ? "You" : member(a).name)).join(", ")}</span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}</>}
    </>
  );
}

function BtnRestore({ onRestore }: { onRestore: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return <button className="min-h-11 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50" disabled={busy} onClick={async () => { setBusy(true); try { await onRestore(); } finally { setBusy(false); } }}>Restore</button>;
}
