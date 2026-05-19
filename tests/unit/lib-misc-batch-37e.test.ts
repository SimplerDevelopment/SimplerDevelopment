// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks shared across describes
// ---------------------------------------------------------------------------

vi.mock('@/config/site', () => ({
  siteConfig: {
    name: 'SimplerDevelopment',
    description: 'Design, Dev, and Automation Agency',
    url: 'https://simplerdevelopment.com',
    ogImage: 'https://simplerdevelopment.com/og.jpg',
    links: {
      twitter: 'https://twitter.com/sd',
      github: 'https://github.com/sd',
      linkedin: 'https://linkedin.com/sd',
    },
    keywords: ['web', 'design', 'dev'],
  },
}));

// ---- db / drizzle-orm mocks for usage-metering ----
const mockExecute = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn(() => ({ limit: mockLimit }));
const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
const mockFrom = vi.fn(() => ({
  where: mockWhere,
  innerJoin: mockInnerJoin,
}));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

// When chained without limit (getAllUsage): select().from().where()
// We need `where` to be thenable in that case. Use a dual-purpose mock.
// We'll override per-test via mockReturnValueOnce on `mockWhere`.

vi.mock('@/lib/db', () => ({
  db: {
    execute: (...args: unknown[]) => mockExecute(...args),
    select: (...args: unknown[]) => mockSelect(...args),
  },
}));

vi.mock('@/lib/db/schema', () => ({
  usageMeters: {
    clientId: 'usage_meters.client_id',
    category: 'usage_meters.category',
    period: 'usage_meters.period',
    usage: 'usage_meters.usage',
    included: 'usage_meters.included',
    overageRate: 'usage_meters.overage_rate',
  },
  clientServices: {
    clientId: 'client_services.client_id',
    serviceId: 'client_services.service_id',
    status: 'client_services.status',
  },
  services: {
    id: 'services.id',
    category: 'services.category',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((a, b) => ({ __eq: [a, b] })),
  and: vi.fn((...args) => ({ __and: args })),
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => ({
      __sql: { strings, values },
    }),
    {},
  ),
}));

// ---------------------------------------------------------------------------
// 1. animations.ts
// ---------------------------------------------------------------------------
describe('lib/utils/animations', () => {
  it('exports fadeInVariants with hidden and visible states', async () => {
    const mod = await import('@/lib/utils/animations');
    expect(mod.fadeInVariants.hidden).toEqual({ opacity: 0, y: 20 });
    expect(mod.fadeInVariants.visible).toMatchObject({ opacity: 1, y: 0 });
  });

  it('exports slideInVariants', async () => {
    const mod = await import('@/lib/utils/animations');
    expect(mod.slideInVariants.hidden).toEqual({ opacity: 0, x: -50 });
    expect(mod.slideInVariants.visible).toMatchObject({ opacity: 1, x: 0 });
  });

  it('exports scaleInVariants', async () => {
    const mod = await import('@/lib/utils/animations');
    expect(mod.scaleInVariants.hidden).toEqual({ opacity: 0, scale: 0.8 });
    expect(mod.scaleInVariants.visible).toMatchObject({ opacity: 1, scale: 1 });
  });

  it('exports stagger container and item variants', async () => {
    const mod = await import('@/lib/utils/animations');
    expect(mod.staggerContainerVariants.hidden).toEqual({ opacity: 0 });
    expect(mod.staggerItemVariants.hidden).toEqual({ opacity: 0, y: 20 });
  });

  it('exports easing presets', async () => {
    const { easing } = await import('@/lib/utils/animations');
    expect(easing.easeInOut).toEqual([0.4, 0, 0.2, 1]);
    expect(easing.smooth).toEqual([0.25, 0.1, 0.25, 1]);
    expect(easing.bounce).toEqual([0.68, -0.55, 0.265, 1.55]);
  });

  it('exports duration presets', async () => {
    const { duration } = await import('@/lib/utils/animations');
    expect(duration.fast).toBe(0.3);
    expect(duration.normal).toBe(0.6);
    expect(duration.slow).toBe(1);
    expect(duration.verySlow).toBe(1.5);
  });

  it('createStaggerVariants returns container and item variants with defaults', async () => {
    const { createStaggerVariants } = await import('@/lib/utils/animations');
    const result = createStaggerVariants();
    expect(result.container.hidden).toEqual({ opacity: 0 });
    // Visible may be an object or a function in framer-motion typing; assert object form.
    const containerVisible = result.container.visible as Record<string, unknown>;
    expect(containerVisible.opacity).toBe(1);
    expect((containerVisible.transition as Record<string, unknown>).staggerChildren).toBe(0.1);
    expect((containerVisible.transition as Record<string, unknown>).delayChildren).toBe(0);
  });

  it('createStaggerVariants accepts custom delays', async () => {
    const { createStaggerVariants } = await import('@/lib/utils/animations');
    const result = createStaggerVariants(0.25, 0.5);
    const containerVisible = result.container.visible as Record<string, unknown>;
    expect((containerVisible.transition as Record<string, unknown>).staggerChildren).toBe(0.25);
    expect((containerVisible.transition as Record<string, unknown>).delayChildren).toBe(0.5);
  });

  it('createParallaxTransform applies default and custom speed', async () => {
    const { createParallaxTransform } = await import('@/lib/utils/animations');
    expect(createParallaxTransform(0.5)).toBe(0.5 * 0.5 * 100);
    expect(createParallaxTransform(1, 0.2)).toBe(20);
    expect(createParallaxTransform(0)).toBe(0);
  });

  it('getViewportConfig returns config with defaults', async () => {
    const { getViewportConfig } = await import('@/lib/utils/animations');
    expect(getViewportConfig()).toEqual({ once: true, margin: '-100px', amount: 0.3 });
  });

  it('getViewportConfig accepts custom margin and once', async () => {
    const { getViewportConfig } = await import('@/lib/utils/animations');
    expect(getViewportConfig('-50px', false)).toEqual({ once: false, margin: '-50px', amount: 0.3 });
  });
});

