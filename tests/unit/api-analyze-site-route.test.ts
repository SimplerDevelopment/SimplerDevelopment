/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---------------------------------------------------------------

const authMock = vi.fn();
vi.mock('@/lib/auth', () => ({
  auth: (...args: unknown[]) => authMock(...args),
}));

const uploadToS3Mock = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => uploadToS3Mock(...args),
}));

// Build a fake playwright surface we can control per-test.
type RequestHandler = (request: {
  resourceType: () => string;
  url: () => string;
}) => void;

interface FakePage {
  __requestHandlers: RequestHandler[];
  __scriptsToEmit: string[];
  __metadata: Record<string, unknown>;
  __consentSelectorFound: string | null;
  setViewportSize: ReturnType<typeof vi.fn>;
  waitForTimeout: ReturnType<typeof vi.fn>;
  screenshot: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  goto: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
  $: ReturnType<typeof vi.fn>;
}

interface FakeBrowser {
  newContext: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

let currentPage: FakePage;
let currentBrowser: FakeBrowser;
let chromiumLaunchMock: ReturnType<typeof vi.fn>;
let launchShouldThrow: Error | null = null;
let browserCloseShouldThrow: Error | null = null;

function buildFakePage(opts?: {
  scriptsToEmit?: string[];
  metadata?: Record<string, unknown>;
  consentSelectorFound?: string | null;
}): FakePage {
  const page: FakePage = {
    __requestHandlers: [],
    __scriptsToEmit: opts?.scriptsToEmit ?? [],
    __metadata: opts?.metadata ?? {
      title: 'Example',
      description: 'desc',
      ogImage: null,
      favicon: null,
    },
    __consentSelectorFound: opts?.consentSelectorFound ?? null,
    setViewportSize: vi.fn(async () => undefined),
    waitForTimeout: vi.fn(async () => undefined),
    screenshot: vi.fn(async () => Buffer.from('fake-png')),
    on: vi.fn((event: string, handler: RequestHandler) => {
      if (event === 'request') page.__requestHandlers.push(handler);
    }),
    goto: vi.fn(async () => {
      // After goto, simulate the network requests that would fire.
      for (const scriptUrl of page.__scriptsToEmit) {
        for (const h of page.__requestHandlers) {
          h({
            resourceType: () => 'script',
            url: () => scriptUrl,
          });
        }
      }
      // Also simulate a non-script request to verify the filter.
      for (const h of page.__requestHandlers) {
        h({
          resourceType: () => 'image',
          url: () => 'https://cdn.example.com/cat.png',
        });
      }
    }),
    evaluate: vi.fn(async () => page.__metadata),
    $: vi.fn(async (selector: string) => {
      if (page.__consentSelectorFound && selector === page.__consentSelectorFound) {
        return {
          click: vi.fn(async () => undefined),
        };
      }
      return null;
    }),
  };
  return page;
}

function buildFakeBrowser(page: FakePage): FakeBrowser {
  return {
    newContext: vi.fn(async () => ({
      newPage: vi.fn(async () => page),
    })),
    close: vi.fn(async () => {
      if (browserCloseShouldThrow) throw browserCloseShouldThrow;
    }),
  };
}

vi.mock('playwright', () => ({
  chromium: {
    launch: (...args: unknown[]) => chromiumLaunchMock(...args),
  },
}));

// --- Test setup ----------------------------------------------------------

import { POST, GET } from '@/app/api/analyze-site/route';

function makeReq(body: unknown): NextRequest {
  return new NextRequest(
    new Request('https://app.test/api/analyze-site', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  authMock.mockReset();
  uploadToS3Mock.mockReset();
  uploadToS3Mock.mockImplementation(async (_buf: Buffer, name: string) => ({
    url: `https://s3.test/${name}`,
  }));
  launchShouldThrow = null;
  browserCloseShouldThrow = null;
  currentPage = buildFakePage();
  currentBrowser = buildFakeBrowser(currentPage);
  chromiumLaunchMock = vi.fn(async () => {
    if (launchShouldThrow) throw launchShouldThrow;
    return currentBrowser;
  });
});

// --- GET -----------------------------------------------------------------

describe('GET /api/analyze-site', () => {
  it('returns a health-check payload', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('website-analyzer');
    expect(body.endpoints.POST).toBe('/api/analyze-site');
    expect(body.endpoints.body).toEqual({ url: 'string' });
  });
});

// --- Auth ----------------------------------------------------------------

describe('POST /api/analyze-site: auth', () => {
  it('returns 401 when there is no session', async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
  });

  it('returns 401 when session has no user id', async () => {
    authMock.mockResolvedValueOnce({ user: {} });
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(401);
  });

  it('returns 403 when user lacks staff role', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u1', role: 'viewer' } });
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'forbidden' });
  });

  it('returns 403 when role is missing entirely', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u1' } });
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(403);
  });

  it('admin role is permitted to proceed past auth', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u1', role: 'admin' } });
    const res = await POST(makeReq({ url: 'https://example.com' }));
    // No 401/403; should go on to do work.
    expect(res.status).toBe(200);
  });

  it('editor role is permitted', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u1', role: 'editor' } });
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(200);
  });

  it('employee role is permitted', async () => {
    authMock.mockResolvedValueOnce({ user: { id: 'u1', role: 'employee' } });
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(200);
  });
});

