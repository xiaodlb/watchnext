import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileNavigation, MobileUtilityNavigation, Navigation } from "../app/components/navigation";
import { Picker } from "../app/pick/picker";


const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
afterEach(cleanup);

describe("shared navigation", () => {
  for (const [path, label] of [["/watchlist", "Watchlist"], ["/watchlist/add", "Add"], ["/pick", "Pick for me"], ["/group", "Group"], ["/archive", "Archive"], ["/account", "Account"]]) {
    it(`marks only ${label} current on ${path} and supplies real destinations`, () => {
      route.pathname = path;
      render(<Navigation />);
      expect(screen.getByRole("navigation", { name: "Main navigation" })).toBeTruthy();
      expect(screen.getAllByRole("link")).toHaveLength(6);
      expect(screen.getAllByRole("link").map((link) => link.getAttribute("href")))
        .toEqual(["/watchlist", "/watchlist/add", "/pick", "/group", "/archive", "/account"]);
      const current = screen.getAllByRole("link").filter((link) => link.getAttribute("aria-current") === "page");
      expect(current).toHaveLength(1);
      expect(current[0].textContent).toBe(label);
    });
  }
});

it("keeps Group, Archive and Account discoverable in the compact More menu", () => {
  route.pathname = "/watchlist";
  render(<Navigation />);
  const more = screen.getByLabelText("More workspace options");
  expect(more.textContent).toBe("More");
  const menu = more.closest("details");
  expect(menu).toBeTruthy();
  expect(Array.from(menu!.querySelectorAll("a")).map(link => link.getAttribute("href")))
    .toEqual(["/group", "/archive", "/account"]);
});

it("keeps mobile workspace utilities in one compact disclosure beside the primary navigation", () => {
  route.pathname = "/watchlist";
  render(<><MobileUtilityNavigation /><MobileNavigation /></>);
  expect(screen.getByRole("navigation", { name: "Main navigation mobile" })).toBeTruthy();
  const more = screen.getByLabelText("More workspace options");
  expect(more.closest("details")).toBeTruthy();
  expect(screen.getByRole("navigation", { name: "Workspace utilities" })).toBeTruthy();
  expect(screen.getAllByRole("link").map(link => link.getAttribute("href")))
    .toEqual(["/group", "/archive", "/account", "/watchlist", "/watchlist/add", "/pick"]);
});

it("real Pick destination keeps one heading and an honest empty-group action", () => {
  render(<Picker view={{ groupId: "group", groupName: "Actual group", members: [], hasActiveProfile: false }} action={async () => ({ kind: "idle" })} />);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: "Pick for me" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Create a profile" }).getAttribute("href")).toBe("/group");
  expect(screen.queryByRole("button")).toBeNull();
});