// ---------------------------------------------------------------------------
// 2. seo.ts
// ---------------------------------------------------------------------------
describe('lib/utils/seo', () => {
  it('generateSEO returns metadata with defaults', async () => {
    const { generateSEO } = await import('@/lib/utils/seo');
    const meta = generateSEO({});
    expect(meta.title).toBe('SimplerDevelopment');
    expect(meta.description).toBe('Design, Dev, and Automation Agency');
    expect(meta.alternates?.canonical).toBe('https://simplerdevelopment.com');
    expect(meta.openGraph).toMatchObject({
      type: 'website',
      url: 'https://simplerdevelopment.com',
      siteName: 'SimplerDevelopment',
    });
    expect(meta.twitter).toMatchObject({
      card: 'summary_large_image',
      creator: '@simplerdevelopment',
    });
  });

  it('generateSEO composes title with site name', async () => {
    const { generateSEO } = await import('@/lib/utils/seo');
    const meta = generateSEO({ title: 'About', description: 'About us', path: '/about' });
    expect(meta.title).toBe('About | SimplerDevelopment');
    expect(meta.description).toBe('About us');
    expect(meta.alternates?.canonical).toBe('https://simplerdevelopment.com/about');
  });

  it('generateSEO uses provided image', async () => {
    const { generateSEO } = await import('@/lib/utils/seo');
    const meta = generateSEO({ title: 'X', image: 'https://example.com/img.png' });
    const og = meta.openGraph as { images?: Array<{ url: string }> };
    expect(og.images?.[0].url).toBe('https://example.com/img.png');
    expect((meta.twitter as { images?: string[] }).images?.[0]).toBe(
      'https://example.com/img.png',
    );
  });

  it('generateSEO falls back to siteConfig.ogImage', async () => {
    const { generateSEO } = await import('@/lib/utils/seo');
    const meta = generateSEO({ title: 'Y' });
    const og = meta.openGraph as { images?: Array<{ url: string }> };
    expect(og.images?.[0].url).toBe('https://simplerdevelopment.com/og.jpg');
  });

  it('generateSEO handles article type with publishedTime/authors/tags', async () => {
    const { generateSEO } = await import('@/lib/utils/seo');
    const meta = generateSEO({
      title: 'Post',
      type: 'article',
      publishedTime: '2026-01-01',
      modifiedTime: '2026-02-01',
      authors: ['Dan'],
      tags: ['a', 'b'],
    });
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.type).toBe('article');
    expect(og.publishedTime).toBe('2026-01-01');
    expect(og.modifiedTime).toBe('2026-02-01');
    expect(og.authors).toEqual(['Dan']);
    expect(og.tags).toEqual(['a', 'b']);
  });

  it('generateSEO article type defaults authors/tags to empty arrays', async () => {
    const { generateSEO } = await import('@/lib/utils/seo');
    const meta = generateSEO({ title: 'Post', type: 'article', publishedTime: '2026-01-01' });
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.authors).toEqual([]);
    expect(og.tags).toEqual([]);
  });

  it('generateArticleSchema returns BlogPosting schema', async () => {
    const { generateArticleSchema } = await import('@/lib/utils/seo');
    const schema = generateArticleSchema({
      title: 'T',
      description: 'D',
      image: 'I',
      publishedTime: 'P',
      modifiedTime: 'M',
      author: 'A',
      url: 'U',
    });
    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: 'T',
      description: 'D',
      image: 'I',
      datePublished: 'P',
      dateModified: 'M',
      author: { '@type': 'Person', name: 'A' },
      mainEntityOfPage: { '@type': 'WebPage', '@id': 'U' },
    });
    expect((schema.publisher as Record<string, unknown>).name).toBe('SimplerDevelopment');
  });

  it('generateArticleSchema falls back modifiedTime to publishedTime', async () => {
    const { generateArticleSchema } = await import('@/lib/utils/seo');
    const schema = generateArticleSchema({
      title: 'T',
      description: 'D',
      image: 'I',
      publishedTime: 'P',
      author: 'A',
      url: 'U',
    });
    expect(schema.dateModified).toBe('P');
  });

  it('generateOrganizationSchema from seo.ts returns org schema with sameAs links', async () => {
    const mod = await import('@/lib/utils/seo');
    const schema = mod.generateOrganizationSchema();
    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'SimplerDevelopment',
      url: 'https://simplerdevelopment.com',
      logo: 'https://simplerdevelopment.com/logo.png',
    });
    expect(schema.sameAs).toEqual([
      'https://twitter.com/sd',
      'https://github.com/sd',
      'https://linkedin.com/sd',
    ]);
  });
});

