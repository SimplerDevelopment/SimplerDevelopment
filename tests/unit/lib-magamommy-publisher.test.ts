// @vitest-environment node
/**
 * Unit tests for lib/magamommy/agents/publisher.ts
 *
 * Exports under test:
 *   - runPublisher (orchestrator — mocks db heavily via chained select/insert/update)
 *
 * Strategy: every DB call is mocked via mockDbSelect / mockDbInsert / mockDbUpdate.
 * The publisher makes many sequential queries so we use mockReturnValueOnce chains.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── DB mock (declared BEFORE importing module under test) ─────────────────────

const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
const mockDbUpdate = vi.fn();

vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
    update: (...args: unknown[]) => mockDbUpdate(...args),
  },
}));

vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual };
});

vi.mock('@/lib/db/schema', () => ({
  clientWebsites: {
    id: 'clientWebsites.id',
    subdomain: 'clientWebsites.subdomain',
    vercelDomain: 'clientWebsites.vercelDomain',
    domain: 'clientWebsites.domain',
  },
  designs: {
    id: 'designs.id',
    productId: 'designs.productId',
    renderedUrl: 'designs.renderedUrl',
    updatedAt: 'designs.updatedAt',
  },
  magamommyConcepts: {
    id: 'magamommyConcepts.id',
    websiteId: 'magamommyConcepts.websiteId',
  },
  productCategories: {
    id: 'productCategories.id',
    websiteId: 'productCategories.websiteId',
    slug: 'productCategories.slug',
  },
  productDesignSurfaces: {
    productId: 'productDesignSurfaces.productId',
    name: 'productDesignSurfaces.name',
    slug: 'productDesignSurfaces.slug',
    displayOrder: 'productDesignSurfaces.displayOrder',
    mockupImage: 'productDesignSurfaces.mockupImage',
    canvasWidth: 'productDesignSurfaces.canvasWidth',
    canvasHeight: 'productDesignSurfaces.canvasHeight',
    printAreaX: 'productDesignSurfaces.printAreaX',
    printAreaY: 'productDesignSurfaces.printAreaY',
    printAreaWidth: 'productDesignSurfaces.printAreaWidth',
    printAreaHeight: 'productDesignSurfaces.printAreaHeight',
    printDpi: 'productDesignSurfaces.printDpi',
    active: 'productDesignSurfaces.active',
  },
  productImages: {
    productId: 'productImages.productId',
  },
  productOptions: {
    id: 'productOptions.id',
    productId: 'productOptions.productId',
    name: 'productOptions.name',
    order: 'productOptions.order',
  },
  productOptionValues: {
    id: 'productOptionValues.id',
    optionId: 'productOptionValues.optionId',
    order: 'productOptionValues.order',
  },
  productVariants: {
    $inferInsert: {},
  },
  products: {
    id: 'products.id',
    websiteId: 'products.websiteId',
    slug: 'products.slug',
    weight: 'products.weight',
    weightUnit: 'products.weightUnit',
  },
}));

// ── Import module under test (after all vi.mock calls) ────────────────────────

const { runPublisher } = await import('@/lib/magamommy/agents/publisher');

// ── Chain builder helpers ─────────────────────────────────────────────────────

function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  chain.orderBy.mockResolvedValue(rows);
  return chain;
}

// Select chain that resolves the final call regardless of terminator used
function makeSelectChainAlways(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    // allow awaiting the chain directly (no limit/orderBy)
    then: (resolve: (v: unknown[]) => void) => resolve(rows),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  chain.orderBy.mockResolvedValue(rows);
  return chain;
}

function makeInsertChain(rows: unknown[]) {
  const chain = {
    values: vi.fn(),
    returning: vi.fn(),
  };
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue(rows);
  return chain;
}

// An insert chain that resolves even without .returning() being called
function makeInsertChainNoReturn() {
  const chain = {
    values: vi.fn(),
    returning: vi.fn(),
  };
  chain.values.mockResolvedValue([]);
  chain.returning.mockResolvedValue([]);
  return chain;
}

function makeUpdateChain() {
  const chain = {
    set: vi.fn(),
    where: vi.fn(),
  };
  chain.set.mockReturnValue(chain);
  chain.where.mockResolvedValue([]);
  return chain;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INPUT = {
  websiteId: 1,
  conceptId: 10,
  designId: 'uuid-design-abc',
  templateProductId: 5,
  weekOf: new Date('2025-01-06T00:00:00Z'), // a Monday
};

const MOCK_CONCEPT = {
  id: 10,
  websiteId: 1,
  slogan: 'MAGA MOMMY',
  tagline: 'Patriot Mom Energy',
  topicSlug: 'eagle-pride',
  style: 'bold',
  briefId: 3,
};

const MOCK_DESIGN = {
  id: 'uuid-design-abc',
  websiteId: 1,
  productId: 5,
  renderedUrl: 'https://s3.example.com/composite.png',
};

const MOCK_TEMPLATE_PRODUCT = {
  id: 5,
  websiteId: 1,
  weight: '200',
  weightUnit: 'g',
};

const MOCK_CATEGORY = {
  id: 99,
  websiteId: 1,
  slug: 'weekly-drops',
  name: 'Weekly Drops',
};

const MOCK_SIZE_OPTION = { id: 20, productId: 5, name: 'Size', order: 0 };
const MOCK_COLOR_OPTION = { id: 21, productId: 5, name: 'Color', order: 1 };

const MOCK_SIZE_VALUES = [
  { id: 100, optionId: 20, value: 'S', label: 'Small', order: 0 },
  { id: 101, optionId: 20, value: 'M', label: 'Medium', order: 1 },
];
const MOCK_COLOR_VALUES = [
  { id: 200, optionId: 21, value: 'White', label: 'White', order: 0 },
  { id: 201, optionId: 21, value: 'Black', label: 'Black', order: 1 },
];

const MOCK_NEW_PRODUCT = { id: 500 };
const MOCK_NEW_SIZE_OPTION = { id: 30, productId: 500, name: 'Size', order: 0 };
const MOCK_NEW_COLOR_OPTION = { id: 31, productId: 500, name: 'Color', order: 1 };
const MOCK_NEW_SIZE_VALUES = [
  { id: 300, optionId: 30, value: 'S' },
  { id: 301, optionId: 30, value: 'M' },
];
const MOCK_NEW_COLOR_VALUES = [
  { id: 400, optionId: 31, value: 'White' },
  { id: 401, optionId: 31, value: 'Black' },
];

const MOCK_SITE = {
  subdomain: 'magamommy',
  vercelDomain: 'magamommy.vercel.app',
  domain: null,
};

const MOCK_TEMPLATE_SURFACES = [
  {
    name: 'Front',
    slug: 'front',
    displayOrder: 0,
    mockupImage: 'https://cdn.example.com/mockup.png',
    canvasWidth: 3000,
    canvasHeight: 3600,
    printAreaX: 500,
    printAreaY: 600,
    printAreaWidth: 1200,
    printAreaHeight: 1200,
    printDpi: 300,
    active: true,
  },
];

/**
 * Wire up the full happy-path mock sequence.
 * The publisher makes these DB calls in order:
 *  1. select concept
 *  2. select design
 *  3. select template product (narrow projection)
 *  4. select templateSurfaces (for logging)
 *  5. select templateOptions
 *  6. select values for Size option
 *  7. select values for Color option
 *  8. select category (find-or-create)
 *  9. select slug collision check (returns empty → slug is free)
 * 10. insert product
 * 11. insert productImages
 * 12. select templateSurfaceRows (detailed projection for clone)
 * 13. insert productDesignSurfaces
 * 14. update designs (reassign productId)
 * 15. insert new Size productOption → returning
 * 16. insert Size value[0]
 * 17. insert Size value[1]
 * 18. insert new Color productOption → returning
 * 19. insert Color value[0]
 * 20. insert Color value[1]
 * 21. insert productVariants (bulk)
 * 22. select clientWebsites
 */
