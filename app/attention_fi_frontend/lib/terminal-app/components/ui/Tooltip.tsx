"use client";

import { useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function Tooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom";
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  const show = () => {
    timer.current = setTimeout(() => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setPos({
        top: side === "bottom" ? r.bottom + 6 : r.top - 28,
        left: r.left + r.width / 2,
      });
    }, 350);
  };
  const hide = () => {
    if (timer.current) clearTimeout(timer.current);
    setPos(null);
  };

  return (
    <span
      ref={wrapRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      onMouseDown={hide}
      className="inline-flex"
    >
      {children}
      {pos &&
        createPortal(
          <div
            style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 80 }}
            className="tt-root fade-in -translate-x-1/2 whitespace-nowrap rounded border border-edge-strong bg-overlay px-1.5 py-0.5 text-2xs text-mid shadow-lg"
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}
