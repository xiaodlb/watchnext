import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TitleForm } from "../app/watchlist/add/title-form";
import { lookupMetadata } from "../lib/metadata/lookup";
import type { ReviewResult } from "../lib/metadata/reviews";
import type { TitleFormState } from "../lib/title-state";
afterEach(cleanup);
async function proposal(title="Provider video",handle="synthetic-review"):Promise<ReviewResult>{return{...await lookupMetadata({namespace:"youtube",lookup:async()=>({kind:"item",item:{externalId:"YtFixture01",title,contentType:"youtube",channelTitle:"Actual channel",coverUrl:"https://i.ytimg.com/vi/YtFixture01/default.jpg",sourceUrl:"https://www.youtube.com/watch?v=YtFixture01",watchUrl:"https://www.youtube.com/watch?v=YtFixture01",genres:["Comedy"],duration:{seconds:125,meaning:"full_item",verified:true}}})},{kind:"detail",externalId:"YtFixture01"}),handle};}
const save=async():Promise<TitleFormState>=>({kind:"error",message:"Synthetic storage failure; details kept."});
function source(value="youtube"){fireEvent.change(screen.getByLabelText("Entry method"),{target:{value}});}
const input=(name:string)=>screen.getByLabelText(name,{exact:true}) as HTMLInputElement;
const click=(name:string)=>fireEvent.click(screen.getByRole("button",{name}));
const edit=(name:string,value:string)=>fireEvent.change(input(name),{target:{value}});
const lookup=()=>click("Look up video");
const handle=()=>document.querySelector<HTMLInputElement>('input[name="reviewHandle"]')?.value;
it("clean direct link fills all supported fields immediately, keeps manually selected moods and never saves",async()=>{
 const action=vi.fn(save);render(<TitleForm action={action} lookup={()=>proposal()} select={vi.fn()}/>);fireEvent.click(input("Funny"));source();lookup();await waitFor(()=>expect(input("Title").value).toBe("Provider video"));
 expect(input("Minutes").value).toBe("2");expect(input("Seconds (optional)").value).toBe("5");expect(input("Genres (optional)").value).toBe("Comedy");expect(input("External watch link (optional)").value).toContain("YtFixture01");expect(input("Source link (optional)").value).toContain("YtFixture01");expect(input("Cover image link (optional)").value).toContain("i.ytimg.com");expect(input("Funny").checked).toBe(true);expect(handle()).toBe("synthetic-review");expect(screen.queryByRole("button",{name:/Apply proposal|Replace details/})).toBeNull();expect(action).not.toHaveBeenCalled();expect(screen.getByText("Actual channel")).toBeTruthy();
});
it("dirty metadata offers explicit decline/replace without changing identity or moods until accepted",async()=>{
 render(<TitleForm action={save} lookup={()=>proposal()} select={vi.fn()}/>);edit("Title","My draft");fireEvent.click(input("Funny"));source();lookup();await screen.findByText("Replace your edited details?");expect(input("Title").value).toBe("My draft");expect(handle()).toBeUndefined();click("Keep my details");expect(handle()).toBeUndefined();lookup();await screen.findByText("Replace your edited details?");click("Replace details");expect(input("Title").value).toBe("Provider video");expect(input("Funny").checked).toBe(true);click("Save title");await screen.findByText("Synthetic storage failure; details kept.");expect(input("Title").value).toBe("Provider video");expect(handle()).toBe("synthetic-review");
});
it("edits while detail is pending require new consent and editing a staged replacement invalidates it",async()=>{
 let finish!:(value:ReviewResult)=>void;render(<TitleForm action={save} lookup={()=>new Promise(done=>{finish=done;})} select={vi.fn()}/>);source();lookup();edit("Title","While waiting");input("Title").focus();await act(async()=>finish(await proposal()));expect(input("Title").value).toBe("While waiting");expect(document.activeElement).toBe(input("Title"));expect(handle()).toBeUndefined();await screen.findByRole("button",{name:"Replace details"});edit("Title","Newer still");expect(screen.queryByRole("button",{name:"Replace details"})).toBeNull();expect(handle()).toBeUndefined();
});
it("reverting to the baseline during the await still cannot grant stale replacement consent",async()=>{
 let finish!:(value:ReviewResult)=>void;render(<TitleForm action={save} lookup={()=>new Promise(done=>{finish=done;})} select={vi.fn()}/>);source();lookup();edit("Title","Changed");edit("Title","");await act(async()=>finish(await proposal()));await screen.findByRole("button",{name:"Replace details"});expect(handle()).toBeUndefined();click("Keep my details");expect(input("Title").value).toBe("");
});
it.each(["cancel","query","source"])("%s invalidates held success and failure without clearing manual edits",async change=>{
 let finish!:(value:ReviewResult)=>void;render(<TitleForm action={save} lookup={()=>new Promise(done=>{finish=done;})} select={vi.fn()}/>);source();lookup();if(change==="cancel")click("Cancel lookup");if(change==="query")edit("YouTube video link or ID","new query");if(change==="source")source("manual");edit("Title","Kept");await act(async()=>finish(await proposal("Old ignored")));expect(input("Title").value).toBe("Kept");expect(handle()).toBeUndefined();expect(screen.queryByText(/Old ignored/)).toBeNull();
});
it("newer response wins; selector switching never drops an accepted imported identity",async()=>{
 const finishes:((value:ReviewResult)=>void)[]=[];render(<TitleForm action={save} lookup={()=>new Promise(done=>{finishes.push(done);})} select={vi.fn()}/>);source();lookup();click("Cancel lookup");lookup();await act(async()=>finishes[1](await proposal("Newest","new-handle")));await act(async()=>finishes[0](await proposal("Ignored","old-handle")));expect(input("Title").value).toBe("Newest");expect(handle()).toBe("new-handle");source("manual");expect(handle()).toBe("new-handle");expect(input("Title").value).toBe("Newest");
});
it("fresh manual reset confirms edited data loss and retains it on cancel",async()=>{
 render(<TitleForm action={save} lookup={()=>proposal()} select={vi.fn()}/>);source();lookup();await waitFor(()=>expect(handle()).toBe("synthetic-review"));edit("Title","My correction");click("Start a fresh manual entry (clear details)");click("Keep editing");expect(input("Title").value).toBe("My correction");expect(handle()).toBe("synthetic-review");click("Start a fresh manual entry (clear details)");click("Clear details and start manually");expect(input("Title").value).toBe("");expect(handle()).toBeUndefined();
});
it("imported full duration cannot become an inferred episode duration; changing it resets confirmation",async()=>{
 render(<TitleForm action={save} lookup={()=>proposal()} select={vi.fn()}/>);source();lookup();await waitFor(()=>expect(handle()).toBe("synthetic-review"));edit("Content type","series");expect(input("Minutes").value).toBe("");const confirmation=input("I confirm this is a typical episode duration");expect(confirmation.checked).toBe(false);fireEvent.click(confirmation);edit("Minutes","24");expect(confirmation.checked).toBe(false);expect(input("Episode numbering").value).toBe("");
});
it("YouTube title intent and both providers use explicit candidate and opaque page actions",async()=>{
 const candidates:ReviewResult={kind:"candidates",handle:"opaque-search",requiresSelection:true,omittedInvalidCandidates:false,candidates:[{identity:{namespace:"youtube",externalId:"YtFixture01"},title:"One title",year:null,contentType:"youtube",channelTitle:"Real channel",duration:{seconds:125,meaning:"full_item"},coverUrl:"https://i.ytimg.com/vi/YtFixture01/default.jpg"}],page:{number:1,next:"opaque-search",limitReached:false}};
 const find=vi.fn(async(_form:FormData)=>candidates),select=vi.fn(async()=>proposal()),page=vi.fn(async(_form:FormData)=>({...candidates,kind:"no_match",candidates:[],manualFallback:true,page:{number:2,previous:"opaque-empty",next:"opaque-empty",limitReached:false}} as ReviewResult));render(<TitleForm action={save} lookup={find} select={select} page={page}/>);source();edit("YouTube lookup","title");edit("YouTube title","A title");click("Search titles");await screen.findByText("Real channel · 2 min 5 sec");expect(find.mock.calls[0][0].get("queryKind")).toBe("title");expect(find.mock.calls[0][0].get("query")).toBe("A title");expect(select).not.toHaveBeenCalled();expect(handle()).toBeUndefined();click("Next page");await screen.findByText(/No matching titles on this page/);expect((page.mock.calls[0]?.[0] as FormData).get("handle")).toBe("opaque-search");expect((page.mock.calls[0]?.[0] as FormData).get("direction")).toBe("next");expect(screen.getByRole("button",{name:"Previous page"})).toBeTruthy();
});
it("explicit candidate selection fills clean form without assigning moods",async()=>{
 const find=vi.fn(async()=>({kind:"candidates",handle:"search",requiresSelection:true,omittedInvalidCandidates:false,candidates:[{identity:{namespace:"kinopoisk_unofficial",externalId:"1001"},title:"Same",year:2001,contentType:"movie",coverUrl:null}]} as ReviewResult));const select=vi.fn(async(_form:FormData)=>proposal("Chosen"));render(<TitleForm action={save} lookup={find} select={select}/>);source("kinopoisk_unofficial");click("Search titles");await screen.findByRole("button",{name:"Review Same (2001)"});expect(select).not.toHaveBeenCalled();click("Review Same (2001)");await waitFor(()=>expect(input("Title").value).toBe("Chosen"));expect(select.mock.calls[0][0].get("candidateId")).toBe("1001");expect(input("Funny").checked).toBe(false);
});