// --- Input validation ----------------------------------------------------

describe('POST /api/analyze-site: input validation', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
  });

  it('returns 400 when url is missing from body', async () => {
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'URL is required' });
  });

  it('returns 400 when url is empty string', async () => {
    const res = await POST(makeReq({ url: '' }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when url is not parseable', async () => {
    const res = await POST(makeReq({ url: 'http://[bad' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Invalid URL provided' });
  });

  it('returns 500 when request body is not valid JSON', async () => {
    const res = await POST(makeReq('not-json{'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to analyze website' });
  });

  it('prepends https:// when url has no scheme', async () => {
    const res = await POST(makeReq({ url: 'example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://example.com/');
  });

  it('preserves http scheme when explicitly provided', async () => {
    const res = await POST(makeReq({ url: 'http://example.com' }));
    const body = await res.json();
    expect(body.url).toBe('http://example.com/');
  });
});

// --- Happy path ----------------------------------------------------------

describe('POST /api/analyze-site: happy path', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
  });

  it('returns a 200 with full AnalysisResult shape', async () => {
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.url).toBe('https://example.com/');
    expect(typeof body.analyzedAt).toBe('string');
    expect(body.screenshots.desktop).toMatch(/^https:\/\/s3\.test\//);
    expect(body.screenshots.tablet).toMatch(/^https:\/\/s3\.test\//);
    expect(body.screenshots.mobile).toMatch(/^https:\/\/s3\.test\//);
    expect(Array.isArray(body.scripts.immediate)).toBe(true);
    expect(Array.isArray(body.scripts.delayed)).toBe(true);
    expect(Array.isArray(body.scripts.all)).toBe(true);
    expect(body.techStack).toBeDefined();
    expect(body.metadata).toBeDefined();
  });

  it('captures screenshots for desktop, tablet, mobile viewports', async () => {
    await POST(makeReq({ url: 'https://example.com' }));

    // 3 viewport sets (one per screenshot)
    const sizes = currentPage.setViewportSize.mock.calls.map((c) => c[0]);
    expect(sizes).toEqual(
      expect.arrayContaining([
        { width: 1920, height: 1080 },
        { width: 768, height: 1024 },
        { width: 375, height: 812 },
      ]),
    );
    expect(currentPage.screenshot).toHaveBeenCalledTimes(3);
    expect(uploadToS3Mock).toHaveBeenCalledTimes(3);
  });

  it('uploads PNG to S3 with viewport-named filenames', async () => {
    await POST(makeReq({ url: 'https://example.com' }));
    const filenames = uploadToS3Mock.mock.calls.map((c) => c[1]);
    expect(filenames.some((f: string) => /example-com-desktop-\d+\.png/.test(f))).toBe(true);
    expect(filenames.some((f: string) => /example-com-tablet-\d+\.png/.test(f))).toBe(true);
    expect(filenames.some((f: string) => /example-com-mobile-\d+\.png/.test(f))).toBe(true);
    // Mime type is always image/png
    for (const call of uploadToS3Mock.mock.calls) {
      expect(call[2]).toBe('image/png');
    }
  });

  it('closes the browser after analysis succeeds', async () => {
    await POST(makeReq({ url: 'https://example.com' }));
    expect(currentBrowser.close).toHaveBeenCalledTimes(1);
  });

  it('launches Chromium with hardened args', async () => {
    await POST(makeReq({ url: 'https://example.com' }));
    expect(chromiumLaunchMock).toHaveBeenCalledTimes(1);
    const launchOpts = chromiumLaunchMock.mock.calls[0][0] as {
      headless: boolean;
      args: string[];
    };
    expect(launchOpts.headless).toBe(true);
    expect(launchOpts.args).toEqual(
      expect.arrayContaining([
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
      ]),
    );
  });

  it('navigates to the validated URL with networkidle wait', async () => {
    await POST(makeReq({ url: 'example.com' }));
    expect(currentPage.goto).toHaveBeenCalledWith(
      'https://example.com/',
      expect.objectContaining({ waitUntil: 'networkidle' }),
    );
  });
});

// --- Script categorization -----------------------------------------------

describe('POST /api/analyze-site: script categorization', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
  });

  it('classifies analytics, advertising, marketing, cms, ecommerce scripts', async () => {
    currentPage = buildFakePage({
      scriptsToEmit: [
        'https://www.google-analytics.com/analytics.js',
        'https://connect.facebook.net/en_US/fbevents.js',
        'https://js.hs-scripts.com/12345.js',
        'https://example.wp-content/themes/foo.js',
        'https://js.stripe.com/v3/',
        'https://unrelated.example.com/app.js',
      ],
    });
    currentBrowser = buildFakeBrowser(currentPage);

    const res = await POST(makeReq({ url: 'https://example.com' }));
    const body = await res.json();

    expect(body.techStack.analytics).toContain('google-analytics.com');
    expect(body.techStack.advertising).toContain('connect.facebook.net');
    expect(body.techStack.marketing).toContain('js.hs-scripts.com');
    expect(body.techStack.cms.length).toBeGreaterThan(0);
    expect(body.techStack.ecommerce).toContain('js.stripe.com');
    // Uncategorized scripts go nowhere in techStack but are listed in all.
    expect(body.scripts.all).toContain('https://unrelated.example.com/app.js');
  });

  it('deduplicates tools that appear multiple times', async () => {
    currentPage = buildFakePage({
      scriptsToEmit: [
        'https://www.google-analytics.com/analytics.js',
        'https://www.google-analytics.com/collect',
        'https://www.google-analytics.com/v2/collect',
      ],
    });
    currentBrowser = buildFakeBrowser(currentPage);

    const res = await POST(makeReq({ url: 'https://example.com' }));
    const body = await res.json();
    const ga = body.techStack.analytics.filter(
      (n: string) => n === 'google-analytics.com',
    );
    expect(ga.length).toBe(1);
  });

  it('deduplicates the scripts.all list', async () => {
    currentPage = buildFakePage({
      scriptsToEmit: [
        'https://a.example.com/x.js',
        'https://a.example.com/x.js',
        'https://b.example.com/y.js',
      ],
    });
    currentBrowser = buildFakeBrowser(currentPage);

    const res = await POST(makeReq({ url: 'https://example.com' }));
    const body = await res.json();
    expect(body.scripts.all.sort()).toEqual([
      'https://a.example.com/x.js',
      'https://b.example.com/y.js',
    ]);
  });

  it('ignores non-script resource types', async () => {
    currentPage = buildFakePage({
      scriptsToEmit: [], // page.goto still emits one non-script resource
    });
    currentBrowser = buildFakeBrowser(currentPage);

    const res = await POST(makeReq({ url: 'https://example.com' }));
    const body = await res.json();
    expect(body.scripts.all).toEqual([]);
    expect(body.scripts.immediate).toEqual([]);
    expect(body.scripts.delayed).toEqual([]);
  });
});

// --- Consent banner ------------------------------------------------------

describe('POST /api/analyze-site: consent banner', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
  });

  it('clicks the OneTrust accept button when found', async () => {
    currentPage = buildFakePage({
      consentSelectorFound: '#onetrust-accept-btn-handler',
    });
    currentBrowser = buildFakeBrowser(currentPage);

    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(200);
    // We at least probed the consent selector.
    expect(currentPage.$).toHaveBeenCalledWith('#onetrust-accept-btn-handler');
  });

  it('survives consent-selector exceptions and still returns 200', async () => {
    currentPage = buildFakePage();
    // First selector throws; subsequent ones return null.
    let calls = 0;
    currentPage.$ = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new Error('boom');
      return null;
    });
    currentBrowser = buildFakeBrowser(currentPage);

    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(200);
  });
});

