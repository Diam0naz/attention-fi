"use client";

import { useEffect, useRef, useState } from "react";
import { X, RotateCw } from "lucide-react";
import { NftCardFace, getNftVisual, type NftCardData } from "@/components/nft/nft-card";
import { useScrollLock } from "@/lib/use-scroll-lock";
import { useDominantColor } from "@/lib/use-dominant-color";

/**
 * A dangling, flippable NFT viewer shown in a side panel. Click the card to flip
 * between the front (art) and back (detail / on-chain traits).
 */
export function NftLanyard({ data, onClose }: { data: NftCardData | null; onClose: () => void }) {
  const [flipped, setFlipped] = useState(false);
  // Cursor tilt folded into the SAME transform as the flip (shared perspective),
  // rather than nesting a TiltCard — which would invert on the flipped face and
  // fight the flip's backface hiding.
  const cardRef = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, active: false });
  // While a flip is animating, force the slow transition so clicking mid-tilt
  // doesn't snap at the fast tilt-tracking speed.
  const [flipping, setFlipping] = useState(false);
  useScrollLock(!!data);

  function flip() {
    setFlipped((f) => !f);
    setFlipping(true);
    window.setTimeout(() => setFlipping(false), 750);
  }

  function onMove(e: React.MouseEvent) {
    const el = cardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    setTilt({ rx: -py * 16, ry: px * 16, active: true });
  }
  const onLeave = () => setTilt({ rx: 0, ry: 0, active: false });

  // Reset the flip when a different NFT opens (adjust-state-on-prop-change).
  const [lastData, setLastData] = useState(data);
  if (data !== lastData) {
    setLastData(data);
    setFlipped(false);
  }

  useEffect(() => {
    if (!data) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [data, onClose]);

  // Read before the early return — hooks can't be called conditionally. Only
  // custom collectibles carry artwork; everything else keeps its designed
  // palette, so there's nothing to sample.
  const artwork = data && data.kind === "custom" ? data.image : undefined;
  const derived = useDominantColor(artwork);

  if (!data) return null;
  const v = getNftVisual(data);
  // Strap, back face and header all track the artwork so the whole viewer
  // reads as one object rather than a tinted front on a fixed-colour shell.
  const accent = derived ?? v.accent;

  return (
    <div className="fixed inset-0 z-[110] flex bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="ml-auto flex h-full w-full max-w-md flex-col border-l border-white/10 bg-[#0b1017] px-6 pt-5 shadow-2xl [animation:af-slide-in_.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center">
          <span className="font-mono text-[12px] font-bold" style={{ color: accent }}>
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
          <div
            className="af-sway flex flex-col items-center"
            style={{ perspective: 1200, animationPlayState: tilt.active ? "paused" : "running" }}
          >
            {/* lanyard strap */}
            <div
              className="h-24 w-8 rounded-b-sm"
              style={{ background: `linear-gradient(180deg, ${accent}, ${accent}22)` }}
            />
            {/* clasp */}
            <div className="-mt-1 h-3 w-5 rounded-sm border border-white/20 bg-[#1a222c]" />

            <button
              ref={cardRef}
              onClick={flip}
              onMouseMove={onMove}
              onMouseLeave={onLeave}
              className="relative mt-2 w-56 cursor-pointer [transform-style:preserve-3d]"
              style={{
                transform: `rotateX(${tilt.rx}deg) rotateY(${(flipped ? 180 : 0) + tilt.ry}deg)`,
                transition: flipping
                  ? "transform 0.75s cubic-bezier(0.2,0.7,0.2,1)"
                  : tilt.active
                    ? "transform 90ms ease-out"
                    : "transform 0.55s cubic-bezier(0.2,0.7,0.2,1)",
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
                style={{
                  // Tinted from the artwork when we could read it. Kept dark
                  // and low-alpha rather than reusing the front's vivid
                  // gradient, since the back is mostly body text.
                  background: derived
                    ? `linear-gradient(140deg, ${derived}2e, #0b1017 55%, ${derived}1f)`
                    : v.grad,
                  borderColor: `${accent}55`,
                }}
              >
                <div className="font-mono text-[10px] uppercase tracking-[0.1em]" style={{ color: accent }}>
                  {v.label} · {v.tag}
                </div>
                <p className="mt-3 text-[12px] leading-relaxed text-[#d7dde3]">{v.blurb}</p>
                <dl className="mt-auto flex flex-col gap-1.5 font-mono text-[10px]">
                  <Row k="TIER" v={v.tier} />
                  <Row k={v.statLabel} v={v.stat} accent={accent} />
                  <Row k="ASSET ID" v={v.id} />
                  <Row k="STANDARD" v="Metaplex Core" />
                </dl>
              </div>
            </button>
          </div>

          <button
            onClick={flip}
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
