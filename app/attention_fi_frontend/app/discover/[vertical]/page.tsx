import { notFound } from "next/navigation";
import { verticalFromSlug } from "@/lib/mock-data";
import { VerticalDiscover } from "@/components/feed/vertical-discover";

export default async function VerticalPage({
  params,
}: {
  params: Promise<{ vertical: string }>;
}) {
  const { vertical: slug } = await params;
  const vertical = verticalFromSlug(slug);
  if (!vertical) notFound();
  return <VerticalDiscover vertical={vertical} />;
}