// --- Metadata ------------------------------------------------------------

describe('POST /api/analyze-site: metadata', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
  });

  it('passes through evaluated metadata into the response', async () => {
    currentPage = buildFakePage({
      metadata: {
        title: 'Hello',
        description: 'A page',
        ogImage: 'https://example.com/og.png',
        favicon: 'https://example.com/icon.ico',
      },
    });
    currentBrowser = buildFakeBrowser(currentPage);

    const res = await POST(makeReq({ url: 'https://example.com' }));
    const body = await res.json();
    expect(body.metadata).toEqual({
      title: 'Hello',
      description: 'A page',
      ogImage: 'https://example.com/og.png',
      favicon: 'https://example.com/icon.ico',
    });
  });
});

// --- Error handling ------------------------------------------------------

describe('POST /api/analyze-site: error handling', () => {
  beforeEach(() => {
    authMock.mockResolvedValue({ user: { id: 'u1', role: 'admin' } });
  });

  it('returns 500 when chromium.launch throws', async () => {
    launchShouldThrow = new Error('chromium dead');
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to analyze website' });
  });

  it('returns 500 when page.goto rejects', async () => {
    currentPage = buildFakePage();
    currentPage.goto = vi.fn(async () => {
      throw new Error('nav failed');
    });
    currentBrowser = buildFakeBrowser(currentPage);

    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(500);
    // Browser is still closed in the finally block.
    expect(currentBrowser.close).toHaveBeenCalled();
  });

  it('still returns the analysis result when browser.close throws', async () => {
    browserCloseShouldThrow = new Error('close failed');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it('returns 500 when uploadToS3 rejects', async () => {
    uploadToS3Mock.mockImplementationOnce(async () => {
      throw new Error('s3 down');
    });
    const res = await POST(makeReq({ url: 'https://example.com' }));
    expect(res.status).toBe(500);
  });
});
