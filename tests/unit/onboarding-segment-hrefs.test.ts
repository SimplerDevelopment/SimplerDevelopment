// @vitest-environment node
/**
 * Every "get started" checklist href must point at a route that exists.
 *
 * OBQA-019 found Store and Pitch Decks steps both pointing at /portal/websites.
 * That URL resolves, so nothing broke loudly — the user just landed on a
 * generic site list instead of the thing the step told them to do. A dead or
 * drifted href in this table is invisible until someone clicks it during QA,
 * which is exactly how it survived from July to now.
 *
 * This asserts existence, which is the half a machine can check. It cannot know
 * that /portal/websites was the *wrong* live page — only a human reading the
 * step label can tell that. A stricter "each step must live under its own
 * domain's route subtree" rule was considered and rejected: it false-positives
 * on the legitimate cross-domain links this table already relies on (esign →
 * /portal/crm/contracts, automations → /portal/automations), so it would need a
 * per-domain allowlist that just restates the data it is checking.
 */
import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { RICH_SEGMENTS } from '@/lib/onboarding/module-segments';

const REPO_ROOT = resolve(__dirname, '../..');

/** /portal/tools/pitch-decks/new → app/portal/tools/pitch-decks/new/page.tsx */
function routeExists(href: string): boolean {
  const path = href.split('?')[0].split('#')[0].replace(/\/$/, '');
  const base = resolve(REPO_ROOT, `app${path}`);
  return ['page.tsx', 'page.ts', 'route.ts'].some((f) => existsSync(resolve(base, f)));
}

const allActions = Object.entries(RICH_SEGMENTS).flatMap(([key, seg]) =>
  seg.actions.map((a) => ({ domain: key, key: a.key, label: a.label, href: a.href })),
);

describe('onboarding checklist hrefs', () => {
  it('every action href resolves to a real route', () => {
    const dead = allActions.filter((a) => !routeExists(a.href));
    expect(dead.map((d) => `${d.domain}/${d.key} → ${d.href}`)).toEqual([]);
  });

  it('has actions to check at all', () => {
    // Guards the test itself: an import that silently yields {} would make the
    // assertion above vacuously pass.
    expect(allActions.length).toBeGreaterThan(20);
  });
});
