// @vitest-environment node
/**
 * Unit tests for `lib/plugins/handlers/content-tools/dispatch.ts`:
 *
 *   - Successful 202 from the worker → ok:true.
 *   - 4xx from the worker → ok:false, retriable:false (permanent).
 *   - 5xx from the worker → ok:false, retriable:true.
 *   - Network/abort failure → ok:false, retriable:true.
 *   - The JWT-mint hop is mocked; we don't exercise signPluginJwt here,
 *     just confirm that dispatchRun calls it and forwards the token.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const signPluginJwtMock = vi.fn();
vi.mock('@/lib/plugins/jwt', () => ({
  signPluginJwt: signPluginJwtMock,
}));

const { dispatchRun, DISPATCH_SCOPE } = await import(
  '@/lib/plugins/handlers/content-tools/dispatch'
);

const fakeApp = {
  id: 42,
  slug: 'content-tools',
  hostUrl: 'https://content-tools.test',
} as const;

const fakePayload = {
  runId: 17,
  kind: 'research-brief',
  args: { topic: 't' },
  clientId: 100,
};

function mockFetchOnce(res: Partial<Response> & { status: number; body?: string }): typeof fetch {
  const fakeRes = {
    status: res.status,
    ok: res.status >= 200 && res.status < 300,
    text: async () => res.body ?? '',
  } as unknown as Response;
  return vi.fn().mockResolvedValue(fakeRes) as unknown as typeof fetch;
}

beforeEach(() => {
  signPluginJwtMock.mockReset();
  signPluginJwtMock.mockResolvedValue('signed.jwt.value');
});

describe('dispatchRun', () => {
  it('returns ok:true on 202 Accepted', async () => {
    const fetchImpl = mockFetchOnce({ status: 202 });
    const result = await dispatchRun(fakeApp, fakePayload, { fetchImpl });
    expect(result).toEqual({ ok: true, status: 202 });
    expect(signPluginJwtMock).toHaveBeenCalledWith(42, expect.objectContaining({
      aud: 'content-tools',
      sub: 'system',
      clientId: 100,
      scopes: [DISPATCH_SCOPE],
    }));
  });

  it('returns ok:true on 200 OK as well (worker may answer sync)', async () => {
    const fetchImpl = mockFetchOnce({ status: 200 });
    const result = await dispatchRun(fakeApp, fakePayload, { fetchImpl });
    expect(result.ok).toBe(true);
  });

  it('classifies 4xx as non-retriable', async () => {
    const fetchImpl = mockFetchOnce({ status: 400, body: 'bad payload' });
    const result = await dispatchRun(fakeApp, fakePayload, { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retriable).toBe(false);
      expect(result.status).toBe(400);
      expect(result.reason).toMatch(/400/);
      expect(result.reason).toMatch(/bad payload/);
    }
  });

  it('classifies 5xx as retriable', async () => {
    const fetchImpl = mockFetchOnce({ status: 503, body: 'worker overloaded' });
    const result = await dispatchRun(fakeApp, fakePayload, { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retriable).toBe(true);
      expect(result.status).toBe(503);
    }
  });

  it('classifies fetch failure as retriable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const result = await dispatchRun(fakeApp, fakePayload, { fetchImpl });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.retriable).toBe(true);
      expect(result.status).toBe(0);
      expect(result.reason).toMatch(/ECONNREFUSED/);
    }
  });

  it('strips trailing slash from hostUrl when building the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      status: 202,
      ok: true,
      text: async () => '',
    } as unknown as Response) as unknown as typeof fetch;

    await dispatchRun(
      { ...fakeApp, hostUrl: 'https://content-tools.test/' },
      fakePayload,
      { fetchImpl },
    );

    const url = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toBe('https://content-tools.test/internal/execute-run');
  });
});
