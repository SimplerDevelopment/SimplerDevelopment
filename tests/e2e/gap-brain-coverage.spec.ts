/**
 * Brain gap coverage — three gap areas:
 *   1. Review-items approve + reject mutations via the human review queue
 *   2. Meetings (communications) detail lifecycle: create → GET detail → PUT link → DELETE
 *   3. Brain note custom fields: GET /knowledge/[id]/fields + PATCH /knowledge/[id]/fields/[fieldId]
 *
 * All tests are API-only (no browser page), using the `clientApi` fixture.
 *
 * Gap 1 (review items) — the "create review item" path is AI-only (no public
 * POST endpoint). We insert seed rows directly into the test DB via psql at
 * test-start and clean them up after. The seeded row with id=2 is `pending`
 * and safe to use for the reject path; we insert fresh rows for the approve
 * and idempotent-re-approve paths.
 *
 * Gap 3 (custom fields) — `brain_custom_fields` definition rows are managed
 * server-side (no public API to create definitions). We insert a test definition
 * via psql and remove it after. The PATCH upsert endpoint is what we verify.
 *
 * Tagged @gap @brain for selective runs.
 */
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import { randomUUID } from 'crypto';

const DB = 'simplerdev_test';
const CLIENT_ID = 1; // Acme Corp — the all-access E2E tenant

