/**
 * Brain Knowledge — overhaul coverage.
 *
 * Covers the new endpoints and lifecycle flows added in the
 * brain-knowledge-overhaul branch:
 *   • soft-delete + hard-delete + restore lifecycle
 *   • list sort param (title asc/desc) scoped via search token
 *   • bulk endpoint (add_tags, replace_tag_prefix, soft_delete, restore,
 *     hard_delete) at /knowledge/bulk
 *   • template CRUD + create-note-from-template
 *   • per-note history endpoint
 *   • wiki-link extraction populating /backlinks
 *
 * All tests are pure API (no browser page), use the existing
 * `clientApi` fixture from `tests/e2e/setup/fixtures.ts`, and clean up
 * created records in `finally` blocks so the suite is rerunnable. Each
 * test uses a per-test timestamp + random suffix to avoid cross-run /
 * cross-test collisions.
 *
 * Tagged `@brain` for selective runs.
 */
import { test, expect } from './setup/fixtures';
import { randomUUID } from 'crypto';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

// ─── Helper: hard-delete a note regardless of its current state ────────────
//
// The single DELETE endpoint is state-dependent — it soft-deletes a live
// note and hard-deletes an already-soft-deleted note. To reliably purge a
// test record from cleanup blocks we call DELETE up to twice and ignore
// 404s.
async function hardDeleteNote(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  for (let i = 0; i < 2; i++) {
    const res = await api.delete(`/api/portal/brain/knowledge/${id}`).catch(() => null);
    if (!res) return;
    if (res.status === 404) return;
    if (res.status === 200 && res.data?.data?.deleted === 'hard') return;
  }
}

