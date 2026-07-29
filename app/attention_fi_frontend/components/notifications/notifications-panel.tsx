"use client";

import { cn } from "@/lib/utils";

export interface AppNotification {
  id: string;
  type: "graduation" | "referral" | "mention" | "price";
  text: string;
  time: string;
  read: boolean;
  /** Where to go to act on it. Set only when there's something to do. */
  href?: string;
  /** Label for that link, e.g. "Claim your perk". */
  action?: string;
}

const DOT: Record<AppNotification["type"], string> = {
  graduation: "bg-signal",
  referral: "bg-pulse",
  mention: "bg-white/15",
  price: "bg-white/15",
};

const ROW_TINT: Record<AppNotification["type"], string> = {
  graduation: "bg-signal/[0.03]",
  referral: "bg-pulse/[0.03]",
  mention: "",
  price: "",
};

export function NotificationsPanel({
  notifications,
  onMarkAllRead,
  onViewAll,
}: {
  notifications: AppNotification[];
  onMarkAllRead: () => void;
  onViewAll?: () => void;
}) {
  return (
    <div className="w-full max-w-[380px] rounded-sm border border-white/10 bg-[#0f1620]">
      <div className="flex items-center border-b border-white/[0.08] px-4.5 py-4">
        <span className="text-[13px] font-bold">Notifications</span>
        <button onClick={onMarkAllRead} className="ml-auto font-mono text-[10px] text-signal">
          Mark all read
        </button>
      </div>

      <div className="flex flex-col">
        {notifications.map((n) => (
          <div
            key={n.id}
            className={cn(
              "flex gap-2.5 border-b border-white/[0.06] px-4.5 py-3.5 last:border-b-0",
              !n.read && ROW_TINT[n.type],
            )}
          >
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT[n.type])} />
            <div className="flex-1">
              <div className={cn("text-[12.5px]", n.read && "text-[#9aa4af]")}>{n.text}</div>
              <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">{n.time}</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={onViewAll}
        className="w-full border-t border-white/[0.08] py-3 text-center font-mono text-[10.5px] text-[#6B6B6B]"
      >
        View all
      </button>
    </div>
  );
}
