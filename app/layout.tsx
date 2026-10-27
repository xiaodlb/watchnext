import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ContextBadge, HeaderAccount } from "./components/context-badge";
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
            <Link className="brand source-brand" href="/watchlist" aria-label="WatchNext home">Watch<span>Next</span></Link>
            <ContextBadge />
            <Navigation />
            <HeaderAccount />
            <MobileUtilityNavigation />
          </div>
        </header>
        <main id="main-content" className="shell main-content" tabIndex={-1}>
          {children}
        </main>
        <MobileNavigation />
        <footer className="shell site-footer">Something worth watching. Someone to watch it with.</footer>
      </body>
    </html>
  );
}
