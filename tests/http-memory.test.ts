// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { handleMemory, resetHttpMemoryForTests, setHttpMemoryTransportsForTests } from "../lib/http-memory/service";
import { GET, POST } from "../app/v1/[...path]/route";

const origin="http://127.0.0.1:3000", password="Synthetic memory password";
const request=(path:string,body?:unknown,cookie?:string,method="POST")=>new Request(`${origin}/v1/${path}`,{method,headers:{...(method==="GET"?{}:{origin,"content-type":"application/json"}),...(cookie?{cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
const cookieOf=(response:Response,name:string)=>`${name}=${/[^=]+=([^;]+)/.exec(response.headers.get("set-cookie")??"")?.[1]}`;
afterEach(()=>{resetHttpMemoryForTests();delete process.env.WATCHNEXT_HTTP_MEMORY;delete process.env.YOUTUBE_API_KEY;delete process.env.KINOPOISK_UNOFFICIAL_API_KEY;});

it("runs account/group/legacy HTTP operations only in explicit memory mode and derives authority from cookies",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";
 process.env.YOUTUBE_API_KEY="synthetic-test-key";
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

it("runs the shared memory library over live account cookies, preserving one title ID through contribution, archive and restore",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";
 const ownerRegistration=await handleMemory(request("auth/register",{username:"Library.Owner",password,confirmation:password}),["auth","register"]),owner=cookieOf(ownerRegistration,"watchnext_account_session");
 const groupResponse=await handleMemory(request("groups",{expectedContextRevision:1,name:"Library group"},owner),["groups"]),group=await groupResponse.json();
 const memberRegistration=await handleMemory(request("auth/register",{username:"Library.Member",password,confirmation:password}),["auth","register"]),member=cookieOf(memberRegistration,"watchnext_account_session");
 await handleMemory(request("invitations/resolve",{invite:group.invite},member),["invitations","resolve"]);await handleMemory(request("groups/pending/join",{expectedContextRevision:1},member),["groups","pending","join"]);
 const title={expectedContextRevision:2,title:"Shared funny film",contentType:"movie",durationSeconds:1500,numberingStyle:"none",genres:["Comedy"],moods:["funny"],watchUrl:"https://example.test/watch",sourceUrl:null,coverUrl:null};
 const saved=await handleMemory(request("library/manual",title,owner),["library","manual"]);expect(saved.status).toBe(200);const first=await saved.json();expect(first.status).toBe("created");
 const contribution=await handleMemory(request("library/manual",{...title,expectedContextRevision:2},member),["library","manual"]),contributionBody=await contribution.json();expect(contribution.status).toBe(200);expect(contributionBody.status).toBe("contributed");
 const mine=await handleMemory(request("library?filter=mine",undefined,member,"GET"),["library"]);expect((await mine.json()).items).toHaveLength(1);
 const missingConfirmation=await handleMemory(request(`library/${first.title.id}/contribution/remove`,{expectedContextRevision:2,revision:contributionBody.title.revision},owner),["library",first.title.id,"contribution","remove"]);expect(missingConfirmation.status).toBeGreaterThanOrEqual(400);
 const staleRemoval=await handleMemory(request(`library/${first.title.id}/contribution/remove`,{expectedContextRevision:2,revision:contributionBody.title.revision-1,confirmed:true},owner),["library",first.title.id,"contribution","remove"]);expect(staleRemoval.status).toBeGreaterThanOrEqual(400);
 const removed=await handleMemory(request(`library/${first.title.id}/contribution/remove`,{expectedContextRevision:2,revision:contributionBody.title.revision,confirmed:true},owner),["library",first.title.id,"contribution","remove"]),removedBody=await removed.json();expect(removedBody.status).toBe("removed");
 const archived=await handleMemory(request(`library/${first.title.id}/contribution/remove`,{expectedContextRevision:2,revision:removedBody.title.revision,confirmed:true},member),["library",first.title.id,"contribution","remove"]),archivedBody=await archived.json();expect(archivedBody.status).toBe("archived");
 const missingRevision=await handleMemory(request(`library/archive/${first.title.id}/restore`,{expectedContextRevision:2},owner),["library","archive",first.title.id,"restore"]);expect(missingRevision.status).toBeGreaterThanOrEqual(400);
 const staleRestore=await handleMemory(request(`library/archive/${first.title.id}/restore`,{expectedContextRevision:2,revision:archivedBody.title.revision-1},owner),["library","archive",first.title.id,"restore"]);expect(staleRestore.status).toBeGreaterThanOrEqual(400);
 const restored=await handleMemory(request(`library/archive/${first.title.id}/restore`,{expectedContextRevision:2,revision:archivedBody.title.revision},owner),["library","archive",first.title.id,"restore"]);const restoredBody=await restored.json();expect(restoredBody.status).toBe("restored");expect(restoredBody.title.id).toBe(first.title.id);
 const foreign=await handleMemory(request(`library/${first.title.id}`,undefined,undefined,"GET"),["library",first.title.id]);expect(foreign.status).toBeGreaterThanOrEqual(400);
});

it("uses injected outbound-only provider fixtures for candidate review, then keeps the reviewed provider title in the real memory library",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";
 process.env.YOUTUBE_API_KEY="synthetic-test-key";
 const youtubeTransport:typeof fetch=async input=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(url.pathname.endsWith("/search"))return Response.json({items:[{id:{kind:"youtube#video",videoId:"AbCdEf12345"}}]});return Response.json({items:[{id:"AbCdEf12345",snippet:{title:"Fixture clip",channelTitle:"Fixture channel",liveBroadcastContent:"none",thumbnails:{high:{url:"https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg"}}},contentDetails:{duration:"PT1M30S"}}]});};
 setHttpMemoryTransportsForTests({youtube:youtubeTransport,kinopoisk_unofficial:async()=>new Response("{}",{status:401})});
 const registered=await handleMemory(request("auth/register",{username:"Provider.Owner",password,confirmation:password}),["auth","register"]),owner=cookieOf(registered,"watchnext_account_session");
 await handleMemory(request("groups",{expectedContextRevision:1,name:"Provider group"},owner),["groups"]);
 const search=await handleMemory(request("metadata/search",{expectedContextRevision:2,source:"youtube",kind:"title",query:"fixture"},owner),["metadata","search"]);expect(search.status).toBe(200);const page=await search.json();expect(page.candidates).toHaveLength(1);
 const selected=await handleMemory(request(`metadata/pages/${page.handle}/candidates/AbCdEf12345`,{expectedContextRevision:2},owner),["metadata","pages",page.handle,"candidates","AbCdEf12345"]);expect(selected.status).toBe(200);const review=await selected.json();
 const saved=await handleMemory(request(`metadata/reviews/${review.handle}/save`,{expectedContextRevision:2,moods:["funny"],numberingStyle:"none"},owner),["metadata","reviews",review.handle,"save"]);expect(saved.status).toBe(200);const body=await saved.json();expect(body.status).toBe("created");
 const replay=await handleMemory(request(`metadata/reviews/${review.handle}/save`,{expectedContextRevision:2,moods:["funny"],numberingStyle:"none"},owner),["metadata","reviews",review.handle,"save"]);expect(replay.status).toBeGreaterThanOrEqual(400);
 const listed=await handleMemory(request("library",undefined,owner,"GET"),["library"]);expect((await listed.json()).items[0]).toMatchObject({id:body.title.id,title:"Fixture clip",contentType:"youtube"});
});

it("covers every library and metadata HTTP operation with adapter transports, handles and rollback",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";process.env.YOUTUBE_API_KEY="synthetic-youtube-key";process.env.KINOPOISK_UNOFFICIAL_API_KEY="synthetic-kinopoisk-key";
 const calls:string[]=[];
 const youtube:typeof fetch=async input=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);calls.push(url.href);const page=url.searchParams.get("pageToken");if(url.pathname.endsWith("/search"))return Response.json({items:[{id:{kind:"youtube#video",videoId:page?"ZyXwVu98765":"AbCdEf12345"}}],...(page?{prevPageToken:"first"}:{nextPageToken:"next"})});const id=url.searchParams.get("id")!;return Response.json({items:[{id,snippet:{title:id==="AbCdEf12345"?"Adapter video":"Second adapter video",channelTitle:"Adapter channel",liveBroadcastContent:"none",thumbnails:{high:{url:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}}},contentDetails:{duration:"PT2M"}}]});};
 const kinopoisk:typeof fetch=async input=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);calls.push(url.href);if(url.pathname.endsWith("/424242"))return Response.json({kinopoiskId:424242,nameRu:"Adapter film",year:2024,type:"FILM",filmLength:91,genres:[{genre:"Comedy"}],posterUrl:"https://kinopoiskapiunofficial.tech/images/posters/kp/424242.jpg",webUrl:"https://www.kinopoisk.ru/film/424242/"});return Response.json({items:[{kinopoiskId:424242,nameRu:"Adapter film",year:2024,type:"FILM",genres:[{genre:"Comedy"}],posterUrlPreview:"https://kinopoiskapiunofficial.tech/images/posters/kp/424242.jpg",webUrl:"https://www.kinopoisk.ru/film/424242/"}],totalPages:1});};
 setHttpMemoryTransportsForTests({youtube,kinopoisk_unofficial:kinopoisk});
 const ownerRegistration=await handleMemory(request("auth/register",{username:"Coverage.Owner",password,confirmation:password}),["auth","register"]),owner=cookieOf(ownerRegistration,"watchnext_account_session");
 const groupResponse=await handleMemory(request("groups",{expectedContextRevision:1,name:"Coverage group"},owner),["groups"]),group=await groupResponse.json() as any;
 const memberRegistration=await handleMemory(request("auth/register",{username:"Coverage.Member",password,confirmation:password}),["auth","register"]),member=cookieOf(memberRegistration,"watchnext_account_session");
 const pending=await handleMemory(request("invitations/resolve",{invite:group.invite},member),["invitations","resolve"]),pendingBody=await pending.json() as any;
 expect((await handleMemory(request("groups/pending/join",{expectedContextRevision:pendingBody.context.revision},member),["groups","pending","join"])).status).toBe(200);
 const draft={expectedContextRevision:2,title:"HTTP coverage film",contentType:"movie",durationSeconds:1200,numberingStyle:"none",genres:["Comedy"],moods:["funny"],watchUrl:"https://example.test/watch",sourceUrl:null,coverUrl:null};
 const manual=await handleMemory(request("library/manual",draft,owner),["library","manual"]),created=await manual.json() as any;expect(created.status).toBe("created");const id=created.title.id as string;
 const all=await handleMemory(request("library?filter=all",undefined,owner,"GET"),["library"]),allBody=await all.json() as any;expect(allBody.items.map((item:any)=>item.id)).toContain(id); // W01
 const mine=await handleMemory(request("library?filter=mine",undefined,owner,"GET"),["library"]),mineBody=await mine.json() as any;expect(mineBody.items.map((item:any)=>item.id)).toContain(id);
 const detail=await handleMemory(request(`library/${id}`,undefined,owner,"GET"),["library",id]),detailBody=await detail.json() as any;expect(detailBody.canEdit).toBe(true); // W03
 const editDraft=await handleMemory(request(`library/${id}/edit`,undefined,owner,"GET"),["library",id,"edit"]),editBody=await editDraft.json() as any;expect(editBody.draft.title).toBe(draft.title); // W06 read
 const confirmation=await handleMemory(request(`library/${id}/edit`,{...draft,title:"HTTP corrected film",revision:detailBody.revision},owner,"PATCH"),["library",id,"edit"]),confirmationBody=await confirmation.json() as any;expect(confirmationBody.status).toBe("confirmation");
 const corrected=await handleMemory(request(`library/${id}/edit`,{...draft,title:"HTTP corrected film",revision:detailBody.revision,identityChangeConfirmed:true},owner,"PATCH"),["library",id,"edit"]),correctedBody=await corrected.json() as any;expect(correctedBody.title.title).toBe("HTTP corrected film"); // W06 write
 const badEdit=await handleMemory(request(`library/${id}/edit`,{...draft,title:"",revision:correctedBody.title.revision,identityChangeConfirmed:true},owner,"PATCH"),["library",id,"edit"]);expect(badEdit.status).toBeGreaterThanOrEqual(400);const unchanged=await handleMemory(request(`library/${id}`,undefined,owner,"GET"),["library",id]),unchangedBody=await unchanged.json() as any;expect(unchangedBody.title).toBe("HTTP corrected film"); // failed update is atomic
 const contribution=await handleMemory(request("library/manual",{...draft,title:"HTTP corrected film",expectedContextRevision:2},member),["library","manual"]),contributionBody=await contribution.json() as any;expect(contributionBody.status).toBe("contributed");
 const missingRemovalConfirmation=await handleMemory(request(`library/${id}/contribution/remove`,{expectedContextRevision:2,revision:contributionBody.title.revision},owner),["library",id,"contribution","remove"]);expect(missingRemovalConfirmation.status).toBeGreaterThanOrEqual(400);
 const staleRemoval=await handleMemory(request(`library/${id}/contribution/remove`,{expectedContextRevision:2,revision:contributionBody.title.revision-1,confirmed:true},owner),["library",id,"contribution","remove"]);expect(staleRemoval.status).toBeGreaterThanOrEqual(400);
 const ownerRemoval=await handleMemory(request(`library/${id}/contribution/remove`,{expectedContextRevision:2,revision:contributionBody.title.revision,confirmed:true},owner),["library",id,"contribution","remove"]),ownerRemovalBody=await ownerRemoval.json() as any;expect(ownerRemoval.status).toBe(200); // W07 nonfinal
 const archived=await handleMemory(request(`library/${id}/contribution/remove`,{expectedContextRevision:2,revision:ownerRemovalBody.title.revision,confirmed:true},member),["library",id,"contribution","remove"]),archivedBody=await archived.json() as any;expect(archivedBody.status).toBe("archived");
 const archive=await handleMemory(request("library/archive",undefined,member,"GET"),["library","archive"]),archiveBody=await archive.json() as any;expect(archiveBody.items.map((item:any)=>item.id)).toContain(id); // W02
 const conflict=await handleMemory(request("library/manual",{...draft,title:"HTTP corrected film",expectedContextRevision:2},owner),["library","manual"]),conflictBody=await conflict.json() as any;expect(conflictBody.status).toBe("confirmation"); // W05
 const staleConfirmation=await handleMemory(request(`library/confirmations/${conflictBody.handle}/confirm`,{expectedContextRevision:2,confirmed:false},owner),["library","confirmations",conflictBody.handle,"confirm"]);expect(staleConfirmation.status).toBeGreaterThanOrEqual(400);
 const confirmed=await handleMemory(request(`library/confirmations/${conflictBody.handle}/confirm`,{expectedContextRevision:2,confirmed:true},owner),["library","confirmations",conflictBody.handle,"confirm"]),confirmedBody=await confirmed.json() as any;expect(confirmedBody.status).toBe("restored");
 const reArchived=await handleMemory(request(`library/${id}/contribution/remove`,{expectedContextRevision:2,revision:confirmedBody.title.revision,confirmed:true},owner),["library",id,"contribution","remove"]),reArchivedBody=await reArchived.json() as any;expect(reArchived.status).toBe(200);
 const missingRestoreRevision=await handleMemory(request(`library/archive/${id}/restore`,{expectedContextRevision:2},owner),["library","archive",id,"restore"]);expect(missingRestoreRevision.status).toBeGreaterThanOrEqual(400);
 const staleRestore=await handleMemory(request(`library/archive/${id}/restore`,{expectedContextRevision:2,revision:reArchivedBody.title.revision-1},owner),["library","archive",id,"restore"]);expect(staleRestore.status).toBeGreaterThanOrEqual(400);
 const restored=await handleMemory(request(`library/archive/${id}/restore`,{expectedContextRevision:2,revision:reArchivedBody.title.revision},owner),["library","archive",id,"restore"]),restoredBody=await restored.json() as any;expect(restoredBody.title.id).toBe(id); // W08

 const youtubeSearch=await handleMemory(request("metadata/search",{expectedContextRevision:2,source:"youtube",kind:"title",query:"adapter"},owner),["metadata","search"]),youtubePage=await youtubeSearch.json() as any;expect(youtubePage.next).toBe(true); // M01 through real transport/adapter
 const foreignPage=await handleMemory(request(`metadata/pages/${youtubePage.handle}`,{expectedContextRevision:2,direction:"next"},member),["metadata","pages",youtubePage.handle]);expect(foreignPage.status).toBeGreaterThanOrEqual(400);
 const pageTwo=await handleMemory(request(`metadata/pages/${youtubePage.handle}`,{expectedContextRevision:2,direction:"next"},owner),["metadata","pages",youtubePage.handle]),pageTwoBody=await pageTwo.json() as any;expect(pageTwoBody.page).toBe(2); // M02
 const malformedPage=await handleMemory(request("metadata/pages/not-a-handle",{expectedContextRevision:2,direction:"next"},owner),["metadata","pages","not-a-handle"]);expect(malformedPage.status).toBeGreaterThanOrEqual(400);
 const selected=await handleMemory(request(`metadata/pages/${pageTwoBody.handle}/candidates/ZyXwVu98765`,{expectedContextRevision:2},owner),["metadata","pages",pageTwoBody.handle,"candidates","ZyXwVu98765"]),review=await selected.json() as any;expect(review.draft.title).toBe("Second adapter video"); // M03
 const invalidSave=await handleMemory(request(`metadata/reviews/${review.handle}/save`,{expectedContextRevision:2,moods:[],numberingStyle:"none"},owner),["metadata","reviews",review.handle,"save"]);expect(invalidSave.status).toBeGreaterThanOrEqual(400);
 const stillAvailable=await handleMemory(request(`metadata/reviews/${review.handle}/save`,{expectedContextRevision:2,moods:["funny"],numberingStyle:"none"},owner),["metadata","reviews",review.handle,"save"]),providerSaved=await stillAvailable.json() as any;expect(providerSaved.status).toBe("created"); // M04 rollback then save
 expect((await handleMemory(request(`metadata/reviews/${review.handle}/save`,{expectedContextRevision:2,moods:["funny"],numberingStyle:"none"},owner),["metadata","reviews",review.handle,"save"])).status).toBeGreaterThanOrEqual(400); // replay
 const refresh=await handleMemory(request(`library/${providerSaved.title.id}/metadata/refresh`,{expectedContextRevision:2},owner),["library",providerSaved.title.id,"metadata","refresh"]);expect(refresh.status).toBe(200); // M05
 const kinoSearch=await handleMemory(request("metadata/search",{expectedContextRevision:2,source:"kinopoisk",kind:"title",query:"adapter"},owner),["metadata","search"]),kinoPage=await kinoSearch.json() as any;expect(kinoPage.candidates[0].identity.externalId).toBe("424242");
 const kinoReview=await handleMemory(request(`metadata/pages/${kinoPage.handle}/candidates/424242`,{expectedContextRevision:2},owner),["metadata","pages",kinoPage.handle,"candidates","424242"]),kinoReviewBody=await kinoReview.json() as any;expect(kinoReviewBody.draft.duration.seconds).toBe(5460);
 expect(calls.some(value=>value.includes("googleapis.com/youtube/v3/search"))).toBe(true);expect(calls.some(value=>value.includes("kinopoiskapiunofficial.tech/api/v2.2/films"))).toBe(true);
});

