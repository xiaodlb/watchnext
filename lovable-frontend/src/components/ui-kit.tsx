import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, type ReactNode, type ButtonHTMLAttributes } from "react";
import { Film, Tv, Sparkles, Youtube, Plus, List, Shuffle, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { member, useStore, type Kind, type Title } from "@/lib/store";

export function Btn({ variant = "primary", className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" }) {
  return (
    <button
      {...p}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "secondary" && "border border-input bg-card text-foreground hover:bg-muted",
        variant === "ghost" && "text-primary hover:bg-secondary",
        className,
      )}
    />
  );
}

export const kindIcon: Record<Kind, typeof Film> = { Movie: Film, Series: Tv, Anime: Sparkles, YouTube: Youtube };

export function Cover({ t, className }: { t: Pick<Title, "title" | "kind" | "hue">; className?: string }) {
  const Icon = kindIcon[t.kind];
  const wide = t.kind === "YouTube";
  return (
    <div
      role="img"
      aria-label={`${t.kind} cover: ${t.title}`}
      className={cn("cover-fallback relative flex flex-col justify-end overflow-hidden rounded-lg p-3", wide ? "aspect-video" : "aspect-[2/3]", className)}
      style={{ filter: `hue-rotate(${t.hue}deg)` }}
    >
      <Icon className="absolute right-3 top-3 h-5 w-5 opacity-70" aria-hidden />
      <span className="line-clamp-3 text-sm font-bold leading-tight">{t.title}</span>
    </div>
  );
}

export function Avatar({ id, size = "sm" }: { id: string; size?: "sm" | "md" }) {
  const m = member(id);
  return (
    <span className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-bold text-primary-foreground", m.color, size === "sm" ? "h-6 w-6 text-xs" : "h-9 w-9 text-sm")} aria-hidden>
      {m.name[0]}
    </span>
  );
}

export function Chip({ active, children, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      {...p}
      className={cn("min-h-11 rounded-full border px-4 text-sm font-semibold transition-colors", active ? "border-primary bg-secondary text-secondary-foreground" : "border-input bg-card text-muted-foreground hover:bg-muted")}
    >
      {children}
    </button>
  );
}

const NAV = [
  { to: "/watchlist", label: "Watchlist", icon: List },
  { to: "/add", label: "Add", icon: Plus },
  { to: "/pick", label: "Pick for me", icon: Shuffle },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useStore();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!user) nav({ to: "/" });
  }, [user, nav]);
  if (!user) return null;
  return (
    <div className="min-h-screen pb-24 md:pb-0">
      <header className="sticky top-0 z-20 border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 md:px-6">
          <Link to="/watchlist" className="text-xl font-extrabold tracking-tight">
            Watch<span className="text-primary">Next</span>
          </Link>
          <span className="hidden rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground sm:inline">Movie nights · 3 members</span>
          <nav className="ml-auto hidden gap-1 md:flex" aria-label="Main">
            {NAV.map((n) => {
              const active = path.startsWith(n.to) || (n.to === "/add" && path === "/search");
              return (
                <Link key={n.to} to={n.to} aria-current={active ? "page" : undefined} className={cn("flex min-h-11 items-center gap-2 rounded-lg px-3 font-semibold", active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-muted")}>
                  <n.icon className="h-4 w-4" aria-hidden /> {n.label}
                </Link>
              );
            })}
          </nav>
          <button onClick={signOut} className="ml-auto flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm text-muted-foreground hover:bg-muted md:ml-2" aria-label="Sign out">
            <Avatar id="me" size="md" />
            <LogOut className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t bg-card md:hidden" aria-label="Main mobile">
        {NAV.map((n) => {
          const active = path.startsWith(n.to) || (n.to === "/add" && path === "/search");
          return (
            <Link key={n.to} to={n.to} aria-current={active ? "page" : undefined} className={cn("flex flex-col items-center gap-1 py-2 text-xs font-semibold", active ? "text-primary" : "text-muted-foreground")}>
              <n.icon className="h-5 w-5" aria-hidden /> {n.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
