// @vitest-environment node
/**
 * Unit tests for submitPODOrder (lib/fulfillment/pod.ts).
 *
 * The behaviour under test is a money path: a Printful submission spends real
 * money on real garments. The critical guarantee is that we NEVER submit a
 * design mockup as a print file — `compositeArtworkOnShirt` output is artwork
 * stamped onto a blank product photo, so printing it yields a shirt with a
 * picture of a shirt on it.
 *
 * `submitPODOrder(orderId, db)` takes its db as a parameter, so we inject a
 * fake rather than mocking '@/lib/db'. The fake models drizzle's chained
 * builder: every chain step returns a thenable resolving to the next queued
 * result, consumed FIFO — one entry per terminal db call.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  decryptApiKey: vi.fn(() => 'pf_decrypted_key'),
  createOrder: vi.fn(),
  constructed: [] as unknown[],
}));

// pod.ts imports '@/lib/db' at module level, which throws without
// DATABASE_URL. The real db is injected as a parameter, so a stub is enough.
vi.mock('@/lib/db', () => ({ db: {} }));

vi.mock('@/lib/crypto/api-key', () => ({
  decryptApiKey: mocks.decryptApiKey,
}));

vi.mock('@/lib/fulfillment/providers/printful', () => ({
  PrintfulProvider: class {
    constructor(opts: unknown) {
      mocks.constructed.push(opts);
    }
    createOrder = mocks.createOrder;
  },
}));

const { submitPODOrder, printfulPlacement } = await import('@/lib/fulfillment/pod');

describe('printfulPlacement', () => {
  it('maps our catalog side slugs onto Printful placements', () => {
    expect(printfulPlacement('front')).toBe('front');
    expect(printfulPlacement('back')).toBe('back');
    expect(printfulPlacement('sleeveleft')).toBe('left_sleeve');
    expect(printfulPlacement('sleeveright')).toBe('right_sleeve');
  });

  it('passes an unknown side through rather than dropping it', () => {
    // Better to let Printful reject a placement it doesn't know than to
    // silently omit artwork the customer paid for.
    expect(printfulPlacement('hood')).toBe('hood');
  });
});

/** Build a fake drizzle db that returns `queue` entries in FIFO order. */
function makeDb(queue: unknown[]) {
  const updates: Array<Record<string, unknown>> = [];

  function next() {
    if (queue.length === 0) {
      throw new Error('dbQueue exhausted — handler made more db calls than expected');
    }
    return queue.shift();
  }

  function thenable(resolver: () => unknown): Record<string, unknown> {
    return {
      then: (onFulfilled: (v: unknown) => unknown) =>
        Promise.resolve(resolver()).then(onFulfilled),
      from: vi.fn(() => thenable(resolver)),
      where: vi.fn(() => thenable(resolver)),
      limit: vi.fn(() => thenable(resolver)),
    };
  }

  const db = {
    select: vi.fn(() => thenable(next)),
    update: vi.fn(() => ({
      set: vi.fn((patch: Record<string, unknown>) => {
        updates.push(patch);
        return { where: vi.fn(() => Promise.resolve()) };
      }),
    })),
    __updates: updates,
  };

  return db as unknown as Parameters<typeof submitPODOrder>[1] & {
    __updates: Array<Record<string, unknown>>;
  };
}

const PAID_ORDER = {
  id: 42,
  websiteId: 7,
  printfulOrderId: null,
  customerName: 'Ada Lovelace',
  customerEmail: 'ada@example.com',
  customerPhone: null,
  shippingMethod: 'STANDARD',
  shippingAddress: {
    line1: '1 Analytical Way',
    line2: null,
    city: 'London',
    state: 'LDN',
    country: 'GB',
    postalCode: 'E1 6AN',
  },
};

const PRINTFUL_SETTINGS = {
  websiteId: 7,
  fulfillmentProvider: 'printful',
  printfulApiKeyEncrypted: 'ciphertext',
  printfulStoreId: '12345',
};

beforeEach(() => {
  mocks.createOrder.mockReset();
  mocks.decryptApiKey.mockClear();
  mocks.constructed.length = 0;
});

