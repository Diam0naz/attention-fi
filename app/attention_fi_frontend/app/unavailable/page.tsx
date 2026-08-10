import Link from "next/link";
import { Footer } from "@/components/feed/footer";

export const metadata = {
  title: "Not available in your region — AttentionFi",
  robots: { index: false, follow: false },
};

/**
 * Shown instead of the app to visitors in a blocked jurisdiction.
 *
 * Says which surfaces are unavailable and which aren't, rather than a bare
 * "access denied": the feed and the landing page stay open, and someone who
 * came to read what this is should still be able to.
 */
export default function Unavailable() {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-5 py-16">
        <h1 className="text-[19px] font-bold">Not available in your region</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-[#9a9a9a]">
          AttentionFi&apos;s trading surfaces — buying, selling, launching tokens and the NFT
          market — aren&apos;t offered in the United Kingdom.
        </p>
        <p className="mt-3 text-[13px] leading-relaxed text-[#9a9a9a]">
          The live mindshare feed and everything explaining how the protocol works stay open.
          Nothing about your wallet or your holdings is affected: the program is on Solana and
          this restriction applies to this interface, not to the chain.
        </p>
        <Link
          href="/"
          className="mt-6 inline-block w-fit rounded-sm border border-signal/50 px-4 py-2 font-mono text-[11px] font-bold text-signal transition-colors hover:bg-signal/10"
        >
          ← Back to the feed
        </Link>
      </main>
      <Footer />
    </div>
  );
}
