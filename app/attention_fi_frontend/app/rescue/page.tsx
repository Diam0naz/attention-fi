import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Footer } from "@/components/feed/footer";
import { StrandedCards } from "@/components/nft/stranded-cards";

export const metadata = {
  title: "Deliver owed cards — AttentionFi",
  robots: { index: false, follow: false },
};

/**
 * A one-off page for completing collection sales that predate the escrow fix.
 *
 * Its own route rather than a tab inside the NFT screens: it is temporary, it
 * applies to a handful of wallets, and putting it in the normal flow would
 * imply an ongoing state of affairs rather than a backlog being cleared. When
 * the panel reports nothing owed for everyone concerned, this whole directory
 * can be deleted.
 *
 * Unindexed, because it means nothing to anyone who wasn't affected.
 */
export default function RescuePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <Link
          href="/nft"
          className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#6B6B6B] transition-colors hover:text-[#F5F4F0]"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> NFTs
        </Link>

        <h1 className="mt-5 text-[19px] font-bold">Cards you still owe</h1>
        <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-[#9a9a9a]">
          Selling a collection used to transfer only the collection itself, leaving its cards in
          the seller&apos;s wallet. Sales made now hand the cards over as part of the purchase.
          This clears the ones made before that.
        </p>
        <p className="mt-2 max-w-xl text-[12px] leading-relaxed text-[#6B6B6B]">
          Connect the wallet that sold the collection — the cards can only be released by whoever
          holds them, so no admin key or buyer action can substitute.
        </p>

        <div className="mt-6">
          <StrandedCards />
        </div>
      </main>
      <Footer />
    </div>
  );
}
