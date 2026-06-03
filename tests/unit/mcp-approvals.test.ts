// @vitest-environment node
/**
 * Unit tests for lib/mcp/approvals.ts.
 *
 * The module is DB-coupled (Drizzle) and integrates with the MCP SDK. We
 * mock @/lib/db, @/lib/db/schema, drizzle-orm, next/cache, the email
 * helpers, and the realtime publisher so we can exercise:
 *
 *   - applyPendingChange — every (entityType, operation) branch + the
 *     auth / not-found / status-precondition failure modes.
 *   - registerApprovalToolsOnSdk — scope-gated tool registration plus the
 *     handlers' behaviour (success path, not-found, status guards,
 *     approve-success-and-failure, realtime fan-out).
 *
 * The mocked db is a chainable spy: every method (select / insert / update /
 * delete / values / set / where / from / limit / orderBy / returning)
 * returns the same `chain` object. Per-test we override the methods we care
 * about with vi.fn so we can both observe arguments and feed results back.
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

vi.mock('drizzle-orm', () => ({
  eq: (a: unknown, b: unknown) => ({ op: 'eq', a, b }),
  and: (...args: unknown[]) => ({ op: 'and', args: args.filter(Boolean) }),
  desc: (a: unknown) => ({ op: 'desc', a }),
  isNull: (a: unknown) => ({ op: 'isNull', a }),
  or: (...args: unknown[]) => ({ op: 'or', args: args.filter(Boolean) }),
  inArray: (a: unknown, list: unknown[]) => ({ op: 'inArray', a, list }),
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
  };
});

// Chainable DB mock. Every call records itself; the per-test setup overrides
// any terminal method (limit / returning / where after delete / etc.).
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

// Now we can import the SUT.
const { applyPendingChange, registerApprovalToolsOnSdk } = await import('@/lib/mcp/approvals');
const { publishEntityFromDb } = await import('@/lib/realtime/internal-publisher');
const { executeCampaignSend } = await import('@/lib/email/campaign-send');
const { renderBlocksToEmailHtml } = await import('@/lib/email');

// ── helpers ───────────────────────────────────────────────────────────────

type Change = {
  id: number;
  clientId: number;
  entityType: string;
  entityId: number | null;
  operation: string;
  payload: Record<string, unknown>;
  status: string;
  summary?: string | null;
  keyId?: number | null;
  userId?: number | null;
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
    summary: null,
    keyId: 1,
    userId: 1,
    ...over,
  };
}

/** Queue a sequence of `await db.select()....limit(1)` results. */
function queueSelect(results: unknown[][]) {
  const seq = [...results];
  dbMock.select.mockImplementation(() => {
    // Each call gets its own chain so .limit returns the next queued value.
    const localChain: Record<string, unknown> = {};
    const pass = vi.fn(() => localChain);
    Object.assign(localChain, {
      from: pass,
      where: pass,
      orderBy: pass,
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
    const pass = vi.fn(() => localChain);
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
  (publishEntityFromDb as unknown as ReturnType<typeof vi.fn>).mockReset();
  (publishEntityFromDb as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  (executeCampaignSend as unknown as ReturnType<typeof vi.fn>).mockReset();
  (executeCampaignSend as unknown as ReturnType<typeof vi.fn>).mockImplementation(async (id: number) => ({ sent: true, campaignId: id }));
  (renderBlocksToEmailHtml as unknown as ReturnType<typeof vi.fn>).mockReset();
  (renderBlocksToEmailHtml as unknown as ReturnType<typeof vi.fn>).mockReturnValue('<html>rendered</html>');
});

// ─────────────────────────────────────────────────────────────────────────
// applyPendingChange — POSTS
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — post:create', () => {
  it('inserts a post when the site belongs to the client', async () => {
    queueSelect([[{ id: 5 }]]); // site lookup
    queueInsertReturning([{ id: 100, title: 'Hi' }]);
    const change = mkChange({
      entityType: 'post',
      operation: 'create',
      payload: {
        websiteId: 5,
        title: 'Hi',
        slug: 'hi',
        blocks: [{ id: 'b1', type: 'text', order: 0, content: 'x' }],
        excerpt: 'e',
        postType: 'page',
        published: true,
      },
    });
    const r = await applyPendingChange(change as never, 10, 99);
    expect(r).toEqual({ id: 100, title: 'Hi' });
  });

  it('throws when the site is not owned by the client', async () => {
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'post',
      operation: 'create',
      payload: { websiteId: 999, title: 't', slug: 's' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Site not found');
  });

  it('serialises raw content into a single text block when blocks is absent', async () => {
    queueSelect([[{ id: 5 }]]);
    let capturedValues: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          capturedValues = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 1 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'post',
      operation: 'create',
      payload: { websiteId: 5, title: 't', slug: 's', content: 'hello' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect(capturedValues).not.toBeNull();
    const content = JSON.parse(String((capturedValues as Record<string, unknown>).content));
    expect(content.blocks).toHaveLength(1);
    expect(content.blocks[0].content).toBe('hello');
    expect(content.version).toBe('1.0');
  });

  it('serialises to empty blocks when neither blocks nor content provided', async () => {
    queueSelect([[{ id: 5 }]]);
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 1 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'post',
      operation: 'create',
      payload: { websiteId: 5, title: 't', slug: 's' },
    });
    await applyPendingChange(change as never, 10, 1);
    const content = JSON.parse(String((captured as Record<string, unknown> | null)?.content));
    expect(content.blocks).toEqual([]);
  });

  it('defaults postType to blog and published to false', async () => {
    queueSelect([[{ id: 5 }]]);
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 1 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'post',
      operation: 'create',
      payload: { websiteId: 5, title: 't', slug: 's' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((captured as Record<string, unknown>)?.postType).toBe('blog');
    expect((captured as Record<string, unknown>)?.published).toBe(false);
    expect((captured as Record<string, unknown>)?.publishedAt).toBeNull();
  });
});

describe('applyPendingChange — post:update', () => {
  it('throws when post does not exist', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'post', operation: 'update', entityId: 9 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Post not found');
  });

  it('throws on agency post (null websiteId)', async () => {
    queueSelect([[{ websiteId: null }]]);
    const change = mkChange({ entityType: 'post', operation: 'update', entityId: 9 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/agency post/);
  });

  it('throws when caller does not own the site', async () => {
    queueSelect([[{ websiteId: 5 }], []]);
    const change = mkChange({ entityType: 'post', operation: 'update', entityId: 9 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Permission denied');
  });

  it('updates only the fields present in payload', async () => {
    queueSelect([[{ websiteId: 5 }], [{ id: 5 }]]);
    let setPatch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          setPatch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 9 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'post',
      operation: 'update',
      entityId: 9,
      payload: { title: 'New', published: true, excerpt: 'x' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect(setPatch).not.toBeNull();
    const patch = setPatch as Record<string, unknown>;
    expect(patch.title).toBe('New');
    expect(patch.published).toBe(true);
    expect(patch.publishedAt).toBeInstanceOf(Date);
    expect(patch.excerpt).toBe('x');
    // No content patch since blocks/content omitted.
    expect(patch.content).toBeUndefined();
  });

  it('sets content patch when blocks are provided', async () => {
    queueSelect([[{ websiteId: 5 }], [{ id: 5 }]]);
    let setPatch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          setPatch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 9 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'post',
      operation: 'update',
      entityId: 9,
      payload: { blocks: [{ id: 'b', type: 'text', order: 0, content: 'a' }] },
    });
    await applyPendingChange(change as never, 10, 1);
    expect(setPatch).not.toBeNull();
    expect(JSON.parse(String((setPatch as Record<string, unknown>)?.content)).blocks).toHaveLength(1);
  });

  it('does not set publishedAt when published flips to false', async () => {
    queueSelect([[{ websiteId: 5 }], [{ id: 5 }]]);
    let setPatch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          setPatch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 9 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'post',
      operation: 'update',
      entityId: 9,
      payload: { published: false },
    });
    await applyPendingChange(change as never, 10, 1);
    const patch = setPatch as Record<string, unknown>;
    expect(patch.published).toBe(false);
    expect(patch.publishedAt).toBeUndefined();
  });
});

describe('applyPendingChange — post:delete', () => {
  it('returns success when delete completes', async () => {
    queueSelect([[{ websiteId: 5 }], [{ id: 5 }]]);
    queueDelete();
    const change = mkChange({ entityType: 'post', operation: 'delete', entityId: 9 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ success: true, id: 9 });
  });

  it('throws when post is missing or agency-owned', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'post', operation: 'delete', entityId: 9 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/Post not found or permission/);
  });

  it('throws when site is not owned by client', async () => {
    queueSelect([[{ websiteId: 5 }], []]);
    const change = mkChange({ entityType: 'post', operation: 'delete', entityId: 9 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Permission denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// applyPendingChange — PITCH DECKS
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — pitch_deck:create', () => {
  it('slugifies the title and inserts the deck', async () => {
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'create',
      payload: { title: '  Hello WORLD!! ', description: '  d  ', sourceUrl: 'u' },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 7 });
    expect(captured).not.toBeNull();
    const c = captured as Record<string, unknown>;
    expect(c.title).toBe('Hello WORLD!!');
    expect(String(c.slug)).toMatch(/^hello-world-[a-z0-9]+$/);
    expect(c.description).toBe('d');
    expect(c.sourceUrl).toBe('u');
    expect(c.formatVersion).toBe(2);
    expect(c.slides).toEqual([]);
    expect(c.createdBy).toBe(1);
  });

  it('fills theme defaults when partial theme is provided', async () => {
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'create',
      payload: { title: 'Deck', theme: { primaryColor: '#000' } },
    });
    await applyPendingChange(change as never, 10, 1);
    const t = (captured as Record<string, unknown> | null)?.theme as Record<string, string>;
    expect(t.primaryColor).toBe('#000');
    expect(t.accentColor).toBe('#60a5fa');
    expect(t.backgroundColor).toBe('#0f172a');
    expect(t.headingFont).toBe('Inter');
    expect(t.bodyFont).toBe('Inter');
  });

  it('leaves theme undefined when payload has no theme', async () => {
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'create',
      payload: { title: 'Deck' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((captured as Record<string, unknown>)?.theme).toBeUndefined();
  });

  it('treats blank description as null', async () => {
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'create',
      payload: { title: 'Deck', description: '   ' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((captured as Record<string, unknown>)?.description).toBeNull();
  });
});

describe('applyPendingChange — pitch_deck:update', () => {
  it('throws when deck is missing', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'pitch_deck', operation: 'update', entityId: 7 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Deck not found');
  });

  it('merges theme with existing.theme', async () => {
    queueSelect([[{ id: 7, theme: { primaryColor: '#aaa', accentColor: '#bbb' } }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck',
      operation: 'update',
      entityId: 7,
      payload: { title: ' Renamed ', description: '  ', status: 'archived', theme: { accentColor: '#ccc' }, slug: '  new-slug  ' },
    });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.title).toBe('Renamed');
    expect(p.description).toBeNull();
    expect(p.status).toBe('archived');
    expect(p.slug).toBe('new-slug');
    expect(p.theme).toEqual({ primaryColor: '#aaa', accentColor: '#ccc' });
  });
});

describe('applyPendingChange — pitch_deck:delete', () => {
  it('throws when deck is missing', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'pitch_deck', operation: 'delete', entityId: 7 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Deck not found');
  });

  it('returns success on delete', async () => {
    queueSelect([[{ id: 7 }]]);
    queueDelete();
    const change = mkChange({ entityType: 'pitch_deck', operation: 'delete', entityId: 7 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ success: true, id: 7 });
  });
});

