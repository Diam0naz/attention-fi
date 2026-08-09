import { notFound } from "next/navigation";
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
  const { section } = await params;
  if (!SECTIONS.includes(section as Section)) notFound();
  return <NftManage section={section as Section} />;
}
