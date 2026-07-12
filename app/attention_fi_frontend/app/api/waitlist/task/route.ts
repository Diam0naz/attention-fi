import { NextResponse, type NextRequest } from "next/server";
import { completeTask } from "@/lib/waitlist-store";
import { isTaskId } from "@/lib/waitlist-tasks";

export const dynamic = "force-dynamic";

const WALLET = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** POST /api/waitlist/task { id, task, rating?, wallet? } -> updated status.
 *  Awards points once per task; `rate_product` needs a 1-5 rating,
 *  `connect_wallet` needs a valid wallet. */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const { id, task, rating, wallet } = (body ?? {}) as {
    id?: unknown;
    task?: unknown;
    rating?: unknown;
    wallet?: unknown;
  };

  if (typeof id !== "string" || typeof task !== "string" || !isTaskId(task)) {
    return NextResponse.json({ error: "id and a valid task are required" }, { status: 400 });
  }
  if (task === "rate_product" && (typeof rating !== "number" || rating < 1 || rating > 5)) {
    return NextResponse.json({ error: "rating (1-5) required" }, { status: 400 });
  }
  const cleanWallet =
    typeof wallet === "string" && WALLET.test(wallet.trim()) ? wallet.trim() : undefined;
  if (task === "connect_wallet" && !cleanWallet) {
    return NextResponse.json({ error: "valid wallet required" }, { status: 400 });
  }

  const status = await completeTask(id, task, {
    rating: typeof rating === "number" ? rating : undefined,
    wallet: cleanWallet,
  });
  if (!status) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(status);
}
