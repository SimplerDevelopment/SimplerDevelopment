// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const results: unknown[][] = [];
const calls: { where: unknown[] }[] = [];
vi.mock('@/lib/db', () => {
  const chain = () => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'from', 'where', 'innerJoin', 'limit']) {
      q[m] = (arg: unknown) => { if (m === 'where') calls.push({ where: [arg] }); return q; };
    }
    q.then = (res: (v: unknown) => void) => res(results.shift() ?? []);
    return q;
  };
  return { db: { select: () => chain() } };
});
vi.mock('@/lib/portal-auth', () => ({
  authorizePortal: vi.fn(async () => ({ client: { id: 104 } })),
  isAuthError: () => false,
}));

import { GET } from '@/app/api/portal/media/[id]/usages/route';

beforeEach(() => { results.length = 0; calls.length = 0; });

describe('GET /api/portal/media/[id]/usages (PUX-188)', () => {
  it('404s when the media row is not this client\'s', async () => {
    results.push([]);
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: '7' }) });
    expect(res.status).toBe(404);
  });
  it('counts posts on this client\'s websites whose content contains the URL', async () => {
    results.push([{ url: 'https://cdn/x_1.png' }], [{ id: 1, title: 'Home', websiteId: 3 }, { id: 2, title: 'About', websiteId: 3 }]);
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ id: '7' }) });
    const body = await res.json();
    expect(body.data.count).toBe(2);
    expect(body.data.capped).toBe(false);
    expect(body.data.pages[0].title).toBe('Home');
    expect(calls).toHaveLength(2); // media scoped by client, then posts scoped through client_websites
  });
});
