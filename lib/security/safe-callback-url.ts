// Single source of truth for validating a post-login `callbackUrl`. Lived in two
// verbatim copies (lib/auth.ts + app/portal/login/page.tsx); a string-prefix
// version let "/\evil.com" through because it starts with "/", isn't "//", and
// has no scheme — yet the browser/URL parser normalizes the backslash to a slash
// and navigates to https://evil.com. Reject the characters the parser rewrites,
// then confirm the value stays on a fixed placeholder origin. Edge-safe (URL only).

const FALLBACK = '/portal/dashboard';

// Backslash, any whitespace, and C0/C1 control chars all get normalized by the
// URL parser / browser into off-site or unexpected navigations.
const UNSAFE_CHARS = /[\u0000-\u001f\u007f-\u009f\\\s]/;

export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return FALLBACK;
  if (UNSAFE_CHARS.test(raw)) return FALLBACK;
  // Absolute / protocol-relative / scheme URLs.
  if (raw.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(raw)) return FALLBACK;
  if (!raw.startsWith('/')) return FALLBACK;
  // Final authority: resolve against a placeholder origin and require the result
  // to remain on it — i.e. a genuine same-origin relative path.
  try {
    const u = new URL(raw, 'https://placeholder.invalid');
    if (u.origin !== 'https://placeholder.invalid') return FALLBACK;
    return u.pathname + u.search + u.hash;
  } catch {
    return FALLBACK;
  }
}
