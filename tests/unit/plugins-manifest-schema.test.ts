// Schema-level tests for the plugin manifest contract. These pin down the
// shape we promise plugins they can publish — changes here ripple to every
// remote plugin in production, so the test file is intentionally exhaustive
// about edge cases.

import { describe, it, expect } from 'vitest';
import {
  ManifestSchema,
  ManifestNavItemSchema,
  ManifestCallbackSchema,
} from '@/lib/plugins/manifest-schema';

const validNavItem = {
  label: 'Briefs',
  href: '/briefs',
  icon: 'biotech',
};

const validCallback = {
  method: 'POST' as const,
  path: '/scripts/run',
  scope: 'content:research:write',
};

const validManifest = {
  id: 'content-tools',
  version: '0.1.0',
  nav: [
    { label: 'Dashboard', href: '/', icon: 'dashboard' },
    {
      label: 'Briefs',
      href: '/briefs',
      icon: 'biotech',
      keywords: ['research', 'reports'],
    },
  ],
  requiredScopes: ['content:research:read', 'content:research:write'],
  callbacks: [validCallback],
  publishedAt: '2026-05-15T00:00:00Z',
};

describe('ManifestSchema', () => {
  it('parses a fully valid manifest', () => {
    const r = ManifestSchema.safeParse(validManifest);
    expect(r.success).toBe(true);
  });

  it('rejects manifest missing id', () => {
    const { id: _id, ...rest } = validManifest;
    const r = ManifestSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it('rejects non-SemVer version "foo"', () => {
    const r = ManifestSchema.safeParse({ ...validManifest, version: 'foo' });
    expect(r.success).toBe(false);
  });

  it('rejects truncated SemVer "1.0"', () => {
    const r = ManifestSchema.safeParse({ ...validManifest, version: '1.0' });
    expect(r.success).toBe(false);
  });

  it('accepts SemVer with pre-release suffix "1.2.3-beta.1"', () => {
    const r = ManifestSchema.safeParse({
      ...validManifest,
      version: '1.2.3-beta.1',
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty nav array', () => {
    const r = ManifestSchema.safeParse({ ...validManifest, nav: [] });
    expect(r.success).toBe(false);
  });

  it('rejects nav with more than 20 items', () => {
    const nav = Array.from({ length: 21 }, (_, i) => ({
      label: `Item ${i}`,
      href: `/item-${i}`,
      icon: 'circle',
    }));
    const r = ManifestSchema.safeParse({ ...validManifest, nav });
    expect(r.success).toBe(false);
  });

  it('rejects publishedAt that is not ISO datetime', () => {
    const r = ManifestSchema.safeParse({
      ...validManifest,
      publishedAt: 'yesterday',
    });
    expect(r.success).toBe(false);
  });

  it('rejects publishedAt that is a date without time', () => {
    const r = ManifestSchema.safeParse({
      ...validManifest,
      publishedAt: '2026-05-15',
    });
    expect(r.success).toBe(false);
  });
});

describe('ManifestNavItemSchema', () => {
  it('parses a nav item with optional keywords', () => {
    const r = ManifestNavItemSchema.safeParse({
      ...validNavItem,
      keywords: ['a', 'b'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects relative href (no leading slash)', () => {
    const r = ManifestNavItemSchema.safeParse({
      ...validNavItem,
      href: 'briefs',
    });
    expect(r.success).toBe(false);
  });

  it('rejects empty label', () => {
    const r = ManifestNavItemSchema.safeParse({ ...validNavItem, label: '' });
    expect(r.success).toBe(false);
  });

  it('rejects empty icon', () => {
    const r = ManifestNavItemSchema.safeParse({ ...validNavItem, icon: '' });
    expect(r.success).toBe(false);
  });
});

describe('ManifestCallbackSchema', () => {
  it('parses a valid callback', () => {
    const r = ManifestCallbackSchema.safeParse(validCallback);
    expect(r.success).toBe(true);
  });

  it('parses a wildcard scope "foo:bar:*"', () => {
    const r = ManifestCallbackSchema.safeParse({
      ...validCallback,
      scope: 'foo:bar:*',
    });
    expect(r.success).toBe(true);
  });

  it('rejects scope "foo" (missing colons)', () => {
    const r = ManifestCallbackSchema.safeParse({
      ...validCallback,
      scope: 'foo',
    });
    expect(r.success).toBe(false);
  });

  it('rejects scope ":bar" (leading colon)', () => {
    const r = ManifestCallbackSchema.safeParse({
      ...validCallback,
      scope: ':bar',
    });
    expect(r.success).toBe(false);
  });

  it('rejects uppercase scope "FOO:BAR"', () => {
    const r = ManifestCallbackSchema.safeParse({
      ...validCallback,
      scope: 'FOO:BAR',
    });
    expect(r.success).toBe(false);
  });

  it('rejects relative callback path', () => {
    const r = ManifestCallbackSchema.safeParse({
      ...validCallback,
      path: 'scripts/run',
    });
    expect(r.success).toBe(false);
  });

  it('rejects unsupported method "PUT"', () => {
    const r = ManifestCallbackSchema.safeParse({
      ...validCallback,
      method: 'PUT' as unknown as 'GET',
    });
    expect(r.success).toBe(false);
  });
});
