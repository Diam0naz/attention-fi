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
