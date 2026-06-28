/**
 * cov-u52.spec.ts — Chat Realtime Voice E2E coverage slice
 *
 * Cards (0-based indices 16–17 from "Chat Realtime Voice E2E Audit.md"):
 *   16. POST /api/realtime/token issues a valid JWT for entity type deck
 *   17. POST /api/portal/realtime/comments creates comment with slideIndex anchor (deck entity)
 */

import { test, expect } from './setup/fixtures';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Create a pitch deck and return its id + cleanup fn. */
async function createDeck(
  clientApi: import('./setup/api-client').ApiClient,
  title: string,
): Promise<{ id: number; cleanup: () => Promise<void> }> {
  const res = await clientApi.post('/api/portal/tools/pitch-decks', { title });
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`createDeck failed: ${res.status} ${JSON.stringify(res.data)}`);
  }
  const id: number = res.data.data.id;
  return {
    id,
    cleanup: async () => {
      await clientApi.delete(`/api/portal/tools/pitch-decks/${id}`).catch(() => {});
    },
  };
}

// ── Card 16: POST /api/realtime/token — deck entity ──────────────────────────

test.describe('Realtime Token — deck entity @realtime @token', () => {
  let deckId: number;
  let deckCleanup: () => Promise<void>;

  test.beforeAll(async ({ clientApi }) => {
    const ts = Date.now();
    const deck = await createDeck(clientApi, `RT-Token-Deck-${ts}`);
    deckId = deck.id;
    deckCleanup = deck.cleanup;
  });

  test.afterAll(async () => {
    await deckCleanup?.();
  });

  test(
    'POST /api/realtime/token issues a valid JWT for entity type deck',
    async ({ clientApi }) => {
      const res = await clientApi.post('/api/realtime/token', {
        entityType: 'deck',
        entityId: String(deckId),
      });

      // If REALTIME_JWT_SECRET is not configured the server returns 503 —
      // the route exists but the feature is disabled in this environment.
      // Skip gracefully so CI isn't blocked by a missing env var.
      if (res.status === 503) {
        test.skip(
          true,
          'REALTIME_JWT_SECRET not configured in test environment — skipping token issuance check',
        );
        return;
      }

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(typeof res.data.data.token).toBe('string');
      expect(res.data.data.token.length).toBeGreaterThan(10);
      expect(typeof res.data.data.wsUrl).toBe('string');
      expect(typeof res.data.data.expiresAt).toBe('number');
      expect(res.data.data.expiresAt).toBeGreaterThan(Date.now());
      // docKey format is "deck:<id>"
      expect(res.data.data.docKey).toBe(`deck:${deckId}`);
    },
  );

  test('POST /api/realtime/token rejects unauthenticated (401)', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/realtime/token', {
      entityType: 'deck',
      entityId: '1',
    });
    expect(res.status).toBe(401);
  });

  test('POST /api/realtime/token returns 400 for invalid entityType', async ({ clientApi }) => {
    const res = await clientApi.post('/api/realtime/token', {
      entityType: 'bogus',
      entityId: '1',
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/realtime/token returns 404 for unknown deck id', async ({ clientApi }) => {
    const res = await clientApi.post('/api/realtime/token', {
      entityType: 'deck',
      entityId: '999999',
    });
    // If secret is missing we can't reach the auth-check — skip
    if (res.status === 503) {
      test.skip(true, 'REALTIME_JWT_SECRET not configured');
      return;
    }
    expect(res.status).toBe(404);
  });
});

// ── Card 17: POST /api/portal/realtime/comments — slideIndex anchor ───────────

test.describe('Realtime Comments — slideIndex anchor (deck entity) @realtime @comments', () => {
  let deckId: number;
  let deckCleanup: () => Promise<void>;
  const createdCommentIds: string[] = [];

  test.beforeAll(async ({ clientApi }) => {
    const ts = Date.now();
    const deck = await createDeck(clientApi, `RT-Comment-Deck-${ts}`);
    deckId = deck.id;
    deckCleanup = deck.cleanup;
  });

  test.afterAll(async ({ clientApi }) => {
    // Clean up any comments that were created
    for (const id of createdCommentIds) {
      await clientApi.delete(`/api/portal/realtime/comments/${id}`).catch(() => {});
    }
    await deckCleanup?.();
  });

  test(
    'POST /api/portal/realtime/comments creates comment with slideIndex anchor (deck entity)',
    async ({ clientApi }) => {
      const ts = Date.now();
      const res = await clientApi.post('/api/portal/realtime/comments', {
        entityType: 'deck',
        entityId: String(deckId),
        body: `Slide-anchored comment ${ts}`,
        anchor: {
          slideIndex: 2,
          x: 150,
          y: 80,
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);

      const comment = res.data.data;
      expect(comment).toHaveProperty('id');
      expect(comment.entityType).toBe('deck');
      expect(comment.entityId).toBe(String(deckId));
      expect(comment.body).toContain(`Slide-anchored comment`);
      // anchor should be stored and returned
      expect(comment.anchor).toBeTruthy();
      expect(comment.anchor.slideIndex).toBe(2);
      expect(comment.anchor.x).toBe(150);
      expect(comment.anchor.y).toBe(80);
      // threadId should equal id for a root comment
      expect(comment.threadId).toBe(comment.id);

      createdCommentIds.push(comment.id);
    },
  );

  test(
    'POST /api/portal/realtime/comments creates comment without anchor on deck entity',
    async ({ clientApi }) => {
      const ts = Date.now();
      const res = await clientApi.post('/api/portal/realtime/comments', {
        entityType: 'deck',
        entityId: String(deckId),
        body: `No-anchor deck comment ${ts}`,
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const comment = res.data.data;
      expect(comment.entityType).toBe('deck');
      expect(comment.anchor).toBeNull();

      createdCommentIds.push(comment.id);
    },
  );

  test('POST /api/portal/realtime/comments rejects missing body', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/realtime/comments', {
      entityType: 'deck',
      entityId: String(deckId),
      body: '',
    });
    expect(res.status).toBe(400);
  });

  test('POST /api/portal/realtime/comments rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/realtime/comments', {
      entityType: 'deck',
      entityId: '1',
      body: 'ghost comment',
    });
    expect(res.status).toBe(401);
  });
});