function setupHappyPath() {
  // Selects (in call order)
  mockDbSelect
    .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))           // 1 concept
    .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))            // 2 design
    .mockReturnValueOnce(makeSelectChain([MOCK_TEMPLATE_PRODUCT]))  // 3 template product
    .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES)) // 4 surfaces (logging)
    .mockReturnValueOnce(makeSelectChain([MOCK_SIZE_OPTION, MOCK_COLOR_OPTION])) // 5 options
    .mockReturnValueOnce(makeSelectChain(MOCK_SIZE_VALUES))         // 6 size values
    .mockReturnValueOnce(makeSelectChain(MOCK_COLOR_VALUES))        // 7 color values
    .mockReturnValueOnce(makeSelectChain([MOCK_CATEGORY]))          // 8 category (found)
    .mockReturnValueOnce(makeSelectChain([]))                       // 9 slug collision (free)
    .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES)) // 12 surface clone projection
    .mockReturnValueOnce(makeSelectChain([MOCK_SITE]));             // 22 clientWebsites

  // Inserts (in call order)
  mockDbInsert
    .mockReturnValueOnce(makeInsertChain([MOCK_NEW_PRODUCT]))       // 10 products
    .mockReturnValueOnce(makeInsertChainNoReturn())                  // 11 productImages
    .mockReturnValueOnce(makeInsertChainNoReturn())                  // 13 productDesignSurfaces clone
    .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_OPTION]))   // 15 new Size option
    .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[0]])) // 16 S value
    .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[1]])) // 17 M value
    .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_OPTION]))  // 18 new Color option
    .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[0]])) // 19 White value
    .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[1]])) // 20 Black value
    .mockReturnValueOnce(makeInsertChainNoReturn());                  // 21 productVariants

  // Update designs.productId
  mockDbUpdate.mockReturnValue(makeUpdateChain());                  // 14
}

