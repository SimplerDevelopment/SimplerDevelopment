// @vitest-environment node
/**
 * Companion coverage for lib/mcp/approvals.ts.
 *
 * The sibling mcp-approvals.test.ts covers: post CRUD, pitch_deck CRUD,
 * pitch_deck_slides (replace/add), proposals CRUD, email_campaign CRUD,
 * registerApprovalToolsOnSdk scaffolding.
 *
 * This file covers the UNCOVERED branches:
 *   - pitch_deck:upload_html (success + error paths)
 *   - pitch_deck:publish_all (including publishOneSlideDraft variants)
 *   - pitch_deck_slide_draft:publish (single-slide publish paths)
 *   - site:update  (customCode write vs. metadata write)
 *   - site:publish
 *   - site_nav:create / update / delete / publish / publish_all
 *   - block_template:create / update / delete / publish
 *   - taxonomy:create  (category + tag + duplicate error paths)
 *   - post_taxonomy:update  (categoryIds + tagIds variants)
 *   - post:upload_html  (success + error paths)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── module mocks ──────────────────────────────────────────────────────────

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

vi.mock('@/lib/email', () => ({
  renderBlocksToEmailHtml: vi.fn(() => '<html>rendered</html>'),
}));

vi.mock('@/lib/email/campaign-send', () => ({
  executeCampaignSend: vi.fn(async (id: number) => ({ sent: true, campaignId: id })),
}));

vi.mock('@/lib/realtime/internal-publisher', () => ({
  publishEntityFromDb: vi.fn(async () => undefined),
}));

vi.mock('@/lib/s3/upload', () => ({
  uploadToS3: vi.fn(async (_buf: Buffer, filename: string) => ({
    storedFilename: `stored-${filename}`,
    fileSize: 100,
    url: `https://cdn.example.com/${filename as string}`,
  })),
}));

vi.mock('@/lib/html-embed-clean', () => ({
  cleanEmbedHtml: vi.fn((html: string) => html),
}));

vi.mock('@/lib/html-asset-import', () => ({
  importHtmlAssets: vi.fn(async (html: string) => ({
    html,
    importedCount: 2,
    skippedCount: 0,
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
  sql: Object.assign(
    (parts: TemplateStringsArray, ...vals: unknown[]) => ({ op: 'sql', parts, vals }),
    { raw: (s: string) => ({ op: 'sql_raw', s }) },
  ),
}));

vi.mock('@/lib/db/schema', () => {
  const mkTable = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get(_t, prop: string) {
          if (prop === '__table') return name;
          return { __col: prop, __table: name };
        },
      },
    );
  return {
    mcpPendingChanges: mkTable('mcpPendingChanges'),
    posts: mkTable('posts'),
    clientWebsites: mkTable('clientWebsites'),
    pitchDecks: mkTable('pitchDecks'),
    crmProposals: mkTable('crmProposals'),
    emailCampaigns: mkTable('emailCampaigns'),
    emailLists: mkTable('emailLists'),
    siteNavigation: mkTable('siteNavigation'),
    blockTemplates: mkTable('blockTemplates'),
    blockTemplateUsages: mkTable('blockTemplateUsages'),
    categories: mkTable('categories'),
    tags: mkTable('tags'),
    postCategories: mkTable('postCategories'),
    postTags: mkTable('postTags'),
    media: mkTable('media'),
  };
});

// ── chainable DB mock ─────────────────────────────────────────────────────

interface DbMock {
  select: ReturnType<typeof vi.fn>;
  insert: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
}

const chain: Record<string, unknown> = {};
function resetChain() {
  for (const key of Object.keys(chain)) delete chain[key];
  const passthrough = vi.fn(() => chain);
  Object.assign(chain, {
    from: passthrough,
    where: passthrough,
    values: passthrough,
    set: passthrough,
    orderBy: passthrough,
    limit: passthrough,
    innerJoin: passthrough,
    returning: vi.fn(async () => []),
  });
}

const dbMock: DbMock = {
  select: vi.fn(() => chain),
  insert: vi.fn(() => chain),
  update: vi.fn(() => chain),
  delete: vi.fn(() => chain),
};

vi.mock('@/lib/db', () => ({ db: dbMock }));

// ── SUT import ────────────────────────────────────────────────────────────

const { applyPendingChange } = await import('@/lib/mcp/approvals');
const { uploadToS3 } = await import('@/lib/s3/upload');
const { cleanEmbedHtml } = await import('@/lib/html-embed-clean');
const { importHtmlAssets } = await import('@/lib/html-asset-import');

// ── helpers ───────────────────────────────────────────────────────────────

type Change = {
  id: number;
  clientId: number;
  entityType: string;
  entityId: number | null;
  operation: string;
  payload: Record<string, unknown>;
  status: string;
};

function mkChange(over: Partial<Change>): Change {
  return {
    id: 1,
    clientId: 10,
    entityType: 'post',
    entityId: null,
    operation: 'create',
    payload: {},
    status: 'pending',
    ...over,
  };
}

/** Queue a sequence of per-call select results for limit(1) calls. */
function queueSelect(results: unknown[][]) {
  const seq = [...results];
  dbMock.select.mockImplementation(() => {
    const localChain: Record<string, unknown> = {};
    const pass = vi.fn(() => localChain);
    Object.assign(localChain, {
      from: pass,
      where: pass,
      orderBy: pass,
      innerJoin: pass,
      limit: vi.fn(async () => seq.shift() ?? []),
    });
    return localChain;
  });
}

function queueInsertReturning(rows: unknown[]) {
  dbMock.insert.mockImplementation(() => {
    const localChain: Record<string, unknown> = {};
    const pass = vi.fn(() => localChain);
    Object.assign(localChain, {
      values: pass,
      returning: vi.fn(async () => rows),
    });
    return localChain;
  });
}

function queueUpdateReturning(rows: unknown[]) {
  dbMock.update.mockImplementation(() => {
    const localChain: Record<string, unknown> = {};
    const pass = vi.fn(() => localChain);
    Object.assign(localChain, {
      set: pass,
      where: pass,
      returning: vi.fn(async () => rows),
    });
    return localChain;
  });
}

