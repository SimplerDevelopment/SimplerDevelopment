// @vitest-environment node
/**
 * AUTH79-017 — the resend-verification limiter.
 *
 * This route returns 200 whether or not it sent anything (a deliberate closed
 * oracle: revealing "no such account" would leak which addresses are
 * registered). So the status code cannot tell you the limiter works — the only
 * observable difference between limited and allowed is whether an email went
 * out.
 *
 * That also makes the boolean easy to invert without noticing: `checkRateLimit`
 * returns TRUE for allowed, so the route negates it. Flip that and the limiter
 * silently stops limiting while every response still looks identical. These
 * assert on `sendEmail` for exactly that reason.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const checkRateLimitMock = vi.fn();
const sendEmailMock = vi.fn();

vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimitMock(...a),
}));
vi.mock('@/lib/email', () => ({ sendEmail: (...a: unknown[]) => sendEmailMock(...a) }));
vi.mock('drizzle-orm', () => ({
  and: (...a: unknown[]) => ({ a }), eq: (...a: unknown[]) => ({ a }), isNull: (...a: unknown[]) => ({ a }),
}));
vi.mock('@/lib/db/schema', () => ({
  users: { id: {}, name: {}, email: {}, role: {}, emailVerifiedAt: {}, emailVerificationToken: {}, emailVerificationExpiresAt: {}, updatedAt: {} },
}));
vi.mock('@/lib/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => [
      { id: 1, name: 'Ada', email: 'ada@example.com', role: 'client' },
    ] }) }) }),
    update: () => ({ set: () => ({ where: async () => [] }) }),
  },
}));

const { POST } = await import('@/app/api/auth/resend-verification/route');

const post = () => POST(new Request('http://x/api/auth/resend-verification', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7' },
  body: JSON.stringify({ email: 'ada@example.com' }),
}));

describe('POST /api/auth/resend-verification — rate limiting', () => {
  beforeEach(() => { checkRateLimitMock.mockReset(); sendEmailMock.mockReset(); });

  it('sends when the limiter allows (checkRateLimit → true)', async () => {
    checkRateLimitMock.mockResolvedValue(true);
    const res = await post();
    expect(res.status).toBe(200);
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
  });

  it('does NOT send when the limiter blocks (checkRateLimit → false)', async () => {
    // The inversion guard. Both cases are 200, so only this distinguishes a
    // working limiter from one wired backwards.
    checkRateLimitMock.mockResolvedValue(false);
    const res = await post();
    expect(res.status).toBe(200);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('keys the limit on IP AND email, at 3 per hour', async () => {
    // Keyed on both so neither alone is the whole budget: rotating IPs must not
    // let one address be bombed, and one NAT'd office must not exhaust the
    // allowance for everyone behind it.
    checkRateLimitMock.mockResolvedValue(true);
    await post();
    const [key, limit, windowMs] = checkRateLimitMock.mock.calls[0];
    expect(key).toContain('203.0.113.7');
    expect(key).toContain('ada@example.com');
    expect(limit).toBe(3);
    expect(windowMs).toBe(60 * 60 * 1000);
  });
});
