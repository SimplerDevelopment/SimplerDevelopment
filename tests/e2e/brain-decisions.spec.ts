/**
 * Brain Decisions — Phase 1 lifecycle coverage.
 *
 * Mirrors the API-driven style of `tests/e2e/brain-knowledge.spec.ts` (the
 * canonical brain E2E pattern in this repo): no browser page, the
 * `clientApi` NextAuth-backed ApiClient fixture, per-test unique tokens,
 * and cleanup in finally blocks so the suite is rerunnable.
 *
 * Covers the new endpoints + flows added in waves 1, 2a, 3a:
 *   • POST /api/portal/brain/decisions (create)
 *   • GET  /api/portal/brain/decisions (list, default-status filter)
 *   • GET  /api/portal/brain/decisions/[id] (detail + supersedes chain)
 *   • PATCH /api/portal/brain/decisions/[id] (allowlisted fields only —
 *     attempting to mutate rationale / decision / reversibility → 400 from
 *     the lib helper, surfaced as 400 by the route)
 *   • DELETE /api/portal/brain/decisions/[id] (soft-reject, status='rejected')
 *   • POST /api/portal/brain/decisions/[id]/supersede (atomic chain link)
 *
 * The UI-only assertions called out in the Wave 4 brief
 * (visibility of fields on the edit form, dialog confirmation flows,
 * Material-Icons buttons, etc.) are intentionally NOT exercised here — the
 * canonical brain E2E pattern is API-only and the UI layer is already
 * exercised by the unit-level component tests added in Wave 3a. The browser
 * lifecycle test is left as a `test.skip` with a TODO so we can light it
 * up later if/when we adopt a browser fixture for brain.
 *
 * Tagged `@brain @brain-decisions` for selective runs. NOT tagged
 * `@critical` — these run against a shared E2E DB and create real rows;
 * the golden-path subset stays small per CLAUDE.md.
 */
import { test, expect } from './setup/fixtures';
import { randomUUID } from 'crypto';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

interface DecisionRow {
  id: number;
  title: string;
  status: string;
  supersededByDecisionId: number | null;
  rationale: string;
  decision: string;
  reversibility: string;
}