describe('submitPODOrder — print-file safety', () => {
  it('refuses to submit an item with no print-ready file', async () => {
    const db = makeDb([
      [PAID_ORDER],
      [PRINTFUL_SETTINGS],
      [{ id: 900, orderId: 42, productName: 'Tee', quantity: 1, unitPrice: 2500, variantId: 5, productId: 1, printReadyUrl: null, designId: 'a-design-uuid' }],
      [{ printfulVariantId: 4012 }], // variant lookup succeeds
    ]);

    await expect(submitPODOrder(42, db)).rejects.toThrow(/no print-ready file/i);

    // The guarantee that matters: Printful was never called.
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('submits one Printful file per designed side', async () => {
    mocks.createOrder.mockResolvedValue({ id: 778, status: 'pending' });

    const db = makeDb([
      [PAID_ORDER],
      [PRINTFUL_SETTINGS],
      [{
        id: 901, orderId: 42, productName: 'Tee', quantity: 1, unitPrice: 2500,
        variantId: 5, productId: 1, printReadyUrl: 'https://s3/front.png', designId: null,
        printFiles: { front: 'https://s3/front.png', back: 'https://s3/back.png', sleeveleft: 'https://s3/sl.png' },
      }],
      [{ printfulVariantId: 4012 }],
    ]);

    await submitPODOrder(42, db);

    const submitted = mocks.createOrder.mock.calls[0][0] as {
      items: Array<{ files: Array<{ type: string; url: string }> }>;
    };
    const files = submitted.items[0].files;
    expect(files).toHaveLength(3);
    expect(files.map(f => f.type).sort()).toEqual(['back', 'front', 'left_sleeve']);
    expect(files.find(f => f.type === 'back')?.url).toBe('https://s3/back.png');
  });

  it('submits when a genuine print-ready file is present', async () => {
    mocks.createOrder.mockResolvedValue({ id: 777, status: 'pending' });

    const db = makeDb([
      [PAID_ORDER],
      [PRINTFUL_SETTINGS],
      [{ id: 900, orderId: 42, productName: 'Tee', quantity: 2, unitPrice: 2500, variantId: 5, productId: 1, printReadyUrl: 'https://s3/print/front-300dpi.png', designId: null }],
      [{ printfulVariantId: 4012 }],
    ]);

    await submitPODOrder(42, db);

    expect(mocks.createOrder).toHaveBeenCalledTimes(1);
    const submitted = mocks.createOrder.mock.calls[0][0] as {
      items: Array<{ variant_id: number; files: Array<{ url: string }> }>;
      externalId: string;
    };
    expect(submitted.items[0].variant_id).toBe(4012);
    expect(submitted.items[0].files[0].url).toBe('https://s3/print/front-300dpi.png');
    expect(submitted.externalId).toBe('42');

    // Success path records the Printful order id.
    expect(db.__updates.some(u => u.printfulOrderId === '777')).toBe(true);
  });

  it('is idempotent — an already-submitted order is a no-op', async () => {
    const db = makeDb([[{ ...PAID_ORDER, printfulOrderId: '777' }]]);

    await submitPODOrder(42, db);

    expect(mocks.createOrder).not.toHaveBeenCalled();
    expect(db.__updates).toHaveLength(0);
  });

  it('does nothing when the store is not on Printful fulfilment', async () => {
    const db = makeDb([
      [PAID_ORDER],
      [{ ...PRINTFUL_SETTINGS, fulfillmentProvider: 'manual' }],
    ]);

    await submitPODOrder(42, db);

    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it('records the failure on the order when Printful rejects the submission', async () => {
    mocks.createOrder.mockRejectedValue(new Error('Printful: invalid variant'));

    const db = makeDb([
      [PAID_ORDER],
      [PRINTFUL_SETTINGS],
      [{ id: 900, orderId: 42, productName: 'Tee', quantity: 1, unitPrice: 2500, variantId: 5, productId: 1, printReadyUrl: 'https://s3/print/front.png', designId: null }],
      [{ printfulVariantId: 4012 }],
    ]);

    await expect(submitPODOrder(42, db)).rejects.toThrow(/invalid variant/);

    expect(db.__updates.some(u => u.printfulFulfillmentStatus === 'failed')).toBe(true);
  });
});
