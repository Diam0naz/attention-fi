"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
  type ImperativePanelHandle,
} from "react-resizable-panels";
import { AlertToast } from "@/lib/terminal-app/components/AlertToast";
import { BottomDrawer } from "@/lib/terminal-app/components/drawer/BottomDrawer";
import { ChartArea } from "@/lib/terminal-app/components/chart/ChartArea";
import { CommandPalette } from "@/lib/terminal-app/components/CommandPalette";
import { RightRail } from "@/lib/terminal-app/components/rightrail/RightRail";
import { ShortcutsOverlay } from "@/lib/terminal-app/components/ShortcutsOverlay";
import { TerminalGuide } from "@/lib/terminal-app/components/TerminalGuide";
import { TopBar } from "@/lib/terminal-app/components/topbar/TopBar";
import { WatchlistPanel } from "@/lib/terminal-app/components/watchlist/WatchlistPanel";
import { useKeyboard } from "@/lib/terminal-app/hooks/useKeyboard";
import { useMarketFeeds } from "@/lib/terminal-app/hooks/useMarketFeeds";
import { useLayout } from "@/lib/terminal-app/stores/layout";
import { useSettings } from "@/lib/terminal-app/stores/settings";

const GUIDE_SEEN_KEY = "tt.guide.seen";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export function Terminal({ initialSymbol }: { initialSymbol?: string }) {
  return (
    <QueryClientProvider client={queryClient}>
      <Workspace {...(initialSymbol !== undefined ? { initialSymbol } : {})} />
    </QueryClientProvider>
  );
}

function Workspace({ initialSymbol }: { initialSymbol?: string }) {
  // deep link from the token page: /terminal?symbol=<handle> selects the
  // AttentionFi source with that symbol active
  useEffect(() => {
    if (!initialSymbol) return;
    const settings = useSettings.getState();
    settings.setProvider("attentionfi");
    settings.setSymbol(initialSymbol);
  }, [initialSymbol]);

  useMarketFeeds();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Shown once, unprompted. The layout doesn't explain itself — which pane a
  // search retargets, or that a market's ticker and its subject are different
  // names — and every reader who works that out by trial has already been
  // confused by it.
  //
  // Read in the initializer (the terminal is ssr:false, so there's no server
  // render to mismatch) and marked seen from an effect. Doing both in the
  // initializer would break under StrictMode's double invocation: the second
  // call would see the flag it had just written and decide the guide was
  // already shown.
  const [guideOpen, setGuideOpen] = useState(() => {
    try {
      return !localStorage.getItem(GUIDE_SEEN_KEY);
    } catch {
      return false; // storage unavailable — skip rather than nag every load
    }
  });
  useEffect(() => {
    if (!guideOpen) return;
    try {
      localStorage.setItem(GUIDE_SEEN_KEY, "1");
    } catch {
      /* storage unavailable */
    }
  }, [guideOpen]);

  useKeyboard({
    openPalette: () => setPaletteOpen(true),
    openShortcuts: () => setShortcutsOpen((v) => !v),
  });

  const leftCollapsed = useLayout((s) => s.leftCollapsed);
  const rightCollapsed = useLayout((s) => s.rightCollapsed);
  const drawerCollapsed = useLayout((s) => s.drawerCollapsed);

  const leftRef = useRef<ImperativePanelHandle>(null);
  const rightRef = useRef<ImperativePanelHandle>(null);
  const drawerRef = useRef<ImperativePanelHandle>(null);

  useEffect(() => {
    const p = leftRef.current;
    if (!p) return;
    if (leftCollapsed && !p.isCollapsed()) p.collapse();
    if (!leftCollapsed && p.isCollapsed()) p.expand();
  }, [leftCollapsed]);
  useEffect(() => {
    const p = rightRef.current;
    if (!p) return;
    if (rightCollapsed && !p.isCollapsed()) p.collapse();
    if (!rightCollapsed && p.isCollapsed()) p.expand();
  }, [rightCollapsed]);
  useEffect(() => {
    const p = drawerRef.current;
    if (!p) return;
    if (drawerCollapsed && !p.isCollapsed()) p.collapse();
    if (!drawerCollapsed && p.isCollapsed()) p.expand();
  }, [drawerCollapsed]);

  return (
    <div className="tt-root flex h-screen flex-col overflow-hidden bg-canvas">
      <TopBar onOpenGuide={() => setGuideOpen(true)} />
      <div className="min-h-0 flex-1">
        <PanelGroup direction="horizontal" autoSaveId="tt-workspace-h">
          <Panel
            ref={leftRef}
            collapsible
            collapsedSize={0}
            defaultSize={14}
            minSize={10}
            maxSize={25}
            onCollapse={() => useLayout.setState({ leftCollapsed: true })}
            onExpand={() => useLayout.setState({ leftCollapsed: false })}
          >
            <WatchlistPanel />
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel defaultSize={66} minSize={30}>
            <PanelGroup direction="vertical" autoSaveId="tt-workspace-v">
              <Panel defaultSize={75} minSize={30}>
                <ChartArea />
              </Panel>
              <PanelResizeHandle className="resize-handle" />
              <Panel
                ref={drawerRef}
                collapsible
                collapsedSize={0}
                defaultSize={25}
                minSize={12}
                maxSize={55}
                onCollapse={() => useLayout.setState({ drawerCollapsed: true })}
                onExpand={() => useLayout.setState({ drawerCollapsed: false })}
              >
                <BottomDrawer />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="resize-handle" />
          <Panel
            ref={rightRef}
            collapsible
            collapsedSize={0}
            defaultSize={20}
            minSize={14}
            maxSize={32}
            onCollapse={() => useLayout.setState({ rightCollapsed: true })}
            onExpand={() => useLayout.setState({ rightCollapsed: false })}
          >
            <RightRail />
          </Panel>
        </PanelGroup>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <ShortcutsOverlay open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <TerminalGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      <AlertToast />
    </div>
  );
}
