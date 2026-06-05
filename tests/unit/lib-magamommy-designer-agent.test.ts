// @vitest-environment node
/**
 * Unit tests for lib/magamommy/agents/designer.ts
 *
 * Exports under test:
 *   - buildLifestyleMockupPrompt (pure transform — no mocks needed)
 *   - generateOpenAIImage        (wraps global fetch — mock fetch)
 *   - runDesigner                (orchestrator — mocks db, resolveClientApiKey,
 *                                 uploadToS3, compositeArtworkOnShirt, fetch)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── External dep mocks (declared BEFORE importing module under test) ──────────

// Mock db (drizzle query builder chain)
const mockDbSelect = vi.fn();
const mockDbInsert = vi.fn();
vi.mock('@/lib/db', () => ({
  db: {
    select: (...args: unknown[]) => mockDbSelect(...args),
    insert: (...args: unknown[]) => mockDbInsert(...args),
  },
}));

// Mock drizzle-orm helpers so the import succeeds
vi.mock('drizzle-orm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('drizzle-orm')>();
  return { ...actual };
});

// Mock db/schema exports
vi.mock('@/lib/db/schema', () => ({
  clientWebsites: { id: 'clientWebsites.id', clientId: 'clientWebsites.clientId' },
  designs: { $inferSelect: {} },
  magamommyConcepts: { id: 'magamommyConcepts.id', websiteId: 'magamommyConcepts.websiteId' },
  productDesignSurfaces: { productId: 'productDesignSurfaces.productId', displayOrder: 'productDesignSurfaces.displayOrder' },
}));

// Mock resolveClientApiKey
const mockResolveClientApiKey = vi.fn();
vi.mock('@/lib/ai/resolve-client-key', () => ({
  resolveClientApiKey: (...args: unknown[]) => mockResolveClientApiKey(...args),
}));

// Mock uploadToS3
const mockUploadToS3 = vi.fn();
vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: (...args: unknown[]) => mockUploadToS3(...args),
}));

// Mock compositeArtworkOnShirt
const mockCompositeArtworkOnShirt = vi.fn();
vi.mock('@/lib/magamommy/composite', () => ({
  compositeArtworkOnShirt: (...args: unknown[]) => mockCompositeArtworkOnShirt(...args),
}));

// ── Import module under test (after all vi.mock calls) ────────────────────────
const {
  buildLifestyleMockupPrompt,
  generateOpenAIImage,
  runDesigner,
} = await import('@/lib/magamommy/agents/designer');

// ── Shared fixtures ───────────────────────────────────────────────────────────

const basePalette = [
  { name: 'Red', hex: '#FF0000' },
  { name: 'Blue', hex: '#0000FF' },
];

const baseConcept = {
  visualPrompt: 'A bald eagle clutching a flag',
  palette: basePalette,
  slogan: 'MAGA MOMMY',
  tagline: 'Patriot Mom Energy',
  placement: 'front',
};

// Helper: build a realistic drizzle select chain mock
function makeSelectChain(rows: unknown[]) {
  const chain = {
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  chain.orderBy.mockResolvedValue(rows);
  return chain;
}

function makeInsertChain(rows: unknown[]) {
  const chain = {
    values: vi.fn(),
    returning: vi.fn(),
  };
  chain.values.mockReturnValue(chain);
  chain.returning.mockResolvedValue(rows);
  return chain;
}

// ── buildLifestyleMockupPrompt ────────────────────────────────────────────────

describe('buildLifestyleMockupPrompt', () => {
  it('produces a tee prompt by default', () => {
    const result = buildLifestyleMockupPrompt(baseConcept);
    expect(result).toContain('MAGA MOMMY');
    expect(result).toContain('crew-neck t-shirt');
    expect(result).toContain('#FF0000, #0000FF');
    expect(result).toContain('Patriot Mom Energy');
    expect(result).toContain('clean white');
  });

  it('includes front-shot instruction when placement=front', () => {
    const result = buildLifestyleMockupPrompt({ ...baseConcept, placement: 'front' });
    expect(result).toContain('show the front of the shirt clearly');
  });

  it('includes back-shot instruction when placement=back', () => {
    const result = buildLifestyleMockupPrompt({ ...baseConcept, placement: 'back' });
    expect(result).toContain('show the model turned slightly so the back print is clearly visible');
  });

  it('uses true black description for black garments', () => {
    const result = buildLifestyleMockupPrompt({ ...baseConcept, garmentColor: 'black' });
    expect(result).toContain('true black');
    expect(result).toContain('light cream');
  });

  it('uses heather grey description for grey garments', () => {
    const result = buildLifestyleMockupPrompt({ ...baseConcept, garmentColor: 'heather grey' });
    expect(result).toContain('heather grey');
  });

  it('uses flag red description for red garments', () => {
    const result = buildLifestyleMockupPrompt({ ...baseConcept, garmentColor: 'red' });
    expect(result).toContain('flag red');
  });

  it('uses deep navy description for navy garments', () => {
    const result = buildLifestyleMockupPrompt({ ...baseConcept, garmentColor: 'navy blue' });
    expect(result).toContain('deep navy');
  });

  it('passes through unknown garment colors verbatim', () => {
    const result = buildLifestyleMockupPrompt({ ...baseConcept, garmentColor: 'coral' });
    expect(result).toContain('coral');
  });

  it('renders hoodie prompt with kangaroo pocket details', () => {
    const result = buildLifestyleMockupPrompt({ ...baseConcept, garmentType: 'hoodie' });
    expect(result).toContain('hoodie');
    expect(result).toContain('kangaroo pocket');
    expect(result).toContain('MAGA MOMMY');
  });

  it('hoodie back placement shows back print instruction', () => {
    const result = buildLifestyleMockupPrompt({
      ...baseConcept,
      garmentType: 'hoodie',
      placement: 'back',
    });
    expect(result).toContain('show the model turned slightly so the back print is clearly visible');
  });

  it('hoodie front placement shows front instruction', () => {
    const result = buildLifestyleMockupPrompt({
      ...baseConcept,
      garmentType: 'hoodie',
      placement: 'front',
    });
    expect(result).toContain('show the front of the hoodie clearly');
  });

  it('renders onesie prompt with baby/nursery details', () => {
    const result = buildLifestyleMockupPrompt({ ...baseConcept, garmentType: 'onesie' });
    expect(result).toContain('onesie');
    expect(result).toContain('nursery');
    expect(result).toContain('baby');
    expect(result).toContain('MAGA MOMMY');
  });

  it('onesie back placement shows back print instruction', () => {
    const result = buildLifestyleMockupPrompt({
      ...baseConcept,
      garmentType: 'onesie',
      placement: 'back',
    });
    expect(result).toContain('show the back of the onesie clearly');
  });

  it('onesie front placement shows front print instruction', () => {
    const result = buildLifestyleMockupPrompt({
      ...baseConcept,
      garmentType: 'onesie',
      placement: 'front',
    });
    expect(result).toContain('show the front of the onesie clearly');
  });

  it('includes all palette hex values in the output', () => {
    const palette = [
      { name: 'Alpha', hex: '#AABBCC' },
      { name: 'Beta', hex: '#112233' },
    ];
    const result = buildLifestyleMockupPrompt({ ...baseConcept, palette });
    expect(result).toContain('#AABBCC, #112233');
  });

  it('includes STRICT REQUIREMENTS section', () => {
    const result = buildLifestyleMockupPrompt(baseConcept);
    expect(result).toContain('STRICT REQUIREMENTS:');
  });
});

// ── generateOpenAIImage ───────────────────────────────────────────────────────

describe('generateOpenAIImage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns a Buffer from b64_json on success', async () => {
    const fakeB64 = Buffer.from('fake-image-data').toString('base64');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: fakeB64 }] }),
    } as Response);

    const result = await generateOpenAIImage({
      openaiKey: 'sk-test',
      prompt: 'A great eagle',
      size: '1024x1024',
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.toString()).toBe('fake-image-data');
  });

  it('sends transparent background when transparent=true', async () => {
    const fakeB64 = Buffer.from('img').toString('base64');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: fakeB64 }] }),
    } as Response);

    await generateOpenAIImage({
      openaiKey: 'sk-test',
      prompt: 'Transparent artwork',
      size: '1024x1024',
      transparent: true,
    });

    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);
    expect(body.background).toBe('transparent');
  });

  it('does NOT send background field when transparent is omitted', async () => {
    const fakeB64 = Buffer.from('img').toString('base64');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: fakeB64 }] }),
    } as Response);

    await generateOpenAIImage({
      openaiKey: 'sk-test',
      prompt: 'Solid artwork',
      size: '1024x1536',
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body.background).toBeUndefined();
  });

  it('sends the correct Authorization header', async () => {
    const fakeB64 = Buffer.from('img').toString('base64');
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ b64_json: fakeB64 }] }),
    } as Response);

    await generateOpenAIImage({
      openaiKey: 'sk-mykey',
      prompt: 'test',
      size: '1024x1024',
    });

    expect(mockFetch.mock.calls[0][1]?.headers).toMatchObject({
      Authorization: 'Bearer sk-mykey',
    });
  });

  it('throws with error.message from JSON body on HTTP error', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'Rate limited' } }),
    } as Response);

    await expect(
      generateOpenAIImage({ openaiKey: 'sk-test', prompt: 'x', size: '1024x1024' }),
    ).rejects.toThrow('Rate limited');
  });

  it('throws with generic status message when error body is not JSON', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Internal Server Error',
    } as Response);

    await expect(
      generateOpenAIImage({ openaiKey: 'sk-test', prompt: 'x', size: '1024x1024' }),
    ).rejects.toThrow('OpenAI returned 500');
  });

  it('throws when b64_json is missing from response', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{}] }),
    } as Response);

    await expect(
      generateOpenAIImage({ openaiKey: 'sk-test', prompt: 'x', size: '1024x1024' }),
    ).rejects.toThrow('OpenAI returned no b64_json image data');
  });

  it('throws when data array is empty', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    } as Response);

    await expect(
      generateOpenAIImage({ openaiKey: 'sk-test', prompt: 'x', size: '1024x1024' }),
    ).rejects.toThrow('OpenAI returned no b64_json image data');
  });
});

// ── runDesigner ───────────────────────────────────────────────────────────────

describe('runDesigner', () => {
  const fakeB64 = Buffer.from('artwork').toString('base64');

  const mockConcept = {
    id: 7,
    websiteId: 1,
    visualPrompt: 'Eagle soaring',
    palette: basePalette,
    slogan: 'MAGA MOMMY',
    tagline: 'Patriot Mom Energy',
    placement: 'front',
  };

  const mockSurface = {
    id: 3,
    productId: 10,
    slug: 'front',
    canvasWidth: 3000,
    canvasHeight: 3600,
    printAreaX: 500,
    printAreaY: 600,
    printAreaWidth: 1200,
    printAreaHeight: 1200,
    printDpi: 300,
    mockupImage: 'https://cdn.example.com/mockup.png',
    displayOrder: 0,
  };

  const mockDesignRow = {
    id: 'uuid-design-123',
    websiteId: 1,
    productId: 10,
    isTemplate: true,
    status: 'rendered',
    name: 'MAGA MOMMY',
    thumbnailUrl: 'https://s3.example.com/lifestyle.png',
    renderedUrl: 'https://s3.example.com/lifestyle.png',
  };

  function setupHappyPath() {
    // fetch (mockup image + 2x OpenAI image calls)
    vi.stubGlobal('fetch', vi.fn()
      // First call: mockup image fetch (absolute URL)
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('mockup-data').buffer,
      } as Response)
      // Second call: artwork generation
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeB64 }] }),
      } as Response)
      // Third call: lifestyle generation
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeB64 }] }),
      } as Response),
    );

    // db.select → concept, then siteRow, then surfaces
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([mockConcept]))
      .mockReturnValueOnce(makeSelectChain([{ clientId: 2 }]))
      .mockReturnValueOnce(makeSelectChain([mockSurface]));

    mockResolveClientApiKey.mockResolvedValue({ key: 'sk-openai-key' });
    mockCompositeArtworkOnShirt.mockResolvedValue(Buffer.from('composite'));
    mockUploadToS3
      .mockResolvedValueOnce({ url: 'https://s3.example.com/artwork.png' })
      .mockResolvedValueOnce({ url: 'https://s3.example.com/mockup.png' })
      .mockResolvedValueOnce({ url: 'https://s3.example.com/lifestyle.png' });

    mockDbInsert.mockReturnValue(makeInsertChain([mockDesignRow]));
  }

  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns DesignerResult with designId, artworkUrl, frontMockupUrl on happy path', async () => {
    setupHappyPath();

    const result = await runDesigner({
      websiteId: 1,
      clientId: 2,
      conceptId: 7,
      templateProductId: 10,
    });

    expect(result.designId).toBe('uuid-design-123');
    expect(result.artworkUrl).toBe('https://s3.example.com/artwork.png');
    expect(result.frontMockupUrl).toBe('https://s3.example.com/lifestyle.png');
    expect(result.backMockupUrl).toBeUndefined();
  });

  it('sets backMockupUrl when placement is back', async () => {
    const backConcept = { ...mockConcept, placement: 'back' };
    const backSurface = { ...mockSurface, slug: 'back' };

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('mockup').buffer,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeB64 }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeB64 }] }),
      } as Response),
    );

    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([backConcept]))
      .mockReturnValueOnce(makeSelectChain([{ clientId: 2 }]))
      .mockReturnValueOnce(makeSelectChain([backSurface]));

    mockResolveClientApiKey.mockResolvedValue({ key: 'sk-openai-key' });
    mockCompositeArtworkOnShirt.mockResolvedValue(Buffer.from('composite'));
    mockUploadToS3
      .mockResolvedValueOnce({ url: 'https://s3.example.com/artwork.png' })
      .mockResolvedValueOnce({ url: 'https://s3.example.com/back-mockup.png' })
      .mockResolvedValueOnce({ url: 'https://s3.example.com/lifestyle.png' });

    mockDbInsert.mockReturnValue(makeInsertChain([{ ...mockDesignRow, id: 'uuid-back-design' }]));

    const result = await runDesigner({
      websiteId: 1,
      clientId: 2,
      conceptId: 7,
      templateProductId: 10,
    });

    expect(result.backMockupUrl).toBe('https://s3.example.com/lifestyle.png');
  });

  it('throws [designer] error when concept is not found', async () => {
    mockDbSelect.mockReturnValueOnce(makeSelectChain([]));

    await expect(
      runDesigner({ websiteId: 1, clientId: 2, conceptId: 99, templateProductId: 10 }),
    ).rejects.toThrow('[designer] concept 99 not found for website 1');
  });

  it('throws [designer] error when website is not found', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([mockConcept]))
      .mockReturnValueOnce(makeSelectChain([]));

    await expect(
      runDesigner({ websiteId: 1, clientId: 2, conceptId: 7, templateProductId: 10 }),
    ).rejects.toThrow('[designer] website 1 not found');
  });

  it('throws [designer] error on clientId mismatch', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([mockConcept]))
      .mockReturnValueOnce(makeSelectChain([{ clientId: 999 }]));

    await expect(
      runDesigner({ websiteId: 1, clientId: 2, conceptId: 7, templateProductId: 10 }),
    ).rejects.toThrow('[designer] clientId mismatch: input=2 actual=999');
  });

  it('throws [designer] error when no surfaces exist', async () => {
    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([mockConcept]))
      .mockReturnValueOnce(makeSelectChain([{ clientId: 2 }]))
      .mockReturnValueOnce(makeSelectChain([]));

    await expect(
      runDesigner({ websiteId: 1, clientId: 2, conceptId: 7, templateProductId: 10 }),
    ).rejects.toThrow('[designer] no product_design_surfaces for templateProductId=10');
  });

  it('throws [designer] error when OpenAI key resolution fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('mockup').buffer,
      } as Response),
    );

    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([mockConcept]))
      .mockReturnValueOnce(makeSelectChain([{ clientId: 2 }]))
      .mockReturnValueOnce(makeSelectChain([mockSurface]));

    mockResolveClientApiKey.mockRejectedValue(new Error('no key configured'));

    await expect(
      runDesigner({ websiteId: 1, clientId: 2, conceptId: 7, templateProductId: 10 }),
    ).rejects.toThrow('[designer] OpenAI key resolution failed: no key configured');
  });

  it('throws [designer] error when artwork generation fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('mockup').buffer,
      } as Response)
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'server error',
      } as Response),
    );

    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([mockConcept]))
      .mockReturnValueOnce(makeSelectChain([{ clientId: 2 }]))
      .mockReturnValueOnce(makeSelectChain([mockSurface]));

    mockResolveClientApiKey.mockResolvedValue({ key: 'sk-openai-key' });

    await expect(
      runDesigner({ websiteId: 1, clientId: 2, conceptId: 7, templateProductId: 10 }),
    ).rejects.toThrow('[designer] gpt-image-1 generation failed');
  });

  it('throws [designer] error when composite fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('mockup').buffer,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeB64 }] }),
      } as Response),
    );

    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([mockConcept]))
      .mockReturnValueOnce(makeSelectChain([{ clientId: 2 }]))
      .mockReturnValueOnce(makeSelectChain([mockSurface]));

    mockResolveClientApiKey.mockResolvedValue({ key: 'sk-openai-key' });
    mockCompositeArtworkOnShirt.mockRejectedValue(new Error('sharp error'));

    await expect(
      runDesigner({ websiteId: 1, clientId: 2, conceptId: 7, templateProductId: 10 }),
    ).rejects.toThrow('[designer] composite failed: sharp error');
  });

  it('throws [designer] error when S3 artwork upload fails', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('mockup').buffer,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeB64 }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeB64 }] }),
      } as Response),
    );

    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([mockConcept]))
      .mockReturnValueOnce(makeSelectChain([{ clientId: 2 }]))
      .mockReturnValueOnce(makeSelectChain([mockSurface]));

    mockResolveClientApiKey.mockResolvedValue({ key: 'sk-openai-key' });
    mockCompositeArtworkOnShirt.mockResolvedValue(Buffer.from('composite'));
    mockUploadToS3.mockRejectedValue(new Error('S3 timeout'));

    await expect(
      runDesigner({ websiteId: 1, clientId: 2, conceptId: 7, templateProductId: 10 }),
    ).rejects.toThrow('[designer] S3 upload (artwork) failed: S3 timeout');
  });

  it('throws [designer] error when designs insert returns no row', async () => {
    setupHappyPath();
    mockDbInsert.mockReturnValue(makeInsertChain([]));

    await expect(
      runDesigner({ websiteId: 1, clientId: 2, conceptId: 7, templateProductId: 10 }),
    ).rejects.toThrow('[designer] designs insert returned no row');
  });

  it('falls back to first surface when placement slug does not match any surface', async () => {
    // concept placement='front' but only a 'back' surface available
    const onlyBackSurface = { ...mockSurface, slug: 'back' };

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () => Buffer.from('mockup').buffer,
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeB64 }] }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ b64_json: fakeB64 }] }),
      } as Response),
    );

    mockDbSelect
      .mockReturnValueOnce(makeSelectChain([mockConcept]))  // concept has placement='front'
      .mockReturnValueOnce(makeSelectChain([{ clientId: 2 }]))
      .mockReturnValueOnce(makeSelectChain([onlyBackSurface]));

    mockResolveClientApiKey.mockResolvedValue({ key: 'sk-openai-key' });
    mockCompositeArtworkOnShirt.mockResolvedValue(Buffer.from('composite'));
    mockUploadToS3
      .mockResolvedValueOnce({ url: 'https://s3.example.com/artwork.png' })
      .mockResolvedValueOnce({ url: 'https://s3.example.com/mockup.png' })
      .mockResolvedValueOnce({ url: 'https://s3.example.com/lifestyle.png' });

    mockDbInsert.mockReturnValue(makeInsertChain([mockDesignRow]));

    // Should not throw — falls back to surfaces[0]
    const result = await runDesigner({
      websiteId: 1,
      clientId: 2,
      conceptId: 7,
      templateProductId: 10,
    });

    expect(result.designId).toBe('uuid-design-123');
  });
});
