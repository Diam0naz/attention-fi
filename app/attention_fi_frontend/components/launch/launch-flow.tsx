"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifyHandleFlow } from "@/components/onboarding/verify-handle-flow";
import { WalletConnectModal } from "@/components/wallet/wallet-connect-modal";
import { useWallet } from "@/components/wallet/wallet-provider";
import { TxStatus, type TxState } from "@/components/wallet/tx-status";
import { PageBackground } from "@/components/reactbits/page-background";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@anchor-lang/core";
import { useProgram } from "@/lib/solana/use-program";
import { metadataPda } from "@/lib/solana/program";
import { useQueryClient } from "@tanstack/react-query";
import { nftPortfolioKey } from "@/components/nft/use-nft-portfolio";
import { registerToken, syncRegistry } from "@/lib/solana/registry";
import { explorerTx, tokenMetadataUri, verificationMetadataUri } from "@/lib/solana/config";
import { verificationPda } from "@/lib/solana/program";
import { mindshareFeedEnabled, launchFromFeed } from "@/lib/solana/mindshare-feed";
import { useHandleMindshare } from "@/components/launch/use-handle-mindshare";
import { verifyMessage } from "@/lib/sas/config";

type MechId = "bonding" | "dutch" | "conviction" | "revenue";

const MECHANISMS: { id: MechId; name: string; badge?: string; desc: string }[] = [
  { id: "bonding", name: "Bonding Curve", badge: "DEFAULT", desc: "Mindshare-seeded price, graduates to a native AMM." },
  { id: "dutch", name: "Dutch Auction", desc: "Price starts high and descends until the allocation fills — no front-running edge." },
  { id: "conviction", name: "Conviction Curve", desc: "Slower rise with a time-lock; early exits forfeit a penalty." },
  { id: "revenue", name: "Revenue Share", desc: "The token is a pro-rata claim on the subject's fee stream." },
];

// Mindshare tier → seed market cap (mirrors the program's seed tiers).
const TIERS = [
  { min: 3, tier: "Top 10", seed: "$15,000" },
  { min: 1, tier: "Top 100", seed: "$4,000" },
  { min: 0.4, tier: "Emerging", seed: "$800" },
  { min: 0, tier: "New", seed: "$69" },
];
const tierFor = (m: number) => TIERS.find((t) => m >= t.min) ?? TIERS[TIERS.length - 1];

// UI tier label → on-chain MindshareTier enum arg.
const TIER_ARG: Record<string, object> = {
  "Top 10": { top10: {} },
  "Top 100": { top100: {} },
  Emerging: { emerging: {} },
  New: { newEntrant: {} },
};

// Seed virtual SOL reserves per tier, in lamports (mirrors constants.rs) —
// used to derive a fair per-token starting price for the non-bonding
// mechanisms, the same way the bonding curve's own tier seeding works.
const TIER_SEED_LAMPORTS: Record<string, number> = {
  "Top 10": 100_000_000_000,
  "Top 100": 26_700_000_000,
  Emerging: 5_330_000_000,
  New: 500_000_000,
};
const TOKEN_TOTAL_SUPPLY_WHOLE = 1_000_000_000; // mirrors constants.rs TOKEN_TOTAL_SUPPLY
const pricePerTokenLamports = (tier: string) =>
  Math.max(1, Math.round((TIER_SEED_LAMPORTS[tier] ?? TIER_SEED_LAMPORTS.New!) / TOKEN_TOTAL_SUPPLY_WHOLE));

const DEFAULT_AUCTION_DURATION_S = 24 * 60 * 60;
const DEFAULT_LOCK_PERIOD_S = 7 * 24 * 60 * 60;
const DEFAULT_EARLY_EXIT_PENALTY_BPS = 1_000;

// The launch image is stored only in the browser-local token registry (never
// on-chain), so a self-contained data: URI is fine — it just needs room. Cap
// the source bytes so a pasted/encoded image can't blow the localStorage quota.
const IMAGE_MAX_CHARS = 500_000; // ~375 KB once base64-decoded
const IMAGE_MAX_FILE_BYTES = 360_000; // keeps the encoded data URI under the cap

