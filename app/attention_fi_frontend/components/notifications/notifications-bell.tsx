"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useNotifications } from "@/components/notifications/use-notifications";
import { NotificationsDrawer } from "@/components/notifications/notifications-drawer";

/**
 * Notification bell.
 *
 * Only rendered for a connected wallet — every notification here is about
 * something that wallet owns, so there's nothing to show otherwise. Opens a
 * side panel rather than a dropdown: anchored to the right edge of the nav,
 * a dropdown had no room to grow and wrapped to a few words per line.
 */
export function NotificationsBell() {
  const { connected } = useWallet();
  const { items, unread, markAllRead, toggleRead, loading } = useNotifications();
  const [open, setOpen] = useState(false);

  if (!connected) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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

      <NotificationsDrawer
        open={open}
        items={items}
        unread={unread}
        loading={loading}
        onClose={() => setOpen(false)}
        onMarkAllRead={markAllRead}
        onToggleRead={toggleRead}
      />
    </>
  );
}
