"use client";

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

export function Modal({
  open,
  onClose,
  children,
  className,
  top = "20vh",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  top?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      className="fade-in fixed inset-0 z-[70] bg-black/50"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{ marginTop: top }}
        className={cn(
          "pop-in mx-auto w-[560px] max-w-[calc(100vw-32px)] rounded-lg border border-edge-strong bg-overlay shadow-[0_16px_48px_rgba(0,0,0,0.55)]",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
