// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { createMockService } from "../../frontend/mock/service";
import type { FrontendService, ServiceResult, ContextIdentity, AvatarColor } from "../../frontend/service/contracts";
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers());
async function done<T>(p: Promise<T>, ms = 80) { await vi.advanceTimersByTimeAsync(ms); return p; }
function ok<T>(r: ServiceResult<T>) { if (r.kind !== "success") throw Error("Expected synthetic success"); return r; }
async function context(s: FrontendService) { return ok(await done(s.context.read())).context; }
async function login(s: FrontendService, username = "Demo.Owner") { return ok(await done(s.accounts.signIn({username,password:"synthetic password"},await context(s)))).context; }
it("G01/G04 creates atomic creator membership, exact bounded names, duplicate names and own-only selection",async()=>{
 const s=createMockService(); expect((await done(s.groups.create("Anonymous",await context(s)))).kind).toBe("failure"); await login(s);
 for(const name of [" ","x".repeat(81),"bad\0name"]) expect((await done(s.groups.create(name,await context(s)))).kind).toBe("failure");
 const a=ok(await done(s.groups.create("  My  GROUP  ",await context(s)))); const read=ok(await done(s.groups.read())); expect(read.value.selected?.name).toBe("My  GROUP"); expect(read.value.canManage).toBe(true); expect(read.value.members).toHaveLength(1); expect(read.value.members[0]).toMatchObject({owner:true,you:true,active:true}); const first=read.value.selected!;
 expect(JSON.stringify(read)).not.toContain(a.value.invite);
 ok(await done(s.groups.create("My  GROUP",await context(s)))); const b=ok(await done(s.groups.read())); expect(b.value.selected?.id).not.toBe(first.id);
 const away=await context(s); ok(await done(s.groups.select(first.id,away))); ok(await done(s.groups.select(b.value.selected!.id,await context(s)))); expect((await s.groups.select(first.id,away)).kind).toBe("stale");
 expect((await done(s.groups.select("weekend",await context(s)))).kind).toBe("failure");
});
it("G02/G03 keeps anonymous invitation token-free through registration and requires explicit join",async()=>{
 const s=createMockService(); await login(s); const invite=ok(await done(s.groups.create("Private hidden group",await context(s)))).value.invite;
 ok(await done(s.accounts.signOut(await context(s)))); const pending=ok(await done(s.groups.resolve(invite,await context(s)))); expect(pending.value.pending).toEqual({needsAccount:true,groupName:null}); expect(JSON.stringify(pending)).not.toContain("Private hidden group"); expect(JSON.stringify(pending)).not.toContain(invite);
 expect((await done(s.groups.join(pending.context))).kind).toBe("failure");
 const registered=ok(await done(s.accounts.register({username:"New.Member",password:"synthetic password",confirmation:"synthetic password"},await context(s))));
 const before=ok(await done(s.groups.read())); expect(before.value.selected).toBeNull(); expect(before.value.pending?.groupName).toBe("Private hidden group");
 const joined=ok(await done(s.groups.join(registered.context))); expect(joined.value.members).toHaveLength(2); const id=joined.value.selected!.id;
 expect((await s.groups.join(registered.context)).kind).toBe("stale"); expect((await done(s.groups.join(joined.context))).kind).toBe("failure");
 ok(await done(s.groups.resolve(invite,await context(s)))); const repeated=ok(await done(s.groups.join(await context(s)))); expect(repeated.value.members).toHaveLength(2); expect(repeated.value.selected?.id).toBe(id);
});
it("G02/G03 expires intents at exactly 600 seconds without replacing previous group or granting context changes",async()=>{
 let time=1000; const s=createMockService({now:()=>time}); await login(s,"Demo.Viewer"); ok(await done(s.groups.select("weekend",await context(s))));
 const before=ok(await done(s.groups.read())); ok(await done(s.groups.resolve("SYNTHETIC-FRIDAY-INITIAL",await context(s)))); time+=600000;
 expect((await done(s.groups.join(await context(s)))).kind).toBe("failure"); expect(ok(await done(s.groups.read())).value.selected).toEqual(before.value.selected);
 expect((await done(s.groups.resolve("unknown",await context(s)))).kind).toBe("failure");
 ok(await done(s.groups.resolve("SYNTHETIC-FRIDAY-INITIAL",await context(s)))); const captured=await context(s); ok(await done(s.groups.select("weekend",captured))); expect((await s.groups.join(captured)).kind).toBe("stale"); expect((await done(s.groups.join(await context(s)))).kind).toBe("failure");
});
it("G06/G07/G08 enforces owner/self/foreign checks, stable references, cutoff, epochs and no revived old requests",async()=>{
 const s=createMockService(); await login(s); const selected=ok(await done(s.groups.select("friday",await context(s)))); const viewer=selected.value.members.find(m=>!m.owner)!; const refs=viewer.references; const old=selected.context;
 expect((await done(s.groups.remove("friday-owner",1,old))).kind).toBe("failure"); expect((await done(s.groups.remove("weekend-viewer",1,old))).kind).toBe("failure");
 const removed=ok(await done(s.groups.remove(viewer.id,viewer.generation,old))); const inactive=removed.value.members.find(m=>m.id===viewer.id)!; expect(inactive.active).toBe(false); expect(inactive.references).toBe(refs); expect(inactive.removedAtGeneration).toBe(1);
 const repeated=ok(await done(s.groups.remove(inactive.id,inactive.generation,removed.context))); expect(repeated.value.members.find(m=>m.id===viewer.id)?.removedAtGeneration).toBe(1);
 await login(s,"Demo.Viewer"); expect((await done(s.groups.select("friday",await context(s)))).kind).toBe("failure"); ok(await done(s.groups.resolve("SYNTHETIC-FRIDAY-INITIAL",await context(s)))); expect((await done(s.groups.join(await context(s)))).kind).toBe("failure");
 await login(s); ok(await done(s.groups.select("friday",await context(s)))); const rotation=ok(await done(s.groups.rotate(1,await context(s)))); expect((await s.groups.rotate(1,old)).kind).toBe("stale"); expect((await done(s.groups.rotate(1,rotation.context))).kind).toBe("failure");
 expect((await done(s.groups.resolve("SYNTHETIC-FRIDAY-INITIAL",await context(s)))).kind).toBe("failure"); await login(s,"Demo.Viewer"); ok(await done(s.groups.resolve(rotation.value.invite,await context(s)))); const rejoined=ok(await done(s.groups.join(await context(s)))); const active=rejoined.value.members.find(m=>m.id===viewer.id)!; expect(active.id).toBe(viewer.id); expect(active.references).toBe(refs); expect(active.active).toBe(true); expect(active.generation).toBeGreaterThan(inactive.generation);
 expect(rejoined.value.canManage).toBe(false); expect((await done(s.groups.rotate(2,rejoined.context))).kind).toBe("failure"); expect((await done(s.groups.remove("friday-owner",1,rejoined.context))).kind).toBe("failure");
 await login(s); ok(await done(s.groups.select("friday",await context(s)))); expect((await done(s.groups.remove(viewer.id,viewer.generation,await context(s)))).kind).toBe("failure"); expect((await s.groups.remove(viewer.id,viewer.generation,old)).kind).toBe("stale");
});
it("G08 invalidates pending generation, keeps active members, and competing rotation has one commit",async()=>{
 const s=createMockService(); await login(s); ok(await done(s.groups.select("friday",await context(s)))); const before=ok(await done(s.groups.read())); ok(await done(s.groups.resolve("SYNTHETIC-FRIDAY-INITIAL",await context(s)))); const current=await context(s);
 const a=s.groups.rotate(1,current), b=s.groups.rotate(1,current); await vi.advanceTimersByTimeAsync(80); expect((await a).kind).toBe("success"); expect((await b).kind).toBe("stale"); const after=ok(await done(s.groups.read())); expect(after.value.members).toEqual(before.value.members); expect(after.value.pending).toBeNull(); expect(after.value.selected?.generation).toBe(2);
});
it("G05/L01-L04 separates legacy creation/resolution, normalizes profiles, validates palette/foreign IDs and preserves internal selection",async()=>{
 const s=createMockService(); const first=ok(await done(s.groups.createLegacy("Legacy new",await context(s)))); const empty=ok(await done(s.groups.read())); expect(empty.value.selected).toBeNull(); expect(empty.value.profileId).toBeNull();
 expect((await done(s.groups.createProfile("No access","blue",empty.context))).kind).toBe("failure"); const resolved=ok(await done(s.groups.resolve(first.value.invite,empty.context))); expect(resolved.value.members).toHaveLength(0); expect(resolved.value.canManage).toBe(false);
 for(const [name,color] of [[" ","blue"],["bad\0name","blue"],["x".repeat(41),"blue"],["valid","red"]]) expect((await done(s.groups.createProfile(name,color as AvatarColor,await context(s)))).kind).toBe("failure");
 const added=ok(await done(s.groups.createProfile("  Ａnna   Smith  ","rose",await context(s)))); expect(added.value.members[0].name).toBe("Anna Smith"); expect(added.value.members[0].color).toBe("rose"); const profile=added.value.profileId!;
 expect((await done(s.groups.createProfile("anna smith","blue",added.context))).kind).toBe("failure"); expect((await done(s.groups.selectProfile("legacy-sample-profile",added.context))).kind).toBe("failure"); expect((await done(s.groups.rotate(1,added.context))).kind).toBe("failure");
 expect(ok(await done(s.groups.read())).value.profileId).toBe(profile); ok(await done(s.groups.selectProfile(profile,await context(s))));
 await login(s,"Demo.Viewer"); expect(ok(await done(s.groups.read())).value.mode).toBe("account"); expect((await done(s.groups.selectProfile(profile,await context(s)))).kind).toBe("failure");
 ok(await done(s.groups.mode("legacy",await context(s)))); const again=ok(await done(s.groups.resolve(first.value.invite,await context(s)))); expect(again.value.members).toHaveLength(1); expect(again.value.members[0].accountId).toBeNull();
});
it("all group mutations cancel/fail/stale without state changes and reset/other instances remain isolated",async()=>{
 const s=createMockService(), other=createMockService(); await login(s); const before=ok(await done(s.groups.read())); const captured=before.context;
 const stopped=new AbortController(), create=s.groups.create("Canceled",captured,{scenario:"slow",signal:stopped.signal}); stopped.abort(); expect((await create).kind).toBe("cancelled");
 expect((await done(s.groups.create("Unavailable",captured,{scenario:"unavailable"}),300)).kind).toBe("failure"); expect(ok(await done(s.groups.read())).value).toEqual(before.value);
 const pending=s.groups.create("Stale",captured,{scenario:"slow"}); ok(await done(s.context.reset(captured))); await vi.advanceTimersByTimeAsync(1200); expect((await pending).kind).toBe("stale"); expect(ok(await done(s.groups.read())).value.memberships).toEqual([]); expect(ok(await done(other.groups.read())).value.memberships).toEqual([]); expect(vi.getTimerCount()).toBe(0);
});