// ── Test suites ───────────────────────────────────────────────────────────────

describe('runPublisher — happy path', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupHappyPath();
  });

  it('returns productId, slug, and publicUrl', async () => {
    const result = await runPublisher(BASE_INPUT);
    expect(result.productId).toBe(500);
    expect(typeof result.slug).toBe('string');
    expect(result.slug.length).toBeGreaterThan(0);
    expect(result.publicUrl).toMatch(/^https:\/\//);
  });

  it('slug contains slugified slogan', async () => {
    const result = await runPublisher(BASE_INPUT);
    expect(result.slug).toContain('maga-mommy');
  });

  it('slug contains week tag', async () => {
    const result = await runPublisher(BASE_INPUT);
    // weekOf = 2025-01-06 → 2025-w01 or w02
    expect(result.slug).toMatch(/2025-w\d{2}/);
  });

  it('publicUrl uses vercelDomain when available', async () => {
    const result = await runPublisher(BASE_INPUT);
    expect(result.publicUrl).toContain('magamommy.vercel.app');
  });

  it('publicUrl contains /shop/<slug>', async () => {
    const result = await runPublisher(BASE_INPUT);
    expect(result.publicUrl).toContain('/shop/');
    expect(result.publicUrl).toContain(result.slug);
  });

  it('calls db.insert for products', async () => {
    await runPublisher(BASE_INPUT);
    expect(mockDbInsert).toHaveBeenCalled();
  });

  it('calls db.update to reassign design to new product', async () => {
    await runPublisher(BASE_INPUT);
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});

describe('runPublisher — host resolution', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  function setupWithSite(site: { subdomain: string | null; vercelDomain: string | null; domain: string | null }) {
    // Re-run happy path but override the last select (clientWebsites)
    setupHappyPath();
    // The clientWebsites select is the last one; we need to override it.
    // Reset the last queued select and re-queue with our site.
    // Since setupHappyPath already queued it, we need to override by adding
    // another mock at the end. mockReturnValueOnce is FIFO so we push a new one —
    // but the slot is already consumed. Instead, rebuild selects manually.
    vi.resetAllMocks();

    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))
      .mockReturnValueOnce(makeSelectChain([MOCK_TEMPLATE_PRODUCT]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([MOCK_SIZE_OPTION, MOCK_COLOR_OPTION]))
      .mockReturnValueOnce(makeSelectChain(MOCK_SIZE_VALUES))
      .mockReturnValueOnce(makeSelectChain(MOCK_COLOR_VALUES))
      .mockReturnValueOnce(makeSelectChain([MOCK_CATEGORY]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([site]));

    mockDbInsert
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_PRODUCT]))
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_OPTION]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[0]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[1]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_OPTION]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[0]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[1]]))
      .mockReturnValueOnce(makeInsertChainNoReturn());

    mockDbUpdate.mockReturnValue(makeUpdateChain());
  }

  it('uses vercelDomain when set', async () => {
    setupWithSite({ subdomain: 'mm', vercelDomain: 'mm.vercel.app', domain: null });
    const result = await runPublisher(BASE_INPUT);
    expect(result.publicUrl).toContain('mm.vercel.app');
  });

  it('uses custom domain when vercelDomain is null', async () => {
    setupWithSite({ subdomain: 'mm', vercelDomain: null, domain: 'magamommy.com' });
    const result = await runPublisher(BASE_INPUT);
    expect(result.publicUrl).toContain('magamommy.com');
  });

  it('uses subdomain fallback when vercelDomain and domain are null', async () => {
    setupWithSite({ subdomain: 'mm', vercelDomain: null, domain: null });
    const result = await runPublisher(BASE_INPUT);
    expect(result.publicUrl).toContain('mm.simplerdevelopment.com');
  });

  it('throws when no host can be resolved', async () => {
    setupWithSite({ subdomain: null, vercelDomain: null, domain: null });
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      'has no vercelDomain, domain, or subdomain',
    );
  });
});

