"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { tokenImage } from "@/lib/mock-data";

const GRADIENT = "bg-[repeating-linear-gradient(45deg,#1c2733,#1c2733_4px,#222f3d_4px,#222f3d_8px)]";

/** Token avatar: a generated image with a graceful fallback to the gradient tile. */
export function Avatar({ handle, className }: { handle: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("inline-block shrink-0 overflow-hidden rounded-full", GRADIENT, className)}>
      {!failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={tokenImage(handle)}
          alt={`@${handle}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="h-full w-full object-cover"
        />
      )}
    </span>
  );
}