function queueDelete() {
  dbMock.delete.mockImplementation(() => {
    const localChain: Record<string, unknown> = {};
    Object.assign(localChain, {
      where: vi.fn(async () => undefined),
    });
    return localChain;
  });
}

beforeEach(() => {
  resetChain();
  dbMock.select.mockReset();
  dbMock.insert.mockReset();
  dbMock.update.mockReset();
  dbMock.delete.mockReset();
  dbMock.select.mockImplementation(() => chain);
  dbMock.insert.mockImplementation(() => chain);
  dbMock.update.mockImplementation(() => chain);
  dbMock.delete.mockImplementation(() => chain);
  (uploadToS3 as unknown as ReturnType<typeof vi.fn>).mockReset();
  (uploadToS3 as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    async (_buf: Buffer, filename: string) => ({
      storedFilename: `stored-${filename}`,
      fileSize: 100,
      url: `https://cdn.example.com/${filename}`,
    }),
  );
  (cleanEmbedHtml as unknown as ReturnType<typeof vi.fn>).mockReset();
  (cleanEmbedHtml as unknown as ReturnType<typeof vi.fn>).mockImplementation((html: string) => html);
  (importHtmlAssets as unknown as ReturnType<typeof vi.fn>).mockReset();
  (importHtmlAssets as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    html: '<html>cleaned</html>',
    importedCount: 2,
    skippedCount: 0,
  });
});

