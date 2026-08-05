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
  /**
   * The trigger element, held as state rather than a ref.
   *
   * A ref passed through context is doubly awkward for the React Compiler: the
   * trigger mutating `ctx.anchorRef.current` is a write to a value it treats as
   * frozen, and every read of the context during render then counts as touching
   * a ref. State sidesteps both, and is more correct besides — the anchor
   * becoming available now re-runs the positioning effect, where a ref left it
   * measuring against whatever happened to be there on the first pass.
   */
  anchor: HTMLElement | null;
  setAnchor: (el: HTMLElement | null) => void;
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
  // setAnchor is React's own state setter, which is already stable and has the
  // right shape for a ref callback.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const setOpen = useCallback(
    (v: boolean) => {
      setUncontrolled(v);
      onOpenChange?.(v);
    },
    [onOpenChange],
  );
  return <Ctx.Provider value={{ open, setOpen, anchor, setAnchor }}>{children}</Ctx.Provider>;
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
  const { open, setOpen, setAnchor } = ctx;
  return (
    <button
      type="button"
      className={className}
      ref={setAnchor}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
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
  const { open, setOpen, anchor } = ctx;
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Forget the last position on close, so a reopen stays hidden until it has
  // been measured against the anchor's current place on screen rather than
  // flashing where it sat last time. Done in render for the same reason as
  // everywhere else: the closed popover renders nothing, so there is no
  // external system to synchronise with here.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (!open) setPos(null);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const el = ref.current;
    if (!anchor || !el) return;
    const a = anchor.getBoundingClientRect();
    const c = el.getBoundingClientRect();
    let left = align === "start" ? a.left : a.right - c.width;
    let top = a.bottom + 4;
    left = Math.max(4, Math.min(left, window.innerWidth - c.width - 4));
    if (top + c.height > window.innerHeight - 4) top = a.top - c.height - 4;
    setPos({ top, left });
  }, [open, align, anchor]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
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
  }, [open, setOpen, anchor]);

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
