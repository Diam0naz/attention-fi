import { NextResponse, type NextRequest } from "next/server";
import { getSnapshots, marketDbConfigured } from "@/lib/market-db";

export const dynamic = "force-dynamic";

const LAMPORTS_PER_SOL = 1_000_000_000;
const VALID_TF_S = new Set([60, 300, 900, 3600, 14400, 86400, 604800]);

export interface ApiCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  /** SOL actually traded through the curve during the bucket */
  volume: number;
}

/**
 * OHLCV candles aggregated from price snapshots.
 * Query: ?mint=<base58>&tf=<seconds>&from=<epoch>&to=<epoch>
 * Snapshots arrive every ~45s, so sub-minute structure inside a bucket is
 * approximate; gaps between snapshots simply carry no volume.
 */
export async function GET(req: NextRequest) {
  if (!marketDbConfigured()) return NextResponse.json({ candles: [] });

  const p = req.nextUrl.searchParams;
  const mint = p.get("mint") ?? "";
  const tf = Number(p.get("tf"));
  const from = Number(p.get("from"));
  const to = Number(p.get("to"));
  if (!mint || !VALID_TF_S.has(tf) || !Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
    return NextResponse.json({ error: "bad params" }, { status: 400 });
  }

  try {
    // Reach one bucket earlier so the first candle's volume delta has a base.
    const snapshots = await getSnapshots(mint, from - tf, to);
    const candles: ApiCandle[] = [];
    let prevLamports: bigint | null = null;

    for (const s of snapshots) {
      const bucket = Math.floor(s.time / tf) * tf;
      if (bucket < from) {
        prevLamports = s.realSolLamports;
        continue;
      }
      const traded =
        prevLamports === null
          ? 0
          : Math.abs(Number(s.realSolLamports - prevLamports)) / LAMPORTS_PER_SOL;
      prevLamports = s.realSolLamports;

      const last = candles[candles.length - 1];
      if (last && last.time === bucket) {
        last.high = Math.max(last.high, s.priceSol);
        last.low = Math.min(last.low, s.priceSol);
        last.close = s.priceSol;
        last.volume += traded;
      } else {
        // fill gaps so the series is contiguous for the chart
        let t = last ? last.time + tf : bucket;
        while (last && t < bucket) {
          candles.push({
            time: t,
            open: last.close,
            high: last.close,
            low: last.close,
            close: last.close,
            volume: 0,
          });
          t += tf;
        }
        candles.push({
          time: bucket,
          open: last ? last.close : s.priceSol,
          high: s.priceSol,
          low: s.priceSol,
          close: s.priceSol,
          volume: traded,
        });
        const created = candles[candles.length - 1]!;
        created.high = Math.max(created.high, created.open);
        created.low = Math.min(created.low, created.open);
      }
    }
    return NextResponse.json({ candles });
  } catch (e) {
    const message = e instanceof Error ? e.message : "query failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
