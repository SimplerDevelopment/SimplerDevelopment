// Email batching — chunking and Resend batch-result mapping.

import { describe, it, expect } from 'vitest';
import { EMAIL_BATCH_SIZE, batchResultAt, chunk } from '@/lib/email/batch';

describe('chunk', () => {
  it('splits into full groups plus a remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single group when everything fits', () => {
    expect(chunk([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it('returns no groups for an empty list', () => {
    expect(chunk([])).toEqual([]);
  });

  it('defaults to the Resend batch limit', () => {
    expect(EMAIL_BATCH_SIZE).toBe(100);
    const items = Array.from({ length: 250 }, (_, i) => i);
    const groups = chunk(items);
    expect(groups).toHaveLength(3);
    expect(groups[0]).toHaveLength(100);
    expect(groups[2]).toHaveLength(50);
  });

  it('rejects non-positive sizes', () => {
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('batchResultAt', () => {
  it('maps an id to success', () => {
    expect(batchResultAt([{ id: 'a' }, { id: 'b' }], [], 1)).toEqual({
      data: { id: 'b' },
      error: null,
    });
  });

  it('maps a permissive-validation error to failure', () => {
    expect(batchResultAt([{ id: 'a' }], [{ index: 0, message: 'bad address' }], 0)).toEqual({
      data: null,
      error: { message: 'bad address' },
    });
  });

  it('treats a missing id as failure', () => {
    expect(batchResultAt([null], [], 0)).toEqual({
      data: null,
      error: { message: 'Batch item returned no id' },
    });
  });
});
