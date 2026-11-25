import { notFound } from "next/navigation";
import { SCOPE } from "@/lib/scope";

// Outside the current product scope (see lib/scope.ts). Guarding the segment's
// layout covers every page under /nft, including ones added later.
export default function NftLayout({ children }: { children: React.ReactNode }) {
  if (!SCOPE.nft) notFound();
  return children;
}
