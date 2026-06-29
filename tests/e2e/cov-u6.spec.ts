/**
 * cov-u6.spec.ts — Company Brain AI coverage slice (unit 6, indices 4–7)
 *
 * Cards covered:
 *   4. review-items reject mutation: POST /brain/review-items/[id]/reject
 *   5. saved-searches CRUD lifecycle: create → list → update → delete
 *   6. brain note custom fields: GET /brain/knowledge/[id]/fields
 *   7. topics attach + for-entity: POST /brain/topics/attach; GET /topics/for-entity
 *
 * All tests are pure API (no browser), use the clientApi fixture, and clean up
 * created rows in afterAll / finally blocks so the suite is rerunnable.
 */
import { test, expect } from './setup/fixtures';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCb);

const uniq = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

// ── Helpers ────────────────────────────────────────────────────────────────

const DB_URL =
  process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/simplerdev_test';

async function psql(sql: string): Promise<string> {
  const { stdout } = await exec(`psql "${DB_URL}" -t -c "${sql.replace(/"/g, '\\"')}"`);
  return stdout.trim();
}

/** Insert a minimal pending review item for clientId=1 and return its id. */
async function insertPendingReviewItem(label: string): Promise<number> {
  const out = await psql(
    `INSERT INTO brain_ai_review_items (client_id, source_type, source_id, proposed_type, proposed_payload, status) ` +
    `VALUES (1, 'manual', 0, 'task', '{"title":"${label}","priority":"medium"}', 'pending') RETURNING id;`,
  );
  const id = parseInt(out.trim(), 10);
  if (!Number.isFinite(id)) throw new Error(`Failed to insert review item: raw="${out}"`);
  return id;
}

async function deleteReviewItem(id: number) {
  await psql(`DELETE FROM brain_ai_review_items WHERE id = ${id};`).catch(() => {});
}

/** Hard-delete a brain note (call DELETE twice to go through soft-delete then hard-delete). */
async function hardDeleteNote(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const res = await api.delete(`/api/portal/brain/knowledge/${id}`).catch(() => null);
    if (!res || res.status === 404) return;
  }
}

// ── Card 4: review-items reject mutation ──────────────────────────────────

test.describe('Brain Review Items — reject mutation @brain @review-items', () => {
  let reviewItemId: number | null = null;

  test.afterAll(async () => {
    if (reviewItemId !== null) {
      await deleteReviewItem(reviewItemId);
    }
  });

  test('POST /brain/review-items/[id]/reject transitions status to rejected', async ({
    clientApi,
  }) => {
    const label = `E2E reject ${uniq()}`;
    reviewItemId = await insertPendingReviewItem(label);

    const res = await clientApi.post(
      `/api/portal/brain/review-items/${reviewItemId}/reject`,
      { reason: 'Not relevant' },
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('id', reviewItemId);
    expect(res.data.data.status).toBe('rejected');
  });

  test('POST /brain/review-items/[id]/reject with no reason still succeeds', async ({
    clientApi,
  }) => {
    const label2 = `E2E reject no-reason ${uniq()}`;
    const id2 = await insertPendingReviewItem(label2);
    try {
      const res = await clientApi.post(`/api/portal/brain/review-items/${id2}/reject`, {});
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.status).toBe('rejected');
    } finally {
      await deleteReviewItem(id2);
    }
  });

  test('POST /brain/review-items/[id]/reject returns 404 for unknown id', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/portal/brain/review-items/999999999/reject', {
      reason: 'ghost',
    });
    expect(res.status).toBe(404);
  });

  test('POST /brain/review-items/[id]/reject returns 400 for invalid id', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/portal/brain/review-items/abc/reject', {});
    expect(res.status).toBe(400);
  });

  test('POST /brain/review-items/[id]/reject rejects unauthenticated', async ({
    unauthApi,
  }) => {
    const res = await unauthApi.post('/api/portal/brain/review-items/1/reject', {});
    expect(res.status).toBe(401);
  });
});

// ── Card 5: saved-searches CRUD lifecycle ─────────────────────────────────