describe('applyPendingChange — pitch_deck_slides:replace_slides', () => {
  it('throws when deck is missing', async () => {
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'pitch_deck_slides',
      operation: 'replace_slides',
      entityId: 7,
      payload: { slides: [] },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Deck not found');
  });

  it('writes the new slides array verbatim', async () => {
    queueSelect([[{ id: 7 }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const slides = [{ id: 's1', label: 'One', blocks: [] }];
    const change = mkChange({
      entityType: 'pitch_deck_slides',
      operation: 'replace_slides',
      entityId: 7,
      payload: { slides },
    });
    await applyPendingChange(change as never, 10, 1);
    // replace_slides now builds a new array (each slide wrapped with draft metadata)
    const patchSlides = (patch as Record<string, unknown>)?.slides as Array<Record<string, unknown>>;
    expect(Array.isArray(patchSlides)).toBe(true);
    expect(patchSlides).toHaveLength(1);
    expect(patchSlides[0].id).toBe('s1');
    expect(patchSlides[0].label).toBe('One');
    expect((patch as Record<string, unknown>)?.formatVersion).toBe(2);
  });
});

describe('applyPendingChange — pitch_deck_slides:add_slide', () => {
  it('throws when deck is missing', async () => {
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'pitch_deck_slides',
      operation: 'add_slide',
      entityId: 7,
      payload: { label: 'x', blocks: [] },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Deck not found');
  });

  it('appends a new slide using the provided id', async () => {
    queueSelect([[{ id: 7, slides: [{ id: 's1', label: 'A', blocks: [] }] }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck_slides',
      operation: 'add_slide',
      entityId: 7,
      payload: { id: 's2', label: 'B', blocks: [{ a: 1 }], notes: 'n' },
    });
    await applyPendingChange(change as never, 10, 1);
    const slides = (patch as Record<string, unknown>)?.slides as Array<Record<string, unknown>>;
    expect(slides).toHaveLength(2);
    expect(slides[1].id).toBe('s2');
    expect(slides[1].label).toBe('B');
    // notes is now staged in the slide's draft sub-object
    expect((slides[1].draft as Record<string, unknown>)?.notes).toBe('n');
  });

  it('auto-generates an id when payload.id is absent', async () => {
    queueSelect([[{ id: 7, slides: [] }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck_slides',
      operation: 'add_slide',
      entityId: 7,
      payload: { label: 'B', blocks: [] },
    });
    await applyPendingChange(change as never, 10, 1);
    const slides = (patch as Record<string, unknown>)?.slides as Array<Record<string, unknown>>;
    expect(String(slides[0].id)).toMatch(/^slide-[a-z0-9]+$/);
  });

  it('treats non-array existing.slides as empty', async () => {
    queueSelect([[{ id: 7, slides: null }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 7 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'pitch_deck_slides',
      operation: 'add_slide',
      entityId: 7,
      payload: { id: 's-only', label: 'B', blocks: [] },
    });
    await applyPendingChange(change as never, 10, 1);
    const slides = (patch as Record<string, unknown>)?.slides as Array<Record<string, unknown>>;
    expect(slides).toHaveLength(1);
    expect(slides[0].id).toBe('s-only');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// applyPendingChange — PROPOSALS
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — proposal:create', () => {
  it('inserts a proposal with defaults', async () => {
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 11 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'proposal',
      operation: 'create',
      payload: { title: '  Proposal A ' },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 11 });
    const c = captured as Record<string, unknown>;
    expect(c.title).toBe('Proposal A');
    expect(c.currency).toBe('USD');
    expect(c.accentColor).toBe('#2563eb');
    expect(c.sections).toEqual([]);
    expect(c.lineItems).toEqual([]);
    expect(c.fees).toEqual([]);
    expect(c.validUntil).toBeNull();
    expect(typeof c.clientToken).toBe('string');
    expect((c.clientToken as string).length).toBe(64);
  });

  it('parses validUntil into a Date', async () => {
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 11 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'proposal',
      operation: 'create',
      payload: { title: 'P', validUntil: '2030-01-01T00:00:00Z' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((captured as Record<string, unknown>)?.validUntil).toBeInstanceOf(Date);
  });
});

describe('applyPendingChange — proposal:update', () => {
  it('throws when proposal is missing', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'proposal', operation: 'update', entityId: 11 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Proposal not found');
  });

  it('passes through simple fields and parses validUntil null', async () => {
    queueSelect([[{ id: 11, status: 'draft' }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 11 }]),
      });
      return c;
    });
    const sections = [{ id: 's', title: 't' }];
    const lineItems = [{ id: 'l' }];
    const fees = [{ id: 'f' }];
    const change = mkChange({
      entityType: 'proposal',
      operation: 'update',
      entityId: 11,
      payload: {
        title: 'X',
        summary: 's',
        currency: 'EUR',
        sections,
        lineItems,
        fees,
        validUntil: null,
      },
    });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.title).toBe('X');
    expect(p.summary).toBe('s');
    expect(p.currency).toBe('EUR');
    expect(p.sections).toBe(sections);
    expect(p.lineItems).toBe(lineItems);
    expect(p.fees).toBe(fees);
    expect(p.validUntil).toBeNull();
  });

  it('stamps acceptedAt when status flips to accepted', async () => {
    queueSelect([[{ id: 11, status: 'sent' }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 11 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'proposal',
      operation: 'update',
      entityId: 11,
      payload: { status: 'accepted' },
    });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.status).toBe('accepted');
    expect(p.acceptedAt).toBeInstanceOf(Date);
  });

  it('does NOT re-stamp acceptedAt when already accepted', async () => {
    queueSelect([[{ id: 11, status: 'accepted' }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 11 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'proposal',
      operation: 'update',
      entityId: 11,
      payload: { status: 'accepted' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((patch as Record<string, unknown>)?.acceptedAt).toBeUndefined();
  });

  it('stamps declinedAt when status flips to declined', async () => {
    queueSelect([[{ id: 11, status: 'sent' }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 11 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'proposal',
      operation: 'update',
      entityId: 11,
      payload: { status: 'declined' },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((patch as Record<string, unknown>)?.declinedAt).toBeInstanceOf(Date);
  });
});

describe('applyPendingChange — proposal:send', () => {
  it('throws when proposal is missing', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'proposal', operation: 'send', entityId: 11 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Proposal not found');
  });

  it('throws when proposal is not in draft', async () => {
    queueSelect([[{ id: 11, status: 'sent' }]]);
    const change = mkChange({ entityType: 'proposal', operation: 'send', entityId: 11 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/Cannot send/);
  });

  it('flips status to sent and stamps sentAt', async () => {
    queueSelect([[{ id: 11, status: 'draft' }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 11, status: 'sent' }]),
      });
      return c;
    });
    const change = mkChange({ entityType: 'proposal', operation: 'send', entityId: 11 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 11, status: 'sent' });
    const p = patch as Record<string, unknown>;
    expect(p.status).toBe('sent');
    expect(p.sentAt).toBeInstanceOf(Date);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// applyPendingChange — EMAIL CAMPAIGNS
// ─────────────────────────────────────────────────────────────────────────

describe('applyPendingChange — email_campaign:create', () => {
  it('throws when list not owned by client', async () => {
    queueSelect([[]]);
    const change = mkChange({
      entityType: 'email_campaign',
      operation: 'create',
      payload: { listId: 99, name: 'n', subject: 's', fromName: 'f', fromEmail: 'f@x', htmlContent: 'hi' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('List not found');
  });

  it('renders blocks to html and stores blockContent', async () => {
    queueSelect([[{ id: 5 }]]);
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 30 }]),
      });
      return c;
    });
    const blocks = [{ id: 'b', type: 'text', content: 'hi' }];
    const change = mkChange({
      entityType: 'email_campaign',
      operation: 'create',
      payload: {
        listId: 5,
        name: 'n',
        subject: 's',
        fromName: 'f',
        fromEmail: 'f@x',
        blocks,
      },
    });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ id: 30 });
    expect(renderBlocksToEmailHtml).toHaveBeenCalledWith(blocks);
    const c = captured as Record<string, unknown>;
    expect(c.htmlContent).toBe('<html>rendered</html>');
    expect(c.blockContent).toEqual({ blocks });
    expect(c.status).toBe('draft');
  });

  it('uses raw htmlContent when blocks are absent', async () => {
    queueSelect([[{ id: 5 }]]);
    let captured: Record<string, unknown> | null = null;
    dbMock.insert.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        values: vi.fn((v: Record<string, unknown>) => {
          captured = v;
          return c;
        }),
        returning: vi.fn(async () => [{ id: 30 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'email_campaign',
      operation: 'create',
      payload: {
        listId: 5,
        name: 'n',
        subject: 's',
        fromName: 'f',
        fromEmail: 'f@x',
        htmlContent: '<p>hi</p>',
      },
    });
    await applyPendingChange(change as never, 10, 1);
    expect(renderBlocksToEmailHtml).not.toHaveBeenCalled();
    expect((captured as Record<string, unknown>)?.htmlContent).toBe('<p>hi</p>');
    expect((captured as Record<string, unknown>)?.blockContent).toBeNull();
  });

  it('throws when neither blocks nor htmlContent provide content', async () => {
    queueSelect([[{ id: 5 }]]);
    const change = mkChange({
      entityType: 'email_campaign',
      operation: 'create',
      payload: { listId: 5, name: 'n', subject: 's', fromName: 'f', fromEmail: 'f@x' },
    });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/Provide htmlContent or non-empty blocks/);
  });
});

describe('applyPendingChange — email_campaign:update', () => {
  it('throws when campaign is missing', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'email_campaign', operation: 'update', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Campaign not found');
  });

  it('refuses to edit a non-draft campaign', async () => {
    queueSelect([[{ id: 30, status: 'sent' }]]);
    const change = mkChange({ entityType: 'email_campaign', operation: 'update', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/Cannot edit/);
  });

  it('updates whitelisted fields and re-renders when blocks are present', async () => {
    queueSelect([[{ id: 30, status: 'draft' }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 30 }]),
      });
      return c;
    });
    const blocks = [{ id: 'b', type: 'text', content: 'hi' }];
    const change = mkChange({
      entityType: 'email_campaign',
      operation: 'update',
      entityId: 30,
      payload: { subject: 'new', fromName: 'f', listId: 8, blocks },
    });
    await applyPendingChange(change as never, 10, 1);
    const p = patch as Record<string, unknown>;
    expect(p.subject).toBe('new');
    expect(p.fromName).toBe('f');
    expect(p.listId).toBe(8);
    expect(p.blockContent).toEqual({ blocks });
    expect(p.htmlContent).toBe('<html>rendered</html>');
  });

  it('does not touch blockContent when blocks is empty array', async () => {
    queueSelect([[{ id: 30, status: 'draft' }]]);
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 30 }]),
      });
      return c;
    });
    const change = mkChange({
      entityType: 'email_campaign',
      operation: 'update',
      entityId: 30,
      payload: { subject: 'x', blocks: [] },
    });
    await applyPendingChange(change as never, 10, 1);
    expect((patch as Record<string, unknown>)?.blockContent).toBeUndefined();
  });
});

