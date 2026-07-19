"use client";

import type { LogicalRange } from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { ChartPane } from "@/components/chart/ChartPane";
import { SubPane } from "@/components/chart/SubPane";
import { useCandleFeed } from "@/lib/chart/feed";
import * as gridSync from "@/lib/chart/sync";
import { INDICATORS } from "@/lib/indicators/registry";
import { useProvider } from "@/lib/providers";
import { useIndicators } from "@/stores/indicators";
import { useSettings } from "@/stores/settings";

export interface PaneHandlers {
  applyRange: (range: LogicalRange) => void;
  applyCrosshair: (time: number | null) => void;
}

export interface PaneSyncApi {
  register: (id: string, handlers: PaneHandlers) => () => void;
  publishRange: (id: string, range: LogicalRange) => void;
  publishCrosshair: (id: string, time: number | null) => void;
}

/**
 * One symbol's charting surface: the primary price pane plus a stacked,
 * height-adjustable sub-pane per active oscillator, all sharing one time axis.
 */
export function ChartWorkspace({
  workspaceId,
  symbol,
  isPrimary,
}: {
  workspaceId: string;
  symbol: string;
  isPrimary: boolean;
}) {
  const provider = useProvider();
  const timeframe = useSettings((s) => s.timeframe);
  const gridLayout = useSettings((s) => s.gridLayout);
  const syncEnabled = useSettings((s) => s.syncCrosshair);
  const feed = useCandleFeed(provider, symbol, timeframe);

  const subInstances = useIndicators((s) => s.instances).filter(
    (i) => INDICATORS[i.type].pane === "sub" && i.visible,
  );

  const panesRef = useRef(new Map<string, PaneHandlers>());
  const syncEnabledRef = useRef(false);
  syncEnabledRef.current = gridLayout !== "1" && syncEnabled;

  const sync = useMemo<PaneSyncApi>(() => {
    const panes = panesRef.current;
    const api: PaneSyncApi = {
      register: (id, handlers) => {
        panes.set(id, handlers);
        return () => {
          if (panes.get(id) === handlers) panes.delete(id);
        };
      },
      publishRange: (id, range) => {
        for (const [pid, h] of panes) {
          if (pid !== id) h.applyRange(range);
        }
        if (syncEnabledRef.current) gridSync.publishRange(`${workspaceId}:${id}`, range);
      },
      publishCrosshair: (id, time) => {
        for (const [pid, h] of panes) {
          if (pid !== id) h.applyCrosshair(time);
        }
        if (syncEnabledRef.current) gridSync.publishCrosshair(`${workspaceId}:${id}`, time);
      },
    };
    return api;
  }, [workspaceId]);

  // apply grid-level sync events coming from other workspaces
  useEffect(() => {
    const offRange = gridSync.onRange((origin, range) => {
      if (!syncEnabledRef.current) return;
      if (origin.startsWith(`${workspaceId}:`)) return;
      for (const h of panesRef.current.values()) h.applyRange(range);
    });
    const offCross = gridSync.onCrosshair((origin, time) => {
      if (!syncEnabledRef.current) return;
      if (origin.startsWith(`${workspaceId}:`)) return;
      for (const h of panesRef.current.values()) h.applyCrosshair(time);
    });
    return () => {
      offRange();
      offCross();
    };
  }, [workspaceId]);

  return (
    <PanelGroup direction="vertical" autoSaveId={`tt-ws-${workspaceId}`}>
      <Panel defaultSize={70} minSize={25}>
        <ChartPane
          paneId="main"
          feed={feed}
          symbol={symbol}
          sync={sync}
          isPrimary={isPrimary}
        />
      </Panel>
      {subInstances.map((inst) => (
        <SubPaneSlot key={inst.id}>
          <SubPane instanceId={inst.id} feed={feed} sync={sync} />
        </SubPaneSlot>
      ))}
    </PanelGroup>
  );
}

function SubPaneSlot({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PanelResizeHandle className="resize-handle" />
      <Panel defaultSize={18} minSize={8}>
        {children}
      </Panel>
    </>
  );
}
