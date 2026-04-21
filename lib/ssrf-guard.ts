import { promises as dns } from 'dns';
import { isIP } from 'net';

/**
 * SSRF guard for outbound webhook URLs.
 *
 * Call `validateWebhookUrl(url)` when a user registers a URL and
 * `assertSafeUrl(url)` immediately before dispatching each request
 * (guards against DNS rebinding / TTL-expiry attacks).
 */

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(p => Number.isNaN(p) || p < 0 || p > 255)) return true;
  const [a, b] = parts;
  if (a === 10) return true;                                    // 10.0.0.0/8
  if (a === 127) return true;                                   // loopback
  if (a === 0) return true;                                     // 0.0.0.0/8
  if (a === 169 && b === 254) return true;                      // 169.254.0.0/16 (link-local + AWS/GCP metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;             // 172.16.0.0/12
  if (a === 192 && b === 168) return true;                      // 192.168.0.0/16
  if (a === 192 && b === 0 && parts[2] === 0) return true;      // 192.0.0.0/24 (reserved)
  if (a === 192 && b === 0 && parts[2] === 2) return true;      // TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return true;         // benchmarking
  if (a === 198 && b === 51 && parts[2] === 100) return true;   // TEST-NET-2
  if (a === 203 && b === 0 && parts[2] === 113) return true;    // TEST-NET-3
  if (a >= 224) return true;                                    // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::' || lower === '::1') return true;            // unspecified + loopback
  if (lower.startsWith('fe80:') || lower.startsWith('fe80::')) return true; // link-local
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;        // unique-local fc00::/7
  if (lower.startsWith('ff')) return true;                       // multicast
  // IPv4-mapped (::ffff:a.b.c.d)
  if (lower.startsWith('::ffff:')) {
    const tail = lower.slice(7);
    if (isIP(tail) === 4) return isPrivateIPv4(tail);
  }
  return false;
}

function isBlockedHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (h === 'metadata' || h === 'metadata.google.internal') return true;
  return false;
}

function isPrivateIP(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIPv4(ip);
  if (kind === 6) return isPrivateIPv6(ip);
  return true; // not a valid IP — treat as unsafe
}

export interface UrlValidationError {
  ok: false;
  reason: string;
}
export interface UrlValidationOk {
  ok: true;
  hostname: string;
}
export type UrlValidationResult = UrlValidationError | UrlValidationOk;

/**
 * Static URL validation — scheme, port, hostname literal checks.
 * Use when accepting user input.
 */
export function validateWebhookUrl(raw: string): UrlValidationResult {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'Not a valid URL.' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { ok: false, reason: 'Only http and https URLs are allowed.' };
  }

  // Block userinfo (credentials in URL)
  if (parsed.username || parsed.password) {
    return { ok: false, reason: 'URLs with credentials are not allowed.' };
  }

  // Block non-standard ports — allow only 80, 443, and blank
  const port = parsed.port;
  if (port && port !== '80' && port !== '443') {
    return { ok: false, reason: 'Only ports 80 and 443 are allowed.' };
  }

  const rawHostname = parsed.hostname;
  if (!rawHostname) return { ok: false, reason: 'Missing hostname.' };
  // URL parser wraps IPv6 literals in brackets (e.g. "[::1]"); strip before IP checks
  const hostname = rawHostname.startsWith('[') && rawHostname.endsWith(']')
    ? rawHostname.slice(1, -1)
    : rawHostname;
  if (isBlockedHostname(hostname)) return { ok: false, reason: 'Hostname is not reachable from the webhook dispatcher.' };

  // Hostname may already be a literal IP — check it directly
  if (isIP(hostname)) {
    if (isPrivateIP(hostname)) return { ok: false, reason: 'Private / loopback IPs are not allowed.' };
  }

  return { ok: true, hostname };
}

/**
 * Runtime check — call this right before `fetch()`. Resolves DNS and
 * rejects if any returned address is in private space. This catches
 * rebinding attacks where the hostname resolved to a public IP at
 * registration time but now resolves to a private one.
 */
export async function assertSafeUrl(raw: string): Promise<void> {
  const result = validateWebhookUrl(raw);
  if (!result.ok) throw new Error(`URL rejected: ${result.reason}`);

  // Literal IP — already validated above
  if (isIP(result.hostname)) return;

  // Resolve all addresses (A + AAAA) and ensure none is private
  const records = await dns.lookup(result.hostname, { all: true, verbatim: true });
  for (const r of records) {
    if (isPrivateIP(r.address)) {
      throw new Error(`URL rejected: hostname resolves to a private address (${r.address}).`);
    }
  }
}