async function bulkHardDelete(
  api: import('./setup/api-client').ApiClient,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  // Best-effort: ensure each is purged. The bulk hard_delete op only
  // affects already-soft-deleted notes, so soft_delete first.
  await api
    .post('/api/portal/brain/knowledge/bulk', { ids, op: { kind: 'soft_delete' } })
    .catch(() => null);
  await api
    .post('/api/portal/brain/knowledge/bulk', { ids, op: { kind: 'hard_delete' } })
    .catch(() => null);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Soft-delete + restore lifecycle
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Knowledge — soft delete + restore @brain @brain-knowledge-lifecycle', () => {
  test('DELETE soft-deletes, list hides, ?trashed=true shows, restore brings it back, second DELETE hard-deletes', async ({
    clientApi,
  }) => {
    const ts = uniq();
    const title = `E2E sd-target ${ts}`;
    let id: number | null = null;

    try {
      // CREATE
      const create = await clientApi.post('/api/portal/brain/knowledge', {
        title,
        body: 'soft-delete lifecycle body',
      });
      expect(create.status, JSON.stringify(create.data)).toBe(200);
      expect(create.data?.success).toBe(true);
      id = create.data.data.id as number;

      // LIST default — note present.
      const listInitial = await clientApi.get(
        `/api/portal/brain/knowledge?search=${encodeURIComponent(ts)}`,
      );
      expect(listInitial.status).toBe(200);
      const initialItems: Array<{ id: number }> = listInitial.data.data.items;
      expect(initialItems.some((n) => n.id === id)).toBe(true);

      // FIRST DELETE → soft.
      const softRes = await clientApi.delete(`/api/portal/brain/knowledge/${id}`);
      expect(softRes.status).toBe(200);
      expect(softRes.data?.success).toBe(true);
      expect(softRes.data?.data?.deleted).toBe('soft');

      // LIST default — note absent.
      const listAfterSoft = await clientApi.get(
        `/api/portal/brain/knowledge?search=${encodeURIComponent(ts)}`,
      );
      expect(listAfterSoft.status).toBe(200);
      const afterSoftItems: Array<{ id: number }> = listAfterSoft.data.data.items;
      expect(afterSoftItems.some((n) => n.id === id)).toBe(false);

      // LIST ?trashed=true — note present.
      const listTrashed = await clientApi.get(
        `/api/portal/brain/knowledge?trashed=true&search=${encodeURIComponent(ts)}`,
      );
      expect(listTrashed.status).toBe(200);
      const trashedItems: Array<{ id: number }> = listTrashed.data.data.items;
      expect(trashedItems.some((n) => n.id === id)).toBe(true);

      // RESTORE.
      const restoreRes = await clientApi.post(
        `/api/portal/brain/knowledge/${id}/restore`,
      );
      expect(restoreRes.status).toBe(200);
      expect(restoreRes.data?.success).toBe(true);

      // LIST default — note returns.
      const listAfterRestore = await clientApi.get(
        `/api/portal/brain/knowledge?search=${encodeURIComponent(ts)}`,
      );
      expect(listAfterRestore.status).toBe(200);
      const restoredItems: Array<{ id: number }> = listAfterRestore.data.data.items;
      expect(restoredItems.some((n) => n.id === id)).toBe(true);

      // SECOND lifecycle: soft, then hard.
      const softAgain = await clientApi.delete(`/api/portal/brain/knowledge/${id}`);
      expect(softAgain.status).toBe(200);
      expect(softAgain.data?.data?.deleted).toBe('soft');

      const hardRes = await clientApi.delete(`/api/portal/brain/knowledge/${id}`);
      expect(hardRes.status).toBe(200);
      expect(hardRes.data?.data?.deleted).toBe('hard');

      // LIST ?trashed=true — note no longer present.
      const listAfterHard = await clientApi.get(
        `/api/portal/brain/knowledge?trashed=true&search=${encodeURIComponent(ts)}`,
      );
      expect(listAfterHard.status).toBe(200);
      const afterHardItems: Array<{ id: number }> = listAfterHard.data.data.items;
      expect(afterHardItems.some((n) => n.id === id)).toBe(false);

      // We've already hard-deleted the only record — clear id so cleanup is a no-op.
      id = null;
    } finally {
      if (id != null) {
        await hardDeleteNote(clientApi, id);
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Sort param (title asc / desc), scoped via a unique search token
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Knowledge — sort param @brain @brain-knowledge-sort', () => {
  test('GET ?sort=title&order=asc|desc orders by title', async ({ clientApi }) => {
    const token = `e2e-sort-${uniq()}`;
    const titles = [`A-${token}`, `M-${token}`, `Z-${token}`];
    const ids: number[] = [];

    try {
      for (const title of titles) {
        const res = await clientApi.post('/api/portal/brain/knowledge', { title });
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        ids.push(res.data.data.id as number);
      }

      // ASC.
      const asc = await clientApi.get(
        `/api/portal/brain/knowledge?sort=title&order=asc&search=${encodeURIComponent(token)}&limit=200`,
      );
      expect(asc.status).toBe(200);
      const ascTitles = (asc.data.data.items as Array<{ title: string }>)
        .map((n) => n.title)
        .filter((t) => t.includes(token));
      expect(ascTitles).toEqual([`A-${token}`, `M-${token}`, `Z-${token}`]);

      // DESC.
      const desc = await clientApi.get(
        `/api/portal/brain/knowledge?sort=title&order=desc&search=${encodeURIComponent(token)}&limit=200`,
      );
      expect(desc.status).toBe(200);
      const descTitles = (desc.data.data.items as Array<{ title: string }>)
        .map((n) => n.title)
        .filter((t) => t.includes(token));
      expect(descTitles).toEqual([`Z-${token}`, `M-${token}`, `A-${token}`]);
    } finally {
      await bulkHardDelete(clientApi, ids);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Bulk endpoint
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Knowledge — bulk endpoint @brain @brain-knowledge-bulk', () => {
  test('add_tags → replace_tag_prefix → soft_delete → restore lifecycle', async ({
    clientApi,
  }) => {
    const token = `e2e-bulk-${uniq()}`;
    const ids: number[] = [];

    try {
      for (let i = 0; i < 3; i++) {
        const res = await clientApi.post('/api/portal/brain/knowledge', {
          title: `Bulk ${i} ${token}`,
        });
        expect(res.status, JSON.stringify(res.data)).toBe(200);
        ids.push(res.data.data.id as number);
      }

      // ── add_tags ──
      const addTags = await clientApi.post('/api/portal/brain/knowledge/bulk', {
        ids,
        op: { kind: 'add_tags', tags: ['e2e-bulk-tag'] },
      });
      expect(addTags.status, JSON.stringify(addTags.data)).toBe(200);
      expect(addTags.data?.success).toBe(true);
      expect(addTags.data?.data?.updated).toBe(3);

      for (const id of ids) {
        const res = await clientApi.get(`/api/portal/brain/knowledge/${id}`);
        expect(res.status).toBe(200);
        const tags: string[] = res.data.data.tags ?? [];
        expect(tags).toContain('e2e-bulk-tag');
      }

      // ── replace_tag_prefix ──
      const replace = await clientApi.post('/api/portal/brain/knowledge/bulk', {
        ids,
        op: { kind: 'replace_tag_prefix', from: 'e2e-bulk-tag', to: 'kb/e2e/folder' },
      });
      expect(replace.status, JSON.stringify(replace.data)).toBe(200);
      expect(replace.data?.success).toBe(true);

      for (const id of ids) {
        const res = await clientApi.get(`/api/portal/brain/knowledge/${id}`);
        expect(res.status).toBe(200);
        const tags: string[] = res.data.data.tags ?? [];
        expect(tags).toContain('kb/e2e/folder');
        expect(tags).not.toContain('e2e-bulk-tag');
      }

      // ── soft_delete ──
      const soft = await clientApi.post('/api/portal/brain/knowledge/bulk', {
        ids,
        op: { kind: 'soft_delete' },
      });
      expect(soft.status, JSON.stringify(soft.data)).toBe(200);
      expect(soft.data?.success).toBe(true);

      // GET-by-id is read-action and the route does not filter out soft-deleted
      // notes (`getNote` reads by id+clientId only). So GET still 200s; assert
      // `deletedAt` is populated. If any environment changes that to 404 we
      // fall back to asserting the note appears under `?trashed=true`.
      for (const id of ids) {
        const res = await clientApi.get(`/api/portal/brain/knowledge/${id}`);
        if (res.status === 200) {
          expect(res.data?.data?.deletedAt).toBeTruthy();
        } else {
          expect(res.status).toBe(404);
        }
      }
      // Also confirm absence from default list and presence in ?trashed=true.
      const listDefault = await clientApi.get(
        `/api/portal/brain/knowledge?search=${encodeURIComponent(token)}`,
      );
      expect(listDefault.status).toBe(200);
      const defaultIds = (listDefault.data.data.items as Array<{ id: number }>).map(
        (n) => n.id,
      );
      for (const id of ids) expect(defaultIds).not.toContain(id);

      const listTrashed = await clientApi.get(
        `/api/portal/brain/knowledge?trashed=true&search=${encodeURIComponent(token)}`,
      );
      expect(listTrashed.status).toBe(200);
      const trashedIds = (listTrashed.data.data.items as Array<{ id: number }>).map(
        (n) => n.id,
      );
      for (const id of ids) expect(trashedIds).toContain(id);

      // ── restore ──
      const restore = await clientApi.post('/api/portal/brain/knowledge/bulk', {
        ids,
        op: { kind: 'restore' },
      });
      expect(restore.status, JSON.stringify(restore.data)).toBe(200);
      expect(restore.data?.success).toBe(true);

      const listAfterRestore = await clientApi.get(
        `/api/portal/brain/knowledge?search=${encodeURIComponent(token)}`,
      );
      expect(listAfterRestore.status).toBe(200);
      const restoredIds = (
        listAfterRestore.data.data.items as Array<{ id: number }>
      ).map((n) => n.id);
      for (const id of ids) expect(restoredIds).toContain(id);
    } finally {
      await bulkHardDelete(clientApi, ids);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Templates CRUD + from-template
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Knowledge — templates @brain @brain-templates', () => {
  test('create → list → patch → from-template → delete', async ({ clientApi }) => {
    const ts = uniq();
    const initialName = `E2E template ${ts}`;
    const renamedName = `E2E template renamed ${ts}`;
    let templateId: number | null = null;
    let createdNoteId: number | null = null;

    try {
      // CREATE template.
      const create = await clientApi.post('/api/portal/brain/templates', {
        name: initialName,
        body: 'Hello {{userName}}!',
        trigger: 'manual',
        defaultTags: ['e2e-template'],
      });
      expect(create.status, JSON.stringify(create.data)).toBe(200);
      expect(create.data?.success).toBe(true);
      templateId = create.data.data.id as number;
      expect(typeof templateId).toBe('number');

      // LIST contains it.
      const list = await clientApi.get('/api/portal/brain/templates');
      expect(list.status).toBe(200);
      const items: Array<{ id: number; name: string }> = list.data.data.items;
      expect(items.some((t) => t.id === templateId)).toBe(true);

      // PATCH name.
      const patch = await clientApi.patch(
        `/api/portal/brain/templates/${templateId}`,
        { name: renamedName },
      );
      expect(patch.status, JSON.stringify(patch.data)).toBe(200);
      expect(patch.data?.success).toBe(true);
      expect(patch.data?.data?.name).toBe(renamedName);

      // CREATE note from template.
      const fromTpl = await clientApi.post(
        `/api/portal/brain/knowledge/from-template/${templateId}`,
        {},
      );
      expect(fromTpl.status, JSON.stringify(fromTpl.data)).toBe(200);
      expect(fromTpl.data?.success).toBe(true);
      const note = fromTpl.data.data as {
        id: number;
        title: string;
        body: string;
        tags: string[];
      };
      createdNoteId = note.id;

      // Title defaults to (renamed) template name.
      expect(note.title).toBe(renamedName);
      // Body should have substituted {{userName}}.
      expect(note.body).not.toContain('{{userName}}');
      // Default tags carried through; tags array also includes the
      // `from_template:<id>` marker per the route handler.
      expect(note.tags).toContain('e2e-template');

      // DELETE template.
      const del = await clientApi.delete(`/api/portal/brain/templates/${templateId}`);
      expect(del.status, JSON.stringify(del.data)).toBe(200);
      expect(del.data?.success).toBe(true);
      templateId = null;
    } finally {
      if (createdNoteId != null) {
        await hardDeleteNote(clientApi, createdNoteId);
      }
      if (templateId != null) {
        await clientApi
          .delete(`/api/portal/brain/templates/${templateId}`)
          .catch(() => {});
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. History endpoint
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Knowledge — history @brain @brain-knowledge-history', () => {
  test('GET /[id]/history returns create then update audit rows', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let id: number | null = null;

    try {
      const create = await clientApi.post('/api/portal/brain/knowledge', {
        title: `E2E history ${ts}`,
        body: 'history body',
      });
      expect(create.status, JSON.stringify(create.data)).toBe(200);
      id = create.data.data.id as number;

      // History after create.
      const h1 = await clientApi.get(`/api/portal/brain/knowledge/${id}/history`);
      expect(h1.status).toBe(200);
      expect(h1.data?.success).toBe(true);
      const items1: Array<{ action: string }> = h1.data.data.items;
      expect(Array.isArray(items1)).toBe(true);
      // Create rows are written via `note.created` per lib/brain/notes.ts.
      // Accept any "create"-shaped action name to stay resilient if the
      // audit-log naming convention shifts.
      expect(
        items1.some((row) => /create/i.test(row.action)),
        `expected a create-shaped audit row, got: ${JSON.stringify(items1.map((r) => r.action))}`,
      ).toBe(true);
      const beforeCount = items1.length;

      // PATCH title.
      const patch = await clientApi.patch(`/api/portal/brain/knowledge/${id}`, {
        title: `E2E history ${ts} (edited)`,
      });
      expect(patch.status).toBe(200);

      // History after update — must include an update-shaped row, and have grown.
      const h2 = await clientApi.get(`/api/portal/brain/knowledge/${id}/history`);
      expect(h2.status).toBe(200);
      const items2: Array<{ action: string }> = h2.data.data.items;
      expect(items2.length).toBeGreaterThan(beforeCount);
      expect(
        items2.some((row) => /update/i.test(row.action)),
        `expected an update-shaped audit row, got: ${JSON.stringify(items2.map((r) => r.action))}`,
      ).toBe(true);
    } finally {
      if (id != null) await hardDeleteNote(clientApi, id);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Wiki-link extraction populates /backlinks
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Knowledge — wiki-link backlinks @brain @brain-knowledge-backlinks', () => {
  test('creating a note with [[Title]] populates the target note backlinks', async ({
    clientApi,
  }) => {
    const ts = uniq();
    const targetTitle = `E2E wiki target ${ts}`;
    let targetId: number | null = null;
    let sourceId: number | null = null;

    try {
      // Note A — the link target.
      const a = await clientApi.post('/api/portal/brain/knowledge', {
        title: targetTitle,
        body: 'I am the target.',
      });
      expect(a.status, JSON.stringify(a.data)).toBe(200);
      targetId = a.data.data.id as number;

      // Note B — references A via [[…]].
      const b = await clientApi.post('/api/portal/brain/knowledge', {
        title: `E2E wiki source ${ts}`,
        body: `See [[${targetTitle}]] for context.`,
      });
      expect(b.status, JSON.stringify(b.data)).toBe(200);
      sourceId = b.data.data.id as number;

      // Wiki-link extraction is awaited inline (createNote calls
      // extractAndSyncWikiLinks before returning), so backlinks should be
      // populated immediately. If the implementation ever moves it to a
      // background queue the assertion below should be wrapped in expect.poll.
      const backlinks = await clientApi.get(
        `/api/portal/brain/knowledge/${targetId}/backlinks`,
      );
      expect(backlinks.status, JSON.stringify(backlinks.data)).toBe(200);
      expect(backlinks.data?.success).toBe(true);
      const items: Array<{ id: number }> = backlinks.data.data.items;
      expect(Array.isArray(items)).toBe(true);
      expect(items.some((row) => row.id === sourceId)).toBe(true);
    } finally {
      if (sourceId != null) await hardDeleteNote(clientApi, sourceId);
      if (targetId != null) await hardDeleteNote(clientApi, targetId);
    }
  });
});
