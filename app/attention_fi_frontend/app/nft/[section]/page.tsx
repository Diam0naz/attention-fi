import { notFound } from "next/navigation";
import { SCOPE } from "@/lib/scope";
import { NftManage, type Section } from "@/components/nft/nft-manage";

const SECTIONS = [
  "verification",
  "perk",
  "genesis",
  "runs",
  "auctions",
  "collectibles",
  "collections",
] as const;

export default async function NftSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  // Out of scope (lib/scope.ts). Checked here as well as in the layout so the
  // response carries a 404 status, not just the not-found page.
  if (!SCOPE.nft) notFound();
  const { section } = await params;
  if (!SECTIONS.includes(section as Section)) notFound();
  return <NftManage section={section as Section} />;
}
