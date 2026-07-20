"use client";

import { useRef, useState, type ReactNode } from "react";

/**
 * Fixed-row-height windowed list. Renders only visible rows plus a small
 * overscan; scroll updates are cheap state changes driven by the container's
 * scrollTop.
 */
export function VirtualList<T>({
  items,
  rowHeight,
  overscan = 8,
  className,
  renderRow,
}: {
  items: T[];
  rowHeight: number;
  overscan?: number;
  className?: string;
  renderRow: (item: T, index: number) => ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [range, setRange] = useState({ start: 0, end: 60 });

  const onScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    const start = Math.max(0, Math.floor(el.scrollTop / rowHeight) - overscan);
    const end = Math.min(
      items.length,
      Math.ceil((el.scrollTop + el.clientHeight) / rowHeight) + overscan,
    );
    setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
  };

  const visible = items.slice(range.start, range.end);

  return (
    <div ref={containerRef} onScroll={onScroll} className={className} style={{ overflowY: "auto" }}>
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: range.start * rowHeight,
            left: 0,
            right: 0,
          }}
        >
          {visible.map((item, i) => renderRow(item, range.start + i))}
        </div>
      </div>
    </div>
  );
}
