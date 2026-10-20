import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { MockEntry } from "../../app/mock/preview";
import { selectDemo } from "../../frontend/service/contracts";
beforeEach(()=>vi.useFakeTimers()); afterEach(()=>{cleanup();vi.useRealTimers();});
const click=(name:string)=>fireEvent.click(screen.getByRole("button",{name}));
const fill=(name:string,value:string)=>fireEvent.change(screen.getByLabelText(name,{exact:true}),{target:{value}});
const advance=async(ms=80)=>act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
async function login(username="Demo.Owner") { click("Sign in");fill("Username",username);fill("Password","synthetic password");click("Sign in to demo");await advance(); }
const groups=()=>within(screen.getByRole("region",{name:"Synthetic groups and legacy access"}));
it("G01/G04/G06-G08 renders actual memberships/management with named cancel/confirm and one-time rotation",async()=>{
 render(<MockEntry selection={selectDemo("mock","ready")} />);await login();click("Load groups");await advance();click("Select Synthetic Friday friends");await advance();
 expect(groups().getByText(/Creator/)).toBeTruthy();click("Remove Demo.Viewer");expect(groups().getByRole("group",{name:"Group action confirmation"}).textContent).toContain("Remove Demo.Viewer?");click("Cancel confirmation");expect(groups().queryByText("Inactive")).toBeNull();
 click("Remove Demo.Viewer");click("Confirm removal");await advance();expect(groups().getByText(/Inactive/)).toBeTruthy();
 click("Rotate synthetic invite");expect(groups().getByRole("group",{name:"Group action confirmation"}).textContent).toContain("Synthetic Friday friends");click("Confirm rotation");await advance();const invite=(screen.getByLabelText("Private synthetic invite") as HTMLInputElement).value;
 click("Copy invite");expect(groups().getByText("Select the invite and copy manually.")).toBeTruthy();click("Continue to groups");expect(screen.queryByDisplayValue(invite)).toBeNull();await advance();expect(groups().getByText("Invitation generation: 2")).toBeTruthy();
});
it("G02/G03 anonymous continuation through sign-in requires explicit join and selected account has no profile impersonation",async()=>{
 render(<MockEntry selection={selectDemo("mock","ready")} />);await login();fill("New group name","Hidden synthetic group");click("Create account group");await advance();const invite=(screen.getByLabelText("Private synthetic invite") as HTMLInputElement).value;
 click("Sign out");await advance();fill("Synthetic invite",invite);click("Resolve synthetic invite");await advance();expect(groups().queryByText("Hidden synthetic group")).toBeNull();expect((groups().getByRole("button",{name:"Join pending group"}) as HTMLButtonElement).disabled).toBe(true);expect((screen.getByLabelText("Synthetic invite") as HTMLInputElement).value).toBe("");
 await login("Demo.Viewer");click("Load groups");await advance();expect(groups().getByText("Ready to join: Hidden synthetic group")).toBeTruthy();click("Join pending group");await advance();expect(groups().getByRole("heading",{name:"Selected group: Hidden synthetic group"})).toBeTruthy();expect(groups().queryByRole("button",{name:"Rotate synthetic invite"})).toBeNull();expect(groups().queryByRole("button",{name:/Use profile/})).toBeNull();
});
it("G05/L01-L04 creates a separate empty group, requires resolve, validates profile and retains internal selection",async()=>{
 render(<MockEntry selection={selectDemo("mock","ready")} />);click("Separate legacy mode");await advance();fill("New group name","Legacy own");click("Create legacy group");await advance();const invite=(screen.getByLabelText("Private synthetic invite") as HTMLInputElement).value;click("Continue to groups");await advance();expect(groups().getByText("No selected group. Legacy groups require explicit invite resolution.")).toBeTruthy();
 fill("Synthetic invite",invite);click("Resolve synthetic invite");await advance();expect(groups().getByText("No profiles yet. Create the first profile.")).toBeTruthy();expect(groups().getByText("No active legacy profile.")).toBeTruthy();fill("Legacy profile name","  Anna   Smith  ");fireEvent.change(screen.getByLabelText("Avatar color"),{target:{value:"rose"}});click("Create and select profile");await advance();expect(groups().getByText("Anna Smith")).toBeTruthy();expect(groups().getByText("A same-group legacy profile is selected.")).toBeTruthy();
 fill("Legacy profile name","anna smith");click("Create and select profile");await advance();expect(groups().getByText("That normalized name already exists in this legacy group.")).toBeTruthy();
 click("Account entry");click("Load groups");await advance();expect(groups().getByText("A same-group legacy profile is selected.")).toBeTruthy();expect(groups().queryByRole("button",{name:"Rotate synthetic invite"})).toBeNull();click("Use profile Anna Smith");await advance();
});
it("pending/failure/cancel and account navigation/reset/departure clear private invitations without late repaint",async()=>{
 render(<MockEntry selection={selectDemo("mock","slow")} />);click("Separate legacy mode");click("Cancel group request");await advance(1200);expect(groups().queryByText("Mode: Separate legacy")).toBeNull();
 fireEvent.change(screen.getByLabelText("Simulated response"),{target:{value:"unavailable"}});click("Separate legacy mode");await advance(300);expect(groups().getByText(/Synthetic accounts are unavailable/)).toBeTruthy();
 fireEvent.change(screen.getByLabelText("Simulated response"),{target:{value:"ready"}});click("Separate legacy mode");await advance();fill("New group name","Private legacy");click("Create legacy group");await advance();expect(screen.getByLabelText("Private synthetic invite")).toBeTruthy();fireEvent(window,new Event("pagehide"));expect(screen.queryByLabelText("Private synthetic invite")).toBeNull();
 click("Load groups");await advance();fill("New group name","Another legacy");click("Create legacy group");await advance();click("Register");expect(screen.queryByLabelText("Private synthetic invite")).toBeNull();click("Load groups");await advance();fill("New group name","Reset legacy");click("Create legacy group");await advance();click("Reset demo");await advance();expect(screen.queryByLabelText("Private synthetic invite")).toBeNull();
});

it("reports real signed-in and selected-group context without obsolete unavailable copy",async()=>{
 render(<MockEntry selection={selectDemo("mock","ready")} />); await login(); click("Load preview"); await advance();
 const snapshot=within(screen.getByLabelText("Synthetic context")); expect(snapshot.getByText("Synthetic account: Demo.Owner")).toBeTruthy(); expect(snapshot.getByText(/No synthetic group is selected/)).toBeTruthy(); expect(screen.queryByText(/Group actions are not available yet/)).toBeNull();
 click("Load groups"); await advance(); click("Select Synthetic Friday friends"); await advance(); click("Load preview"); await advance(); expect(screen.getByLabelText("Synthetic context").textContent).toContain("Selected synthetic account group: Synthetic Friday friends"); expect(screen.queryByText(/Group actions are not available yet/)).toBeNull();
});
