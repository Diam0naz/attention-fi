"use client";

import { Component, type ReactNode } from "react";
import { Aurora } from "./aurora";
import { Threads } from "./threads";

/** Renders the primary background; falls back to Threads if it throws on mount. */
class BgBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function PageBackground({ className = "h-full w-full" }: { className?: string }) {
  return (
    <BgBoundary fallback={<Threads count={9} className={className} />}>
      <Aurora className={className} />
    </BgBoundary>
  );
}