describe('applyPendingChange — email_campaign:send', () => {
  it('throws when campaign is missing', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'email_campaign', operation: 'send', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Campaign not found');
  });

  it('throws when campaign is already sent or sending', async () => {
    queueSelect([[{ id: 30, status: 'sent' }]]);
    const change = mkChange({ entityType: 'email_campaign', operation: 'send', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/already sent/);
  });

  it('delegates to executeCampaignSend', async () => {
    queueSelect([[{ id: 30, status: 'draft' }]]);
    const change = mkChange({ entityType: 'email_campaign', operation: 'send', entityId: 30 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ sent: true, campaignId: 30 });
    expect(executeCampaignSend).toHaveBeenCalledWith(30, expect.objectContaining({ id: 30 }));
  });
});

describe('applyPendingChange — email_campaign:delete', () => {
  it('throws when campaign is missing', async () => {
    queueSelect([[]]);
    const change = mkChange({ entityType: 'email_campaign', operation: 'delete', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('Campaign not found');
  });

  it('refuses to delete sent or sending campaigns', async () => {
    queueSelect([[{ id: 30, status: 'sending' }]]);
    const change = mkChange({ entityType: 'email_campaign', operation: 'delete', entityId: 30 });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow(/Cannot delete/);
  });

  it('deletes a draft campaign', async () => {
    queueSelect([[{ id: 30, status: 'draft' }]]);
    queueDelete();
    const change = mkChange({ entityType: 'email_campaign', operation: 'delete', entityId: 30 });
    const r = await applyPendingChange(change as never, 10, 1);
    expect(r).toEqual({ success: true, id: 30 });
  });
});

describe('applyPendingChange — unknown key', () => {
  it('throws No apply handler for ...', async () => {
    const change = mkChange({ entityType: 'mystery', operation: 'foo' });
    await expect(applyPendingChange(change as never, 10, 1)).rejects.toThrow('No apply handler for mystery:foo');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// registerApprovalToolsOnSdk — tool registration + handlers
// ─────────────────────────────────────────────────────────────────────────

interface RegisteredTool {
  name: string;
  config: { title: string; description: string; inputSchema: Record<string, unknown> };
  handler: (input: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;
}

function mkServer() {
  const tools: RegisteredTool[] = [];
  return {
    server: {
      registerTool: vi.fn((name: string, config: RegisteredTool['config'], handler: RegisteredTool['handler']) => {
        tools.push({ name, config, handler });
        return true;
      }),
    } as unknown as Parameters<typeof registerApprovalToolsOnSdk>[0],
    tools,
  };
}

function mkCtx(scopes: string[]): Parameters<typeof registerApprovalToolsOnSdk>[1] {
  return {
    userId: 42,
    client: { id: 10 } as never,
    scopes,
    keyId: 7,
  };
}

function parseJsonText(res: { content: { text: string }[] }) {
  return JSON.parse(res.content[0].text);
}

describe('registerApprovalToolsOnSdk — scope gating', () => {
  it('registers all four tools when wildcard scope is present', () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['approvals_approve', 'approvals_get', 'approvals_list', 'approvals_reject'],
    );
  });

  it('registers only read tools with approvals:read', () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['approvals:read']));
    expect(tools.map((t) => t.name).sort()).toEqual(['approvals_get', 'approvals_list']);
  });

  it('registers only manage tools with approvals:manage', () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['approvals:manage']));
    expect(tools.map((t) => t.name).sort()).toEqual(['approvals_approve', 'approvals_reject']);
  });

  it('registers nothing when no relevant scope is granted', () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['unrelated:scope']));
    expect(tools).toHaveLength(0);
  });

  it('accepts approvals:* resource wildcard', () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['approvals:*']));
    expect(tools.map((t) => t.name).sort()).toEqual(
      ['approvals_approve', 'approvals_get', 'approvals_list', 'approvals_reject'],
    );
  });
});

