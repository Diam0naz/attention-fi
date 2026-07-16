// Central app config. Override via NEXT_PUBLIC_* env vars in Vercel — no code
// change needed (e.g. set NEXT_PUBLIC_X_HANDLE once the X account is live).

/** X/Twitter handle for the project (without the leading @). */
export const X_HANDLE = (process.env.NEXT_PUBLIC_X_HANDLE ?? "AttentionFai").replace(/^@/, "");

/** Profile URL for the "Follow" waitlist task. */
export const X_URL = `https://x.com/${X_HANDLE}`;
