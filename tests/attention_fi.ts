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
const TOKEN_METADATA_PROGRAM_ID = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
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

/** The genesis fee pool for a mint — always passed now, existing or not. */
function genesisPoolPda(mint: PublicKey, programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("genpool"), mint.toBuffer()],
    programId
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
        curve: PublicKey.findProgramAddressSync(
          [Buffer.from("curve"), subjectMint.toBuffer()],
          program.programId
        )[0],
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

    async function mint(
      recipient: PublicKey,
      shareBps: number
    ): Promise<{ genesis: PublicKey; asset: PublicKey }> {
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
          curve: PublicKey.findProgramAddressSync(
            [Buffer.from("curve"), subjectMint.toBuffer()],
            program.programId
          )[0],
          genesis: genesisPda,
          pool: poolPda,
          asset: asset.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([asset])
        .rpc();
      return { genesis: genesisPda, asset: asset.publicKey };
    }

    const { genesis: g1 } = await mint(holder1, 750);
    const { genesis: g2, asset: g2Asset } = await mint(holder2.publicKey, 250);

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
        asset: g2Asset,
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

describe("attention_fi genesis group", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );

  // Group terms: 4 units at 5% of the creator's fee stream each, 0.5 SOL a
  // unit, two to a wallet.
  const TOTAL_UNITS = 4;
  // The NFT market's default fee (2.5%), which is deliberately not the 1% the
  // curve charges — a genesis unit is a sale, not a trade.
  const NFT_FEE_BPS = 250;
  const SHARE_BPS = 500;
  const PRICE = LAMPORTS_PER_SOL / 2;
  const PER_WALLET_CAP = 2;
  // What a buy actually debits: the price plus the market fee charged on top.
  // `max_total` bounds the sum, so quoting the price alone is refused.
  const TOTAL = PRICE + (PRICE * NFT_FEE_BPS) / 10_000;

  const mintKp = Keypair.generate();
  const collectionKp = Keypair.generate();
  const subjectMint = mintKp.publicKey;
  const [curvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), subjectMint.toBuffer()],
    program.programId
  );
  const [groupPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("gengroup"), subjectMint.toBuffer()],
    program.programId
  );
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("genpool"), subjectMint.toBuffer()],
    program.programId
  );
  const [feeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("feeconfig")],
    program.programId
  );

  let treasury: PublicKey;
  // Units minted into the group, in mint order.
  const units: PublicKey[] = [];
  const buyer = Keypair.generate();
  const secondBuyer = Keypair.generate();

  const genesisPda = (asset: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("genesis"), asset.toBuffer()],
      program.programId
    )[0];
  const allocationPda = (who: PublicKey) =>
    PublicKey.findProgramAddressSync(
      [Buffer.from("genalloc"), subjectMint.toBuffer(), who.toBuffer()],
      program.programId
    )[0];

  // Sent as the buyer's own transaction rather than through `.rpc()`, which
  // would make the provider wallet the fee payer — and that wallet is the
  // creator here, so its balance would move by the price *and* the fee, and the
  // proceeds assertion below could not tell the two apart.
  async function buyUnit(who: Keypair, asset: PublicKey): Promise<void> {
    const tx = await program.methods
      .buyGenesisUnit(new anchor.BN(TOTAL))
      .accountsStrict({
        buyer: who.publicKey,
        global: globalPda,
        feeConfig: feeConfigPda,
        treasury,
        creator: wallet,
        subjectMint,
        group: groupPda,
        collection: collectionKp.publicKey,
        asset,
        genesis: genesisPda(asset),
        pool: poolPda,
        allocation: allocationPda(who.publicKey),
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [who], {
      commitment: "confirmed",
    });
  }

  before(async () => {
    const existing = await program.account.global.fetchNullable(globalPda);
    if (existing) {
      treasury = existing.treasury;
    } else {
      treasury = Keypair.generate().publicKey;
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          feeConfig: feeConfigPda,
          treasury,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    // The group is gated on the subject token's curve, so it needs a real launch.
    await program.methods
      .launchToken(
        { emerging: {} },
        { name: "Genesis Subject", symbol: "GEN", uri: "https://attention.fi/t.json" },
      )
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: subjectMint,
        curve: curvePda,
        vault: ata(curvePda, subjectMint),
        metadata: PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            subjectMint.toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID,
        )[0],
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    await program.methods
      .createCollection("Genesis Run", "https://attention.fi/run.json")
      .accountsStrict({
        payer: wallet,
        collection: collectionKp.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([collectionKp])
      .rpc();

    for (const who of [buyer, secondBuyer]) {
      const sig = await provider.connection.requestAirdrop(
        who.publicKey,
        3 * LAMPORTS_PER_SOL
      );
      await provider.connection.confirmTransaction(sig, "confirmed");
    }
  });

  it("lists a group and escrows the collection's update authority", async () => {
    await program.methods
      .listGenesisGroup(
        TOTAL_UNITS,
        SHARE_BPS,
        new anchor.BN(PRICE),
        PER_WALLET_CAP
      )
      .accountsStrict({
        creator: wallet,
        subjectMint,
        curve: curvePda,
        group: groupPda,
        pool: poolPda,
        collection: collectionKp.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const group = await program.account.genesisGroup.fetch(groupPda);
    assert.strictEqual(group.totalUnits, TOTAL_UNITS);
    assert.strictEqual(group.shareBps, SHARE_BPS);
    assert.strictEqual(group.price.toString(), PRICE.toString());
    assert.strictEqual(group.perWalletCap, PER_WALLET_CAP);
    assert.strictEqual(group.mintedUnits, 0);
    assert.strictEqual(group.soldUnits, 0);
    assert.strictEqual(
      group.collection.toBase58(),
      collectionKp.publicKey.toBase58()
    );

    // The collection's update authority now sits at the group PDA — that is what
    // makes `totalUnits` binding, since only `mintGenesisBatch` can add to it.
    const acc = await provider.connection.getAccountInfo(
      collectionKp.publicKey
    );
    assert.strictEqual(
      new PublicKey(acc!.data.subarray(1, 33)).toBase58(),
      groupPda.toBase58(),
      "collection authority escrowed under the group"
    );

    // Nothing is committed against the fee stream until a unit actually sells.
    const pool = await program.account.genesisPool.fetch(poolPda);
    assert.strictEqual(pool.totalShareBps.toString(), "0");
  });

  it("mints units into the group, and refuses to overfill it", async () => {
    const batch = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    await program.methods
      .mintGenesisBatch("https://attention.fi/unit.json")
      .accountsStrict({
        creator: wallet,
        subjectMint,
        group: groupPda,
        collection: collectionKp.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(
        batch.map((kp) => ({
          pubkey: kp.publicKey,
          isSigner: true,
          isWritable: true,
        }))
      )
      .preInstructions([
        anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({
          units: 600_000,
        }),
      ])
      .signers(batch)
      .rpc();
    units.push(...batch.map((kp) => kp.publicKey));

    const group = await program.account.genesisGroup.fetch(groupPda);
    assert.strictEqual(group.mintedUnits, 3, "three of four units minted");

    for (const unit of units) {
      const acc = await provider.connection.getAccountInfo(unit);
      assert.strictEqual(acc!.owner.toBase58(), MPL_CORE_PROGRAM_ID.toBase58());
    }

    // Only one unit is left, so a two-unit batch must be rejected whole.
    const overfill = [Keypair.generate(), Keypair.generate()];
    let threw = false;
    try {
      await program.methods
        .mintGenesisBatch("https://attention.fi/unit.json")
        .accountsStrict({
          creator: wallet,
          subjectMint,
          group: groupPda,
          collection: collectionKp.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts(
          overfill.map((kp) => ({
            pubkey: kp.publicKey,
            isSigner: true,
            isWritable: true,
          }))
        )
        .signers(overfill)
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(String(err), "GenesisGroupFull");
    }
    assert.isTrue(threw, "a batch past the declared total is rejected");
    assert.strictEqual(
      (await program.account.genesisGroup.fetch(groupPda)).mintedUnits,
      3,
      "the rejected batch minted nothing"
    );
  });

  it("sells units at the listed price and enforces the per-wallet cap", async () => {
    const creatorBefore = await provider.connection.getBalance(wallet);
    const treasuryBefore = await provider.connection.getBalance(treasury);

    await buyUnit(buyer, units[0]);

    const genesis = await program.account.genesisNft.fetch(
      genesisPda(units[0])
    );
    assert.strictEqual(genesis.owner.toBase58(), buyer.publicKey.toBase58());
    assert.strictEqual(genesis.shareBps, SHARE_BPS);
    assert.strictEqual(genesis.subjectMint.toBase58(), subjectMint.toBase58());

    const creatorAfter = await provider.connection.getBalance(wallet);
    const treasuryAfter = await provider.connection.getBalance(treasury);
    assert.strictEqual(
      creatorAfter - creatorBefore,
      PRICE,
      "creator paid the listed price"
    );
    assert.strictEqual(
      treasuryAfter - treasuryBefore,
      TOTAL - PRICE,
      "charged the NFT market's fee, not the curve's trading fee"
    );

    // The unit is the buyer's now, not the escrow's.
    const unitAcc = await provider.connection.getAccountInfo(units[0]);
    assert.strictEqual(
      new PublicKey(unitAcc!.data.subarray(1, 33)).toBase58(),
      buyer.publicKey.toBase58(),
      "unit transferred to the buyer"
    );

    // Only sold units dilute the stream.
    let pool = await program.account.genesisPool.fetch(poolPda);
    assert.strictEqual(pool.totalShareBps.toString(), SHARE_BPS.toString());

    await buyUnit(buyer, units[1]);
    const allocation = await program.account.genesisAllocation.fetch(
      allocationPda(buyer.publicKey)
    );
    assert.strictEqual(
      allocation.units,
      2,
      "both purchases counted against the cap"
    );

    let threw = false;
    try {
      await buyUnit(buyer, units[2]);
    } catch (err) {
      threw = true;
      assert.include(String(err), "WalletCapReached");
    }
    assert.isTrue(threw, "a third unit for the same wallet is refused");

    // A different wallet can still take the remaining minted unit.
    await buyUnit(secondBuyer, units[2]);

    const group = await program.account.genesisGroup.fetch(groupPda);
    assert.strictEqual(group.soldUnits, 3, "every minted unit sold");
    pool = await program.account.genesisPool.fetch(poolPda);
    assert.strictEqual(
      pool.totalShareBps.toString(),
      (3 * SHARE_BPS).toString(),
      "15% of the fee stream committed across three holders"
    );

    // The fourth unit was declared but never minted, so there is nothing to sell.
    const unmintedAsset = Keypair.generate().publicKey;
    threw = false;
    try {
      await buyUnit(secondBuyer, unmintedAsset);
    } catch (err) {
      threw = true;
      assert.include(String(err), "SoldOut");
    }
    assert.isTrue(threw, "a unit that was never minted cannot be bought");
  });
});

describe("attention_fi protocol config", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  const [feeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("feeconfig")],
    program.programId
  );

  let treasury: PublicKey;
  // Restored after the retune so the other suites see the shipped economics.
  let originalFeeBps: number;

  const mintKp = Keypair.generate();
  const subjectMint = mintKp.publicKey;
  const [curvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), subjectMint.toBuffer()],
    program.programId
  );
  const vault = ata(curvePda, subjectMint);
  const buyerAta = ata(wallet, subjectMint);

  async function buy(lamports: number): Promise<void> {
    await program.methods
      .buy(new anchor.BN(lamports), new anchor.BN(0))
      .accountsStrict({
        buyer: wallet,
        global: globalPda,
        treasury,
        curve: curvePda,
        mint: subjectMint,
        vault,
        buyerTokenAccount: buyerAta,
        perk: null,
        genesisPool: genesisPoolPda(subjectMint, program.programId),
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();
  }

  before(async () => {
    const existing = await program.account.global.fetchNullable(globalPda);
    if (existing) {
      treasury = existing.treasury;
    } else {
      treasury = Keypair.generate().publicKey;
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          feeConfig: feeConfigPda,
          treasury,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }
    originalFeeBps = (await program.account.global.fetch(globalPda)).feeBps;

    await program.methods
      .launchToken(
        { emerging: {} },
        { name: "Config Subject", symbol: "CFG", uri: "https://attention.fi/c.json" }
      )
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: subjectMint,
        curve: curvePda,
        vault,
        metadata: PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            subjectMint.toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID
        )[0],
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();
  });

  after(async () => {
    await program.methods
      .updateConfig(originalFeeBps, null, null, null)
      .accountsStrict({ authority: wallet, global: globalPda })
      .rpc();
  });

  it("retunes the trading fee, and the next trade is charged the new rate", async () => {
    // The whole point: this used to take a redeploy.
    const SPEND = LAMPORTS_PER_SOL;
    const before = await provider.connection.getBalance(treasury);
    await buy(SPEND);
    const atOldRate = (await provider.connection.getBalance(treasury)) - before;
    // 1% fee, half to the treasury and half accrued to the creator.
    assert.strictEqual(atOldRate, (SPEND * originalFeeBps) / 10_000 / 2);

    await program.methods
      .updateConfig(300, null, null, null)
      .accountsStrict({ authority: wallet, global: globalPda })
      .rpc();

    const global = await program.account.global.fetch(globalPda);
    assert.strictEqual(global.feeBps, 300, "fee retuned in place");
    assert.strictEqual(
      global.creatorFeeShareBps,
      5000,
      "an omitted argument leaves its value alone"
    );

    const mid = await provider.connection.getBalance(treasury);
    await buy(SPEND);
    const atNewRate = (await provider.connection.getBalance(treasury)) - mid;
    assert.strictEqual(
      atNewRate,
      (SPEND * 300) / 10_000 / 2,
      "the very next trade pays the new rate"
    );
  });

  it("refuses a fee past the ceiling and a caller who isn't the authority", async () => {
    let threw = false;
    try {
      await program.methods
        .updateConfig(10_000, null, null, null)
        .accountsStrict({ authority: wallet, global: globalPda })
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(String(err), "InvalidConfig");
    }
    assert.isTrue(threw, "bps/percent confusion is caught, not applied");

    const stranger = Keypair.generate();
    const sig = await provider.connection.requestAirdrop(
      stranger.publicKey,
      LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    threw = false;
    try {
      const tx = await program.methods
        .updateConfig(0, null, null, null)
        .accountsStrict({ authority: stranger.publicKey, global: globalPda })
        .transaction();
      await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [stranger], {
        commitment: "confirmed",
      });
    } catch (err) {
      threw = true;
      assert.include(String(err), "Unauthorized");
    }
    assert.isTrue(threw, "only the protocol authority may retune it");
  });

  it("prices the NFT market separately from the curve", async () => {
    await program.methods
      .setFeeConfig(400, new anchor.BN(LAMPORTS_PER_SOL / 50))
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        feeConfig: feeConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    let fees = await program.account.feeConfig.fetch(feeConfigPda);
    assert.strictEqual(fees.nftFeeBps, 400);
    assert.strictEqual(fees.promoLamportsPerDay.toString(), String(LAMPORTS_PER_SOL / 50));

    // Retuning the trading fee leaves the market's fee where it was — the two
    // numbers were only ever the same by accident of storage.
    await program.methods
      .updateConfig(100, null, null, null)
      .accountsStrict({ authority: wallet, global: globalPda })
      .rpc();
    fees = await program.account.feeConfig.fetch(feeConfigPda);
    assert.strictEqual(fees.nftFeeBps, 400, "NFT fee untouched by a trading retune");
    assert.strictEqual(
      (await program.account.global.fetch(globalPda)).feeBps,
      100,
      "and the trading fee moved on its own"
    );

    // Omitted arguments keep the stored value rather than resetting it.
    await program.methods
      .setFeeConfig(null, null)
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        feeConfig: feeConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
    fees = await program.account.feeConfig.fetch(feeConfigPda);
    assert.strictEqual(fees.nftFeeBps, 400, "an omitted fee is not a reset to default");

    let threw = false;
    try {
      await program.methods
        .setFeeConfig(2_000, null)
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          feeConfig: feeConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(String(err), "InvalidConfig");
    }
    assert.isTrue(threw, "the market fee is bounded by the same ceiling");

    // Leave the NFT market on its shipped schedule for the other suites.
    await program.methods
      .setFeeConfig(250, new anchor.BN(LAMPORTS_PER_SOL / 100))
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        feeConfig: feeConfigPda,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });
});

describe("attention_fi genesis group — reclaim and close", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  const [feeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("feeconfig")],
    program.programId
  );

  const PRICE = LAMPORTS_PER_SOL / 4;
  const SHARE_BPS = 400;
  const NFT_FEE_BPS = 250;
  const TOTAL = PRICE + (PRICE * NFT_FEE_BPS) / 10_000;

  const mintKp = Keypair.generate();
  const collectionKp = Keypair.generate();
  const subjectMint = mintKp.publicKey;
  const [curvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), subjectMint.toBuffer()],
    program.programId
  );
  const [groupPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("gengroup"), subjectMint.toBuffer()],
    program.programId
  );
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("genpool"), subjectMint.toBuffer()],
    program.programId
  );

  let treasury: PublicKey;
  const units: PublicKey[] = [];
  const buyer = Keypair.generate();

  /** The escrow's view of an asset: who owns it right now. */
  async function ownerOf(asset: PublicKey): Promise<string> {
    const info = await provider.connection.getAccountInfo(asset);
    return new PublicKey(info!.data.subarray(1, 33)).toBase58();
  }

  before(async () => {
    const existing = await program.account.global.fetchNullable(globalPda);
    if (existing) {
      treasury = existing.treasury;
    } else {
      treasury = Keypair.generate().publicKey;
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          feeConfig: feeConfigPda,
          treasury,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    await program.methods
      .launchToken(
        { emerging: {} },
        { name: "Reclaim Subject", symbol: "RCL", uri: "https://attention.fi/r.json" }
      )
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: subjectMint,
        curve: curvePda,
        vault: ata(curvePda, subjectMint),
        metadata: PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            subjectMint.toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID
        )[0],
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    await program.methods
      .createCollection("Reclaim Run", "https://attention.fi/run.json")
      .accountsStrict({
        payer: wallet,
        collection: collectionKp.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([collectionKp])
      .rpc();

    // 3 units, one to a wallet; one will sell and two will be taken back.
    await program.methods
      .listGenesisGroup(3, SHARE_BPS, new anchor.BN(PRICE), 1)
      .accountsStrict({
        creator: wallet,
        subjectMint,
        curve: curvePda,
        group: groupPda,
        pool: poolPda,
        collection: collectionKp.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const batch = [Keypair.generate(), Keypair.generate(), Keypair.generate()];
    await program.methods
      .mintGenesisBatch("https://attention.fi/unit.json")
      .accountsStrict({
        creator: wallet,
        subjectMint,
        group: groupPda,
        collection: collectionKp.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts(
        batch.map((kp) => ({ pubkey: kp.publicKey, isSigner: true, isWritable: true }))
      )
      .preInstructions([
        anchor.web3.ComputeBudgetProgram.setComputeUnitLimit({ units: 600_000 }),
      ])
      .signers(batch)
      .rpc();
    units.push(...batch.map((kp) => kp.publicKey));

    const sig = await provider.connection.requestAirdrop(
      buyer.publicKey,
      2 * LAMPORTS_PER_SOL
    );
    await provider.connection.confirmTransaction(sig, "confirmed");

    // One unit finds a buyer; the other two do not.
    const tx = await program.methods
      .buyGenesisUnit(new anchor.BN(TOTAL))
      .accountsStrict({
        buyer: buyer.publicKey,
        global: globalPda,
        feeConfig: feeConfigPda,
        treasury,
        creator: wallet,
        subjectMint,
        group: groupPda,
        collection: collectionKp.publicKey,
        asset: units[0],
        genesis: PublicKey.findProgramAddressSync(
          [Buffer.from("genesis"), units[0].toBuffer()],
          program.programId
        )[0],
        pool: poolPda,
        allocation: PublicKey.findProgramAddressSync(
          [Buffer.from("genalloc"), subjectMint.toBuffer(), buyer.publicKey.toBuffer()],
          program.programId
        )[0],
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
    await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [buyer], {
      commitment: "confirmed",
    });
  });

  it("refuses to close while units are still escrowed", async () => {
    let threw = false;
    try {
      await program.methods
        .closeGenesisGroup()
        .accountsStrict({
          creator: wallet,
          subjectMint,
          group: groupPda,
          collection: collectionKp.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(String(err), "GenesisUnitsInEscrow");
    }
    assert.isTrue(
      threw,
      "closing with units inside would strand them under a PDA that no longer exists"
    );
  });

  it("returns unsold units to the creator, and refuses to take a sold one", async () => {
    // The sold unit belongs to its buyer — the count says two are reclaimable,
    // but naming the sold asset must still fail.
    let threw = false;
    try {
      await program.methods
        .reclaimGenesisUnits()
        .accountsStrict({
          creator: wallet,
          subjectMint,
          group: groupPda,
          collection: collectionKp.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([{ pubkey: units[0], isSigner: false, isWritable: true }])
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(String(err), "AssetNotInGroup");
    }
    assert.isTrue(threw, "a sold unit is not the creator's to take back");

    await program.methods
      .reclaimGenesisUnits()
      .accountsStrict({
        creator: wallet,
        subjectMint,
        group: groupPda,
        collection: collectionKp.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .remainingAccounts([
        { pubkey: units[1], isSigner: false, isWritable: true },
        { pubkey: units[2], isSigner: false, isWritable: true },
      ])
      .rpc();

    assert.strictEqual(await ownerOf(units[1]), wallet.toBase58(), "unit came home");
    assert.strictEqual(await ownerOf(units[2]), wallet.toBase58(), "and so did the other");
    assert.strictEqual(
      await ownerOf(units[0]),
      buyer.publicKey.toBase58(),
      "the sold one stayed with its buyer"
    );

    const group = await program.account.genesisGroup.fetch(groupPda);
    assert.strictEqual(group.mintedUnits, 1, "only the sold unit still counts as minted");
    assert.strictEqual(group.soldUnits, 1);

    // Nothing left in escrow, so there is nothing left to take.
    let empty = false;
    try {
      await program.methods
        .reclaimGenesisUnits()
        .accountsStrict({
          creator: wallet,
          subjectMint,
          group: groupPda,
          collection: collectionKp.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .remainingAccounts([{ pubkey: units[1], isSigner: false, isWritable: true }])
        .rpc();
    } catch (err) {
      empty = true;
      assert.include(String(err), "NoUnitsToReclaim");
    }
    assert.isTrue(empty, "an empty escrow reports itself rather than transferring");
  });

  it("closes the group, hands the collection back, and stops the run", async () => {
    const rentBefore = await provider.connection.getBalance(wallet);

    await program.methods
      .closeGenesisGroup()
      .accountsStrict({
        creator: wallet,
        subjectMint,
        group: groupPda,
        collection: collectionKp.publicKey,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    assert.isNull(
      await program.account.genesisGroup.fetchNullable(groupPda),
      "the group account is gone, so there is nothing left to buy from"
    );
    assert.isTrue(
      (await provider.connection.getBalance(wallet)) > rentBefore,
      "its rent came back (net of the fee)"
    );

    // The collection answers to its creator again.
    const collectionAcc = await provider.connection.getAccountInfo(collectionKp.publicKey);
    assert.strictEqual(
      new PublicKey(collectionAcc!.data.subarray(1, 33)).toBase58(),
      wallet.toBase58(),
      "update authority returned to the creator"
    );

    // The sold unit keeps its claim on the fee stream.
    const genesis = await program.account.genesisNft.fetch(
      PublicKey.findProgramAddressSync(
        [Buffer.from("genesis"), units[0].toBuffer()],
        program.programId
      )[0]
    );
    assert.strictEqual(genesis.shareBps, SHARE_BPS, "a closed run doesn't revoke what it sold");
    const pool = await program.account.genesisPool.fetch(poolPda);
    assert.strictEqual(pool.totalShareBps.toString(), String(SHARE_BPS));
  });
});

/**
 * Regression cover for the security review.
 *
 * Each case is written against the specific way the program used to be wrong,
 * so a future change that reintroduces the hole fails here rather than in
 * production.
 */
describe("attention_fi security fixes", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.attentionFi as Program<AttentionFi>;
  const wallet = provider.wallet.publicKey;

  const [globalPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("global")],
    program.programId
  );
  const [feeConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("feeconfig")],
    program.programId
  );

  const mintKp = Keypair.generate();
  const subjectMint = mintKp.publicKey;
  const [curvePda] = PublicKey.findProgramAddressSync(
    [Buffer.from("curve"), subjectMint.toBuffer()],
    program.programId
  );
  const poolPda = genesisPoolPda(subjectMint, program.programId);

  const holderA = Keypair.generate();
  const holderB = Keypair.generate();
  let treasury: PublicKey;
  let assetA: PublicKey;
  let genesisA: PublicKey;

  /** A raw mpl-core `TransferV1`, so the test can move an asset the way any
   *  wallet or marketplace would — outside this program entirely. */
  function transferV1(asset: PublicKey, owner: PublicKey, newOwner: PublicKey) {
    const none = MPL_CORE_PROGRAM_ID; // mpl-core's sentinel for an absent optional account
    return new anchor.web3.TransactionInstruction({
      programId: MPL_CORE_PROGRAM_ID,
      keys: [
        { pubkey: asset, isSigner: false, isWritable: true },
        { pubkey: none, isSigner: false, isWritable: false }, // collection: none
        { pubkey: owner, isSigner: true, isWritable: true }, // payer
        { pubkey: none, isSigner: false, isWritable: false }, // authority: defaults to payer
        { pubkey: newOwner, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: none, isSigner: false, isWritable: false }, // log wrapper: none
      ],
      data: Buffer.from([14, 0]), // TransferV1, compression_proof: None
    });
  }

  before(async () => {
    const existing = await program.account.global.fetchNullable(globalPda);
    if (existing) {
      treasury = existing.treasury;
    } else {
      treasury = Keypair.generate().publicKey;
      await program.methods
        .initialize()
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          feeConfig: feeConfigPda,
          treasury,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    for (const who of [holderA, holderB]) {
      const sig = await provider.connection.requestAirdrop(who.publicKey, LAMPORTS_PER_SOL);
      await provider.connection.confirmTransaction(sig, "confirmed");
    }

    await program.methods
      .launchToken(
        { emerging: {} },
        { name: "Sec Fixes", symbol: "SEC", uri: "https://attention.fi/s.json" }
      )
      .accountsStrict({
        creator: wallet,
        global: globalPda,
        mint: subjectMint,
        curve: curvePda,
        vault: ata(curvePda, subjectMint),
        metadata: PublicKey.findProgramAddressSync(
          [
            Buffer.from("metadata"),
            TOKEN_METADATA_PROGRAM_ID.toBuffer(),
            subjectMint.toBuffer(),
          ],
          TOKEN_METADATA_PROGRAM_ID
        )[0],
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers([mintKp])
      .rpc();

    // One fee-share NFT to holder A, then a deposit so there is something to claim.
    const asset = Keypair.generate();
    assetA = asset.publicKey;
    [genesisA] = PublicKey.findProgramAddressSync(
      [Buffer.from("genesis"), assetA.toBuffer()],
      program.programId
    );
    await program.methods
      .mintGenesis(1_000, "https://attention.fi/g.json")
      .accountsStrict({
        authority: wallet,
        global: globalPda,
        recipient: holderA.publicKey,
        subjectMint,
        curve: curvePda,
        genesis: genesisA,
        pool: poolPda,
        asset: assetA,
        mplCoreProgram: MPL_CORE_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .signers([asset])
      .rpc();

    await program.methods
      .depositGenesisFee(new anchor.BN(LAMPORTS_PER_SOL / 10))
      .accountsStrict({
        depositor: wallet,
        pool: poolPda,
        subjectMint,
        systemProgram: SystemProgram.programId,
      })
      .rpc();
  });

  it("moves the fee claim with the NFT when it changes hands", async () => {
    // A plain mpl-core transfer, outside this program — exactly what a
    // secondary sale is. The claim used to stay behind with the seller.
    const tx = new anchor.web3.Transaction().add(
      transferV1(assetA, holderA.publicKey, holderB.publicKey)
    );
    await anchor.web3.sendAndConfirmTransaction(provider.connection, tx, [holderA], {
      commitment: "confirmed",
    });

    const claim = (who: Keypair) =>
      program.methods
        .claimGenesisFee()
        .accountsStrict({
          holder: who.publicKey,
          pool: poolPda,
          genesis: genesisA,
          asset: assetA,
        })
        .signers([who])
        .rpc();

    let threw = false;
    try {
      await claim(holderA);
    } catch (err) {
      threw = true;
      assert.include(String(err), "Unauthorized");
    }
    assert.isTrue(threw, "the seller no longer owns it and must not keep drawing on it");

    const before = await provider.connection.getBalance(holderB.publicKey);
    await claim(holderB);
    assert.isTrue(
      (await provider.connection.getBalance(holderB.publicKey)) > before,
      "the new owner receives the stream that came with the NFT"
    );

    // The cached field follows the truth rather than standing in for it.
    const genesis = await program.account.genesisNft.fetch(genesisA);
    assert.strictEqual(genesis.owner.toBase58(), holderB.publicKey.toBase58());
  });

  it("won't let a creator dilute holders past the whole fee stream", async () => {
    // 1,000 bps are already committed to holder B's NFT. The creator may issue
    // up to 9,000 more and not a basis point beyond — the rug this closes was
    // minting to themselves until the buyers' share rounded to nothing.
    const attempt = (shareBps: number) => {
      const asset = Keypair.generate();
      return program.methods
        .mintGenesis(shareBps, "https://attention.fi/g.json")
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          recipient: wallet,
          subjectMint,
          curve: curvePda,
          genesis: PublicKey.findProgramAddressSync(
            [Buffer.from("genesis"), asset.publicKey.toBuffer()],
            program.programId
          )[0],
          pool: poolPda,
          asset: asset.publicKey,
          mplCoreProgram: MPL_CORE_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        })
        .signers([asset])
        .rpc();
    };

    let threw = false;
    try {
      await attempt(9_001);
    } catch (err) {
      threw = true;
      assert.include(String(err), "ShareOversubscribed");
    }
    assert.isTrue(threw, "a creator cannot commit more than they have");

    await attempt(9_000);
    const pool = await program.account.genesisPool.fetch(poolPda);
    assert.strictEqual(pool.totalShareBps.toString(), "10000", "exactly the whole stream");
  });

  it("pays genesis holders on a trade — the pool is no longer omittable", async () => {
    // The account is required now, so a trade cannot route the holders' slice
    // back to the creator by simply leaving it out.
    const before = await program.account.genesisPool.fetch(poolPda);
    await program.methods
      .buy(new anchor.BN(LAMPORTS_PER_SOL), new anchor.BN(0))
      .accountsStrict({
        buyer: wallet,
        global: globalPda,
        treasury,
        curve: curvePda,
        mint: subjectMint,
        vault: ata(curvePda, subjectMint),
        buyerTokenAccount: ata(wallet, subjectMint),
        perk: null,
        genesisPool: poolPda,
        systemProgram: SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      })
      .rpc();

    const after = await program.account.genesisPool.fetch(poolPda);
    assert.isTrue(
      BigInt(after.reserves.toString()) > BigInt(before.reserves.toString()),
      "the holders' slice reached the pool instead of the creator's balance"
    );
  });

  it("bounds a promotion by what the payer authorised", async () => {
    // The listing itself doesn't matter here — the cost guard is checked before
    // anything is charged, and a ceiling of zero can never be satisfied.
    let threw = false;
    try {
      await program.methods
        .promoteListing(1, new anchor.BN(0))
        .accountsPartial({
          payer: wallet,
          treasury,
          subject: subjectMint,
          nftAuction: null,
          collectionAuction: null,
        })
        .rpc();
    } catch (err) {
      threw = true;
      // Either guard is fine: the point is that an unbounded charge is gone.
      assert.isTrue(
        String(err).includes("CostAboveMax") || String(err).includes("Unauthorized"),
        `unexpected failure: ${String(err).slice(0, 200)}`
      );
    }
    assert.isTrue(threw, "a promotion with no headroom cannot be charged");
  });

  it("refuses a placement price with no ceiling", async () => {
    let threw = false;
    try {
      await program.methods
        .setFeeConfig(null, new anchor.BN(String(11 * LAMPORTS_PER_SOL)))
        .accountsStrict({
          authority: wallet,
          global: globalPda,
          feeConfig: feeConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } catch (err) {
      threw = true;
      assert.include(String(err), "InvalidConfig");
    }
    assert.isTrue(threw, "an unbounded daily price is what made a pending promotion unsafe");
  });
});
