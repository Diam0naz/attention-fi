"use client";

import { useState } from "react";
import { cn } from "@/lib/terminal-app/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";

export const PALETTE = [
  "#4c8dff",
  "#38bdf8",
  "#2ebd85",
  "#e2b93b",
  "#e5484d",
  "#b46ee0",
  "#f472b6",
  "#fb923c",
  "#a3e635",
  "#98a3b3",
  "#e8ecf2",
  "#5b6572",
];

export function ColorSwatches({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger className="h-5 w-5 rounded border border-edge-strong transition-transform duration-100 hover:scale-110">
        <span className="block h-full w-full rounded-[3px]" style={{ background: value }} />
      </PopoverTrigger>
      <PopoverContent className="grid grid-cols-6 gap-1 p-2">
        {PALETTE.map((c) => (
          <button
            key={c}
            type="button"
            className={cn(
              "h-5 w-5 rounded border transition-transform duration-100 hover:scale-110",
              c === value ? "border-focus" : "border-edge",
            )}
            style={{ background: c }}
            onClick={() => {
              onChange(c);
              setOpen(false);
            }}
          />
        ))}
      </PopoverContent>
    </Popover>
  );
}
