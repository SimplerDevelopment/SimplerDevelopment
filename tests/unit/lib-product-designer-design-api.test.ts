// @vitest-environment node
/**
 * Unit tests for components/product-designer/utils/designApi.ts
 *
 * Covers:
 *   - DesignApi static methods: getDesigns, getDesign, createDesign,
 *     updateDesign, deleteDesign, cloneDesign, getAnonymousDesignCount,
 *     claimDesigns, getPublicDesign, shareDesign, setBaseUrl, setSiteId
 *   - designUtils: shouldPromptSignup, debounceAutoSave, generateThumbnailUrl
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock SessionManager so node env doesn't need localStorage
// ---------------------------------------------------------------------------

vi.mock(
  '@/components/product-designer/utils/sessionManager',
  () => ({
    SessionManager: {
      getCurrentSessionId: vi.fn(),
      clearSessionId: vi.fn(),
    },
  }),
);

import { DesignApi, designUtils } from '@/components/product-designer/utils/designApi';
import { SessionManager } from '@/components/product-designer/utils/sessionManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Internal Server Error',
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

const SAMPLE_DESIGN = {
  id: 1,
  uuid: 'abc-123',
  name: 'My Design',
  productId: 'prod-1',
  styleId: 2,
  side: 'front',
  layers: [],
  styleOverrides: {},
  isPublic: false,
  isTemplate: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
  lastAccessedAt: '2024-01-01T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn());
  // Reset static fields to predictable defaults before each test
  DesignApi.baseUrl = '/api/designs';
  DesignApi.siteId = 0;
  vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue(null);
  vi.mocked(SessionManager.clearSessionId).mockReturnValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// setBaseUrl / setSiteId
// ---------------------------------------------------------------------------

describe('DesignApi.setBaseUrl', () => {
  it('updates baseUrl', () => {
    DesignApi.setBaseUrl('/custom/path');
    expect(DesignApi.baseUrl).toBe('/custom/path');
  });
});

describe('DesignApi.setSiteId', () => {
  it('sets siteId and updates baseUrl to storefront pattern', () => {
    DesignApi.setSiteId(42);
    expect(DesignApi.siteId).toBe(42);
    expect(DesignApi.baseUrl).toBe('/api/storefront/42/designs');
  });
});

// ---------------------------------------------------------------------------
// getDesigns
// ---------------------------------------------------------------------------

describe('DesignApi.getDesigns', () => {
  it('fetches designs without sessionId query param when no session', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse([SAMPLE_DESIGN]));
    const result = await DesignApi.getDesigns();
    expect(result).toEqual([SAMPLE_DESIGN]);
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/designs');
    expect(opts.credentials).toBe('include');
  });

  it('appends sessionId param when session exists', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_123_abc');
    vi.mocked(fetch).mockResolvedValue(makeResponse([SAMPLE_DESIGN]));
    await DesignApi.getDesigns();
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('sessionId=anon_123_abc');
  });

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({}, false));
    await expect(DesignApi.getDesigns()).rejects.toThrow('Failed to fetch designs');
  });
});

// ---------------------------------------------------------------------------
// getDesign
// ---------------------------------------------------------------------------

describe('DesignApi.getDesign', () => {
  it('fetches a design by id', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    const result = await DesignApi.getDesign(1);
    expect(result).toEqual(SAMPLE_DESIGN);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/designs/1');
  });

  it('includes userId param when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    await DesignApi.getDesign(1, 99);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('userId=99');
  });

  it('includes both sessionId and userId when both present', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_999_xyz');
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    await DesignApi.getDesign(5, 7);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('sessionId=anon_999_xyz');
    expect(url).toContain('userId=7');
  });

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({}, false));
    await expect(DesignApi.getDesign(1)).rejects.toThrow('Failed to fetch design');
  });
});

// ---------------------------------------------------------------------------
// createDesign
// ---------------------------------------------------------------------------

describe('DesignApi.createDesign', () => {
  const CREATE_REQ = { productId: 'prod-1', styleId: 2 };

  it('POSTs design data and returns the new design', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    const result = await DesignApi.createDesign(CREATE_REQ);
    expect(result).toEqual(SAMPLE_DESIGN);
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.productId).toBe('prod-1');
    expect(body.styleId).toBe(2);
  });

  it('includes userId in payload when provided', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    await DesignApi.createDesign(CREATE_REQ, 42);
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.userId).toBe(42);
  });

  it('includes sessionId from SessionManager in payload', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_111_abc');
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    await DesignApi.createDesign(CREATE_REQ);
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.sessionId).toBe('anon_111_abc');
  });

  it('throws error with server message on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ message: 'Product not found' }, false));
    await expect(DesignApi.createDesign(CREATE_REQ)).rejects.toThrow('Product not found');
  });

  it('throws generic message when server body has no message', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({}, false));
    await expect(DesignApi.createDesign(CREATE_REQ)).rejects.toThrow('Failed to create design');
  });
});

// ---------------------------------------------------------------------------
// updateDesign
// ---------------------------------------------------------------------------

describe('DesignApi.updateDesign', () => {
  it('PUTs to the correct URL', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    await DesignApi.updateDesign(1, { name: 'Updated' });
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/designs/1');
    expect(opts.method).toBe('PUT');
  });

  it('merges userId and sessionId into body', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_x');
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    await DesignApi.updateDesign(1, { name: 'New' }, 77);
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.userId).toBe(77);
    expect(body.sessionId).toBe('anon_x');
    expect(body.name).toBe('New');
  });

  it('throws with server message on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ message: 'Forbidden' }, false));
    await expect(DesignApi.updateDesign(1, {})).rejects.toThrow('Forbidden');
  });
});

// ---------------------------------------------------------------------------
// deleteDesign
// ---------------------------------------------------------------------------

describe('DesignApi.deleteDesign', () => {
  it('sends DELETE with userId and sessionId in body', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_del');
    vi.mocked(fetch).mockResolvedValue(makeResponse(null));
    await DesignApi.deleteDesign(5, 10);
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/designs/5');
    expect(opts.method).toBe('DELETE');
    const body = JSON.parse(opts.body as string);
    expect(body.userId).toBe(10);
    expect(body.sessionId).toBe('anon_del');
  });

  it('resolves void on success', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(null));
    await expect(DesignApi.deleteDesign(1)).resolves.toBeUndefined();
  });

  it('throws with server message on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ message: 'Not found' }, false));
    await expect(DesignApi.deleteDesign(1)).rejects.toThrow('Not found');
  });

  it('throws generic message when server body has no message', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({}, false));
    await expect(DesignApi.deleteDesign(1)).rejects.toThrow('Failed to delete design');
  });
});

// ---------------------------------------------------------------------------
// cloneDesign
// ---------------------------------------------------------------------------

describe('DesignApi.cloneDesign', () => {
  it('POSTs to clone endpoint with name in body', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    const result = await DesignApi.cloneDesign(3, 'Clone of My Design');
    expect(result).toEqual(SAMPLE_DESIGN);
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/designs/3/clone');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.name).toBe('Clone of My Design');
  });

  it('appends sessionId param when session present', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_clone');
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    await DesignApi.cloneDesign(3, 'Clone');
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('sessionId=anon_clone');
  });

  it('throws with server message on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ message: 'Clone failed' }, false));
    await expect(DesignApi.cloneDesign(1, 'X')).rejects.toThrow('Clone failed');
  });
});

// ---------------------------------------------------------------------------
// getAnonymousDesignCount
// ---------------------------------------------------------------------------

describe('DesignApi.getAnonymousDesignCount', () => {
  it('returns 0 immediately when no session exists', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue(null);
    const count = await DesignApi.getAnonymousDesignCount();
    expect(count).toBe(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('fetches count and returns the count field', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_abc');
    vi.mocked(fetch).mockResolvedValue(makeResponse({ count: 3 }));
    const count = await DesignApi.getAnonymousDesignCount();
    expect(count).toBe(3);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('sessionId=anon_abc');
  });

  it('throws on non-ok response', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_abc');
    vi.mocked(fetch).mockResolvedValue(makeResponse({}, false));
    await expect(DesignApi.getAnonymousDesignCount()).rejects.toThrow('Failed to get design count');
  });
});

// ---------------------------------------------------------------------------
// claimDesigns
// ---------------------------------------------------------------------------

describe('DesignApi.claimDesigns', () => {
  beforeEach(() => {
    DesignApi.siteId = 10;
  });

  it('throws if siteId is not set', async () => {
    DesignApi.siteId = 0;
    await expect(
      DesignApi.claimDesigns({ sessionId: 'anon_x', customerId: 1 }),
    ).rejects.toThrow('DesignApi.claimDesigns requires DesignApi.setSiteId()');
  });

  it('POSTs to the storefront claim endpoint', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ designsTransferred: 2 }));
    const result = await DesignApi.claimDesigns({ sessionId: 'anon_x', customerId: 5 });
    expect(result).toEqual({ designsTransferred: 2 });
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/storefront/10/designs/claim');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.sessionId).toBe('anon_x');
    expect(body.customerId).toBe(5);
  });

  it('clears session after successful claim', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ designsTransferred: 1 }));
    await DesignApi.claimDesigns({ sessionId: 'anon_x', customerId: 5 });
    expect(vi.mocked(SessionManager.clearSessionId)).toHaveBeenCalled();
  });

  it('throws with server message on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ message: 'Unauthorized' }, false));
    await expect(
      DesignApi.claimDesigns({ sessionId: 'anon_x', customerId: 5 }),
    ).rejects.toThrow('Unauthorized');
  });

  it('throws generic message when server body parse fails on failure', async () => {
    const failResponse = {
      ok: false,
      statusText: 'Bad Request',
      json: vi.fn().mockRejectedValue(new Error('parse error')),
    } as unknown as Response;
    vi.mocked(fetch).mockResolvedValue(failResponse);
    await expect(
      DesignApi.claimDesigns({ sessionId: 'anon_x', customerId: 5 }),
    ).rejects.toThrow('Failed to claim designs');
  });
});

// ---------------------------------------------------------------------------
// getPublicDesign
// ---------------------------------------------------------------------------

describe('DesignApi.getPublicDesign', () => {
  it('fetches a public design by uuid', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    const result = await DesignApi.getPublicDesign('abc-uuid');
    expect(result).toEqual(SAMPLE_DESIGN);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/designs/public/abc-uuid');
  });

  it('throws on non-ok response', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({}, false));
    await expect(DesignApi.getPublicDesign('bad-uuid')).rejects.toThrow('Failed to fetch public design');
  });
});

// ---------------------------------------------------------------------------
// shareDesign
// ---------------------------------------------------------------------------

describe('DesignApi.shareDesign', () => {
  const SHARE_RESULT = {
    design: SAMPLE_DESIGN,
    shareableUrl: 'https://example.com/design/abc-123',
    uuid: 'abc-123',
    isPublic: true,
  };

  it('POSTs to share endpoint with isPublic=true by default', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse(SHARE_RESULT));
    const result = await DesignApi.shareDesign(1);
    expect(result).toEqual(SHARE_RESULT);
    const [url, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/designs/1/share');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.isPublic).toBe(true);
  });

  it('can share with isPublic=false', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ ...SHARE_RESULT, isPublic: false }));
    await DesignApi.shareDesign(1, false);
    const [, opts] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(opts.body as string);
    expect(body.isPublic).toBe(false);
  });

  it('appends sessionId param when session present', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_share');
    vi.mocked(fetch).mockResolvedValue(makeResponse(SHARE_RESULT));
    await DesignApi.shareDesign(1);
    const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('sessionId=anon_share');
  });

  it('throws with server message on failure', async () => {
    vi.mocked(fetch).mockResolvedValue(makeResponse({ message: 'Share failed' }, false));
    await expect(DesignApi.shareDesign(1)).rejects.toThrow('Share failed');
  });
});

// ---------------------------------------------------------------------------
// designUtils.shouldPromptSignup
// ---------------------------------------------------------------------------

describe('designUtils.shouldPromptSignup', () => {
  it('returns shouldPrompt=false and count=0 when count is 1', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_s');
    vi.mocked(fetch).mockResolvedValue(makeResponse({ count: 1 }));
    const result = await designUtils.shouldPromptSignup();
    expect(result.shouldPrompt).toBe(false);
    expect(result.designCount).toBe(1);
  });

  it('returns shouldPrompt=true when count >= 2', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_s');
    vi.mocked(fetch).mockResolvedValue(makeResponse({ count: 2 }));
    const result = await designUtils.shouldPromptSignup();
    expect(result.shouldPrompt).toBe(true);
    expect(result.designCount).toBe(2);
  });

  it('returns shouldPrompt=false and count=0 on fetch error (swallows)', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue('anon_s');
    vi.mocked(fetch).mockRejectedValue(new Error('network error'));
    const result = await designUtils.shouldPromptSignup();
    expect(result.shouldPrompt).toBe(false);
    expect(result.designCount).toBe(0);
  });

  it('returns shouldPrompt=false and count=0 when no session (no fetch)', async () => {
    vi.mocked(SessionManager.getCurrentSessionId).mockReturnValue(null);
    const result = await designUtils.shouldPromptSignup();
    expect(result.shouldPrompt).toBe(false);
    expect(result.designCount).toBe(0);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// designUtils.generateThumbnailUrl
// ---------------------------------------------------------------------------

describe('designUtils.generateThumbnailUrl', () => {
  it('uses storefront URL when siteId is set', () => {
    DesignApi.siteId = 7;
    const url = designUtils.generateThumbnailUrl([{ type: 'text' }], 3);
    expect(url).toContain('/api/storefront/7/designs/generate-thumbnail');
    expect(url).toContain('style=3');
    expect(url).toContain('thumbnail=true');
  });

  it('falls back to legacy /api/generate-image when siteId=0', () => {
    DesignApi.siteId = 0;
    const url = designUtils.generateThumbnailUrl([], 1);
    expect(url).toContain('/api/generate-image');
    expect(url).toContain('thumbnail=true');
  });

  it('JSON-encodes and URI-encodes the layers param', () => {
    DesignApi.siteId = 0;
    const layers = [{ id: 'L1', text: 'hello world' }];
    const url = designUtils.generateThumbnailUrl(layers, 2);
    expect(url).toContain(encodeURIComponent(JSON.stringify(layers)));
  });
});

// ---------------------------------------------------------------------------
// designUtils.debounceAutoSave — smoke test (exercises the timer path)
// ---------------------------------------------------------------------------

describe('designUtils.debounceAutoSave', () => {
  it('is a function', () => {
    expect(typeof designUtils.debounceAutoSave).toBe('function');
  });

  it('calls updateDesign after delay (timer fires)', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    designUtils.debounceAutoSave(1, { name: 'auto' }, 100);
    vi.advanceTimersByTime(200);
    // Allow any microtasks (the inner async) to flush
    await Promise.resolve();
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('debounces: only the last call fires', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockResolvedValue(makeResponse(SAMPLE_DESIGN));
    designUtils.debounceAutoSave(1, { name: 'first' }, 200);
    designUtils.debounceAutoSave(1, { name: 'second' }, 200);
    vi.advanceTimersByTime(300);
    await Promise.resolve();
    expect(vi.mocked(fetch)).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