it("switching result sources repeats the same query against the chosen provider and ignores late results",async()=>{
 const requests:{form:FormData;resolve:(value:ReviewResult)=>void}[]=[];
 const find=vi.fn((form:FormData)=>new Promise<ReviewResult>(resolve=>requests.push({form,resolve})));
 const results=(namespace:"youtube"|"kinopoisk_unofficial",title:string):ReviewResult=>({kind:"candidates",handle:"search",requiresSelection:true,omittedInvalidCandidates:false,candidates:[{identity:{namespace,externalId:namespace==="youtube"?"YtFixture01":"1001"},title,year:2001,contentType:namespace==="youtube"?"youtube":"movie",coverUrl:null}]});
 render(<TitleForm action={save} lookup={find} select={vi.fn()}/>);source("kinopoisk_unofficial");edit("Title to search","Shared query");click("Search titles");
 await act(async()=>requests[0].resolve(results("kinopoisk_unofficial","Film result")));
 const region=screen.getByRole("region",{name:"Search results"});
 fireEvent.click(within(region).getByRole("button",{name:"YouTube"}));
 expect(requests[1].form.get("source")).toBe("youtube");expect(requests[1].form.get("query")).toBe("Shared query");expect(requests[1].form.get("queryKind")).toBe("title");
 fireEvent.click(within(region).getByRole("button",{name:"Movies & shows"}));
 expect(requests[2].form.get("source")).toBe("kinopoisk_unofficial");expect(requests[2].form.get("query")).toBe("Shared query");
 await act(async()=>requests[2].resolve(results("kinopoisk_unofficial","New film")));
 await act(async()=>requests[1].resolve(results("youtube","Stale video")));
 expect(within(region).getByRole("button",{name:"Review New film (2001)"})).toBeTruthy();expect(screen.queryByText("Stale video")).toBeNull();
 fireEvent.click(within(region).getByRole("button",{name:"YouTube"}));
 await act(async()=>requests[3].resolve({kind:"no_match",candidates:[],manualFallback:true} as ReviewResult));
 expect(screen.getByText(/No matching titles/)).toBeTruthy();expect(within(region).getByRole("button",{name:"Movies & shows"})).toBeTruthy();
});

