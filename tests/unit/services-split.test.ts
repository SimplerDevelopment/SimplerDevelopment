import { describe, it, expect } from 'vitest';
import { splitServices } from '@/lib/services/split';

describe('splitServices (PUX-193)', () => {
  it('splits the catalogue by the client\'s active ids, keeping order', () => {
    const r = splitServices([{ id: 1 }, { id: 2 }, { id: 3 }], new Set([2]));
    expect(r.active.map((s) => s.id)).toEqual([2]);
    expect(r.available.map((s) => s.id)).toEqual([1, 3]);
  });
});
