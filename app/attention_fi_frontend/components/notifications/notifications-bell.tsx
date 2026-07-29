"use client";

import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useNotifications } from "@/components/notifications/use-notifications";
import { NotificationsPanel } from "@/components/notifications/notifications-panel";

/**
 * Notification bell.
 *
 * Only rendered for a connected wallet — every notification here is about
 * something that wallet owns, so there's nothing to show otherwise.
 */
export function NotificationsBell() {
  const { connected } = useWallet();
  const { items, unread, markAllRead, loading } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape, so the panel doesn't strand itself open
  // over the page.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!connected) return null;

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread > 0 ? `Notifications (${unread} unread)` : "Notifications"}
        className={cn(
          "relative flex h-7 w-7 items-center justify-center rounded-sm border border-white/10 text-[#6B6B6B] transition-colors hover:border-white/25 hover:text-[#F5F4F0]",
          open && "border-signal/40 text-signal",
        )}
      >
        <Bell className="h-3.5 w-3.5" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-signal px-1 font-mono text-[8px] font-bold text-[#0A0A0A]">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-50">
          {items.length === 0 ? (
            <div className="w-[280px] rounded-sm border border-white/10 bg-[#0f1620] p-5 text-center">
              <div className="font-mono text-[11px] text-[#6B6B6B]">
                {loading ? "Checking…" : "Nothing yet"}
              </div>
              <p className="mt-1 font-mono text-[10px] leading-relaxed text-[#4b5563]">
                Sales and returns on your 1-of-1 listings show up here.
              </p>
            </div>
          ) : (
            <NotificationsPanel
              notifications={items}
              onMarkAllRead={markAllRead}
              onViewAll={() => setOpen(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}
