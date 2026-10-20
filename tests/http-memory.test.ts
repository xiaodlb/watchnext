// @vitest-environment node
import { afterEach, expect, it } from "vitest";
import { handleMemory, resetHttpMemoryForTests } from "../lib/http-memory/service";

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
