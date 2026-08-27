// @vitest-environment node
/**
 * Pure unit tests for `lib/portal-nav.ts` — specifically the `apps` injection
 * branch added by Worker 3C of the plugin-registry rollout. No DB, no
 * network: every fixture is constructed in-process so a CI failure here
 * narrowly indicts the nav builder.
 */

import { describe, it, expect } from 'vitest';
import { buildPortalNavItems, pruneByFlags, type PortalNavChild } from '@/lib/portal-nav';
import type { UserAppNavMeta } from '@/lib/plugins/load-user-apps';

const APP_FIXTURE: UserAppNavMeta = {
  slug: 'content-tools',
  name: 'Content Tools',
  icon: 'science',
  manifestStale: false,
  navItems: [
    { label: 'Dashboard', href: '/', icon: 'dashboard' },
    { label: 'Research briefs', href: '/briefs', icon: 'biotech', keywords: ['research'] },
    { label: 'Schedules', href: '/schedules', icon: 'schedule' },
  ],
};

const SECOND_APP_FIXTURE: UserAppNavMeta = {
  slug: 'analytics-pro',
  name: 'Analytics Pro',
  icon: 'analytics',
  manifestStale: false,
  navItems: [{ label: 'Overview', href: '/overview', icon: 'dashboard' }],
};

describe('buildPortalNavItems — no apps arg (legacy callers)', () => {
  it('returns the existing nav tree unmodified when called with 2 args', () => {
    const items = buildPortalNavItems(null, null);
    expect(items.some((i) => i.label === 'Apps')).toBe(false);
    expect(items.at(-1)?.href).toBe('/portal/settings');
  });

  it('returns the existing nav tree unmodified when apps is undefined', () => {
    const items = buildPortalNavItems(null, null, undefined);
    expect(items.some((i) => i.label === 'Apps')).toBe(false);
  });

  it('returns the existing nav tree unmodified when apps is an empty array', () => {
    const items = buildPortalNavItems(null, null, []);
    expect(items.some((i) => i.label === 'Apps')).toBe(false);
  });
});

describe('buildPortalNavItems — apps injection', () => {
  it('inserts an "Apps" top-level item when apps are supplied', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const appsItem = items.find((i) => i.label === 'Apps');
    expect(appsItem).toBeDefined();
    expect(appsItem!.href).toBe('/portal/apps');
    expect(appsItem!.icon).toBe('apps');
  });

  it('places "Apps" directly before "Settings"', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const appsIdx = items.findIndex((i) => i.label === 'Apps');
    const settingsIdx = items.findIndex((i) => i.href === '/portal/settings');
    expect(appsIdx).toBeGreaterThan(-1);
    expect(settingsIdx).toBeGreaterThan(-1);
    expect(settingsIdx - appsIdx).toBe(1);
  });

  it('Settings remains the final item after injection', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE, SECOND_APP_FIXTURE]);
    expect(items.at(-1)?.href).toBe('/portal/settings');
  });

  it("each app appears as a child of 'Apps' with the slug-root href", () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE, SECOND_APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Apps');
    expect(apps?.children).toHaveLength(2);
    const slugs = apps!.children!.map((c) => c.href);
    expect(slugs).toContain('/portal/apps/content-tools');
    expect(slugs).toContain('/portal/apps/analytics-pro');
  });

  it("each app's children include the slug-root AND the manifest nav items as grandchildren", () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Apps');
    const pc = apps!.children!.find((c) => c.href === '/portal/apps/content-tools');
    expect(pc).toBeDefined();
    expect(pc!.label).toBe('Content Tools');
    expect(pc!.icon).toBe('science');

    // The grandchildren are the manifest nav items, rewritten under /portal/apps/<slug>
    const grandchildren = pc!.children ?? [];
    expect(grandchildren).toHaveLength(3);
    const hrefs = grandchildren.map((g) => g.href);
    // Bare '/' collapses to just the slug root rather than '/content-tools/'
    expect(hrefs).toContain('/portal/apps/content-tools');
    expect(hrefs).toContain('/portal/apps/content-tools/briefs');
    expect(hrefs).toContain('/portal/apps/content-tools/schedules');
  });

  it('preserves manifest icons + keywords on the grandchildren', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Apps');
    const pc = apps!.children!.find((c) => c.href === '/portal/apps/content-tools');
    const briefs = pc!.children!.find((g) => g.href === '/portal/apps/content-tools/briefs');
    expect(briefs?.icon).toBe('biotech');
    expect(briefs?.keywords).toEqual(['research']);
  });

  it('does not remove or rename any existing nav item', () => {
    const baseline = buildPortalNavItems(null, null);
    const withApps = buildPortalNavItems(null, null, [APP_FIXTURE]);

    // Every baseline href still exists after injection
    const baselineHrefs = baseline.map((i) => i.href);
    const withAppsHrefs = withApps.map((i) => i.href);
    for (const href of baselineHrefs) {
      expect(withAppsHrefs).toContain(href);
    }

    // Net change is exactly +1 top-level item (the Apps group)
    expect(withApps.length - baseline.length).toBe(1);
  });

  it('uses the app slug as a cmd-K keyword on the app-level child', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Apps');
    const pc = apps!.children!.find((c) => c.href === '/portal/apps/content-tools');
    expect(pc?.keywords).toContain('content-tools');
  });

  it('"Apps" top-level entry carries cmd-K keywords for discoverability', () => {
    const items = buildPortalNavItems(null, null, [APP_FIXTURE]);
    const apps = items.find((i) => i.label === 'Apps');
    expect(apps?.keywords).toEqual(expect.arrayContaining(['plugins', 'integrations']));
  });
});

