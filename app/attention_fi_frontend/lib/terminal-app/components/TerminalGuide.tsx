"use client";

import { Modal } from "@/lib/terminal-app/components/ui/Modal";

/**
 * What this terminal is and how to drive it.
 *
 * Opens by itself the first time someone loads the terminal, and from the `?`
 * button after that. It's here rather than in a docs page because the moment
 * of confusion is the moment you're looking at the thing — a reader who has to
 * leave to find out how it works mostly just leaves.
 *
 * Deliberately short. It covers the four questions the layout doesn't answer on
 * its own: what a market *is* here, how to find one, how the split view picks
 * which chart you're trading, and which numbers are real.
 */

const SECTIONS: { title: string; body: React.ReactNode }[] = [
  {
    title: "What you're trading",
    body: (
      <>
        Every market is one person&apos;s attention. <B>@king_diamonaz</B> is the subject — whose
        posting the market tracks — and <B>GOJO</B> is what the creator named the token you
        actually buy. The ticker leads everywhere a quantity is shown, because it&apos;s the
        thing being counted; the handle follows it as context. Both find the same market in
        search.
      </>
    ),
  },
  {
    title: "Finding a market",
    body: (
      <>
        Press <K>/</K> and type either name. Enter selects it. Tokens launched from any browser
        show up, not just yours. To keep one around, add it to the watchlist on the left with{" "}
        <B>+ Add symbol</B> — type the handle, without the <B>@</B>.
      </>
    ),
  },
  {
    title: "Split charts",
    body: (
      <>
        Pick a layout from the grid menu, then <B>click a chart to focus it</B> — the focused pane
        carries a blue outline and its number shows next to the search box. Search, the order
        ticket, the book and the tape all act on that pane, so you fill a second chart by clicking
        it and searching. <B>Sync</B> is the exception: it points every pane at one market for
        comparing timeframes.
      </>
    ),
  },
  {
    title: "Placing a trade",
    body: (
      <>
        The <B>Trade</B> tab is a real transaction against the bonding curve on devnet — your
        wallet signs it. Buys are sized in SOL, sells in tokens. The quote is an estimate from
        current reserves; slippage sets the minimum the chain will accept, and the trade fails
        rather than filling worse than that.
      </>
    ),
  },
  {
    title: "Which numbers are real",
    body: (
      <>
        Price, depth and the tape come off the chain. <B>Candles before this token started being
        recorded are synthetic</B> — a generated walk anchored to the live price, there so
        indicators have something to chew on. Treat the shape of old history as decoration; the
        current price, your balances and every fill are real.
      </>
    ),
  },
];

function B({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-hi">{children}</span>;
}

function K({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="num rounded border border-edge bg-elevated px-1 py-px text-2xs text-hi">
      {children}
    </kbd>
  );
}

export function TerminalGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} top="10vh">
      <div className="flex items-center justify-between border-b border-edge px-4 py-2.5">
        <span className="text-sm font-medium text-hi">Using the terminal</span>
        <kbd className="rounded border border-edge bg-elevated px-1.5 py-0.5 text-2xs text-low">
          Esc
        </kbd>
      </div>
      <div className="max-h-[70vh] overflow-y-auto p-4">
        <div className="flex flex-col gap-3.5">
          {SECTIONS.map((s) => (
            <div key={s.title}>
              <div className="mb-1 text-2xs font-medium uppercase tracking-wider text-tacc">
                {s.title}
              </div>
              <p className="text-xs leading-relaxed text-mid">{s.body}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-edge pt-3 text-2xs text-low">
          Press <K>?</K> for keyboard shortcuts, <K>Ctrl+K</K> for the command palette. Reopen this
          from the <B>?</B> button in the top bar.
        </div>
      </div>
    </Modal>
  );
}
