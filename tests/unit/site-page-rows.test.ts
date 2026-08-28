import { describe, it, expect } from 'vitest';
import { pageStatus, typeCounts } from '@/lib/sites/page-rows';

describe('PUX-184 page rows', () => {
  it('pending beats published/draft; otherwise the boolean decides', () => {
    const pending = new Set([7]);
    expect(pageStatus(true, pending, 7)).toBe('pending');
    expect(pageStatus(false, pending, 7)).toBe('pending');
    expect(pageStatus(true, pending, 8)).toBe('published');
    expect(pageStatus(false, pending, 8)).toBe('draft');
  });
  it('typeCounts tallies by postType', () => {
    expect(typeCounts([{ postType: 'page' }, { postType: 'page' }, { postType: 'blog' }])).toEqual({ page: 2, blog: 1 });
  });
});
