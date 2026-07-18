import { describe, it, expect } from 'vitest';
import { queryTags } from '@/app/api/product-categories/route';

const fixture = [
  { tag: 'Abstract', count: 100 },
  { tag: 'Art', count: 90 },
  { tag: 'Geometric', count: 80 },
  { tag: 'Colorful', count: 70 },
];

describe('queryTags', () => {
  it('paginates without a search term', () => {
    expect(queryTags(fixture, '', 0, 2)).toEqual({
      data: [fixture[0], fixture[1]],
      total: 4,
    });
    expect(queryTags(fixture, '', 2, 2)).toEqual({
      data: [fixture[2], fixture[3]],
      total: 4,
    });
  });

  it('filters case-insensitively by substring, total reflects the filtered set', () => {
    const r = queryTags(fixture, 'o', 0, 20); // matches "Geometric", "Colorful"
    expect(r.total).toBe(2);
    expect(r.data.map((t) => t.tag)).toEqual(['Geometric', 'Colorful']);
  });

  it('returns an empty slice past the end', () => {
    expect(queryTags(fixture, '', 10, 20)).toEqual({ data: [], total: 4 });
  });
});
