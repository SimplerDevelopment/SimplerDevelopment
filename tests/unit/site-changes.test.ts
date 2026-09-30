import { describe, it, expect } from 'vitest';
import { changesForSite } from '@/lib/sites/site-changes';

describe('PUX-183 changesForSite', () => {
  it('keeps the site row and its posts, drops other sites and other kinds', () => {
    const rows = [
      { id: 1, entityType: 'site', entityId: 7 },
      { id: 2, entityType: 'post', entityId: 100 },
      { id: 3, entityType: 'post', entityId: 999 },
      { id: 4, entityType: 'site', entityId: 8 },
      { id: 5, entityType: 'deal', entityId: 100 },
      { id: 6, entityType: 'post_taxonomy', entityId: 101 },
    ];
    expect(changesForSite(rows, 7, [100, 101]).map((r) => r.id)).toEqual([1, 2, 6]);
  });
});
