// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { handleMemory, resetHttpMemoryForTests } from "../lib/http-memory/service";
import { GET, POST } from "../app/v1/[...path]/route";

const origin="http://127.0.0.1:3000", password="Synthetic memory password";
const request=(path:string,body?:unknown,cookie?:string,method="POST")=>new Request(`${origin}/v1/${path}`,{method,headers:{...(method==="GET"?{}:{origin,"content-type":"application/json"}),...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const cookieOf=(response:Response,name:string)=>`${name}=${/[^=]+=([^;]+)/.exec(response.headers.get("set-cookie")??"")?.[1]}`;
afterEach(()=>{resetHttpMemoryForTests();delete process.env.WATCHNEXT_HTTP_MEMORY;});

it("runs account/group/legacy HTTP operations only in explicit memory mode and derives authority from cookies",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";
 expect((await handleMemory(request("context",undefined,undefined,"GET"),["context"])).status).toBe(200);
 const register=await handleMemory(request("auth/register",{username:"Memory.Owner",password,confirmation:password}),["auth","register"]);expect(register.status).toBe(200);const owner=cookieOf(register,"watchnext_account_session");expect((await register.json()).recoveryCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
 const create=await handleMemory(request("groups",{expectedContextRevision:1,name:"Memory group"},owner),["groups"]);expect(create.status).toBe(200);const created=await create.json();
 const second=await handleMemory(request("auth/register",{username:"Memory.Member",password,confirmation:password}),["auth","register"]),memberCookie=cookieOf(second,"watchnext_account_session");
 const resolve=await handleMemory(request("invitations/resolve",{invite:created.invite},memberCookie),["invitations","resolve"]);expect(resolve.status).toBe(200);
 const join=await handleMemory(request("groups/pending/join",{expectedContextRevision:1},memberCookie),["groups","pending","join"]);expect(join.status).toBe(200);expect((await join.json()).members).toHaveLength(2);
 const forbidden=await handleMemory(request("groups/current/members/remove",{expectedContextRevision:2,memberId:"none",confirmed:true},memberCookie),["groups","current","members","remove"]);expect(forbidden.status).toBe(422);
 const legacy=await handleMemory(request("legacy/groups",{name:"Legacy group"}),["legacy","groups"]),legacyCreated=await legacy.json();const access=await handleMemory(request("invitations/resolve",{invite:legacyCreated.invite}),["invitations","resolve"]);const legacyCookie=cookieOf(access,"watchnext_session");
 const profile=await handleMemory(request("legacy/groups/current/profiles",{expectedContextRevision:1,name:"Legacy Anna",color:"purple"},legacyCookie),["legacy","groups","current","profiles"]);expect(profile.status).toBe(200);expect((await profile.json()).profileId).toBeTruthy();
});

it("loses accounts, sessions and groups when its owned process-memory repository is reset",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";const registered=await handleMemory(request("auth/register",{username:"Restart.User",password,confirmation:password}),["auth","register"]),session=cookieOf(registered,"watchnext_account_session");
 resetHttpMemoryForTests();const after=await handleMemory(request("context",undefined,session,"GET"),["context"]);expect((await after.json()).account).toBeNull();
});

it("rejects non-JSON mutations and consumes a recovery proof at most once under a race",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";const registered=await handleMemory(request("auth/register",{username:"Race.User",password,confirmation:password}),["auth","register"]),value=await registered.json();
 const payload={username:"Race.User",password:"Replacement race password",confirmation:"Replacement race password",proof:value.recoveryCode};
 const [one,two]=await Promise.all([handleMemory(request("auth/recovery",payload),["auth","recovery"]),handleMemory(request("auth/recovery",payload),["auth","recovery"])]);expect([one.status,two.status].sort()).toEqual([200,422]);
 const bad=new Request(`${origin}/v1/auth/logout`,{method:"POST",headers:{origin}});expect((await handleMemory(bad,["auth","logout"])).status).toBe(422);
});

it("exercises every remaining declared identity/group/legacy operation and keeps memory mode free of SQLite",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";
 const register=await handleMemory(request("auth/register",{username:"Complete.Owner",password,confirmation:password}),["auth","register"]),first=cookieOf(register,"watchnext_account_session"),registered=await register.json();
 expect((await handleMemory(request("context",undefined,first,"GET"),["context"])).status).toBe(200); // A05
 expect((await handleMemory(request("auth/logout",{expectedContextRevision:1},first),["auth","logout"])).status).toBe(200); // A03
 const login=await handleMemory(request("auth/login",{username:"Complete.Owner",password}),["auth","login"]),signedIn=cookieOf(login,"watchnext_account_session");expect(login.status).toBe(200); // A02
 const recovered=await handleMemory(request("auth/recovery",{username:"Complete.Owner",password:"Replacement synthetic password",confirmation:"Replacement synthetic password",proof:registered.recoveryCode}),["auth","recovery"]);expect(recovered.status).toBe(200); // A04
 expect((await handleMemory(request("context",undefined,signedIn,"GET"),["context"])).status).toBe(200); // revoked cookie is anonymous
 const relogin=await handleMemory(request("auth/login",{username:"Complete.Owner",password:"Replacement synthetic password"}),["auth","login"]),owner=cookieOf(relogin,"watchnext_account_session");
 const created=await handleMemory(request("groups",{expectedContextRevision:1,name:"Complete group"},owner),["groups"]),group=await created.json();
 expect((await handleMemory(request("groups/current",undefined,owner,"GET"),["groups","current"])).status).toBe(200); // G06
 expect((await handleMemory(request("context/group-selection",{expectedContextRevision:2,groupId:group.context.groupId},owner,"PUT"),["context","group-selection"])).status).toBe(200); // G04
 expect((await handleMemory(request("context/mode",{expectedContextRevision:3,mode:"account"},owner,"PUT"),["context","mode"])).status).toBe(200); // G05
 const rotated=await handleMemory(request("groups/current/invitations/rotate",{expectedContextRevision:4,generation:1,confirmed:true},owner),["groups","current","invitations","rotate"]);expect(rotated.status).toBe(200); // G08
 const legacy=await handleMemory(request("legacy/groups",{name:"Complete legacy"}),["legacy","groups"]),legacyGroup=await legacy.json();
 const access=await handleMemory(request("invitations/resolve",{invite:legacyGroup.invite}),["invitations","resolve"]),legacyCookie=cookieOf(access,"watchnext_session");
 expect((await handleMemory(request("legacy/groups/current/profiles",undefined,legacyCookie,"GET"),["legacy","groups","current","profiles"])).status).toBe(200); // L02
 const profile=await handleMemory(request("legacy/groups/current/profiles",{expectedContextRevision:1,name:"Complete profile",color:"teal"},legacyCookie),["legacy","groups","current","profiles"]),workspace=await profile.json();
 expect((await handleMemory(request("legacy/context/profile",{expectedContextRevision:2,profileId:workspace.profileId},legacyCookie,"PUT"),["legacy","context","profile"])).status).toBe(200); // L04
 expect(readFileSync("lib/http-memory/service.ts","utf8")).not.toMatch(/node:sqlite|db\/|getDatabase/);
});

