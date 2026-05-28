// @vitest-environment node
/**
 * Unit tests for the stuck-booking-holds cron handler.
 *
 * Scope: auth gate (Vercel header / CRON_SECRET fallback), response envelope,
 * dedupe branch, no-owner fallback, and the createCrmNotification payload
 * shape. Real SQL execution is covered at the integration layer.
 *
 * The route uses Drizzle's chained query-builder with .innerJoin(), .where(),
 * and .limit(). The db mock returns a thenable that resolves to whatever rows
 * the test queues via push() — once for the candidate query, then once per
 * dedupe lookup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;
const queue: Row[][] = [];

function makeChain() {
  const builder: {
    select: typeof builder;
    from: typeof builder;
    innerJoin: typeof builder;
    leftJoin: typeof builder;
    where: typeof builder;
    limit: typeof builder;
    then: (
      resolve: (rows: Row[]) => unknown,
      reject?: (err: unknown) => unknown,
    ) => Promise<unknown>;
  } = {} as never;
  const chain = (..._args: unknown[]) => builder;
  builder.select = chain as unknown as typeof builder;
  builder.from = chain as unknown as typeof builder;
  builder.innerJoin = chain as unknown as typeof builder;
  builder.leftJoin = chain as unknown as typeof builder;
  builder.where = chain as unknown as typeof builder;
  builder.limit = chain as unknown as typeof builder;
  builder.then = (resolve, reject) =>
    Promise.resolve(queue.shift() ?? []).then(resolve, reject);
  return builder;
}

vi.mock('@/lib/db', () => ({
  db: {
    select: (..._args: unknown[]) => makeChain(),
  },
}));

const createCrmNotification = vi.fn().mockResolvedValue({ id: 1 });
vi.mock('@/lib/crm/notifications', () => ({
  createCrmNotification: (...args: unknown[]) => createCrmNotification(...args),
}));

describe('GET /api/cron/stuck-booking-holds', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    queue.length = 0;
    createCrmNotification.mockClear();
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('rejects unauthenticated requests when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/stuck-booking-holds/route');
    const res = await GET(new Request('http://x/api/cron/stuck-booking-holds'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('rejects requests with a wrong bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/stuck-booking-holds/route');
    const res = await GET(
      new Request('http://x/api/cron/stuck-booking-holds', {
        headers: { authorization: 'Bearer nope' },
      }),
    );
    expect(res.status).toBe(401);
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    queue.push([]); // candidate query: no stuck holds
    const { GET } = await import('@/app/api/cron/stuck-booking-holds/route');
    const res = await GET(
      new Request('http://x/api/cron/stuck-booking-holds', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        scanned: number;
        matched: number;
        notified: number;
        skippedDup: number;
        durationMs: number;
        mode: string;
      };
    };
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      scanned: 0,
      matched: 0,
      notified: 0,
      skippedDup: 0,
      mode: 'preview',
    });
    expect(typeof json.data.durationMs).toBe('number');
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    queue.push([]);
    const { GET } = await import('@/app/api/cron/stuck-booking-holds/route');
    const res = await GET(
      new Request('http://x/api/cron/stuck-booking-holds', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('skips when a recent dedupe notification exists', async () => {
    delete process.env.CRON_SECRET;
    const created = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30h old
    queue.push([
      {
        bookingId: 100,
        clientId: 7,
        bookingPageId: 9,
        guestName: 'Ada Lovelace',
        guestEmail: 'ada@example.com',
        startTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        total: 12500,
        paymentStatus: 'pending',
        paidAt: null,
        stripePaymentIntentId: 'pi_123',
        createdAt: created,
        pageTitle: 'Discovery Call',
        pageOwnerUserId: 11,
        clientLegacyOwnerUserId: 22,
      },
    ]);
    queue.push([{ id: 999 }]); // dedupe lookup hits

    const { GET } = await import('@/app/api/cron/stuck-booking-holds/route');
    const res = await GET(new Request('http://x/api/cron/stuck-booking-holds'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; matched: number; notified: number; skippedDup: number };
    };
    expect(json.data).toMatchObject({
      scanned: 1,
      matched: 1,
      notified: 0,
      skippedDup: 1,
    });
    expect(createCrmNotification).not.toHaveBeenCalled();
  });

  it('files a notification with the documented payload shape when no dup exists', async () => {
    delete process.env.CRON_SECRET;
    const created = new Date(Date.now() - 30 * 60 * 60 * 1000); // 30h old
    queue.push([
      {
        bookingId: 100,
        clientId: 7,
        bookingPageId: 9,
        guestName: 'Ada Lovelace',
        guestEmail: 'ada@example.com',
        startTime: new Date('2026-06-01T12:00:00.000Z'),
        total: 12500,
        paymentStatus: 'pending',
        paidAt: null,
        stripePaymentIntentId: 'pi_123',
        createdAt: created,
        pageTitle: 'Discovery Call',
        pageOwnerUserId: 11,
        clientLegacyOwnerUserId: 22,
      },
    ]);
    queue.push([]); // dedupe miss

    const { GET } = await import('@/app/api/cron/stuck-booking-holds/route');
    const res = await GET(new Request('http://x/api/cron/stuck-booking-holds'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        scanned: number;
        matched: number;
        notified: number;
        skippedDup: number;
        mode: string;
      };
    };
    expect(json.data).toMatchObject({
      scanned: 1,
      matched: 1,
      notified: 1,
      skippedDup: 0,
      mode: 'preview',
    });
    expect(createCrmNotification).toHaveBeenCalledTimes(1);
    const call = createCrmNotification.mock.calls[0]![0] as {
      clientId: number;
      userId: number;
      type: string;
      entityType: string;
      entityId: number;
      title: string;
      body: string;
    };
    expect(call).toMatchObject({
      clientId: 7,
      userId: 11, // prefers pageOwnerUserId
      type: 'booking_hold_stuck',
      entityType: 'booking',
      entityId: 100,
    });
    expect(call.title).toContain('Booking #100');
    expect(call.body).toContain('Discovery Call');
    expect(call.body).toContain('Ada Lovelace');
    expect(call.body).toContain('ada@example.com');
    expect(call.body).toContain('$125.00');
    expect(call.body).toContain('Stripe PI: pi_123');
    expect(call.body).toContain('PREVIEW MODE');
    expect(call.body).toContain('Scheduled for: 2026-06-01T12:00:00.000Z');
  });

  it('falls back to clients.userId when pageOwnerUserId is null', async () => {
    delete process.env.CRON_SECRET;
    const created = new Date(Date.now() - 48 * 60 * 60 * 1000);
    queue.push([
      {
        bookingId: 200,
        clientId: 3,
        bookingPageId: 4,
        guestName: 'Grace Hopper',
        guestEmail: null,
        startTime: null,
        total: 0,
        paymentStatus: 'pending',
        paidAt: null,
        stripePaymentIntentId: null,
        createdAt: created,
        pageTitle: 'Strategy Session',
        pageOwnerUserId: null,
        clientLegacyOwnerUserId: 55,
      },
    ]);
    queue.push([]); // dedupe miss

    const { GET } = await import('@/app/api/cron/stuck-booking-holds/route');
    const res = await GET(new Request('http://x/api/cron/stuck-booking-holds'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; matched: number; notified: number; skippedDup: number };
    };
    expect(json.data).toMatchObject({
      scanned: 1,
      matched: 1,
      notified: 1,
      skippedDup: 0,
    });
    expect(createCrmNotification).toHaveBeenCalledTimes(1);
    const call = createCrmNotification.mock.calls[0]![0] as {
      userId: number;
      body: string;
    };
    expect(call.userId).toBe(55); // fallback
    // optional lines should be omitted when their source values are absent
    expect(call.body).not.toContain('<');
    expect(call.body).not.toContain('Scheduled for:');
    expect(call.body).not.toContain('Total:');
    expect(call.body).not.toContain('Stripe PI:');
    expect(call.body).toContain('Guest: Grace Hopper');
  });

  it('skips a candidate with no resolvable recipient', async () => {
    delete process.env.CRON_SECRET;
    queue.push([
      {
        bookingId: 300,
        clientId: 3,
        bookingPageId: 4,
        guestName: 'Orphan',
        guestEmail: null,
        startTime: null,
        total: 0,
        paymentStatus: 'pending',
        paidAt: null,
        stripePaymentIntentId: null,
        createdAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
        pageTitle: 'Mystery',
        pageOwnerUserId: null,
        clientLegacyOwnerUserId: null,
      },
    ]);
    // No dedupe lookup happens — handler continues before it.

    const { GET } = await import('@/app/api/cron/stuck-booking-holds/route');
    const res = await GET(new Request('http://x/api/cron/stuck-booking-holds'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; matched: number; notified: number; skippedDup: number };
    };
    expect(json.data).toMatchObject({
      scanned: 1,
      matched: 1,
      notified: 0,
      skippedDup: 0,
    });
    expect(createCrmNotification).not.toHaveBeenCalled();
  });

  it('handles multiple candidates with mixed outcomes', async () => {
    delete process.env.CRON_SECRET;
    const created = new Date(Date.now() - 26 * 60 * 60 * 1000);
    queue.push([
      {
        bookingId: 1,
        clientId: 7,
        bookingPageId: 9,
        guestName: 'A',
        guestEmail: null,
        startTime: null,
        total: 0,
        paymentStatus: 'pending',
        paidAt: null,
        stripePaymentIntentId: null,
        createdAt: created,
        pageTitle: 'Service A',
        pageOwnerUserId: 11,
        clientLegacyOwnerUserId: 22,
      },
      {
        bookingId: 2,
        clientId: 7,
        bookingPageId: 9,
        guestName: 'B',
        guestEmail: null,
        startTime: null,
        total: 0,
        paymentStatus: 'pending',
        paidAt: null,
        stripePaymentIntentId: null,
        createdAt: created,
        pageTitle: 'Service B',
        pageOwnerUserId: 11,
        clientLegacyOwnerUserId: 22,
      },
    ]);
    queue.push([]); // first dedupe — miss → notify
    queue.push([{ id: 99 }]); // second dedupe — hit → skip

    const { GET } = await import('@/app/api/cron/stuck-booking-holds/route');
    const res = await GET(new Request('http://x/api/cron/stuck-booking-holds'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; matched: number; notified: number; skippedDup: number };
    };
    expect(json.data).toMatchObject({
      scanned: 2,
      matched: 2,
      notified: 1,
      skippedDup: 1,
    });
    expect(createCrmNotification).toHaveBeenCalledTimes(1);
  });
});
