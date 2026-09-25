"use client";

import { useState } from "react";
import { Play, X, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseFaqAnswer, parseFaqInline, formatDuration, type FaqItem, type FaqMedia } from "@/lib/faq";

function Inline({ text }: { text: string }) {
  return (
    <>
      {parseFaqInline(text).map((p, i) =>
        p.type === "bold" ? (
          <strong key={i} className="text-text font-semibold">{p.text}</strong>
        ) : p.type === "link" ? (
          <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="text-blue underline decoration-blue/40 break-all">{p.text}</a>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/** The body of one FAQ: formatted text, then media in order. Shared by the member page and the admin preview. */
export function FaqAnswer({ item, compact }: { item: FaqItem; compact?: boolean }) {
  const [lightbox, setLightbox] = useState<FaqMedia | null>(null);
  const [playing, setPlaying] = useState<Set<number>>(new Set());
  const blocks = parseFaqAnswer(item.answer);

  return (
    <div className="flex flex-col gap-3.5">
      {blocks.length > 0 && (
        <div className="text-[13px] leading-[1.6] text-text-muted flex flex-col gap-2">
          {blocks.map((b, i) =>
            b.type === "p" ? (
              <p key={i} className="m-0 whitespace-pre-line"><Inline text={b.text} /></p>
            ) : (
              <ul key={i} className="m-0 pl-[18px] flex flex-col gap-1 list-disc">
                {b.items.map((li, j) => <li key={j}><Inline text={li} /></li>)}
              </ul>
            ),
          )}
        </div>
      )}

      {item.media.length > 0 && (
        <div className={cn("grid gap-3", item.media.length > 1 && !compact ? "sm:grid-cols-2" : "grid-cols-1")}>
          {item.media.map((m, i) => (
            <figure key={i} className="m-0 flex flex-col gap-1.5 min-w-0">
              <div className="relative rounded-xl overflow-hidden bg-canvas border border-border aspect-video">
                {m.kind === "image" && (
                  <button type="button" onClick={() => setLightbox(m)} className="block w-full h-full" aria-label="Open image">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.thumb ?? m.url} alt={m.caption ?? ""} loading="lazy" className="w-full h-full object-cover" />
                  </button>
                )}
                {m.kind === "video" && (
                  playing.has(i) ? (
                    <video src={m.url} poster={m.poster} controls autoPlay playsInline preload="none" className="w-full h-full bg-black" />
                  ) : (
                    <button type="button" onClick={() => setPlaying((s) => new Set(s).add(i))} className="relative block w-full h-full" aria-label="Play video">
                      {m.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.poster} alt="" loading="lazy" className="w-full h-full object-cover opacity-90" />
                      ) : (
                        <div className="w-full h-full bg-card-elev" />
                      )}
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-14 h-14 rounded-full bg-black/60 border border-white/30 flex items-center justify-center">
                          <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                        </span>
                      </span>
                      {m.duration ? <span className="absolute bottom-2 right-2 text-[10px] font-mono bg-black/70 text-white px-1.5 py-0.5 rounded">{formatDuration(m.duration)}</span> : null}
                    </button>
                  )
                )}
                {m.kind === "youtube" && m.videoId && (
                  playing.has(i) ? (
                    <iframe
                      src={`https://www.youtube-nocookie.com/embed/${m.videoId}?autoplay=1`}
                      title={m.caption ?? "YouTube video"}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  ) : (
                    <button type="button" onClick={() => setPlaying((s) => new Set(s).add(i))} className="relative block w-full h-full" aria-label="Play YouTube video">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://i.ytimg.com/vi/${m.videoId}/hqdefault.jpg`} alt="" loading="lazy" className="w-full h-full object-cover opacity-90" />
                      <span className="absolute inset-0 flex items-center justify-center">
                        <span className="w-14 h-14 rounded-full bg-black/60 border border-white/30 flex items-center justify-center">
                          <Play className="w-5 h-5 text-white ml-0.5" fill="currentColor" />
                        </span>
                      </span>
                      <span className="absolute bottom-2 right-2 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded">YouTube</span>
                    </button>
                  )
                )}
              </div>
              {m.caption && <figcaption className="text-[11px] text-text-subtle px-0.5">{m.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-[80] bg-black/92 flex flex-col items-center justify-center p-3" onClick={() => setLightbox(null)}>
          <button className="absolute top-3 right-3 p-2 text-white/80 hover:text-white" aria-label="Close"><X className="w-6 h-6" /></button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox.url} alt={lightbox.caption ?? ""} className="max-w-[96vw] max-h-[84dvh] object-contain rounded-md" onClick={(e) => e.stopPropagation()} />
          {lightbox.caption && <p className="text-[12px] text-white/80 mt-3 m-0 flex items-center gap-1.5">{lightbox.caption} <a href={lightbox.url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} aria-label="Open image in a new tab"><ExternalLink className="w-3.5 h-3.5" /></a></p>}
        </div>
      )}
    </div>
  );
}
