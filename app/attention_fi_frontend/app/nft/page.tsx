import { notFound } from "next/navigation";
import { SCOPE } from "@/lib/scope";
import { NftView } from "@/components/nft/nft-view";

export default function NftPage() {
  // Out of scope (lib/scope.ts). Checked here as well as in the layout so the
  // response carries a 404 status, not just the not-found page.
  if (!SCOPE.nft) notFound();
  return <NftView />;
}
