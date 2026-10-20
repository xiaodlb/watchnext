"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const destinations = [
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

/**
 * The compact navigation deliberately contains only the three primary flows
 * from the Lovable reference. Account, archive and legacy controls remain in
 * the desktop header and linked from their owning pages.
 */
export function MobileNavigation() {
  const pathname = usePathname();
  if (pathname === "/mock" || pathname.startsWith("/mock/")) return null;
  const mobile = destinations.filter(({ href }) => ["/watchlist", "/pick"].includes(href));
  const links = [
    mobile[0],
    { href: "/watchlist/add", label: "Add" },
    mobile[1],
  ];
  return <nav className="mobile-navigation" aria-label="Main navigation mobile">
    {links.map(({ href, label }) => {
      const active = href === "/watchlist/add" ? pathname.startsWith(href) : pathname === href || pathname.startsWith(href + "/");
      return <Link key={href} href={href} className="mobile-navigation-link" aria-current={active ? "page" : undefined}>
        <span aria-hidden="true" className={`mobile-nav-icon mobile-nav-${label.toLowerCase().replaceAll(" ", "-")}`} />
        {label}
      </Link>;
    })}
  </nav>;
}
