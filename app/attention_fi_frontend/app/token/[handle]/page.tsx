import { notFound } from "next/navigation";
import { getTokenDetail } from "@/lib/mock-data";
import { TokenDetailTerminal } from "@/components/token/token-detail";

export default async function TokenPage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const token = getTokenDetail(handle);
  if (!token) notFound();
  return <TokenDetailTerminal token={token} />;
}
