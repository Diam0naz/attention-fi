// Phase 0 mock data — the live mindshare feed. No smart contracts yet: prices
// are the *hypothetical* bonding-curve values the strategy brief describes
// ("show hypothetical token prices if bonding curves existed"). Swap this module
// for a Kaito + Helius data source later; the shapes are the integration contract.

export const VERTICALS = [
  "All",
  "DeFi",
  "AI/Tech",
  "ZK/Infra",
  "Gaming",
  "Music",
  "Narrative",
] as const;

export type Vertical = (typeof VERTICALS)[number];

/** URL-safe slug for a vertical (e.g. "AI/Tech" -> "ai-tech"). */
export function verticalSlug(v: string): string {
  return v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function verticalFromSlug(slug: string): Vertical | null {
  return VERTICALS.find((v) => verticalSlug(v) === slug) ?? null;
}

/** Mindshare tiers mirror the on-chain `MindshareTier` seed model. */
export type Tier = "Top 10" | "Top 100" | "Emerging" | "New";

export interface Token {
  rank: number;
  handle: string;
  name: string;
  vertical: Exclude<Vertical, "All">;
  /** Share of crypto-Twitter conversation, percent. */
  mindshare: number;
  /** Hypothetical market cap in USD. */
  marketCap: number;
  /** 24h change, percent (can be negative). */
  delta24h: number;
  tier: Tier;
  /** X-handle attestation on-chain (SAS). */
  verified: boolean;
  /** Recent mindshare trail for the sparkline (oldest → newest). */
  spark: number[];
}

/** Tier from mindshare share, mirroring the seed tiers in the program. */
export function tierFromMindshare(mindshare: number): Tier {
  if (mindshare >= 3) return "Top 10";
  if (mindshare >= 1) return "Top 100";
  if (mindshare >= 0.4) return "Emerging";
  return "New";
}

/** Approx seed market cap (USD) per tier — matches the brief's seed table. */
export function seedMarketCap(tier: Tier): number {
  switch (tier) {
    case "Top 10":
      return 15_000;
    case "Top 100":
      return 4_000;
    case "Emerging":
      return 800;
    case "New":
      return 69;
  }
}

export const MOCK_TOKENS: Token[] = [
  { rank: 1, handle: "solana_kol", name: "Solana Maxi", vertical: "DeFi", mindshare: 3.24, marketCap: 182_000, delta24h: 41, tier: "Top 10", verified: true, spark: [2.1, 2.3, 2.2, 2.6, 2.9, 3.0, 3.1, 3.24] },
  { rank: 2, handle: "ai_narrative", name: "Agent Thesis", vertical: "AI/Tech", mindshare: 2.87, marketCap: 94_000, delta24h: 18, tier: "Top 100", verified: true, spark: [2.4, 2.5, 2.4, 2.6, 2.7, 2.8, 2.85, 2.87] },
  { rank: 3, handle: "rwa_summer", name: "RWA Summer", vertical: "Narrative", mindshare: 1.41, marketCap: 61_000, delta24h: -7, tier: "Top 100", verified: false, spark: [1.7, 1.65, 1.6, 1.55, 1.5, 1.48, 1.44, 1.41] },
  { rank: 4, handle: "zk_builder", name: "ZK Builder", vertical: "ZK/Infra", mindshare: 0.98, marketCap: 43_000, delta24h: 5, tier: "Emerging", verified: true, spark: [0.9, 0.92, 0.94, 0.93, 0.95, 0.96, 0.97, 0.98] },
  { rank: 5, handle: "degen_pilled", name: "Degen Pilled", vertical: "DeFi", mindshare: 0.81, marketCap: 34_500, delta24h: 12, tier: "Emerging", verified: false, spark: [0.6, 0.64, 0.68, 0.7, 0.74, 0.77, 0.79, 0.81] },
  { rank: 6, handle: "gg_wagmi", name: "GG WAGMI", vertical: "Gaming", mindshare: 0.73, marketCap: 28_900, delta24h: 26, tier: "Emerging", verified: true, spark: [0.5, 0.52, 0.55, 0.6, 0.64, 0.68, 0.71, 0.73] },
  { rank: 7, handle: "onchain_beats", name: "Onchain Beats", vertical: "Music", mindshare: 0.66, marketCap: 24_100, delta24h: -3, tier: "Emerging", verified: false, spark: [0.72, 0.7, 0.69, 0.68, 0.67, 0.67, 0.66, 0.66] },
  { rank: 8, handle: "mev_searcher", name: "MEV Searcher", vertical: "DeFi", mindshare: 0.58, marketCap: 21_400, delta24h: 9, tier: "Emerging", verified: false, spark: [0.5, 0.51, 0.53, 0.54, 0.55, 0.56, 0.57, 0.58] },
  { rank: 9, handle: "modular_max", name: "Modular Max", vertical: "ZK/Infra", mindshare: 0.49, marketCap: 18_700, delta24h: 15, tier: "Emerging", verified: false, spark: [0.36, 0.38, 0.41, 0.43, 0.45, 0.47, 0.48, 0.49] },
  { rank: 10, handle: "pixel_quest", name: "Pixel Quest", vertical: "Gaming", mindshare: 0.42, marketCap: 15_200, delta24h: -11, tier: "Emerging", verified: false, spark: [0.55, 0.52, 0.5, 0.48, 0.46, 0.44, 0.43, 0.42] },
  { rank: 11, handle: "base_degen", name: "Base Degen", vertical: "DeFi", mindshare: 0.32, marketCap: 12_000, delta24h: -22, tier: "New", verified: false, spark: [0.5, 0.46, 0.42, 0.4, 0.38, 0.35, 0.33, 0.32] },
  { rank: 12, handle: "synth_wave", name: "Synth Wave", vertical: "Music", mindshare: 0.27, marketCap: 9_400, delta24h: 7, tier: "New", verified: false, spark: [0.21, 0.22, 0.23, 0.24, 0.25, 0.26, 0.27, 0.27] },
];

/** Detail view for a single token (the trading terminal). Mock for Phase 0. */
export interface TokenDetail extends Token {
  symbol: string;
  rank: number;
  raisedUsd: number;
  targetUsd: number;
  balanceSol: number;
  holders: number;
  liquidityUsd: number;
  virtualSol: number;
  creatorFeeBps: number;
  /** Candlestick heights (0-100) with direction, oldest → newest. */
  candles: { h: number; up: boolean }[];
}

const CANDLES: { h: number; up: boolean }[] = [
  { h: 38, up: true }, { h: 44, up: true }, { h: 40, up: false }, { h: 52, up: true },
  { h: 58, up: true }, { h: 55, up: false }, { h: 64, up: true }, { h: 70, up: true },
  { h: 66, up: false }, { h: 78, up: true }, { h: 82, up: true }, { h: 88, up: true },
];

/** A just-launched token that isn't in the curated feed yet (e.g. via /launch). */
function freshToken(handle: string): Token {
  return {
    rank: MOCK_TOKENS.length + 1,
    handle,
    name: handle.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    vertical: "Narrative",
    mindshare: 0.08,
    marketCap: 2_000,
    delta24h: 0,
    tier: "New",
    verified: false,
    spark: [0.05, 0.06, 0.06, 0.07, 0.07, 0.08, 0.08, 0.08],
  };
}

/**
 * Build a detail view for a token. Matches feed handles case-insensitively; any
 * other handle is treated as a freshly-launched token so its page still renders.
 */
export function getTokenDetail(handle: string): TokenDetail {
  const token =
    MOCK_TOKENS.find((t) => t.handle.toLowerCase() === handle.toLowerCase()) ?? freshToken(handle);
  return {
    ...token,
    symbol: token.handle.slice(0, 4).toUpperCase(),
    rank: token.rank,
    raisedUsd: Math.round(token.marketCap * 0.35),
    targetUsd: 69_000,
    balanceSol: 12.4,
    holders: Math.max(3, Math.round(token.marketCap / 250)),
    liquidityUsd: Math.round(token.marketCap * 0.5),
    virtualSol: 30,
    creatorFeeBps: 50,
    candles: CANDLES,
  };
}

// ---------------------------------------------------------------------------
// Deterministic per-handle generators for the trading terminal (chart / trades
// / holders). Seeded so server and client render identically — no mock jitter.
// ---------------------------------------------------------------------------

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randWallet(rand: () => number): string {
  const c = "ABCDEFGHJKLMNPQRSTUVWXYZ123456789";
  const pick = (n: number) =>
    Array.from({ length: n }, () => c[Math.floor(rand() * c.length)]).join("");
  return `${pick(4)}…${pick(4)}`;
}

export interface Candle { time: number; open: number; high: number; low: number; close: number }
export interface Volume { time: number; value: number; color: string }

/** Hourly OHLC (of market cap, in USD) + volume, ending at the token's current cap. */
export function getChartSeries(
  handle: string,
  marketCap: number,
  intervalSec = 3600,
  n = 120,
): { candles: Candle[]; volumes: Volume[] } {
  const rand = mulberry32((hashStr(handle) ^ 0x9e3779b9 ^ intervalSec) >>> 0);
  // Volatility scales with the square root of the interval (random-walk scaling),
  // so 1m candles are tight and 1D candles swing — like a real market.
  const vol = 0.05 * Math.sqrt(intervalSec / 3600);
  const start = Math.max(400, marketCap * 0.4);
  let p = start;
  const closesRaw: number[] = [];
  for (let i = 0; i < n; i++) {
    p *= 1 + (rand() - 0.46) * vol;
    closesRaw.push(p);
  }
  const scale = marketCap / p; // p === last close
  const now = Math.floor(Date.now() / 1000);
  const candles: Candle[] = [];
  const volumes: Volume[] = [];
  let prevClose = start * scale * 0.99;
  for (let i = 0; i < n; i++) {
    // align to the interval so candles sit on clean boundaries
    const time = (Math.floor(now / intervalSec) - (n - 1 - i)) * intervalSec;
    const close = (closesRaw[i] ?? p) * scale;
    const open = prevClose;
    const wick = 0.018 * Math.sqrt(intervalSec / 3600);
    const high = Math.max(open, close) * (1 + rand() * wick);
    const low = Math.min(open, close) * (1 - rand() * wick);
    candles.push({ time, open, high, low, close });
    volumes.push({
      time,
      value: marketCap * 0.03 * (0.3 + rand()),
      color: close >= open ? "rgba(0,255,133,0.35)" : "rgba(255,59,92,0.35)",
    });
    prevClose = close;
  }
  return { candles, volumes };
}

export interface Trade { side: "buy" | "sell"; sol: number; tokens: number; priceUsd: number; wallet: string; ago: string }

export function getTrades(handle: string): Trade[] {
  const rand = mulberry32(hashStr(handle) ^ 0x1234abcd);
  const agos = ["2s", "9s", "23s", "41s", "1m", "2m", "3m", "5m", "8m", "12m", "18m", "27m"];
  return agos.map((ago) => {
    const side = rand() > 0.42 ? "buy" : "sell";
    const sol = +(rand() * 6 + 0.08).toFixed(2);
    const tokens = Math.round(sol * 24_000 * (0.8 + rand() * 0.4));
    const priceUsd = +(0.00002 + rand() * 0.00006).toFixed(6);
    return { side, sol, tokens, priceUsd, wallet: randWallet(rand), ago };
  });
}

/** Social-proof mentions that "feed" the mindshare score (design 1b). */
export interface Mention { text: string; ago: string; impressions: number }

export function getMentions(handle: string): Mention[] {
  const rand = mulberry32(hashStr(handle) ^ 0x0feed1);
  const quoted = 2 + Math.floor(rand() * 4);
  const templates = [
    `“the work @${handle} is shipping is genuinely the most underrated thing in the space right now”`,
    `quoted by ${quoted} top-100 crypto-twitter accounts this week`,
    `thread referencing @${handle}'s benchmark is compounding across the timeline`,
  ];
  const agos = ["2h ago", "6h ago", "1d ago"];
  return templates.map((text, i) => ({
    text,
    ago: agos[i] ?? "1d ago",
    impressions: Math.round(400 + rand() * 4200),
  }));
}

export interface Holder { rank: number; wallet: string; pct: number; tag?: "curve" | "creator" | "others" }

export function getHolders(handle: string): Holder[] {
  const rand = mulberry32(hashStr(handle) ^ 0x55aa55aa);
  const holders: Holder[] = [
    { rank: 1, wallet: "Bonding curve", pct: +(34 + rand() * 8).toFixed(1), tag: "curve" },
    { rank: 2, wallet: randWallet(rand), pct: +(7 + rand() * 3).toFixed(1), tag: "creator" },
  ];
  let base = 6;
  for (let i = 3; i <= 9; i++) {
    base = base * (0.72 + rand() * 0.12);
    holders.push({ rank: i, wallet: randWallet(rand), pct: +base.toFixed(1) });
  }
  const sum = holders.reduce((a, h) => a + h.pct, 0);
  holders.push({
    rank: 10,
    wallet: `+${1240 + Math.floor(rand() * 3000)} others`,
    pct: +Math.max(0, 100 - sum).toFixed(1),
    tag: "others",
  });
  return holders;
}

/**
 * Deterministic avatar image for a token/handle.
 *
 * The top tokens ship local assets (PNGs for the trending wall, SVGs for the
 * rest) so v0 loads without any external dependency. Unknown handles fall back
 * to DiceBear so the system still works for fresh/unknown tokens.
 */
const LOCAL_TOKENS: Record<string, string> = {
  solana_kol:   "/tokens/solana_kol.png",
  ai_narrative: "/tokens/ai_narrative.png",
  rwa_summer:   "/tokens/rwa_summer.png",
  zk_builder:   "/tokens/zk_builder.png",
  degen_pilled: "/tokens/degen_pilled.png",
  gg_wagmi:     "/tokens/gg_wagmi.png",
  onchain_beats: "/tokens/onchain_beats.svg",
  mev_searcher:  "/tokens/mev_searcher.svg",
  modular_max:   "/tokens/modular_max.svg",
  pixel_quest:   "/tokens/pixel_quest.svg",
  base_degen:    "/tokens/base_degen.svg",
  synth_wave:    "/tokens/synth_wave.svg",
};

export function tokenImage(handle: string): string {
  return LOCAL_TOKENS[handle] ?? `https://api.dicebear.com/9.x/shapes/svg?seed=${encodeURIComponent(handle)}&size=96`;
}

export interface Holding { handle: string; name: string; symbol: string; amount: number; valueUsd: number; delta24h: number }
export interface CreatedToken { handle: string; name: string; symbol: string; marketCap: number; claimableUsd: number; verified: boolean }
export interface Portfolio {
  address: string;
  verifiedHandle: string | null;
  holdings: Holding[];
  created: CreatedToken[];
  totalValueUsd: number;
  claimableUsd: number;
}

/** Deterministic mock portfolio for a connected wallet address. */
export function getPortfolio(address: string): Portfolio {
  const rand = mulberry32(hashStr(address));
  const holdings: Holding[] = [];
  for (const tk of MOCK_TOKENS.slice(0, 8)) {
    if (rand() > 0.5) continue; // hold roughly half
    const valueUsd = Math.round(50 + rand() * 1800);
    holdings.push({
      handle: tk.handle,
      name: tk.name,
      symbol: tk.handle.slice(0, 4).toUpperCase(),
      amount: Math.round(valueUsd / (0.00002 + rand() * 0.00004)),
      valueUsd,
      delta24h: tk.delta24h,
    });
  }
  if (holdings.length === 0) {
    const tk = MOCK_TOKENS[0]!;
    holdings.push({
      handle: tk.handle,
      name: tk.name,
      symbol: tk.handle.slice(0, 4).toUpperCase(),
      amount: 120_000,
      valueUsd: 420,
      delta24h: tk.delta24h,
    });
  }
  const ct = MOCK_TOKENS[Math.floor(rand() * MOCK_TOKENS.length)] ?? MOCK_TOKENS[0]!;
  const verified = rand() > 0.4;
  const created: CreatedToken[] = [
    {
      handle: ct.handle,
      name: ct.name,
      symbol: ct.handle.slice(0, 4).toUpperCase(),
      marketCap: ct.marketCap,
      claimableUsd: Math.round(rand() * 260),
      verified,
    },
  ];
  return {
    address,
    verifiedHandle: verified ? ct.handle : null,
    holdings,
    created,
    totalValueUsd: holdings.reduce((a, h) => a + h.valueUsd, 0),
    claimableUsd: created.reduce((a, c) => a + c.claimableUsd, 0),
  };
}

// --- NFT layer (mirrors the on-chain roles: verify / perk / genesis / auction) ---

export interface PerkNft { level: number; discountBps: number }
export interface GenesisNft { id: string; shareBps: number; claimableUsd: number }
export interface NftState {
  verified: boolean;
  handle: string | null;
  perk: PerkNft | null;
  genesis: GenesisNft[];
}

export function getNftState(address: string): NftState {
  const rand = mulberry32(hashStr(address) ^ 0x1c0ffee);
  const verified = rand() > 0.4;
  const hasPerk = rand() > 0.3;
  const level = hasPerk ? 1 + Math.floor(rand() * 4) : 0; // 1..4 (cap 5%)
  const perk = hasPerk ? { level, discountBps: Math.min(500, level * 100) } : null;
  // Always hold at least one genesis (demo previews the fee-share card); the
  // first has non-zero claimable so the CLAIM action is exercised too.
  const genesis: GenesisNft[] = Array.from({ length: 1 + Math.floor(rand() * 2) }, (_, i) => ({
    id: randWallet(rand),
    shareBps: 50 + Math.floor(rand() * 150),
    claimableUsd: i === 0 ? 12 + Math.round(rand() * 80) : Math.round(rand() * 90),
  }));
  return { verified, handle: verified ? (MOCK_TOKENS[0]?.handle ?? null) : null, perk, genesis };
}

export interface NftAuction {
  id: string;
  name: string;
  handle: string;
  startUsd: number;
  currentUsd: number;
  floorUsd: number;
  endsIn: string;
}

export function getNftAuctions(): NftAuction[] {
  return [
    { id: "genesis-001", name: "Genesis #001", handle: "solana_kol", startUsd: 12_000, currentUsd: 7_400, floorUsd: 3_000, endsIn: "4h 12m" },
    { id: "founder-007", name: "Founder Key #7", handle: "ai_narrative", startUsd: 8_000, currentUsd: 5_950, floorUsd: 2_500, endsIn: "1h 48m" },
    { id: "og-verify-3", name: "OG Verify #3", handle: "zk_builder", startUsd: 5_000, currentUsd: 4_100, floorUsd: 1_800, endsIn: "9h 03m" },
  ];
}

/** Small deterministic-ish nudge for the "live" feel (client-side only). */
export function jitter(token: Token): Token {
  const drift = (Math.random() - 0.5) * 0.06;
  const mindshare = Math.max(0.01, +(token.mindshare + drift).toFixed(2));
  const delta24h = +(token.delta24h + (Math.random() - 0.5) * 1.5).toFixed(1);
  return {
    ...token,
    mindshare,
    delta24h,
    spark: [...token.spark.slice(1), mindshare],
  };
}
