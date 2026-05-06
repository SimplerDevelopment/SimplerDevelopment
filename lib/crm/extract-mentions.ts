/**
 * Extract user IDs from @-mention tokens in CRM deal-comment bodies.
 *
 * Mentions follow the schema convention `@[name](userId)` — see the comment
 * on `crmDealComments.body` in `lib/db/schema/crm.ts`. Malformed mentions
 * (no parens, non-numeric id, empty id) are silently ignored. The result is
 * deduplicated, preserving first-occurrence order.
 */
export function extractMentions(body: string): number[] {
  if (typeof body !== 'string' || body.length === 0) return [];

  // Tight pattern: @[<anything but ]>](<digits>) — must include the bracketed
  // name portion AND a numeric id. Plain `@John` or `@[John]` (no id) are
  // ignored on purpose.
  const pattern = /@\[[^\]]+\]\((\d+)\)/g;
  const seen = new Set<number>();
  const out: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    const id = parseInt(match[1], 10);
    if (!Number.isFinite(id) || id <= 0) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
