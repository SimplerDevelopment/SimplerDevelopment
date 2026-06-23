// @vitest-environment node
/**
 * Unit tests for the notification-preferences gate.
 *
 * The gate is the load-bearing piece: it sits inside createCrmNotification /
 * notifyAllClientUsers and decides whether to insert a notification row at
 * all (or whether to mark it `digest: true` for the future digest cron). We
 * stub the db chain it uses (select → from → where → limit) so we don't need
 * a live Postgres for the table-driven cases.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return { limitMock, whereMock, fromMock, selectMock };
});

vi.mock('@/lib/db', () => ({
  db: {
    select: mocks.selectMock,
  },
}));

import { shouldDeliverNotification } from '@/lib/crm/notifications';

const { limitMock, whereMock, fromMock, selectMock } = mocks;

beforeEach(() => {
  selectMock.mockClear();
  fromMock.mockClear();
  whereMock.mockClear();
  limitMock.mockReset();
});

describe('shouldDeliverNotification — preference gate (table-driven)', () => {
  type Case = {
    label: string;
    rows: Array<{ delivery: 'instant' | 'digest_daily' | 'off' }>;
    expected: { deliver: boolean; mode: 'instant' | 'digest_daily' | 'off' };
  };

  const cases: Case[] = [
    {
      label: 'no row → instant (default, non-breaking)',
      rows: [],
      expected: { deliver: true, mode: 'instant' },
    },
    {
      label: 'row.delivery = instant → deliver as instant',
      rows: [{ delivery: 'instant' }],
      expected: { deliver: true, mode: 'instant' },
    },
    {
      label: 'row.delivery = off → skip insert',
      rows: [{ delivery: 'off' }],
      expected: { deliver: false, mode: 'off' },
    },
    {
      label: 'row.delivery = digest_daily → deliver with digest mode',
      rows: [{ delivery: 'digest_daily' }],
      expected: { deliver: true, mode: 'digest_daily' },
    },
  ];

  for (const c of cases) {
    it(c.label, async () => {
      limitMock.mockResolvedValueOnce(c.rows);
      const result = await shouldDeliverNotification(1, 2, 'mention');
      expect(result).toEqual(c.expected);
      // Sanity: query was scoped (select → from → where → limit).
      expect(selectMock).toHaveBeenCalledTimes(1);
      expect(whereMock).toHaveBeenCalledTimes(1);
      expect(limitMock).toHaveBeenCalledWith(1);
    });
  }
});
