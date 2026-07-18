// @vitest-environment node
/**
 * Unit tests for the brain-empty-old-trash cron handler.
 *
 * Scope mirrors `cron-stale-crm-deals.test.ts` and
 * `cron-failing-automations-notify.test.ts`: the SQL + S3 cleanup paths need
 * a live Postgres and are exercised at the integration layer. Here we lock in
 * the auth gate (Vercel header / CRON_SECRET), the response envelope shape,
 * the per-tenant fan-out, and the per-tenant try/catch isolation — by
 * stubbing the DB module and the `purgeOldTrash` helper before importing the
 * route.
 *
 * Mock setup is self-contained (db.select chain + purgeOldTrash) so this
 * file can pass standalone — sibling cron tests have been observed to flake
 * in parallel runs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const purgeOldTrashMock = vi.fn();

// Chainable select() stub — supports `.from(...)` returning a thenable that
// resolves to the rows array. The cron only does `db.select({ id }).from(clients)`
// without any further filters, so this minimal shape is sufficient.
const selectChainState: { rows: Array<{ id: number }> } = { rows: [] };

const dbMock = {
  select: vi.fn(() => ({
    from: vi.fn(() => Promise.resolve(selectChainState.rows)),
  })),
};

vi.mock('@/lib/db', () => ({
  db: dbMock,
}));

vi.mock('@/lib/brain/notes', () => ({
  purgeOldTrash: purgeOldTrashMock,
}));

describe('GET /api/cron/brain-empty-old-trash — auth + envelope', () => {
  const ORIGINAL_ENV = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.resetModules();
    selectChainState.rows = [];
    dbMock.select.mockClear();
    purgeOldTrashMock.mockReset();
    purgeOldTrashMock.mockResolvedValue({ purged: 0, attachmentsDeleted: 0 });
  });

  afterEach(() => {
    process.env.CRON_SECRET = ORIGINAL_ENV;
  });

  it('rejects unauthenticated requests when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/brain-empty-old-trash/route');
    const res = await GET(new Request('http://x/api/cron/brain-empty-old-trash'));
    expect(res.status).toBe(401);
    const json = (await res.json()) as { success: boolean };
    expect(json.success).toBe(false);
  });

  it('accepts the Vercel cron header without bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/brain-empty-old-trash/route');
    const res = await GET(
      new Request('http://x/api/cron/brain-empty-old-trash', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      success: boolean;
      data: {
        clientsScanned: number;
        totalPurged: number;
        totalAttachmentsDeleted: number;
        durationMs: number;
        retentionDays: number;
      };
    };
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({
      clientsScanned: 0,
      totalPurged: 0,
      totalAttachmentsDeleted: 0,
      retentionDays: 90,
    });
    expect(typeof json.data.durationMs).toBe('number');
  });

  it('accepts a matching bearer token', async () => {
    process.env.CRON_SECRET = 'shh';
    const { GET } = await import('@/app/api/cron/brain-empty-old-trash/route');
    const res = await GET(
      new Request('http://x/api/cron/brain-empty-old-trash', {
        headers: { authorization: 'Bearer shh' },
      }),
    );
    expect(res.status).toBe(200);
  });

  it('iterates every client and accumulates per-tenant counts', async () => {
    process.env.CRON_SECRET = 'shh';
    selectChainState.rows = [{ id: 1 }, { id: 2 }, { id: 3 }];

    purgeOldTrashMock
      .mockResolvedValueOnce({ purged: 4, attachmentsDeleted: 1 })
      .mockResolvedValueOnce({ purged: 0, attachmentsDeleted: 0 })
      .mockResolvedValueOnce({ purged: 7, attachmentsDeleted: 3 });

    const { GET } = await import('@/app/api/cron/brain-empty-old-trash/route');
    const res = await GET(
      new Request('http://x/api/cron/brain-empty-old-trash', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      success: boolean;
      data: {
        clientsScanned: number;
        totalPurged: number;
        totalAttachmentsDeleted: number;
        retentionDays: number;
      };
    };
    expect(json.data).toMatchObject({
      clientsScanned: 3,
      totalPurged: 11,
      totalAttachmentsDeleted: 4,
      retentionDays: 90,
    });

    expect(purgeOldTrashMock).toHaveBeenCalledTimes(3);
    expect(purgeOldTrashMock).toHaveBeenNthCalledWith(1, 1, 90);
    expect(purgeOldTrashMock).toHaveBeenNthCalledWith(2, 2, 90);
    expect(purgeOldTrashMock).toHaveBeenNthCalledWith(3, 3, 90);
  });

  it("isolates a single tenant's failure so the sweep continues", async () => {
    process.env.CRON_SECRET = 'shh';
    selectChainState.rows = [{ id: 100 }, { id: 200 }, { id: 300 }];

    purgeOldTrashMock
      .mockResolvedValueOnce({ purged: 2, attachmentsDeleted: 0 })
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce({ purged: 5, attachmentsDeleted: 1 });

    // Silence the route's console.error noise in test output.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { GET } = await import('@/app/api/cron/brain-empty-old-trash/route');
    const res = await GET(
      new Request('http://x/api/cron/brain-empty-old-trash', {
        headers: { 'x-vercel-cron': '1' },
      }),
    );
    expect(res.status).toBe(200);

    const json = (await res.json()) as {
      success: boolean;
      data: {
        clientsScanned: number;
        totalPurged: number;
        totalAttachmentsDeleted: number;
        failures: Array<{ clientId: number; reason: string }>;
      };
    };
    // All three clients counted; only the two healthy ones contribute purges.
    expect(json.data.clientsScanned).toBe(3);
    expect(json.data.totalPurged).toBe(7);
    expect(json.data.totalAttachmentsDeleted).toBe(1);
    expect(json.data.failures).toEqual([{ clientId: 200, reason: 'connection reset' }]);

    errSpy.mockRestore();
  });
});
