"use client";

import { useEffect, useState } from "react";
import { X, RotateCw } from "lucide-react";
import { NftCardFace, getNftVisual, type NftCardData } from "@/components/nft/nft-card";
import { useScrollLock } from "@/lib/use-scroll-lock";

/**
 * A dangling, flippable NFT viewer shown in a side panel. Click the card to flip
 * between the front (art) and back (detail / on-chain traits).
 */
export function NftLanyard({ data, onClose }: { data: NftCardData | null; onClose: () => void }) {
  const [flipped, setFlipped] = useState(false);
  useScrollLock(!!data);

  useEffect(() => {
    setFlipped(false); // reset when a new NFT opens
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, onClose]);

  if (!data) return null;
  const v = getNftVisual(data);

  return (
    <div className="fixed inset-0 z-[110] flex bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0b1017] px-6 pt-5 shadow-2xl [animation:af-slide-in_.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center">
          <span className="font-mono text-[12px] font-bold" style={{ color: v.accent }}>
            {v.label} NFT
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded-md p-1 text-[#6B6B6B] transition-colors hover:bg-white/10 hover:text-[#F5F4F0]"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* strap + dangling card */}
        <div className="flex flex-1 flex-col items-center justify-center">
          <div className="af-sway flex flex-col items-center" style={{ perspective: 1200 }}>
            {/* lanyard strap */}
            <div
              className="h-24 w-8 rounded-b-sm"
              style={{ background: `linear-gradient(180deg, ${v.accent}, ${v.accent}22)` }}
            />
            {/* clasp */}
            <div className="-mt-1 h-3 w-5 rounded-sm border border-white/20 bg-[#1a222c]" />

            <button
              onClick={() => setFlipped((f) => !f)}
              className="relative mt-2 w-56 cursor-pointer [transform-style:preserve-3d]"
              style={{
                transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
                transition: "transform 0.6s cubic-bezier(0.2,0.7,0.2,1)",
              }}
              aria-label="Flip card"
            >
              {/* front */}
              <div className="[backface-visibility:hidden]">
                <NftCardFace data={data} />
              </div>
              {/* back */}
              <div
                className="absolute inset-0 flex flex-col rounded-xl border p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]"
                style={{ background: v.grad, borderColor: `${v.accent}55` }}
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: v.accent }}>
                  {v.label} · {v.tag}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-[#d7dde3]">{v.blurb}</p>
                <dl className="mt-auto flex flex-col gap-1.5 font-mono text-[10px]">
                  <Row k="TIER" v={v.tier} />
                  <Row k={v.statLabel} v={v.stat} accent={v.accent} />
                  <Row k="ASSET ID" v={v.id} />
                  <Row k="STANDARD" v="Metaplex Core" />
                </dl>
              </div>
            </button>
          </div>

          <button
            onClick={() => setFlipped((f) => !f)}
            className="mt-8 inline-flex items-center gap-1.5 font-mono text-[10px] text-[#6B6B6B] transition-colors hover:text-[#F5F4F0]"
          >
            <RotateCw className="h-3 w-3" /> {flipped ? "Show front" : "Flip for details"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v, accent }: { k: string; v: string; accent?: string }) {
  return (
    <div className="flex justify-between border-t border-white/10 pt-1.5">
      <span className="text-white/40">{k}</span>
      <span className="truncate pl-3" style={accent ? { color: accent } : { color: "#F5F4F0" }}>
        {v}
      </span>
    </div>
  );
}
