import type { EntryCandidate, EntrySource, LibraryDraft, ProviderOutcome } from "../service/contracts";
export const blankEntry = ():LibraryDraft=>({title:"",contentType:"",minutes:"",seconds:"",numberingStyle:"none",genres:"",moods:[],watchUrl:"",sourceUrl:"",coverUrl:""});
export function syntheticVideoId(value:string):string|null {
  if(/^[A-Za-z0-9_-]{11}$/.test(value))return value;
  if(/[\p{Cc}\s\\]/u.test(value)||!/^https:\/\//i.test(value))return null;
  try{const u=new URL(value),authority=value.match(/^https:\/\/([^/?#]+)/i)?.[1];if(!authority||/[:@]/.test(authority)||u.username||u.password)return null;
    const long=["youtube.com","www.youtube.com","m.youtube.com"].includes(u.hostname);if(!long&&u.hostname!=="youtu.be")return null;
    const original=value.slice(value.indexOf(authority)+authority.length).split(/[?#]/,1)[0]||"/";if(original!==u.pathname)return null;
    const params=u.searchParams.getAll("v");const id=long&&u.pathname==="/watch"?(params.length===1?params[0]:null):params.length?null:(long?/^\/shorts\/([A-Za-z0-9_-]{11})$/:/^\/([A-Za-z0-9_-]{11})$/).exec(u.pathname)?.[1];return id&&/^[A-Za-z0-9_-]{11}$/.test(id)?id:null;
  }catch{return null;}
}
export function fixtureCandidate(source:EntrySource,index:number,outcome:ProviderOutcome="normal"):EntryCandidate {
  const youtube=source==="youtube",unknown=!youtube&&index===2,series=!youtube&&index===1;
  return Object.freeze({id:youtube?`SYNTHVID00${index+1}`:String(1001+index),title:youtube?`Synthetic video ${index+1}`:`Synthetic KP ${series?"Series":unknown?"Unknown":"Movie"} ${index+1}`,channel:youtube?"Synthetic sample channel":null,year:youtube?null:2020+index,contentType:unknown?null:youtube?"youtube":series?"series":"movie",durationSeconds:outcome==="missing-runtime"||series||unknown?null:youtube?600+index*60:6000,coverUrl:"/mock-cover.svg"});
}
export function fixtureDraft(source:EntrySource,c:EntryCandidate):LibraryDraft {
  return {...blankEntry(),title:c.title,contentType:c.contentType??"",minutes:c.durationSeconds===null?"":String(Math.floor(c.durationSeconds/60)),seconds:c.durationSeconds===null?"":String(c.durationSeconds%60),genres:source==="youtube"?"Learning":"Drama",watchUrl:source==="youtube"?`https://www.youtube.com/watch?v=${c.id}`:`https://www.kinopoisk.ru/film/${c.id}/`,sourceUrl:source==="youtube"?`https://www.youtube.com/watch?v=${c.id}`:`https://www.kinopoisk.ru/film/${c.id}/`,coverUrl:c.coverUrl??""};
}