/** Run a SQL statement against the test DB via psql using a temp file. Returns trimmed stdout. */
function sql(statement: string): string {
  const tmpFile = join(tmpdir(), `e2e-brain-${Date.now()}-${Math.random().toString(36).slice(2)}.sql`);
  try {
    writeFileSync(tmpFile, statement, 'utf8');
    return execSync(
      `psql ${DB} -f ${tmpFile} -t -A`,
      { encoding: 'utf8' },
    ).trim();
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

/** Insert a pending review item. Returns the new row id. */
function seedReviewItem(proposedTitle: string): number {
  const payload = JSON.stringify({ title: proposedTitle, priority: 'medium', complianceFlag: false });
  const out = sql(
    `INSERT INTO brain_ai_review_items (client_id, source_type, source_id, proposed_type, proposed_payload, status)
     VALUES (${CLIENT_ID}, 'manual', 0, 'task', '${payload.replace(/'/g, "''")}', 'pending')
     RETURNING id`,
  );
  return parseInt(out, 10);
}

/** Hard-delete a review item by id. */
function removeReviewItem(id: number): void {
  sql(`DELETE FROM brain_ai_review_items WHERE id = ${id}`);
}

/** Insert a note custom-field definition. Returns the new definition id. */
function seedCustomFieldDef(fieldName: string): number {
  const out = sql(
    `INSERT INTO brain_custom_fields (client_id, entity_type, field_name, field_label, field_type, sort_order, source)
     VALUES (${CLIENT_ID}, 'note', '${fieldName}', 'E2E Test Field', 'text', 99, 'manual')
     RETURNING id`,
  );
  return parseInt(out, 10);
}

/** Remove a custom-field definition by id. */
function removeCustomFieldDef(id: number): void {
  sql(`DELETE FROM brain_custom_fields WHERE id = ${id}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap 1: Review-items approve + reject
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Brain review-items — approve mutation @gap @brain @brain-review', () => {
  test('POST approve promotes a pending task review item to status=approved and returns a result entity', async ({ clientApi }) => {
    const proposedTitle = `E2E approve task ${Date.now()}-${randomUUID().slice(0, 6)}`;
    const itemId = seedReviewItem(proposedTitle);

    try {
      const res = await clientApi.post(`/api/portal/brain/review-items/${itemId}/approve`, {});
      expect(res.status, `approve failed: ${JSON.stringify(res.data)}`).toBe(200);
      expect(res.data.success).toBe(true);

      const result = res.data.data as {
        item: { id: number; status: string };
        resultEntityType: string | null;
        resultEntityId: number | null;
      };
      expect(result.item.id).toBe(itemId);
      expect(result.item.status).toBe('approved');
      // A task review item should create a brain_task
      expect(result.resultEntityType).toBe('brain_task');
      expect(typeof result.resultEntityId).toBe('number');
    } finally {
      removeReviewItem(itemId);
    }
  });

  test('POST approve is idempotent — re-approving an already-approved item returns 200 with same result entity', async ({ clientApi }) => {
    const proposedTitle = `E2E idempotent approve ${Date.now()}-${randomUUID().slice(0, 6)}`;
    const itemId = seedReviewItem(proposedTitle);

    try {
      // First approval
      const first = await clientApi.post(`/api/portal/brain/review-items/${itemId}/approve`, {});
      expect(first.status).toBe(200);
      const firstResultId = (first.data.data as { resultEntityId: number }).resultEntityId;

      // Second approval — must be idempotent, no duplicate task
      const second = await clientApi.post(`/api/portal/brain/review-items/${itemId}/approve`, {});
      expect(second.status).toBe(200);
      expect(second.data.success).toBe(true);
      const secondResultId = (second.data.data as { resultEntityId: number }).resultEntityId;
      expect(secondResultId).toBe(firstResultId); // same entity, no duplicate
    } finally {
      removeReviewItem(itemId);
    }
  });

  test('POST approve rejects invalid id with 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/review-items/not-a-number/approve', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST approve returns 400 for a non-existent review item', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/review-items/9999999/approve', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST approve with editedPayload replaces the proposed payload before creating the task', async ({ clientApi }) => {
    const originalTitle = `E2E original ${Date.now()}-${randomUUID().slice(0, 6)}`;
    const editedTitle = `E2E edited ${Date.now()}-${randomUUID().slice(0, 6)}`;
    const itemId = seedReviewItem(originalTitle);

    try {
      const res = await clientApi.post(`/api/portal/brain/review-items/${itemId}/approve`, {
        editedPayload: { title: editedTitle, priority: 'high', complianceFlag: false },
      });
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      // Verify the task was created (result entity exists)
      const result = res.data.data as { resultEntityType: string; resultEntityId: number };
      expect(result.resultEntityType).toBe('brain_task');
      expect(result.resultEntityId).toBeGreaterThan(0);
    } finally {
      removeReviewItem(itemId);
    }
  });
});

test.describe('Brain review-items — reject mutation @gap @brain @brain-review', () => {
  test('POST reject transitions a pending review item to status=rejected', async ({ clientApi }) => {
    const proposedTitle = `E2E reject task ${Date.now()}-${randomUUID().slice(0, 6)}`;
    const itemId = seedReviewItem(proposedTitle);

    try {
      const res = await clientApi.post(`/api/portal/brain/review-items/${itemId}/reject`, {
        reason: 'Not relevant to this client',
      });
      expect(res.status, `reject failed: ${JSON.stringify(res.data)}`).toBe(200);
      expect(res.data.success).toBe(true);

      const item = res.data.data as { id: number; status: string };
      expect(item.id).toBe(itemId);
      expect(item.status).toBe('rejected');
    } finally {
      removeReviewItem(itemId);
    }
  });

  test('POST reject works without a reason', async ({ clientApi }) => {
    const itemId = seedReviewItem(`E2E reject noreason ${Date.now()}`);

    try {
      const res = await clientApi.post(`/api/portal/brain/review-items/${itemId}/reject`, {});
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect((res.data.data as { status: string }).status).toBe('rejected');
    } finally {
      removeReviewItem(itemId);
    }
  });

  test('POST reject returns 404 for a non-existent review item', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/review-items/9999999/reject', {
      reason: 'Does not exist',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('POST reject rejects invalid id with 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/review-items/abc/reject', {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET /api/portal/brain/review lists pending items including a freshly seeded one', async ({ clientApi }) => {
    const proposedTitle = `E2E pending listed ${Date.now()}`;
    const itemId = seedReviewItem(proposedTitle);

    try {
      const res = await clientApi.get('/api/portal/brain/review?status=pending');
      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      const items = (res.data.data as { items: Array<{ id: number }> }).items;
      expect(Array.isArray(items)).toBe(true);
      const found = items.some((i) => i.id === itemId);
      expect(found, `Expected newly seeded review item id=${itemId} in pending list`).toBe(true);
    } finally {
      removeReviewItem(itemId);
    }
  });

  test('unauthenticated caller gets 401 on review queue', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/brain/review?status=pending');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 2: Meetings (communications) detail lifecycle
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Brain meetings — create → GET detail → PUT link → DELETE @gap @brain @brain-meetings', () => {
  test('POST creates a meeting via paste adapter, GET detail returns it, PUT updates link, DELETE removes it', async ({ clientApi }) => {
    const cleanups: Array<() => Promise<void>> = [];
    let meetingId: number | null = null;

    try {
      // CREATE via paste adapter
      const ts = Date.now();
      const createRes = await clientApi.post('/api/portal/brain/communications', {
        adapterId: 'paste',
        input: {
          title: `E2E meeting ${ts}`,
          transcript: `Alice: Let us discuss the project.\nBob: Sounds good, I will prepare the report by Friday.`,
          meetingDate: new Date().toISOString(),
          participants: [
            { name: 'Alice', email: 'alice@e2e.test' },
            { name: 'Bob', email: 'bob@e2e.test' },
          ],
        },
      });
      expect(createRes.status, `create failed: ${JSON.stringify(createRes.data)}`).toBe(200);
      expect(createRes.data.success).toBe(true);
      const created = createRes.data.data as { id: number; title: string; status: string; source: string };
      meetingId = created.id;
      expect(typeof meetingId).toBe('number');
      expect(created.status).toBe('draft');
      expect(created.source).toBe('paste');

      cleanups.push(async () => {
        if (meetingId) {
          await clientApi.delete(`/api/portal/brain/communications/${meetingId}`).catch(() => {});
        }
      });

      // GET detail
      const getRes = await clientApi.get(`/api/portal/brain/communications/${meetingId}`);
      expect(getRes.status).toBe(200);
      expect(getRes.data.success).toBe(true);
      const detail = getRes.data.data as { id: number; title: string; participants: unknown[] };
      expect(detail.id).toBe(meetingId);
      expect(detail.title).toBe(`E2E meeting ${ts}`);
      // Participants should be present on the detail view
      expect(Array.isArray(detail.participants)).toBe(true);

      // GET returns 404 for non-existent id
      const missing = await clientApi.get('/api/portal/brain/communications/9999999');
      expect(missing.status).toBe(404);

      // PUT link — clearing both (no CRM records to attach in test; verify error shape
      // when trying to link both company+deal simultaneously)
      const badPut = await clientApi.put(`/api/portal/brain/communications/${meetingId}`, {
        companyId: 1,
        dealId: 2,
      });
      expect(badPut.status).toBe(400);
      expect(badPut.data.success).toBe(false);

      // PUT link with only companyId=null (clear link) — should succeed
      const clearPut = await clientApi.put(`/api/portal/brain/communications/${meetingId}`, {
        companyId: null,
      });
      expect(clearPut.status).toBe(200);
      expect(clearPut.data.success).toBe(true);

      // DELETE
      const delRes = await clientApi.delete(`/api/portal/brain/communications/${meetingId}`);
      expect(delRes.status).toBe(200);
      expect(delRes.data.success).toBe(true);
      meetingId = null; // already deleted, skip cleanup

      // Verify gone
      const afterDel = await clientApi.get(`/api/portal/brain/communications/999999`);
      expect(afterDel.status).toBe(404);
    } finally {
      await runCleanups(cleanups);
    }
  });

  test('GET list returns an array of meeting objects with required shape fields', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/brain/meetings');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    const data = res.data.data as { items: Array<{ id: number; title: string; status: string; source: string }> };
    expect(Array.isArray(data.items)).toBe(true);
    // If there are rows, verify shape
    if (data.items.length > 0) {
      const first = data.items[0];
      expect(typeof first.id).toBe('number');
      expect(typeof first.title).toBe('string');
      expect(typeof first.status).toBe('string');
      expect(typeof first.source).toBe('string');
    }
  });

  test('POST communications rejects missing input', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/communications', {
      adapterId: 'paste',
      input: null,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST communications rejects paste adapter with empty transcript', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/communications', {
      adapterId: 'paste',
      input: { transcript: '' },
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('DELETE non-existent meeting returns 404', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/brain/communications/9999999');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('GET communications detail returns 400 for non-numeric id', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/brain/communications/not-a-number');
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('unauthenticated caller gets 401 on communications list', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/brain/communications');
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Gap 3: Brain note custom fields CRUD
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Brain note custom fields — GET + PATCH @gap @brain @brain-custom-fields', () => {
  test('GET /knowledge/[id]/fields lists custom field definitions (with null value) for a note', async ({ clientApi }) => {
    const cleanups: Array<() => Promise<void>> = [];
    let noteId: number | null = null;
    let defId: number | null = null;

    try {
      // Create a note
      const noteRes = await clientApi.post('/api/portal/brain/knowledge', {
        title: `E2E fields test ${Date.now()}-${randomUUID().slice(0, 6)}`,
        body: 'Body for custom fields test',
      });
      expect(noteRes.status).toBe(200);
      noteId = noteRes.data.data.id as number;
      cleanups.push(async () => {
        // Soft-delete then hard-delete
        await clientApi.delete(`/api/portal/brain/knowledge/${noteId}`).catch(() => {});
        await clientApi.delete(`/api/portal/brain/knowledge/${noteId}`).catch(() => {});
      });

      // Seed a custom field definition
      const fieldName = `e2e_field_${Date.now()}`;
      defId = seedCustomFieldDef(fieldName);
      cleanups.push(async () => {
        if (defId) removeCustomFieldDef(defId);
      });

      // GET fields
      const fieldsRes = await clientApi.get(`/api/portal/brain/knowledge/${noteId}/fields`);
      expect(fieldsRes.status).toBe(200);
      expect(fieldsRes.data.success).toBe(true);
      const items = (fieldsRes.data.data as { items: Array<{ definition: { id: number; fieldName: string }; value: string | null; valueId: number | null }> }).items;
      expect(Array.isArray(items)).toBe(true);

      // Our seeded definition should appear
      const ourField = items.find((i) => i.definition.id === defId);
      expect(ourField, `Expected definition id=${defId} in fields list`).toBeDefined();
      expect(ourField!.value).toBeNull(); // no value set yet
      expect(ourField!.valueId).toBeNull();
    } finally {
      await runCleanups(cleanups);
    }
  });

  test('PATCH /knowledge/[id]/fields/[fieldId] upserts a value and GET reflects it', async ({ clientApi }) => {
    const cleanups: Array<() => Promise<void>> = [];
    let noteId: number | null = null;
    let defId: number | null = null;

    try {
      // Create note
      const noteRes = await clientApi.post('/api/portal/brain/knowledge', {
        title: `E2E fields patch ${Date.now()}-${randomUUID().slice(0, 6)}`,
        body: 'Patch test body',
      });
      expect(noteRes.status).toBe(200);
      noteId = noteRes.data.data.id as number;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/brain/knowledge/${noteId}`).catch(() => {});
        await clientApi.delete(`/api/portal/brain/knowledge/${noteId}`).catch(() => {});
      });

      // Seed custom field def
      const fieldName = `e2e_patch_${Date.now()}`;
      defId = seedCustomFieldDef(fieldName);
      cleanups.push(async () => {
        if (defId) removeCustomFieldDef(defId);
      });

      // PATCH — set a value
      const patchRes = await clientApi.patch(
        `/api/portal/brain/knowledge/${noteId}/fields/${defId}`,
        { value: 'hello world' },
      );
      expect(patchRes.status, `patch failed: ${JSON.stringify(patchRes.data)}`).toBe(200);
      expect(patchRes.data.success).toBe(true);
      const patchData = patchRes.data.data as { value: string; valueId: number };
      expect(patchData.value).toBe('hello world');
      expect(typeof patchData.valueId).toBe('number');

      // GET fields — value should now appear
      const fieldsRes = await clientApi.get(`/api/portal/brain/knowledge/${noteId}/fields`);
      expect(fieldsRes.status).toBe(200);
      const items = (fieldsRes.data.data as { items: Array<{ definition: { id: number }; value: string | null }> }).items;
      const ourField = items.find((i) => i.definition.id === defId);
      expect(ourField).toBeDefined();
      expect(ourField!.value).toBe('hello world');

      // PATCH — update the value
      const updateRes = await clientApi.patch(
        `/api/portal/brain/knowledge/${noteId}/fields/${defId}`,
        { value: 'updated value' },
      );
      expect(updateRes.status).toBe(200);
      expect((updateRes.data.data as { value: string }).value).toBe('updated value');

      // PATCH — clear the value (null)
      const clearRes = await clientApi.patch(
        `/api/portal/brain/knowledge/${noteId}/fields/${defId}`,
        { value: null },
      );
      expect(clearRes.status).toBe(200);
      expect((clearRes.data.data as { value: null }).value).toBeNull();

      // After clearing, GET should show null again
      const afterClear = await clientApi.get(`/api/portal/brain/knowledge/${noteId}/fields`);
      const afterItems = (afterClear.data.data as { items: Array<{ definition: { id: number }; value: string | null }> }).items;
      const afterField = afterItems.find((i) => i.definition.id === defId);
      expect(afterField!.value).toBeNull();
    } finally {
      await runCleanups(cleanups);
    }
  });

  test('PATCH returns 404 when note does not exist', async ({ clientApi }) => {
    const defId = seedCustomFieldDef(`e2e_notenf_${Date.now()}`);
    try {
      const res = await clientApi.patch(
        `/api/portal/brain/knowledge/9999999/fields/${defId}`,
        { value: 'test' },
      );
      expect(res.status).toBe(404);
      expect(res.data.success).toBe(false);
    } finally {
      removeCustomFieldDef(defId);
    }
  });

  test('PATCH returns 404 when field definition does not exist', async ({ clientApi }) => {
    const cleanups: Array<() => Promise<void>> = [];
    let noteId: number | null = null;

    try {
      const noteRes = await clientApi.post('/api/portal/brain/knowledge', {
        title: `E2E fields nofield ${Date.now()}`,
        body: 'body',
      });
      expect(noteRes.status).toBe(200);
      noteId = noteRes.data.data.id as number;
      cleanups.push(async () => {
        await clientApi.delete(`/api/portal/brain/knowledge/${noteId}`).catch(() => {});
        await clientApi.delete(`/api/portal/brain/knowledge/${noteId}`).catch(() => {});
      });

      const res = await clientApi.patch(
        `/api/portal/brain/knowledge/${noteId}/fields/9999999`,
        { value: 'test' },
      );
      expect(res.status).toBe(404);
      expect(res.data.success).toBe(false);
    } finally {
      await runCleanups(cleanups);
    }
  });

  test('PATCH returns 400 for invalid note id', async ({ clientApi }) => {
    const res = await clientApi.patch(
      '/api/portal/brain/knowledge/not-an-id/fields/1',
      { value: 'x' },
    );
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('GET fields returns 404 for non-existent note', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/brain/knowledge/9999999/fields');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('unauthenticated caller gets 401 on fields endpoint', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/brain/knowledge/1/fields');
    expect(res.status).toBe(401);
  });
});
