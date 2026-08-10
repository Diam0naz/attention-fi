"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey, Transaction } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { Footer } from "@/components/feed/footer";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { useIsAdmin } from "@/lib/solana/use-admin";
import { fetchFeeConfig, fetchGlobal } from "@/lib/solana/curve";
import { explorerAddress, explorerTx } from "@/lib/solana/config";
import { Notice } from "@/components/ui/notice";
import { EmergencyStop } from "@/components/admin/emergency-stop";
import { TokenSafety } from "@/components/admin/token-safety";
import {
  fetchClaimedPerks,
  fetchPerkGrants,
  parseRecipients,
  type ClaimedPerkData,
  type PerkGrantData,
} from "@/lib/solana/admin-data";

const MAX_LEVEL = 5;
const LAMPORTS_PER_SOL = 1_000_000_000;
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/**
 * How many grants ride in one transaction.
 *
 * Each grant_perk adds two new accounts (the recipient and its grant PDA) plus
 * its instruction data — roughly 78 bytes against the 1232-byte transaction
 * limit — and ~12.3k compute units. Eight stays comfortably inside both, and
 * keeps a failed batch small enough to retry cheaply.
 */
const GRANTS_PER_TX = 8;

interface GlobalConfig {
  authority: string;
  treasury: string;
  feeBps: number;
  creatorFeeShareBps: number;
  graduationSol: bigint;
  virtualTokenReserves: bigint;
  tokenDecimals: number;
  tokensLaunched: bigint;
}

interface FeeSchedule {
  nftFeeBps: number;
  promoLamportsPerDay: bigint;
}

/** The ceiling `config.rs` enforces on any fee, in percent. */
const MAX_FEE_PCT = 10;

/** Trim a number to a plain decimal string, for seeding an editable field. */
const pct = (bps: number) => String(bps / 100);

