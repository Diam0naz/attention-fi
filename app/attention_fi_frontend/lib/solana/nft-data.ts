import type { Program } from "@anchor-lang/core";
import type { PublicKey } from "@solana/web3.js";
import type { AttentionFi } from "@/lib/idl/attention_fi";
import type { NftCardData } from "@/components/nft/nft-card";

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * The AttentionFi NFTs owned by a wallet, read from the program's PDAs
 * (verification by subject, perk + genesis by owner). Maps to NftCardData for
 * the collection grid. Returns [] when the wallet holds none.
 */
export async function fetchOwnedNfts(program: Program<AttentionFi>, owner: PublicKey): Promise<NftCardData[]> {
  const ownerStr = owner.toBase58();
  const [genesis, perks, verifications] = await Promise.all([
    program.account.genesisNft.all(),
    program.account.perkNft.all(),
    program.account.verification.all(),
  ]);

  const out: NftCardData[] = [];
  for (const v of verifications) {
    if (v.account.subject.toBase58() === ownerStr) {
      out.push({ kind: "verification", handle: v.account.handle });
    }
  }
  for (const p of perks) {
    if (p.account.owner.toBase58() === ownerStr) {
      out.push({ kind: "perk", level: p.account.level, discountBps: p.account.discountBps });
    }
  }
  for (const g of genesis) {
    if (g.account.owner.toBase58() === ownerStr) {
      out.push({ kind: "genesis", shareBps: g.account.shareBps, id: short(g.account.asset.toBase58()) });
    }
  }
  return out;
}