// ---------------------------------------------------------------------------
// 3. structured-data.ts
// ---------------------------------------------------------------------------
describe('lib/utils/structured-data', () => {
  it('generateOrganizationSchema returns Organization with contactPoint', async () => {
    const { generateOrganizationSchema } = await import('@/lib/utils/structured-data');
    const schema = generateOrganizationSchema();
    expect(schema).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'SimplerDevelopment',
      url: 'https://simplerdevelopment.com',
      description: 'Design, Dev, and Automation Agency',
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'Customer Service',
      },
    });
  });

  it('generateWebsiteSchema returns WebSite schema with publisher', async () => {
    const { generateWebsiteSchema } = await import('@/lib/utils/structured-data');
    const schema = generateWebsiteSchema();
    expect(schema).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'SimplerDevelopment',
      url: 'https://simplerdevelopment.com',
      description: 'Design, Dev, and Automation Agency',
      publisher: { '@type': 'Organization', name: 'SimplerDevelopment' },
    });
  });

  it('generateArticleSchema returns Article with required fields and defaults dateModified', async () => {
    const { generateArticleSchema } = await import('@/lib/utils/structured-data');
    const schema = generateArticleSchema('T', 'D', '2026-01-01');
    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'T',
      description: 'D',
      datePublished: '2026-01-01',
      dateModified: '2026-01-01',
    });
    expect(schema.image).toBeUndefined();
    expect(schema.author.name).toBe('SimplerDevelopment');
  });

  it('generateArticleSchema accepts image and modifiedAt', async () => {
    const { generateArticleSchema } = await import('@/lib/utils/structured-data');
    const schema = generateArticleSchema(
      'Title',
      'Desc',
      '2026-01-01',
      'https://example.com/img.png',
      '2026-02-15',
    );
    expect(schema.image).toBe('https://example.com/img.png');
    expect(schema.dateModified).toBe('2026-02-15');
  });

  it('generateServiceSchema returns Service with provider', async () => {
    const { generateServiceSchema } = await import('@/lib/utils/structured-data');
    const schema = generateServiceSchema('Consulting', 'Top-tier consulting');
    expect(schema).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'Consulting',
      description: 'Top-tier consulting',
      provider: { '@type': 'Organization', name: 'SimplerDevelopment' },
    });
    expect(schema.serviceType).toBeUndefined();
  });

  it('generateServiceSchema accepts serviceType', async () => {
    const { generateServiceSchema } = await import('@/lib/utils/structured-data');
    const schema = generateServiceSchema('Web', 'desc', 'WebDevelopment');
    expect(schema.serviceType).toBe('WebDevelopment');
  });
});

