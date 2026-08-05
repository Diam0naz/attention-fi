import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AttentionFi } from "../target/types/attention_fi";
import { assert } from "chai";
import * as fs from "fs";

const { PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY, LAMPORTS_PER_SOL } =
  anchor.web3;
type PublicKey = anchor.web3.PublicKey;

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
);
const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
);
const MPL_CORE_PROGRAM_ID = new PublicKey(
  "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
);

// Mirror the tier seeds from constants.rs (lamports of starting virtual SOL).
const SEED_TOP_100 = 26_700_000_000;
const TOKEN_TOTAL_SUPPLY = "1000000000000000"; // 1e9 * 1e6

function ata(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

describe("attention_fi bonding curve", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  // Shared across the ordered test cases.
  let treasury: PublicKey;
  const mintKp = Keypair.generate();
  const [curvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), mintKp.publicKey.toBuffer()],
    program.programId
  );
  const vault = ata(curvePda, mintKp.publicKey);
  const buyerAta = ata(wallet, mintKp.publicKey);

  async function tokenAmount(account: PublicKey): Promise<bigint> {
    const bal = await provider.connection.getTokenAccountBalance(account);
    return BigInt(bal.value.amount);
  }

  it("initializes global config", async () => {
    // Reuse existing config if the validator already has one (idempotent re-runs).
    const existing = await program.account.global.fetchNullable(globalPda);
    if (existing) {
      treasury = existing.treasury;
      return;
    }
    treasury = Keypair.generate().publicKey;
    await program.methods
      .initialize()
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        treasury,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const global = await program.account.global.fetch(globalPda);
    assert.strictEqual(global.treasury.toBase58(), treasury.toBase58());
    assert.strictEqual(global.feeBps, 100);
  });

  it("launches a Top100 token seeded from mindshare tier", async () => {
    await program.methods
      .launchToken({ top100: {} })
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: mintKp.publicKey,
        curve: curvePda,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    const curve = await program.account.bondingCurve.fetch(curvePda);
    assert.strictEqual(
      curve.virtualSolReserves.toString(),
      SEED_TOP_100.toString(),
      "curve seeded from Top100 tier"
    );
    assert.strictEqual(curve.realTokenReserves.toString(), TOKEN_TOTAL_SUPPLY);
    assert.strictEqual(curve.complete, false);
    assert.strictEqual(curve.tier, 2);
    assert.strictEqual((await tokenAmount(vault)).toString(), TOKEN_TOTAL_SUPPLY);
  });

  it("buys tokens along the curve and takes a fee", async () => {
    const solIn = new anchor.BN(2 * LAMPORTS_PER_SOL);
    const treasuryBefore = await provider.connection.getBalance(treasury);

    await program.methods
      .buy(solIn, new anchor.BN(0))
      .accountsStrict({
        buyer: wallet,
        global: globalPda,
        treasury,
        curve: curvePda,
        mint: mintKp.publicKey,
        vault,
        buyerTokenAccount: buyerAta,
        perk: null,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const bought = await tokenAmount(buyerAta);
    assert.isTrue(bought > 0n, "buyer received tokens");

    const curve = await program.account.bondingCurve.fetch(curvePda);
    // 2 SOL in, 1% fee => 1.98 SOL into the curve reserves.
    assert.strictEqual(curve.realSolReserves.toString(), "1980000000");
    assert.strictEqual(curve.complete, false, "well below graduation threshold");
    // 1% fee = 0.02 SOL, split 50/50: 0.01 accrues to the creator on the curve.
    assert.strictEqual(curve.creatorFees.toString(), "10000000", "creator cut accrued");

    const treasuryAfter = await provider.connection.getBalance(treasury);
    assert.strictEqual(
      treasuryAfter - treasuryBefore,
      0.01 * LAMPORTS_PER_SOL,
      "protocol cut = half the 1% fee on 2 SOL"
    );
  });

  it("sells tokens back into the curve", async () => {
    const held = await tokenAmount(buyerAta);
    const sellAmount = new anchor.BN((held / 2n).toString());
    const curveBefore = await program.account.bondingCurve.fetch(curvePda);

    await program.methods
      .sell(sellAmount, new anchor.BN(0))
      .accountsStrict({
        seller: wallet,
        global: globalPda,
        treasury,
        curve: curvePda,
        mint: mintKp.publicKey,
        vault,
        sellerTokenAccount: buyerAta,
        perk: null,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const afterHeld = await tokenAmount(buyerAta);
    assert.isTrue(afterHeld < held, "seller's token balance decreased");

    const curveAfter = await program.account.bondingCurve.fetch(curvePda);
    assert.isTrue(
      curveAfter.realTokenReserves.gt(curveBefore.realTokenReserves),
      "tokens returned to the curve vault"
    );
    assert.isTrue(
      curveAfter.realSolReserves.lt(curveBefore.realSolReserves),
      "SOL paid out of the curve reserves"
    );
  });
});

describe("attention_fi dutch auction", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  const START_PRICE = 1000; // lamports per whole token (ceiling)
  const FLOOR_PRICE = 100; // lamports per whole token
  const DURATION = 3600; // 1h — long enough not to end mid-test
  const TOTAL_FOR_SALE = "1000000000000000"; // whole minted supply (base units)

  let treasury: PublicKey;
  const mintKp = Keypair.generate();
  const [auctionPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("auction"), mintKp.publicKey.toBuffer()],
    program.programId
  );
  const vault = ata(auctionPda, mintKp.publicKey);
  const bidderAta = ata(wallet, mintKp.publicKey);

  async function tokenAmount(account: PublicKey): Promise<bigint> {
    const bal = await provider.connection.getTokenAccountBalance(account);
    return BigInt(bal.value.amount);
  }

  before(async () => {
    // Global is initialized by the bonding-curve suite that runs first; if this
    // suite runs alone, create it here.
    let global = await program.account.global.fetchNullable(globalPda);
    if (!global) {
      treasury = Keypair.generate().publicKey;
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          treasury,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      global = await program.account.global.fetch(globalPda);
    }
    treasury = global.treasury;
  });

  it("starts a descending-price auction", async () => {
    await program.methods
      .startAuction(
        { emerging: {} },
        new anchor.BN(START_PRICE),
        new anchor.BN(FLOOR_PRICE),
        new anchor.BN(DURATION)
      )
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: mintKp.publicKey,
        auction: auctionPda,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    const auction = await program.account.dutchAuction.fetch(auctionPda);
    assert.strictEqual(auction.startPrice.toString(), START_PRICE.toString());
    assert.strictEqual(auction.floorPrice.toString(), FLOOR_PRICE.toString());
    assert.strictEqual(auction.tokensSold.toString(), "0");
    assert.strictEqual(auction.complete, false);
    assert.strictEqual((await tokenAmount(vault)).toString(), TOTAL_FOR_SALE);
  });

  it("rejects a bid priced above the bidder's max", async () => {
    let threw = false;
    try {
      await program.methods
        .bid(new anchor.BN(1_000_000), new anchor.BN(FLOOR_PRICE - 1)) // cap below current price
        .accountsStrict({
          bidder: wallet,
          global: globalPda,
          treasury,
          auction: auctionPda,
          mint: mintKp.publicKey,
          vault,
          bidderTokenAccount: bidderAta,
          systemProgram: SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
          associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        })
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(String(err), "PriceAboveMax");
    }
    assert.isTrue(threw, "bid above max price must be rejected");
  });

  it("rejects settling before the auction has ended", async () => {
    let threw = false;
    try {
      await program.methods
        .settleAuction()
        .accountsStrict({
          caller: wallet,
          global: globalPda,
          auction: auctionPda,
          mint: mintKp.publicKey,
        })
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(String(err), "AuctionNotEnded");
    }
    assert.isTrue(threw, "settle before end must be rejected");
  });

  it("bids and sells out the whole allocation", async () => {
    const total = BigInt(TOTAL_FOR_SALE);
    await program.methods
      .bid(new anchor.BN(total.toString()), new anchor.BN(START_PRICE))
      .accountsStrict({
        bidder: wallet,
        global: globalPda,
        treasury,
        auction: auctionPda,
        mint: mintKp.publicKey,
        vault,
        bidderTokenAccount: bidderAta,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    assert.strictEqual((await tokenAmount(bidderAta)).toString(), TOTAL_FOR_SALE);
    const auction = await program.account.dutchAuction.fetch(auctionPda);
    assert.strictEqual(auction.tokensSold.toString(), TOTAL_FOR_SALE);
    assert.strictEqual(auction.complete, true, "auction marked complete when sold out");
    assert.isTrue(auction.realSolReserves.gt(new anchor.BN(0)), "proceeds collected");
  });
});

describe("attention_fi conviction curve", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  const PENALTY_BPS = 1000; // 10%
  let treasury: PublicKey;

  before(async () => {
    let global = await program.account.global.fetchNullable(globalPda);
    if (!global) {
      treasury = Keypair.generate().publicKey;
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          treasury,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      global = await program.account.global.fetch(globalPda);
    }
    treasury = global.treasury;
  });

  // Launch an Emerging-tier conviction curve, buy 2 SOL, then sell the whole
  // position. Returns the treasury balance gained on the sell (fee [+ penalty]).
  async function runCycle(lockPeriod: number): Promise<bigint> {
    const mintKp = Keypair.generate();
    const [curvePda] = PublicKey.findProgramAddressSync(
      [Buffer.from("conviction"), mintKp.publicKey.toBuffer()],
      program.programId
    );
    const [positionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("position"), mintKp.publicKey.toBuffer(), wallet.toBuffer()],
      program.programId
    );
    const vault = ata(curvePda, mintKp.publicKey);
    const holderAta = ata(wallet, mintKp.publicKey);

    await program.methods
      .launchConviction({ emerging: {} }, new anchor.BN(lockPeriod), PENALTY_BPS)
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: mintKp.publicKey,
        curve: curvePda,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    await program.methods
      .buyConviction(new anchor.BN(2 * LAMPORTS_PER_SOL), new anchor.BN(0))
      .accountsStrict({
        buyer: wallet,
        global: globalPda,
        treasury,
        curve: curvePda,
        mint: mintKp.publicKey,
        vault,
        buyerTokenAccount: holderAta,
        position: positionPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const position = await program.account.convictionPosition.fetch(positionPda);
    assert.isTrue(position.amount.gt(new anchor.BN(0)), "position recorded");

    const treasuryBefore = await provider.connection.getBalance(treasury);
    await program.methods
      .sellConviction(position.amount, new anchor.BN(0))
      .accountsStrict({
        seller: wallet,
        global: globalPda,
        treasury,
        curve: curvePda,
        mint: mintKp.publicKey,
        vault,
        sellerTokenAccount: holderAta,
        position: positionPda,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();
    const treasuryAfter = await provider.connection.getBalance(treasury);

    const closed = await program.account.convictionPosition.fetch(positionPda);
    assert.strictEqual(closed.amount.toString(), "0", "position fully sold");

    return BigInt(treasuryAfter - treasuryBefore);
  }

  it("charges an early-exit penalty on a still-locked sell but not an unlocked one", async () => {
    // Identical curves + identical 2 SOL buys => identical gross sell proceeds,
    // so the treasury delta differs only by the early-exit penalty.
    const unlockedTreasuryGain = await runCycle(0); // unlock_time = now => no penalty
    const lockedTreasuryGain = await runCycle(365 * 24 * 60 * 60); // 1y lock => penalty

    assert.isTrue(
      lockedTreasuryGain > unlockedTreasuryGain,
      "locked sell routes fee + penalty; unlocked routes fee only"
    );
    // The extra the treasury received on the locked sell is the penalty (~10% of
    // net proceeds), which must dwarf the fixed fee difference (there is none).
    assert.isTrue(
      lockedTreasuryGain - unlockedTreasuryGain > 0n,
      "penalty forfeited to the protocol"
    );
  });
});

describe("attention_fi revenue share", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  const ACC_SCALE = new anchor.BN("1000000000000");
  const SHARE_PRICE = 1000; // lamports per whole token
  const DEPOSIT = 1 * LAMPORTS_PER_SOL;

  let treasury: PublicKey;
  const holder2 = Keypair.generate();
  const mintKp = Keypair.generate();
  const [revenuePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("revenue"), mintKp.publicKey.toBuffer()],
    program.programId
  );
  const vault = ata(revenuePda, mintKp.publicKey);
  const stake1 = PublicKey.findProgramAddressSync(
    [Buffer.from("revstake"), mintKp.publicKey.toBuffer(), wallet.toBuffer()],
    program.programId
  )[0];
  const stake2 = PublicKey.findProgramAddressSync(
    [Buffer.from("revstake"), mintKp.publicKey.toBuffer(), holder2.publicKey.toBuffer()],
    program.programId
  )[0];

  function pending(stake: { stakedAmount: any; rewardDebt: any }, acc: any): bigint {
    const accrued = stake.stakedAmount.mul(acc).div(ACC_SCALE);
    return BigInt(accrued.sub(stake.rewardDebt).toString());
  }

  before(async () => {
    let global = await program.account.global.fetchNullable(globalPda);
    if (!global) {
      treasury = Keypair.generate().publicKey;
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          treasury,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      global = await program.account.global.fetch(globalPda);
    }
    treasury = global.treasury;

    // Fund holder2 so it can buy shares and pay for its stake account.
    const sig = await provider.connection.requestAirdrop(
      holder2.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");
  });

  it("launches a revenue-share pool", async () => {
    await program.methods
      .launchRevenue({ emerging: {} }, new anchor.BN(SHARE_PRICE))
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: mintKp.publicKey,
        revenue: revenuePda,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    const rev = await program.account.revenueShare.fetch(revenuePda);
    assert.strictEqual(rev.sharePrice.toString(), SHARE_PRICE.toString());
    assert.strictEqual(rev.totalStaked.toString(), "0");
  });

  it("sells shares to two holders (3:1) and splits a deposit pro-rata", async () => {
    // holder1 (wallet) buys 3 whole tokens, holder2 buys 1.
    await program.methods
      .buyRevenue(new anchor.BN(3_000_000))
      .accountsStrict({
        buyer: wallet,
        global: globalPda,
        treasury,
        revenue: revenuePda,
        mint: mintKp.publicKey,
        position: stake1,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    await program.methods
      .buyRevenue(new anchor.BN(1_000_000))
      .accountsStrict({
        buyer: holder2.publicKey,
        global: globalPda,
        treasury,
        revenue: revenuePda,
        mint: mintKp.publicKey,
        position: stake2,
        systemProgram: SystemProgram.programId,
      })
      .signers([holder2])
      .rpc();

    let rev = await program.account.revenueShare.fetch(revenuePda);
    assert.strictEqual(rev.totalStaked.toString(), "4000000", "4 shares staked");

    // Deposit 1 SOL of revenue.
    await program.methods
      .depositRevenue(new anchor.BN(DEPOSIT))
      .accountsStrict({
        depositor: wallet,
        revenue: revenuePda,
        mint: mintKp.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    rev = await program.account.revenueShare.fetch(revenuePda);
    const acc = rev.accRevenuePerShare;
    const p1 = pending(await program.account.revenueStake.fetch(stake1), acc);
    const p2 = pending(await program.account.revenueStake.fetch(stake2), acc);

    assert.strictEqual(p1, (BigInt(DEPOSIT) * 3n) / 4n, "holder1 gets 3/4");
    assert.strictEqual(p2, BigInt(DEPOSIT) / 4n, "holder2 gets 1/4");
    assert.strictEqual(p1 + p2, BigInt(DEPOSIT), "no revenue lost");
  });

  it("lets a holder claim their accrued revenue", async () => {
    const revBefore = await program.account.revenueShare.fetch(revenuePda);
    const expected = BigInt(DEPOSIT) / 4n;

    await program.methods
      .claimRevenue()
      .accountsStrict({
        holder: holder2.publicKey,
        revenue: revenuePda,
        mint: mintKp.publicKey,
        position: stake2,
        owner: holder2.publicKey,
      })
      .signers([holder2])
      .rpc();

    const revAfter = await program.account.revenueShare.fetch(revenuePda);
    const drained =
      BigInt(revBefore.revenueReserves.toString()) -
      BigInt(revAfter.revenueReserves.toString());
    assert.strictEqual(drained, expected, "reserves drop by holder2's 1/4 share");

    const stake = await program.account.revenueStake.fetch(stake2);
    assert.strictEqual(stake.unclaimed.toString(), "0", "position settled after claim");
  });
});

describe("attention_fi verification NFT (SAS-gated)", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  // Preloaded attestation accounts (see tests/fixtures/sas.json, written by the
  // test harness before the validator starts).
  const fixtures = JSON.parse(
    fs.readFileSync("tests/fixtures/sas.json", "utf-8")
  );
  const subject = new PublicKey(fixtures.subject);
  const subject2 = new PublicKey(fixtures.subject2);
  const attValid = new PublicKey(fixtures.attValid);
  const attInvalid = new PublicKey(fixtures.attInvalid);
  const handle: string = fixtures.handle;

  function verifyPda(s: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [Buffer.from("verify"), s.toBuffer()],
      program.programId
    )[0];
  }

  before(async () => {
    // The attestation's signer is the wallet (id.json), so global.authority
    // must be the wallet for the signer check to pass.
    const global = await program.account.global.fetchNullable(globalPda);
    if (!global) {
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          treasury: Keypair.generate().publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("mints a soulbound credential from a valid SAS attestation", async () => {
    const asset = Keypair.generate();
    await program.methods
      .verifyHandle(handle, "https://attention.fi/v/vitalik.json")
      .accountsStrict({
        payer: wallet,
        global: globalPda,
        issuerConfig: null,
        subject,
        attestation: attValid,
        verification: verifyPda(subject),
        asset: asset.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([asset])
      .rpc();

    const v = await program.account.verification.fetch(verifyPda(subject));
    assert.strictEqual(v.handle, handle);
    assert.strictEqual(v.subject.toBase58(), subject.toBase58());
    assert.strictEqual(v.asset.toBase58(), asset.publicKey.toBase58());

    const assetAccount = await provider.connection.getAccountInfo(asset.publicKey);
    assert.strictEqual(
      assetAccount!.owner.toBase58(),
      MPL_CORE_PROGRAM_ID.toBase58(),
      "asset owned by MPL Core"
    );
  });

  it("rejects an attestation signed by a non-issuer", async () => {
    const asset = Keypair.generate();
    let threw = false;
    try {
      await program.methods
        .verifyHandle(handle, "https://x/y.json")
        .accountsStrict({
          payer: wallet,
          global: globalPda,
          issuerConfig: null,
          subject: subject2,
          attestation: attInvalid,
          verification: verifyPda(subject2),
          asset: asset.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([asset])
        .rpc();
    } catch (err) {
      threw = true;
    }
    assert.isTrue(threw, "attestation not signed by the protocol issuer is rejected");
  });
});

describe("attention_fi perk & genesis NFTs", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  const [perkAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("perkauth")],
    program.programId
  );

  before(async () => {
    const global = await program.account.global.fetchNullable(globalPda);
    if (!global) {
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          treasury: Keypair.generate().publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
  });

  it("mints an upgradeable perk NFT and levels it up (raising the discount)", async () => {
    const recipient = Keypair.generate().publicKey;
    const asset = Keypair.generate();
    const [perkPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("perk"), asset.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .mintPerk("https://attention.fi/perk.json")
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        recipient,
        perkAuthority,
        perk: perkPda,
        asset: asset.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([asset])
      .rpc();

    let perk = await program.account.perkNft.fetch(perkPda);
    assert.strictEqual(perk.level, 1);
    assert.strictEqual(perk.discountBps, 1000, "level 1 => 10% off the fee");

    await program.methods
      .levelUp()
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        perkAuthority,
        perk: perkPda,
        asset: asset.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    perk = await program.account.perkNft.fetch(perkPda);
    assert.strictEqual(perk.level, 2, "leveled up");
    assert.strictEqual(perk.discountBps, 2000, "level 2 => 20% off the fee");

    // Confirm the Core asset itself is real and Core-owned.
    const acc = await provider.connection.getAccountInfo(asset.publicKey);
    assert.strictEqual(acc!.owner.toBase58(), MPL_CORE_PROGRAM_ID.toBase58());
  });

  it("mints a transferable fee-share genesis NFT for a token", async () => {
    const recipient = Keypair.generate().publicKey;
    const subjectMint = Keypair.generate().publicKey;
    const asset = Keypair.generate();
    const [genesisPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("genesis"), asset.publicKey.toBuffer()],
      program.programId
    );
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("genpool"), subjectMint.toBuffer()],
      program.programId
    );

    await program.methods
      .mintGenesis(500, "https://attention.fi/genesis.json")
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        recipient,
        subjectMint,
        genesis: genesisPda,
        pool: poolPda,
        asset: asset.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([asset])
      .rpc();

    const g = await program.account.genesisNft.fetch(genesisPda);
    assert.strictEqual(g.shareBps, 500, "5% fee share");
    assert.strictEqual(g.subjectMint.toBase58(), subjectMint.toBase58());
    assert.strictEqual(g.owner.toBase58(), recipient.toBase58());

    const acc = await provider.connection.getAccountInfo(asset.publicKey);
    assert.strictEqual(acc!.owner.toBase58(), MPL_CORE_PROGRAM_ID.toBase58());
  });

  it("routes a token's fees to two genesis holders pro-rata (3:1)", async () => {
    const subjectMint = Keypair.generate().publicKey;
    const [poolPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("genpool"), subjectMint.toBuffer()],
      program.programId
    );

    // holder1: 750 bps, holder2: 250 bps (3:1).
    const holder1 = wallet;
    const holder2 = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(holder2.publicKey, LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    async function mint(recipient: PublicKey, shareBps: number): Promise<PublicKey> {
      const asset = Keypair.generate();
      const [genesisPda] = PublicKey.findProgramAddressSync(
        [Buffer.from("genesis"), asset.publicKey.toBuffer()],
        program.programId
      );
      await program.methods
        .mintGenesis(shareBps, "https://attention.fi/g.json")
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          recipient,
          subjectMint,
          genesis: genesisPda,
          pool: poolPda,
          asset: asset.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([asset])
        .rpc();
      return genesisPda;
    }

    const g1 = await mint(holder1, 750);
    const g2 = await mint(holder2.publicKey, 250);

    // Deposit 1 SOL of fees for this token.
    const deposit = LAMPORTS_PER_SOL;
    await program.methods
      .depositGenesisFee(new anchor.BN(deposit))
      .accountsStrict({
        depositor: wallet,
        pool: poolPda,
        subjectMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    // holder2 claims its 1/4.
    const reservesBefore = (await program.account.genesisPool.fetch(poolPda)).reserves;
    await program.methods
      .claimGenesisFee()
      .accountsStrict({
        holder: holder2.publicKey,
        pool: poolPda,
        genesis: g2,
        owner: holder2.publicKey,
      })
      .signers([holder2])
      .rpc();
    const reservesAfter = (await program.account.genesisPool.fetch(poolPda)).reserves;

    const claimed =
      BigInt(reservesBefore.toString()) - BigInt(reservesAfter.toString());
    assert.strictEqual(claimed, BigInt(deposit) / 4n, "holder2 gets 250/1000 = 1/4");

    // holder1's outstanding share is the other 3/4.
    const g1acc = await program.account.genesisNft.fetch(g1);
    const pool = await program.account.genesisPool.fetch(poolPda);
    const acc = BigInt(pool.accPerShare.toString());
    const SCALE = BigInt("1000000000000");
    const p1 = (750n * acc) / SCALE - BigInt(g1acc.rewardDebt.toString());
    assert.strictEqual(p1, (BigInt(deposit) * 3n) / 4n, "holder1 owed 3/4");
  });
});

describe("attention_fi NFT-as-asset auction", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  // MPL Core AssetV1 layout: [key(1 byte)][owner(32 bytes)]...
  function coreOwner(data: Buffer): PublicKey {
    return new PublicKey(data.subarray(1, 33));
  }

  let treasury: PublicKey;

  before(async () => {
    let global = await program.account.global.fetchNullable(globalPda);
    if (!global) {
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          treasury: Keypair.generate().publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      global = await program.account.global.fetch(globalPda);
    }
    treasury = global.treasury;
  });

  it("escrows a 1-of-1 NFT and transfers it to the buyer on purchase", async () => {
    const asset = Keypair.generate();
    const [auctionPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("nftauction"), asset.publicKey.toBuffer()],
      program.programId
    );
    const startPrice = new anchor.BN(2 * LAMPORTS_PER_SOL);
    const floorPrice = new anchor.BN(0.5 * LAMPORTS_PER_SOL);

    await program.methods
      .startNftAuction(startPrice, floorPrice, new anchor.BN(3600), "AttentionFi 1/1", "https://attention.fi/art.json")
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        auction: auctionPda,
        asset: asset.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([asset])
      .rpc();

    // While escrowed, the auction PDA owns the NFT.
    let assetAcc = await provider.connection.getAccountInfo(asset.publicKey);
    assert.strictEqual(coreOwner(assetAcc!.data).toBase58(), auctionPda.toBase58());

    // A distinct, funded buyer purchases at the current (ceiling) price.
    const buyer = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(buyer.publicKey, 3 * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");

    await program.methods
      .buyNft(startPrice)
      .accountsStrict({
        buyer: buyer.publicKey,
        global: globalPda,
        treasury,
        creator: wallet,
        auction: auctionPda,
        asset: asset.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([buyer])
      .rpc();

    // Ownership transferred to the buyer; auction marked complete.
    assetAcc = await provider.connection.getAccountInfo(asset.publicKey);
    assert.strictEqual(
      coreOwner(assetAcc!.data).toBase58(),
      buyer.publicKey.toBase58(),
      "NFT transferred to buyer"
    );
    const auction = await program.account.nftAuction.fetch(auctionPda);
    assert.strictEqual(auction.complete, true);
  });
});

describe("attention_fi perk fee discount", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  const [perkAuthority] = PublicKey.findProgramAddressSync(
    [Buffer.from("perkauth")],
    program.programId
  );

  let treasury: PublicKey;
  const perkAsset = Keypair.generate();
  const [perkPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("perk"), perkAsset.publicKey.toBuffer()],
    program.programId
  );
  const mintKp = Keypair.generate();
  const [curvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), mintKp.publicKey.toBuffer()],
    program.programId
  );
  const vault = ata(curvePda, mintKp.publicKey);
  const buyerAta = ata(wallet, mintKp.publicKey);

  before(async () => {
    let global = await program.account.global.fetchNullable(globalPda);
    if (!global) {
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          treasury: Keypair.generate().publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      global = await program.account.global.fetch(globalPda);
    }
    treasury = global.treasury;

    // Mint a level-1 perk (1% discount) to the buyer.
    await program.methods
      .mintPerk("https://attention.fi/perk.json")
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        recipient: wallet,
        perkAuthority,
        perk: perkPda,
        asset: perkAsset.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([perkAsset])
      .rpc();

    // Launch a bonding token to trade on.
    await program.methods
      .launchToken({ emerging: {} })
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: mintKp.publicKey,
        curve: curvePda,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();
  });

  async function buy(perk: PublicKey | null): Promise<number> {
    const before = await provider.connection.getBalance(treasury);
    await program.methods
      .buy(new anchor.BN(LAMPORTS_PER_SOL), new anchor.BN(0))
      .accountsStrict({
        buyer: wallet,
        global: globalPda,
        treasury,
        curve: curvePda,
        mint: mintKp.publicKey,
        vault,
        buyerTokenAccount: buyerAta,
        perk,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
    return (await provider.connection.getBalance(treasury)) - before;
  }

  it("discounts the fee for a perk holder without waiving it", async () => {
    const feeNoPerk = await buy(null);
    const feeWithPerk = await buy(perkPda);

    // 1% fee on 1 SOL = 0.01, of which the protocol keeps half (creator gets the rest).
    assert.strictEqual(feeNoPerk, 0.005 * LAMPORTS_PER_SOL, "protocol half of the 1% fee");

    // A level-1 perk takes 10% off the fee: 100 bps becomes 90, so the protocol
    // half of 0.9% on 1 SOL is 0.0045 SOL.
    assert.strictEqual(feeWithPerk, 0.0045 * LAMPORTS_PER_SOL, "10% off, not free");

    // This assertion previously read `feeWithPerk === 0` and passed, which is
    // how the bug survived: a flat 100 bps discount against a 100 bps fee
    // waived it entirely, and the test recorded that as the intent. Creators
    // and the treasury earned nothing on any perk holder's trade.
    assert.ok(feeWithPerk > 0, "a perk must never zero the fee");
    assert.ok(feeWithPerk < feeNoPerk, "but it must still be cheaper");
  });
});

describe("attention_fi AMM graduation", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  let treasury: PublicKey;

  const mintKp = Keypair.generate();
  const [curvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), mintKp.publicKey.toBuffer()],
    program.programId
  );
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("amm"), mintKp.publicKey.toBuffer()],
    program.programId
  );
  const curveVault = ata(curvePda, mintKp.publicKey);
  const poolVault = ata(poolPda, mintKp.publicKey);
  const walletAta = ata(wallet, mintKp.publicKey);

  async function tokenAmount(account: PublicKey): Promise<bigint> {
    return BigInt((await provider.connection.getTokenAccountBalance(account)).value.amount);
  }

  before(async () => {
    let global = await program.account.global.fetchNullable(globalPda);
    if (!global) {
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          treasury: Keypair.generate().publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      global = await program.account.global.fetch(globalPda);
    }
    treasury = global.treasury;
  });

  it("graduates a completed curve into a native AMM pool", async () => {
    // Top10 tier so a 90-SOL buy leaves healthy reserves for the pool.
    await program.methods
      .launchToken({ top10: {} })
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: mintKp.publicKey,
        curve: curvePda,
        vault: curveVault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    // One 90-SOL buy crosses the 85-SOL graduation threshold.
    await program.methods
      .buy(new anchor.BN(90 * LAMPORTS_PER_SOL), new anchor.BN(0))
      .accountsStrict({
        buyer: wallet,
        global: globalPda,
        treasury,
        curve: curvePda,
        mint: mintKp.publicKey,
        vault: curveVault,
        buyerTokenAccount: walletAta,
        perk: null,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const curve = await program.account.bondingCurve.fetch(curvePda);
    assert.strictEqual(curve.complete, true, "curve graduated");
    const solRes = curve.realSolReserves.toString();
    const tokRes = curve.realTokenReserves.toString();

    await program.methods
      .graduate()
      .accountsStrict({
        payer: wallet,
        global: globalPda,
        curve: curvePda,
        mint: mintKp.publicKey,
        curveVault,
        pool: poolPda,
        poolVault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .rpc();

    const pool = await program.account.ammPool.fetch(poolPda);
    assert.strictEqual(pool.solReserves.toString(), solRes, "SOL migrated to pool");
    assert.strictEqual(pool.tokenReserves.toString(), tokRes, "tokens migrated to pool");
    assert.strictEqual((await tokenAmount(poolVault)).toString(), tokRes, "pool vault funded");

    const curveAfter = await program.account.bondingCurve.fetch(curvePda);
    assert.strictEqual(curveAfter.realSolReserves.toString(), "0", "curve SOL drained");
    assert.strictEqual(curveAfter.realTokenReserves.toString(), "0", "curve tokens drained");
  });

  it("swaps on the graduated pool (buy then sell)", async () => {
    const before = await program.account.ammPool.fetch(poolPda);

    // Buy: 1 SOL -> tokens.
    await program.methods
      .swap(new anchor.BN(LAMPORTS_PER_SOL), new anchor.BN(0), true)
      .accountsStrict({
        trader: wallet,
        global: globalPda,
        pool: poolPda,
        mint: mintKp.publicKey,
        poolVault,
        traderTokenAccount: walletAta,
        perk: null,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const afterBuy = await program.account.ammPool.fetch(poolPda);
    assert.strictEqual(
      afterBuy.solReserves.sub(before.solReserves).toString(),
      LAMPORTS_PER_SOL.toString(),
      "pool gained 1 SOL"
    );
    assert.isTrue(afterBuy.tokenReserves.lt(before.tokenReserves), "pool released tokens");

    // Sell: return some tokens -> SOL.
    const held = await tokenAmount(walletAta);
    await program.methods
      .swap(new anchor.BN((held / 4n).toString()), new anchor.BN(0), false)
      .accountsStrict({
        trader: wallet,
        global: globalPda,
        pool: poolPda,
        mint: mintKp.publicKey,
        poolVault,
        traderTokenAccount: walletAta,
        perk: null,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const afterSell = await program.account.ammPool.fetch(poolPda);
    assert.isTrue(afterSell.tokenReserves.gt(afterBuy.tokenReserves), "pool took tokens back");
    assert.isTrue(afterSell.solReserves.lt(afterBuy.solReserves), "pool paid out SOL");
  });
});

describe("attention_fi creator fees (SAS-gated claim)", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const fx = JSON.parse(fs.readFileSync("tests/fixtures/sas.json", "utf8"));
  const attWallet = new PublicKey(fx.attWallet);

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  const [verifyPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("verify"), wallet.toBuffer()],
    program.programId
  );
  let treasury: PublicKey;

  const mintKp = Keypair.generate();
  const [curvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), mintKp.publicKey.toBuffer()],
    program.programId
  );
  const vault = ata(curvePda, mintKp.publicKey);
  const walletAta = ata(wallet, mintKp.publicKey);

  before(async () => {
    let global = await program.account.global.fetchNullable(globalPda);
    if (!global) {
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          treasury: Keypair.generate().publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
      global = await program.account.global.fetch(globalPda);
    }
    treasury = global.treasury;

    // Verify the wallet's handle (once) so it can claim creator fees.
    const existing = await program.account.verification.fetchNullable(verifyPda);
    if (!existing) {
      const asset = Keypair.generate();
      await program.methods
        .verifyHandle(fx.handle, "https://attention.fi/v.json")
        .accountsStrict({
          payer: wallet,
          global: globalPda,
          issuerConfig: null,
          subject: wallet,
          attestation: attWallet,
          verification: verifyPda,
          asset: asset.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([asset])
        .rpc();
    }
  });

  it("accrues creator fees and pays them to the verified creator", async () => {
    // Launch a token whose creator is the (verified) wallet.
    await program.methods
      .launchToken({ emerging: {} })
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: mintKp.publicKey,
        curve: curvePda,
        vault,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    // Buy 4 SOL: 1% fee = 0.04, split 50/50 => 0.02 SOL accrues to the creator.
    await program.methods
      .buy(new anchor.BN(4 * LAMPORTS_PER_SOL), new anchor.BN(0))
      .accountsStrict({
        buyer: wallet,
        global: globalPda,
        treasury,
        curve: curvePda,
        mint: mintKp.publicKey,
        vault,
        buyerTokenAccount: walletAta,
        perk: null,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const curve = await program.account.bondingCurve.fetch(curvePda);
    assert.strictEqual(curve.creatorFees.toString(), "20000000", "0.02 SOL accrued");

    const before = await provider.connection.getBalance(wallet);
    await program.methods
      .claimCreatorFee()
      .accountsStrict({
        creator: wallet,
        mint: mintKp.publicKey,
        curve: curvePda,
        verification: verifyPda,
      })
      .rpc();
    const after = await provider.connection.getBalance(wallet);

    const claimed = await program.account.bondingCurve.fetch(curvePda);
    assert.strictEqual(claimed.creatorFees.toString(), "0", "creator fees drained on claim");
    assert.isTrue(after > before, "verified creator received the fees (net of gas)");
  });
});
