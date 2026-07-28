"use client";

import { useEffect, useState } from "react";

/**
 * Pull an accent colour out of an NFT's artwork, client-side.
 *
 * Done in the browser rather than at index time because artwork URIs are
 * arbitrary user input: fetching and decoding them server-side would turn every
 * mint into an SSRF vector and a bandwidth bill. The cost is that it only works
 * when the host sends permissive CORS headers — a canvas holding an image from
 * a host that doesn't is "tainted", and `getImageData` throws. That is expected
 * and common, so every failure path returns null and the caller keeps its
 * designed accent.
 */

/** Downsample target. 24px is plenty for an average and keeps decode cheap. */
const SAMPLE_PX = 24;

function toHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Average the image's "interesting" pixels.
 *
 * A plain mean over every pixel trends muddy grey-brown on most artwork, so
 * near-transparent, near-black and near-white pixels are skipped and each
 * remaining pixel is weighted by saturation. That biases toward the colour a
 * person would name if asked, rather than the arithmetic mean of the canvas.
 */
function dominantFrom(data: Uint8ClampedArray): string | null {
  let r = 0;
  let g = 0;
  let b = 0;
  let weight = 0;

  for (let i = 0; i < data.length; i += 4) {
    const pr = data[i]!;
    const pg = data[i + 1]!;
    const pb = data[i + 2]!;
    const pa = data[i + 3]!;
    if (pa < 128) continue;

    const max = Math.max(pr, pg, pb);
    const min = Math.min(pr, pg, pb);
    if (max < 24 || min > 232) continue; // near-black / near-white

    // 0..1 saturation; +0.1 so tasteful near-greys still contribute a little.
    const saturation = max === 0 ? 0 : (max - min) / max;
    const w = saturation + 0.1;
    r += pr * w;
    g += pg * w;
    b += pb * w;
    weight += w;
  }

  if (weight === 0) return null;
  return toHex(r / weight, g / weight, b / weight);
}

/**
 * Lift a colour to a usable accent. Artwork averages are often too dark to read
 * as text on a dark card, so push low-luminance results up while keeping hue.
 */
function ensureReadable(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 0xff;
  let g = (n >> 8) & 0xff;
  let b = n & 0xff;

  // Rec. 709 luma.
  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const MIN_LUMA = 128;
  if (luma < MIN_LUMA && luma > 0) {
    const boost = MIN_LUMA / luma;
    r = Math.min(255, r * boost);
    g = Math.min(255, g * boost);
    b = Math.min(255, b * boost);
  }
  return toHex(r, g, b);
}

/**
 * The artwork's accent colour, or null while loading / when it can't be read.
 * Callers should treat null as "use the designed accent".
 */
export function useDominantColor(src: string | undefined): string | null {
  // Tagged with the src it was derived from, so swapping artwork can't briefly
  // paint the previous image's colour — and so nothing needs clearing in the
  // effect body.
  const [found, setFound] = useState<{ src: string; color: string } | null>(null);

  useEffect(() => {
    if (!src) return;
    let cancelled = false;

    const img = new Image();
    // Required for a readable canvas. Hosts without CORS headers will either
    // fail to load or taint the canvas; both end up in the null path.
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = SAMPLE_PX;
        canvas.height = SAMPLE_PX;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(img, 0, 0, SAMPLE_PX, SAMPLE_PX);
        const dominant = dominantFrom(ctx.getImageData(0, 0, SAMPLE_PX, SAMPLE_PX).data);
        if (dominant) setFound({ src, color: ensureReadable(dominant) });
      } catch {
        // Tainted canvas (no CORS headers) — keep the designed accent.
      }
    };
    img.onerror = () => undefined;
    img.src = src;

    return () => {
      cancelled = true;
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);

  return found && found.src === src ? found.color : null;
}
