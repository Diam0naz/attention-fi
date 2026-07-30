/**
 * Every skin a wallet is currently wearing, in one request.
 *
 * The collection grid renders many cards at once; asking per card would be a
 * request each and would still race. Facts come from the program's own PDAs —
 * which assets the wallet actually holds — and the skins from the database, so
 * a caller can't ask for someone else's asset and be told how it looks.
 */
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { getReadonlyProgram } from "@/lib/solana/program";
import { getAssetSkinWithUri, getSkinWithUri } from "@/lib/skin-db";

export const revalidate = 0;

export async function GET(request: Request) {
  const owner = new URL(request.url).searchParams.get("owner");
  if (!owner) return NextResponse.json({ error: "missing owner" }, { status: 400 });

  let ownerKey: PublicKey;
  try {
    ownerKey = new PublicKey(owner);
  } catch {
    return NextResponse.json({ error: "invalid owner address" }, { status: 400 });
  }

  try {
    const program = getReadonlyProgram();
    const ownerStr = ownerKey.toBase58();

    const [perks, genesis] = await Promise.all([
      program.account.perkNft.all(),
      program.account.genesisNft.all(),
    ]);

    const perkAsset = perks.find((p) => p.account.owner.toBase58() === ownerStr)?.account.asset;
    const genesisAssets = genesis
      .filter((g) => g.account.owner.toBase58() === ownerStr)
      .map((g) => g.account.asset.toBase58());

    const [verification, perkSkin, ...genesisSkins] = await Promise.all([
      getSkinWithUri(ownerStr),
      perkAsset ? getAssetSkinWithUri("perk", perkAsset.toBase58()) : Promise.resolve(null),
      ...genesisAssets.map((a) => getAssetSkinWithUri("genesis", a)),
    ]);

    const assets: Record<string, { skin: string | null; customUri: string | null }> = {};
    if (perkAsset && perkSkin) assets[perkAsset.toBase58()] = perkSkin;
    genesisAssets.forEach((a, i) => {
      const s = genesisSkins[i];
      if (s) assets[a] = s;
    });

    return NextResponse.json({
      verification: verification.skin,
      verificationUri: verification.customUri,
      perkAsset: perkAsset?.toBase58() ?? null,
      assets,
    });
  } catch {
    // Degrade to "no skins" rather than failing the grid: the cards are still
    // accurate about what's held, just not about how it's dressed.
    return NextResponse.json({ verification: null, verificationUri: null, assets: {} });
  }
}