// Best-effort cleanup: soft-reject each id we created so the row goes to
// `status='rejected'` and disappears from the default list. Decisions are
// immutable history — there is no hard-delete by design.
async function softRejectAll(
  api: import('./setup/api-client').ApiClient,
  ids: number[],
): Promise<void> {
  for (const id of ids) {
    await api.delete(`/api/portal/brain/decisions/${id}`).catch(() => null);
  }
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Create → list (default = Accepted) shows the new row
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Decisions — create + list @brain @brain-decisions', () => {
  test('POST creates a row; GET (default status filter) returns it', async ({
    clientApi,
  }) => {
    const token = uniq();
    const title = `E2E decision ${token}`;
    const created: number[] = [];

    try {
      // CREATE
      const create = await clientApi.post('/api/portal/brain/decisions', {
        title,
        decision: 'Adopt X.',
        rationale: 'X wins on Y.',
        context: 'set during E2E run',
        reversibility: 'two_way',
      });
      expect(create.status, JSON.stringify(create.data)).toBe(201);
      expect(create.data?.success).toBe(true);
      const decision = create.data.data.decision as DecisionRow;
      expect(decision.id).toEqual(expect.any(Number));
      expect(decision.title).toBe(title);
      expect(decision.status).toBe('accepted');
      expect(decision.supersededByDecisionId).toBeNull();
      created.push(decision.id);

      // LIST default — should include our row.
      const list = await clientApi.get(
        '/api/portal/brain/decisions?status=accepted&limit=100',
      );
      expect(list.status, JSON.stringify(list.data)).toBe(200);
      expect(list.data?.success).toBe(true);
      const items = list.data.data.items as DecisionRow[];
      expect(items.some((d) => d.id === decision.id)).toBe(true);
    } finally {
      await softRejectAll(clientApi, created);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Full lifecycle: create → detail → edit allowlist → reject
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Decisions — lifecycle @brain @brain-decisions-lifecycle', () => {
  test('create → GET detail → PATCH title → DELETE soft-rejects', async ({
    clientApi,
  }) => {
    const token = uniq();
    const created: number[] = [];

    try {
      // CREATE
      const create = await clientApi.post('/api/portal/brain/decisions', {
        title: `E2E lifecycle ${token}`,
        decision: 'Use Postgres.',
        rationale: 'It is the team default.',
      });
      expect(create.status).toBe(201);
      const id = (create.data.data.decision as DecisionRow).id;
      created.push(id);

      // GET detail — includes empty chain.
      const detail = await clientApi.get(`/api/portal/brain/decisions/${id}`);
      expect(detail.status, JSON.stringify(detail.data)).toBe(200);
      expect(detail.data?.success).toBe(true);
      expect(detail.data.data.decision.id).toBe(id);
      expect(detail.data.data.ancestors).toEqual([]);
      expect(detail.data.data.descendants).toEqual([]);

      // PATCH the title (allowlisted field).
      const newTitle = `E2E lifecycle ${token} (edited)`;
      const patch = await clientApi.patch(`/api/portal/brain/decisions/${id}`, {
        title: newTitle,
      });
      expect(patch.status, JSON.stringify(patch.data)).toBe(200);
      expect(patch.data?.success).toBe(true);
      expect(patch.data.data.decision.title).toBe(newTitle);

      // DELETE — soft-reject. Status flips to 'rejected'; row is not hard-deleted.
      const del = await clientApi.delete(`/api/portal/brain/decisions/${id}`);
      expect(del.status, JSON.stringify(del.data)).toBe(200);
      expect(del.data?.success).toBe(true);
      expect(del.data.data.status).toBe('rejected');

      // GET-by-id still returns the row (decisions are immutable history),
      // but status is now 'rejected'.
      const after = await clientApi.get(`/api/portal/brain/decisions/${id}`);
      expect(after.status).toBe(200);
      expect(after.data.data.decision.status).toBe('rejected');

      // LIST default-accepted — must NOT include the rejected row.
      const list = await clientApi.get(
        '/api/portal/brain/decisions?status=accepted&limit=100',
      );
      expect(list.status).toBe(200);
      const items = list.data.data.items as DecisionRow[];
      expect(items.some((d) => d.id === id)).toBe(false);

      // LIST status=rejected — must include it.
      const listRejected = await clientApi.get(
        '/api/portal/brain/decisions?status=rejected&limit=100',
      );
      expect(listRejected.status).toBe(200);
      const rejectedItems = listRejected.data.data.items as DecisionRow[];
      expect(rejectedItems.some((d) => d.id === id)).toBe(true);
    } finally {
      await softRejectAll(clientApi, created);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Supersede chain: new row links back to original; original flips to
//    'superseded' and exposes the descendant.
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Decisions — supersede @brain @brain-decisions-supersede', () => {
  test('supersede creates a successor + links the chain in both directions', async ({
    clientApi,
  }) => {
    const token = uniq();
    const created: number[] = [];

    try {
      // CREATE the original.
      const a = await clientApi.post('/api/portal/brain/decisions', {
        title: `E2E supersede A ${token}`,
        decision: 'Adopt X v1.',
        rationale: 'First-pass rationale.',
      });
      expect(a.status, JSON.stringify(a.data)).toBe(201);
      const oldId = (a.data.data.decision as DecisionRow).id;
      created.push(oldId);

      // SUPERSEDE.
      const sup = await clientApi.post(
        `/api/portal/brain/decisions/${oldId}/supersede`,
        {
          title: `E2E supersede B ${token}`,
          decision: 'Switch to X v2.',
          rationale: 'V2 supersedes V1 because new requirements.',
        },
      );
      expect(sup.status, JSON.stringify(sup.data)).toBe(201);
      expect(sup.data?.success).toBe(true);
      expect(sup.data.data.previous).toEqual({ id: oldId, status: 'superseded' });
      const newId = (sup.data.data.current as DecisionRow).id;
      expect(newId).not.toBe(oldId);
      created.push(newId);

      // OLD row's detail — descendants must include the new id; status='superseded'.
      const oldDetail = await clientApi.get(`/api/portal/brain/decisions/${oldId}`);
      expect(oldDetail.status).toBe(200);
      expect(oldDetail.data.data.decision.status).toBe('superseded');
      expect(oldDetail.data.data.decision.supersededByDecisionId).toBe(newId);
      const descIds = (oldDetail.data.data.descendants as Array<{ id: number }>).map(
        (n) => n.id,
      );
      expect(descIds).toContain(newId);

      // NEW row's detail — ancestors must include the old id.
      const newDetail = await clientApi.get(`/api/portal/brain/decisions/${newId}`);
      expect(newDetail.status).toBe(200);
      expect(newDetail.data.data.decision.status).toBe('accepted');
      const ancIds = (newDetail.data.data.ancestors as Array<{ id: number }>).map(
        (n) => n.id,
      );
      expect(ancIds).toContain(oldId);

      // Cycle guard: superseding an already-superseded row → 400.
      const supTwice = await clientApi.post(
        `/api/portal/brain/decisions/${oldId}/supersede`,
        {
          title: `E2E supersede again ${token}`,
          decision: 'Won\'t work.',
          rationale: 'Cycle guard should reject this.',
        },
      );
      expect(supTwice.status).toBe(400);
      expect(supTwice.data?.success).toBe(false);
    } finally {
      await softRejectAll(clientApi, created);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. PATCH refuses forbidden field mutations
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Decisions — PATCH allowlist @brain @brain-decisions-patch', () => {
  test('PATCH with rationale/decision/reversibility in body → 400 from lib helper', async ({
    clientApi,
  }) => {
    const token = uniq();
    const created: number[] = [];

    try {
      const create = await clientApi.post('/api/portal/brain/decisions', {
        title: `E2E PATCH guard ${token}`,
        decision: 'Original decision text.',
        rationale: 'Original rationale.',
      });
      expect(create.status).toBe(201);
      const id = (create.data.data.decision as DecisionRow).id;
      created.push(id);

      // Each forbidden field — PATCH must 400.
      const forbiddenBodies: Array<Record<string, unknown>> = [
        { rationale: 'changed rationale' },
        { decision: 'changed decision text' },
        { reversibility: 'one_way' },
      ];

      for (const body of forbiddenBodies) {
        const res = await clientApi.patch(
          `/api/portal/brain/decisions/${id}`,
          body,
        );
        expect(
          res.status,
          `expected 400 for body ${JSON.stringify(body)}, got ${res.status}: ${JSON.stringify(res.data)}`,
        ).toBe(400);
        expect(res.data?.success).toBe(false);
        // The lib helper's canonical message; assert loosely so a wording
        // tweak doesn't break the test.
        expect(String(res.data?.message || '').toLowerCase()).toMatch(
          /supersede|rationale|decision text/,
        );
      }

      // GET — confirm none of those fields changed.
      const after = await clientApi.get(`/api/portal/brain/decisions/${id}`);
      expect(after.status).toBe(200);
      const d = after.data.data.decision as DecisionRow;
      expect(d.rationale).toBe('Original rationale.');
      expect(d.decision).toBe('Original decision text.');
      expect(d.reversibility).toBe('two_way'); // default
    } finally {
      await softRejectAll(clientApi, created);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Browser-level UI lifecycle — DEFERRED
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Decisions — browser flow @brain @brain-decisions-ui', () => {
  // The canonical brain E2E pattern in this repo is API-only (see
  // brain-knowledge.spec.ts header). A browser-driven version of this spec
  // would need:
  //   • a page-scoped login fixture (the existing `loginAsOtherClient`
  //     helper logs the page in via NextAuth credentials, but we still
  //     need a tenant guaranteed to have Brain entitlement on the test DB)
  //   • data-testid hooks on the decisions list / detail / edit form
  //     components (3a's report flags the edit form's anchors UI as
  //     numeric ID inputs only — there are no stable test selectors yet)
  //   • a deterministic way to dismiss the "Reject decision" confirm()
  //     dialog (currently a window.confirm — Playwright handles via
  //     page.on('dialog'), but the wiring isn't in any fixture)
  // The API-level coverage above exercises the same server-side state
  // transitions; the visual layer is covered by Wave 3a's UI tests.
  // TODO(brain-restructure-phase2): add data-testid hooks + a browser
  // fixture and light this up.
  test.skip('record → list → detail → edit → reject in the portal UI', 'TODO(brain-restructure-phase2): placeholder pending data-testid hooks on decisions list/detail/edit components and a fixture to dismiss the window.confirm "Reject decision" dialog; API-level coverage above exercises the same state transitions in the interim', () => {});
});
