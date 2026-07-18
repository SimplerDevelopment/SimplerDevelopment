// @vitest-environment node
/**
 * Unit tests for the surveys-zero-responses cron handler.
 *
 * Scope: auth gate (Vercel header / CRON_SECRET fallback), response envelope,
 * the 14-day dedupe branch, and the createCrmNotification payload shape. Real
 * SQL execution is covered at the integration layer where a Postgres is live.
 *
 * The route uses Drizzle's chained query-builder so the db mock returns a
 * thenable that resolves to whatever rows the test sets via __setRows() —
 * once for the candidate-survey query, then once per dedupe lookup.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Row = Record<string, unknown>;
const queue: Row[][] = [];

function makeChain() {
  // Each chain method returns the same builder; awaiting it shifts a result
  // off the queue. Matches the shape used by the route:
  //   db.select(...).from(...).where(...)
  //   db.select(...).from(...).where(...).limit(1)
  const builder: {
    select: typeof builder;
    from: typeof builder;
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

describe('GET /api/cron/surveys-zero-responses', () => {
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
    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(new Request('http://x/api/cron/surveys-zero-responses'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    queue.push([]); // candidate query: no surveys at risk
    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(
      new Request('http://x/api/cron/surveys-zero-responses', {
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
      };
    };
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ scanned: 0, matched: 0, notified: 0, skippedDup: 0 });
    expect(typeof json.data.durationMs).toBe('number');
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    queue.push([]);
    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(
      new Request('http://x/api/cron/surveys-zero-responses', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('skips dedupe when an existing notification is within the 14-day window', async () => {
    delete process.env.CRON_SECRET;
    queue.push([
      { id: 42, title: 'Customer NPS', clientId: 7, createdBy: 11, createdAt: new Date() },
    ]);
    queue.push([{ id: 999 }]); // dedupe lookup hits — recent notification exists

    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(
      new Request('http://x/api/cron/surveys-zero-responses', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; matched: number; notified: number; skippedDup: number };
    };
    expect(json.data).toMatchObject({ scanned: 1, matched: 1, notified: 0, skippedDup: 1 });
    expect(createCrmNotification).not.toHaveBeenCalled();
  });

  it('files a notification with the documented payload shape when no recent dup exists', async () => {
    delete process.env.CRON_SECRET;
    queue.push([
      { id: 42, title: 'Customer NPS', clientId: 7, createdBy: 11, createdAt: new Date() },
    ]);
    queue.push([]); // dedupe lookup misses — clear to notify

    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(
      new Request('http://x/api/cron/surveys-zero-responses', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; matched: number; notified: number; skippedDup: number };
    };
    expect(json.data).toMatchObject({ scanned: 1, matched: 1, notified: 1, skippedDup: 0 });
    expect(createCrmNotification).toHaveBeenCalledTimes(1);
    expect(createCrmNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: 7,
        userId: 11,
        type: 'survey_zero_responses',
        entityType: 'survey',
        entityId: 42,
        title: expect.stringContaining('Customer NPS'),
        body: expect.any(String),
      }),
    );
  });

  it('skips a candidate with a null owner without crashing', async () => {
    delete process.env.CRON_SECRET;
    queue.push([
      { id: 42, title: 'Orphan Survey', clientId: 7, createdBy: null, createdAt: new Date() },
    ]);
    // No dedupe lookup is performed for null-owner candidates.

    const { GET } = await import('@/app/api/cron/surveys-zero-responses/route');
    const res = await GET(
      new Request('http://x/api/cron/surveys-zero-responses', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { scanned: number; matched: number; notified: number; skippedDup: number; skippedNoOwner?: number };
    };
    expect(json.data).toMatchObject({ scanned: 1, matched: 1, notified: 0, skippedDup: 0 });
    expect(json.data.skippedNoOwner).toBe(1);
    expect(createCrmNotification).not.toHaveBeenCalled();
  });
});
