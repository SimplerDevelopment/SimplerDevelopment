/**
 * Splits an email body into the new content vs. the inline-quoted previous
 * message. Cuts at the first reply-boundary marker (Gmail's "On X, person
 * wrote:", Outlook's "-----Original Message-----", etc.). Conservative: if no
 * marker matches, returns the whole input as `body`.
 */

const REPLY_MARKERS: RegExp[] = [
  // Gmail-style: "On Wed, Apr 29, 2026 at 12:56 AM Dan Coyle <x@y> wrote:"
  // Bounded to 400 chars to avoid pathological backtracking on adversarial input.
  /On\s+\w+[^]{1,400}?\swrote:/i,
  // Outlook plain-text reply separator
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  // Forwarded-message separator
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
  // Outlook header block
  /^From:\s.+\nSent:\s.+/im,
  // Legacy Hotmail underscore divider
  /^_{5,}\s*$/m,
];

export function stripQuotedReply(input: string | null | undefined): {
  body: string;
  quoted: string | null;
} {
  if (!input) return { body: '', quoted: null };
  let bestIndex = -1;
  for (const re of REPLY_MARKERS) {
    const m = re.exec(input);
    if (m && (bestIndex < 0 || m.index < bestIndex)) bestIndex = m.index;
  }
  if (bestIndex < 0) return { body: input.trim(), quoted: null };
  const body = input.slice(0, bestIndex).trimEnd();
  const quoted = input.slice(bestIndex).trim();
  return { body, quoted: quoted || null };
}
