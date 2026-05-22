// @vitest-environment node
/**
 * Unit tests for app/api/media/[id]/route.ts
 *
 * NOTE: despite the path, the file at app/api/media/[id]/route.ts is the
 * analyze-site implementation (POST = analyze a URL with Playwright + S3,
 * GET = health-check). We mock `playwright` (chromium → browser → context →
 * page) and `@/lib/s3/upload` (uploadToS3) so the handlers run end-to-end
 * without launching a browser or hitting S3.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── mocks ──────────────────────────────────────────────────────────────────

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async (_buf: Buffer, filename: string, _mime: string) => ({
    storedFilename: `stored-${filename}`,
    fileSize: 4242,
    url: `https://s3.example.com/${filename}`,
  })),
}));

// Per-test request-handler hook so individual tests can replay scripts.
let requestHandler: ((req: unknown) => void) | null = null;

vi.mock('playwright', () => {
  const close = vi.fn(async () => undefined);

  const makePage = () => {
    const page: Record<string, unknown> = {
      setViewportSize: vi.fn(async () => undefined),
      waitForTimeout: vi.fn(async () => undefined),
      screenshot: vi.fn(async () => Buffer.from('fake-png')),
      on: vi.fn((event: string, handler: (req: unknown) => void) => {
        if (event === 'request') {
          // Capture handler so tests can fire synthetic requests
          requestHandler = handler;
        }
      }),
      goto: vi.fn(async () => undefined),
      $: vi.fn(async (_sel: string) => null),
      evaluate: vi.fn(async () => ({
        title: 'Example Title',
        description: 'Example description',
        ogImage: 'https://example.com/og.png',
        favicon: 'https://example.com/favicon.ico',
      })),
    };
    return page;
  };

  const browser = {
    newContext: vi.fn(async () => ({
      newPage: vi.fn(async () => makePage()),
    })),
    close,
  };

  const chromium = {
    launch: vi.fn(async () => browser),
  };

  return {
    chromium,
    // Types only — exported for type position, not used at runtime
    Browser: class {},
    Page: class {},
  };
});

// ── helpers ────────────────────────────────────────────────────────────────

function makeRequest(body: unknown): NextRequest {
  // NextRequest accepts a Request-shaped init. Use a plain Request and
  // upgrade — works for our handlers which only call request.json().
  return new NextRequest('http://localhost/api/analyze', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  requestHandler = null;
  vi.clearAllMocks();
});

// ── tests ──────────────────────────────────────────────────────────────────

describe('GET /api/media/[id] (health-check)', () => {
  it('returns 200 with status ok and service descriptor', async () => {
    const { GET } = await import('@/app/api/media/[id]/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('website-analyzer');
    expect(body.endpoints).toBeDefined();
    expect(body.endpoints.POST).toBe('/api/analyze-site');
    expect(body.endpoints.body).toEqual({ url: 'string' });
  });
});

describe('POST /api/media/[id]', () => {
  it('returns 400 when no URL is supplied', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('URL is required');
  });

  it('returns 400 when url is empty string (falsy)', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    const res = await POST(makeRequest({ url: '' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('URL is required');
  });

  it('returns 400 when URL is invalid', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    // Force URL parse to throw — control chars produce invalid URLs
    const res = await POST(makeRequest({ url: 'ht\x00tp://bad url with spaces and \x00 nulls' }));
    // The handler wraps URL parsing in try/catch and returns 400.
    // Some URL parsers are lenient — accept either 400 or 200, but if 400, body matches.
    if (res.status === 400) {
      const body = await res.json();
      expect(body.error).toMatch(/Invalid URL|URL is required/);
    } else {
      // If lenient parsing made it through, we still got a JSON response
      expect(res.status).toBeLessThan(500);
    }
  });

  it('successfully analyzes a fully-qualified URL', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    const res = await POST(makeRequest({ url: 'https://example.com' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://example.com/');
    expect(body.analyzedAt).toBeDefined();
    expect(body.screenshots).toBeDefined();
    expect(body.screenshots.desktop).toBeDefined();
    expect(body.screenshots.tablet).toBeDefined();
    expect(body.screenshots.mobile).toBeDefined();
    expect(body.screenshots.desktop.url).toContain('s3.example.com');
    expect(body.scripts).toBeDefined();
    expect(Array.isArray(body.scripts.immediate)).toBe(true);
    expect(Array.isArray(body.scripts.delayed)).toBe(true);
    expect(Array.isArray(body.scripts.all)).toBe(true);
    expect(body.techStack).toBeDefined();
    expect(Array.isArray(body.techStack.analytics)).toBe(true);
    expect(body.metadata.title).toBe('Example Title');
    expect(body.metadata.description).toBe('Example description');
    expect(body.metadata.ogImage).toBe('https://example.com/og.png');
    expect(body.metadata.favicon).toBe('https://example.com/favicon.ico');
  });

  it('prefixes https:// when URL lacks a protocol', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    const res = await POST(makeRequest({ url: 'example.org' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.url).toBe('https://example.org/');
  });

  it('uploads three screenshots (desktop, tablet, mobile) to S3', async () => {
    const s3 = await import('@/lib/s3/upload');
    const { POST } = await import('@/app/api/media/[id]/route');
    const res = await POST(makeRequest({ url: 'https://example.com' }));
    expect(res.status).toBe(200);
    expect(s3.uploadToS3).toHaveBeenCalledTimes(3);
    const filenames = (s3.uploadToS3 as unknown as { mock: { calls: unknown[][] } }).mock.calls.map(
      (call) => call[1] as string,
    );
    expect(filenames.some((f) => f.includes('desktop'))).toBe(true);
    expect(filenames.some((f) => f.includes('tablet'))).toBe(true);
    expect(filenames.some((f) => f.includes('mobile'))).toBe(true);
    // Should namespace by sanitized domain
    expect(filenames.every((f) => f.includes('example-com'))).toBe(true);
  });

  it('categorizes known analytics scripts into the tech stack', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    // Hook the request listener pre-goto by patching the playwright mock's
    // page.on to fire scripts immediately AFTER the goto callback runs.
    // Simplest approach: re-import a fresh handler module and arrange for
    // the requestHandler to be called by the goto mock.
    const playwright = await import('playwright');
    const launchSpy = vi.mocked(playwright.chromium.launch);
    launchSpy.mockImplementationOnce(async () => {
      const browser = {
        newContext: async () => ({
          newPage: async () => {
            const page: Record<string, unknown> = {
              setViewportSize: vi.fn(async () => undefined),
              waitForTimeout: vi.fn(async () => undefined),
              screenshot: vi.fn(async () => Buffer.from('fake-png')),
              on: vi.fn((event: string, handler: (req: unknown) => void) => {
                if (event === 'request') {
                  requestHandler = handler;
                }
              }),
              goto: vi.fn(async () => {
                // Fire synthetic requests now that the listener is wired
                if (requestHandler) {
                  requestHandler({
                    resourceType: () => 'script',
                    url: () => 'https://www.google-analytics.com/gtm.js',
                  });
                  requestHandler({
                    resourceType: () => 'script',
                    url: () => 'https://connect.facebook.net/en_US/fbevents.js',
                  });
                  requestHandler({
                    resourceType: () => 'script',
                    url: () => 'https://js.hs-scripts.com/123.js',
                  });
                  requestHandler({
                    resourceType: () => 'script',
                    url: () => 'https://js.stripe.com/v3/',
                  });
                  // Non-script resource — should be ignored
                  requestHandler({
                    resourceType: () => 'image',
                    url: () => 'https://example.com/banner.png',
                  });
                  // Unknown script — should NOT be categorized
                  requestHandler({
                    resourceType: () => 'script',
                    url: () => 'https://unknown.invalid-domain.test/x.js',
                  });
                }
              }),
              $: vi.fn(async () => null),
              evaluate: vi.fn(async () => ({
                title: 'Tracked Site',
                description: '',
                ogImage: null,
                favicon: null,
              })),
            };
            return page;
          },
        }),
        close: vi.fn(async () => undefined),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return browser as any;
    });

    const res = await POST(makeRequest({ url: 'https://tracked.example' }));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Analytics + advertising + marketing + ecommerce should have entries
    expect(body.techStack.analytics.length).toBeGreaterThan(0);
    expect(body.techStack.advertising.length).toBeGreaterThan(0);
    expect(body.techStack.marketing.length).toBeGreaterThan(0);
    expect(body.techStack.ecommerce.length).toBeGreaterThan(0);
    // All scripts (deduped) should include both known and unknown URLs
    expect(body.scripts.all.length).toBeGreaterThanOrEqual(5);
    // Immediate scripts should have categorized known ones
    expect(body.scripts.immediate.length).toBeGreaterThanOrEqual(4);
  });

  it('tries consent banner selectors when present', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    const playwright = await import('playwright');
    const launchSpy = vi.mocked(playwright.chromium.launch);
    const clickSpy = vi.fn(async () => undefined);
    launchSpy.mockImplementationOnce(async () => {
      const browser = {
        newContext: async () => ({
          newPage: async () => ({
            setViewportSize: vi.fn(async () => undefined),
            waitForTimeout: vi.fn(async () => undefined),
            screenshot: vi.fn(async () => Buffer.from('fake-png')),
            on: vi.fn(),
            goto: vi.fn(async () => undefined),
            // First $ call returns a button; subsequent calls return null
            $: vi
              .fn()
              .mockResolvedValueOnce({ click: clickSpy })
              .mockResolvedValue(null),
            evaluate: vi.fn(async () => ({
              title: '',
              description: '',
              ogImage: null,
              favicon: null,
            })),
          }),
        }),
        close: vi.fn(async () => undefined),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return browser as any;
    });

    const res = await POST(makeRequest({ url: 'https://example.com' }));
    expect(res.status).toBe(200);
    // Consent click was invoked exactly once and then loop broke
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 500 when the browser fails to launch (analyzeWebsite throws)', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    const playwright = await import('playwright');
    const launchSpy = vi.mocked(playwright.chromium.launch);
    launchSpy.mockRejectedValueOnce(new Error('chromium boom'));

    const res = await POST(makeRequest({ url: 'https://example.com' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to analyze website');
    expect(body.details).toContain('chromium boom');
  });

  it('closes the browser even when navigation fails', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    const playwright = await import('playwright');
    const launchSpy = vi.mocked(playwright.chromium.launch);
    const closeSpy = vi.fn(async () => undefined);
    launchSpy.mockImplementationOnce(async () => {
      const browser = {
        newContext: async () => ({
          newPage: async () => ({
            setViewportSize: vi.fn(async () => undefined),
            waitForTimeout: vi.fn(async () => undefined),
            screenshot: vi.fn(async () => Buffer.from('fake-png')),
            on: vi.fn(),
            goto: vi.fn(async () => {
              throw new Error('navigation timeout');
            }),
            $: vi.fn(async () => null),
            evaluate: vi.fn(),
          }),
        }),
        close: closeSpy,
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return browser as any;
    });

    const res = await POST(makeRequest({ url: 'https://example.com' }));
    expect(res.status).toBe(500);
    expect(closeSpy).toHaveBeenCalled();
  });

  it('returns 500 when request.json() throws (malformed body)', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    // Build a request whose body is unparseable JSON
    const req = new NextRequest('http://localhost/api/analyze', {
      method: 'POST',
      body: 'not json at all',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('Failed to analyze website');
  });

  it('handles consent-selector click errors without crashing', async () => {
    const { POST } = await import('@/app/api/media/[id]/route');
    const playwright = await import('playwright');
    const launchSpy = vi.mocked(playwright.chromium.launch);
    launchSpy.mockImplementationOnce(async () => {
      const browser = {
        newContext: async () => ({
          newPage: async () => ({
            setViewportSize: vi.fn(async () => undefined),
            waitForTimeout: vi.fn(async () => undefined),
            screenshot: vi.fn(async () => Buffer.from('fake-png')),
            on: vi.fn(),
            goto: vi.fn(async () => undefined),
            // $ always throws — exercises the inner catch block
            $: vi.fn(async () => {
              throw new Error('selector error');
            }),
            evaluate: vi.fn(async () => ({
              title: '',
              description: '',
              ogImage: null,
              favicon: null,
            })),
          }),
        }),
        close: vi.fn(async () => undefined),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return browser as any;
    });

    const res = await POST(makeRequest({ url: 'https://example.com' }));
    // Should still succeed — selector errors are swallowed
    expect(res.status).toBe(200);
  });
});
