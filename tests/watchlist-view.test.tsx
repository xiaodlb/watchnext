import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WatchlistContent } from "../app/watchlist/watchlist-view";
import { Cover } from "../app/watchlist/cover";
import { WatchlistLoadError } from "../app/watchlist/load-error";
import Loading from "../app/watchlist/loading";
import type { WatchlistItem } from "../lib/watchlist";
const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const fixture: WatchlistItem = { id: "fixture", title: "Shared film", contentType: "movie", durationSeconds: 1501, numberingStyle: "none", coverUrl: null, moods: ["Funny", "Relaxing"], contributors: [{ id: "anna", name: "Anna", color: "#1d4ed8" }, { id: "max", name: "Max", color: "#0f766e" }] };
it("renders all persisted metadata once and an actual detail opener for selected profiles", () => {
  render(<WatchlistContent view={{ activeMemberId: "anna", items: [fixture] }} />);
  const cards = screen.getAllByRole("article"); expect(cards).toHaveLength(1);
  expect(within(cards[0]).getByText("Full duration: 25 min 1 sec")).toBeTruthy();
  expect(within(cards[0]).getByText("Moods: Funny, Relaxing")).toBeTruthy();
  expect(within(cards[0]).getByText("Anna").previousElementSibling?.getAttribute("style")).toContain("rgb(29, 78, 216)");
  expect(within(cards[0]).getByText("Max").previousElementSibling?.getAttribute("style")).toContain("rgb(15, 118, 110)");
  expect(screen.getByRole("link", { name: "View details: Shared film" }).getAttribute("href")).toBe("/watchlist/fixture");
});
it("allows browsing/details without selected profile but routes adding through profile selection", () => {
  render(<WatchlistContent view={{ activeMemberId: null, items: [{ ...fixture, contentType: "anime", numberingStyle: "continuous" }] }} />);
  expect(screen.getByText("Typical episode duration: 25 min 1 sec")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Choose profile" }).getAttribute("href")).toBe("/group");
  expect(screen.getByRole("link", { name: "View details: Shared film" }).getAttribute("href")).toBe("/watchlist/fixture");
  expect(screen.queryByRole("link", { name: "Add title" })).toBeNull();
});
it("distinguishes honest empty, loading and failed states, with a real refresh action", () => {
  const { unmount } = render(<WatchlistContent view={{ activeMemberId: null, items: [] }} />);
  expect(screen.getByRole("heading", { name: "Your watchlist is empty" })).toBeTruthy(); unmount();
  const loading = render(<Loading />); expect(screen.getByRole("status").textContent).toBe("Loading your watchlist…"); loading.unmount();
  render(<WatchlistLoadError />); expect(screen.getByRole("heading", { name: "Couldn’t load your watchlist" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); expect(refresh).toHaveBeenCalledTimes(1);
});
it("never renders unsafe image URLs and replaces a failed cover with the stable fallback", () => {
  const { rerender } = render(<Cover url="javascript:alert(1)" title="Fixture" />); expect(screen.queryByRole("img")).toBeNull(); expect(screen.getByText("No cover")).toBeTruthy();
  rerender(<Cover url="https://name:password@example.com/cover.png" title="Fixture" />); expect(screen.queryByRole("img")).toBeNull();
  rerender(<Cover url="https://i.ytimg.com/vi/YtFixture01/default.jpg" title="Fixture" />); fireEvent.error(screen.getByRole("img", { name: "Fixture cover" })); expect(screen.queryByRole("img")).toBeNull(); expect(screen.getByText("No cover")).toBeTruthy();
});

it("unsupported authored URLs render fallback; a changed safe URL resets failed-image state and aspect ratio",()=>{
 const {rerender}=render(<Cover url="https://example.com/authored-cover.jpg" title="Authored"/>);expect(screen.queryByRole("img")).toBeNull();
 rerender(<Cover url="https://i.ytimg.com/vi/YtFixture01/default.jpg" title="Video"/>);const image=screen.getByRole("img");expect(image.getAttribute("referrerpolicy")).toBe("no-referrer");expect(image.parentElement?.className).toContain("video-cover");fireEvent.error(image);expect(screen.queryByRole("img")).toBeNull();
 rerender(<Cover url="https://kinopoiskapiunofficial.tech/images/posters/kp/301.jpg" title="Poster"/>);expect(screen.getByRole("img").getAttribute("src")).toContain("/301.jpg");expect(screen.getByRole("img").parentElement?.className).not.toContain("video-cover");
});

it("detects an already cached image failure at hydration and keeps an honest stable fallback",()=>{
 const complete=vi.spyOn(HTMLImageElement.prototype,"complete","get").mockReturnValue(true),width=vi.spyOn(HTMLImageElement.prototype,"naturalWidth","get").mockReturnValue(0);
 try{render(<Cover url="https://i.ytimg.com/vi/YtFixture01/default.jpg" title="Cached failure"/>);expect(screen.queryByRole("img")).toBeNull();expect(screen.getByText("No cover")).toBeTruthy();}finally{complete.mockRestore();width.mockRestore();}
});

it("account Mine changes inclusion only, preserves all contributor chips and exposes identity-free accessible current links",()=>{
 render(<WatchlistContent view={{activeMemberId:"anna",canFilter:true,filter:"mine",items:[{...fixture,contributors:[...fixture.contributors,{id:"removed",name:"Former",color:"#475569",inactive:true}]}]}}/>);
 const nav=screen.getByRole("navigation",{name:"Watchlist filter"});expect(within(nav).getByRole("link",{name:"All titles"}).getAttribute("href")).toBe("/watchlist");expect(within(nav).getByRole("link",{name:"Added by me"}).getAttribute("href")).toBe("/watchlist?filter=mine");expect(within(nav).getByRole("link",{name:"Added by me"}).getAttribute("aria-current")).toBe("page");expect(screen.getAllByRole("article")).toHaveLength(1);for(const name of["Anna","Max","Former"])expect(screen.getByText(name)).toBeTruthy();expect(screen.getByText(/Inactive participant/)).toBeTruthy();
});
it("empty Mine differs from All and provides real shared-list/add destinations",()=>{
 const{rerender}=render(<WatchlistContent view={{activeMemberId:"anna",canFilter:true,filter:"mine",items:[]}}/>);expect(screen.getByRole("heading",{name:"You haven’t added any titles"})).toBeTruthy();expect(screen.getByRole("link",{name:"Show all titles"}).getAttribute("href")).toBe("/watchlist");expect(screen.getByRole("link",{name:"Add a title"}).getAttribute("href")).toBe("/watchlist/add");rerender(<WatchlistContent view={{activeMemberId:"anna",canFilter:true,filter:"all",items:[]}}/>);expect(screen.getByRole("heading",{name:"Your watchlist is empty"})).toBeTruthy();
});
it("legacy and archive never offer authenticated Mine controls, while safe notices remain visible",()=>{
 const{rerender}=render(<WatchlistContent view={{activeMemberId:"anna",items:[fixture],filterNotice:"Added by me is available in account groups only. Showing your shared list."}}/>);expect(screen.queryByRole("navigation",{name:"Watchlist filter"})).toBeNull();expect(screen.getByRole("status").textContent).toContain("account groups only");rerender(<WatchlistContent archived view={{activeMemberId:"anna",canFilter:true,filter:"mine",items:[fixture]}}/>);expect(screen.queryByRole("navigation",{name:"Watchlist filter"})).toBeNull();expect(screen.getByRole("heading",{name:"Archive"})).toBeTruthy();
});
it("filters the already-authorized library by type without changing the server-backed All or Mine selection",()=>{
 const youtube: WatchlistItem = { ...fixture, id:"video", title:"Shared video", contentType:"youtube" };
 render(<WatchlistContent view={{activeMemberId:"anna",canFilter:true,filter:"all",items:[fixture,youtube]}}/>);
 expect(screen.getByText("2 titles")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"YouTube"}));
 expect(screen.getByRole("article",{name:"Shared video"})).toBeTruthy();
 expect(screen.queryByText("Shared film")).toBeNull();
 expect(screen.getByRole("link",{name:"Added by me"}).getAttribute("href")).toBe("/watchlist?filter=mine");
  fireEvent.click(screen.getByRole("button",{name:"YouTube"}));
 expect(screen.getByRole("article",{name:"Shared film"})).toBeTruthy();
});
it("keeps an authorized YouTube entry in the reference-style card grid with its wide preview",()=>{
 const youtube: WatchlistItem={...fixture,id:"video",title:"Shared video",contentType:"youtube",coverUrl:"https://i.ytimg.com/vi/YtFixture01/default.jpg"};
 render(<WatchlistContent view={{activeMemberId:"anna",items:[youtube]}}/>);
 const card=screen.getByRole("article",{name:"Shared video"});
 expect(card.className).toContain("watchlist-card");
 const cover=within(card).getByRole("img",{name:"Shared video cover"}).parentElement;
 expect(cover?.className).toContain("title-cover");
 expect(cover?.className).toContain("video-cover");
 expect(within(card).getByText("YouTube video")).toBeTruthy();
});
it("uses the active viewer's real progress as the source-style card status",()=>{
 render(<WatchlistContent view={{activeMemberId:"anna",items:[
   {...fixture,id:"film",progress:null},
   {...fixture,id:"series",contentType:"series",numberingStyle:"season_episode",progress:{positionState:"in_progress",nextSeason:2,nextEpisode:4,timestampSeconds:null,completed:false}},
   {...fixture,id:"done",progress:{positionState:null,nextSeason:null,nextEpisode:null,timestampSeconds:null,completed:true}},
 ]}}/>);
 expect(screen.getByText("Not started")).toBeTruthy();
 expect(screen.getByText("Next: S2 · E4")).toBeTruthy();
 expect(screen.getByText("✓ Watched")).toBeTruthy();
});
it("storage retry keeps a requested Mine mode without replacing the current URL",()=>{
 render(<WatchlistLoadError filter="mine"/>);expect(screen.getByText("Your Added by me request is kept when you retry.")).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Try again"}));expect(refresh).toHaveBeenCalledTimes(1);
});
