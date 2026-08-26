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
import { existsSync, readFileSync } from 'node:fs';
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

  /**
   * PUX-123: the "existence" check above is exactly why the original bug
   * survived — /portal/websites IS a real route, so a step that pointed there
   * instead of a domain-appropriate surface passed the test above every time.
   * This targets the Store domain specifically (the one PUX-123 fixed) and
   * requires its detected steps to reach an actual *store* surface: either a
   * direct /portal/websites/[siteId]/store/... deep link, or one of this
   * repo's server-side resolver routes (app/portal/store/route.ts and
   * app/portal/store/products/route.ts) that redirects into one. Reading the
   * resolver's source (rather than importing it) confirms it actually
   * redirects somewhere under /store — a resolver that existed but redirected
   * to, say, /portal/dashboard would still fail this.
   *
   * This is deliberately narrower than a repo-wide "every step must live
   * under its own domain's subtree" rule (rejected in the block comment
   * above for false-positiving on legitimate cross-domain links like esign →
   * /portal/crm/contracts) — it only asserts the one domain this ticket is
   * about actually reaches a store surface.
   */
  it('store checklist steps reach a store surface, not just any valid route', () => {
    function resolvesToStoreSurface(href: string): boolean {
      // Direct deep link already under a site's store subtree.
      if (/^\/portal\/websites\/[^/]+\/store(\/|$)/.test(href)) return true;

      // A server-side resolver route — confirm its source actually redirects
      // into a /store path, not just that the route file exists.
      const path = href.split('?')[0].split('#')[0].replace(/\/$/, '');
      const routeFile = resolve(REPO_ROOT, `app${path}`, 'route.ts');
      if (!existsSync(routeFile)) return false;
      const src = readFileSync(routeFile, 'utf8');
      return /redirect\([^)]*\/store/.test(src);
    }

    const storeSteps = RICH_SEGMENTS.store.actions.filter((a) => a.detect);
    const wrong = storeSteps.filter((a) => !resolvesToStoreSurface(a.href));
    expect(wrong.map((a) => `store/${a.key} → ${a.href}`)).toEqual([]);
  });
});
