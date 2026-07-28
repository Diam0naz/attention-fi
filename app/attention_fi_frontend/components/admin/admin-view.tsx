"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PublicKey, Transaction } from "@solana/web3.js";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWallet } from "@/components/wallet/wallet-provider";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { Footer } from "@/components/feed/footer";
import { useProgram, useReadonlyProgram } from "@/lib/solana/use-program";
import { useIsAdmin } from "@/lib/solana/use-admin";
import { fetchGlobal } from "@/lib/solana/curve";
import { explorerAddress, explorerTx } from "@/lib/solana/config";
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
  tokenDecimals: number;
  tokensLaunched: bigint;
}

export function AdminView() {
  const { connected, address, shortAddress, disconnect } = useWallet();
  const isAdmin = useIsAdmin();
  const readProgram = useReadonlyProgram();
  const signProgram = useProgram();

  const [walletOpen, setWalletOpen] = useState(false);
  const [config, setConfig] = useState<GlobalConfig | null>(null);
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

  // issuer form
  const [issuer, setIssuer] = useState("");
  const [settingIssuer, setSettingIssuer] = useState(false);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    void (async () => {
      try {
        const [g, gr, cl] = await Promise.all([
          fetchGlobal(readProgram),
          fetchPerkGrants(readProgram),
          fetchClaimedPerks(readProgram),
        ]);
        if (cancelled) return;
        setConfig(g);
        setGrants(gr);
        setClaimed(cl);
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
      <Shell shortAddress={shortAddress} onDisconnect={disconnect}>
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
      </Shell>
    );
  }

  return (
    <Shell shortAddress={shortAddress} onDisconnect={disconnect}>
      {tx && (
        <div className="mb-4">
          <TxStatus
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
        </dl>
      ) : (
        <p className="mt-2 font-mono text-[11px] text-noise">Couldn&apos;t read Global.</p>
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
        The key whose SAS attestations <code>verify_handle</code> will accept. Changing it
        invalidates verification requests signed by the previous issuer, so rotate it only
        alongside the backend that holds it.
      </p>
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

function Shell({
  children,
  shortAddress,
  onDisconnect,
}: {
  children: React.ReactNode;
  shortAddress?: string | null;
  onDisconnect?: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <nav className="flex items-center gap-3 border-b border-white/[0.08] px-5 py-3">
        <Link href="/" className="inline-flex items-center gap-1.5 text-[#6B6B6B] hover:text-[#F5F4F0]">
          <ArrowLeft className="h-3.5 w-3.5" />
          <span className="font-mono text-[11px]">Feed</span>
        </Link>
        <span className="text-[#4b5563]">/</span>
        <span className="font-mono text-[12px] text-signal">Admin</span>
        {shortAddress && (
          <button
            onClick={onDisconnect}
            className="ml-auto rounded-sm border border-white/10 px-2.5 py-1 font-mono text-[10px] text-[#6B6B6B] transition-colors hover:text-noise"
          >
            Disconnect
          </button>
        )}
      </nav>
      <div className="mx-auto w-full max-w-4xl flex-1 px-5 py-7">{children}</div>
      <Footer />
    </div>
  );
}