test.describe('Brain Saved Searches — CRUD lifecycle @brain @saved-searches', () => {
  let savedSearchId: number | null = null;

  test.afterAll(async ({ clientApi }) => {
    if (savedSearchId !== null) {
      await clientApi.delete(`/api/portal/brain/saved-searches/${savedSearchId}`).catch(() => {});
    }
  });

  test(
    'POST create → GET list → GET by id → PATCH update → DELETE a saved search',
    async ({ clientApi }) => {
      const name = `E2E SavedSearch ${uniq()}`;

      // CREATE
      const created = await clientApi.post('/api/portal/brain/saved-searches', {
        name,
        filters: { search: 'test', pinnedOnly: false },
        icon: 'search',
        sortOrder: 0,
      });
      expect(created.status, JSON.stringify(created.data)).toBe(200);
      expect(created.data.success).toBe(true);
      expect(created.data.data).toHaveProperty('id');
      expect(created.data.data.name).toBe(name);
      savedSearchId = created.data.data.id as number;

      // LIST — must include our new row
      const list = await clientApi.get('/api/portal/brain/saved-searches');
      expect(list.status, JSON.stringify(list.data)).toBe(200);
      expect(list.data.success).toBe(true);
      expect(Array.isArray(list.data.data.items)).toBe(true);
      expect(list.data.data.items.some((s: { id: number }) => s.id === savedSearchId)).toBe(true);

      // GET by id
      const got = await clientApi.get(`/api/portal/brain/saved-searches/${savedSearchId}`);
      expect(got.status, JSON.stringify(got.data)).toBe(200);
      expect(got.data.success).toBe(true);
      expect(got.data.data.id).toBe(savedSearchId);
      expect(got.data.data.name).toBe(name);

      // PATCH update
      const newName = `${name} (updated)`;
      const patched = await clientApi.patch(`/api/portal/brain/saved-searches/${savedSearchId}`, {
        name: newName,
        sortOrder: 5,
      });
      expect(patched.status, JSON.stringify(patched.data)).toBe(200);
      expect(patched.data.success).toBe(true);
      expect(patched.data.data.name).toBe(newName);

      // DELETE
      const deleted = await clientApi.delete(
        `/api/portal/brain/saved-searches/${savedSearchId}`,
      );
      expect(deleted.status, JSON.stringify(deleted.data)).toBe(200);
      expect(deleted.data.success).toBe(true);
      savedSearchId = null; // already deleted — skip afterAll cleanup

      // Confirm gone
      const gone = await clientApi.get(
        `/api/portal/brain/saved-searches/${savedSearchId ?? 999999999}`,
      );
      expect(gone.status).toBe(404);
    },
  );

  test('POST saved-search rejects missing name', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/saved-searches', {
      filters: { search: 'x' },
    });
    expect(res.status).toBe(400);
  });

  test('POST saved-search rejects missing filters', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/saved-searches', {
      name: `No-filter ${uniq()}`,
    });
    expect(res.status).toBe(400);
  });

  test('GET /saved-searches rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/brain/saved-searches');
    expect(res.status).toBe(401);
  });
});

// ── Card 6: brain note custom fields ──────────────────────────────────────

test.describe('Brain Note Custom Fields @brain @note-custom-fields', () => {
  let noteId: number | null = null;

  test.afterAll(async ({ clientApi }) => {
    if (noteId !== null) {
      await hardDeleteNote(clientApi, noteId);
    }
  });

  test('GET /brain/knowledge/[id]/fields returns items array (no fields defined is empty)', async ({
    clientApi,
  }) => {
    // Create a note first
    const title = `E2E CF Note ${uniq()}`;
    const created = await clientApi.post('/api/portal/brain/knowledge', {
      title,
      body: 'Custom fields test note',
      tags: [],
    });
    expect(created.status, JSON.stringify(created.data)).toBe(200);
    expect(created.data.success).toBe(true);
    noteId = created.data.data.id as number;

    // GET fields — may be empty if no custom field definitions exist yet
    const res = await clientApi.get(`/api/portal/brain/knowledge/${noteId}/fields`);
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('items');
    expect(Array.isArray(res.data.data.items)).toBe(true);
    // Each item has definition + value shape
    for (const item of res.data.data.items as Array<{
      definition: { id: number; fieldName: string };
      value: unknown;
      valueId: number | null;
    }>) {
      expect(item).toHaveProperty('definition');
      expect(item.definition).toHaveProperty('id');
      expect(item.definition).toHaveProperty('fieldName');
      expect(item).toHaveProperty('value');
      expect(item).toHaveProperty('valueId');
    }
  });

  test('GET /brain/knowledge/[id]/fields returns 404 for unknown note', async ({
    clientApi,
  }) => {
    const res = await clientApi.get('/api/portal/brain/knowledge/999999999/fields');
    expect(res.status).toBe(404);
  });

  test('GET /brain/knowledge/[id]/fields returns 400 for invalid id', async ({
    clientApi,
  }) => {
    const res = await clientApi.get('/api/portal/brain/knowledge/abc/fields');
    expect(res.status).toBe(400);
  });

  test('GET /brain/knowledge/[id]/fields rejects unauthenticated', async ({
    unauthApi,
  }) => {
    const res = await unauthApi.get('/api/portal/brain/knowledge/1/fields');
    expect(res.status).toBe(401);
  });
});

// ── Card 7: topics attach + for-entity ────────────────────────────────────

