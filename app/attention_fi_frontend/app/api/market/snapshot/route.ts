import { NextResponse } from "next/server";
import {
  insertSnapshots,
  marketDbConfigured,
  newestSnapshotAge,
} from "@/lib/market-db";
import { fetchAllSnapshotRows, fetchGlobal } from "@/lib/solana/curve";
import { getReadonlyProgram } from "@/lib/solana/program";

export const dynamic = "force-dynamic";

/** Don't write more often than this even if many clients ping the endpoint. */
const MIN_INTERVAL_S = 45;

/**
 * Records one price snapshot per live token, across every launch mechanism.
 * The chain is read
 * server-side (clients only trigger, never supply data), and a freshness
 * check makes concurrent triggers from many open terminals coalesce into
 * one write per interval. Wire a cron to this endpoint in production;
 * open terminals also ping it opportunistically.
 */
export async function GET() {
  if (!marketDbConfigured()) {
    return NextResponse.json({ stored: 0, reason: "no-db" });
  }
  try {
    const age = await newestSnapshotAge();
    if (age !== null && age < MIN_INTERVAL_S) {
      return NextResponse.json({ stored: 0, reason: "fresh", age });
    }
    const program = getReadonlyProgram();
    const global = await fetchGlobal(program);
    const decimals = global?.tokenDecimals ?? 6;
    const rows = await fetchAllSnapshotRows(program, decimals);
    await insertSnapshots(rows);
    return NextResponse.json({ stored: rows.length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "snapshot failed";
    return NextResponse.json({ stored: 0, error: message }, { status: 500 });
  }
}
