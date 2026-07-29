"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { Check, CheckCheck, Gavel, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/lib/use-scroll-lock";
import type { AppNotification } from "@/components/notifications/notifications-panel";

/**
 * Notifications as a side panel rather than a dropdown.
 *
 * A dropdown anchored to a bell at the right edge of the nav had nowhere to
 * grow — text wrapped to two or three words per line. A panel gets full height
 * and a readable measure, and matches the lanyard, which is how every other
 * detail view on the site opens.
 */

/** Icon per notification type, so a sale reads differently from a return. */
function TypeIcon({ type }: { type: AppNotification["type"] }) {
  if (type === "graduation") return <Gavel className="h-3.5 w-3.5 text-signal" />;
  return <Undo2 className="h-3.5 w-3.5 text-[#6B6B6B]" />;
}

export function NotificationsDrawer({
  open,
  items,
  unread,
  loading,
  onClose,
  onMarkAllRead,
  onToggleRead,
}: {
  open: boolean;
  items: AppNotification[];
  unread: number;
  loading: boolean;
  onClose: () => void;
  onMarkAllRead: () => void;
  onToggleRead: (id: string) => void;
}) {
  useScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Portal to <body>: the nav is a backdrop-filtered sticky element, which
  // becomes a containing block for position:fixed and would clip this to it.
  return createPortal(
    <div className="fixed inset-0 z-[110] flex bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="ml-auto flex h-full w-full max-w-sm flex-col border-l border-white/10 bg-[#0b1017] shadow-2xl [animation:af-slide-in_.3s_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/[0.08] px-5 py-4">
          <span className="text-[13px] font-bold">Notifications</span>
          {unread > 0 && (
            <span className="rounded-full bg-signal px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#0A0A0A]">
              {unread}
            </span>
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="ml-auto rounded-md p-1 text-[#6B6B6B] transition-colors hover:bg-white/10 hover:text-[#F5F4F0]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
            <span className="font-mono text-[11px] text-[#6B6B6B]">
              {loading ? "Checking…" : "Nothing yet"}
            </span>
            <p className="font-mono text-[10px] leading-relaxed text-[#4b5563]">
              Sales and returns on your 1-of-1 listings show up here.
            </p>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "group flex gap-3 border-b border-white/[0.06] px-5 py-4 transition-colors",
                    !n.read && "bg-signal/[0.03]",
                  )}
                >
                  <span className="mt-0.5 shrink-0">
                    <TypeIcon type={n.type} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "text-[12.5px] leading-relaxed",
                        n.read ? "text-[#9aa4af]" : "text-[#F5F4F0]",
                      )}
                    >
                      {n.text}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#6B6B6B]">{n.time}</div>
                  </div>

                  {/* A tick that toggles rather than only sets: marking one read
                      by mistake shouldn't be a one-way door. */}
                  <button
                    onClick={() => onToggleRead(n.id)}
                    title={n.read ? "Mark as unread" : "Mark as read"}
                    aria-label={n.read ? "Mark as unread" : "Mark as read"}
                    aria-pressed={n.read}
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                      n.read
                        ? "border-signal/40 bg-signal/10 text-signal"
                        : "border-white/15 text-transparent hover:border-white/40 hover:text-[#6B6B6B]",
                    )}
                  >
                    <Check className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>

            <button
              onClick={onMarkAllRead}
              disabled={unread === 0}
              className="flex items-center justify-center gap-1.5 border-t border-white/[0.08] py-3.5 font-mono text-[11px] text-signal transition-colors hover:bg-white/[0.03] disabled:text-[#4b5563] disabled:hover:bg-transparent"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              {unread === 0 ? "All read" : `Mark all ${unread} read`}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
