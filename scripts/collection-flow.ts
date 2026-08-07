/**
 * Exercise the collection listing flow end to end on devnet.
 * Usage: npx ts-node scripts/collection-flow.ts
 *
 * Proves the account layouts and the authority handoff for the four
 * instructions the UI doesn't reach yet: list_collection_auction,
 * buy_collection, reclaim_collection_auction, promote_listing.
 *
 * Spends ~0.35 devnet SOL and leaves three collections behind, which is the
 * price of exercising a real authority transfer — mpl-core has no way to
 * simulate one.
 *
 * Two collections, because the terminal states are mutually exclusive:
 *   A — created, members minted, listed, promoted, bought.
 *   B — created, listed, reclaimed.
 */
import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AttentionFi } from "../target/types/attention_fi";
import * as fs from "fs";
import * as os from "os";

const { PublicKey, Keypair, Connection } = anchor.web3;
const MPL_CORE = new PublicKey("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");

const seed = (s: string) => Buffer.from(s);
const pda = (seeds: Buffer[], programId: anchor.web3.PublicKey) =>
  PublicKey.findProgramAddressSync(seeds, programId)[0];

function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const rpc = process.env.ANCHOR_PROVIDER_URL ?? "https://api.devnet.solana.com";
  const walletPath = process.env.ANCHOR_WALLET ?? `${os.homedir()}/.config/solana/id.json`;
  const me = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8"))),
  );
  const connection = new Connection(rpc, "confirmed");
  const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(me), {
    commitment: "confirmed",
  });
  anchor.setProvider(provider);
  const idl = JSON.parse(fs.readFileSync("target/idl/attention_fi.json", "utf8"));
  const program = new Program(idl, provider) as Program<AttentionFi>;
  const P = program.programId;

  const globalPda = pda([seed("global")], P);
  const g = await program.account.global.fetch(globalPda);
  console.log(`wallet ${me.publicKey.toBase58()}`);
  console.log(`balance ${(await connection.getBalance(me.publicKey)) / 1e9} SOL`);
  console.log(`feeBps ${g.feeBps}, treasury ${g.treasury.toBase58()}`);

  // A distinct buyer, for two reasons. The treasury on this deployment is the
  // same wallet as the lister, so fee assertions made against it would be
  // measuring rent and tx costs at the same time and prove nothing. And a buy
  // where buyer == seller passes the authority-handoff check trivially — the
  // collection has to be seen moving to someone else.
  const buyer = Keypair.generate();
  const fund = new anchor.web3.Transaction().add(
    anchor.web3.SystemProgram.transfer({
      fromPubkey: me.publicKey,
      toPubkey: buyer.publicKey,
      lamports: 0.3 * 1e9,
    }),
  );
  await anchor.web3.sendAndConfirmTransaction(connection, fund, [me]);
  console.log(`buyer ${buyer.publicKey.toBase58()} funded 0.3 SOL\n`);

  /* ── A: create → mint members → list → promote → buy ─────────────────── */
  console.log("== collection A: sale path ==");
  const collA = Keypair.generate();
  await program.methods
    .createCollection("Flow Test A", "https://example.com/a.json")
    .accountsPartial({ payer: me.publicKey, collection: collA.publicKey })
    .signers([collA])
    .rpc();
  console.log(`  collection ${collA.publicKey.toBase58()}`);

  // Two members, so `size` in the listing event is a number worth checking.
  for (let i = 0; i < 2; i++) {
    const asset = Keypair.generate();
    await program.methods
      .mintNft(`Member ${i + 1}`, "https://example.com/m.json")
      .accountsPartial({
        payer: me.publicKey,
        recipient: me.publicKey,
        asset: asset.publicKey,
        collection: collA.publicKey,
      })
      .signers([asset])
      .rpc();
  }
  console.log("  minted 2 members");

  const auctionA = pda([seed("colauction"), collA.publicKey.toBuffer()], P);
  const priceSol = 0.05;
  const price = Math.floor(priceSol * 1e9);

  // Perpetual: start == floor, duration 0 — the shape validate_listing requires.
  const listSig = await program.methods
    .listCollectionAuction(new anchor.BN(price), new anchor.BN(price), new anchor.BN(0))
    .accountsPartial({
      creator: me.publicKey,
      auction: auctionA,
      collection: collA.publicKey,
      mplCoreProgram: MPL_CORE,
    })
    .rpc();
  console.log(`  listed: ${listSig.slice(0, 12)}…`);

  const a1 = await program.account.collectionAuction.fetch(auctionA);
  ok("auction records the collection", a1.collection.toBase58() === collA.publicKey.toBase58());
  ok("auction records the lister", a1.creator.toBase58() === me.publicKey.toBase58());
  ok("perpetual duration stored as 0", Number(a1.duration) === 0);
  ok("not complete", a1.complete === false);

  // The escrow PDA must now be the collection's update authority, or the
  // handover silently didn't happen and reclaim/buy would strand it.
  const collAccBefore = await connection.getAccountInfo(collA.publicKey);
  const uaBefore = new PublicKey(collAccBefore!.data.subarray(1, 33)).toBase58();
  ok("collection authority moved to escrow", uaBefore === auctionA.toBase58(), uaBefore);

  // promote_listing on a collection: nft_auction null, collection_auction set.
  const promoA = pda([seed("promo"), collA.publicKey.toBuffer()], P);
  const promoDays = 3;
  const promoPayerBefore = await connection.getBalance(buyer.publicKey);
  const promoSig = await program.methods
    .promoteListing(promoDays)
    .accountsPartial({
      payer: buyer.publicKey,
      treasury: g.treasury,
      subject: collA.publicKey,
      nftAuction: null,
      collectionAuction: auctionA,
      promotion: promoA,
    })
    .signers([buyer])
    .rpc();
  console.log(`  promoted: ${promoSig.slice(0, 12)}…`);
  const promo = await program.account.promotion.fetch(promoA);
  ok("promotion bound to the collection", promo.subject.toBase58() === collA.publicKey.toBase58());
  const promoExpected = promoDays * (1e9 / 100);
  const promoSpent = promoPayerBefore - (await connection.getBalance(buyer.publicKey));
  ok(
    "promotion fee charged (3 days @ 0.01 SOL)",
    promoSpent >= promoExpected && promoSpent < promoExpected + 0.01 * 1e9,
    `payer spent ${promoSpent}, fee ${promoExpected} + rent + tx`,
  );
  ok(
    "promoted_until is in the future",
    Number(promo.promotedUntil) > Math.floor(Date.now() / 1000),
  );

  // Treasury and creator are the same wallet here, so it nets price + fee.
  const sellerBefore = await connection.getBalance(me.publicKey);
  const buyerBefore = await connection.getBalance(buyer.publicKey);

  const buySig = await program.methods
    .buyCollection(new anchor.BN(price))
    .accountsPartial({
      buyer: buyer.publicKey,
      treasury: g.treasury,
      creator: me.publicKey,
      auction: auctionA,
      collection: collA.publicKey,
      mplCoreProgram: MPL_CORE,
    })
    .signers([buyer])
    .rpc();
  console.log(`  bought: ${buySig.slice(0, 12)}…`);

  const a2 = await program.account.collectionAuction.fetch(auctionA);
  ok("auction marked complete", a2.complete === true);

  const collAccAfter = await connection.getAccountInfo(collA.publicKey);
  const uaAfter = new PublicKey(collAccAfter!.data.subarray(1, 33)).toBase58();
  ok(
    "authority handed to the buyer (a different wallet)",
    uaAfter === buyer.publicKey.toBase58(),
    uaAfter,
  );

  const expectedFee = Math.floor((price * g.feeBps) / 10_000);
  const sellerGained = (await connection.getBalance(me.publicKey)) - sellerBefore;
  const buyerSpent = buyerBefore - (await connection.getBalance(buyer.publicKey));
  // Anchor uses the provider wallet as fee payer, and that's the seller here,
  // so its balance nets the network fee out of the proceeds. Read the actual
  // fee from the transaction rather than assuming a signature count.
  const buyTx = await connection.getTransaction(buySig, {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  });
  const networkFee = buyTx?.meta?.fee ?? 0;
  // Seller is also the treasury on this deployment, so it collects both legs.
  ok(
    "seller + treasury received price + fee exactly",
    sellerGained === price + expectedFee - networkFee,
    `got ${sellerGained}, expected ${price + expectedFee} less ${networkFee} network fee`,
  );
  // Buyer pays the same, plus its own tx fee — proving neither leg was charged
  // twice.
  ok(
    "buyer charged price + fee (plus tx only)",
    buyerSpent >= price + expectedFee && buyerSpent < price + expectedFee + 0.01 * 1e9,
    `spent ${buyerSpent}, expected ${price + expectedFee} + tx`,
  );

  // The sale price should now be recorded on the collection's own plugin
  // registry — the whole point of pricing a collection as one thing.
  ok(
    "collection grew a plugin registry (last sale)",
    collAccAfter!.data.length > collAccBefore!.data.length,
    `${collAccBefore!.data.length} -> ${collAccAfter!.data.length} bytes`,
  );

  // A sold listing must refuse a second buyer.
  let refused = false;
  try {
    await program.methods
      .buyCollection(new anchor.BN(price))
      .accountsPartial({
        buyer: buyer.publicKey,
        treasury: g.treasury,
        creator: me.publicKey,
        auction: auctionA,
        collection: collA.publicKey,
        mplCoreProgram: MPL_CORE,
      })
      .signers([buyer])
      .rpc();
  } catch (e) {
    refused = String(e).includes("SoldOut");
  }
  ok("second buy refused as SoldOut", refused);

  /* ── B: create → list → reclaim ──────────────────────────────────────── */
  console.log("\n== collection B: reclaim path ==");
  const collB = Keypair.generate();
  await program.methods
    .createCollection("Flow Test B", "https://example.com/b.json")
    .accountsPartial({ payer: me.publicKey, collection: collB.publicKey })
    .signers([collB])
    .rpc();
  const auctionB = pda([seed("colauction"), collB.publicKey.toBuffer()], P);
  console.log(`  collection ${collB.publicKey.toBase58()}`);

  await program.methods
    .listCollectionAuction(new anchor.BN(price), new anchor.BN(price), new anchor.BN(0))
    .accountsPartial({
      creator: me.publicKey,
      auction: auctionB,
      collection: collB.publicKey,
      mplCoreProgram: MPL_CORE,
    })
    .rpc();
  console.log("  listed");

  const reclaimSig = await program.methods
    .reclaimCollectionAuction()
    .accountsPartial({
      payer: me.publicKey,
      creator: me.publicKey,
      auction: auctionB,
      collection: collB.publicKey,
      mplCoreProgram: MPL_CORE,
    })
    .rpc();
  console.log(`  reclaimed: ${reclaimSig.slice(0, 12)}…`);

  const collBAfter = await connection.getAccountInfo(collB.publicKey);
  const uaB = new PublicKey(collBAfter!.data.subarray(1, 33)).toBase58();
  ok("authority returned to the lister", uaB === me.publicKey.toBase58(), uaB);
  const b2 = await program.account.collectionAuction.fetch(auctionB);
  ok("reclaimed listing marked complete", b2.complete === true);

  console.log(
    `\n${process.exitCode ? "SOME CHECKS FAILED" : "all checks passed"}`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
