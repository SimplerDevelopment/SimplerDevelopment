// @vitest-environment node
/**
 * Extra coverage for lib/realtime/internal-publisher.ts beyond the smoke
 * tests in realtime-internal-publisher.test.ts. Focus: the
 * `publishEntityFromDb` DB-lookup path and the never-throw invariant of
 * the lower-level publisher under various failure modes.
 *
 * Note on env var: the file uses `REALTIME_INTERNAL_SECRET` (the existing
 * test references it under that name; the task brief named it
 * `INTERNAL_REALTIME_SECRET` — the actual code wins).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We mock the lazy-imported modules so the publisher can `await import` them
// without booting the real Drizzle client. Each test reassigns these to
// inject the row-shape it wants to exercise.
const dbMock: { selectImpl: () => unknown } = { selectImpl: () => undefined };

vi.mock('@/lib/db', () => {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(dbMock.selectImpl()),
  };
  return {
    db: {
      select: () => chain,
    },
  };
});

vi.mock('@/lib/db/schema', () => ({
  posts: { id: { __col: 'id' }, content: { __col: 'content' } },
  pitchDecks: { id: { __col: 'id' }, slides: { __col: 'slides' } },
  emailCampaigns: { id: { __col: 'id' }, blockContent: { __col: 'blockContent' } },
}));

const {
  publishBlocksUpdate,
  publishSlidesUpdate,
  publishEntityFromDb,
} = await import('@/lib/realtime/internal-publisher');

const realFetch = globalThis.fetch;

describe('publishEntityFromDb — graceful no-throw paths', () => {
  beforeEach(() => {
    process.env.REALTIME_INTERNAL_SECRET = 'test-secret';
    dbMock.selectImpl = () => [];
    // Default fetch stub — successful 200 so non-DB paths can proceed.
    globalThis.fetch = (async () =>
      new Response('', { status: 200 })) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.REALTIME_INTERNAL_SECRET;
  });

  it('post entity not found in DB → ok:false reason=entity_not_found, no throw', async () => {
    dbMock.selectImpl = () => [];
    const result = await publishEntityFromDb({ entityType: 'post', entityId: 9999 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('entity_not_found');
  });

  it('deck entity with empty slides round-trips (publishes empty array, ok:true)', async () => {
    dbMock.selectImpl = () => [{ slides: [] }];
    const result = await publishEntityFromDb({ entityType: 'pitch_deck', entityId: 1 });
    expect(result.ok).toBe(true);
  });

  it('deck entity with non-array slides falls back to []', async () => {
    dbMock.selectImpl = () => [{ slides: null }];
    const result = await publishEntityFromDb({ entityType: 'pitch_deck', entityId: 2 });
    expect(result.ok).toBe(true);
  });

  it('email campaign with no block_content → ok:false reason=no_block_content', async () => {
    dbMock.selectImpl = () => [{ blockContent: null }];
    const result = await publishEntityFromDb({ entityType: 'email_campaign', entityId: 7 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_block_content');
  });

  it('email campaign with malformed block_content (no .blocks array) → no_block_content', async () => {
    dbMock.selectImpl = () => [{ blockContent: { html: '<p/>' } }];
    const result = await publishEntityFromDb({ entityType: 'email_campaign', entityId: 8 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_block_content');
  });

  it('email campaign with valid blocks array publishes ok:true', async () => {
    dbMock.selectImpl = () => [
      { blockContent: { blocks: [{ id: 'a', type: 'text' }] } },
    ];
    const result = await publishEntityFromDb({ entityType: 'email_campaign', entityId: 9 });
    expect(result.ok).toBe(true);
  });

  it('non-numeric entityId for post → ok:false reason=non_numeric_entity_id', async () => {
    const result = await publishEntityFromDb({ entityType: 'post', entityId: 'abc' });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('non_numeric_entity_id');
  });

  it('null entityId → ok:false reason=missing_entity_id', async () => {
    const result = await publishEntityFromDb({ entityType: 'post', entityId: null });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_entity_id');
  });

  it('unknown entity type → ok:false reason=no_editor_for_entity (no DB call, no throw)', async () => {
    const result = await publishEntityFromDb({ entityType: 'proposal', entityId: 1 });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('no_editor_for_entity');
  });

  it('post.content malformed JSON → publishes empty blocks (ok:true), no throw', async () => {
    dbMock.selectImpl = () => [{ content: '{not-json' }];
    const result = await publishEntityFromDb({ entityType: 'post', entityId: 4 });
    // parsePostContentBlocks swallows the JSON error and returns []. The
    // publish then runs against an empty array, which is valid.
    expect(result.ok).toBe(true);
  });

  it('post.content with no .blocks key → publishes empty blocks (ok:true)', async () => {
    dbMock.selectImpl = () => [{ content: JSON.stringify({ html: '<p/>' }) }];
    const result = await publishEntityFromDb({ entityType: 'post', entityId: 5 });
    expect(result.ok).toBe(true);
  });

  it('DB query throws → outer try/catch swallows, returns ok:false, never throws', async () => {
    dbMock.selectImpl = () => {
      throw new Error('connection refused');
    };
    const result = await publishEntityFromDb({ entityType: 'post', entityId: 1 });
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe('string');
  });
});

describe('publish*Update — never-throw invariant under network failure', () => {
  beforeEach(() => {
    process.env.REALTIME_INTERNAL_SECRET = 'test-secret';
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.REALTIME_INTERNAL_SECRET;
  });

  it('publishBlocksUpdate swallows fetch rejection and returns ok:false', async () => {
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;

    const result = await publishBlocksUpdate({
      entityType: 'post',
      entityId: 1,
      blocks: [],
    });
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe('string');
  });

  it('publishBlocksUpdate handles a non-2xx response without throwing', async () => {
    globalThis.fetch = (async () =>
      new Response('boom', { status: 500 })) as typeof fetch;

    const result = await publishBlocksUpdate({
      entityType: 'email',
      entityId: 1,
      blocks: [],
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(500);
  });

  it('publishSlidesUpdate swallows fetch rejection and returns ok:false', async () => {
    globalThis.fetch = (async () => {
      throw new Error('socket hang up');
    }) as typeof fetch;

    const result = await publishSlidesUpdate({ entityId: 1, slides: [] });
    expect(result.ok).toBe(false);
    expect(typeof result.reason).toBe('string');
  });
});

describe('missing REALTIME_INTERNAL_SECRET — short-circuits, never throws', () => {
  beforeEach(() => {
    delete process.env.REALTIME_INTERNAL_SECRET;
  });

  it('publishBlocksUpdate returns missing_secret without making a fetch call', async () => {
    let fetched = false;
    globalThis.fetch = (async () => {
      fetched = true;
      return new Response('', { status: 200 });
    }) as typeof fetch;

    try {
      const result = await publishBlocksUpdate({
        entityType: 'post',
        entityId: 1,
        blocks: [],
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('missing_secret');
      expect(fetched).toBe(false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it('publishSlidesUpdate also short-circuits to missing_secret', async () => {
    const result = await publishSlidesUpdate({ entityId: 1, slides: [] });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('missing_secret');
  });
});