// ---------------------------------------------------------------------------
// 4. usage-metering.ts
// ---------------------------------------------------------------------------
describe('lib/usage-metering', () => {
  beforeEach(() => {
    mockExecute.mockReset();
    mockLimit.mockReset();
    mockWhere.mockReset();
    mockInnerJoin.mockReset();
    mockFrom.mockReset();
    mockSelect.mockReset();

    // Re-establish default chain behavior after reset
    mockWhere.mockImplementation(() => ({ limit: mockLimit }));
    mockInnerJoin.mockImplementation(() => ({ where: mockWhere }));
    mockFrom.mockImplementation(() => ({ where: mockWhere, innerJoin: mockInnerJoin }));
    mockSelect.mockImplementation(() => ({ from: mockFrom }));
  });

  it('USAGE_LABELS exposes labels for known categories', async () => {
    const { USAGE_LABELS } = await import('@/lib/usage-metering');
    expect(USAGE_LABELS.email_sends).toEqual({ label: 'Email Sends', unit: 'emails' });
    expect(USAGE_LABELS.hosting_storage_gb).toEqual({ label: 'Storage', unit: 'GB' });
    expect(USAGE_LABELS.hosting_bandwidth_gb).toEqual({ label: 'Bandwidth', unit: 'GB' });
  });

  it('trackUsage runs an upsert with default included for non-bundle clients', async () => {
    // checkBundleSubscription -> limit(1) returns []
    mockLimit.mockResolvedValueOnce([]);
    mockExecute.mockResolvedValueOnce(undefined);

    const { trackUsage } = await import('@/lib/usage-metering');
    await trackUsage(42, 'email_sends', 500);

    expect(mockExecute).toHaveBeenCalledTimes(1);
    const sqlArg = mockExecute.mock.calls[0][0];
    // The mocked `sql` tag returns { __sql: { strings, values } }
    expect(sqlArg.__sql.values).toEqual(
      expect.arrayContaining([42, 'email_sends', 500, 10_000, 100]),
    );
  });

  it('trackUsage uses bundle limits when client has bundle subscription', async () => {
    mockLimit.mockResolvedValueOnce([{ category: 'bundle' }]);
    mockExecute.mockResolvedValueOnce(undefined);

    const { trackUsage } = await import('@/lib/usage-metering');
    await trackUsage(7, 'hosting_storage_gb', 2);

    const sqlArg = mockExecute.mock.calls[0][0];
    // Bundle limit for hosting_storage_gb = 20
    expect(sqlArg.__sql.values).toEqual(expect.arrayContaining([7, 'hosting_storage_gb', 2, 20, 10]));
  });

  it('trackUsage uses 0/0 defaults for unknown categories', async () => {
    mockLimit.mockResolvedValueOnce([]);
    mockExecute.mockResolvedValueOnce(undefined);

    const { trackUsage } = await import('@/lib/usage-metering');
    await trackUsage(1, 'mystery_category', 99);

    const sqlArg = mockExecute.mock.calls[0][0];
    expect(sqlArg.__sql.values).toEqual(expect.arrayContaining([1, 'mystery_category', 99, 0, 0]));
  });

  it('getUsage returns zero-state defaults when no row exists', async () => {
    mockLimit.mockResolvedValueOnce([]); // getUsage select -> no rows

    const { getUsage } = await import('@/lib/usage-metering');
    const info = await getUsage(99, 'email_sends');
    expect(info).toEqual({
      category: 'email_sends',
      usage: 0,
      included: 10_000,
      overage: 0,
      overageRate: 100,
      overageCost: 0,
    });
  });

  it('getUsage returns zero-state defaults for unknown category with row missing', async () => {
    mockLimit.mockResolvedValueOnce([]);

    const { getUsage } = await import('@/lib/usage-metering');
    const info = await getUsage(99, 'unknown_cat');
    expect(info).toEqual({
      category: 'unknown_cat',
      usage: 0,
      included: 0,
      overage: 0,
      overageRate: 0,
      overageCost: 0,
    });
  });

  it('getUsage computes overage and overageCost when row exists', async () => {
    mockLimit.mockResolvedValueOnce([
      { usage: 12_000, included: 10_000, overageRate: 100, category: 'email_sends' },
    ]);

    const { getUsage } = await import('@/lib/usage-metering');
    const info = await getUsage(5, 'email_sends');
    expect(info.usage).toBe(12_000);
    expect(info.overage).toBe(2_000);
    expect(info.overageCost).toBe(200_000); // 2000 * 100
  });

  it('getUsage clamps overage to zero when usage < included', async () => {
    mockLimit.mockResolvedValueOnce([
      { usage: 5_000, included: 10_000, overageRate: 100, category: 'email_sends' },
    ]);

    const { getUsage } = await import('@/lib/usage-metering');
    const info = await getUsage(5, 'email_sends');
    expect(info.overage).toBe(0);
    expect(info.overageCost).toBe(0);
  });

  it('getAllUsage merges DB rows with default categories not yet tracked', async () => {
    // getAllUsage uses: db.select().from(usageMeters).where(...) -> array (no limit)
    // Our mock chain returns `.where(...) => { limit }`. We need `where` to return an
    // array-thenable, so override for THIS call.
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([
        { category: 'email_sends', usage: 15_000, included: 10_000, overageRate: 100 },
      ]),
    );

    const { getAllUsage } = await import('@/lib/usage-metering');
    const all = await getAllUsage(1);
    expect(all).toHaveLength(3); // email_sends (tracked) + storage + bandwidth (defaults)

    const email = all.find((u) => u.category === 'email_sends');
    expect(email).toMatchObject({ usage: 15_000, included: 10_000, overage: 5_000, overageCost: 500_000 });

    const storage = all.find((u) => u.category === 'hosting_storage_gb');
    expect(storage).toMatchObject({ usage: 0, included: 5, overage: 0, overageCost: 0 });

    const bandwidth = all.find((u) => u.category === 'hosting_bandwidth_gb');
    expect(bandwidth).toMatchObject({ usage: 0, included: 100, overage: 0, overageCost: 0 });
  });

  it('getAllUsage returns only defaults when client has no usage rows', async () => {
    mockWhere.mockImplementationOnce(() => Promise.resolve([]));

    const { getAllUsage } = await import('@/lib/usage-metering');
    const all = await getAllUsage(2);
    expect(all).toHaveLength(3);
    expect(all.every((u) => u.usage === 0)).toBe(true);
  });

  it('getTotalOverageCost sums overageCost across categories', async () => {
    mockWhere.mockImplementationOnce(() =>
      Promise.resolve([
        { category: 'email_sends', usage: 11_000, included: 10_000, overageRate: 100 }, // 100k cents
        { category: 'hosting_storage_gb', usage: 6, included: 5, overageRate: 10 },     // 10 cents
      ]),
    );

    const { getTotalOverageCost } = await import('@/lib/usage-metering');
    const total = await getTotalOverageCost(3);
    // 1000 * 100 + 1 * 10 = 100_010
    expect(total).toBe(100_010);
  });

  it('getTotalOverageCost returns 0 when no overages exist', async () => {
    mockWhere.mockImplementationOnce(() => Promise.resolve([]));

    const { getTotalOverageCost } = await import('@/lib/usage-metering');
    const total = await getTotalOverageCost(4);
    expect(total).toBe(0);
  });
});
