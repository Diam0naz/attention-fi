"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type RightTab = "book" | "tape" | "order" | "positions";
export type DrawerTab = "screener" | "alerts" | "log" | "network";

interface LayoutState {
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  drawerCollapsed: boolean;
  rightTab: RightTab;
  drawerTab: DrawerTab;
  toggleLeft: () => void;
  toggleRight: () => void;
  toggleDrawer: () => void;
  setRightTab: (t: RightTab) => void;
  setDrawerTab: (t: DrawerTab) => void;
  openDrawer: (t: DrawerTab) => void;
}

export const useLayout = create<LayoutState>()(
  persist(
    (set) => ({
      leftCollapsed: false,
      rightCollapsed: false,
      drawerCollapsed: true,
      rightTab: "book",
      drawerTab: "screener",
      toggleLeft: () => set((s) => ({ leftCollapsed: !s.leftCollapsed })),
      toggleRight: () => set((s) => ({ rightCollapsed: !s.rightCollapsed })),
      toggleDrawer: () => set((s) => ({ drawerCollapsed: !s.drawerCollapsed })),
      setRightTab: (rightTab) => set({ rightTab, rightCollapsed: false }),
      setDrawerTab: (drawerTab) => set({ drawerTab }),
      openDrawer: (drawerTab) => set({ drawerTab, drawerCollapsed: false }),
    }),
    { name: "tt.layout" },
  ),
);
