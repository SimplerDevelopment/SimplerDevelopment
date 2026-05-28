import crypto from 'crypto';

/** Resolve the canonical issuer/origin for OAuth metadata. Uses x-forwarded-*
 *  when present so it works behind Vercel/Railway proxies, otherwise falls
 *  back to the request URL. NEXTAUTH_URL is consulted as a final fallback for
 *  out-of-band contexts (cron, etc.) that don't have a Request. */
export function originFromRequest(req: Request): string {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const forwardedProto = req.headers.get('x-forwarded-proto');
  if (forwardedHost && forwardedProto) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const url = new URL(req.url);
  return `${url.protocol}//${url.host}`;
}

export function originOrEnv(req?: Request | null): string {
  if (req) return originFromRequest(req);
  return process.env.NEXTAUTH_URL ?? 'http://localhost:3000';
}

const HEX = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** Generates a URL-safe random identifier used for client_id values. */
export function randomClientId(): string {
  const bytes = crypto.randomBytes(18);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += HEX[bytes[i] % HEX.length];
  return `oc_${s}`;
}

export const AUTH_CODE_PREFIX = 'sd_oac_';
export const ACCESS_TOKEN_PREFIX = 'sd_oauth_';

export function generateAuthCode(): { code: string; hash: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const code = `${AUTH_CODE_PREFIX}${raw}`;
  return { code, hash: sha256(code) };
}

export function generateAccessToken(): { token: string; hash: string; preview: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const token = `${ACCESS_TOKEN_PREFIX}${raw}`;
  return { token, hash: sha256(token), preview: `${token.slice(0, 16)}…${token.slice(-4)}` };
}

export const CLIENT_SECRET_PREFIX = 'sd_cs_';

/** Mints a confidential-client secret. The raw `secret` is shown to the admin
 *  exactly once and must be captured at that moment; only `hash` is stored. */
export function generateClientSecret(): { secret: string; hash: string; preview: string } {
  const raw = crypto.randomBytes(32).toString('hex');
  const secret = `${CLIENT_SECRET_PREFIX}${raw}`;
  return { secret, hash: sha256(secret), preview: `${secret.slice(0, 12)}…${secret.slice(-4)}` };
}

/** Constant-time comparison of a provided secret against its stored SHA-256. */
export function verifyClientSecret(provided: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256(provided), 'hex');
  let expected: Buffer;
  try { expected = Buffer.from(expectedHash, 'hex'); } catch { return false; }
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

/** Parse `Authorization: Basic …` per RFC 6749 §2.3.1. Returns null when the
 *  header is missing or malformed; the caller decides whether to fall through
 *  to body params (`client_secret_post`) or reject. */
export function parseBasicAuthHeader(header: string | null): { clientId: string; clientSecret: string } | null {
  if (!header) return null;
  const match = /^Basic\s+([A-Za-z0-9+/=_-]+)\s*$/.exec(header);
  if (!match) return null;
  let decoded: string;
  try { decoded = Buffer.from(match[1], 'base64').toString('utf8'); } catch { return null; }
  const i = decoded.indexOf(':');
  if (i < 0) return null;
  // RFC 6749 §2.3.1 requires the client_id/secret to be URI-encoded inside the
  // basic-auth pair so that ':' in the secret is unambiguous.
  let clientId: string;
  let clientSecret: string;
  try {
    clientId = decodeURIComponent(decoded.slice(0, i));
    clientSecret = decodeURIComponent(decoded.slice(i + 1));
  } catch {
    return null;
  }
  return { clientId, clientSecret };
}

export function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** RFC 7636 PKCE S256 verification: BASE64URL(SHA256(verifier)) == challenge. */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
  // Constant-time compare to avoid timing leaks on the challenge.
  if (expected.length !== challenge.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(challenge));
}

/** Validate that a redirect_uri is an exact (string-equal) match to one of the
 *  redirect URIs the client registered. RFC 6749 §3.1.2.3 / OAuth 2.1 require
 *  exact matching — no wildcarding, no trailing-slash forgiveness. */
export function redirectUriMatches(registered: string[], requested: string): boolean {
  return registered.includes(requested);
}

/** Loose validation that a registered redirect URI looks plausible. We accept
 *  https://, http://localhost (and 127.0.0.1) for dev/loopback, and custom
 *  schemes for native MCP clients (e.g. `cursor://`, `claude-cli://`). */
export function isAcceptableRedirectUri(uri: string): boolean {
  let parsed: URL;
  try { parsed = new URL(uri); } catch { return false; }
  if (parsed.protocol === 'https:') return true;
  if (parsed.protocol === 'http:' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) return true;
  // Native-app redirect schemes are allowed for desktop MCP clients.
  if (/^[a-z][a-z0-9+.-]*:$/.test(parsed.protocol) && parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  return false;
}