describe('runPublisher — concept not found', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));
  });

  it('throws [publisher] concept not found', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      '[publisher] concept not found id=10',
    );
  });
});

describe('runPublisher — concept websiteId mismatch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect.mockReturnValueOnce(
      makeSelectChain([{ ...MOCK_CONCEPT, websiteId: 999 }]),
    );
  });

  it('throws websiteId mismatch error', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      '[publisher] concept websiteId mismatch',
    );
  });
});

describe('runPublisher — design not found', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([]));
  });

  it('throws [publisher] design not found', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      '[publisher] design not found id=uuid-design-abc',
    );
  });
});

describe('runPublisher — design has no renderedUrl', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([{ ...MOCK_DESIGN, renderedUrl: null }]));
  });

  it('throws [publisher] design has no renderedUrl', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      'has no renderedUrl',
    );
  });
});

describe('runPublisher — template product not found', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))
      .mockReturnValueOnce(makeSelectChain([]));
  });

  it('throws [publisher] template product not found', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      '[publisher] template product not found id=5',
    );
  });
});

describe('runPublisher — template product websiteId mismatch', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))
      .mockReturnValueOnce(
        makeSelectChain([{ ...MOCK_TEMPLATE_PRODUCT, websiteId: 999 }]),
      );
  });

  it('throws websiteId mismatch for template product', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      '[publisher] template product websiteId mismatch',
    );
  });
});

describe('runPublisher — template has no productOptions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))
      .mockReturnValueOnce(makeSelectChain([MOCK_TEMPLATE_PRODUCT]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES)) // surfaces log
      .mockReturnValueOnce(makeSelectChain([])); // options empty
  });

  it('throws template product has no productOptions', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      'has no productOptions',
    );
  });
});

