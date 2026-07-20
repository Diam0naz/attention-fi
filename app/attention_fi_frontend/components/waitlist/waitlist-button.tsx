"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useScrollLock } from "@/lib/use-scroll-lock";
import type { WaitlistStatus } from "@/lib/waitlist-tasks";
import { WaitlistForm } from "./waitlist-form";
import { WaitlistPanel } from "./waitlist-panel";

const LS_KEY = "af_waitlist_id";

export function WaitlistButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<WaitlistStatus | null>(null);
  useScrollLock(open);

  // Restore a returning user's status from their saved id.
  useEffect(() => {
    const id = localStorage.getItem(LS_KEY);
    if (!id) return;
    fetch(`/api/waitlist?id=${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (s && !s.error) setStatus(s as WaitlistStatus);
      })
      .catch(() => undefined);
  }, []);

  // Escape closes the modal.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function onJoined(s: WaitlistStatus) {
    localStorage.setItem(LS_KEY, s.id);
    setStatus(s);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded-sm bg-signal px-3 py-1.5 font-mono text-[11px] font-bold tracking-wide text-[#0A0A0A] transition-opacity hover:opacity-90"
      >
        <span className="hidden sm:inline">
          {status ? `#${status.position} · Waitlist` : "Join Waitlist →"}
        </span>
        <span className="sm:hidden">{status ? `#${status.position}` : "Waitlist"}</span>
      </button>

      {/* Portal to <body>: the nav's backdrop-blur is a containing block for
          position:fixed and would clip the overlay to the nav's box. */}
      {open &&
        createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setOpen(false)}
        >
          <div
            className="relative my-auto w-full max-w-md rounded-md border border-white/10 bg-[#0f1620] p-6 pt-7 shadow-2xl sm:p-7"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Close"
              onClick={() => setOpen(false)}
              className="absolute right-3 top-3 rounded-md p-1.5 text-[#6B6B6B] transition-colors hover:bg-white/10 hover:text-[#F5F4F0]"
            >
              <X className="h-4 w-4" />
            </button>
            {status ? (
              <WaitlistPanel status={status} onStatus={setStatus} />
            ) : (
              <WaitlistForm onJoined={onJoined} />
            )}
          </div>
        </div>,
          document.body,
        )}
    </>
  );
}
