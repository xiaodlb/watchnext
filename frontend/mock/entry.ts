import { sameContext } from "../service/contracts";
import type { ContextIdentity, EntryPage, EntryReview, EntrySaved, EntryService, EntrySource, GroupWorkspace, LibraryDraft, LibraryTitle, ProviderOptions, ProviderOutcome, RequestOptions, ServiceResult } from "../service/contracts";
import type { Metadata, Row } from "./library";
import { fixtureCandidate, fixtureDraft, syntheticVideoId } from "./metadata-fixtures";
type Hooks={rows:()=>Row[];access:()=>GroupWorkspace|null;actor:(w:GroupWorkspace)=>string|null;find:(id:string,w:GroupWorkspace)=>Row|undefined;contributed:(r:Row,id:string|null)=>boolean;project:(r:Row,w:GroupWorkspace)=>LibraryTitle;validate:(d:LibraryDraft)=>Metadata|string;identity:()=>ContextIdentity;now:()=>number;clearEditConfirmations:()=>void;gate:<T>(expected:ContextIdentity,options:RequestOptions,commit:()=>ServiceResult<T>)=>Promise<ServiceResult<T>>};
type Review={value:EntryReview;context:ContextIdentity;original:Metadata;applied:boolean};
type Page={value:EntryPage;context:ContextIdentity;expiresAt:number;outcome:ProviderOutcome};
const metadataFields=["title","contentType","durationSeconds","genres","watchUrl","sourceUrl","coverUrl"] as const;
const key=(v:string)=>v.normalize("NFKC").trim().replace(/\s+/gu," ").toLowerCase();
export function createMockEntry(h:Hooks){
 let offset=0,serial=0,request=0,refreshCount=0;
 const reviews=new Map<string,Review>(),pages=new Map<string,Page>(),confirms=new Map<string,{signature:string;expiresAt:number;context:ContextIdentity}>();
 const now=()=>h.now()+offset;
 const deadline=()=>{const d=new Date(now());d.setUTCDate(d.getUTCDate()+30);return d.getTime();};
 const failure=(message:string):ServiceResult<never>=>({kind:"failure",error:{code:"library_input",message,retryable:true}});
 const result=<T>(value:T):ServiceResult<T>=>({kind:"success",value,context:h.identity()});
 const token=(prefix:string)=>`${prefix}-${++serial}`;
 /** #60: a new save is created at max(metadata clock, newest existing creation + 1 ms), so creation order always follows save order. */
 const createdAt=()=>new Date(Math.max(now(),...h.rows().map(r=>Date.parse(r.createdAt)+1))).toISOString();
 function expire(){
   for(const [id,r]of reviews)if(r.value.expiresAt<=now()||!sameContext(r.context,h.identity()))reviews.delete(id);
   for(const [id,p]of pages)if(p.expiresAt<=now()||!sameContext(p.context,h.identity()))pages.delete(id);
   for(const[id,c]of confirms)if(c.expiresAt<=now()||!sameContext(c.context,h.identity()))confirms.delete(id);
   for(const row of h.rows())for(const field of metadataFields)if(row.deadlines?.[field]!==undefined&&row.deadlines[field]<=now()){
     if(row.origins[field]==="provider"){if(field==="genres")row.genres=[];else Object.assign(row,{[field]:null});row.origins[field]="unavailable";row.revision++;h.clearEditConfirmations();row.availability="Imported fields expired and were cleared in this temporary synthetic model. Authored corrections and history remain.";}
     delete row.deadlines[field];
   }
 }
 function reset(){offset=0;serial=0;request++;reviews.clear();pages.clear();confirms.clear();for(const row of h.rows()){row.deadlines={};for(const field of metadataFields)if(row.origins[field]==="provider")row.deadlines[field]=deadline();}}
 reset();
 const permitted=()=>{const w=h.access();return w&&h.actor(w)?w:null;};
 const outcomeError=(options:ProviderOptions)=>!["normal","not-configured","quota","deadline","empty","missing-runtime","unavailable-item"].includes(options.outcome??"normal")?"Unsupported synthetic provider outcome.":options.outcome==="not-configured"?"Synthetic provider is not configured. Manual entry remains available.":options.outcome==="quota"?"Synthetic provider quota reached. Retry with Normal or use manual entry.":options.outcome==="deadline"?"Synthetic provider deadline exceeded. Retry with Normal.":null;
 function run<T>(expected:ContextIdentity,options:RequestOptions|undefined,commit:()=>ServiceResult<T>){expire();return h.gate(expected,options??{},()=>{expire();return permitted()?commit():failure("Select your own active account member or same-group legacy profile before entry/refresh.");});}
 function invalidateUnapplied(){request++;pages.clear();for(const[id,r]of reviews)if(!r.applied)reviews.delete(id);return request;}
 function review(source:EntrySource,index:number,options:ProviderOptions,id?:string):ServiceResult<EntryReview>{
   if(options.outcome==="unavailable-item")return failure("This synthetic candidate is no longer available. Choose another candidate.");
   const candidate={...fixtureCandidate(source,index,options.outcome),...(id?{id}: {})},draft=fixtureDraft(source,candidate),handle=token("review");
   const value:EntryReview=Object.freeze({handle,source,providerId:candidate.id,draft:Object.freeze({...draft,moods:Object.freeze([...draft.moods])}),expiresAt:now()+600000,notice:source==="kinopoisk"?"Synthetic Kinopoisk Unofficial fixture. FILM integral runtime is this app's minutes interpretation, not live unit verification. Episodic/unknown runtime is manual.":"Synthetic YouTube fixture; no live API/key verification. Unknown runtime remains manual."});
   const original:Metadata={title:draft.title,contentType:draft.contentType||null,durationSeconds:candidate.durationSeconds,numberingStyle:"none",genres:draft.genres.split(", "),moods:[],watchUrl:draft.watchUrl,sourceUrl:draft.sourceUrl,coverUrl:draft.coverUrl};
   reviews.set(handle,{value,context:h.identity(),original,applied:false});while(reviews.size>20){const first=[...reviews].find(([,r])=>!r.applied)?.[0]??reviews.keys().next().value!;reviews.delete(first);}return result(value);
 }
 function makePage(source:EntrySource,query:string,page:number,visits:number,expiresAt:number,outcome:ProviderOutcome):EntryPage{
   const value:EntryPage=Object.freeze({handle:token("page"),source,query,page,visits,previous:page>0&&visits<5,next:page<2&&visits<5,candidates:Object.freeze(outcome==="empty"?[]:[fixtureCandidate(source,page*2,outcome),fixtureCandidate(source,page*2+1,outcome)])});pages.set(value.handle,{value,context:h.identity(),expiresAt,outcome});return value;
 }
 const service=Object.freeze<EntryService>({
   search(source,kind,query,expected,options={}){
     const epoch=sameContext(expected,h.identity())&&permitted()?invalidateUnapplied():request;return run<EntryPage|EntryReview>(expected,options,()=>{
       if(epoch!==request)return failure("A newer lookup superseded this response.");const error=outcomeError(options);if(error)return failure(error);
       if(source!=="youtube"&&source!=="kinopoisk")return failure("Choose one of the two synthetic providers.");
       if(!["normal","not-configured","quota","deadline","empty","missing-runtime","unavailable-item"].includes(options.outcome??"normal"))return failure("Unsupported synthetic provider outcome.");
       if(kind==="link"){const id=source==="youtube"?syntheticVideoId(query):null;if(!id)return failure("Use an exact supported HTTPS YouTube watch/shorts/short-link or 11-character video ID.");return review(source,/^SYNTHVID00[1-6]$/.test(id)?Number(id.slice(-1))-1:0,options,id);}
       if(kind!=="title"||!query.trim()||[...query.trim()].length>200||/[\p{Cc}]/u.test(query)||/^(?:\w+:|https?(?::|\/|%3a|%2f)|www\.|\/|(?:m\.)?(?:youtube\.com|youtu\.be)(?:[\/\\:?#\s]|$))/i.test(query)||/^[^\s/\\?#]+\.[a-z]{2,}(?:[/\\:?#]|$)/i.test(query))return failure("Enter a 1-200 character title without controls; malformed links are not title searches.");
       return result(makePage(source,query.trim(),0,1,now()+600000,options.outcome??"normal"));
     });
   },
   page(handle,direction,expected,options={}){const epoch=sameContext(expected,h.identity())&&permitted()?++request:request;return run(expected,options,()=>{const p=pages.get(handle),error=outcomeError(options);if(error)return failure(error);if(epoch!==request||!p||!sameContext(p.context,expected)||!["next","previous"].includes(direction)||p.value.visits>=5)return failure("Synthetic page handle is expired, superseded or outside its five-visit chain.");const index=p.value.page+(direction==="next"?1:-1);if(index<0||index>2)return failure("No page in that direction.");pages.delete(handle);for(const[id,r]of reviews)if(!r.applied)reviews.delete(id);return result(makePage(p.value.source,p.value.query,index,p.value.visits+1,p.expiresAt,p.outcome));});},
   select(handle,id,expected,options={}){expire();const current=pages.get(handle),valid=sameContext(expected,h.identity())&&permitted()&&current&&sameContext(current.context,expected)&&current.value.candidates.some(c=>c.id===id);const epoch=valid?++request:request;if(valid)for(const[key,r]of reviews)if(!r.applied)reviews.delete(key);return run(expected,options,()=>{const p=pages.get(handle),error=outcomeError(options);if(error)return failure(error);if(epoch!==request||!p||!sameContext(p.context,expected)||!p.value.candidates.some(c=>c.id===id))return failure("Select a contained candidate from a current synthetic page.");const index=p.value.candidates.findIndex(c=>c.id===id)+p.value.page*2;return review(p.value.source,index,{...options,outcome:options.outcome??p.outcome});});},
   adopt(handle,expected,options){return run(expected,options,()=>{const r=reviews.get(handle);if(!r||!sameContext(r.context,expected))return failure("Synthetic review expired, was consumed or belongs to another context.");for(const[id,other]of reviews)if(other.applied&&id!==handle)reviews.delete(id);r.applied=true;return result(r.value);});},
   discard(handle){const r=reviews.get(handle);if(r&&sameContext(r.context,h.identity()))reviews.delete(handle);},
   cancelLookup(expected){if(sameContext(expected,h.identity()))invalidateUnapplied();},
   save(draft,typicalConfirmed,reviewHandle,confirmation,expected,options){return run<EntrySaved>(expected,options,()=>{
     if(["providerId","source","origins","deadlines"].some(field=>field in draft))return failure("Provider identity/provenance cannot be supplied by a form.");
     const w=permitted()!,member=h.actor(w)!;const metadata=h.validate(draft);if(typeof metadata==="string")return failure(metadata);
     if((metadata.contentType==="series"||metadata.contentType==="anime")&&!typicalConfirmed)return failure("Explicitly confirm this is your typical episode duration.");
     const r=reviewHandle?reviews.get(reviewHandle):undefined;if(reviewHandle&&(!r||!r.applied||!sameContext(r.context,expected)))return failure("Synthetic review expired, was consumed or was not applied. Use a fresh review or explicit fresh manual draft.");
     const identity=r?`${r.value.source}:${r.value.providerId}`:null;
     const providerMatch=identity?h.rows().find(x=>x.groupId===w.selected!.id&&x.providerId===identity):undefined;
     const named=h.rows().find(x=>x.groupId===w.selected!.id&&x.contentType===metadata.contentType&&key(x.title??"")===key(metadata.title!));
     if(providerMatch&&named&&providerMatch.id!==named.id||named?.providerId&&identity&&named.providerId!==identity)return failure("Conflicting saved provider identities. Distinguish the work instead of merging it.");
     const match=providerMatch??named,signature=JSON.stringify([expected,metadata,reviewHandle,match?.id,match?.revision]);
     if(match&&(!providerMatch||match.archived)&&(!confirmation||confirms.get(confirmation)?.signature!==signature)){const handle=token("save-confirmation");confirms.set(handle,{signature,expiresAt:Math.min(r?.value.expiresAt??Infinity,now()+600000),context:h.identity()});while(confirms.size>20)confirms.delete(confirms.keys().next().value!);return result({status:"confirmation",handle,matchId:match.id,message:match.archived?"Restore this same archived title and retained history?":"Save your contribution to this existing title without replacing its metadata/history?"});}
     let row=match;
     if(!row){row={...metadata,id:token("saved-title"),groupId:w.selected!.id,revision:1,createdBy:member,providerId:identity,archived:false,contributions:[],history:Object.freeze([]),origins:{},deadlines:{},availability:r?r.value.notice:"Manually authored synthetic entry.",createdAt:createdAt()};for(const[field,value]of Object.entries(metadata)){const imported=r&&metadataFields.includes(field as typeof metadataFields[number])&&r.original[field as keyof Metadata]!==null&&JSON.stringify(value)===JSON.stringify(r.original[field as keyof Metadata]);row.origins[field]=imported?"provider":"authored";if(imported)row.deadlines![field]=deadline();}h.rows().push(row);}
     let changed=false;
     if(match&&identity&&!row.providerId){row.providerId=identity;changed=true;}
     const existing=row.contributions.find(c=>c.memberId===member);if(existing){if(!existing.active)changed=true;existing.active=true;}else{row.contributions.push({id:`contribution-${row.id}-${member}`,memberId:member,active:true});changed=true;}if(row.archived){row.archived=false;changed=true;}if(match&&changed)row.revision++;
     if(reviewHandle)reviews.delete(reviewHandle);if(confirmation)confirms.delete(confirmation);return result({status:"saved",title:h.project(row,w)});
   });},
   refresh(id,expected,options={}){
     expire();const before=permitted(),row=before&&h.find(id,before);if(!before||!row||row.archived||before.mode==="account"&&!h.contributed(row,h.actor(before)))return Promise.resolve(failure("Refresh needs your active contribution (or selected same-group legacy profile)."));
     return run(expected,options,()=>{const w=permitted()!,current=h.find(id,w),error=outcomeError(options);if(error)return failure(error);if(!current||current.archived||w.mode==="account"&&!h.contributed(current,h.actor(w)))return failure("Refresh access changed.");const match=/^(youtube|kinopoisk):(.+)$/.exec(current.providerId??"");if(!match||options.outcome==="unavailable-item")return failure("Stored synthetic provider item is unavailable; old deadlines were not renewed.");const source=match[1] as EntrySource,index=source==="youtube"?(/^SYNTHVID00[1-6]$/.test(match[2])?Number(match[2].slice(-1))-1:syntheticVideoId(match[2])?0:NaN):Number(match[2])-1001;if(!Number.isInteger(index)||index<0||index>5)return failure("Stored synthetic provider identity is unavailable.");const c={...fixtureCandidate(source,index,options.outcome),id:match[2]},d=fixtureDraft(source,c);const values:Metadata={title:`${d.title} (refresh ${++refreshCount})`,contentType:d.contentType||null,durationSeconds:c.durationSeconds,genres:d.genres.split(", "),moods:[],numberingStyle:current.numberingStyle,watchUrl:d.watchUrl,sourceUrl:d.sourceUrl,coverUrl:d.coverUrl};for(const field of metadataFields)if(current.origins[field]!=="authored"){Object.assign(current,{[field]:values[field]});if(values[field]===null){current.origins[field]="unavailable";if(current.deadlines)delete current.deadlines[field];}else{current.origins[field]="provider";(current.deadlines??={})[field]=deadline();}}current.revision++;return result(h.project(current,w));});
   },
   advanceTime(amount,expected,options){return run(expected,options,()=>{if(amount!=="ten-minutes"&&amount!=="thirty-one-days")return failure("Choose a bounded synthetic-time step.");offset+=amount==="ten-minutes"?600000:31*86400000;request++;expire();return result({now:now()});});},
 });
 return {service,expire,reset,now};
}
