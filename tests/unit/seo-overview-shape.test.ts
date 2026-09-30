import { describe, it, expect } from 'vitest';
import { flatIssues, sparkPath, topPages } from '@/lib/seo/overview-shape';

describe('PUX-180 SEO overview shapes', () => {
  it('topPages ranks by internalRank, unranked last, capped', () => {
    const rows = [{ url: '/c', internalRank: null }, { url: '/a', internalRank: 1 }, { url: '/b', internalRank: 2 }];
    expect(topPages(rows, 2).map((r) => r.url)).toEqual(['/a', '/b']);
    expect(topPages(rows).map((r) => r.url)).toEqual(['/a', '/b', '/c']);
  });
  it('flatIssues is severity-first then count, with a sample url', () => {
    const out = flatIssues([
      { severity: 'warning', title: 'Alt text', count: 18, pages: [{ url: null }, { url: '/store' }] },
      { severity: 'critical', title: 'Missing meta', count: 4, pages: [{ url: '/trips/ridge' }] },
      { severity: 'critical', title: 'Dup title', count: 2, pages: [] },
    ]);
    expect(out.map((i) => i.title)).toEqual(['Missing meta', 'Dup title', 'Alt text']);
    expect(out[0].sampleUrl).toBe('/trips/ridge');
    expect(out[2].sampleUrl).toBe('/store');
  });
  it('sparkPath scales clicks into the box and needs two points', () => {
    expect(sparkPath([{ clicks: 5 }])).toBe('');
    const pts = sparkPath([{ clicks: 0 }, { clicks: 10 }, { clicks: 5 }], 100, 20).split(' ');
    expect(pts.length).toBe(3);
    expect(pts[0]).toBe('0.0,19.0');   // zero clicks → bottom
    expect(pts[1]).toBe('50.0,1.0');   // max → top
  });
});
