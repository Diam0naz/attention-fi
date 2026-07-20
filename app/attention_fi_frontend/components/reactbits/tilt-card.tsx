"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * react-bits-style 3D tilt card: follows the cursor with a perspective rotate
 * and a soft glare. Wrap any card content; it fills its parent.
 */
export function TiltCard({
  children,
  className,
  max = 12,
}: {
  children: ReactNode;
  className?: string;
  max?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, px: 50, py: 50, active: false });

  function onMove(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({
      rx: -(py - 0.5) * 2 * max,
      ry: (px - 0.5) * 2 * max,
      px: px * 100,
      py: py * 100,
      active: true,
    });
  }

  return (
    <div style={{ perspective: 900 }} className={className}>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={() => setTilt((t) => ({ ...t, rx: 0, ry: 0, active: false }))}
        style={{
          transform: `rotateX(${tilt.rx}deg) rotateY(${tilt.ry}deg)`,
          transition: tilt.active ? "transform 80ms ease-out" : "transform 350ms ease-out",
        }}
        className="relative h-full w-full [transform-style:preserve-3d]"
      >
        {children}
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] transition-opacity duration-300"
          style={{
            opacity: tilt.active ? 1 : 0,
            background: `radial-gradient(circle at ${tilt.px}% ${tilt.py}%, rgba(255,255,255,0.18), transparent 45%)`,
          }}
        />
      </div>
    </div>
  );
}
