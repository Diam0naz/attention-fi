"use client";

import { useState } from "react";
import { cn } from "@/lib/terminal-app/lib/cn";
import {
  INDICATORS,
  instanceLabel,
  SOURCES,
  type IndicatorType,
} from "@/lib/terminal-app/lib/indicators/registry";
import { useIndicators, type IndicatorInstance } from "@/lib/terminal-app/stores/indicators";
import { ColorSwatches } from "@/lib/terminal-app/components/ui/ColorSwatches";
import { Popover, PopoverContent, PopoverTrigger } from "@/lib/terminal-app/components/ui/Popover";
import { Select } from "@/lib/terminal-app/components/ui/Select";

export function IndicatorMenu() {
  const [open, setOpen] = useState(false);
  const instances = useIndicators((s) => s.instances);
  const add = useIndicators((s) => s.add);
  const showVolume = useIndicators((s) => s.showVolume);
  const toggleVolume = useIndicators((s) => s.toggleVolume);

  const overlays = Object.values(INDICATORS).filter((d) => d.pane === "overlay");
  const subs = Object.values(INDICATORS).filter((d) => d.pane === "sub");

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn(
          "flex h-6 items-center gap-1 rounded border border-edge bg-tinput px-2 text-xs text-hi",
          "transition-colors duration-150 hover:border-edge-strong hover:bg-hover",
        )}
      >
        Indicators
        {instances.length > 0 && (
          <span className="num rounded bg-tacc-muted px-1 text-2xs text-tacc">
            {instances.length}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0">
        <div className="max-h-[26rem] overflow-y-auto p-2">
          {instances.length > 0 && (
            <>
              <SectionLabel>Active</SectionLabel>
              <div className="mb-2 flex flex-col gap-1">
                {instances.map((inst) => (
                  <ActiveIndicatorRow key={inst.id} inst={inst} />
                ))}
              </div>
            </>
          )}
          <SectionLabel>Volume</SectionLabel>
          <label className="mb-2 flex cursor-pointer items-center justify-between rounded-sm px-2 py-1 text-xs text-hi transition-colors duration-100 hover:bg-hover">
            Volume histogram
            <Toggle checked={showVolume} onChange={toggleVolume} />
          </label>
          <SectionLabel>Overlays</SectionLabel>
          <AddList types={overlays.map((d) => d.type)} onAdd={add} />
          <SectionLabel>Oscillators</SectionLabel>
          <AddList types={subs.map((d) => d.type)} onAdd={add} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pb-1 pt-1.5 text-2xs font-medium uppercase tracking-wider text-low">
      {children}
    </div>
  );
}

function AddList({
  types,
  onAdd,
}: {
  types: IndicatorType[];
  onAdd: (t: IndicatorType) => void;
}) {
  return (
    <div className="mb-1 flex flex-col">
      {types.map((t) => (
        <button
          key={t}
          type="button"
          className="flex w-full items-center justify-between rounded-sm px-2 py-1 text-left text-xs text-hi transition-colors duration-100 hover:bg-hover"
          onClick={() => onAdd(t)}
        >
          {INDICATORS[t].label}
          <span className="text-2xs text-low">{INDICATORS[t].shortLabel}</span>
        </button>
      ))}
    </div>
  );
}

function ActiveIndicatorRow({ inst }: { inst: IndicatorInstance }) {
  const [open, setOpen] = useState(false);
  const remove = useIndicators((s) => s.remove);
  const toggleVisible = useIndicators((s) => s.toggleVisible);

  return (
    <div className="rounded border border-edge bg-elevated">
      <div className="flex items-center gap-1 px-2 py-1">
        <button
          type="button"
          className={cn(
            "num flex-1 text-left text-xs transition-colors duration-100",
            inst.visible ? "text-hi" : "text-low line-through",
          )}
          onClick={() => setOpen((v) => !v)}
        >
          {instanceLabel(inst.type, inst.params)}
        </button>
        <button
          type="button"
          title={inst.visible ? "Hide" : "Show"}
          className="flex h-5 w-5 items-center justify-center rounded text-mid transition-colors duration-100 hover:bg-hover hover:text-hi"
          onClick={() => toggleVisible(inst.id)}
        >
          <EyeIcon off={!inst.visible} />
        </button>
        <button
          type="button"
          title="Remove"
          className="flex h-5 w-5 items-center justify-center rounded text-mid transition-colors duration-100 hover:bg-hover hover:text-down"
          onClick={() => remove(inst.id)}
        >
          <XIcon />
        </button>
      </div>
      {open && <IndicatorSettings inst={inst} />}
    </div>
  );
}

function IndicatorSettings({ inst }: { inst: IndicatorInstance }) {
  const def = INDICATORS[inst.type];
  const setParam = useIndicators((s) => s.setParam);
  const setColor = useIndicators((s) => s.setColor);
  const setWidth = useIndicators((s) => s.setWidth);

  return (
    <div className="border-t border-edge px-2 py-1.5">
      {def.params.map((p) =>
        p.kind === "number" ? (
          <div key={p.key} className="mb-1.5 flex items-center justify-between">
            <span className="text-2xs text-mid">{p.label}</span>
            <input
              type="number"
              min={p.min}
              max={p.max}
              step={p.step}
              value={Number(inst.params[p.key] ?? p.default)}
              className="num h-5 w-16 rounded border border-edge bg-tinput px-1 text-right text-2xs text-hi transition-colors duration-150 focus:border-focus focus:outline-none"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                if (Number.isFinite(v)) setParam(inst.id, p.key, v);
              }}
            />
          </div>
        ) : (
          <div key={p.key} className="mb-1.5 flex items-center justify-between">
            <span className="text-2xs text-mid">{p.label}</span>
            <Select
              value={String(inst.params[p.key] ?? p.default)}
              options={SOURCES.map((s) => ({ value: s, label: s }))}
              onChange={(v) => setParam(inst.id, p.key, v as (typeof SOURCES)[number])}
              buttonClassName="h-5 w-16"
            />
          </div>
        ),
      )}
      {def.lines.map((l) => (
        <div key={l.key} className="mb-1.5 flex items-center justify-between">
          <span className="text-2xs text-mid">{l.label}</span>
          <div className="flex items-center gap-1.5">
            <Select
              value={String(inst.widths[l.key] ?? l.defaultWidth)}
              options={["1", "2", "3", "4"].map((w) => ({ value: w, label: `${w}px` }))}
              onChange={(v) => setWidth(inst.id, l.key, parseInt(v, 10))}
              buttonClassName="h-5 w-14"
            />
            <ColorSwatches
              value={inst.colors[l.key] ?? l.defaultColor}
              onChange={(c) => setColor(inst.id, l.key, c)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cn(
        "relative h-3.5 w-6 rounded-full transition-colors duration-150",
        checked ? "bg-tacc" : "bg-active",
      )}
      onClick={onChange}
    >
      <span
        className={cn(
          "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white transition-[left] duration-150",
          checked ? "left-3" : "left-0.5",
        )}
      />
    </button>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12">
      <path
        d="M1 6c1.6-2.4 3.2-3.5 5-3.5S9.4 3.6 11 6c-1.6 2.4-3.2 3.5-5 3.5S2.6 8.4 1 6Z"
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
      />
      <circle cx="6" cy="6" r="1.4" fill="currentColor" />
      {off && <path d="M2 10 L10 2" stroke="currentColor" strokeWidth="1.2" />}
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10">
      <path d="M1.5 1.5 L8.5 8.5 M8.5 1.5 L1.5 8.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
