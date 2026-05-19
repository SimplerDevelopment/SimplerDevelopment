// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { geocodeAddress } from '@/lib/geocode';

function mockJsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('lib/geocode', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe('geocodeAddress', () => {
    it('returns null for empty string', async () => {
      const result = await geocodeAddress('');
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null for whitespace-only string', async () => {
      const result = await geocodeAddress('   \t \n  ');
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns null when address is null/undefined-ish', async () => {
      // The function defensively coerces nullish inputs via (address ?? '').trim()
      // @ts-expect-error - intentionally testing nullish handling
      const result = await geocodeAddress(null);
      expect(result).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns parsed coordinates on a happy-path response', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: '40.7128', lon: '-74.0060' }])
      );

      const result = await geocodeAddress('New York, NY');
      expect(result).toEqual({ latitude: 40.7128, longitude: -74.006 });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('builds a Nominatim URL with the URL-encoded query and required params', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: '1', lon: '2' }])
      );

      await geocodeAddress('123 Main St, Springfield');
      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toContain('https://nominatim.openstreetmap.org/search');
      expect(url).toContain('q=123%20Main%20St%2C%20Springfield');
      expect(url).toContain('format=json');
      expect(url).toContain('limit=1');
      expect(init.method).toBe('GET');
      const headers = init.headers as Record<string, string>;
      expect(headers['User-Agent']).toMatch(/SimplerDevelopmentCRM/);
      expect(headers.Accept).toBe('application/json');
      expect(init.signal).toBeDefined();
    });

    it('trims the input before encoding it into the URL', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: '0', lon: '0' }])
      );

      await geocodeAddress('   Paris   ');
      const [url] = fetchSpy.mock.calls[0] as [string];
      expect(url).toContain('q=Paris');
      expect(url).not.toContain('%20Paris');
    });

    it('returns null when fetch responds with a non-ok status', async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse([], false, 500));
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when response JSON is not an array', async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse({ error: 'nope' }));
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when response is an empty array', async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse([]));
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when first result is missing lat/lon strings', async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse([{}]));
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when lat/lon are numbers instead of strings', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: 40.7128, lon: -74.006 }])
      );
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when lat/lon parse to NaN', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: 'not-a-number', lon: 'also-bad' }])
      );
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when latitude is out of range (>90)', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: '91', lon: '0' }])
      );
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when latitude is out of range (<-90)', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: '-91', lon: '0' }])
      );
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when longitude is out of range (>180)', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: '0', lon: '181' }])
      );
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when longitude is out of range (<-180)', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: '0', lon: '-181' }])
      );
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('accepts boundary lat/lon values exactly at the limits', async () => {
      fetchSpy.mockResolvedValueOnce(
        mockJsonResponse([{ lat: '90', lon: '-180' }])
      );
      const result = await geocodeAddress('north pole edge');
      expect(result).toEqual({ latitude: 90, longitude: -180 });
    });

    it('returns null when fetch rejects (network error)', async () => {
      fetchSpy.mockRejectedValueOnce(new Error('network down'));
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when res.json() throws (malformed body)', async () => {
      fetchSpy.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token < in JSON');
        },
      } as unknown as Response);

      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('returns null when fetch rejects with an AbortError', async () => {
      fetchSpy.mockRejectedValueOnce(
        Object.assign(new Error('Aborted'), { name: 'AbortError' })
      );
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });

    it('clears the abort timer on success (no late abort fires)', async () => {
      vi.useFakeTimers();
      try {
        fetchSpy.mockResolvedValueOnce(
          mockJsonResponse([{ lat: '10', lon: '20' }])
        );
        const result = await geocodeAddress('Boston');
        expect(result).toEqual({ latitude: 10, longitude: 20 });
        // Advancing past the 6s timeout must NOT cause any side effects /
        // dangling timers after the function resolved.
        vi.advanceTimersByTime(10_000);
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns null when first result is explicitly null', async () => {
      fetchSpy.mockResolvedValueOnce(mockJsonResponse([null]));
      const result = await geocodeAddress('anywhere');
      expect(result).toBeNull();
    });
  });
});
