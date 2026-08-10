"use client";

import { useCallback, useEffect, useState } from "react";
import { ComputeBudgetProgram, Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { Loader2, Plus, Rocket, Undo2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Notice } from "@/components/ui/notice";
import { DilutionPreview } from "@/components/nft/dilution-preview";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { explorerTx } from "@/lib/solana/config";
import { fetchFeeConfig, fetchGlobal, nftTotalCost } from "@/lib/solana/curve";
import { handleToMint, launchedHandles, mintToToken } from "@/lib/solana/registry";
import { depositGenesisFee, fetchAllocation, fetchGenesisGroups, fetchGroupUnits, type GenesisGroupData, type GroupUnit } from "@/lib/solana/genesis-groups";
import { genesisAllocationPda, genesisNftPda } from "@/lib/solana/program";

const LAMPORTS_PER_SOL = 1_000_000_000;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const sol = (lamports: bigint) => (Number(lamports) / LAMPORTS_PER_SOL).toFixed(3);

/**
 * How many units ride in one transaction.
 *
 * The program caps a batch at ten. Eight is what a client can reliably land:
 * each unit is a `CreateV2` CPI plus an extra signer, and the difference
 * between "usually fits" and "always fits" is worth two fewer per call.
 */
const UNITS_PER_TX = 8;

/** Compute a batch needs — well past the 200k default, which fits one unit. */
const BATCH_CU = 900_000;

interface TxInfo {
  state: TxState;
  title: string;
  detail: string;
  signature?: string;
  explorerUrl?: string;
}

/**
 * Genesis runs — a token's fee-share NFTs sold as a fixed-price batch.
 *
 * Both sides of the same object live here on purpose. A run is one thing with
 * two audiences: the creator filling and closing it, and a buyer taking a unit
 * out of it. Splitting them across two screens would duplicate every number
 * that matters (price, share, how many are left) and let the two copies drift.
 */
export function GenesisRuns({ address }: { address: string }) {
  const readProgram = useReadonlyProgram();

  const [groups, setGroups] = useState<GenesisGroupData[] | null>(null);
  // Anchor can derive every PDA on these instructions but not the treasury —
  // it's a field on Global, not a seed — so a buy that doesn't carry it is
  // rejected before it reaches a wallet.
  const [treasury, setTreasury] = useState<string | null>(null);
  // A unit's price is fixed, but the market fee is charged on top and the
  // program's ceiling now covers both — so the client has to know the rate.
  const [nftFeeBps, setNftFeeBps] = useState<number | null>(null);
  const [tx, setTx] = useState<TxInfo | null>(null);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, global, fees] = await Promise.all([
        fetchGenesisGroups(readProgram).catch(() => []),
        fetchGlobal(readProgram).catch(() => null),
        fetchFeeConfig(readProgram).catch(() => null),
      ]);
      if (cancelled) return;
      setGroups(list);
      setTreasury(global?.treasury ?? null);
      setNftFeeBps(fees?.nftFeeBps ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram, nonce]);

  const mine = (groups ?? []).filter((g) => g.creator === address);
  const others = (groups ?? []).filter((g) => g.creator !== address);

  return (
    <div>
      {tx && (
        <div className="mb-4">
          <TxStatus
            onDismiss={() => setTx(null)}
            state={tx.state}
            title={tx.title}
            detail={tx.detail}
            signature={tx.signature}
            explorerUrl={tx.explorerUrl}
          />
        </div>
      )}

      <StartRun address={address} onTx={setTx} onDone={refresh} />

      <h2 className="mt-8 text-[13px] font-bold">Your runs</h2>
      {groups === null ? (
        <p className="mt-2 font-mono text-[11px] text-[#6B6B6B]">Reading runs…</p>
      ) : mine.length === 0 ? (
        <p className="mt-2 rounded-sm border border-dashed border-white/12 p-4 text-center font-mono text-[11px] text-[#6B6B6B]">
          You haven&apos;t opened one.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {mine.map((g) => (
            <RunCard
              key={g.address}
              group={g}
              address={address}
              treasury={treasury}
              nftFeeBps={nftFeeBps}
              owned
              onTx={setTx}
              onDone={refresh}
            />
          ))}
        </div>
      )}

      <h2 className="mt-8 text-[13px] font-bold">Open runs</h2>
      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[#6B6B6B]">
        Each unit is a permanent claim on a slice of that token&apos;s creator fees. Buying one
        pays the creator directly; the protocol fee is charged on top.
      </p>
      {groups === null ? (
        <p className="mt-2 font-mono text-[11px] text-[#6B6B6B]">Reading runs…</p>
      ) : others.length === 0 ? (
        <p className="mt-2 rounded-sm border border-dashed border-white/12 p-4 text-center font-mono text-[11px] text-[#6B6B6B]">
          Nothing open right now.
        </p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {others.map((g) => (
            <RunCard
              key={g.address}
              group={g}
              address={address}
              treasury={treasury}
              nftFeeBps={nftFeeBps}
              onTx={setTx}
              onDone={refresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ── open a run ─────────────────────────────────────────────────────────── */

function StartRun({
  address,
  onTx,
  onDone,
}: {
  address: string;
  onTx: (t: TxInfo) => void;
  onDone: () => void;
}) {
  const signProgram = useProgram();
  const [open, setOpen] = useState(false);
  const [handle, setHandle] = useState("");
  const [units, setUnits] = useState("5");
  const [sharePct, setSharePct] = useState("1");
  const [price, setPrice] = useState("0.5");
  const [cap, setCap] = useState("1");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");

  // Only the token's own creator may sell a claim on its fees, so the picker
  // offers this wallet's launches rather than every token on the protocol.
  // Read from a timer rather than the effect body: the registry lives in
  // localStorage, so it can't be read during render without the server and the
  // client disagreeing about the first paint.
  const [mine, setMine] = useState<string[]>([]);
  useEffect(() => {
    const id = setTimeout(() => setMine(launchedHandles()), 0);
    return () => clearTimeout(id);
  }, []);

  const unitCount = Number(units) || 0;
  const shareBps = Math.round(Number(sharePct) * 100);
  const totalPct = ((unitCount * shareBps) / 100).toFixed(2);
  const oversubscribed = unitCount * shareBps > 10_000;

  async function start() {
    if (!signProgram) return;
    const subjectMint = handleToMint(handle);
    if (!subjectMint) {
      return onTx({
        state: "failed",
        title: "Unknown token",
        detail: "Pick one of your launched tokens.",
      });
    }
    if (oversubscribed) {
      return onTx({
        state: "failed",
        title: "That sells more than you have",
        detail: `${unitCount} × ${sharePct}% is ${totalPct}% of your fee stream.`,
      });
    }

    const creator = new PublicKey(address);
    const collection = Keypair.generate();
    const lamports = Math.round(Number(price) * LAMPORTS_PER_SOL);
    setBusy(true);
    try {
      // Three steps rather than one: a collection has to exist before it can be
      // escrowed, and the units can only be minted into an escrow that already
      // holds the authority. Each is reported as it lands so a failure names
      // the step that failed instead of the whole flow.
      setStep("Creating the collection…");
      await signProgram.methods
        .createCollection(`${handle} genesis`.slice(0, 64), "")
        .accountsPartial({ payer: creator, collection: collection.publicKey })
        .signers([collection])
        .rpc();

      setStep("Opening the run…");
      await signProgram.methods
        .listGenesisGroup(unitCount, shareBps, new BN(lamports.toString()), Number(cap) || 1)
        .accountsPartial({
          creator,
          subjectMint,
          collection: collection.publicKey,
        })
        .rpc();

      let minted = 0;
      let last = "";
      while (minted < unitCount) {
        const size = Math.min(UNITS_PER_TX, unitCount - minted);
        setStep(`Minting units ${minted + 1}–${minted + size} of ${unitCount}…`);
        const batch = Array.from({ length: size }, () => Keypair.generate());
        last = await signProgram.methods
          .mintGenesisBatch("")
          .accountsPartial({ creator, subjectMint, collection: collection.publicKey })
          .remainingAccounts(
            batch.map((kp) => ({ pubkey: kp.publicKey, isSigner: true, isWritable: true })),
          )
          .preInstructions([computeBudget()])
          .signers(batch)
          .rpc();
        minted += size;
      }

      onTx({
        state: "confirmed",
        title: "Run opened",
        detail: `${unitCount} units · ${sharePct}% each · ${price} SOL`,
        signature: short(last),
        explorerUrl: explorerTx(last),
      });
      setOpen(false);
      onDone();
    } catch (e) {
      onTx({
        state: "failed",
        title: `Couldn't finish: ${step.replace("…", "")}`,
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setBusy(false);
      setStep("");
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-sm border border-signal/40 bg-signal/10 px-4 py-2 font-mono text-[11px] font-bold text-signal"
      >
        <Rocket className="h-3.5 w-3.5" /> OPEN A RUN
      </button>
    );
  }

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold">Open a genesis run</div>
        <button onClick={() => setOpen(false)} className="text-[#6B6B6B] hover:text-[#F5F4F0]">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[#6B6B6B]">
        Sells a fixed number of fee-share NFTs for one of your tokens. The collection&apos;s
        authority is held by the run while it&apos;s open, so the number of units can&apos;t grow
        after someone has bought one — that guarantee is the reason a buyer can price a share at
        all.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            Token
          </span>
          <select
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            className="rounded-sm border border-white/10 bg-[#12181f] px-2 py-2 font-mono text-[11px] outline-none focus:border-signal/50"
          >
            <option value="">Select…</option>
            {mine.map((h) => (
              <option key={h} value={h}>
                @{h}
              </option>
            ))}
          </select>
        </label>
        <Num label="Units" value={units} onChange={setUnits} />
        <Num label="Share each" value={sharePct} onChange={setSharePct} suffix="%" />
        <Num label="Price" value={price} onChange={setPrice} suffix="SOL" />
        <Num label="Max per wallet" value={cap} onChange={setCap} />
      </div>

      {/* Replaces a one-line total that multiplied the two inputs. It ignored
          what the token had already committed, so a creator part-way through a
          programme was shown a number that was simply wrong — and it left the
          reader to work out that a unit's share is a slice of the creator's cut
          rather than of the trade. */}
      <DilutionPreview
        className="mt-3"
        subjectMint={handle ? handleToMint(handle)?.toBase58() ?? null : null}
        units={unitCount}
        shareBpsPerUnit={shareBps}
      />

      {mine.length === 0 && (
        <Notice tone="caution" title="NO LAUNCHED TOKENS ON THIS WALLET" className="mt-2">
          A run sells a slice of a token&apos;s creator fees, so only its creator can open one.
        </Notice>
      )}

      <button
        onClick={() => void start()}
        disabled={busy || !handle || unitCount < 1 || oversubscribed}
        className="mt-3 inline-flex items-center gap-1.5 rounded-sm bg-signal px-4 py-2 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {busy ? step || "WORKING…" : "OPEN RUN"}
      </button>
      {busy && (
        <p className="mt-1.5 font-mono text-[10px] text-[#6B6B6B]">
          Several transactions — you&apos;ll be asked to sign each.
        </p>
      )}
    </div>
  );
}

/* ── one run ────────────────────────────────────────────────────────────── */

function RunCard({
  group,
  address,
  treasury,
  nftFeeBps,
  owned,
  onTx,
  onDone,
}: {
  group: GenesisGroupData;
  address: string;
  treasury: string | null;
  nftFeeBps: number | null;
  owned?: boolean;
  onTx: (t: TxInfo) => void;
  onDone: () => void;
}) {
  const readProgram = useReadonlyProgram();
  const signProgram = useProgram();
  const [units, setUnits] = useState<GroupUnit[] | null>(null);
  const [bought, setBought] = useState(0);
  const [topUpSol, setTopUpSol] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const token = mintToToken(group.subjectMint);
  const label = token ? `@${token.handle}` : short(group.subjectMint);
  const remaining = group.mintedUnits - group.soldUnits;
  const unminted = group.totalUnits - group.mintedUnits;
  const allowance = Math.max(0, group.perWalletCap - bought);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [list, mineCount] = await Promise.all([
        fetchGroupUnits(readProgram, new PublicKey(group.address)).catch(() => []),
        fetchAllocation(
          readProgram,
          new PublicKey(group.subjectMint),
          new PublicKey(address),
        ).catch(() => 0),
      ]);
      if (cancelled) return;
      setUnits(list);
      setBought(mineCount);
    })();
    return () => {
      cancelled = true;
    };
  }, [readProgram, group.address, group.subjectMint, address, group.soldUnits, group.mintedUnits]);

  async function buy() {
    if (!signProgram || !units?.[0]) return;
    if (!treasury || nftFeeBps === null) {
      return onTx({
        state: "failed",
        title: "Couldn't read the protocol fee settings",
        detail: "Try again in a moment.",
      });
    }
    const asset = new PublicKey(units[0].asset);
    setBusy("buy");
    try {
      const sig = await signProgram.methods
        .buyGenesisUnit(new BN(nftTotalCost(group.price, nftFeeBps).toString()))
        .accountsPartial({
          buyer: new PublicKey(address),
          treasury: new PublicKey(treasury),
          creator: new PublicKey(group.creator),
          subjectMint: new PublicKey(group.subjectMint),
          collection: new PublicKey(group.collection),
          asset,
          genesis: genesisNftPda(asset),
          allocation: genesisAllocationPda(
            new PublicKey(group.subjectMint),
            new PublicKey(address),
          ),
        })
        .rpc();
      onTx({
        state: "confirmed",
        title: "Unit bought",
        detail: `${label} · ${(group.shareBps / 100).toFixed(2)}% of creator fees`,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      onDone();
    } catch (e) {
      onTx({
        state: "failed",
        title: "Purchase failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setBusy(null);
    }
  }

  async function mintMore() {
    if (!signProgram || unminted < 1) return;
    setBusy("mint");
    try {
      const size = Math.min(UNITS_PER_TX, unminted);
      const batch = Array.from({ length: size }, () => Keypair.generate());
      const sig = await signProgram.methods
        .mintGenesisBatch("")
        .accountsPartial({
          creator: new PublicKey(address),
          subjectMint: new PublicKey(group.subjectMint),
          collection: new PublicKey(group.collection),
        })
        .remainingAccounts(
          batch.map((kp) => ({ pubkey: kp.publicKey, isSigner: true, isWritable: true })),
        )
        .preInstructions([computeBudget()])
        .signers(batch)
        .rpc();
      onTx({
        state: "confirmed",
        title: `${size} more unit${size === 1 ? "" : "s"} minted`,
        detail: label,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      onDone();
    } catch (e) {
      onTx({
        state: "failed",
        title: "Mint failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setBusy(null);
    }
  }

  /**
   * Route off-platform earnings to the holders who bought a claim on them.
   *
   * Trades credit this pool automatically, so this isn't the usual path — it's
   * for revenue that never touched the curve. Without it a genesis NFT's
   * promise ("a cut of the creator's earnings") could only ever reach trading
   * fees, which is narrower than what the unit is sold as.
   */
  async function topUp() {
    if (!signProgram || !topUpSol) return;
    const lamports = BigInt(Math.floor(Number(topUpSol) * 1_000_000_000));
    if (lamports <= 0n) return;
    setBusy("topup");
    try {
      const sig = await depositGenesisFee(
        signProgram,
        new PublicKey(address),
        new PublicKey(group.subjectMint),
        lamports,
      );
      onTx({
        state: "confirmed",
        title: `Paid ${topUpSol} SOL to holders`,
        detail: `Split pro-rata across ${group.soldUnits} unit${group.soldUnits === 1 ? "" : "s"}`,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      setTopUpSol("");
      onDone();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Transaction failed";
      onTx({
        state: "failed",
        title: "Top-up failed",
        detail: msg.includes("NoStakers")
          ? "No units sold yet — a deposit has nobody to split across."
          : msg,
      });
    } finally {
      setBusy(null);
    }
  }

  async function reclaim() {
    if (!signProgram || !units || units.length === 0) return;
    setBusy("reclaim");
    try {
      const take = units.slice(0, UNITS_PER_TX);
      const sig = await signProgram.methods
        .reclaimGenesisUnits()
        .accountsPartial({
          creator: new PublicKey(address),
          subjectMint: new PublicKey(group.subjectMint),
          collection: new PublicKey(group.collection),
        })
        .remainingAccounts(
          take.map((u) => ({ pubkey: new PublicKey(u.asset), isSigner: false, isWritable: true })),
        )
        .preInstructions([computeBudget()])
        .rpc();
      onTx({
        state: "confirmed",
        title: `${take.length} unit${take.length === 1 ? "" : "s"} reclaimed`,
        detail: "Back in your wallet — the run stays open.",
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      onDone();
    } catch (e) {
      onTx({
        state: "failed",
        title: "Reclaim failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    if (!signProgram) return;
    setBusy("close");
    try {
      const sig = await signProgram.methods
        .closeGenesisGroup()
        .accountsPartial({
          creator: new PublicKey(address),
          subjectMint: new PublicKey(group.subjectMint),
          collection: new PublicKey(group.collection),
        })
        .rpc();
      onTx({
        state: "confirmed",
        title: "Run closed",
        detail: "Collection and rent are back with you; sold units keep earning.",
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      onDone();
    } catch (e) {
      onTx({
        state: "failed",
        title: "Couldn't close",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold">{label}</div>
          <div className="mt-0.5 font-mono text-[10px] text-[#6B6B6B]">
            {(group.shareBps / 100).toFixed(2)}% of creator fees per unit · {sol(group.price)} SOL
            each · max {group.perWalletCap} a wallet
          </div>
        </div>
        <div className="text-right font-mono text-[10px] text-[#6B6B6B]">
          <div className="text-[13px] font-bold text-signal">
            {group.soldUnits}/{group.totalUnits}
          </div>
          sold
        </div>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-signal"
          style={{ width: `${Math.min(100, (group.soldUnits / group.totalUnits) * 100)}%` }}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {owned ? (
          <>
            {unminted > 0 && (
              <Action busy={busy === "mint"} onClick={() => void mintMore()} icon={<Plus className="h-3 w-3" />}>
                MINT {Math.min(UNITS_PER_TX, unminted)} MORE
              </Action>
            )}
            {remaining > 0 && (
              <Action busy={busy === "reclaim"} onClick={() => void reclaim()} icon={<Undo2 className="h-3 w-3" />}>
                RECLAIM {Math.min(UNITS_PER_TX, remaining)}
              </Action>
            )}
            {/* Closing needs an empty escrow, so it only offers itself once
                there is nothing left inside to strand. */}
            {remaining === 0 && (
              <Action busy={busy === "close"} onClick={() => void close()} danger>
                CLOSE RUN
              </Action>
            )}
            {remaining > 0 && (
              <span className="font-mono text-[10px] text-[#6B6B6B]">
                Reclaim the {remaining} unsold before closing.
              </span>
            )}
            {group.soldUnits > 0 && (
              <div className="mt-1 flex w-full flex-wrap items-center gap-2 border-t border-white/[0.06] pt-2.5">
                <span className="font-mono text-[10px] text-[#6B6B6B]">
                  Pay holders directly
                </span>
                <input
                  inputMode="decimal"
                  value={topUpSol}
                  onChange={(e) => setTopUpSol(e.target.value.replace(/[^0-9.]/g, ""))}
                  placeholder="0.0"
                  className="w-24 rounded-sm border border-white/[0.08] bg-[#0A0A0A] px-2 py-1 font-mono text-[11px] outline-none focus:border-signal/50"
                />
                <Action busy={busy === "topup"} onClick={() => void topUp()} disabled={!topUpSol}>
                  TOP UP POOL
                </Action>
                <span className="font-mono text-[10px] text-[#4b5563]">
                  Splits across {group.soldUnits} sold unit{group.soldUnits === 1 ? "" : "s"}.
                  Trading fees already arrive automatically.
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            <Action
              busy={busy === "buy"}
              onClick={() => void buy()}
              disabled={
                remaining === 0 || allowance === 0 || units === null || !treasury || nftFeeBps === null
              }
            >
              BUY A UNIT · {sol(group.price)} SOL
            </Action>
            <span className="font-mono text-[10px] text-[#6B6B6B]">
              {remaining === 0
                ? "Sold out"
                : allowance === 0
                  ? `You hold this run's limit of ${group.perWalletCap}`
                  : `${remaining} left · you may buy ${allowance} more`}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

/* ── bits ───────────────────────────────────────────────────────────────── */

/** A batch mints several assets in one transaction; the 200k default fits one. */
const computeBudget = () => ComputeBudgetProgram.setComputeUnitLimit({ units: BATCH_CU });

function Num({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
        {label}
      </span>
      <div className="flex items-center gap-1.5 rounded-sm border border-white/10 bg-[#12181f] px-2 focus-within:border-signal/50">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[11px] outline-none"
        />
        {suffix && <span className="shrink-0 font-mono text-[10px] text-[#6B6B6B]">{suffix}</span>}
      </div>
    </label>
  );
}

function Action({
  children,
  onClick,
  busy,
  disabled,
  danger,
  icon,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy || disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm border px-3 py-1.5 font-mono text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        danger
          ? "border-noise/40 text-noise hover:bg-noise/10"
          : "border-signal/40 bg-signal/10 text-signal",
      )}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : icon}
      {children}
    </button>
  );
}