it("saving while lookup is pending prevents its late success from attaching identity or replacing submitted details",async()=>{
 let finishLookup!:(value:ReviewResult)=>void,finishSave!:(value:TitleFormState)=>void;render(<TitleForm action={()=>new Promise(done=>{finishSave=done;})} lookup={()=>new Promise(done=>{finishLookup=done;})} select={vi.fn()}/>);edit("Title","Submitted manual draft");source();lookup();click("Save title");await screen.findByRole("button",{name:"Saving title…"});expect(input("Entry method").closest("fieldset")?.disabled).toBe(true);await act(async()=>finishLookup(await proposal()));expect(input("Title").value).toBe("Submitted manual draft");expect(handle()).toBeUndefined();await act(async()=>finishSave({kind:"error",message:"Safe retry"}));await screen.findByText("Safe retry");expect(input("Title").value).toBe("Submitted manual draft");expect(screen.getByRole("button",{name:"Save title"})).toBeTruthy();
});
it("a late failure from an invalidated request cannot replace a newer accepted success",async()=>{
 const requests:{resolve:(value:ReviewResult)=>void;reject:(reason:Error)=>void}[]=[];render(<TitleForm action={save} lookup={()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))} select={vi.fn()}/>);source();lookup();edit("YouTube video link or ID","new");lookup();await act(async()=>requests[1].resolve(await proposal("Current","current-handle")));await act(async()=>requests[0].reject(new Error("Old transport failure")));expect(input("Title").value).toBe("Current");expect(handle()).toBe("current-handle");expect(screen.queryByText(/Lookup could not finish/)).toBeNull();
});
it("returning to the last accepted baseline removes dirty confirmation for a deliberate later lookup",async()=>{
 render(<TitleForm action={save} lookup={()=>proposal()} select={vi.fn()}/>);source();lookup();await waitFor(()=>expect(handle()).toBe("synthetic-review"));edit("Title","Correction");edit("Title","Provider video");lookup();await screen.findByText(/Lookup finished/);expect(screen.queryByRole("button",{name:"Replace details"})).toBeNull();expect(handle()).toBe("synthetic-review");
});
