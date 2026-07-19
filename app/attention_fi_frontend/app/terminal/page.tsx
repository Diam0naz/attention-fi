import type { Metadata } from "next";
import { ClientTerminal } from "@/lib/terminal-app/components/ClientTerminal";

export const metadata: Metadata = {
  title: "Terminal — AttentionFi",
  description:
    "Pro trading terminal for attention markets: live bonding-curve data, indicators, drawings, and on-chain trading.",
};

export default function TerminalPage() {
  return <ClientTerminal />;
}