// ─────────────────────────────────────────────────────────────────────────
// pitch_deck:upload_html
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — pitch_deck:upload_html', () => {
  it('throws when filename or contentBase64 is missing from payload', async () => {
    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'upload_html',
      payload: { filename: 'deck.html' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(
      'Cannot replay pitch_deck:upload_html',
    );
  });

  it('throws when contentBase64 is missing but filename is present', async () => {
    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'upload_html',
      payload: { filename: 'deck.html', contentBase64: undefined },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(
      'Cannot replay pitch_deck:upload_html',
    );
  });

  it('throws when buffer exceeds 1MB', async () => {
    const big = Buffer.alloc(1_000_001, 'x');
    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'upload_html',
      payload: { filename: 'deck.html', contentBase64: big.toString('base64') },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('File exceeds');
  });

  it('uses "Uploaded HTML Deck" as title when both title and filename have no stem', async () => {
    const htmlContent = '<html>x</html>';
    const b64 = Buffer.from(htmlContent).toString('base64');
    let insertedDeck: Record<string, unknown> | null = null;
    let insertCallCount = 0;

    dbMock.insert.mockImplementation(() => {
      insertCallCount++;
      const c: Record<string, unknown> = {};
      if (insertCallCount === 1) {
        Object.assign(c, { values: vi.fn(() => c), returning: vi.fn(async () => []) });
      } else {
        Object.assign(c, {
          values: vi.fn((v: Record<string, unknown>) => { insertedDeck = v; return c; }),
          returning: vi.fn(async () => [{ id: 22 }]),
        });
      }
      return c;
    });
    // filename with no extension stem → falls back to 'Uploaded HTML Deck'
    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'upload_html',
      payload: { filename: '.html', contentBase64: b64 },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((insertedDeck as Record<string, unknown>).title).toBe('Uploaded HTML Deck');
  });

  it('uploads to S3, inserts media row, and creates a deck with one html-embed slide', async () => {
    const htmlContent = '<html><body>Hello</body></html>';
    const b64 = Buffer.from(htmlContent).toString('base64');
    let insertedMedia: Record<string, unknown> | null = null;
    let insertedDeck: Record<string, unknown> | null = null;
    let insertCallCount = 0;

    dbMock.insert.mockImplementation(() => {
      insertCallCount++;
      const c: Record<string, unknown> = {};
      if (insertCallCount === 1) {
        // media insert
        Object.assign(c, {
          values: vi.fn((v: Record<string, unknown>) => {
            insertedMedia = v;
            return c;
          }),
          returning: vi.fn(async () => []),
        });
      } else {
        // pitchDecks insert
        Object.assign(c, {
          values: vi.fn((v: Record<string, unknown>) => {
            insertedDeck = v;
            return c;
          }),
          returning: vi.fn(async () => [{ id: 20, title: 'My Deck', slug: 'my-deck-abc' }]),
        });
      }
      return c;
    });

    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'upload_html',
      payload: { filename: 'my-deck.html', contentBase64: b64, title: 'My Deck' },
    });
    const r = await applyPendingChange(change as never, 10, 1);

    expect(uploadToS3).toHaveBeenCalledWith(expect.any(Buffer), 'my-deck.html', 'text/html');
    expect(insertedMedia).not.toBeNull();
    expect((insertedMedia as Record<string, unknown>).mimeType).toBe('text/html');
    expect((insertedMedia as Record<string, unknown>).clientId).toBe(10);

    expect(insertedDeck).not.toBeNull();
    const deck = insertedDeck as Record<string, unknown>;
    expect(deck.title).toBe('My Deck');
    expect(deck.clientId).toBe(10);
    expect(deck.formatVersion).toBe(2);
    expect(Array.isArray(deck.slides)).toBe(true);
    const slides = deck.slides as Array<Record<string, unknown>>;
    expect(slides).toHaveLength(1);
    expect(slides[0].blocks).toBeDefined();

    expect((r as Record<string, unknown>).url).toBe('https://cdn.example.com/my-deck.html');
  });

  it('falls back to filename-derived title when title is blank', async () => {
    const htmlContent = '<html>x</html>';
    const b64 = Buffer.from(htmlContent).toString('base64');
    let insertedDeck: Record<string, unknown> | null = null;
    let insertCallCount = 0;

    dbMock.insert.mockImplementation(() => {
      insertCallCount++;
      const c: Record<string, unknown> = {};
      if (insertCallCount === 1) {
        Object.assign(c, { values: vi.fn(() => c), returning: vi.fn(async () => []) });
      } else {
        Object.assign(c, {
          values: vi.fn((v: Record<string, unknown>) => { insertedDeck = v; return c; }),
          returning: vi.fn(async () => [{ id: 21 }]),
        });
      }
      return c;
    });

    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'upload_html',
      payload: { filename: 'fancy-slide.html', contentBase64: b64, title: '   ' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((insertedDeck as Record<string, unknown>).title).toBe('fancy-slide');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// pitch_deck:publish_all
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — pitch_deck:publish_all', () => {
  it('throws when deck is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'pitch_deck', operation: 'publish_all', entityId: 7 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Deck not found');
  });

  it('publishes all slides — drops pendingDelete, promotes pendingCreate', async () => {
    const existingSlides = [
      // Regular slide with draft update — should be promoted
      { id: 's1', label: 'Live', blocks: [], draft: { blocks: [{ id: 'b1' }], notes: 'n' } },
      // pendingCreate+pendingDelete combo — should be dropped
      { id: 's2', label: 'New+Del', blocks: [], draft: { pendingCreate: true, pendingDelete: true } },
      // pendingDelete — should be dropped
      { id: 's3', label: 'Deleted', blocks: [], draft: { pendingDelete: true } },
      // No draft — should be kept as-is
      { id: 's4', label: 'NoDraft', blocks: [{ id: 'b4' }] },
    ];
    queueSelect([[{ id: 7, slides: existingSlides }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({ entityType: 'pitch_deck', operation: 'publish_all', entityId: 7 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 7 });

    const slides = (patch as Record<string, unknown>)?.slides as Array<Record<string, unknown>>;
    // s1 promoted (no draft), s2 dropped, s3 dropped, s4 kept
    expect(slides).toHaveLength(2);
    const ids = slides.map((s) => s.id);
    expect(ids).toContain('s1');
    expect(ids).toContain('s4');
    // s1 should have no draft property
    const s1 = slides.find((s) => s.id === 's1')!;
    expect(s1.draft).toBeUndefined();
    // s1 blocks should be promoted from draft
    expect(s1.blocks).toEqual([{ id: 'b1' }]);
  });

  it('handles deck with no slides (empty array)', async () => {
    queueSelect([[{ id: 7, slides: [] }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({ entityType: 'pitch_deck', operation: 'publish_all', entityId: 7 });
    await applyPendingChange(change as never, 10, 1);
    expect((patch as Record<string, unknown>)?.slides).toEqual([]);
  });

  it('handles deck with null slides (non-array)', async () => {
    queueSelect([[{ id: 7, slides: null }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({ entityType: 'pitch_deck', operation: 'publish_all', entityId: 7 });
    await applyPendingChange(change as never, 10, 1);
    expect((patch as Record<string, unknown>)?.slides).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// pitch_deck_slide_draft:publish
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — pitch_deck_slide_draft:publish', () => {
  it('throws when deck is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'pitch_deck_slide_draft',
      operation: 'publish',
      entityId: 7,
      payload: { slideId: 's1' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Deck not found');
  });

  it('promotes a single slide draft and leaves others unchanged', async () => {
    const existingSlides = [
      { id: 's1', label: 'A', blocks: [], draft: { blocks: [{ id: 'nb1' }], notes: 'promoted' } },
      { id: 's2', label: 'B', blocks: [{ id: 'b2' }] },
    ];
    queueSelect([[{ id: 7, slides: existingSlides }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck_slide_draft',
      operation: 'publish',
      entityId: 7,
      payload: { slideId: 's1' },
    });
    await applyPendingChange(change as never, 10, 1);
    const slides = (patch as Record<string, unknown>)?.slides as Array<Record<string, unknown>>;
    expect(slides).toHaveLength(2);
    const s1 = slides.find((s) => s.id === 's1')!;
    expect(s1.draft).toBeUndefined();
    expect(s1.blocks).toEqual([{ id: 'nb1' }]);
    // s2 untouched
    const s2 = slides.find((s) => s.id === 's2')!;
    expect(s2.blocks).toEqual([{ id: 'b2' }]);
  });

  it('drops the target slide when draft.pendingDelete is set', async () => {
    const existingSlides = [
      { id: 's1', label: 'A', blocks: [], draft: { pendingDelete: true } },
      { id: 's2', label: 'B', blocks: [] },
    ];
    queueSelect([[{ id: 7, slides: existingSlides }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck_slide_draft',
      operation: 'publish',
      entityId: 7,
      payload: { slideId: 's1' },
    });
    await applyPendingChange(change as never, 10, 1);
    const slides = (patch as Record<string, unknown>)?.slides as Array<Record<string, unknown>>;
    expect(slides).toHaveLength(1);
    expect(slides[0].id).toBe('s2');
  });

  it('resolves deckId from payload.deckId when entityId is absent', async () => {
    const existingSlides = [
      { id: 's1', label: 'A', blocks: [], draft: { blocks: [] } },
    ];
    queueSelect([[{ id: 99, slides: existingSlides }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 99 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck_slide_draft',
      operation: 'publish',
      entityId: null,
      payload: { deckId: 99, slideId: 's1' },
    });
    await applyPendingChange(change as never, 10, 1);
    const slides = (patch as Record<string, unknown>)?.slides as Array<Record<string, unknown>>;
    expect(slides).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// site:update
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — site:update', () => {
  it('throws when site is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'site', operation: 'update', entityId: 5 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Site not found');
  });

  it('writes draft CSS when customCss is in payload', async () => {
    queueSelect([[{ id: 5 }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 5 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'site',
      operation: 'update',
      entityId: 5,
      payload: { customCss: '.foo { color: red; }' },
    });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.draftCustomCss).toBe('.foo { color: red; }');
    expect(p.draftUpdatedBy).toBe(1);
    expect(p.draftUpdatedAt).toBeInstanceOf(Date);
    // metadata fields should NOT be present
    expect(p.name).toBeUndefined();
  });

  it('clears draftCustomCss when customCss is empty string', async () => {
    queueSelect([[{ id: 5 }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 5 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'site',
      operation: 'update',
      entityId: 5,
      payload: { customCss: '' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((patch as Record<string, unknown>).draftCustomCss).toBeNull();
  });

  it('writes draft JS when customJs is in payload', async () => {
    queueSelect([[{ id: 5 }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 5 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'site',
      operation: 'update',
      entityId: 5,
      payload: { customJs: 'console.log("hi");' },
    });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.draftCustomJs).toBe('console.log("hi");');
    expect(p.name).toBeUndefined();
  });

  it('updates metadata fields (name, domain, etc.) when no customCode keys present', async () => {
    queueSelect([[{ id: 5 }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 5 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'site',
      operation: 'update',
      entityId: 5,
      payload: { name: 'My Site', domain: 'example.com', active: true },
    });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.name).toBe('My Site');
    expect(p.domain).toBe('example.com');
    expect(p.active).toBe(true);
    expect(p.draftCustomCss).toBeUndefined();
  });

  it('resolves id from payload.id when entityId is absent', async () => {
    queueSelect([[{ id: 5 }]]);
    queueUpdateReturning([{ id: 5 }]);
    const change = mkChange({
      entityType: 'site',
      operation: 'update',
      entityId: null,
      payload: { id: 5, name: 'Resolved' },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 5 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// site:publish
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — site:publish', () => {
  it('throws when site is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'site', operation: 'publish', entityId: 5 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Site not found');
  });

  it('promotes draft CSS/JS to live fields and clears drafts', async () => {
    const existingSite = {
      id: 5,
      draftCustomCss: '.live { color: blue; }',
      draftCustomJs: 'console.log("live");',
    };
    queueSelect([[existingSite]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 5 }]),
      });
      return c;
    });
    const change = mkChange({ entityType: 'site', operation: 'publish', entityId: 5 });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.customCss).toBe('.live { color: blue; }');
    expect(p.customJs).toBe('console.log("live");');
    expect(p.draftCustomCss).toBeNull();
    expect(p.draftCustomJs).toBeNull();
    expect(p.draftUpdatedAt).toBeNull();
    expect(p.draftUpdatedBy).toBeNull();
    expect(p.updatedAt).toBeInstanceOf(Date);
  });

  it('resolves id from payload.id when entityId is absent', async () => {
    queueSelect([[{ id: 5, draftCustomCss: null, draftCustomJs: null }]]);
    queueUpdateReturning([{ id: 5 }]);
    const change = mkChange({
      entityType: 'site',
      operation: 'publish',
      entityId: null,
      payload: { id: 5 },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 5 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// site_nav:create
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — site_nav:create', () => {
  it('throws when site is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'site_nav',
      operation: 'create',
      payload: { websiteId: 5, label: 'Home', href: '/' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Site not found');
  });

  it('inserts a nav item with defaults and a pendingCreate draft', async () => {
    // The site_nav:create implementation makes two selects:
    //   1) site lookup — uses .limit(1)
    //   2) existing nav rows — NO .limit(), resolves on .where()
    let selectCall = 0;
    dbMock.select.mockImplementation(() => {
      selectCall++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      if (selectCall === 1) {
        // site lookup with limit
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 5 }]) });
      } else {
        // existing nav rows — no limit; where() is the terminal call
        Object.assign(c, { from: pass, where: vi.fn(async () => [{ id: 1 }, { id: 2 }]) });
      }
      return c;
    });
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => { captured = v; return c; }),
        returning: vi.fn(async () => [{ id: 10 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'site_nav',
      operation: 'create',
      payload: { websiteId: 5, label: 'About', href: '/about' },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 10 });
    const c = captured as Record<string, unknown>;
    expect(c.label).toBe('About');
    expect(c.href).toBe('/about');
    expect(c.websiteId).toBe(5);
    expect((c.draft as Record<string, unknown>).pendingCreate).toBe(true);
    // sortOrder defaults to existing.length when not provided
    expect(c.sortOrder).toBe(2);
  });

  it('uses provided sortOrder over the default', async () => {
    let selectCall = 0;
    dbMock.select.mockImplementation(() => {
      selectCall++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      if (selectCall === 1) {
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 5 }]) });
      } else {
        Object.assign(c, { from: pass, where: vi.fn(async () => []) });
      }
      return c;
    });
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => { captured = v; return c; }),
        returning: vi.fn(async () => [{ id: 11 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'site_nav',
      operation: 'create',
      payload: { websiteId: 5, label: 'Contact', href: '/contact', sortOrder: 99, isButton: true },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((captured as Record<string, unknown>).sortOrder).toBe(99);
    expect((captured as Record<string, unknown>).isButton).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// site_nav:update
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — site_nav:update', () => {
  it('throws when nav item is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'site_nav',
      operation: 'update',
      entityId: 10,
      payload: { label: 'New' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Nav item not found');
  });

  it('merges payload into existing draft and updates the row', async () => {
    queueSelect([[{
      id: 10,
      websiteId: 5,
      draft: { label: 'Old Label', href: '/old' },
    }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 10 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'site_nav',
      operation: 'update',
      entityId: 10,
      payload: { label: 'New Label', href: '/new' },
    });
    await applyPendingChange(change as never, 10, 1);
    const draft = (patch as Record<string, unknown>)?.draft as Record<string, unknown>;
    expect(draft.label).toBe('New Label');
    expect(draft.href).toBe('/new');
    expect(draft.updatedBy).toBe(1);
    expect(typeof draft.updatedAt).toBe('string');
  });

  it('skips the id key from payload when merging into draft', async () => {
    queueSelect([[{ id: 10, websiteId: 5, draft: null }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 10 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'site_nav',
      operation: 'update',
      entityId: 10,
      payload: { id: 10, label: 'No ID in Draft' },
    });
    await applyPendingChange(change as never, 10, 1);
    const draft = (patch as Record<string, unknown>)?.draft as Record<string, unknown>;
    expect(draft.id).toBeUndefined();
    expect(draft.label).toBe('No ID in Draft');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// site_nav:delete
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — site_nav:delete', () => {
  it('throws when nav item is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'site_nav', operation: 'delete', entityId: 10 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Nav item not found');
  });

  it('sets pendingDelete on the draft and returns success', async () => {
    queueSelect([[{ id: 10, draft: { label: 'Home', href: '/' } }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(async () => undefined),
      });
      return c;
    });
    const change = mkChange({ entityType: 'site_nav', operation: 'delete', entityId: 10 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ success: true, id: 10, pendingDelete: true });
    expect((patch as Record<string, unknown>)?.draft as Record<string, unknown>)
      .toMatchObject({ pendingDelete: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// site_nav:publish
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — site_nav:publish', () => {
  it('throws when nav item is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'site_nav', operation: 'publish', entityId: 10 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Nav item not found');
  });

  it('returns noop when draft is null', async () => {
    // site_nav:publish uses an innerJoin, result is navRow.site_navigation
    queueSelect([[{ site_navigation: { id: 10, draft: null } }]]);
    const change = mkChange({ entityType: 'site_nav', operation: 'publish', entityId: 10 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ success: true, id: 10, noop: true });
  });

  it('deletes the row when draft.pendingDelete is set', async () => {
    queueSelect([[{ site_navigation: { id: 10, draft: { pendingDelete: true } } }]]);
    queueDelete();
    const change = mkChange({ entityType: 'site_nav', operation: 'publish', entityId: 10 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ success: true, id: 10, deleted: true });
    expect(dbMock.delete).toHaveBeenCalled();
  });

  it('promotes draft fields to live fields and clears draft', async () => {
    queueSelect([[{
      site_navigation: {
        id: 10,
        draft: { label: 'Updated', href: '/updated', sortOrder: 3, openInNewTab: true },
      },
    }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 10 }]),
      });
      return c;
    });
    const change = mkChange({ entityType: 'site_nav', operation: 'publish', entityId: 10 });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.label).toBe('Updated');
    expect(p.href).toBe('/updated');
    expect(p.sortOrder).toBe(3);
    expect(p.openInNewTab).toBe(true);
    expect(p.draft).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// site_nav:publish_all
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — site_nav:publish_all', () => {
  it('throws when site is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'site_nav',
      operation: 'publish_all',
      payload: { websiteId: 5 },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Site not found');
  });

  it('publishes nav items with draft updates and deletes pendingDelete rows', async () => {
    // The implementation does two db.select calls: site lookup and drafts query.
    // The drafts query returns all rows (no limit) — we need to handle that differently.
    const drafts = [
      { id: 1, draft: { label: 'Home', href: '/', pendingDelete: false } },
      { id: 2, draft: { pendingDelete: true } },
      { id: 3, draft: null },
    ];

    let selectCallCount = 0;
    dbMock.select.mockImplementation(() => {
      selectCallCount++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      if (selectCallCount === 1) {
        // Site lookup
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 5 }]) });
      } else {
        // Drafts query — returns without limit
        Object.assign(c, { from: pass, where: vi.fn(async () => drafts) });
      }
      return c;
    });

    const deletedIds: unknown[] = [];
    dbMock.delete.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, { where: vi.fn(async () => { deletedIds.push('deleted'); }) });
      return c;
    });

    const updatedIds: unknown[] = [];
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn(() => c),
        where: vi.fn(async () => { updatedIds.push('updated'); }),
      });
      return c;
    });

    const change = mkChange({
      entityType: 'site_nav',
      operation: 'publish_all',
      payload: { websiteId: 5 },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ websiteId: 5, published: 2 }); // id:1 updated, id:2 deleted, id:3 skipped
    expect(deletedIds).toHaveLength(1);
    expect(updatedIds).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// block_template:create
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — block_template:create', () => {
  it('inserts a block template with pendingCreate draft', async () => {
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => { captured = v; return c; }),
        returning: vi.fn(async () => [{ id: 30 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'block_template',
      operation: 'create',
      payload: {
        name: 'Hero Template',
        slug: 'hero-template',
        description: 'A hero block',
        category: 'layout',
        scope: 'block',
        blocks: [{ id: 'b1', type: 'hero' }],
        tags: ['featured'],
        lockedFields: ['title'],
      },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 30 });
    const c = captured as Record<string, unknown>;
    expect(c.name).toBe('Hero Template');
    expect(c.slug).toBe('hero-template');
    expect(c.createdBy).toBe(1);
    const draft = c.draft as Record<string, unknown>;
    expect((draft as { pendingCreate: boolean }).pendingCreate).toBe(true);
    expect(draft.name).toBe('Hero Template');
    expect(draft.tags).toEqual(['featured']);
  });

  it('uses defaults when optional fields are absent', async () => {
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => { captured = v; return c; }),
        returning: vi.fn(async () => [{ id: 31 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'block_template',
      operation: 'create',
      payload: { name: 'Min', slug: 'min', blocks: [] },
    });
    await applyPendingChange(change as never, 10, 1);
    const c = captured as Record<string, unknown>;
    expect(c.category).toBe('custom');
    expect(c.scope).toBe('block');
    expect(c.tags).toEqual([]);
    expect(c.lockedFields).toEqual([]);
    expect(c.thumbnail).toBeNull();
    expect(c.description).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// block_template:update
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — block_template:update', () => {
  it('throws when template is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'block_template', operation: 'update', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Template not found');
  });

  it('merges payload into existing draft', async () => {
    queueSelect([[{ id: 30, draft: { name: 'Old' } }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 30 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'block_template',
      operation: 'update',
      entityId: 30,
      payload: { name: 'New Name', description: 'Updated' },
    });
    await applyPendingChange(change as never, 10, 1);
    const draft = (patch as Record<string, unknown>)?.draft as Record<string, unknown>;
    expect(draft.name).toBe('New Name');
    expect(draft.description).toBe('Updated');
    expect(draft.updatedBy).toBe(1);
  });

  it('skips the id key from payload when merging into draft', async () => {
    queueSelect([[{ id: 30, draft: null }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 30 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'block_template',
      operation: 'update',
      entityId: 30,
      payload: { id: 30, name: 'No id in draft' },
    });
    await applyPendingChange(change as never, 10, 1);
    const draft = (patch as Record<string, unknown>)?.draft as Record<string, unknown>;
    expect(draft.id).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// block_template:delete
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — block_template:delete', () => {
  it('throws when template is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'block_template', operation: 'delete', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Template not found');
  });

  it('throws when template has active usages', async () => {
    // First select: template lookup (with limit), second: usages (no limit)
    let selectCall = 0;
    dbMock.select.mockImplementation(() => {
      selectCall++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      if (selectCall === 1) {
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 30, draft: null }]) });
      } else {
        Object.assign(c, { from: pass, where: vi.fn(async () => [{ id: 1 }, { id: 2 }]) });
      }
      return c;
    });
    const change = mkChange({ entityType: 'block_template', operation: 'delete', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/Cannot delete/);
  });

  it('sets pendingDelete on draft when template has no usages', async () => {
    let selectCall = 0;
    dbMock.select.mockImplementation(() => {
      selectCall++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      if (selectCall === 1) {
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 30, draft: { name: 'Hero' } }]) });
      } else {
        Object.assign(c, { from: pass, where: vi.fn(async () => []) });
      }
      return c;
    });
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(async () => undefined),
      });
      return c;
    });
    const change = mkChange({ entityType: 'block_template', operation: 'delete', entityId: 30 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ success: true, id: 30, pendingDelete: true });
    expect((patch as Record<string, unknown>)?.draft as Record<string, unknown>)
      .toMatchObject({ pendingDelete: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// block_template:publish
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — block_template:publish', () => {
  it('throws when template is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'block_template', operation: 'publish', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Template not found');
  });

  it('returns noop when draft is null', async () => {
    queueSelect([[{ id: 30, draft: null, version: 1 }]]);
    const change = mkChange({ entityType: 'block_template', operation: 'publish', entityId: 30 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ success: true, id: 30, noop: true });
  });

  it('throws on delete when template has usages at apply time', async () => {
    // First select: template (with limit), second: usages (no limit)
    let selectCall = 0;
    dbMock.select.mockImplementation(() => {
      selectCall++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      if (selectCall === 1) {
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 30, draft: { pendingDelete: true }, version: 1 }]) });
      } else {
        Object.assign(c, { from: pass, where: vi.fn(async () => [{ id: 1 }]) });
      }
      return c;
    });
    const change = mkChange({ entityType: 'block_template', operation: 'publish', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/Cannot delete/);
  });

  it('deletes template when pendingDelete and no usages', async () => {
    let selectCall = 0;
    dbMock.select.mockImplementation(() => {
      selectCall++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      if (selectCall === 1) {
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 30, draft: { pendingDelete: true }, version: 1 }]) });
      } else {
        Object.assign(c, { from: pass, where: vi.fn(async () => []) });
      }
      return c;
    });
    queueDelete();
    const change = mkChange({ entityType: 'block_template', operation: 'publish', entityId: 30 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ success: true, id: 30, deleted: true });
    expect(dbMock.delete).toHaveBeenCalled();
  });

  it('promotes draft fields to live and increments version when blocks changed', async () => {
    queueSelect([[{
      id: 30,
      draft: { name: 'Updated', description: 'New desc', blocks: [{ id: 'b1' }], tags: ['x'] },
      version: 2,
    }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 30 }]),
      });
      return c;
    });
    const change = mkChange({ entityType: 'block_template', operation: 'publish', entityId: 30 });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.name).toBe('Updated');
    expect(p.description).toBe('New desc');
    expect(p.blocks).toEqual([{ id: 'b1' }]);
    expect(p.tags).toEqual(['x']);
    expect(p.version).toBe(3); // incremented
    expect(p.draft).toBeNull();
  });

  it('does not set version when draft has no blocks change', async () => {
    queueSelect([[{
      id: 30,
      draft: { name: 'Renamed only' },
      version: 1,
    }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 30 }]),
      });
      return c;
    });
    const change = mkChange({ entityType: 'block_template', operation: 'publish', entityId: 30 });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.version).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// taxonomy:create
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — taxonomy:create', () => {
  it('throws when site is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'taxonomy',
      operation: 'create',
      payload: { websiteId: 5, name: 'Tech', slug: 'tech', kind: 'category' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Site not found');
  });

  it('inserts a category when kind is omitted (default)', async () => {
    queueSelect([[{ id: 5 }]]);
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => { captured = v; return c; }),
        returning: vi.fn(async () => [{ id: 50 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'taxonomy',
      operation: 'create',
      payload: { websiteId: 5, name: '  Tech  ', slug: 'tech', description: 'Tech stuff', color: '#ff0000' },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 50 });
    const c = captured as Record<string, unknown>;
    expect(c.name).toBe('Tech'); // trimmed
    expect(c.slug).toBe('tech');
    expect(c.description).toBe('Tech stuff');
    expect(c.color).toBe('#ff0000');
  });

  it('inserts a tag when kind=tag', async () => {
    queueSelect([[{ id: 5 }]]);
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => { captured = v; return c; }),
        returning: vi.fn(async () => [{ id: 60 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'taxonomy',
      operation: 'create',
      payload: { websiteId: 5, name: '  Video  ', slug: 'video', kind: 'tag' },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 60 });
    const c = captured as Record<string, unknown>;
    expect(c.name).toBe('Video'); // trimmed
    expect(c.slug).toBe('video');
    expect(c.websiteId).toBe(5);
  });

  it('wraps DB error in a friendly message for duplicate category slug', async () => {
    queueSelect([[{ id: 5 }]]);
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn(() => c),
        returning: vi.fn(async () => { throw new Error('unique constraint violation'); }),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'taxonomy',
      operation: 'create',
      payload: { websiteId: 5, name: 'Tech', slug: 'tech', kind: 'category' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(
      /Could not create category/,
    );
  });

  it('wraps DB error in a friendly message for duplicate tag slug', async () => {
    queueSelect([[{ id: 5 }]]);
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn(() => c),
        returning: vi.fn(async () => { throw new Error('unique constraint violation'); }),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'taxonomy',
      operation: 'create',
      payload: { websiteId: 5, name: 'Video', slug: 'video', kind: 'tag' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(
      /Could not create tag/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// post_taxonomy:update
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — post_taxonomy:update', () => {
  it('throws when post is not found', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'post_taxonomy', operation: 'update', entityId: 9 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Post not found');
  });

  it('throws on agency post (null websiteId)', async () => {
    queueSelect([[{ websiteId: null }]]);
    const change = mkChange({ entityType: 'post_taxonomy', operation: 'update', entityId: 9 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/agency post/);
  });

  it('throws when site is not owned by client', async () => {
    queueSelect([[{ websiteId: 5 }], []]);
    const change = mkChange({ entityType: 'post_taxonomy', operation: 'update', entityId: 9 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Permission denied');
  });

  /**
   * Helper: builds a select mock for post_taxonomy:update.
   * The implementation makes selects in this order:
   *   1) post lookup — .where().limit(1)
   *   2) site lookup — .where().limit(1)
   *   3) assigned cats — .where() terminal (no limit)
   *   4) assigned tags — .where() terminal (no limit)
   */
  function mkTaxonomySelectMock(
    postResult: unknown[],
    siteResult: unknown[],
    assignedCats: unknown[],
    assignedTags: unknown[],
  ) {
    let selectCall = 0;
    dbMock.select.mockImplementation(() => {
      selectCall++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      if (selectCall === 1) {
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => postResult) });
      } else if (selectCall === 2) {
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => siteResult) });
      } else if (selectCall === 3) {
        Object.assign(c, { from: pass, where: vi.fn(async () => assignedCats) });
      } else {
        Object.assign(c, { from: pass, where: vi.fn(async () => assignedTags) });
      }
      return c;
    });
  }

  it('replaces categoryIds and tagIds when both provided', async () => {
    const seenDeleteArgs: string[] = [];
    const seenInsertArgs: string[] = [];

    mkTaxonomySelectMock(
      [{ websiteId: 5 }],
      [{ id: 5 }],
      [{ categoryId: 1 }],
      [{ tagId: 10 }],
    );

    dbMock.delete.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, { where: vi.fn(async (arg: unknown) => { seenDeleteArgs.push(String(arg)); }) });
      return c;
    });

    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((vals: unknown) => { seenInsertArgs.push(JSON.stringify(vals)); return c; }),
        returning: vi.fn(async () => []),
      });
      return c;
    });

    const change = mkChange({
      entityType: 'post_taxonomy',
      operation: 'update',
      entityId: 9,
      payload: { categoryIds: [1, 2], tagIds: [10] },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({
      postId: 9,
      categoryIds: [1],
      tagIds: [10],
    });
    expect(seenDeleteArgs).toHaveLength(2); // deleted cats and tags
    expect(seenInsertArgs).toHaveLength(2); // re-inserted cats and tags
  });

  it('skips category replacement when categoryIds is undefined', async () => {
    mkTaxonomySelectMock(
      [{ websiteId: 5 }],
      [{ id: 5 }],
      [],
      [{ tagId: 5 }],
    );

    const deleteSpy = vi.fn(async () => undefined);
    dbMock.delete.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, { where: deleteSpy });
      return c;
    });

    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn(() => c),
        returning: vi.fn(async () => []),
      });
      return c;
    });

    const change = mkChange({
      entityType: 'post_taxonomy',
      operation: 'update',
      entityId: 9,
      payload: { tagIds: [5] }, // no categoryIds
    });
    await applyPendingChange(change as never, 10, 1);
    // Only one delete call (for tags, not categories)
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('skips tag replacement when tagIds is undefined', async () => {
    mkTaxonomySelectMock(
      [{ websiteId: 5 }],
      [{ id: 5 }],
      [{ categoryId: 1 }],
      [],
    );

    const deleteSpy = vi.fn(async () => undefined);
    dbMock.delete.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, { where: deleteSpy });
      return c;
    });

    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn(() => c),
        returning: vi.fn(async () => []),
      });
      return c;
    });

    const change = mkChange({
      entityType: 'post_taxonomy',
      operation: 'update',
      entityId: 9,
      payload: { categoryIds: [1] }, // no tagIds
    });
    await applyPendingChange(change as never, 10, 1);
    // Only one delete call (for categories)
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('skips insert when categoryIds is empty array', async () => {
    mkTaxonomySelectMock([{ websiteId: 5 }], [{ id: 5 }], [], []);
    dbMock.delete.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, { where: vi.fn(async () => undefined) });
      return c;
    });
    const insertSpy = vi.fn(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, { values: vi.fn(() => c), returning: vi.fn(async () => []) });
      return c;
    });
    dbMock.insert.mockImplementation(insertSpy);

    const change = mkChange({
      entityType: 'post_taxonomy',
      operation: 'update',
      entityId: 9,
      payload: { categoryIds: [], tagIds: [] }, // empty arrays — deletes but no inserts
    });
    await applyPendingChange(change as never, 10, 1);
    // insert should NOT be called for empty arrays
    expect(insertSpy).not.toHaveBeenCalled();
  });

  it('uses payload.postId when entityId is null', async () => {
    mkTaxonomySelectMock(
      [{ websiteId: 5 }],
      [{ id: 5 }],
      [{ categoryId: 2 }],
      [],
    );
    dbMock.delete.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, { where: vi.fn(async () => undefined) });
      return c;
    });
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, { values: vi.fn(() => c), returning: vi.fn(async () => []) });
      return c;
    });
    const change = mkChange({
      entityType: 'post_taxonomy',
      operation: 'update',
      entityId: null,
      payload: { postId: 9, categoryIds: [2] },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect((r as Record<string, unknown>).postId).toBe(9);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// post:upload_html
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — post:upload_html', () => {
  it('throws when filename or contentBase64 is missing', async () => {
    const change = mkChange({
      entityType: 'post',
      operation: 'upload_html',
      payload: { websiteId: 5, filename: 'page.html' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(
      'Cannot replay post:upload_html',
    );
  });

  it('throws when site is not found', async () => {
    const b64 = Buffer.from('<html>x</html>').toString('base64');
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'post',
      operation: 'upload_html',
      payload: { websiteId: 5, filename: 'page.html', contentBase64: b64 },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Site not found');
  });

  it('throws when buffer exceeds 1MB', async () => {
    queueSelect([[{ id: 5 }]]);
    const big = Buffer.alloc(1_000_001, 'x');
    const change = mkChange({
      entityType: 'post',
      operation: 'upload_html',
      payload: {
        websiteId: 5,
        filename: 'page.html',
        contentBase64: big.toString('base64'),
      },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('File exceeds');
  });

  it('cleans HTML, imports assets, uploads to S3, inserts media, and creates post', async () => {
    const htmlContent = '<html><body>Page</body></html>';
    const b64 = Buffer.from(htmlContent).toString('base64');

    let selectCall = 0;
    let insertCall = 0;
    let insertedMedia: Record<string, unknown> | null = null;
    let insertedPost: Record<string, unknown> | null = null;

    dbMock.select.mockImplementation(() => {
      selectCall++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      if (selectCall === 1) {
        // site lookup
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 5 }]) });
      } else {
        // slug collision check — return [] meaning no collision
        Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => []) });
      }
      return c;
    });

    dbMock.insert.mockImplementation(() => {
      insertCall++;
      const c: Record<string, unknown> = {};
      if (insertCall === 1) {
        // media insert
        Object.assign(c, {
          values: vi.fn((v: Record<string, unknown>) => { insertedMedia = v; return c; }),
          returning: vi.fn(async () => []),
        });
      } else {
        // post insert
        Object.assign(c, {
          values: vi.fn((v: Record<string, unknown>) => { insertedPost = v; return c; }),
          returning: vi.fn(async () => [{ id: 200, slug: 'page' }]),
        });
      }
      return c;
    });

    const change = mkChange({
      entityType: 'post',
      operation: 'upload_html',
      payload: { websiteId: 5, filename: 'my-page.html', contentBase64: b64, sourceUrl: 'https://source.com/' },
    });
    const r = await applyPendingChange(change as never, 10, 1);

    expect(cleanEmbedHtml).toHaveBeenCalledWith(htmlContent);
    expect(importHtmlAssets).toHaveBeenCalledWith(
      htmlContent,
      { websiteId: 5, clientId: 10, uploadedBy: 1, baseUrl: 'https://source.com/' },
    );
    expect(uploadToS3).toHaveBeenCalledWith(expect.any(Buffer), 'my-page.html', 'text/html');

    expect(insertedMedia).not.toBeNull();
    expect((insertedMedia as Record<string, unknown>).websiteId).toBe(5);

    expect(insertedPost).not.toBeNull();
    const post = insertedPost as Record<string, unknown>;
    expect(post.postType).toBe('page');
    expect(post.published).toBe(false);
    expect(post.websiteId).toBe(5);

    const rObj = r as Record<string, unknown>;
    expect(rObj.importedAssets).toBe(2);
    expect(rObj.skippedAssets).toBe(0);
    expect(rObj.url).toBe('https://cdn.example.com/my-page.html');
  });

  it('generates a unique slug by appending -2, -3 etc. on collision', async () => {
    const b64 = Buffer.from('<html>x</html>').toString('base64');

    let selectCall = 0;
    dbMock.select.mockImplementation(() => {
      selectCall++;
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      let result: unknown[];
      if (selectCall === 1) result = [{ id: 5 }]; // site
      else if (selectCall === 2) result = [{ id: 1 }]; // slug collision for 'page'
      else result = []; // no collision for 'page-2'
      Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => result) });
      return c;
    });

    let insertedPostSlug = '';
    let insertCall = 0;
    dbMock.insert.mockImplementation(() => {
      insertCall++;
      const c: Record<string, unknown> = {};
      if (insertCall === 1) {
        Object.assign(c, { values: vi.fn(() => c), returning: vi.fn(async () => []) }); // media
      } else {
        Object.assign(c, {
          values: vi.fn((v: Record<string, unknown>) => { insertedPostSlug = v.slug as string; return c; }),
          returning: vi.fn(async () => [{ id: 201, slug: insertedPostSlug }]),
        });
      }
      return c;
    });

    const change = mkChange({
      entityType: 'post',
      operation: 'upload_html',
      payload: { websiteId: 5, filename: 'page.html', contentBase64: b64 },
    });
    await applyPendingChange(change as never, 10, 1);
    expect(insertedPostSlug).toBe('page-2');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// pitch_deck_slides:replace_slides — existing live slide marked for delete
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — pitch_deck_slides:replace_slides (live slide removed)', () => {
  it('marks a live slide not in incoming list as pendingDelete', async () => {
    const existingSlides = [
      { id: 's1', label: 'Keep', blocks: [] },
      { id: 's2', label: 'Remove', blocks: [] },
    ];
    queueSelect([[{ id: 7, slides: existingSlides }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => { patch = p; return c; }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    // incoming only has s1 — s2 should get pendingDelete in draft
    const change = mkChange({
      entityType: 'pitch_deck_slides',
      operation: 'replace_slides',
      entityId: 7,
      payload: { slides: [{ id: 's1', label: 'Keep', blocks: [] }] },
    });
    await applyPendingChange(change as never, 10, 1);
    const slides = (patch as Record<string, unknown>)?.slides as Array<Record<string, unknown>>;
    const s2 = slides.find((s) => s.id === 's2')!;
    expect((s2.draft as Record<string, unknown>).pendingDelete).toBe(true);
  });
});
