import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { MockEntry } from "../../app/mock/preview";
import { selectDemo } from "../../frontend/service/contracts";
beforeEach(() => vi.useFakeTimers()); afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const click = (name: string) => fireEvent.click(screen.getByRole("button",{name}));
const fill = (name: string,value: string) => fireEvent.change(screen.getByLabelText(name,{exact:true}),{target:{value}});
const advance = async (ms=80) => act(async()=>{await vi.advanceTimersByTimeAsync(ms);});
function registration() { click("Register"); fill("Username","Browser.User"); fill("Password","synthetic test password"); fill("Confirm password","synthetic test password"); click("Create account"); }
it("uses real registration/context/sign-out/sign-in/recovery operations with once-only disclosure",async()=>{
 render(<MockEntry selection={selectDemo("mock","ready")} />); registration();
 expect((screen.getByRole("button",{name:"Create account"}) as HTMLButtonElement).disabled).toBe(true); await advance();
 const code = (screen.getByLabelText("One-time synthetic recovery code") as HTMLInputElement).value;
 click("Continue"); expect(screen.queryByDisplayValue(code)).toBeNull(); await advance(); expect(screen.getByRole("heading",{name:"Account: Browser.User"})).toBeTruthy();
 click("Sign out"); await advance(); expect(screen.queryByRole("heading",{name:"Account: Browser.User"})).toBeNull();
 click("Sign in"); fill("Username","browser.user"); fill("Password","synthetic test password"); click("Sign in to demo"); await advance();
 click("Recover account"); fill("Username","browser.user"); fill("Current recovery code",code); fill("New password","new synthetic password"); fill("Confirm password","new synthetic password"); click("Replace password"); await advance();
 const replacement = (screen.getByLabelText("One-time synthetic recovery code") as HTMLInputElement).value; expect(replacement).not.toBe(code);
 click("Continue"); expect(screen.queryByDisplayValue(replacement)).toBeNull(); fill("Username","browser.user"); fill("Password","new synthetic password"); click("Sign in to demo"); await advance(); expect(screen.getByRole("heading",{name:"Account: Browser.User"})).toBeTruthy();
});
it("clears secrets on completed errors/navigation and supports retry, cancel, duplicate/pending and reset",async()=>{
 render(<MockEntry selection={selectDemo("mock","slow")} />); registration(); click("Cancel account request"); await advance(1200); expect(screen.queryByLabelText("One-time synthetic recovery code")).toBeNull(); expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
 fireEvent.change(screen.getByLabelText("Simulated response"),{target:{value:"unavailable"}}); fill("Username","user"); fill("Password","synthetic test password"); fill("Confirm password","synthetic test password"); click("Create account"); await advance(300);
 expect(screen.getByText(/Synthetic accounts are unavailable/)).toBeTruthy(); expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
 fireEvent.change(screen.getByLabelText("Simulated response"),{target:{value:"ready"}}); registration(); await advance(); click("Reset demo"); await advance(); expect(screen.queryByLabelText("One-time synthetic recovery code")).toBeNull(); click("Read account context"); await advance(); expect(screen.queryByRole("heading",{name:"Account: Browser.User"})).toBeNull();
});
it("discards disclosure on departure/bfcache and provides manual copy fallback only on explicit action",async()=>{
 render(<MockEntry selection={selectDemo("mock","ready")} />); registration(); await advance();
 click("Copy code"); expect(screen.getByText(/Copy unavailable/)).toBeTruthy();
 fireEvent(window,new Event("pagehide")); fireEvent(window,new Event("pageshow")); expect(screen.queryByLabelText("One-time synthetic recovery code")).toBeNull();
 click("Account entry"); expect(screen.queryByLabelText("One-time synthetic recovery code")).toBeNull();
});
it("keeps seeded memberships read-only and clears proof on leaving recovery",async()=>{
 render(<MockEntry selection={selectDemo("mock","ready")} />); click("Sign in"); fill("Username","Demo.Viewer"); fill("Password","synthetic password"); click("Sign in to demo"); await advance(); expect(screen.getByText("Synthetic Friday friends")).toBeTruthy();
 expect(within(screen.getByRole("navigation",{name:"Preview account views"})).queryByRole("button",{name:/group/i})).toBeNull();
 click("Recover account"); fill("Current recovery code","private synthetic input"); click("Sign in"); expect(screen.queryByDisplayValue("private synthetic input")).toBeNull(); expect(screen.getByLabelText("Synthetic demo notice")).toBeTruthy();
});

it("#61 states plainly on the sign-in surface that the Demo.Owner / Demo.Viewer fixture credentials are a synthetic demo, not security evidence",()=>{
 render(<MockEntry selection={selectDemo("mock","ready")} />);
 const panel=within(screen.getByRole("region",{name:"Synthetic accounts"}));
 expect(panel.getByText(/Demo\.Owner/)).toBeTruthy(); expect(panel.getByText(/Demo\.Viewer \/ synthetic password/)).toBeTruthy();
 expect(panel.getByText(/synthetic demo, not security evidence/)).toBeTruthy();
});
