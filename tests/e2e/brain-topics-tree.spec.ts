/**
 * Brain Topics — Phase 1 tree-management coverage.
 *
 * Mirrors the API-driven style of `tests/e2e/brain-knowledge.spec.ts`. The
 * brain repo convention is API-only E2Es backed by the NextAuth ApiClient
 * fixture (see that file's header for rationale). UI-only assertions are
 * deferred to a follow-up branch — see the `test.skip` at the bottom of
 * this file.
 *
 * Covers the new endpoints + flows added in waves 1, 2b, 3b:
 *   • POST /api/portal/brain/topics              (create root + child)
 *   • GET  /api/portal/brain/topics?as=tree      (nested tree shape)
 *   • PATCH /api/portal/brain/topics/[id]        (rename)
 *   • POST /api/portal/brain/topics/[id]/move    (re-parent, path recompute,
 *                                                 cycle guard)
 *   • POST /api/portal/brain/topics/import-from-tags { dryRun: true }
 *     (preview wizard — seeded with two brain_notes carrying nested tags)
 *
 * Cleanup: every test soft-cleans the topics it created by walking the
 * descendants and DELETE-ing leaves first. Notes created for the
 * import-from-tags wizard are hard-deleted via the existing knowledge
 * endpoint.
 *
 * Tagged `@brain @brain-topics` for selective runs. NOT tagged `@critical`.
 */
import { test, expect } from './setup/fixtures';
import { randomUUID } from 'crypto';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

interface TopicRow {
  id: number;
  name: string;
  slug: string;
  path: string;
  parentId: number | null;
}

interface TopicTreeNode extends TopicRow {
  children: TopicTreeNode[];
  childCount: number;
  entityCount: number;
}

// Best-effort: delete every id we created, leaves first, with ?force=true so
// any stray entity-attachments are detached. Idempotent — a 404 means
// someone else already deleted it (or the test cleaned itself up).
async function deleteTopics(
  api: import('./setup/api-client').ApiClient,
  ids: number[],
): Promise<void> {
  // We don't know the parent/child relationships here, so just try the list
  // twice — leaves get deleted in the first pass, freeing parents for the
  // second pass.
  for (let pass = 0; pass < 2; pass++) {
    for (const id of ids) {
      await api.delete(`/api/portal/brain/topics/${id}?force=true`).catch(() => null);
    }
  }
}

async function hardDeleteNote(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  // The knowledge DELETE is state-dependent: soft on first, hard on second.
  for (let i = 0; i < 2; i++) {
    const res = await api.delete(`/api/portal/brain/knowledge/${id}`).catch(() => null);
    if (!res) return;
    if (res.status === 404) return;
    if (res.status === 200 && res.data?.data?.deleted === 'hard') return;
  }
}

