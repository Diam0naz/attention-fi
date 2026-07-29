/**
 * Fallback wallet marks.
 *
 * A wallet that's actually installed publishes its own logo, and the modal
 * prefers that — see `icons` on the wallet context. These are only drawn for
 * wallets the browser can't see, where there's no provider to ask. They're
 * simplified marks in each wallet's brand colour, not exact reproductions of
 * their logos.
 */

export function PhantomMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#AB9FF2" />
      {/* ghost: domed head, wavy hem */}
      <path
        d="M24 16.4a8 8 0 1 0-16 0v5.1c0 .7.8 1 1.3.5l1.5-1.6c.3-.3.7-.3 1 0l1.3 1.4c.3.3.7.3 1 0l1.3-1.4c.3-.3.7-.3 1 0l1.3 1.4c.3.3.7.3 1 0l1.5-1.6c.4-.5 1.3-.2 1.3.5z"
        fill="#FFFDF8"
      />
      <ellipse cx="13.4" cy="15.4" rx="1.25" ry="1.7" fill="#534BB1" />
      <ellipse cx="18.3" cy="15.4" rx="1.25" ry="1.7" fill="#534BB1" />
    </svg>
  );
}

export function SolflareMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0B0B0E" />
      <defs>
        <linearGradient id="af-solflare" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFC10B" />
          <stop offset="100%" stopColor="#FC7227" />
        </linearGradient>
      </defs>
      {/* flare: core with four cardinal rays */}
      <circle cx="16" cy="16" r="4.2" fill="url(#af-solflare)" />
      <path
        d="M16 4.5c.9 3.6 1.4 5.6 2.6 6.9-1.3-.6-3.9-.6-5.2 0 1.2-1.3 1.7-3.3 2.6-6.9M16 27.5c-.9-3.6-1.4-5.6-2.6-6.9 1.3.6 3.9.6 5.2 0-1.2 1.3-1.7 3.3-2.6 6.9M4.5 16c3.6-.9 5.6-1.4 6.9-2.6-.6 1.3-.6 3.9 0 5.2-1.3-1.2-3.3-1.7-6.9-2.6M27.5 16c-3.6.9-5.6 1.4-6.9 2.6.6-1.3.6-3.9 0-5.2 1.3 1.2 3.3 1.7 6.9 2.6"
        fill="url(#af-solflare)"
      />
    </svg>
  );
}

export function BackpackMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0B0B0E" />
      {/* pack body with a haul loop and a front pocket */}
      <path d="M13 8.5a3 3 0 0 1 6 0v1.2h-2V8.5a1 1 0 0 0-2 0v1.2h-2z" fill="#E33E5C" />
      <path
        d="M11.6 11h8.8c2 0 3.6 1.7 3.6 3.7V21c0 1.7-1.3 3-3 3H11c-1.7 0-3-1.3-3-3v-6.3c0-2 1.6-3.7 3.6-3.7z"
        fill="#E33E5C"
      />
      <rect x="12.4" y="17.2" width="7.2" height="6.8" rx="1.6" fill="#0B0B0E" opacity="0.28" />
    </svg>
  );
}

export function CoinbaseMark() {
  return (
    <svg viewBox="0 0 32 32" className="h-full w-full" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0052FF" />
      <circle cx="16" cy="16" r="9" fill="#0052FF" />
      <rect x="12.4" y="12.4" width="7.2" height="7.2" rx="1.7" fill="#FFFFFF" />
      <circle cx="16" cy="16" r="9" fill="none" stroke="#FFFFFF" strokeWidth="1.6" opacity="0.9" />
    </svg>
  );
}

const MARKS: Record<string, () => React.ReactElement> = {
  phantom: PhantomMark,
  solflare: SolflareMark,
  backpack: BackpackMark,
  coinbase: CoinbaseMark,
};

/**
 * Brand mark for `id`, or null when there's no drawing for it — callers fall
 * back to the initial tile so a wallet added to WALLETS without a mark still
 * renders something sensible.
 */
export function WalletMark({ id }: { id: string }) {
  const Mark = MARKS[id];
  return Mark ? <Mark /> : null;
}

export function hasMark(id: string): boolean {
  return id in MARKS;
}
