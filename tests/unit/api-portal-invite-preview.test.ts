// @vitest-environment node
/**
 * PUX-149 — GET /api/portal/invite/[token]: says who invited you, to what
 * company, as what role — only for a live token, and with the same generic
 * error as ../accept when it isn't one.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hashTokenMock = vi.fn((t: string) => `H(${t})`);
vi.mock('@/lib/security/token-hash', () => ({ hashToken: (t: string) => hashTokenMock(t) }));
const rateLimitMock = vi.fn(async () => true);
vi.mock('@/lib/security/rate-limit', () => ({ checkRateLimit: () => rateLimitMock(), getClientIp: () => '127.0.0.1' }));
vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args }),
  gt: (a: unknown, b: unknown) => ({ op: 'gt', a, b }),
  desc: (a: unknown) => ({ op: 'desc', a }),
}));
vi.mock('drizzle-orm/pg-core', () => ({ alias: (t: unknown) => t }));
vi.mock('@/lib/db/schema', () => {
  const wrap = (name: string) => new Proxy({}, { get: (_t, prop: string) => ({ __col: prop, __table: name }) });
  return { users: wrap('users'), clientMembers: wrap('clientMembers'), clients: wrap('clients') };
});
let rows: Array<Record<string, unknown>> = [];
const whereSpy = vi.fn();
vi.mock('@/lib/db', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['from', 'innerJoin', 'leftJoin', 'orderBy']) chain[m] = () => chain;
  chain.where = (w: unknown) => { whereSpy(w); return chain; };
  chain.limit = async () => rows;
  return { db: { select: () => chain } };
});

const route = await import('@/app/api/portal/invite/[token]/route');
const call = (token: string) => route.GET(new Request('http://x/api/portal/invite/' + token), { params: Promise.resolve({ token }) });

beforeEach(() => { rows = []; rateLimitMock.mockResolvedValue(true); whereSpy.mockClear(); });

describe('GET /api/portal/invite/[token] (PUX-149)', () => {
  it('returns inviter, company and role for a live token, looked up by hash', async () => {
    rows = [{ email: 'new@example.com', name: 'Jordan', role: 'member', company: 'Ridgeline Outfitters', invitedBy: 'Marta Ellison' }];
    const res = await call('tok');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      success: true,
      data: { email: 'new@example.com', name: 'Jordan', role: 'member', company: 'Ridgeline Outfitters', invitedBy: 'Marta Ellison' },
    });
    expect(hashTokenMock).toHaveBeenCalledWith('tok');
    // the token hash AND the expiry are both in the WHERE — an expired token is refused like an unknown one
    expect(JSON.stringify(whereSpy.mock.calls[0][0])).toMatch(/"__col":"inviteToken"/);
    expect(JSON.stringify(whereSpy.mock.calls[0][0])).toMatch(/"__col":"inviteExpiresAt"/);
  });

  it('falls back to "Your Team" when the client has no company name', async () => {
    rows = [{ email: 'e', name: null, role: 'viewer', company: null, invitedBy: null }];
    expect((await (await call('tok')).json()).data.company).toBe('Your Team');
  });

  it('unknown/expired token → the same generic 400 as accept; rate limit → 429', async () => {
    const res = await call('nope');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid or expired/);
    rateLimitMock.mockResolvedValue(false);
    expect((await call('tok')).status).toBe(429);
  });
});