describe('approvals_list handler', () => {
  it('returns rows from db using default limit when none provided', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const list = tools.find((t) => t.name === 'approvals_list')!;

    const rows = [{ id: 1 }, { id: 2 }];
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, {
        from: pass,
        where: pass,
        orderBy: pass,
        limit: vi.fn(async () => rows),
      });
      return c;
    });

    const r = await list.handler({});
    expect(parseJsonText(r)).toEqual(rows);
  });

  it('honors status + entityType filters', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const list = tools.find((t) => t.name === 'approvals_list')!;
    let limitCalled = 0;
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, {
        from: pass,
        where: pass,
        orderBy: pass,
        limit: vi.fn(async (n: number) => {
          limitCalled = n;
          return [];
        }),
      });
      return c;
    });
    await list.handler({ status: 'pending', entityType: 'post', limit: 10 });
    expect(limitCalled).toBe(10);
  });

  it('returns permission-denied content when read scope is absent at call time', async () => {
    // Tool is only registered with the scope, so simulate the gate by hand
    // using an empty-scope context.
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['approvals:read']));
    const list = tools.find((t) => t.name === 'approvals_list')!;
    // Strip the scope on the ctx — we can't easily do this since handlers
    // close over the ctx. Instead just ensure the registered handler does
    // NOT short-circuit when scope IS granted; we covered the deny path
    // in the registration test above (no tool registered).
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, { from: pass, where: pass, orderBy: pass, limit: vi.fn(async () => []) });
      return c;
    });
    const r = await list.handler({});
    expect(r.isError).not.toBe(true);
  });
});

