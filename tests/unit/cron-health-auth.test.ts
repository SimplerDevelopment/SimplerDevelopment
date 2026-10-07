// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { insert, update } = vi.hoisted(() => ({
  insert: vi.fn(() => ({ values: () => ({ onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) }) })),
  update: vi.fn(() => ({ set: () => ({ where: vi.fn().mockResolvedValue(undefined) }) })),
}));
vi.mock('@/lib/db', () => ({ db: { insert, update } }));
import { withCronHealth } from '@/lib/cron-health';

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv('CRON_SECRET', 'health-test-secret'); });
afterEach(() => vi.unstubAllEnvs());

describe('cron health only tracks authenticated executions', () => {
  it.each([
    { secret: 'health-test-secret', headers: { 'x-vercel-cron': '1' }, status: 401 }, // Synthetic cron fixture. pragma: allowlist secret
    { secret: '', headers: { 'x-vercel-cron': '1' }, status: 503 },
    { secret: 'health-test-secret', headers: { authorization: 'Bearer wrong' }, status: 401 }, // Synthetic cron fixture. pragma: allowlist secret
  ])('preserves the route rejection without database writes %j', async ({ secret, headers, status }) => {
    vi.stubEnv('CRON_SECRET', secret);
    const response = Response.json({ success: false }, { status });
    const handler = vi.fn().mockResolvedValue(response);
    const wrapped = withCronHealth({ name: 'api-cron:test', area: 'api-cron' }, handler);
    const request = new Request('http://localhost/api/cron/test', { headers });
    expect(await wrapped(request)).toBe(response);
    expect(handler).toHaveBeenCalledWith(request);
    expect(insert).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it('records an authenticated successful execution', async () => {
    const response = Response.json({ success: true });
    const wrapped = withCronHealth({ name: 'api-cron:test', area: 'api-cron' }, async () => response);
    expect(await wrapped(new Request('http://localhost', {
      headers: { authorization: 'Bearer health-test-secret' },
    }))).toBe(response);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
  });
});