// When X OAuth is configured, verification requires proving X-handle ownership
// (redirect flow) before the wallet signature. Off → dev sign-only flow.
const X_OAUTH_ENABLED = process.env.NEXT_PUBLIC_X_OAUTH_ENABLED === "true";
// The launch draft is stashed here across the full-page X redirect, which
// would otherwise reset this component's state to step 0.
const LAUNCH_DRAFT_KEY = "af.launch.draft";

/** Read a picked image file into a data: URI, rejecting oversized files rather
 *  than truncating (a sliced data URI is a corrupt image). */
function readImageFile(
  file: File,
  onDone: (dataUrl: string) => void,
  onErr: (message: string) => void,
): void {
  if (!file.type.startsWith("image/")) return onErr("That file isn't an image.");
  if (file.size > IMAGE_MAX_FILE_BYTES) {
    return onErr(`Image is too large (${Math.round(file.size / 1024)} KB) — pick one under ~350 KB.`);
  }
  const reader = new FileReader();
  reader.onload = () => onDone(typeof reader.result === "string" ? reader.result : "");
  reader.onerror = () => onErr("Couldn't read that image.");
  reader.readAsDataURL(file);
}

const STEPS = ["Mechanism", "Verify", "Seed & review", "Confirm"];

export function LaunchFlow() {
  const { connected, shortAddress, address, getSigner } = useWallet();
  const program = useProgram();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0); // 0..3
  const [mech, setMech] = useState<MechId>("bonding");
  const [handle, setHandle] = useState("");
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [image, setImage] = useState("");
  const [imageErr, setImageErr] = useState<string | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);
  // Wallet is connected (1); start on "awaiting signature" (2) so the SIGN button shows.
  const [verifyStep, setVerifyStep] = useState<2 | 3>(2);
  const [verifying, setVerifying] = useState(false);
  const [verifyErr, setVerifyErr] = useState<string | null>(null);
  // The handle this wallet is already verified as, if any. Verification is a
  // one-time, wallet-level credential (the Verification PDA is `init`, one per
  // wallet), so once it exists every future launch skips the verify step.
  const [verifiedHandle, setVerifiedHandle] = useState<string | null>(null);
  // The X handle proven via OAuth this session (before the on-chain credential
  // exists). Required to sign when X_OAUTH_ENABLED.
  const [xVerified, setXVerified] = useState<string | null>(null);
  const [xError, setXError] = useState<string | null>(null);

  // Returning from the X redirect: /launch?x=<handle> or ?x_error=<reason>.
  // Restore the pre-redirect draft and resume at the verify step.
  //
  // The set-state-in-effect rule is suppressed here rather than worked around,
  // because every way around it is worse. /launch is prerendered, so reading
  // sessionStorage from a useState initialiser would produce markup that
  // disagrees with the server's and trigger a hydration mismatch — on the one
  // path where the user is mid-OAuth and least able to afford a glitch.
  // Deferring the writes behind an await would satisfy the linter while
  // changing nothing about the cascading render it exists to prevent.
  //
  // This is also the case the rule explicitly carves out: reading state back
  // from an external system (sessionStorage and the URL) once on mount, which
  // is what effects are for. It runs only when ?x= or ?x_error= is present.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const x = sp.get("x");
    const xErr = sp.get("x_error");
    if (!x && !xErr) return;
    try {
      const raw = sessionStorage.getItem(LAUNCH_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as Partial<{ mech: MechId; name: string; symbol: string; image: string }>;
        if (d.mech) setMech(d.mech);
        if (typeof d.name === "string") setName(d.name);
        if (typeof d.symbol === "string") setSymbol(d.symbol);
        if (typeof d.image === "string") setImage(d.image);
      }
    } catch {
      // ignore a malformed draft
    }
    if (x) {
      setXVerified(x);
      setHandle(x);
      setStep(1);
    } else if (xErr) {
      setXError(
        xErr === "denied"
          ? "X authorization was cancelled."
          : "Couldn't verify with X — please try again.",
      );
      setStep(1);
    }
    window.history.replaceState({}, "", "/launch");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (!address || !program) return;
    let cancelled = false;
    (async () => {
      try {
        const pda = verificationPda(new PublicKey(address));
        const record = await program.account.verification.fetchNullable(pda);
        if (cancelled) return;
        if (record) {
          setVerifiedHandle(record.handle);
          setVerifyStep(3); // already verified — skip the sign step
        } else {
          setVerifiedHandle(null);
          setVerifyStep(2);
        }
      } catch {
        // RPC hiccup — leave the sign step available rather than blocking.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address, program]);
  const [tx, setTx] = useState<TxState | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);
  const [txErr, setTxErr] = useState<string | null>(null);

  // Priced from the trailing 24h average, not the spot reading: a launch can be
  // timed against a spike, which is the same reason the on-chain oracle reads
  // the average. Until the lookup answers, the tier stays at the floor — a
  // failed read must not be able to hand someone a Top 10 seed, since off the
  // oracle path this tier *is* what the program is told.
  const { data: ms, isFetching: msLoading } = useHandleMindshare(handle);
  const mindshare = ms?.mindshare24h ?? null;
  const t = tierFor(mindshare ?? 0);
  const mechName = MECHANISMS.find((m) => m.id === mech)!.name;
  // Bonding launches seed their tier from the on-chain Switchboard mindshare
  // feed when one is configured — a decentralized oracle, not a keeper arg.
  const feedActive = mech === "bonding" && mindshareFeedEnabled();
  // Symbol defaults to the token name (or handle) if the creator leaves it blank.
  const ticker = (symbol || name || handle).replace(/[^a-zA-Z0-9]/g, "").slice(0, 6).toUpperCase();
  const canContinue = step !== 0 || (handle.trim().length > 0 && name.trim().length > 0);

  function next() {
    if (step === 1 && verifyStep < 3) return; // must finish verify
    setStep((s) => Math.min(3, s + 1));
  }

  async function launch() {
    if (!program || !address) return setWalletOpen(true);
    setTxErr(null);
    setTx("pending");
    try {
      const mint = Keypair.generate();
      const creator = new PublicKey(address);
      const tierArg = TIER_ARG[t.tier] as never;
      const price = pricePerTokenLamports(t.tier);
      // Written to the token's Metaplex metadata, so a wallet or explorer that
      // has never heard of AttentionFi still shows a name rather than an
      // address. The program bounds these at 32/10/200 characters.
      //
      // `uri` points at our own metadata route rather than a hosted file. The
      // launch image is a data: URI — far past the on-chain limit and the wrong
      // kind of thing, since Metaplex wants a URL to a JSON document — and this
      // metadata is written immutable, so a URL that resolves at read time is
      // the only version of this that stays correctable. The route derives
      // everything from the mint, which is why it can be built before the token
      // or its registry row exists.
      const metadataArg = {
        name: name.slice(0, 32),
        symbol: ticker.slice(0, 10),
        uri: tokenMetadataUri(mint.publicKey.toBase58()),
      };
      const metadata = metadataPda(mint.publicKey);
      let sig: string;
      if (mech === "bonding") {
        // When a Switchboard mindshare feed is configured, seed the tier from
        // the on-chain oracle (decentralized) rather than the keeper tier arg.
        sig = mindshareFeedEnabled()
          ? await launchFromFeed(program, mint, metadataArg)
          : await program.methods
              .launchToken(tierArg, metadataArg)
              .accounts({ creator, mint: mint.publicKey, metadata })
              .signers([mint])
              .rpc();
      } else if (mech === "dutch") {
        sig = await program.methods
          .startAuction(
            tierArg,
            new BN(price * 3),
            new BN(price),
            new BN(DEFAULT_AUCTION_DURATION_S),
            metadataArg,
          )
          .accounts({ creator, mint: mint.publicKey, metadata })
          .signers([mint])
          .rpc();
      } else if (mech === "conviction") {
        sig = await program.methods
          .launchConviction(
            tierArg,
            new BN(DEFAULT_LOCK_PERIOD_S),
            DEFAULT_EARLY_EXIT_PENALTY_BPS,
            metadataArg,
          )
          .accounts({ creator, mint: mint.publicKey, metadata })
          .signers([mint])
          .rpc();
      } else {
        sig = await program.methods
          .launchRevenue(tierArg, new BN(price), metadataArg)
          .accounts({ creator, mint: mint.publicKey, metadata })
          .signers([mint])
          .rpc();
      }
      registerToken(
        handle,
        mint.publicKey.toBase58(),
        { name, symbol: ticker, image: image || undefined },
        { creator: address, mechanism: mech },
      );
      // registerToken writes through to the server registry; re-pull it so the
      // new token is searchable from this session without waiting for the
      // periodic refresh.
      void syncRegistry(true);
      setTxSig(sig);
      setTx("confirmed");
    } catch (e) {
      setTxErr(e instanceof Error ? e.message : "Launch failed");
      setTx("failed");
    }
  }

  // Kick off X OAuth: stash the draft (the redirect resets this component),
  // then hand off to the server flow which returns to /launch?x=<handle>.
  function verifyWithX() {
    if (!address) return setWalletOpen(true);
    setXError(null);
    try {
      sessionStorage.setItem(LAUNCH_DRAFT_KEY, JSON.stringify({ mech, name, symbol, image }));
    } catch {
      // sessionStorage unavailable — proceed anyway, the user just re-enters
    }
    window.location.href = `/api/verify/x/start?wallet=${encodeURIComponent(address)}`;
  }

  // Wallet signs the exact copy VerifyHandleFlow shows; the server verifies
  // that signature, then issues a real SAS attestation (see /api/verify).
  // That attestation is what verifyHandle checks on-chain before minting the
  // soulbound credential NFT — no step here is mocked.
  async function signAndVerify() {
    if (!program || !address) return setWalletOpen(true);
    const signer = getSigner();
    if (!signer?.signMessage) {
      setVerifyErr("This wallet doesn't support message signing.");
      return;
    }
    setVerifying(true);
    setVerifyErr(null);
    try {
      const messageBytes = new TextEncoder().encode(verifyMessage(handle, address));
      const signed = await signer.signMessage(messageBytes);
      const signatureBytes = signed instanceof Uint8Array ? signed : signed.signature;
      const signatureB64 = Buffer.from(signatureBytes).toString("base64");

      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, wallet: address, signature: signatureB64 }),
      });
      const json: { attestation?: string; error?: string; needsX?: boolean } = await res.json();
      if (res.status === 403 && json.needsX) {
        // The X proof expired (10-min window) — send them back through OAuth.
        setXVerified(null);
        throw new Error("Your X verification expired — verify with X again.");
      }
      if (!res.ok || !json.attestation) throw new Error(json.error ?? "verification failed");

      const subject = new PublicKey(address);
      const asset = Keypair.generate();
      await program.methods
        // Points at our own metadata route rather than a static file, so the
        // badge's artwork can be restyled later by updating a row instead of
        // rewriting an on-chain uri nobody but the update authority can touch.
        .verifyHandle(handle, verificationMetadataUri(subject.toBase58()))
        .accounts({
          payer: subject,
          subject,
          attestation: new PublicKey(json.attestation),
          asset: asset.publicKey,
        })
        .signers([asset])
        .rpc();
      setVerifiedHandle(handle);
      // The badge exists now — the NFT screens and the bell shouldn't wait for
      // their own polls to notice.
      void queryClient.invalidateQueries({ queryKey: nftPortfolioKey(address) });
      setVerifyStep(3);
    } catch (e) {
      setVerifyErr(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <>
      <div className="pointer-events-none fixed inset-0 -z-10 opacity-80 [mask-image:radial-gradient(ellipse_at_center,#000_25%,transparent_85%)]">
        <PageBackground />
      </div>
      <div className="relative mx-auto min-h-screen max-w-lg px-5 py-6">
      {/* header + progress */}
      <div className="flex items-center gap-2">
        <Link href="/" className="text-[#6B6B6B] hover:text-[#F5F4F0]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <span className="text-[15px] font-bold">Launch a token</span>
        {/* No wallet chip here — the global nav shows the address one row up.
            This page sits behind the connect gate, so it can only ever be read
            by a connected wallet, and restating that pushed the row past the
            viewport on a phone. Step 1 still offers Connect for the case where
            a wallet drops mid-flow. */}
      </div>
      <div className="mt-4 flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn("h-[3px] flex-1 rounded-full", i <= step ? "bg-signal" : "bg-white/10")}
          />
        ))}
      </div>
      <div className="mt-4 font-mono text-[9px] uppercase tracking-[0.1em] text-[#6B6B6B]">
        Step {step + 1} · {STEPS[step]}
      </div>

      <div className="mt-4">
        {/* Step 1 — mechanism + handle */}
        {step === 0 && (
          <div className="flex flex-col gap-2.5">
            {MECHANISMS.map((m) => (
              <button
                key={m.id}
                onClick={() => setMech(m.id)}
                className={cn(
                  "rounded-sm border p-3.5 text-left transition-colors",
                  mech === m.id ? "border-signal bg-signal/[0.06]" : "border-white/[0.08] hover:border-white/20",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-bold">{m.name}</span>
                  {m.badge && (
                    <span className="rounded-sm bg-signal px-1.5 py-0.5 font-mono text-[8px] font-bold text-[#0A0A0A]">
                      {m.badge}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[11px] leading-relaxed text-[#9aa4af]">{m.desc}</p>
              </button>
            ))}
            <label className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
              X account this token represents
            </label>
            <div className="flex items-center rounded-sm border border-white/10 bg-[#12181f] px-3">
              <span className="text-[#6B6B6B]">@</span>
              <input
                value={handle}
                // X handles are case-insensitive and ≤15 chars — normalize to
                // lowercase so the attestation, registry, and PDA all agree.
                onChange={(e) => setHandle(e.target.value.replace(/[^a-zA-Z0-9_]/g, "").toLowerCase().slice(0, 15))}
                placeholder="handle"
                className="w-full bg-transparent px-1.5 py-2.5 text-[13px] outline-none placeholder:text-[#4b5563]"
              />
            </div>

            <div className="mt-1 grid grid-cols-[1fr_120px] gap-2">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
                  Token name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value.slice(0, 32))}
                  placeholder="e.g. Solana KOL"
                  className="mt-1 w-full rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 text-[13px] outline-none placeholder:text-[#4b5563]"
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
                  Symbol
                </label>
                <div className="mt-1 flex items-center rounded-sm border border-white/10 bg-[#12181f] px-3">
                  <span className="text-[#6B6B6B]">$</span>
                  <input
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value.replace(/[^a-zA-Z0-9]/g, "").slice(0, 6))}
                    placeholder={ticker || "TICKER"}
                    className="w-full bg-transparent px-1 py-2.5 font-mono text-[13px] uppercase outline-none placeholder:text-[#4b5563]"
                  />
                </div>
              </div>
            </div>

            <div className="mt-1">
              <div className="flex items-center justify-between">
                <label className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#6B6B6B]">
                  Image (optional)
                </label>
                <label className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.1em] text-signal hover:underline">
                  Upload
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setImageErr(null);
                        readImageFile(file, setImage, setImageErr);
                      }
                      e.target.value = ""; // allow re-picking the same file
                    }}
                  />
                </label>
              </div>
              <textarea
                value={image}
                rows={2}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.length > IMAGE_MAX_CHARS) {
                    setImageErr("Image data is too large — upload a smaller file instead.");
                    return;
                  }
                  setImageErr(null);
                  setImage(v);
                }}
                placeholder="https://…/art.png  ·  or paste an image URL / data URI, or Upload"
                className="mt-1 w-full resize-y break-all rounded-sm border border-white/10 bg-[#12181f] px-3 py-2.5 font-mono text-[12px] outline-none placeholder:text-[#4b5563]"
              />
              {imageErr && <p className="mt-1 font-mono text-[10px] text-noise">{imageErr}</p>}
              {image && !imageErr && (
                <div className="mt-3 flex justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image}
                    alt="preview"
                    onError={() => setImageErr("That image didn't load — check the URL.")}
                    className="h-20 w-20 rounded-full border border-white/10 object-cover"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Step 2 — verify handle */}
        {step === 1 &&
          (connected ? (
            verifiedHandle ? (
              <div className="rounded-sm border border-signal/30 bg-signal/[0.05] p-6 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-signal/15">
                  <Check className="h-5 w-5 text-signal" />
                </div>
                <div className="mt-3 text-[13px] font-bold">
                  Verified as <span className="text-signal">@{verifiedHandle}</span>
                </div>
                <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-relaxed text-[#6B6B6B]">
                  This wallet already holds its soulbound verification credential — a one-time step.
                  You can launch straight away.
                </p>
              </div>
            ) : X_OAUTH_ENABLED && !xVerified ? (
              <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-6 text-center">
                <div className="text-[13px] font-bold">Prove you own the X account</div>
                <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-relaxed text-[#6B6B6B]">
                  Sign in with X to prove you control @{handle || "your handle"}, then confirm with
                  your wallet. Only the real account owner can launch its token and claim creator fees.
                </p>
                <button
                  onClick={verifyWithX}
                  className="mt-4 inline-flex items-center gap-2 rounded-sm bg-[#F5F4F0] px-5 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]"
                >
                  Verify with 𝕏
                </button>
                {xError && <p className="mt-2 font-mono text-[10px] text-noise">{xError}</p>}
              </div>
            ) : (
              <div>
                {xVerified && (
                  <div className="mb-3 flex items-center gap-2 rounded-sm border border-signal/30 bg-signal/[0.05] px-3 py-2 font-mono text-[10px] text-signal">
                    <Check className="h-3.5 w-3.5" /> X verified as @{xVerified} — now confirm with your wallet.
                  </div>
                )}
                <VerifyHandleFlow
                  handle={handle || "handle"}
                  walletAddress={shortAddress ?? ""}
                  step={verifyStep}
                  onSign={signAndVerify}
                  disabled={verifying}
                />
                {verifyErr && (
                  <p className="mt-2 font-mono text-[10px] text-noise">{verifyErr}</p>
                )}
              </div>
            )
          ) : (
            <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-6 text-center">
              <div className="text-[13px] font-bold">Connect a wallet to verify</div>
              <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-relaxed text-[#6B6B6B]">
                Verification binds @{handle || "your handle"} to your wallet on-chain — connect the
                wallet that will own the creator-fee address.
              </p>
              <button
                onClick={() => setWalletOpen(true)}
                className="mt-4 rounded-sm bg-signal px-5 py-2.5 font-mono text-[12px] font-bold text-[#0A0A0A]"
              >
                Connect Wallet
              </button>
            </div>
          ))}

        {/* Step 3 — seed & review */}
        {step === 2 && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Seed & review</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              {mindshare === null ? (
                msLoading ? (
                  <>Reading @{handle}&apos;s mindshare…</>
                ) : (
                  <>
                    @{handle}&apos;s mindshare couldn&apos;t be read, so this seeds at the{" "}
                    <span className="text-signal">{t.tier}</span> tier — the floor. Retry rather
                    than launch if you expect higher.
                  </>
                )
              ) : (
                <>
                  @{handle} averaged {mindshare.toFixed(2)}% mindshare over 24h → tier{" "}
                  <span className="text-signal">{t.tier}</span>. The curve seeds at that price
                  instead of zero.
                </>
              )}
            </p>
            {mindshare !== null && ms && ms.coverage24h < 0.5 && (
              <p className="mt-2 text-[10.5px] leading-relaxed text-[#9a9a9a]">
                History covers only {Math.round(ms.coverage24h * 100)}% of the last 24 hours, so
                this average is drawn from a short record and may move once a full day exists.
              </p>
            )}
            {feedActive && (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-sm border border-signal/30 bg-signal/6 px-2 py-1 text-[10px] font-mono text-signal">
                ◈ Tier read on-chain from the live 𝕏 mindshare oracle at launch
              </p>
            )}
            <dl className="mt-4 flex flex-col gap-2.5 font-mono text-[12px]">
              {[
                ["Token", `${name || handle} ($${ticker})`],
                ["Mechanism", mechName],
                ["Seed market cap", t.seed],
                ["Total supply", "1,000,000,000"],
                ["Graduation at", "$69,000"],
                ["Creator fee", "0.5% (claimable once verified)"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-white/[0.06] pb-2 last:border-0">
                  <span className="text-[#6B6B6B]">{k}</span>
                  <span>{v}</span>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* Step 4 — confirm & launch */}
        {step === 3 && (
          <div className="rounded-sm border border-white/[0.08] bg-[#0f1620] p-5">
            <div className="text-[13px] font-bold">Confirm & launch</div>
            <p className="mt-1 text-[11px] text-[#6B6B6B]">
              Launching <span className="text-[#F5F4F0]">{name || handle} (${ticker})</span>, a{" "}
              <span className="text-[#F5F4F0]">{mechName}</span> token for{" "}
              <span className="text-[#F5F4F0]">@{handle}</span>, seeded at {t.seed}.
            </p>

            {tx ? (
              <div className="mt-4">
                <TxStatus
                  onDismiss={() => setTx(null)}
                  state={tx}
                  title={
                    tx === "pending" ? "Launching…" : tx === "failed" ? "Launch failed" : "Token launched"
                  }
                  detail={tx === "failed" && txErr ? txErr.slice(0, 90) : `$${ticker} · ${mechName}`}
                  signature={txSig ? `${txSig.slice(0, 4)}…${txSig.slice(-4)}` : undefined}
                  explorerUrl={txSig ? explorerTx(txSig) : undefined}
                  onRetry={tx === "failed" ? launch : undefined}
                />
                {tx === "confirmed" && (
                  <Link
                    href={`/token/${handle}`}
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-sm border border-signal/40 py-2.5 font-mono text-[11px] font-bold text-signal"
                  >
                    <Check className="h-3.5 w-3.5" /> View token page
                  </Link>
                )}
              </div>
            ) : (
              <button
                onClick={launch}
                className="mt-4 w-full rounded-sm bg-signal py-3 font-mono text-[13px] font-bold text-[#0A0A0A]"
              >
                LAUNCH ${ticker}
              </button>
            )}
          </div>
        )}
      </div>

      {/* nav — Back on any step past the first; CONTINUE except while awaiting the signature */}
      {step < 3 && (
        <div className="sticky bottom-0 mt-6 py-4">
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => s - 1)}
                className="rounded-sm border border-white/15 px-4 py-3 font-mono text-[12px] font-bold text-[#F5F4F0]"
              >
                Back
              </button>
            )}
            {!(step === 1 && verifyStep < 3) && (
              <button
                onClick={next}
                disabled={!canContinue}
                className="flex-1 rounded-sm bg-signal py-3 font-mono text-[12px] font-bold text-[#0A0A0A] disabled:opacity-40"
              >
                CONTINUE
              </button>
            )}
          </div>
        </div>
      )}

      <WalletConnectModal open={walletOpen} onClose={() => setWalletOpen(false)} />
      </div>
    </>
  );
}
