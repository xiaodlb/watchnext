"use client";
import { useEffect, useRef, useState } from "react";
import { youtubeThumbnail } from "../../lib/metadata/youtube-thumbnail";
import { kinopoiskPoster } from "../../lib/metadata/kinopoisk-poster";

export function safeCoverUrl(value: string | null) { return youtubeThumbnail(value) ?? kinopoiskPoster(value); }
export function Cover({ url, title, video = false }: { url: string | null; title: string | null; video?: boolean }) {
  const safe = safeCoverUrl(url);
  // Key the inner view so a new URL clears both event and cached-load failure state.
  return <CoverImage key={safe ?? "missing"} safe={safe} title={title} video={video || Boolean(youtubeThumbnail(safe))} />;
}
function CoverImage({safe,title,video}:{safe:string|null;title:string|null;video:boolean}) {
  const [failed,setFailed]=useState(false),image=useRef<HTMLImageElement>(null);
  useEffect(()=>{if(image.current?.complete && image.current.naturalWidth===0)setFailed(true);},[safe]);
  const hue=Array.from(title??"WatchNext").reduce((value,character)=>(value*31+character.charCodeAt(0))%360,0);
  return <div className={`title-cover${video ? " video-cover" : ""}`}>
    {safe && !failed ? <img ref={image} src={safe} alt={`${title ?? "Metadata unavailable"} cover`} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)} /> : <span className="cover-fallback source-cover-fallback" style={{background:`radial-gradient(circle at 80% 15%, hsl(${hue} 80% 70% / .38), transparent 36%), linear-gradient(155deg, hsl(${hue} 56% 42%), hsl(${hue} 67% 22%) 64%, hsl(${hue} 70% 12%))`}}><span className="source-cover-icon" aria-hidden="true">{video?"▶":"▤"}</span><span className="source-cover-title">{title??"Title unavailable"}</span><span className="source-cover-missing">No cover</span></span>}
  </div>;
}
