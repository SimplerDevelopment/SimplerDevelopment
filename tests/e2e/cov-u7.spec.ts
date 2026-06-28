/**
 * cov-u7.spec.ts — Brain AI coverage slice [8..11]
 *
 * Cards:
 *   [8]  topics merge: POST /brain/topics/[id]/merge re-parents children and re-attaches entities then deletes source
 *   [9]  org-unit merge: POST /brain/org-units/[id]/merge moves members and children to target then deletes source
 *   [10] task promote-to-kanban: POST /brain/tasks/[id]/promote-to-kanban creates a Kanban card and links back to the brain task
 *   [11] knowledge trash empty: POST /brain/knowledge/trash/empty hard-deletes all soft-deleted notes for the tenant
 *
 * All tests are API-only (ApiClient fixture), create and clean up their own data,
 * and require BRAIN_ENTITLEMENT_BYPASS=true in the server env (same as other brain specs).
 */
import { test, expect } from './setup/fixtures';
import { randomUUID } from 'crypto';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

// ── Helpers ───────────────────────────────────────────────────────────────────

type ApiClient = import('./setup/api-client').ApiClient;

/** Create a topic (root). Returns the created row or throws. */
async function createTopic(api: ApiClient, name: string): Promise<{ id: number; name: string; slug: string }> {
  const res = await api.post('/api/portal/brain/topics', { name });
  if (!res.data?.success) throw new Error(`createTopic failed: ${res.data?.message ?? res.status}`);
  return res.data.data as { id: number; name: string; slug: string };
}

/** Best-effort delete a topic. */
async function deleteTopic(api: ApiClient, id: number): Promise<void> {
  // Two passes: children first pass, then parent
  for (let i = 0; i < 2; i++) {
    await api.delete(`/api/portal/brain/topics/${id}?force=true`).catch(() => null);
  }
}

/** Create an org-unit. Returns the row or throws. */
async function createOrgUnit(api: ApiClient, name: string): Promise<{ id: number; name: string }> {
  const res = await api.post('/api/portal/brain/org-units', { name });
  if (!res.data?.success) throw new Error(`createOrgUnit failed: ${res.data?.message ?? res.status}`);
  return res.data.data as { id: number; name: string };
}

/** Best-effort delete an org-unit. */
async function deleteOrgUnit(api: ApiClient, id: number): Promise<void> {
  await api.delete(`/api/portal/brain/org-units/${id}`).catch(() => null);
}

/** Create a brain task. Returns the row or throws. */
async function createBrainTask(api: ApiClient, title: string): Promise<{ id: number; title: string }> {
  const res = await api.post('/api/portal/brain/tasks', { title });
  if (!res.data?.success) throw new Error(`createBrainTask failed: ${res.data?.message ?? res.status}`);
  return res.data.data as { id: number; title: string };
}

/** Delete a brain task. */
async function deleteBrainTask(api: ApiClient, id: number): Promise<void> {
  await api.delete(`/api/portal/brain/tasks/${id}`).catch(() => null);
}

/** Create a Kanban project + columns. Returns project and columns. */
async function createKanbanProject(api: ApiClient): Promise<{
  project: { id: number; name: string };
  columns: { id: number; name: string }[];
  cleanup: () => Promise<void>;
}> {
  const name = `E2E Brain-U7 Project ${uniq()}`;
  const res = await api.post('/api/portal/projects', { name, description: 'e2e cov-u7' });
  if (!res.data?.success) throw new Error(`createKanbanProject failed: ${res.data?.message}`);
  const project = res.data.data as { id: number; name: string };

  const columns: { id: number; name: string }[] = [];
  for (const colName of ['Backlog', 'Done']) {
    const colRes = await api.post(`/api/portal/projects/${project.id}/columns`, { name: colName });
    if (colRes.data?.success) columns.push(colRes.data.data);
  }

  const cleanup = async () => {
    for (const col of columns) {
      await api.delete(`/api/portal/projects/${project.id}/columns/${col.id}`).catch(() => {});
    }
    await api
      .patch(`/api/portal/projects/${project.id}`, { status: 'archived', name: `[archived-e2e] ${name}` })
      .catch(() => {});
  };
  return { project, columns, cleanup };
}

/** Create a brain knowledge note. Returns the row or throws. */
async function createNote(api: ApiClient, title: string): Promise<{ id: number; title: string }> {
  const res = await api.post('/api/portal/brain/knowledge', { title });
  if (!res.data?.success) throw new Error(`createNote failed: ${res.data?.message ?? res.status}`);
  return res.data.data as { id: number; title: string };
}

