import * as anchor from "@anchor-lang/core";
import { Program } from "@anchor-lang/core";
import { AttentionFi } from "../target/types/attention_fi";
import { assert } from "chai";

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

    const treasuryAfter = await provider.connection.getBalance(treasury);
    assert.strictEqual(
      treasuryAfter - treasuryBefore,
      0.02 * LAMPORTS_PER_SOL,
      "1% of 2 SOL routed to treasury"
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

describe("attention_fi verification NFT", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
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

  it("mints a soulbound verification credential bound to a wallet", async () => {
    const subject = Keypair.generate().publicKey;
    const asset = Keypair.generate();
    const handle = "vitalik";
    const [verificationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("verify"), subject.toBuffer()],
      program.programId
    );

    await program.methods
      .verifyHandle(handle, "https://attention.fi/v/vitalik.json")
      .accountsStrict({
        authority: wallet, // == global.authority (the keeper)
        global: globalPda,
        subject,
        verification: verificationPda,
        asset: asset.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([asset])
      .rpc();

    // On-chain binding recorded.
    const v = await program.account.verification.fetch(verificationPda);
    assert.strictEqual(v.handle, handle);
    assert.strictEqual(v.subject.toBase58(), subject.toBase58());
    assert.strictEqual(v.asset.toBase58(), asset.publicKey.toBase58());

    // A real Metaplex Core asset was created (owned by the Core program).
    const assetAccount = await provider.connection.getAccountInfo(asset.publicKey);
    assert.isNotNull(assetAccount, "core asset account exists");
    assert.strictEqual(
      assetAccount!.owner.toBase58(),
      MPL_CORE_PROGRAM_ID.toBase58(),
      "asset owned by MPL Core"
    );
    assert.isTrue(assetAccount!.data.length > 0, "asset has state");
  });

  it("rejects verification from a non-authority keeper", async () => {
    const imposter = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      imposter.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    const subject = Keypair.generate().publicKey;
    const asset = Keypair.generate();
    const [verificationPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("verify"), subject.toBuffer()],
      program.programId
    );

    let threw = false;
    try {
      await program.methods
        .verifyHandle("imposter", "https://x/y.json")
        .accountsStrict({
          authority: imposter.publicKey,
          global: globalPda,
          subject,
          verification: verificationPda,
          asset: asset.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([imposter, asset])
        .rpc();
    } catch (err) {
      threw = true;
    }
    assert.isTrue(threw, "only the protocol authority may attest handles");
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
    assert.strictEqual(perk.discountBps, 100, "level 1 => 1% discount");

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
    assert.strictEqual(perk.discountBps, 200, "level 2 => 2% discount");

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

    await program.methods
      .mintGenesis(500, "https://attention.fi/genesis.json")
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        recipient,
        subjectMint,
        genesis: genesisPda,
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
