"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  { href: "/", label: "Group entry" },
  { href: "/watchlist", label: "Watchlist" },
  { href: "/pick", label: "Pick for me" },
  { href: "/archive", label: "Archive" },
  { href: "/account", label: "Account groups" },
];

export function Navigation() {
  const pathname = usePathname();
  if (pathname === "/mock" || pathname.startsWith("/mock/")) return (
    <nav aria-label="Mock preview navigation"><ul className="navigation">
      <li><Link className="navigation-link" href="/mock" prefetch={false} aria-current={pathname === "/mock" ? "page" : undefined}>Mock foundation</Link></li>
      <li><a className="navigation-link" href="/">Exit demo</a></li>
    </ul></nav>
  );
  return (
    <nav aria-label="Main navigation">
      <ul className="navigation">
        {destinations.map(({ href, label }) => {
          const active = pathname === href || (href === "/" && pathname === "/group") || (href !== "/" && pathname.startsWith(href + "/"));
          return (
            <li key={href}>
              <Link className="navigation-link" href={href} aria-current={active ? "page" : undefined}>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