it("uses the actual Next catch-all Route Handler with isolated cookie contexts and loses authority after reset",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";const route=(path:string,body?:unknown,cookie?:string,method="POST")=>{const nextRequest=request(path,body,cookie,method);const context={params:Promise.resolve({path:path.split("/")})};return method==="GET"?GET(nextRequest,context):POST(nextRequest,context);};
 const ownerResponse=await route("auth/register",{username:"Route.Owner",password,confirmation:password}),owner=cookieOf(ownerResponse,"watchnext_account_session");expect(ownerResponse.status).toBe(200);
 const groupResponse=await route("groups",{expectedContextRevision:1,name:"Route group"},owner),group=await groupResponse.json();
 const memberResponse=await route("auth/register",{username:"Route.Member",password,confirmation:password}),member=cookieOf(memberResponse,"watchnext_account_session");
 await route("invitations/resolve",{invite:group.invite},member);const joined=await route("groups/pending/join",{expectedContextRevision:1},member);expect(joined.status).toBe(200);
 const denied=await route("groups/current/members/remove",{expectedContextRevision:2,memberId:"wrong",confirmed:true},member);expect(denied.status).toBeGreaterThanOrEqual(400);
 resetHttpMemoryForTests();const lost=await route("context",undefined,owner,"GET");expect((await lost.json()).account).toBeNull();
});

it("denies a removed member's selected-group read until a newer invitation rejoins the same member",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";
 const ownerRegistration=await handleMemory(request("auth/register",{username:"Epoch.Owner",password,confirmation:password}),["auth","register"]),owner=cookieOf(ownerRegistration,"watchnext_account_session");
 const created=await handleMemory(request("groups",{expectedContextRevision:1,name:"Epoch group"},owner),["groups"]),group=await created.json();
 const memberRegistration=await handleMemory(request("auth/register",{username:"Epoch.Member",password,confirmation:password}),["auth","register"]),member=cookieOf(memberRegistration,"watchnext_account_session");
 const intent=await handleMemory(request("invitations/resolve",{invite:group.invite},member),["invitations","resolve"]),pending=await intent.json();
 const joined=await handleMemory(request("groups/pending/join",{expectedContextRevision:pending.context.revision},member),["groups","pending","join"]),workspace=await joined.json(),memberId=workspace.members.find((entry:{name:string})=>entry.name==="Epoch.Member").id;
 const removed=await handleMemory(request("groups/current/members/remove",{expectedContextRevision:2,memberId,confirmed:true},owner),["groups","current","members","remove"]);expect(removed.status).toBe(200);
 const current=await handleMemory(request("groups/current",undefined,member,"GET"),["groups","current"]);expect(current.status).toBeGreaterThanOrEqual(400);
 const staleContext=await handleMemory(request("context",undefined,member,"GET"),["context"]),contextBody=await staleContext.json();
 expect(staleContext.status).toBe(200);expect(contextBody).toMatchObject({context:{mode:"account",groupId:null},account:{username:"Epoch.Member",memberships:[]},group:null});expect(JSON.stringify(contextBody)).not.toContain(group.context.groupId);
 const rotation=await handleMemory(request("groups/current/invitations/rotate",{expectedContextRevision:2,generation:1,confirmed:true},owner),["groups","current","invitations","rotate"]),rotated=await rotation.json();
 const rejoinIntent=await handleMemory(request("invitations/resolve",{invite:rotated.invite},member),["invitations","resolve"]),rejoinPending=await rejoinIntent.json();
 const rejoined=await handleMemory(request("groups/pending/join",{expectedContextRevision:rejoinPending.context.revision},member),["groups","pending","join"]),after=await rejoined.json();
 expect(after.members.find((entry:{name:string})=>entry.name==="Epoch.Member").id).toBe(memberId);
});