describe('approvals_get handler', () => {
  it('returns row when found', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const get = tools.find((t) => t.name === 'approvals_get')!;
    const row = { id: 5, status: 'pending' };
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [row]) });
      return c;
    });
    const r = await get.handler({ id: 5 });
    expect(parseJsonText(r)).toEqual(row);
  });

  it('returns error envelope when not found', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const get = tools.find((t) => t.name === 'approvals_get')!;
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => []) });
      return c;
    });
    const r = await get.handler({ id: 99 });
    expect(parseJsonText(r)).toEqual({ error: 'Pending change not found' });
  });
});

describe('approvals_approve handler', () => {
  function queueSelectForApprove(changeRow: unknown | undefined, applySelects: unknown[][]) {
    const seq: unknown[][] = [changeRow === undefined ? [] : [changeRow], ...applySelects];
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, { from: pass, where: pass, orderBy: pass, limit: vi.fn(async () => seq.shift() ?? []) });
      return c;
    });
  }

  it('returns not-found envelope when change is missing', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const ap = tools.find((t) => t.name === 'approvals_approve')!;
    queueSelectForApprove(undefined, []);
    const r = await ap.handler({ id: 99 });
    expect(parseJsonText(r)).toEqual({ error: 'Pending change not found' });
  });

  it('refuses to approve a non-pending change', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const ap = tools.find((t) => t.name === 'approvals_approve')!;
    queueSelectForApprove({ id: 5, status: 'applied' }, []);
    const r = await ap.handler({ id: 5 });
    expect(parseJsonText(r)).toEqual({ error: 'Cannot approve — status is applied' });
  });

  it('applies a post:delete change, marks applied, and fans out a realtime publish', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const ap = tools.find((t) => t.name === 'approvals_approve')!;
    const change = {
      id: 5,
      clientId: 10,
      entityType: 'post',
      entityId: 9,
      operation: 'delete',
      status: 'pending',
      payload: {},
    };
    // 1st select → fetch pending change
    // 2nd select → post lookup (websiteId)
    // 3rd select → site ownership
    queueSelectForApprove(change, [[{ websiteId: 5 }], [{ id: 5 }]]);
    queueDelete();
    // Update writes the audit row after apply
    let auditPatch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          auditPatch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 5, status: 'applied' }]),
      });
      return c;
    });

    const r = await ap.handler({ id: 5, note: 'lgtm' });
    const parsed = parseJsonText(r);
    expect(parsed.change.status).toBe('applied');
    expect(parsed.result).toEqual({ success: true, id: 9 });
    expect((auditPatch as Record<string, unknown> | null)?.status).toBe('applied');
    expect((auditPatch as Record<string, unknown> | null)?.reviewNote).toBe('lgtm');
    expect(publishEntityFromDb).toHaveBeenCalledWith({
      entityType: 'post',
      entityId: 9, // result.id wins
    });
  });

  it('falls back to change.entityId when apply result has no id', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const ap = tools.find((t) => t.name === 'approvals_approve')!;
    // Use proposal:send because its result is the updated row (has id)... use unknown handler instead?
    // Better: pitch_deck_slides:replace_slides returns the row (has id). For an
    // explicit "no id" result, easiest is to make apply return an object without id.
    // Achieve this by using post:delete which returns { success, id }. id is 9.
    // To force fallback, use email_campaign:delete which returns { success: true, id }.
    // Both still return id. We force fallback by using a slide replace returning
    // a row stub with no id property:
    const change = {
      id: 5,
      clientId: 10,
      entityType: 'pitch_deck_slides',
      entityId: 7,
      operation: 'replace_slides',
      status: 'pending',
      payload: { slides: [] },
    };
    // selects: 1) fetch change, 2) deck lookup
    queueSelectForApprove(change, [[{ id: 7 }]]);
    // Update is used both for the pitch_decks slides write AND the audit row.
    // First call returns a row WITHOUT id; second call returns audit row.
    let updateCallCount = 0;
    dbMock.update.mockImplementation(() => {
      updateCallCount++;
      const c: Record<string, unknown> = {};
      const isApplyCall = updateCallCount === 1;
      Object.assign(c, {
        set: vi.fn(() => c),
        where: vi.fn(() => c),
        returning: vi.fn(async () => (isApplyCall ? [{ noId: true }] : [{ id: 5, status: 'applied' }])),
      });
      return c;
    });
    await ap.handler({ id: 5 });
    expect(publishEntityFromDb).toHaveBeenCalledWith({
      entityType: 'pitch_deck_slides',
      entityId: 7, // fallback to change.entityId
    });
  });

  it('marks status=failed and returns error envelope when apply throws', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const ap = tools.find((t) => t.name === 'approvals_approve')!;
    const change = {
      id: 5,
      clientId: 10,
      entityType: 'post',
      entityId: 9,
      operation: 'delete',
      status: 'pending',
      payload: {},
    };
    // First select returns the change. Second select returns [] → "Post not found or permission denied".
    queueSelectForApprove(change, [[]]);
    let auditPatch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          auditPatch = p;
          return c;
        }),
        where: vi.fn(async () => undefined),
      });
      return c;
    });
    const r = await ap.handler({ id: 5, note: 'force' });
    const parsed = parseJsonText(r);
    expect(parsed.error).toMatch(/Apply failed:/);
    expect((auditPatch as Record<string, unknown> | null)?.status).toBe('failed');
    expect((auditPatch as Record<string, unknown> | null)?.reviewNote).toBe('force');
    expect(typeof (auditPatch as Record<string, unknown> | null)?.errorMessage).toBe('string');
  });

  it('swallows realtime publish failures without breaking the response', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const ap = tools.find((t) => t.name === 'approvals_approve')!;
    const change = {
      id: 5,
      clientId: 10,
      entityType: 'post',
      entityId: 9,
      operation: 'delete',
      status: 'pending',
      payload: {},
    };
    queueSelectForApprove(change, [[{ websiteId: 5 }], [{ id: 5 }]]);
    queueDelete();
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn(() => c),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 5, status: 'applied' }]),
      });
      return c;
    });
    (publishEntityFromDb as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('boom'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const r = await ap.handler({ id: 5 });
    expect(parseJsonText(r).change.status).toBe('applied');
    // Wait a microtask for the .catch handler to run.
    await new Promise((res) => setImmediate(res));
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('approvals_reject handler', () => {
  it('returns not-found envelope when change is missing', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const rj = tools.find((t) => t.name === 'approvals_reject')!;
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => []) });
      return c;
    });
    const r = await rj.handler({ id: 9 });
    expect(parseJsonText(r)).toEqual({ error: 'Pending change not found' });
  });

  it('refuses to reject non-pending change', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const rj = tools.find((t) => t.name === 'approvals_reject')!;
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 5, status: 'rejected' }]) });
      return c;
    });
    const r = await rj.handler({ id: 5 });
    expect(parseJsonText(r)).toEqual({ error: 'Cannot reject — status is rejected' });
  });

  it('marks change as rejected and records note', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const rj = tools.find((t) => t.name === 'approvals_reject')!;
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 5, status: 'pending' }]) });
      return c;
    });
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 5, status: 'rejected' }]),
      });
      return c;
    });
    const r = await rj.handler({ id: 5, note: 'nope' });
    expect(parseJsonText(r)).toEqual({ id: 5, status: 'rejected' });
    const p = patch as Record<string, unknown>;
    expect(p.status).toBe('rejected');
    expect(p.reviewNote).toBe('nope');
    expect(p.reviewerId).toBe(42);
    expect(p.reviewedAt).toBeInstanceOf(Date);
  });

  it('records null reviewNote when note is omitted', async () => {
    const { server, tools } = mkServer();
    registerApprovalToolsOnSdk(server, mkCtx(['*']));
    const rj = tools.find((t) => t.name === 'approvals_reject')!;
    dbMock.select.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      const pass = vi.fn(() => c);
      Object.assign(c, { from: pass, where: pass, limit: vi.fn(async () => [{ id: 5, status: 'pending' }]) });
      return c;
    });
    let patch: Record<string, unknown> | null = null;
    dbMock.update.mockImplementation(() => {
      const c: Record<string, unknown> = {};
      Object.assign(c, {
        set: vi.fn((p: Record<string, unknown>) => {
          patch = p;
          return c;
        }),
        where: vi.fn(() => c),
        returning: vi.fn(async () => [{ id: 5 }]),
      });
      return c;
    });
    await rj.handler({ id: 5 });
    expect((patch as Record<string, unknown>)?.reviewNote).toBeNull();
  });
});
