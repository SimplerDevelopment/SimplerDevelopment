// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isAuthorizedCron } from '@/lib/cron-auth';

afterEach(() => vi.unstubAllEnvs());
describe('cron authentication', () => {
  it('rejects caller-supplied scheduling headers with or without a configured secret', () => {
    const req = new Request('https://example.test/api/cron/test', { headers: { 'x-vercel-cron': '1' } });
    for (const secret of ['', 'test-secret']) {
      vi.stubEnv('CRON_SECRET', secret);
      expect(isAuthorizedCron(req)).toBe(false);
    }
  });
  it('requires the exact bearer secret', () => {
    vi.stubEnv('CRON_SECRET', 'test-secret');
    for (const token of ['', 'Bearer wrong-secret', 'Bearer test-secret-more']) {
      expect(isAuthorizedCron(new Request('https://example.test', { headers: { authorization: token } }))).toBe(false);
    }
    expect(isAuthorizedCron(new Request('https://example.test', { headers: { authorization: 'Bearer test-secret' } }))).toBe(true);
  });
});