describe('runPublisher — missing Size or Color option', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Provide only a single option that's not Size or Color
    const WEIRD_OPTION = { id: 20, productId: 5, name: 'Material', order: 0 };
    const WEIRD_VALUES = [{ id: 100, optionId: 20, value: 'Cotton', label: null, order: 0 }];
    const NEW_WEIRD_OPTION = { id: 30, productId: 500, name: 'Material', order: 0 };

    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))           // concept
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))            // design
      .mockReturnValueOnce(makeSelectChain([MOCK_TEMPLATE_PRODUCT]))  // template product
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES)) // surfaces (logging)
      .mockReturnValueOnce(makeSelectChain([WEIRD_OPTION]))           // options
      .mockReturnValueOnce(makeSelectChain(WEIRD_VALUES))             // values for Material
      .mockReturnValueOnce(makeSelectChain([MOCK_CATEGORY]))          // category
      .mockReturnValueOnce(makeSelectChain([]))                       // slug free
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES)); // surface clone projection

    mockDbInsert
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_PRODUCT]))       // products
      .mockReturnValueOnce(makeInsertChainNoReturn())                  // productImages
      .mockReturnValueOnce(makeInsertChainNoReturn())                  // productDesignSurfaces clone
      .mockReturnValueOnce(makeInsertChain([NEW_WEIRD_OPTION]))       // new Material option
      .mockReturnValueOnce(makeInsertChain([{ id: 300, optionId: 30, value: 'Cotton' }])); // value

    mockDbUpdate.mockReturnValue(makeUpdateChain());
  });

  it('throws missing Size or Color option error', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      'missing Size or Color option',
    );
  });
});

describe('runPublisher — slug collision exhaustion', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Return a row for every slug collision check → all 5 attempts fail
    const existingSlug = { id: 777 };
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))
      .mockReturnValueOnce(makeSelectChain([MOCK_TEMPLATE_PRODUCT]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([MOCK_SIZE_OPTION, MOCK_COLOR_OPTION]))
      .mockReturnValueOnce(makeSelectChain(MOCK_SIZE_VALUES))
      .mockReturnValueOnce(makeSelectChain(MOCK_COLOR_VALUES))
      .mockReturnValueOnce(makeSelectChain([MOCK_CATEGORY]))
      // 5 slug collision attempts all return a hit
      .mockReturnValueOnce(makeSelectChain([existingSlug]))
      .mockReturnValueOnce(makeSelectChain([existingSlug]))
      .mockReturnValueOnce(makeSelectChain([existingSlug]))
      .mockReturnValueOnce(makeSelectChain([existingSlug]))
      .mockReturnValueOnce(makeSelectChain([existingSlug]));
  });

  it('throws could not find unique slug after maxAttempts', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      'could not find unique slug',
    );
  });
});

describe('runPublisher — clientWebsites not found', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))
      .mockReturnValueOnce(makeSelectChain([MOCK_TEMPLATE_PRODUCT]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([MOCK_SIZE_OPTION, MOCK_COLOR_OPTION]))
      .mockReturnValueOnce(makeSelectChain(MOCK_SIZE_VALUES))
      .mockReturnValueOnce(makeSelectChain(MOCK_COLOR_VALUES))
      .mockReturnValueOnce(makeSelectChain([MOCK_CATEGORY]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([])); // no site row

    mockDbInsert
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_PRODUCT]))
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_OPTION]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[0]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[1]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_OPTION]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[0]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[1]]))
      .mockReturnValueOnce(makeInsertChainNoReturn());

    mockDbUpdate.mockReturnValue(makeUpdateChain());
  });

  it('throws clientWebsites row not found', async () => {
    await expect(runPublisher(BASE_INPUT)).rejects.toThrow(
      'clientWebsites row not found',
    );
  });
});

