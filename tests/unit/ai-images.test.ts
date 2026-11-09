import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/plan-gate', () => ({
  checkAiPlanGate: vi.fn(async () => ({ allowed: true, tier: 'growth', hasAnyByok: false })),
}));

vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: vi.fn(async () => ({ key: 'sk-test-openai', source: 'platform' as const })),
}));

vi.mock('@/lib/ai/audit', () => ({
  recordAiUsage: vi.fn(async () => {}),
  recordAiImageUsage: vi.fn(async () => {}),
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async () => ({
    url: '/api/media/proxy/media/uuid.png',
    storedFilename: 'uuid.png',
    mimeType: 'image/png',
    fileSize: 1234,
  })),
}));

vi.mock('@/lib/db', () => ({
  db: {
    insert: () => ({
      values: () => ({
        returning: async () => [{ id: 7 }],
      }),
    }),
  },
}));

import {
  MAX_IMAGE_PROMPT_CHARS,
  buildImageRequest,
  generateContentImage,
  normalizeImagePrompt,
  parseImageResponse,
} from '@/lib/ai/images';
import { recordAiImageUsage } from '@/lib/ai/audit';

const B64 = Buffer.from('fakepngbytes').toString('base64');

describe('images helpers', () => {
  it('normalizeImagePrompt trunca al presupuesto', () => {
    expect(normalizeImagePrompt('x'.repeat(5000)).length).toBe(MAX_IMAGE_PROMPT_CHARS);
    expect(normalizeImagePrompt('  hola  ')).toBe('  hola  ');
  });

  it('buildImageRequest apunta a images/generations con bearer', () => {
    const { url, init } = buildImageRequest('un gato', 'sk-abc');
    expect(url).toContain('/images/generations');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-abc');
    expect(JSON.parse(init.body as string).prompt).toBe('un gato');
  });

  it('parseImageResponse decodifica b64_json', () => {
    expect(parseImageResponse({ data: [{ b64_json: B64 }] }).toString()).toBe('fakepngbytes');
  });

  it('parseImageResponse rechaza payloads sin imagen', () => {
    expect(() => parseImageResponse({ data: [] })).toThrow(/no image data/);
    expect(() => parseImageResponse(null)).toThrow(/no image data/);
  });
});

describe('generateContentImage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: [{ b64_json: B64 }] }),
    })));
  });

  it('orquesta gate → key → fetch → s3 → media → metering', async () => {
    const img = await generateContentImage({ clientId: 9, prompt: 'un gato astronauta', websiteId: 3, uploadedBy: 5 });
    expect(img.url).toBe('/api/media/proxy/media/uuid.png');
    expect(img.mediaId).toBe(7);
    expect(img.mimeType).toBe('image/png');
    expect(recordAiImageUsage).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: 9, source: 'platform', images: 1 }),
    );
  });

  it('rechaza prompt vacío', async () => {
    await expect(generateContentImage({ clientId: 9, prompt: '   ' })).rejects.toThrow(/prompt is required/);
  });

  it('propaga el fallo del proveedor como 502 del caller', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 429 })));
    await expect(generateContentImage({ clientId: 9, prompt: 'x' })).rejects.toThrow(/429/);
  });
});
