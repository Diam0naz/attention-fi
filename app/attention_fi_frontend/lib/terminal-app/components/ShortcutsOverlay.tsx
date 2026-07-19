"use client";

import { Modal } from "@/lib/terminal-app/components/ui/Modal";

const GROUPS: { title: string; rows: [string, string][] }[] = [
  {
    title: "Navigation",
    rows: [
      ["/", "Focus symbol search"],
      ["Ctrl+K", "Command palette"],
      ["1 – 7", "Switch timeframe (1m → 1w)"],
      ["?", "Toggle this overlay"],
    ],
  },
  {
    title: "Drawing",
    rows: [
      ["Alt+T", "Trendline"],
      ["Alt+H", "Horizontal line"],
      ["Alt+F", "Fibonacci retracement"],
      ["Esc", "Cancel tool / deselect"],
      ["Del", "Delete selected drawing"],
      ["Ctrl+Z", "Undo drawing change"],
      ["Ctrl+Shift+Z / Ctrl+Y", "Redo drawing change"],
    ],
  },
  {
    title: "Chart",
    rows: [
      ["Space", "Toggle crosshair lock"],
      ["Scroll", "Zoom time scale"],
      ["Drag", "Pan chart"],
      ["Double-click text", "Edit annotation"],
    ],
  },
  {
    title: "Trading",
    rows: [
      ["Shift+B", "Buy market (default qty)"],
      ["Shift+S", "Sell market (default qty)"],
      ["Shift+F", "Flatten position"],
      ["Shift+X", "Cancel all working orders"],
      ["Click book level", "Prep limit at price"],
      ["Alt+click book level", "Place limit instantly"],
    ],
  },
];

export function ShortcutsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} top="14vh">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <span className="text-sm font-medium text-hi">Keyboard shortcuts</span>
        <kbd className="rounded border border-edge bg-elevated px-1.5 py-0.5 text-2xs text-low">
          Esc
        </kbd>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-4">
        {GROUPS.map((g) => (
          <div key={g.title}>
            <div className="mb-1.5 text-2xs font-medium uppercase tracking-wider text-low">
              {g.title}
            </div>
            {g.rows.map(([key, desc]) => (
              <div key={key} className="flex items-center justify-between py-0.5">
                <span className="text-xs text-mid">{desc}</span>
                <kbd className="num rounded border border-edge bg-elevated px-1.5 py-0.5 text-2xs text-hi">
                  {key}
                </kbd>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Modal>
  );
}
