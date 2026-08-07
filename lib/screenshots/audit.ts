/**
 * Quality gate for the /solutions/[slug] marketing gallery.
 *
 * These screenshots are public marketing. A shot showing an empty state, seeded
 * e2e fixture junk, a localhost URL, or a render failure ("$NaN", an unrendered
 * icon ligature) is worse than no shot at all — the 2026-08 audit found 49 of 64
 * live screenshots carrying at least one of these.
 *
 * Kept out of the capture script itself so the rules are unit-testable: a
 * quality gate that silently stops matching is indistinguishable from a clean run.
 */

export type Violation = { kind: string; match: string };
type Rule = [RegExp, string];

/** Zero-state copy. A gallery shot of "No playbooks yet" sells nothing. */
export const EMPTY_PATTERNS: Rule[] = [
  [/\bno\s+[a-z][a-z\s'-]{0,28}\s+(yet|found)\b/i, 'empty-state'],
  [/\bnothing\s+(assigned|waiting|overdue|blocked|selected|here)\b/i, 'empty-state'],
  [/\bnot configured\b/i, 'unconfigured'],
  [/\b(create|add|record|define) your first\b/i, 'empty-state'],
  [/\bno (custom domain|hosted sites|people on file|decisions captured)\b/i, 'empty-state'],
];

/** Seeded test data that leaked into the demo tenant. */
export const JUNK_PATTERNS: Rule[] = [
  [/\[archived-e2e\]/i, 'e2e-fixture'],
  [/\be2e[-_ ]/i, 'e2e-fixture'],
  [/\bfixture\b/i, 'e2e-fixture'],
  [/\bTest (List|Site|Post|MCP Key|Company)\b/i, 'test-fixture'],
  [/\b\d{13}\b/, 'epoch-suffixed seed name'],
  [/APPR-MUT-|INV-PAY-E2E|crm-route-/i, 'e2e-fixture'],
];

/** Internal URLs must never appear in public marketing. */
export const LEAK_PATTERNS: Rule[] = [
  [/localhost:\d+/i, 'localhost URL'],
  [/127\.0\.0\.1/, 'loopback URL'],
  [/\.vercel\.app/i, 'preview-deploy URL'],
];

/** Rendering failures that photograph as literal text. */
export const RENDER_PATTERNS: Rule[] = [
  [/\$NaN|\bNaN\b/, 'NaN in rendered output'],
  // Material Icon ligature names show through when the icon font fails to load.
  [/\b(view_kanban|calendar_month|chevron_left|chevron_right|add_circle_outline|more_vert|arrow_back)\b/, 'unrendered icon ligature'],
  [/\bundefined\b/, 'literal "undefined"'],
];

/**
 * Audit the visible text of a captured screen.
 * `allowEmpty` exempts screens that are legitimately a blank form (e.g. the
 * agency custom-domain setup step), where zero-state IS the product.
 */
export function auditText(text: string, opts: { allowEmpty?: boolean } = {}): Violation[] {
  const sets = [JUNK_PATTERNS, LEAK_PATTERNS, RENDER_PATTERNS];
  if (!opts.allowEmpty) sets.push(EMPTY_PATTERNS);

  const out: Violation[] = [];
  for (const set of sets) {
    for (const [re, kind] of set) {
      const m = text.match(re);
      if (m) out.push({ kind, match: m[0].slice(0, 60) });
    }
  }
  return out;
}