describe('runPublisher — category find-or-create (create branch)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))
      .mockReturnValueOnce(makeSelectChain([MOCK_TEMPLATE_PRODUCT]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([MOCK_SIZE_OPTION, MOCK_COLOR_OPTION]))
      .mockReturnValueOnce(makeSelectChain(MOCK_SIZE_VALUES))
      .mockReturnValueOnce(makeSelectChain(MOCK_COLOR_VALUES))
      .mockReturnValueOnce(makeSelectChain([]))                       // category NOT found
      .mockReturnValueOnce(makeSelectChain([]))                       // slug free
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([MOCK_SITE]));

    mockDbInsert
      .mockReturnValueOnce(makeInsertChain([MOCK_CATEGORY]))          // category insert (create)
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_PRODUCT]))
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_OPTION]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[0]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[1]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_OPTION]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[0]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[1]]))
      .mockReturnValueOnce(makeInsertChainNoReturn());

    mockDbUpdate.mockReturnValue(makeUpdateChain());
  });

  it('creates the weekly-drops category when not found and still returns a result', async () => {
    const result = await runPublisher(BASE_INPUT);
    expect(result.productId).toBe(500);
    // category insert was called (first insert call)
    expect(mockDbInsert).toHaveBeenCalled();
  });
});

describe('runPublisher — Color option variant (British spelling)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const COLOUR_OPTION = { id: 21, productId: 5, name: 'Colour', order: 1 };
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))
      .mockReturnValueOnce(makeSelectChain([MOCK_TEMPLATE_PRODUCT]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([MOCK_SIZE_OPTION, COLOUR_OPTION]))
      .mockReturnValueOnce(makeSelectChain(MOCK_SIZE_VALUES))
      .mockReturnValueOnce(makeSelectChain(MOCK_COLOR_VALUES))
      .mockReturnValueOnce(makeSelectChain([MOCK_CATEGORY]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([MOCK_SITE]));

    mockDbInsert
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_PRODUCT]))
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_OPTION]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[0]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_VALUES[1]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_OPTION]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[0]]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_VALUES[1]]))
      .mockReturnValueOnce(makeInsertChainNoReturn());

    mockDbUpdate.mockReturnValue(makeUpdateChain());
  });

  it('accepts "Colour" (British spelling) as the color option', async () => {
    const result = await runPublisher(BASE_INPUT);
    expect(result.productId).toBe(500);
  });
});

describe('runPublisher — formatWeek helper (via slug)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    setupHappyPath();
  });

  it('includes year in the slug', async () => {
    const result = await runPublisher(BASE_INPUT);
    expect(result.slug).toContain('2025');
  });

  it('includes w-prefix week tag in the slug', async () => {
    const result = await runPublisher(BASE_INPUT);
    expect(result.slug).toMatch(/-w\d{2}/);
  });
});

describe('runPublisher — zero variant rows (no values)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Size and Color options exist but have no values → 0 variants
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([MOCK_CONCEPT]))
      .mockReturnValueOnce(makeSelectChain([MOCK_DESIGN]))
      .mockReturnValueOnce(makeSelectChain([MOCK_TEMPLATE_PRODUCT]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([MOCK_SIZE_OPTION, MOCK_COLOR_OPTION]))
      .mockReturnValueOnce(makeSelectChain([]))  // size values empty
      .mockReturnValueOnce(makeSelectChain([]))  // color values empty
      .mockReturnValueOnce(makeSelectChain([MOCK_CATEGORY]))
      .mockReturnValueOnce(makeSelectChain([]))
      .mockReturnValueOnce(makeSelectChainAlways(MOCK_TEMPLATE_SURFACES))
      .mockReturnValueOnce(makeSelectChain([MOCK_SITE]));

    mockDbInsert
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_PRODUCT]))
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChainNoReturn())
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_SIZE_OPTION]))
      .mockReturnValueOnce(makeInsertChain([MOCK_NEW_COLOR_OPTION]))
      // no variant insert because 0 rows
      ;

    mockDbUpdate.mockReturnValue(makeUpdateChain());
  });

  it('returns successfully even when no variants are generated', async () => {
    const result = await runPublisher(BASE_INPUT);
    expect(result.productId).toBe(500);
  });
});
