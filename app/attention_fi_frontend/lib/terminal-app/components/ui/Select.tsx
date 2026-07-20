"use client";

import { useState } from "react";
import { cn } from "@/lib/terminal-app/lib/cn";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export function Select<T extends string>({
  value,
  options,
  onChange,
  className,
  buttonClassName,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (v: T) => void;
  className?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-6 items-center gap-1 rounded border border-edge bg-tinput px-2 text-xs text-hi",
          "transition-colors duration-150 hover:border-edge-strong hover:bg-hover",
          "focus-visible:border-focus",
          buttonClassName,
        )}
      >
        <span className="truncate">{current?.label ?? value}</span>
        <Chevron />
      </PopoverTrigger>
      <PopoverContent className={cn("max-h-64 min-w-28 overflow-y-auto p-1", className)}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            className={cn(
              "flex w-full items-center rounded-sm px-2 py-1 text-left text-xs",
              "transition-colors duration-100 hover:bg-hover",
              o.value === value ? "text-tacc" : "text-hi",
            )}
            onClick={() => {
              onChange(o.value);
              setOpen(false);
            }}
          >
            {o.label}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function Chevron() {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" className="shrink-0 text-low">
      <path d="M1 2.5 L4 5.5 L7 2.5" stroke="currentColor" strokeWidth="1.2" fill="none" />
    </svg>
  );
}
