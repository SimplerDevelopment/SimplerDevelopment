// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { proxyAssetResponse } from '@/lib/media/proxy-response';

describe('protected media response policy', () => {
  it('keeps protected bytes out of shared caches and varies by credentials', async () => {
    const body = Buffer.from('private attachment');
    const response = proxyAssetResponse({
      body: body.toString('base64'), contentType: 'image/png', contentLength: body.length,
    }, 'private/12/photo.png', true);

    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('vary')).toBe('Cookie, Authorization');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(body);
  });

  it.each([
    ['text/html', 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms'],
    ['image/svg+xml', "default-src 'none'; style-src 'unsafe-inline'; sandbox"],
  ])('preserves the active-content sandbox for private %s', (contentType, csp) => {
    const response = proxyAssetResponse({ body: '', contentType, contentLength: 0 }, 'private/12/embed', true);

    expect(response.headers.get('content-security-policy')).toBe(csp);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-disposition')).toBeNull();
  });
});