// Recursive helper to find a node anywhere in the tree by id.
function findInTree(
  tree: TopicTreeNode[],
  id: number,
): TopicTreeNode | null {
  for (const node of tree) {
    if (node.id === id) return node;
    const hit = findInTree(node.children ?? [], id);
    if (hit) return hit;
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Topic admin lifecycle: create root → create child → rename → re-parent
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Topics — admin lifecycle @brain @brain-topics', () => {
  test('create root → create child → rename → re-parent recomputes path', async ({
    clientApi,
  }) => {
    const token = uniq();
    const created: number[] = [];

    try {
      // CREATE root.
      const rootName = `E2E root ${token}`;
      const rootRes = await clientApi.post('/api/portal/brain/topics', {
        name: rootName,
      });
      expect(rootRes.status, JSON.stringify(rootRes.data)).toBe(201);
      expect(rootRes.data?.success).toBe(true);
      const root = rootRes.data.data as TopicRow;
      expect(root.id).toEqual(expect.any(Number));
      expect(root.parentId).toBeNull();
      expect(root.path).toBe(`/${root.slug}`);
      created.push(root.id);

      // CREATE child under root.
      const childName = `E2E child ${token}`;
      const childRes = await clientApi.post('/api/portal/brain/topics', {
        name: childName,
        parentId: root.id,
      });
      expect(childRes.status, JSON.stringify(childRes.data)).toBe(201);
      const child = childRes.data.data as TopicRow;
      expect(child.parentId).toBe(root.id);
      expect(child.path).toBe(`/${root.slug}/${child.slug}`);
      created.push(child.id);

      // CREATE a second root we'll re-parent the child under later.
      const root2Name = `E2E root2 ${token}`;
      const root2Res = await clientApi.post('/api/portal/brain/topics', {
        name: root2Name,
      });
      expect(root2Res.status).toBe(201);
      const root2 = root2Res.data.data as TopicRow;
      created.push(root2.id);

      // GET tree — every created topic should be reachable.
      const tree1 = await clientApi.get('/api/portal/brain/topics?as=tree');
      expect(tree1.status).toBe(200);
      const tree1Nodes = tree1.data.data.tree as TopicTreeNode[];
      const rootInTree = findInTree(tree1Nodes, root.id);
      expect(rootInTree).not.toBeNull();
      expect(rootInTree?.children.some((c) => c.id === child.id)).toBe(true);

      // RENAME child via PATCH. Slug must stay stable (see PATCH route comment).
      const renamed = `E2E child renamed ${token}`;
      const rename = await clientApi.patch(
        `/api/portal/brain/topics/${child.id}`,
        { name: renamed },
      );
      expect(rename.status, JSON.stringify(rename.data)).toBe(200);
      expect(rename.data?.success).toBe(true);
      expect(rename.data.data.name).toBe(renamed);
      expect(rename.data.data.slug).toBe(child.slug); // stable

      // MOVE child under root2. Path must be recomputed.
      const move = await clientApi.post(
        `/api/portal/brain/topics/${child.id}/move`,
        { newParentId: root2.id },
      );
      expect(move.status, JSON.stringify(move.data)).toBe(200);
      expect(move.data?.success).toBe(true);
      expect(move.data.data.parentId).toBe(root2.id);
      expect(move.data.data.path).toBe(`/${root2.slug}/${child.slug}`);

      // GET tree again — child should now live under root2.
      const tree2 = await clientApi.get('/api/portal/brain/topics?as=tree');
      expect(tree2.status).toBe(200);
      const tree2Nodes = tree2.data.data.tree as TopicTreeNode[];
      const root2InTree = findInTree(tree2Nodes, root2.id);
      expect(root2InTree?.children.some((c) => c.id === child.id)).toBe(true);
      // And NOT under root anymore.
      const rootInTree2 = findInTree(tree2Nodes, root.id);
      expect(rootInTree2?.children.some((c) => c.id === child.id)).toBe(false);

      // Cycle guard: re-parenting root under its own descendant must 409.
      const cycle = await clientApi.post(
        `/api/portal/brain/topics/${root2.id}/move`,
        { newParentId: child.id },
      );
      expect(cycle.status, JSON.stringify(cycle.data)).toBe(409);
      expect(cycle.data?.success).toBe(false);
    } finally {
      await deleteTopics(clientApi, created);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Import-from-tags dry-run preview
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Topics — import-from-tags dry-run @brain @brain-topics-import', () => {
  test('dry-run preview from two notes with hierarchical tags lists the expected topics', async ({
    clientApi,
  }) => {
    const token = uniq();
    // Use a token-specific prefix so the preview can be filtered without
    // colliding with other tests' data. The prefix is the first path segment;
    // children are leaf segments.
    const prefix = `kb-${token}`;
    const noteIds: number[] = [];
    const createdTopicIds: number[] = [];

    try {
      // Seed two notes via the existing knowledge API. Each has a nested tag.
      const a = await clientApi.post('/api/portal/brain/knowledge', {
        title: `import seed A ${token}`,
        body: 'seed',
        tags: [`${prefix}/marketing/seo`],
      });
      expect(a.status, JSON.stringify(a.data)).toBe(200);
      noteIds.push(a.data.data.id as number);

      const b = await clientApi.post('/api/portal/brain/knowledge', {
        title: `import seed B ${token}`,
        body: 'seed',
        tags: [`${prefix}/marketing/email`],
      });
      expect(b.status, JSON.stringify(b.data)).toBe(200);
      noteIds.push(b.data.data.id as number);

      // DRY-RUN preview, scoped to our token-prefix so we don't have to
      // assert against globally-existing tags.
      const preview = await clientApi.post(
        '/api/portal/brain/topics/import-from-tags',
        { tagPrefix: prefix, dryRun: true },
      );
      expect(preview.status, JSON.stringify(preview.data)).toBe(200);
      expect(preview.data?.success).toBe(true);
      const report = preview.data.data as {
        dryRun: boolean;
        topicsToCreate?: Array<{ path: string }>;
        attachmentsToCreate?: number;
        // The shape is described in lib/brain/topics.ts importTopicsFromTags;
        // we assert on the subset the wizard relies on without over-fitting.
        [key: string]: unknown;
      };

      expect(report.dryRun).toBe(true);

      // The preview reports the topics that WOULD be created. We at minimum
      // expect references to the prefix and both leaves to appear somewhere
      // in the JSON payload — exact field names may drift, so do a coarse
      // string check on the full payload.
      const blob = JSON.stringify(report);
      expect(blob).toContain(prefix);
      expect(blob).toContain('marketing');
      expect(blob).toContain('seo');
      expect(blob).toContain('email');

      // CRUCIALLY: dry-run must not create any topics. List topics and check
      // that no topic with our prefix exists.
      const list = await clientApi.get(
        `/api/portal/brain/topics?tagPrefix=${encodeURIComponent(prefix)}`,
      );
      expect(list.status).toBe(200);
      const items = list.data.data.items as TopicRow[];
      expect(items).toEqual([]);
    } finally {
      // No topics were created by the dry-run, but be defensive in case
      // something changed.
      await deleteTopics(clientApi, createdTopicIds);
      for (const id of noteIds) await hardDeleteNote(clientApi, id);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Browser-level UI flows (drag-to-reparent, inline rename, etc.) — DEFERRED
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Topics — browser flow @brain @brain-topics-ui', () => {
  // Drag-to-reparent is mediated through onDragEnd handlers on the topics
  // admin page. Reliably driving HTML5 drag events from Playwright requires
  // either custom dispatch helpers or a fixture that exposes the tree's
  // internal commit method. The API-level `/move` assertion above already
  // covers the server-side path recompute + cycle guard; the browser layer
  // is exercised by Wave 3b's component tests.
  // TODO(brain-restructure-phase2): once a brain UI test fixture lands,
  // add: drag node X onto node Y; assert the tree updates; assert the
  // path in the breadcrumb of detail page reflects the new parent.
  test.skip('drag-reparent updates the tree + breadcrumb in the topics admin UI', () => {});
});