// PUX-135 — beta-flag pruning. Real nav items don't carry `requiredFlag` yet
// (the first flag, 'portal-redesign', gates nothing), so the pruning helper
// itself is exercised directly against small fixtures rather than through
// buildPortalNavItems's hardcoded tree.
describe('pruneByFlags', () => {
  const flaggedFixture: PortalNavChild[] = [
    { href: '/portal/a', label: 'A', icon: 'a' },
    {
      href: '/portal/beta',
      label: 'Beta Feature',
      icon: 'science',
      requiredFlag: 'portal-redesign',
    },
  ];

  it('removes an item whose requiredFlag is absent from an empty flag set', () => {
    const out = pruneByFlags(flaggedFixture, new Set());
    expect(out.map((i) => i.href)).toEqual(['/portal/a']);
  });

  it('removes an item whose requiredFlag is absent when flags is undefined (fail closed)', () => {
    // Mirrors buildPortalNavItems's `entitlements?.flags ?? new Set()` fallback.
    const out = pruneByFlags(flaggedFixture, new Set<string>());
    expect(out.some((i) => i.href === '/portal/beta')).toBe(false);
  });

  it('keeps an item whose requiredFlag is present in the flag set', () => {
    const out = pruneByFlags(flaggedFixture, new Set(['portal-redesign']));
    expect(out.map((i) => i.href)).toEqual(['/portal/a', '/portal/beta']);
  });

  it('removal is unconditional — pruneByFlags takes no gatingBypassed-style escape hatch, ' +
    'so a flagged item is pruned the same way regardless of billing-gate state', () => {
    // pruneByFlags has no bypass parameter at all: buildPortalNavItems calls it
    // before the `if (entitlements && !entitlements.gatingBypassed)` domain-lock
    // block, so there is no code path where an absent flag survives because
    // gating was bypassed. Assert that directly on the helper.
    const outNoFlags = pruneByFlags(flaggedFixture, new Set());
    expect(outNoFlags.some((i) => i.href === '/portal/beta')).toBe(false);
  });

  it('prunes a flagged CHILD inside an ungated container while its siblings survive', () => {
    const nested: PortalNavChild[] = [
      {
        href: '/portal/marketing',
        label: 'Marketing',
        icon: 'campaign',
        children: [
          { href: '/portal/email', label: 'Email', icon: 'email' },
          {
            href: '/portal/beta-child',
            label: 'Beta Child',
            icon: 'science',
            requiredFlag: 'portal-redesign',
          },
        ],
      },
    ];
    const out = pruneByFlags(nested, new Set());
    const marketing = out.find((i) => i.href === '/portal/marketing');
    expect(marketing).toBeDefined();
    const childHrefs = marketing!.children!.map((c) => c.href);
    expect(childHrefs).toEqual(['/portal/email']);
  });

  it('does not touch nodes without a requiredFlag', () => {
    const out = pruneByFlags(flaggedFixture, new Set());
    expect(out[0]).toEqual(flaggedFixture[0]);
  });
});

describe('buildPortalNavItems — flags wiring (PUX-135)', () => {
  it('accepts entitlements.flags without throwing and leaves the tree unchanged today ' +
    '(no shipped nav item carries requiredFlag yet)', () => {
    const withFlags = buildPortalNavItems(null, null, undefined, {
      domains: new Set(),
      gatingBypassed: true,
      flags: new Set(['portal-redesign']),
    });
    const baseline = buildPortalNavItems(null, null);
    expect(withFlags.map((i) => i.href)).toEqual(baseline.map((i) => i.href));
  });

  it('omitting entitlements.flags entirely still works (optional field)', () => {
    expect(() =>
      buildPortalNavItems(null, null, undefined, { domains: new Set(), gatingBypassed: false }),
    ).not.toThrow();
  });
});
