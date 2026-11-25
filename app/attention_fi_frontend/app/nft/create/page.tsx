import { notFound } from "next/navigation";
import { SCOPE } from "@/lib/scope";
import { NftCreateFlow } from "@/components/nft/nft-create-flow";

export default function NftCreatePage() {
  // Out of scope (lib/scope.ts). Checked here as well as in the layout so the
  // response carries a 404 status, not just the not-found page.
  if (!SCOPE.nft) notFound();
  return <NftCreateFlow />;
}