/** Soft-delete a note (first DELETE call). */
async function softDeleteNote(api: ApiClient, id: number): Promise<void> {
  await api.delete(`/api/portal/brain/knowledge/${id}`).catch(() => null);
}

/** Hard-delete a note (two DELETE calls, like brain-knowledge.spec.ts). */
async function hardDeleteNote(api: ApiClient, id: number): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const res = await api.delete(`/api/portal/brain/knowledge/${id}`).catch(() => null);
    if (!res) return;
    if (res.status === 404) return;
    if (res.status === 200 && res.data?.data?.deleted === 'hard') return;
  }
}

// ── [8] topics merge ──────────────────────────────────────────────────────────

test.describe('Brain — topics merge @brain @brain-topics', () => {
  let sourceId: number | null = null;
  let targetId: number | null = null;

  test.afterAll(async ({ clientApi }) => {
    // Source should already be deleted by the merge; delete target and any
    // stragglers best-effort.
    if (sourceId) await deleteTopic(clientApi, sourceId);
    if (targetId) await deleteTopic(clientApi, targetId);
  });

  test('POST /brain/topics/[id]/merge deletes source and returns merged summary', async ({ clientApi }) => {
    const label = uniq();
    const source = await createTopic(clientApi, `merge-src-${label}`);
    const target = await createTopic(clientApi, `merge-tgt-${label}`);
    sourceId = source.id;
    targetId = target.id;

    const res = await clientApi.post(`/api/portal/brain/topics/${source.id}/merge`, {
      targetTopicId: target.id,
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // The merge outcome should reference the surviving target
    expect(res.data.data).toHaveProperty('targetId');
    expect(res.data.data.targetId).toBe(target.id);

    // Source should be gone (404)
    const sourceCheck = await clientApi.get(`/api/portal/brain/topics/${source.id}`);
    expect(sourceCheck.status).toBe(404);
    sourceId = null; // already deleted
  });

  test('POST /brain/topics/[id]/merge with same src=target returns 409 or 400', async ({ clientApi }) => {
    const label = uniq();
    const topic = await createTopic(clientApi, `merge-self-${label}`);
    try {
      const res = await clientApi.post(`/api/portal/brain/topics/${topic.id}/merge`, {
        targetTopicId: topic.id,
      });
      // Either a 409 conflict or 400 bad-request is acceptable
      expect([400, 409]).toContain(res.status);
      expect(res.data.success).toBe(false);
    } finally {
      await deleteTopic(clientApi, topic.id);
    }
  });

  test('POST /brain/topics/[id]/merge rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/brain/topics/1/merge', { targetTopicId: 2 });
    expect(res.status).toBe(401);
  });

  test('POST /brain/topics/[id]/merge requires targetTopicId in body', async ({ clientApi }) => {
    const label = uniq();
    const topic = await createTopic(clientApi, `merge-bad-body-${label}`);
    try {
      const res = await clientApi.post(`/api/portal/brain/topics/${topic.id}/merge`, {});
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    } finally {
      await deleteTopic(clientApi, topic.id);
    }
  });
});

// ── [9] org-unit merge ────────────────────────────────────────────────────────

test.describe('Brain — org-unit merge @brain @brain-org-units', () => {
  let sourceId: number | null = null;
  let targetId: number | null = null;

  test.afterAll(async ({ clientApi }) => {
    if (sourceId) await deleteOrgUnit(clientApi, sourceId);
    if (targetId) await deleteOrgUnit(clientApi, targetId);
  });

  test('POST /brain/org-units/[id]/merge deletes source and returns surviving target', async ({ clientApi }) => {
    const label = uniq();
    const source = await createOrgUnit(clientApi, `ou-src-${label}`);
    const target = await createOrgUnit(clientApi, `ou-tgt-${label}`);
    sourceId = source.id;
    targetId = target.id;

    const res = await clientApi.post(`/api/portal/brain/org-units/${source.id}/merge`, {
      targetOrgUnitId: target.id,
    });

    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    // The response data should be the surviving target org unit
    const merged = res.data.data as { id: number; name: string };
    expect(merged.id).toBe(target.id);
    sourceId = null; // merged/deleted
  });

  test('POST /brain/org-units/[id]/merge requires targetOrgUnitId', async ({ clientApi }) => {
    const label = uniq();
    const unit = await createOrgUnit(clientApi, `ou-bad-${label}`);
    try {
      const res = await clientApi.post(`/api/portal/brain/org-units/${unit.id}/merge`, {});
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    } finally {
      await deleteOrgUnit(clientApi, unit.id);
    }
  });

  test('POST /brain/org-units/[id]/merge rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/brain/org-units/1/merge', { targetOrgUnitId: 2 });
    expect(res.status).toBe(401);
  });
});

