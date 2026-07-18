// Log redaction shared by the dispatch flow.
//
// `redactLog()` strips obvious secrets before any log tail or error summary
// hits Postgres: JWTs, Anthropic API keys (sk-ant-…), Bearer tokens,
// env-var-looking KEY=value patterns. The contract is best-effort, not
// guaranteed — when we're not sure, we err on the side of redacting.
//
// `capLogTail()` caps a string by BYTES (not characters) to keep the
// `logTail` text column under the 64 KB budget regardless of unicode mix.
// We keep the trailing window because the last lines are usually the most
// relevant on failure.
//
// Lives in its own file so both `runner.ts` (executeRun fallback / unit-
// tested by plugins-runner.test.ts) and `complete.ts` (the worker → portal
// callback) can use it without a circular import.

const LOG_TAIL_MAX_BYTES = 64 * 1024;

const REDACTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  // Anthropic API keys.
  { pattern: /sk-ant-[A-Za-z0-9_-]+/g, replacement: 'sk-ant-[REDACTED]' },
  // JWTs — three base64url segments separated by dots, anchored on the JWT
  // header prefix "eyJ" so we avoid clobbering version strings like 1.2.3.
  {
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g,
    replacement: '[REDACTED_JWT]',
  },
  // Bearer tokens (case-insensitive). Stops on whitespace or end-of-line.
  { pattern: /Bearer\s+[A-Za-z0-9._\-+/=]+/gi, replacement: 'Bearer [REDACTED]' },
  // Common env-var-looking secrets. Captures KEY=value where KEY contains
  // "secret", "token", "key", "password", or "api" — case-insensitive
  // so lower-case `api_token=...` also gets caught.
  {
    pattern: /\b([A-Za-z][A-Za-z0-9_]*(?:secret|token|key|password|api)[A-Za-z0-9_]*)=([^\s"']{4,})/gi,
    replacement: '$1=[REDACTED]',
  },
];

export function redactLog(raw: string): string {
  let out = raw;
  for (const rule of REDACTION_RULES) {
    out = out.replace(rule.pattern, rule.replacement);
  }
  return out;
}

export function capLogTail(s: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(s);
  if (bytes.byteLength <= LOG_TAIL_MAX_BYTES) return s;
  const tail = bytes.slice(bytes.byteLength - LOG_TAIL_MAX_BYTES);
  const decoded = new TextDecoder('utf-8', { fatal: false }).decode(tail);
  const firstNl = decoded.indexOf('\n');
  return firstNl >= 0 ? `…[truncated]\n${decoded.slice(firstNl + 1)}` : `…[truncated]\n${decoded}`;
}
