import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileUtilityNavigation, Navigation } from "../app/components/navigation";
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

it("keeps Group, Archive and Account discoverable beside the compact mobile primary navigation", () => {
  route.pathname = "/watchlist";
  render(<MobileUtilityNavigation />);
  const utility = screen.getByRole("navigation", { name: "Other destinations" });
  expect(utility.querySelectorAll("a")).toHaveLength(3);
  expect(Array.from(utility.querySelectorAll("a")).map(link => link.getAttribute("href"))).toEqual(["/group", "/archive", "/account"]);
});

it("real Pick destination keeps one heading and an honest empty-group action", () => {
  render(<Picker view={{ groupId: "group", groupName: "Actual group", members: [], hasActiveProfile: false }} action={async () => ({ kind: "idle" })} />);
  expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  expect(screen.getByRole("heading", { level: 1, name: "Pick for me" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "Create a profile" }).getAttribute("href")).toBe("/group");
  expect(screen.queryByRole("button")).toBeNull();
});
