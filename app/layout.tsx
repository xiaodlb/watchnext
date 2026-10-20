import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ContextBadge } from "./components/context-badge";
import { MobileNavigation, MobileUtilityNavigation, Navigation } from "./components/navigation";
import "./styles.css";

export const metadata: Metadata = {
  title: "WatchNext",
  description: "Choose something to watch from your shared saved list.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        <header className="site-header">
          <div className="shell header-content">
            <Link className="brand" href="/watchlist" aria-label="WatchNext home">
              <span className="brand-mark" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M6 3.5 14 9l-8 5.5v-11Z" fill="currentColor" />
                </svg>
              </span>
              <span>WatchNext</span>
            </Link>
            <ContextBadge />
            <Navigation />
          </div>
        </header>
        <MobileUtilityNavigation />
        <main id="main-content" className="shell main-content" tabIndex={-1}>
          {children}
        </main>
        <MobileNavigation />
        <footer className="shell site-footer">Something worth watching. Someone to watch it with.</footer>
      </body>
    </html>
  );
}