export function AdminView() {
  const { connected, address, shortAddress } = useWallet();
  const isAdmin = useIsAdmin();
  const readProgram = useReadonlyProgram();
  const signProgram = useProgram();

  const [walletOpen, setWalletOpen] = useState(false);
  const [config, setConfig] = useState<GlobalConfig | null>(null);
  const [fees, setFees] = useState<FeeSchedule | null>(null);
  const [grants, setGrants] = useState<PerkGrantData[]>([]);
  const [claimed, setClaimed] = useState<ClaimedPerkData[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [nonce, setNonce] = useState(0);
  const [tx, setTx] = useState<{
    state: TxState;
    title: string;
    detail: string;
    signature?: string;
    explorerUrl?: string;
  } | null>(null);

  // grant form
  const [recipientsRaw, setRecipientsRaw] = useState("");
  const [level, setLevel] = useState(1);
  const [granting, setGranting] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // economics form — seeded from Global once it loads, then owned by the user
  const [feePct, setFeePct] = useState("");
  const [sharePct, setSharePct] = useState("");
  const [gradSol, setGradSol] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);

  // NFT market form
  const [nftFeePct, setNftFeePct] = useState("");
  const [promoSol, setPromoSol] = useState("");
  const [savingFees, setSavingFees] = useState(false);

  // issuer form
  const [issuer, setIssuer] = useState("");
  const [settingIssuer, setSettingIssuer] = useState(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const [g, f, gr, cl] = await Promise.all([
          fetchGlobal(readProgram),
          fetchFeeConfig(readProgram),
          fetchPerkGrants(readProgram),
          fetchClaimedPerks(readProgram),
        ]);
        if (cancelled) return;
        setConfig(g);
        setFees(f);
        setGrants(gr);
        setClaimed(cl);
        // Seed the editors with what's live. Done here rather than on every
        // render so a refresh mid-edit can't overwrite what's being typed.
        if (g) {
          setFeePct(pct(g.feeBps));
          setSharePct(pct(g.creatorFeeShareBps));
          setGradSol(String(Number(g.graduationSol) / LAMPORTS_PER_SOL));
        }
        setNftFeePct(f ? pct(f.nftFeeBps) : "2.5");
        setPromoSol(f ? String(Number(f.promoLamportsPerDay) / LAMPORTS_PER_SOL) : "0.01");
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, readProgram, nonce]);

  const parsed = parseRecipients(recipientsRaw);
  // A recipient with an outstanding grant would fail the batch on an
  // already-initialised PDA, so flag them before anything is signed.
  const alreadyGranted = new Set(grants.map((g) => g.recipient));
  const duplicates = parsed.valid.filter((r) => alreadyGranted.has(r));
  const grantable = parsed.valid.filter((r) => !alreadyGranted.has(r));

  async function grantPerks() {
    if (!signProgram || !address) return setWalletOpen(true);
    if (grantable.length === 0) return;
    setGranting(true);
    setTx(null);
    const authority = new PublicKey(address);
    const batches: string[][] = [];
    for (let i = 0; i < grantable.length; i += GRANTS_PER_TX) {
      batches.push(grantable.slice(i, i + GRANTS_PER_TX));
    }
    setProgress({ done: 0, total: batches.length });

    let lastSig = "";
    try {
      for (const [i, batch] of batches.entries()) {
        const ixs = await Promise.all(
          batch.map((r) =>
            signProgram.methods
              .grantPerk(level)
              .accountsPartial({ authority, recipient: new PublicKey(r) })
              .instruction(),
          ),
        );
        // One transaction per batch: partial success is recoverable, since
        // already-granted recipients are filtered out on the next attempt.
        const batchTx = new Transaction();
        for (const ix of ixs) batchTx.add(ix);
        lastSig = await signProgram.provider.sendAndConfirm!(batchTx, [], {
          commitment: "confirmed",
        });
        setProgress({ done: i + 1, total: batches.length });
      }
      setTx({
        state: "confirmed",
        title: `Granted ${grantable.length} perk${grantable.length === 1 ? "" : "s"}`,
        detail: `Level ${level} · ${batches.length} transaction${batches.length === 1 ? "" : "s"}`,
        signature: short(lastSig),
        explorerUrl: explorerTx(lastSig),
      });
      setRecipientsRaw("");
      refresh();
    } catch (e) {
      setTx({
        state: "failed",
        title: "Grant failed",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
      // Some batches may have landed; re-read so the list reflects reality.
      refresh();
    } finally {
      setGranting(false);
      setProgress(null);
    }
  }

  /**
   * Retune the trading economics.
   *
   * Only the fields that actually differ are sent; the rest go as null and the
   * program leaves them alone. That matters more than it looks: restating every
   * value on each save means a console showing a stale read would quietly
   * revert whatever changed since it loaded.
   */
  async function saveEconomics() {
    if (!signProgram || !address) return setWalletOpen(true);
    if (!config) return;

    const fee = Math.round(Number(feePct) * 100);
    const share = Math.round(Number(sharePct) * 100);
    const grad = Math.round(Number(gradSol) * LAMPORTS_PER_SOL);

    // Checked here as well as on-chain so a typo is caught before a signature
    // is requested, not after the wallet round trip.
    if (!Number.isFinite(fee) || fee < 0 || fee > MAX_FEE_PCT * 100) {
      return setTx({
        state: "failed",
        title: "Fee out of range",
        detail: `The protocol fee must be between 0% and ${MAX_FEE_PCT}%.`,
      });
    }
    if (!Number.isFinite(share) || share < 0 || share > 10_000) {
      return setTx({
        state: "failed",
        title: "Creator share out of range",
        detail: "The creator's cut is a share of the fee, so it cannot exceed 100%.",
      });
    }
    if (!Number.isFinite(grad) || grad <= 0) {
      return setTx({
        state: "failed",
        title: "Graduation threshold must be above zero",
        detail: "At zero every curve would graduate on its first buy.",
      });
    }

    const nextFee = fee === config.feeBps ? null : fee;
    const nextShare = share === config.creatorFeeShareBps ? null : share;
    const nextGrad = BigInt(grad) === config.graduationSol ? null : new BN(grad.toString());
    if (nextFee === null && nextShare === null && nextGrad === null) {
      return setTx({ state: "confirmed", title: "Nothing to change", detail: "Already live." });
    }

    setSavingConfig(true);
    setTx(null);
    try {
      const sig = await signProgram.methods
        .updateConfig(nextFee, nextShare, nextGrad, null)
        .accountsPartial({ authority: new PublicKey(address) })
        .rpc();
      setTx({
        state: "confirmed",
        title: "Economics updated",
        detail: "Applies to the next trade on every token.",
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      refresh();
    } catch (e) {
      setTx({
        state: "failed",
        title: "Could not update config",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setSavingConfig(false);
    }
  }

  /** Set the NFT market's own fees, creating the account on first save. */
  async function saveFees() {
    if (!signProgram || !address) return setWalletOpen(true);

    const fee = Math.round(Number(nftFeePct) * 100);
    const promo = Math.round(Number(promoSol) * LAMPORTS_PER_SOL);
    if (!Number.isFinite(fee) || fee < 0 || fee > MAX_FEE_PCT * 100) {
      return setTx({
        state: "failed",
        title: "Fee out of range",
        detail: `A marketplace fee must be between 0% and ${MAX_FEE_PCT}%.`,
      });
    }
    if (!Number.isFinite(promo) || promo <= 0) {
      return setTx({
        state: "failed",
        title: "Placement must cost something",
        detail: "At zero, every listing can promote itself forever and the ranking means nothing.",
      });
    }

    setSavingFees(true);
    setTx(null);
    try {
      const sig = await signProgram.methods
        .setFeeConfig(fee, new BN(promo.toString()))
        .accountsPartial({ authority: new PublicKey(address) })
        .rpc();
      setTx({
        state: "confirmed",
        title: fees ? "NFT fees updated" : "NFT fee schedule created",
        detail: `${(fee / 100).toFixed(2)}% a sale · ${promoSol} SOL a day for placement`,
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      refresh();
    } catch (e) {
      setTx({
        state: "failed",
        title: "Could not set NFT fees",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setSavingFees(false);
    }
  }

  async function saveIssuer() {
    if (!signProgram || !address) return setWalletOpen(true);
    let key: PublicKey;
    try {
      key = new PublicKey(issuer.trim());
    } catch {
      setTx({ state: "failed", title: "Invalid issuer", detail: "Not a valid public key." });
      return;
    }
    setSettingIssuer(true);
    try {
      const sig = await signProgram.methods
        .setIssuer(key)
        .accountsPartial({ authority: new PublicKey(address) })
        .rpc();
      setTx({
        state: "confirmed",
        title: "Issuer updated",
        detail: short(key.toBase58()),
        signature: short(sig),
        explorerUrl: explorerTx(sig),
      });
      setIssuer("");
    } catch (e) {
      setTx({
        state: "failed",
        title: "Could not set issuer",
        detail: e instanceof Error ? e.message : "Transaction failed",
      });
    } finally {
      setSettingIssuer(false);
    }
  }

  if (!connected) {
    return (
      <Shell>
        <Panel>
          <div className="text-[15px] font-bold">Connect the protocol authority</div>
          <p className="mt-2 max-w-md text-[12px] leading-relaxed text-[#6B6B6B]">
            This console is gated on-chain: every action here requires the wallet recorded as
            <code className="mx-1 text-[#F5F4F0]">Global.authority</code>.
          </p>
          <button
            onClick={() => setWalletOpen(true)}
            className="mt-5 rounded-sm bg-signal px-6 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]"
          >
            Connect Wallet
          </button>
        </Panel>
        <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      </Shell>
    );
  }

  if (!isAdmin) {
    return (
      <Shell>
        <Panel>
          <div className="text-[15px] font-bold">Not the protocol authority</div>
          <p className="mt-2 max-w-md text-[12px] leading-relaxed text-[#6B6B6B]">
            {shortAddress} isn&apos;t the wallet recorded as <code>Global.authority</code>. Nothing
            here would succeed — the program rejects these instructions from any other signer, so
            this page simply doesn&apos;t render them.
          </p>
          <Link href="/" className="mt-5 inline-block font-mono text-[11px] font-bold text-signal">
            ← Back to the feed
          </Link>
        </Panel>

        {/* Except the stop. Guardians are deliberately not the authority — that
            separation is the point — so gating this page on the authority would
            put the emergency brake behind the one key it exists to work
            without. The panel shows itself read-only to everyone and offers the
            button only to a wallet actually in the set. */}
        <div className="mt-4 flex flex-col gap-4">
          <EmergencyStop isAdmin={false} />
          {/* Flagging is a guardian power, so it cannot live behind the
              authority gate — that would put the fastest safety action behind
              the one key it is designed to work without. */}
          <TokenSafety isAdmin={false} />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="mb-4 flex flex-col gap-4">
        <EmergencyStop isAdmin />
        <TokenSafety isAdmin />
      </div>
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

      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-signal" />
        <h1 className="text-[18px] font-bold">Protocol console</h1>
      </div>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-[#6B6B6B]">
        Authority-only actions. Everything on this page is enforced on-chain, not by this UI.
      </p>

      {/* ── config ─────────────────────────────────────────────── */}
      <h2 className="mt-7 text-[13px] font-bold">Configuration</h2>
      {status === "loading" ? (
        <p className="mt-2 font-mono text-[11px] text-[#6B6B6B]">Reading Global…</p>
      ) : config ? (
        <dl className="mt-3 grid gap-2 font-mono text-[11px] sm:grid-cols-2">
          <Row k="AUTHORITY" v={short(config.authority)} href={explorerAddress(config.authority)} />
          <Row k="TREASURY" v={short(config.treasury)} href={explorerAddress(config.treasury)} />
          <Row k="PROTOCOL FEE" v={`${(config.feeBps / 100).toFixed(2)}%`} accent />
          <Row k="CREATOR SHARE" v={`${(config.creatorFeeShareBps / 100).toFixed(2)}%`} />
          <Row
            k="GRADUATION"
            v={`${(Number(config.graduationSol) / LAMPORTS_PER_SOL).toFixed(2)} SOL`}
          />
          <Row k="TOKENS LAUNCHED" v={config.tokensLaunched.toString()} />
          <Row
            k="NFT SALE FEE"
            v={fees ? `${(fees.nftFeeBps / 100).toFixed(2)}%` : "not set"}
            accent={fees !== null}
          />
          <Row
            k="PLACEMENT / DAY"
            v={
              fees
                ? `${(Number(fees.promoLamportsPerDay) / LAMPORTS_PER_SOL).toFixed(3)} SOL`
                : "not set"
            }
          />
        </dl>
      ) : (
        <p className="mt-2 font-mono text-[11px] text-noise">Couldn&apos;t read Global.</p>
      )}

      {/* The one privileged action that deliberately isn't a button here. */}
      <Notice tone="info" title="AUTHORITY TRANSFER IS NOT A BUTTON" className="mt-3 max-w-2xl">
        The program requires the incoming wallet to sign as well, so a handover runs from{" "}
        <code>scripts/set-authority.ts</code> where both signatures can be collected. That
        requirement is the thing stopping authority being sent to a mistyped address nobody
        controls, and a one-click version here would only be able to weaken it.
      </Notice>

      {!fees && (
        <Notice tone="caution" title="THE NFT MARKET HAS NO FEE SCHEDULE YET" className="mt-2 max-w-2xl">
          <code>FeeConfig</code> doesn&apos;t exist on this deployment, and the instructions that
          charge it — buying an asset or a collection, buying a genesis unit, promoting a listing
          — cannot run until it does. Saving below creates it.
        </Notice>
      )}

      {/* ── economics ──────────────────────────────────────────── */}
      <h2 className="mt-8 text-[13px] font-bold">Trading economics</h2>
      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[#6B6B6B]">
        Live values, editable. A change applies to the next trade on every token — no redeploy.
        Anything left as it is gets sent as &ldquo;unchanged&rdquo; rather than rewritten, so a
        stale reading of this page can&apos;t revert something you altered elsewhere.
      </p>
      <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-3">
        <Field
          label="Protocol fee"
          suffix="%"
          value={feePct}
          onChange={setFeePct}
          hint={`0–${MAX_FEE_PCT}% of each trade`}
        />
        <Field
          label="Creator share"
          suffix="%"
          value={sharePct}
          onChange={setSharePct}
          hint="of the fee, not of the trade"
        />
        <Field
          label="Graduation"
          suffix="SOL"
          value={gradSol}
          onChange={setGradSol}
          hint="raised before the AMM"
        />
      </div>
      <Notice tone="caution" title="LOWERING GRADUATION GRADUATES CURVES IMMEDIATELY" className="mt-2 max-w-2xl">
        The threshold is read live on every buy, so any curve already past a new, lower line
        migrates on its next trade. That is the point of it being tunable — but it is not
        reversible for the curves it catches.
      </Notice>
      <button
        onClick={() => void saveEconomics()}
        disabled={savingConfig || !config}
        className="mt-3 rounded-sm border border-signal/40 bg-signal/10 px-4 py-2 font-mono text-[11px] font-bold text-signal disabled:cursor-not-allowed disabled:opacity-40"
      >
        {savingConfig ? "SAVING…" : "SAVE ECONOMICS"}
      </button>

      {/* ── nft market ─────────────────────────────────────────── */}
      <h2 className="mt-8 text-[13px] font-bold">NFT market</h2>
      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[#6B6B6B]">
        Priced apart from trading on purpose. A trading fee is charged over and over on the same
        capital as it moves along a curve; a marketplace fee is charged once, when a piece changes
        hands. They were one number only because they shared a field.
      </p>
      <div className="mt-3 grid max-w-2xl gap-3 sm:grid-cols-2">
        <Field
          label="Sale fee"
          suffix="%"
          value={nftFeePct}
          onChange={setNftFeePct}
          hint="charged on top of the sale price"
        />
        <Field
          label="Promoted placement"
          suffix="SOL / day"
          value={promoSol}
          onChange={setPromoSol}
          hint="listing stays free; this buys visibility"
        />
      </div>
      <button
        onClick={() => void saveFees()}
        disabled={savingFees}
        className="mt-3 rounded-sm border border-signal/40 bg-signal/10 px-4 py-2 font-mono text-[11px] font-bold text-signal disabled:cursor-not-allowed disabled:opacity-40"
      >
        {savingFees ? "SAVING…" : fees ? "SAVE NFT FEES" : "CREATE FEE SCHEDULE"}
      </button>

      {config && config.authority === config.treasury && (
        <Notice tone="caution" title="AUTHORITY AND TREASURY ARE THE SAME WALLET" className="mt-2 max-w-2xl">
          Protocol fees accrue to the key that can also change protocol settings. Workable for
          testing; worth separating before real money moves, so a compromised operator key
          doesn&apos;t also drain the treasury.
        </Notice>
      )}

      {/* ── perk grants ────────────────────────────────────────── */}
      <h2 className="mt-8 text-[13px] font-bold">Grant perks</h2>
      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[#6B6B6B]">
        Authorises each wallet to claim a perk at the chosen level. You pay only for the small
        grant record; the recipient funds their own NFT when they claim. Perks are soulbound, so a
        granted discount can&apos;t be resold.
      </p>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_240px]">
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            Recipient wallets
          </label>
          <textarea
            value={recipientsRaw}
            onChange={(e) => setRecipientsRaw(e.target.value)}
            rows={7}
            placeholder={"One address per line — commas and spaces work too.\nPaste straight from your task sheet."}
            className="mt-1 w-full resize-y rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[11px] outline-none placeholder:text-[#4b5563] focus:border-signal/50"
          />
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
            <span className="text-signal">{grantable.length} to grant</span>
            {duplicates.length > 0 && (
              <span className="text-[#FFB020]">
                {duplicates.length} already have an unclaimed grant — skipped
              </span>
            )}
            {parsed.invalid.length > 0 && (
              <span className="text-noise">
                {parsed.invalid.length} unreadable: {parsed.invalid.slice(0, 3).join(", ")}
                {parsed.invalid.length > 3 ? "…" : ""}
              </span>
            )}
          </div>
        </div>

        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
            Level
          </label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Array.from({ length: MAX_LEVEL }, (_, i) => i + 1).map((l) => (
              <button
                key={l}
                onClick={() => setLevel(l)}
                className={cn(
                  "rounded-sm border px-3 py-2 font-mono text-[11px] transition-colors",
                  level === l
                    ? "border-signal bg-signal/10 text-signal"
                    : "border-white/10 text-[#6B6B6B] hover:border-white/25",
                )}
              >
                {l}
              </button>
            ))}
          </div>
          <p className="mt-1.5 font-mono text-[10px] text-[#6B6B6B]">
            {level}% off every trade, forever.
          </p>

          <button
            onClick={() => void grantPerks()}
            disabled={granting || grantable.length === 0}
            className="mt-3 w-full rounded-sm bg-signal py-2.5 font-mono text-[11px] font-bold text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {granting
              ? progress
                ? `SIGNING ${progress.done + 1}/${progress.total}…`
                : "GRANTING…"
              : `GRANT ${grantable.length || ""}`.trim()}
          </button>
          {grantable.length > GRANTS_PER_TX && (
            <p className="mt-1.5 font-mono text-[10px] text-[#6B6B6B]">
              {Math.ceil(grantable.length / GRANTS_PER_TX)} transactions — you&apos;ll be asked to
              sign each.
            </p>
          )}
        </div>
      </div>

      {/* ── outstanding vs claimed ─────────────────────────────── */}
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <div>
          <h2 className="text-[13px] font-bold">
            Unclaimed grants <span className="text-[#6B6B6B]">({grants.length})</span>
          </h2>
          <p className="mt-1 font-mono text-[10px] text-[#6B6B6B]">
            Promised discounts not yet minted.
          </p>
          {grants.length === 0 ? (
            <p className="mt-2 rounded-sm border border-dashed border-white/12 p-4 text-center font-mono text-[11px] text-[#6B6B6B]">
              Nothing outstanding.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {grants.map((g) => (
                <div
                  key={g.address}
                  className="flex items-center justify-between rounded-sm border border-white/[0.08] bg-[#0f1620] px-3 py-2 font-mono text-[11px]"
                >
                  <a
                    href={explorerAddress(g.recipient)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#F5F4F0] hover:text-signal"
                  >
                    {short(g.recipient)}
                  </a>
                  <span className="text-signal">Lvl {g.level}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <h2 className="text-[13px] font-bold">
            Claimed perks <span className="text-[#6B6B6B]">({claimed.length})</span>
          </h2>
          <p className="mt-1 font-mono text-[10px] text-[#6B6B6B]">
            Live discounts against protocol revenue.
          </p>
          {claimed.length === 0 ? (
            <p className="mt-2 rounded-sm border border-dashed border-white/12 p-4 text-center font-mono text-[11px] text-[#6B6B6B]">
              None claimed yet.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-1.5">
              {claimed.map((p) => (
                <div
                  key={p.owner + p.level}
                  className="flex items-center justify-between rounded-sm border border-white/[0.08] bg-[#0f1620] px-3 py-2 font-mono text-[11px]"
                >
                  <a
                    href={explorerAddress(p.owner)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#F5F4F0] hover:text-signal"
                  >
                    {short(p.owner)}
                  </a>
                  <span className="text-signal">
                    Lvl {p.level} · {(p.discountBps / 100).toFixed(0)}% off
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── issuer ─────────────────────────────────────────────── */}
      <h2 className="mt-8 text-[13px] font-bold">Attestation issuer</h2>
      <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-[#6B6B6B]">
        The key whose SAS attestations <code>verify_handle</code> will accept.
      </p>
      <Notice tone="danger" title="ROTATING THIS BREAKS VERIFICATION IN FLIGHT" className="mt-2 max-w-2xl">
        Attestations signed by the previous issuer stop being accepted the moment this lands.
        Anyone mid-verification has to start over, and the backend holding the old key can no
        longer issue badges until it is updated to match. Rotate the key and the backend together.
      </Notice>
      <div className="mt-2 flex max-w-xl gap-1.5">
        <input
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
          placeholder="Issuer public key"
          className="min-w-0 flex-1 rounded-sm border border-white/10 bg-[#12181f] px-3 py-2 font-mono text-[11px] outline-none placeholder:text-[#4b5563] focus:border-signal/50"
        />
        <button
          onClick={() => void saveIssuer()}
          disabled={settingIssuer || issuer.trim() === ""}
          className="shrink-0 rounded-sm border border-signal/40 bg-signal/10 px-4 py-2 font-mono text-[11px] font-bold text-signal disabled:cursor-not-allowed disabled:opacity-40"
        >
          {settingIssuer ? "SETTING…" : "SET ISSUER"}
        </button>
      </div>

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
    </Shell>
  );
}

function Field({
  label,
  suffix,
  value,
  onChange,
  hint,
}: {
  label: string;
  suffix: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <div>
      <label className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6B6B6B]">
        {label}
      </label>
      <div className="mt-1 flex items-center gap-1.5 rounded-sm border border-white/10 bg-[#12181f] px-3 focus-within:border-signal/50">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          className="min-w-0 flex-1 bg-transparent py-2 font-mono text-[11px] outline-none placeholder:text-[#4b5563]"
        />
        <span className="shrink-0 font-mono text-[10px] text-[#6B6B6B]">{suffix}</span>
      </div>
      <p className="mt-1 font-mono text-[10px] text-[#4b5563]">{hint}</p>
    </div>
  );
}

function Row({ k, v, accent, href }: { k: string; v: string; accent?: boolean; href?: string }) {
  return (
    <div className="flex justify-between border-b border-white/[0.06] pb-2">
      <span className="text-[#6B6B6B]">{k}</span>
      {href ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-[#F5F4F0] hover:text-signal">
          {v}
        </a>
      ) : (
        <span className={accent ? "text-signal" : "text-[#F5F4F0]"}>{v}</span>
      )}
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-8">{children}</div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[#6B6B6B] hover:text-[#F5F4F0]">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="font-mono text-[11px]">Feed</span>
        </Link>
        <span className="text-[#4b5563]">/</span>
        <span className="font-mono text-[12px] text-signal">Admin</span>
        {/* Address and Disconnect live in the global nav above. */}
      </nav>
      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-7">{children}</div>
      <Footer />
    </div>
  );
}
