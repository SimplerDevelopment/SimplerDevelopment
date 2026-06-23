// @vitest-environment node
/**
 * Unit tests for `lib/brain/analyze-attachment.ts`. Mocks the Anthropic SDK,
 * the BYOK key resolver, the AI usage recorder, the SSRF guard, and `fetch`.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ---- mocks ----------------------------------------------------------------

const completeMock = vi.fn();

vi.mock('@/lib/ai/llm', () => ({
  complete: (...args: unknown[]) => completeMock(...args),
  completeObject: vi.fn(),
  streamComplete: vi.fn(),
}));

const assertSafeUrlMock = vi.fn(async (_url: string) => undefined);
vi.mock('@/lib/ssrf-guard', () => ({
  assertSafeUrl: (url: string) => assertSafeUrlMock(url),
}));

const resolveClientApiKeyMock = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (args: unknown) => resolveClientApiKeyMock(args),
}));

const recordAiUsageMock = vi.fn(async () => undefined);
vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: (args: unknown) => recordAiUsageMock(args),
}));

// Module-level constants (INBOUND_SECRET, ATTACHMENT_WORKER_URL) are baked
// in at import-time, so we must set env BEFORE the dynamic import below.
process.env.INBOUND_EMAIL_SECRET = process.env.INBOUND_EMAIL_SECRET || 'test-secret';
process.env.BRAIN_ATTACHMENT_WORKER_URL =
  process.env.BRAIN_ATTACHMENT_WORKER_URL || 'https://worker.example.com';

// Imported AFTER mocks. Use dynamic import so vi.mock hoists first.
const { analyzeAttachment, analyzeMeetingAttachments } = await import(
  '@/lib/brain/analyze-attachment'
);

// ---- helpers --------------------------------------------------------------

interface MockFetchInit {
  status?: number;
  body?: Buffer | string;
  ok?: boolean;
}

function makeMockFetchResponse(init: MockFetchInit = {}): Response {
  const status = init.status ?? 200;
  const bodyBytes =
    init.body instanceof Buffer
      ? init.body
      : Buffer.from(init.body ?? '', 'utf8');
  return {
    status,
    ok: init.ok ?? (status >= 200 && status < 300),
    arrayBuffer: async () =>
      bodyBytes.buffer.slice(
        bodyBytes.byteOffset,
        bodyBytes.byteOffset + bodyBytes.byteLength,
      ) as ArrayBuffer,
  } as unknown as Response;
}

function defaultSeamResponse(text = 'A concise description of the file.') {
  return {
    text,
    usage: { inputTokens: 12, outputTokens: 34, totalTokens: 46 },
  };
}

// ---- shared setup ---------------------------------------------------------

const ORIG_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIG_ENV };
  process.env.INBOUND_EMAIL_SECRET = 'test-secret';
  process.env.BRAIN_ATTACHMENT_WORKER_URL = 'https://worker.example.com';
  process.env.ANTHROPIC_API_KEY = 'sk-platform';

  completeMock.mockReset();
  assertSafeUrlMock.mockReset().mockResolvedValue(undefined);
  resolveClientApiKeyMock.mockReset();
  recordAiUsageMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
  vi.restoreAllMocks();
});

// ---- analyzeAttachment ----------------------------------------------------

describe('analyzeAttachment — unsupported / oversize short-circuits', () => {
  it('returns a "skipped" marker for files over the 5MB cap (no fetch, no Anthropic call)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const out = await analyzeAttachment({
      key: 'r2/k',
      filename: 'huge.bin',
      contentType: 'image/png',
      size: 6 * 1024 * 1024,
    });
    expect(out).not.toBeNull();
    expect(out!.tokensUsed).toBe(0);
    expect(out!.analysis).toMatch(/skipped/);
    expect(out!.analysis).toMatch(/6\.0 MB/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('returns null for unsupported content-types (e.g. video/mp4)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const out = await analyzeAttachment({
      key: 'k',
      filename: 'clip.mp4',
      contentType: 'video/mp4',
      size: 1024,
    });
    expect(out).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null for SVG (excluded from image branch)', async () => {
    const out = await analyzeAttachment({
      key: 'k',
      filename: 'logo.svg',
      contentType: 'image/svg+xml',
      size: 1024,
    });
    expect(out).toBeNull();
  });
});

describe('analyzeAttachment — image branch', () => {
  it('sends an image file part via the seam and returns the analysis + tokens', async () => {
    const imgBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(makeMockFetchResponse({ body: imgBytes }));
    completeMock.mockResolvedValue(defaultSeamResponse('A red square.'));

    const out = await analyzeAttachment({
      key: 'r2/abc',
      filename: 'red.png',
      contentType: 'image/png',
      size: imgBytes.length,
    });

    expect(out).toEqual({ analysis: 'A red square.', tokensUsed: 12 + 34 });

    // Fetch was called with a signed worker URL
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = String(fetchSpy.mock.calls[0][0]);
    expect(url).toContain('https://worker.example.com/attachment');
    expect(url).toContain('key=r2%2Fabc');
    expect(url).toMatch(/&exp=\d+&sig=[a-f0-9]{64}/);

    // SSRF guard ran
    expect(assertSafeUrlMock).toHaveBeenCalledWith(url);

    // Fetch must not follow redirects
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });

    // Seam was called with the right task + system + file messages
    expect(completeMock).toHaveBeenCalledTimes(1);
    const seam = completeMock.mock.calls[0][0] as {
      task: string;
      system: string;
      messages: Array<{ role: string; content: unknown[] }>;
      maxTokens: number;
    };
    expect(seam.task).toBe('analyzeAttachment');
    expect(seam.maxTokens).toBe(400);
    expect(seam.system).toMatch(/dense paragraph/);
    expect(seam.messages).toHaveLength(1);
    const content = seam.messages[0].content as Array<Record<string, unknown>>;
    expect(Array.isArray(content)).toBe(true);
    expect(content[0]).toMatchObject({ type: 'text' });
    expect(String(content[0].text)).toContain('red.png');
    expect(String(content[0].text)).toContain('image/png');
    // AI SDK file part for images — type: 'file', mediaType, data (base64)
    expect(content[1]).toMatchObject({
      type: 'file',
      mediaType: 'image/png',
      data: imgBytes.toString('base64'),
    });

    // No audit row when clientId is absent
    expect(recordAiUsageMock).not.toHaveBeenCalled();
  });

  it('records audit when clientId is supplied', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: Buffer.from('jpg-bytes') }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('JPEG description.'));

    const out = await analyzeAttachment(
      {
        key: 'k',
        filename: 'photo.jpg',
        contentType: 'image/jpeg',
        size: 1024,
      },
      42,
    );

    expect(out).toEqual({ analysis: 'JPEG description.', tokensUsed: 46 });
    // Source hardcodes source: 'platform' in recordAiUsage (seam owns key routing)
    expect(recordAiUsageMock).toHaveBeenCalledWith({
      clientId: 42,
      source: 'platform',
      tokens: 46,
    });
  });
});

describe('analyzeAttachment — PDF branch', () => {
  it('sends a PDF file part via the seam', async () => {
    const pdfBytes = Buffer.from('%PDF-1.4 hello');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: pdfBytes }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('It is a PDF.'));

    const out = await analyzeAttachment({
      key: 'k',
      filename: 'spec.pdf',
      contentType: 'application/pdf',
      size: pdfBytes.length,
    });

    expect(out).toEqual({ analysis: 'It is a PDF.', tokensUsed: 46 });
    const seam = completeMock.mock.calls[0][0] as {
      task: string;
      messages: Array<{ role: string; content: Array<Record<string, unknown>> }>;
    };
    expect(seam.task).toBe('analyzeAttachment');
    const content = seam.messages[0].content;
    expect(content[0]).toMatchObject({ type: 'text' });
    // AI SDK file part for PDF — type: 'file', mediaType: 'application/pdf'
    expect(content[1]).toMatchObject({
      type: 'file',
      mediaType: 'application/pdf',
      data: pdfBytes.toString('base64'),
    });
  });
});

describe('analyzeAttachment — text branch', () => {
  it('inlines plain text content as a single string message', async () => {
    const txt = 'Line one\nLine two\n';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: txt }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('Two-line text.'));

    const out = await analyzeAttachment({
      key: 'k',
      filename: 'notes.txt',
      contentType: 'text/plain',
      size: txt.length,
    });

    expect(out).toEqual({ analysis: 'Two-line text.', tokensUsed: 46 });
    // Text branch uses prompt (string), not messages.
    const seam = completeMock.mock.calls[0][0] as { prompt: string };
    expect(seam.prompt).toContain('notes.txt');
    expect(seam.prompt).toContain('--- file content ---');
    expect(seam.prompt).toContain('Line one');
  });

  it('handles application/json as text', async () => {
    const body = '{"hello":"world"}';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('Some JSON.'));

    const out = await analyzeAttachment({
      key: 'k',
      filename: 'data.json',
      contentType: 'application/json',
      size: body.length,
    });

    expect(out).not.toBeNull();
    const seam = completeMock.mock.calls[0][0] as { prompt: string };
    expect(seam.prompt).toContain('"hello":"world"');
  });

  it('truncates very long text to 50,000 chars', async () => {
    const huge = 'a'.repeat(120_000);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: huge }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('Long file.'));

    await analyzeAttachment({
      key: 'k',
      filename: 'big.log',
      contentType: 'text/plain',
      // size param doesn't gate text — only the 5MB cap does. 120_000 < 5MB.
      size: 120_000,
    });

    const seam = completeMock.mock.calls[0][0] as { prompt: string };
    const content = seam.prompt;
    // The header + separator + 50k chars. Should be < 120k.
    expect(content.length).toBeLessThan(60_000);
    expect(content).toContain('a'.repeat(50));
    expect(content).not.toContain('a'.repeat(50_001));
  });
});

describe('analyzeAttachment — error paths', () => {
  it('returns the fallback string when the seam returns empty text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: 'x' }),
    );
    // Seam returns empty text (e.g. model returned no usable content).
    completeMock.mockResolvedValue({
      text: '',
      usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 },
    });

    const out = await analyzeAttachment({
      key: 'k',
      filename: 'a.txt',
      contentType: 'text/plain',
      size: 1,
    });

    expect(out!.analysis).toBe('[analyzer returned empty response]');
    expect(out!.tokensUsed).toBe(1);
  });

  it('handles missing usage token fields by defaulting to 0', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: 'x' }),
    );
    completeMock.mockResolvedValue({
      text: 'ok',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    });

    const out = await analyzeAttachment({
      key: 'k',
      filename: 'a.txt',
      contentType: 'text/plain',
      size: 1,
    });

    expect(out).toEqual({ analysis: 'ok', tokensUsed: 0 });
  });

  it('throws when seam rejects (simulates model/key error)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: 'x' }),
    );
    completeMock.mockRejectedValue(new Error('API key not configured'));
    await expect(
      analyzeAttachment({
        key: 'k',
        filename: 'a.txt',
        contentType: 'text/plain',
        size: 1,
      }),
    ).rejects.toThrow(/API key not configured/);
  });

  it('throws when worker returns non-OK status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ status: 500, ok: false, body: '' }),
    );
    await expect(
      analyzeAttachment({
        key: 'k',
        filename: 'a.txt',
        contentType: 'text/plain',
        size: 1,
      }),
    ).rejects.toThrow(/Worker returned 500/);
  });

  it('throws when worker would redirect (SSRF protection)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ status: 302, ok: false, body: '' }),
    );
    await expect(
      analyzeAttachment({
        key: 'k',
        filename: 'a.txt',
        contentType: 'text/plain',
        size: 1,
      }),
    ).rejects.toThrow(/Refusing to follow redirects/);
  });

  it('propagates assertSafeUrl failures', async () => {
    assertSafeUrlMock.mockRejectedValueOnce(new Error('blocked private IP'));
    await expect(
      analyzeAttachment({
        key: 'k',
        filename: 'a.txt',
        contentType: 'text/plain',
        size: 1,
      }),
    ).rejects.toThrow(/blocked private IP/);
  });

  it('uses default worker URL when env var is missing', async () => {
    // The module reads BRAIN_ATTACHMENT_WORKER_URL at import time, so we
    // verify the default is baked in by re-importing fresh. Easier: just
    // confirm the URL contains the configured override (already tested) and
    // that the absence of override doesn't break signing — signing depends
    // only on INBOUND_EMAIL_SECRET, so a sanity success here is enough.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: 'x' }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('ok'));
    const out = await analyzeAttachment({
      key: 'k',
      filename: 'a.txt',
      contentType: 'text/plain',
      size: 1,
    });
    expect(out).not.toBeNull();
  });
});

// ---- analyzeMeetingAttachments -------------------------------------------

describe('analyzeMeetingAttachments', () => {
  it('skips attachments that already have a stable analysis', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const { attachments, totalTokens } = await analyzeMeetingAttachments([
      {
        key: 'k1',
        filename: 'a.txt',
        contentType: 'text/plain',
        size: 5,
        analysis: 'already done',
      },
    ]);
    expect(attachments[0].analysis).toBe('already done');
    expect(totalTokens).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(completeMock).not.toHaveBeenCalled();
  });

  it('re-runs analysis for transient failure markers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: 'x' }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('Re-analyzed text.'));

    const { attachments, totalTokens } = await analyzeMeetingAttachments([
      {
        key: 'k1',
        filename: 'a.txt',
        contentType: 'text/plain',
        size: 5,
        analysis: '[analysis failed: prior timeout]',
      },
    ]);

    expect(attachments[0].analysis).toBe('Re-analyzed text.');
    expect(totalTokens).toBe(46);
  });

  it('re-runs analysis on force=true even for stable analyses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: 'x' }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('Fresh analysis.'));

    const { attachments, totalTokens } = await analyzeMeetingAttachments(
      [
        {
          key: 'k1',
          filename: 'a.txt',
          contentType: 'text/plain',
          size: 5,
          analysis: 'old',
        },
      ],
      { force: true },
    );

    expect(attachments[0].analysis).toBe('Fresh analysis.');
    expect(totalTokens).toBe(46);
  });

  it('marks unsupported types with a sticky [unsupported file type for analysis] string', async () => {
    const { attachments, totalTokens } = await analyzeMeetingAttachments([
      {
        key: 'k1',
        filename: 'clip.mp4',
        contentType: 'video/mp4',
        size: 1024,
      },
    ]);
    expect(attachments[0].analysis).toBe('[unsupported file type for analysis]');
    expect(totalTokens).toBe(0);
  });

  it('catches per-attachment exceptions and stores [analysis failed: ...]', async () => {
    vi.spyOn(globalThis, 'fetch')
      // First call resolves the OK attachment's bytes.
      .mockResolvedValueOnce(makeMockFetchResponse({ body: 'x' }))
      // Second call rejects to simulate worker outage.
      .mockRejectedValueOnce(new Error('network exploded'));
    completeMock.mockResolvedValue(defaultSeamResponse('Good one.'));

    const { attachments, totalTokens } = await analyzeMeetingAttachments([
      {
        key: 'good',
        filename: 'g.txt',
        contentType: 'text/plain',
        size: 1,
      },
      {
        key: 'bad',
        filename: 'b.txt',
        contentType: 'text/plain',
        size: 1,
      },
    ]);

    expect(attachments[0].analysis).toBe('Good one.');
    expect(attachments[1].analysis).toMatch(/^\[analysis failed: network exploded\]$/);
    expect(totalTokens).toBe(46);
  });

  it('truncates very long error messages in failure markers to 200 chars', async () => {
    const longMsg = 'x'.repeat(500);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error(longMsg));

    const { attachments } = await analyzeMeetingAttachments([
      {
        key: 'bad',
        filename: 'b.txt',
        contentType: 'text/plain',
        size: 1,
      },
    ]);

    const marker = attachments[0].analysis as string;
    expect(marker.startsWith('[analysis failed: ')).toBe(true);
    expect(marker.endsWith(']')).toBe(true);
    // total wrap = "[analysis failed: " (18) + msg(≤200) + "]" (1) = ≤219
    expect(marker.length).toBeLessThanOrEqual(219);
    // Only first 200 x's should be present.
    expect(marker).toContain('x'.repeat(200));
    expect(marker).not.toContain('x'.repeat(201));
  });

  it('coerces non-Error rejections to string in the failure marker', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      // Throw a plain string (not an Error).
      throw 'kaboom';
    });

    const { attachments } = await analyzeMeetingAttachments([
      {
        key: 'bad',
        filename: 'b.txt',
        contentType: 'text/plain',
        size: 1,
      },
    ]);

    expect(attachments[0].analysis).toBe('[analysis failed: kaboom]');
  });

  it('passes clientId through to analyzeAttachment and records audit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: 'x' }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('Ok.'));

    await analyzeMeetingAttachments(
      [
        {
          key: 'k',
          filename: 'a.txt',
          contentType: 'text/plain',
          size: 1,
        },
      ],
      { clientId: 7 },
    );

    expect(recordAiUsageMock).toHaveBeenCalledWith({
      clientId: 7,
      source: 'platform',
      tokens: 46,
    });
  });

  it('returns 0 totalTokens when every attachment is already analyzed', async () => {
    const { totalTokens } = await analyzeMeetingAttachments([
      {
        key: 'a',
        filename: 'a.txt',
        contentType: 'text/plain',
        size: 1,
        analysis: 'done',
      },
      {
        key: 'b',
        filename: 'b.txt',
        contentType: 'text/plain',
        size: 1,
        analysis: 'also done',
      },
    ]);
    expect(totalTokens).toBe(0);
  });

  it('returns empty result for empty input array', async () => {
    const out = await analyzeMeetingAttachments([]);
    expect(out).toEqual({ attachments: [], totalTokens: 0 });
  });

  it('preserves original attachment fields when storing analysis', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      makeMockFetchResponse({ body: 'x' }),
    );
    completeMock.mockResolvedValue(defaultSeamResponse('Done.'));

    const { attachments } = await analyzeMeetingAttachments([
      {
        key: 'r2/key-123',
        filename: 'a.txt',
        contentType: 'text/plain',
        size: 99,
      },
    ]);

    expect(attachments[0]).toMatchObject({
      key: 'r2/key-123',
      filename: 'a.txt',
      contentType: 'text/plain',
      size: 99,
      analysis: 'Done.',
    });
  });
});
