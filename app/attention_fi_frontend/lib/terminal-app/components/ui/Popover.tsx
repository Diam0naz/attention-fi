"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/terminal-app/lib/cn";

interface PopoverCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

const Ctx = createContext<PopoverCtx | null>(null);

export function Popover({
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = useState(false);
  const open = controlledOpen ?? uncontrolled;
  const anchorRef = useRef<HTMLElement | null>(null);
  const setOpen = useCallback(
    (v: boolean) => {
      setUncontrolled(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  return <Ctx.Provider value={{ open, setOpen, anchorRef }}>{children}</Ctx.Provider>;
}

export function PopoverTrigger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("PopoverTrigger outside Popover");
  return (
    <button
      type="button"
      className={className}
      ref={(el) => {
        ctx.anchorRef.current = el;
      }}
      aria-expanded={ctx.open}
      onClick={() => ctx.setOpen(!ctx.open)}
    >
      {children}
    </button>
  );
}

export function PopoverContent({
  children,
  className,
  align = "start",
  width,
}: {
  children: ReactNode;
  className?: string;
  align?: "start" | "end";
  width?: number;
}) {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("PopoverContent outside Popover");
  const { open, setOpen, anchorRef } = ctx;
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const anchor = anchorRef.current;
    const el = ref.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    let left = align === "start" ? a.left : a.right - c.width;
    let top = a.bottom + 4;
    left = Math.max(4, Math.min(left, window.innerWidth - c.width - 4));
    if (top + c.height > window.innerHeight - 4) top = a.top - c.height - 4;
    setPos({ top, left });
  }, [open, align, anchorRef]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      const anchor = anchorRef.current;
      if (!el) return;
      const target = e.target as Node;
      if (el.contains(target) || anchor?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen, anchorRef]);

  if (!open) return null;
  return createPortal(
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width,
        visibility: pos ? "visible" : "hidden",
        zIndex: 60,
      }}
      className={cn(
        "tt-root pop-in rounded-md border border-edge-strong bg-overlay shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}

export function usePopoverClose(): () => void {
  const ctx = useContext(Ctx);
  return useCallback(() => ctx?.setOpen(false), [ctx]);
}
