// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

const results: unknown[][] = [];
const wheres: unknown[] = [];
vi.mock('@/lib/db', () => {
  const chain = () => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'from', 'where', 'limit']) q[m] = (arg: unknown) => { if (m === 'where') wheres.push(arg); return q; };
    q.then = (res: (v: unknown) => void) => res(results.shift() ?? []);
    return q;
  };
  return { db: { select: () => chain() } };
});
vi.mock('@/lib/auth', () => ({ auth: vi.fn(async () => ({ user: { id: '7' } })) }));
vi.mock('@/lib/portal-client', () => ({ getPortalClient: vi.fn(async () => ({ id: 104 })) }));

import { GET } from '@/app/api/portal/branding/profiles/[profileId]/usage/route';

beforeEach(() => { results.length = 0; wheres.length = 0; });

describe('GET /api/portal/branding/profiles/[id]/usage (PUX-189)', () => {
  it('404s for a profile outside the client', async () => {
    results.push([]);
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ profileId: '3' }) });
    expect(res.status).toBe(404);
    expect(wheres).toHaveLength(1);
  });
  it('returns the client-scoped sites and survey count', async () => {
    results.push([{ id: 3 }], [{ id: 11, name: 'Main site' }], [{ n: 2 }]);
    const res = await GET(new Request('http://x'), { params: Promise.resolve({ profileId: '3' }) });
    const body = await res.json();
    expect(body.data).toEqual({ sites: [{ id: 11, name: 'Main site' }], surveys: 2 });
    expect(wheres).toHaveLength(3); // profile, sites, surveys — each filtered by client
  });
});
