import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCanonicalOrigin } from '../../../packages/cli/src/client.js';

function redirectResponse(status: number, location: string): Response {
  return {
    status,
    ok: false,
    headers: { get: (h: string) => (h.toLowerCase() === 'location' ? location : null) },
    text: async () => '',
  } as unknown as Response;
}

function okResponse(): Response {
  return {
    status: 200,
    ok: true,
    headers: { get: () => null },
    text: async () => '{}',
  } as unknown as Response;
}

describe('resolveCanonicalOrigin', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('follows an apex -> www 307 and returns the canonical origin', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse(307, 'https://www.example.com/api/health'))
      .mockResolvedValueOnce(okResponse());
    const origin = await resolveCanonicalOrigin({ apiUrl: 'https://example.com', timeout: 5000 });
    expect(origin).toBe('https://www.example.com');
  });

  it('returns the input origin when there is no redirect', async () => {
    fetchMock.mockResolvedValueOnce(okResponse());
    const origin = await resolveCanonicalOrigin({ apiUrl: 'https://www.example.com/', timeout: 5000 });
    expect(origin).toBe('https://www.example.com');
  });

  it('fails open on network errors', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const origin = await resolveCanonicalOrigin({ apiUrl: 'https://example.com', timeout: 5000 });
    expect(origin).toBe('https://example.com');
  });

  it('gives up after 3 hops on a redirect loop', async () => {
    fetchMock.mockResolvedValue(redirectResponse(308, 'https://example.com/api/health'));
    const origin = await resolveCanonicalOrigin({ apiUrl: 'https://example.com', timeout: 5000 });
    expect(origin).toBe('https://example.com');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