test.describe('Brain Topics — attach + for-entity @brain @topics-attach', () => {
  let noteId: number | null = null;
  let topicId: number | null = null;

  test.afterAll(async ({ clientApi }) => {
    // Detach topic from note if still attached
    if (noteId !== null && topicId !== null) {
      await clientApi
        .delete('/api/portal/brain/topics/attach', {
          entityType: 'note',
          entityId: noteId,
          topicIds: [topicId],
        })
        .catch(() => {});
    }
    if (noteId !== null) {
      await hardDeleteNote(clientApi, noteId).catch(() => {});
    }
    if (topicId !== null) {
      // Pass ?force=true to cascade-detach any entity links before delete
      await clientApi.delete(`/api/portal/brain/topics/${topicId}?force=true`).catch(() => {});
    }
  });

  test(
    'POST /brain/topics/attach links a topic to a note; GET /for-entity returns it',
    async ({ clientApi }) => {
      // Create a note
      const noteTitle = `E2E Topic Note ${uniq()}`;
      const noteRes = await clientApi.post('/api/portal/brain/knowledge', {
        title: noteTitle,
        body: 'Topic attach test',
        tags: [],
      });
      expect(noteRes.status, JSON.stringify(noteRes.data)).toBe(200);
      expect(noteRes.data.success).toBe(true);
      noteId = noteRes.data.data.id as number;

      // Create a topic
      const topicName = `E2E Topic ${uniq()}`;
      const topicRes = await clientApi.post('/api/portal/brain/topics', {
        name: topicName,
        icon: 'tag',
        color: '#6366f1',
      });
      expect(topicRes.status, JSON.stringify(topicRes.data)).toBe(201);
      expect(topicRes.data.success).toBe(true);
      topicId = topicRes.data.data.id as number;

      // ATTACH topic to note
      const attachRes = await clientApi.post('/api/portal/brain/topics/attach', {
        entityType: 'note',
        entityId: noteId,
        topicIds: [topicId],
      });
      expect(attachRes.status, JSON.stringify(attachRes.data)).toBe(200);
      expect(attachRes.data.success).toBe(true);
      expect(attachRes.data.data).toHaveProperty('attached');
      // First attach: attached >= 1 (or alreadyAttached if run twice)
      expect(
        (attachRes.data.data.attached as number) + (attachRes.data.data.alreadyAttached as number),
      ).toBeGreaterThanOrEqual(1);

      // GET /for-entity — should return our topic
      const forEntityRes = await clientApi.get(
        `/api/portal/brain/topics/for-entity?entityType=note&entityId=${noteId}`,
      );
      expect(forEntityRes.status, JSON.stringify(forEntityRes.data)).toBe(200);
      expect(forEntityRes.data.success).toBe(true);
      expect(Array.isArray(forEntityRes.data.data.topicIds)).toBe(true);
      expect(forEntityRes.data.data.topicIds).toContain(topicId);
      expect(Array.isArray(forEntityRes.data.data.topics)).toBe(true);
      const foundTopic = (
        forEntityRes.data.data.topics as Array<{ id: number; name: string }>
      ).find((t) => t.id === topicId);
      expect(foundTopic).toBeTruthy();
      expect(foundTopic?.name).toBe(topicName);
    },
  );

  test('POST /brain/topics/attach is idempotent (second attach = alreadyAttached)', async ({
    clientApi,
  }) => {
    // Depends on noteId + topicId from previous test — guard
    if (!noteId || !topicId) {
      test.skip(true, 'Previous setup test did not complete');
      return;
    }
    const res = await clientApi.post('/api/portal/brain/topics/attach', {
      entityType: 'note',
      entityId: noteId,
      topicIds: [topicId],
    });
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.alreadyAttached).toBeGreaterThanOrEqual(1);
  });

  test('POST /brain/topics/attach rejects invalid entityType', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/topics/attach', {
      entityType: 'bogus',
      entityId: 1,
      topicIds: [1],
    });
    expect(res.status).toBe(400);
  });

  test('POST /brain/topics/attach rejects empty topicIds', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/topics/attach', {
      entityType: 'note',
      entityId: 1,
      topicIds: [],
    });
    expect(res.status).toBe(400);
  });

  test('GET /brain/topics/for-entity returns 400 for missing entityType', async ({
    clientApi,
  }) => {
    const res = await clientApi.get('/api/portal/brain/topics/for-entity?entityId=1');
    expect(res.status).toBe(400);
  });

  test('GET /brain/topics/for-entity returns empty arrays for entity with no topics', async ({
    clientApi,
  }) => {
    // Fresh note that has never had a topic attached
    const n = await clientApi.post('/api/portal/brain/knowledge', {
      title: `E2E TopiclessNote ${uniq()}`,
      body: '',
      tags: [],
    });
    expect(n.status).toBe(200);
    const nid = n.data.data.id as number;
    try {
      const res = await clientApi.get(
        `/api/portal/brain/topics/for-entity?entityType=note&entityId=${nid}`,
      );
      expect(res.status, JSON.stringify(res.data)).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.data.topicIds).toEqual([]);
      expect(res.data.data.topics).toEqual([]);
    } finally {
      await hardDeleteNote(clientApi, nid);
    }
  });

  test('GET /brain/topics/for-entity rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get(
      '/api/portal/brain/topics/for-entity?entityType=note&entityId=1',
    );
    expect(res.status).toBe(401);
  });
});