it("expires imported provider fields, while preserving a newer manual correction",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";process.env.YOUTUBE_API_KEY="synthetic-test-key";const clock=vi.spyOn(Date,"now").mockReturnValue(1_800_000_000_000);
 try {
  const transport:typeof fetch=async input=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);const id=url.searchParams.get("id")??(url.searchParams.get("q")==="expiry second"?"ZyXwVu98765":"AbCdEf12345");if(url.pathname.endsWith("/search"))return Response.json({items:[{id:{kind:"youtube#video",videoId:id}}]});return Response.json({items:[{id,snippet:{title:id==="AbCdEf12345"?"Expiring provider video":"Untouched provider video",channelTitle:"Adapter",liveBroadcastContent:"none",thumbnails:{high:{url:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`}}},contentDetails:{duration:"PT2M"}}]});};setHttpMemoryTransportsForTests({youtube:transport});
  const registration=await handleMemory(request("auth/register",{username:"Expiry.Owner",password,confirmation:password}),["auth","register"]),owner=cookieOf(registration,"watchnext_account_session");const created=await handleMemory(request("groups",{expectedContextRevision:1,name:"Expiry group"},owner),["groups"]),createdBody=await created.json() as any;
  const search=await handleMemory(request("metadata/search",{expectedContextRevision:2,source:"youtube",kind:"title",query:"expiry"},owner),["metadata","search"]),page=await search.json() as any;
  const selected=await handleMemory(request(`metadata/pages/${page.handle}/candidates/AbCdEf12345`,{expectedContextRevision:2},owner),["metadata","pages",page.handle,"candidates","AbCdEf12345"]),review=await selected.json() as any;
  const saved=await handleMemory(request(`metadata/reviews/${review.handle}/save`,{expectedContextRevision:2,moods:["funny"],numberingStyle:"none"},owner),["metadata","reviews",review.handle,"save"]),savedBody=await saved.json() as any;
  const current=await handleMemory(request(`library/${savedBody.title.id}`,undefined,owner,"GET"),["library",savedBody.title.id]),currentBody=await current.json() as any;
  const correctionInput={expectedContextRevision:2,revision:currentBody.revision,title:"Manual correction survives",contentType:"youtube",durationSeconds:120,numberingStyle:"none",genres:["Comedy"],moods:["funny"],watchUrl:"https://www.youtube.com/watch?v=AbCdEf12345",sourceUrl:"https://www.youtube.com/watch?v=AbCdEf12345",coverUrl:"https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg",identityChangeConfirmed:true};
  const correction=await handleMemory(request(`library/${savedBody.title.id}/edit`,correctionInput,owner,"PATCH"),["library",savedBody.title.id,"edit"]),correctionBody=await correction.json() as any;expect(correctionBody.status).toBe("saved");
  const untouchedSearch=await handleMemory(request("metadata/search",{expectedContextRevision:2,source:"youtube",kind:"title",query:"expiry second"},owner),["metadata","search"]),untouchedPage=await untouchedSearch.json() as any;expect(untouchedSearch.status).toBe(200);const untouchedSelected=await handleMemory(request(`metadata/pages/${untouchedPage.handle}/candidates/ZyXwVu98765`,{expectedContextRevision:2},owner),["metadata","pages",untouchedPage.handle,"candidates","ZyXwVu98765"]),untouchedReview=await untouchedSelected.json() as any;expect(untouchedSelected.status).toBe(200);const untouchedSave=await handleMemory(request(`metadata/reviews/${untouchedReview.handle}/save`,{expectedContextRevision:2,moods:["funny"],numberingStyle:"none"},owner),["metadata","reviews",untouchedReview.handle,"save"]),untouchedBody=await untouchedSave.json() as any;expect(untouchedSave.status).toBe(200);expect(untouchedBody.status).toBe("created");
  clock.mockReturnValue(1_800_000_000_000+31*86400000);const relogin=await handleMemory(request("auth/login",{username:"Expiry.Owner",password}),["auth","login"]),freshOwner=cookieOf(relogin,"watchnext_account_session");const reselection=await handleMemory(request("context/group-selection",{expectedContextRevision:1,groupId:createdBody.context.groupId},freshOwner,"PUT"),["context","group-selection"]);expect(reselection.status).toBe(200);const after=await handleMemory(request(`library/${savedBody.title.id}`,undefined,freshOwner,"GET"),["library",savedBody.title.id]),afterBody=await after.json() as any;expect(afterBody.title).toBe("Manual correction survives");expect(afterBody.durationSeconds).toBe(120);const expired=await handleMemory(request(`library/${untouchedBody.title.id}`,undefined,freshOwner,"GET"),["library",untouchedBody.title.id]),expiredBody=await expired.json() as any;expect(expiredBody.title).toBeNull();expect(expiredBody.durationSeconds).toBeNull();expect(expiredBody.coverUrl).toBeNull();
 } finally { clock.mockRestore(); }
});

it("rejects expired page and review handles and discards a delayed refresh after a correction",async()=>{
 process.env.WATCHNEXT_HTTP_MEMORY="1";process.env.YOUTUBE_API_KEY="synthetic-test-key";const clock=vi.spyOn(Date,"now").mockReturnValue(1_810_000_000_000);let hold=false,release:()=>void=()=>{},started:()=>void=()=>{};const releaseGate=new Promise<void>(resolve=>{release=resolve}),startedGate=new Promise<void>(resolve=>{started=resolve});
 try {
  const transport:typeof fetch=async input=>{const url=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(url.pathname.endsWith("/search"))return Response.json({items:[{id:{kind:"youtube#video",videoId:"AbCdEf12345"}}]});if(hold){started();await releaseGate;}return Response.json({items:[{id:"AbCdEf12345",snippet:{title:"Fresh provider title",channelTitle:"Adapter",liveBroadcastContent:"none",thumbnails:{high:{url:"https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg"}}},contentDetails:{duration:"PT2M"}}]});};setHttpMemoryTransportsForTests({youtube:transport});
  const registration=await handleMemory(request("auth/register",{username:"Race.Provider",password,confirmation:password}),["auth","register"]),owner=cookieOf(registration,"watchnext_account_session");await handleMemory(request("groups",{expectedContextRevision:1,name:"Race provider group"},owner),["groups"]);
  const pageResponse=await handleMemory(request("metadata/search",{expectedContextRevision:2,source:"youtube",kind:"title",query:"race provider"},owner),["metadata","search"]),page=await pageResponse.json() as any;
  clock.mockReturnValue(1_810_000_000_000+601000);expect((await handleMemory(request(`metadata/pages/${page.handle}`,{expectedContextRevision:2,direction:"next"},owner),["metadata","pages",page.handle])).status).toBeGreaterThanOrEqual(400);
  clock.mockReturnValue(1_810_000_000_000);const pageAgain=await handleMemory(request("metadata/search",{expectedContextRevision:2,source:"youtube",kind:"title",query:"race provider"},owner),["metadata","search"]),pageAgainBody=await pageAgain.json() as any;const reviewResponse=await handleMemory(request(`metadata/pages/${pageAgainBody.handle}/candidates/AbCdEf12345`,{expectedContextRevision:2},owner),["metadata","pages",pageAgainBody.handle,"candidates","AbCdEf12345"]),review=await reviewResponse.json() as any;
  clock.mockReturnValue(1_810_000_000_000+601000);expect((await handleMemory(request(`metadata/reviews/${review.handle}/save`,{expectedContextRevision:2,moods:["funny"],numberingStyle:"none"},owner),["metadata","reviews",review.handle,"save"])).status).toBeGreaterThanOrEqual(400);
  clock.mockReturnValue(1_810_000_000_000);const freshSearch=await handleMemory(request("metadata/search",{expectedContextRevision:2,source:"youtube",kind:"title",query:"race provider"},owner),["metadata","search"]),freshPage=await freshSearch.json() as any;const freshReviewResponse=await handleMemory(request(`metadata/pages/${freshPage.handle}/candidates/AbCdEf12345`,{expectedContextRevision:2},owner),["metadata","pages",freshPage.handle,"candidates","AbCdEf12345"]),freshReview=await freshReviewResponse.json() as any;const savedResponse=await handleMemory(request(`metadata/reviews/${freshReview.handle}/save`,{expectedContextRevision:2,moods:["funny"],numberingStyle:"none"},owner),["metadata","reviews",freshReview.handle,"save"]),saved=await savedResponse.json() as any;
  const detail=await handleMemory(request(`library/${saved.title.id}`,undefined,owner,"GET"),["library",saved.title.id]),detailBody=await detail.json() as any;hold=true;const refreshing=handleMemory(request(`library/${saved.title.id}/metadata/refresh`,{expectedContextRevision:2},owner),["library",saved.title.id,"metadata","refresh"]);await startedGate;
  const correctionInput={expectedContextRevision:2,revision:detailBody.revision,title:"Concurrent correction",contentType:"youtube",durationSeconds:120,numberingStyle:"none",genres:["Comedy"],moods:["funny"],watchUrl:"https://www.youtube.com/watch?v=AbCdEf12345",sourceUrl:"https://www.youtube.com/watch?v=AbCdEf12345",coverUrl:"https://i.ytimg.com/vi/AbCdEf12345/hqdefault.jpg",identityChangeConfirmed:true};const correction=await handleMemory(request(`library/${saved.title.id}/edit`,correctionInput,owner,"PATCH"),["library",saved.title.id,"edit"]);expect(correction.status).toBe(200);release();expect((await refreshing).status).toBeGreaterThanOrEqual(400);const after=await handleMemory(request(`library/${saved.title.id}`,undefined,owner,"GET"),["library",saved.title.id]),afterBody=await after.json() as any;expect(afterBody.title).toBe("Concurrent correction");
 } finally { clock.mockRestore(); }
});
