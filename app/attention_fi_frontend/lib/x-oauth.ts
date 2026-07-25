import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * X (Twitter) OAuth 2.0 — Authorization Code with PKCE, confidential client.
 * Proves a user actually controls an X handle before /api/verify issues the
 * SAS attestation binding that handle to their wallet. Server-side only.
 *
 * Setup (X developer portal → your app → OAuth 2.0):
 *   - Type: Web App (confidential client)
 *   - Redirect URI: <origin>/api/verify/x/callback  (must match X_REDIRECT_URI)
 *   - Scopes: tweet.read, users.read
 * Then set env: X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI, X_OAUTH_SECRET.
 */

const AUTH_URL = "https://x.com/i/oauth2/authorize";
const TOKEN_URL = "https://api.x.com/2/oauth2/token";
const ME_URL = "https://api.x.com/2/users/me";
const SCOPES = ["tweet.read", "users.read"];

/** How long the OAuth round-trip / issued proof stays valid. */
const TTL_MS = 10 * 60_000;

export interface XConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  secret: string;
}

/** null when X OAuth isn't configured — callers fall back to dev behavior. */
export function xConfig(): XConfig | null {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI;
  const secret = process.env.X_OAUTH_SECRET;
  if (!clientId || !clientSecret || !redirectUri || !secret) return null;
  return { clientId, clientSecret, redirectUri, secret };
}

const b64url = (buf: Buffer) => buf.toString("base64url");

/** PKCE verifier + S256 challenge. */
export function makePkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function randomState(): string {
  return b64url(randomBytes(16));
}

export function buildAuthUrl(cfg: XConfig, state: string, challenge: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeCode(cfg: XConfig, code: string, verifier: string): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: verifier,
  });
  const basic = Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`X token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("X token exchange returned no access_token");
  return json.access_token;
}

/** The authenticated user's handle (lowercased — X handles are case-insensitive). */
export async function fetchHandle(accessToken: string): Promise<string> {
  const res = await fetch(ME_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`X users/me failed: ${res.status}`);
  const json = (await res.json()) as { data?: { username?: string } };
  const username = json.data?.username;
  if (!username) throw new Error("X users/me returned no username");
  return username.toLowerCase();
}

// --- signed cookie payloads (HMAC-SHA256, tamper-proof + expiring) ----------

function sign(cfg: XConfig, payload: Record<string, unknown>): string {
  const data = b64url(Buffer.from(JSON.stringify(payload)));
  const mac = b64url(createHmac("sha256", cfg.secret).update(data).digest());
  return `${data}.${mac}`;
}

function verify<T extends { exp: number }>(cfg: XConfig, token: string): T | null {
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  const expected = b64url(createHmac("sha256", cfg.secret).update(data).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as T;
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Transient state carried through the X redirect (in the x_oauth cookie). */
export interface OAuthState {
  wallet: string;
  state: string;
  verifier: string;
  exp: number;
}

/** Proof of X ownership issued after callback (in the x_proof cookie). */
export interface XProof {
  wallet: string;
  handle: string;
  exp: number;
}

export const signOAuthState = (cfg: XConfig, s: Omit<OAuthState, "exp">): string =>
  sign(cfg, { ...s, exp: Date.now() + TTL_MS });
export const readOAuthState = (cfg: XConfig, token: string): OAuthState | null =>
  verify<OAuthState>(cfg, token);

export const signProof = (cfg: XConfig, p: Omit<XProof, "exp">): string =>
  sign(cfg, { ...p, exp: Date.now() + TTL_MS });
export const readProof = (cfg: XConfig, token: string): XProof | null =>
  verify<XProof>(cfg, token);

export const OAUTH_COOKIE = "x_oauth";
export const PROOF_COOKIE = "x_proof";
