// @vitest-environment node
/**
 * Unit tests for `recordAiUsage` in lib/ai/audit.ts. The function
 * does a single `db.insert(usageMeterEvents).values(...)` call with
 * a swallow-on-failure try/catch. Mocks the insert chain to assert
 * the value payload, and forces a throw to exercise the warn-and-swallow.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

interface InsertRow {
  clientId: number;
  resource: string;
  period: string;
  amount: string;
  source: string;
}

const recordedInserts: InsertRow[] = [];
let nextInsertThrows: Error | null = null;

vi.mock('@/lib/db/schema', () => ({
  usageMeterEvents: { __table: 'usageMeterEvents' },
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: (v: InsertRow) => {
        if (nextInsertThrows) {
          const err = nextInsertThrows;
          nextInsertThrows = null;
          return Promise.reject(err);
        }
        recordedInserts.push(v);
        return Promise.resolve();
      },
    }),
  },
}));

const { recordAiUsage } = await import('@/lib/ai/audit');

// Stable spy + mockClear between tests — re-spying in beforeEach causes
// the underlying spies to stack on console.warn, which inflates call counts.
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

beforeEach(() => {
  recordedInserts.length = 0;
  nextInsertThrows = null;
  warnSpy.mockClear();
});

describe('recordAiUsage — happy path', () => {
  it('inserts a usage_meter_events row with the expected shape', async () => {
    await recordAiUsage({
      clientId: 42,
      source: 'byok',
      tokens: 1234,
      period: '2026-05',
    });
    expect(recordedInserts).toHaveLength(1);
    expect(recordedInserts[0]).toEqual({
      clientId: 42,
      resource: 'ai_tokens',
      period: '2026-05',
      amount: '1234',
      source: 'byok',
    });
  });

  it('stringifies tokens for the numeric column', async () => {
    await recordAiUsage({ clientId: 1, source: 'platform', tokens: 0, period: '2026-01' });
    expect(recordedInserts[0].amount).toBe('0');
    expect(typeof recordedInserts[0].amount).toBe('string');
  });

  it('accepts both byok and platform sources', async () => {
    await recordAiUsage({ clientId: 1, source: 'byok', tokens: 1, period: '2026-01' });
    await recordAiUsage({ clientId: 1, source: 'platform', tokens: 1, period: '2026-01' });
    expect(recordedInserts.map((r) => r.source)).toEqual(['byok', 'platform']);
  });
});

describe('recordAiUsage — period default', () => {
  it('defaults period to current UTC month (YYYY-MM) when not provided', async () => {
    await recordAiUsage({ clientId: 1, source: 'byok', tokens: 1 });
    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    expect(recordedInserts[0].period).toBe(`${yyyy}-${mm}`);
  });

  it('honors an explicit period override', async () => {
    await recordAiUsage({ clientId: 1, source: 'byok', tokens: 1, period: '1999-12' });
    expect(recordedInserts[0].period).toBe('1999-12');
  });
});

describe('recordAiUsage — error swallowing', () => {
  it('does not throw when the DB insert rejects', async () => {
    nextInsertThrows = new Error('FATAL: tablespace lost');
    // Resolves without throwing.
    await expect(
      recordAiUsage({ clientId: 7, source: 'byok', tokens: 99 }),
    ).resolves.toBeUndefined();
  });

  it('logs a warning with the failed context when the DB insert rejects', async () => {
    nextInsertThrows = new Error('FATAL: tablespace lost');
    await recordAiUsage({ clientId: 7, source: 'byok', tokens: 99 });
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const warnArgs = warnSpy.mock.calls[0];
    const message = warnArgs[0] as string;
    expect(message).toContain('[recordAiUsage] failed');
    expect(message).toContain('clientId=7');
    expect(message).toContain('source=byok');
    expect(message).toContain('tokens=99');
    expect(warnArgs[1]).toBeInstanceOf(Error);
  });

  it('records nothing when the insert fails', async () => {
    nextInsertThrows = new Error('boom');
    await recordAiUsage({ clientId: 7, source: 'byok', tokens: 99 });
    expect(recordedInserts).toHaveLength(0);
  });
});