// ── [10] task promote-to-kanban ───────────────────────────────────────────────

test.describe('Brain — task promote-to-kanban @brain @brain-tasks', () => {
  test('POST /brain/tasks/[id]/promote-to-kanban creates Kanban card and returns linkage', async ({ clientApi }) => {
    const label = uniq();
    const task = await createBrainTask(clientApi, `promote-task-${label}`);
    const { project, columns, cleanup: projCleanup } = await createKanbanProject(clientApi);

    try {
      const res = await clientApi.post(
        `/api/portal/brain/tasks/${task.id}/promote-to-kanban`,
        { projectId: project.id, columnId: columns[0]?.id },
      );

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      // The response includes cardId (the new Kanban card) and the updated task
      // (with linkedKanbanCardId set).  Shape: { cardId, columnId, projectId, task }
      const out = res.data.data as { cardId?: number; task?: { linkedKanbanCardId?: number } };
      expect(out).toHaveProperty('cardId');
      expect(typeof out.cardId).toBe('number');
      expect(out.task?.linkedKanbanCardId).toBe(out.cardId);
    } finally {
      await deleteBrainTask(clientApi, task.id);
      await projCleanup();
    }
  });

  test('POST /brain/tasks/[id]/promote-to-kanban requires projectId', async ({ clientApi }) => {
    const label = uniq();
    const task = await createBrainTask(clientApi, `promote-bad-${label}`);
    try {
      const res = await clientApi.post(`/api/portal/brain/tasks/${task.id}/promote-to-kanban`, {});
      expect(res.status).toBe(400);
      expect(res.data.success).toBe(false);
    } finally {
      await deleteBrainTask(clientApi, task.id);
    }
  });

  test('POST /brain/tasks/[id]/promote-to-kanban rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/brain/tasks/1/promote-to-kanban', { projectId: 1 });
    expect(res.status).toBe(401);
  });
});

// ── [11] knowledge trash empty ────────────────────────────────────────────────

test.describe('Brain — knowledge trash empty @brain @brain-knowledge', () => {
  test('POST /brain/knowledge/trash/empty returns { deleted: number } and hard-deletes trashed notes', async ({ clientApi }) => {
    const label = uniq();
    // Create two notes and soft-delete them so they land in the trash
    const note1 = await createNote(clientApi, `trash-note-A-${label}`);
    const note2 = await createNote(clientApi, `trash-note-B-${label}`);
    await softDeleteNote(clientApi, note1.id);
    await softDeleteNote(clientApi, note2.id);

    // Verify they appear in the trash list (shape: { data: { items: [...] } })
    const trashList = await clientApi.get('/api/portal/brain/knowledge?trashed=true');
    expect(trashList.status).toBe(200);
    const trashIds = (trashList.data.data.items as { id: number }[]).map((n) => n.id);
    expect(trashIds).toContain(note1.id);
    expect(trashIds).toContain(note2.id);

    // Empty the trash
    const emptyRes = await clientApi.post('/api/portal/brain/knowledge/trash/empty', {});
    expect(emptyRes.status).toBe(200);
    expect(emptyRes.data.success).toBe(true);
    expect(emptyRes.data.data).toHaveProperty('deleted');
    expect(typeof emptyRes.data.data.deleted).toBe('number');
    expect(emptyRes.data.data.deleted).toBeGreaterThanOrEqual(2);

    // Both notes should now be 404
    const check1 = await clientApi.get(`/api/portal/brain/knowledge/${note1.id}`);
    const check2 = await clientApi.get(`/api/portal/brain/knowledge/${note2.id}`);
    expect(check1.status).toBe(404);
    expect(check2.status).toBe(404);
  });

  test('POST /brain/knowledge/trash/empty returns deleted=0 when trash is already empty', async ({ clientApi }) => {
    // Empty first (clear any leftovers from other tests)
    await clientApi.post('/api/portal/brain/knowledge/trash/empty', {});

    // Now empty again — should be idempotent
    const res = await clientApi.post('/api/portal/brain/knowledge/trash/empty', {});
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.deleted).toBe(0);
  });

  test('POST /brain/knowledge/trash/empty rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/brain/knowledge/trash/empty', {});
    expect(res.status).toBe(401);
  });
});
