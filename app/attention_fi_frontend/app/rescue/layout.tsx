import { notFound } from "next/navigation";
import { SCOPE } from "@/lib/scope";

// Stranded-card rescue belongs to the NFT layer, outside the current product
// scope (see lib/scope.ts).
export default function RescueLayout({ children }: { children: React.ReactNode }) {
  if (!SCOPE.nft) notFound();
  return children;
}
