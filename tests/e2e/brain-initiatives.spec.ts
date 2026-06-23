/**
 * Brain Initiatives + Goals — Wave 4 E2E coverage.
 *
 * API-driven specs that mirror the canonical brain spec shape
 * (`brain-knowledge.spec.ts`). No browser pages — every test uses the
 * `clientApi` fixture and cleans up after itself in a `finally` block so the
 * suite is rerunnable.
 *
 * Coverage:
 *   1. Empty-list smoke for a fresh tenant.
 *   2. Full initiative lifecycle: create → list → detail → patch → close-with-lessons
 *      → reopen-rejected (terminal cancelled) → list excludes closed by default.
 *   3. Goals: create under initiative → checkin updates currentMetric +
 *      lastCheckedInAt → auto-classify triggers when status is omitted.
 *   4. Links: attach task → unlink → byType counts reflect the change.
 *   5. PATCH on /initiatives/[id] refuses status changes — returns 400 with
 *      a "use /close or /reopen" message (the documented error_use_close_or_reopen
 *      contract).
 *   6. Soft-cancel via DELETE → row remains, status='cancelled', closeReason='deleted'.
 *
 * Browser-driven specs (drag-reparent, real form submit) intentionally
 * `test.skip` per Wave 4 of the brain-restructure handoff — the canonical
 * fallback when the pattern is API-only.
 *
 * Tagged `@brain` (NOT `@critical`) — selective runs only.
 */
import { test, expect } from './setup/fixtures';
import { randomUUID } from 'crypto';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

// ─── Helpers ────────────────────────────────────────────────────────────────
//
// Soft-cancel cleanup: there is intentionally no hard-delete API for
// initiatives, so the best the cleanup block can do is route the initiative
// to status='cancelled' via DELETE. Idempotent — a second DELETE on an
// already-closed initiative throws inside the lib, which the API surfaces
// as 400. We swallow that.
async function softCancelInitiative(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  await api.delete(`/api/portal/brain/initiatives/${id}`).catch(() => null);
}

// Goals ARE hard-deletable (leaf rows).
async function hardDeleteGoal(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  await api.delete(`/api/portal/brain/goals/${id}`).catch(() => null);
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Empty list smoke
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Initiatives — empty list @brain @brain-initiatives-empty', () => {
  test('GET /initiatives with an impossible status filter returns empty items', async ({
    clientApi,
  }) => {
    // The seed tenant may have leftover initiatives from prior runs, so
    // assert against an empty *filtered* slice instead of total emptiness.
    // We use status=planned + an ownerId that should never match any seed
    // row (a deterministically-derived large negative-ish int can't be cast,
    // so use a huge positive int well outside the seed range).
    const res = await clientApi.get(
      '/api/portal/brain/initiatives?status=planned&ownerId=999999999',
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data?.success).toBe(true);
    const items: unknown[] = res.data.data.items;
    expect(Array.isArray(items)).toBe(true);
    expect(items.length).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Full initiative lifecycle
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Initiatives — lifecycle @brain @brain-initiatives-lifecycle', () => {
  test('create → list → detail → patch → close-with-lessons → reopen-rejected (terminal) → list excludes closed', async ({
    clientApi,
  }) => {
    const ts = uniq();
    const name = `E2E init lifecycle ${ts}`;
    let id: number | null = null;

    try {
      // CREATE.
      const create = await clientApi.post('/api/portal/brain/initiatives', {
        name,
        description: 'lifecycle test',
        priority: 'high',
        status: 'active',
      });
      expect(create.status, JSON.stringify(create.data)).toBe(200);
      expect(create.data?.success).toBe(true);
      id = create.data.data.id as number;
      expect(typeof id).toBe('number');
      expect(create.data.data.status).toBe('active');

      // LIST default — present.
      const listInitial = await clientApi.get(
        '/api/portal/brain/initiatives?status=active&limit=100',
      );
      expect(listInitial.status).toBe(200);
      const initialItems: Array<{ id: number; name: string }> =
        listInitial.data.data.items;
      expect(initialItems.some((r) => r.id === id)).toBe(true);

      // DETAIL — fetch single + opt-in to goals + links.
      const detail = await clientApi.get(
        `/api/portal/brain/initiatives/${id}?includeGoals=true&includeLinks=true`,
      );
      expect(detail.status).toBe(200);
      expect(detail.data?.success).toBe(true);
      expect(detail.data.data.initiative?.id ?? detail.data.data.id).toBe(id);

      // PATCH — change priority + name.
      const patch = await clientApi.patch(
        `/api/portal/brain/initiatives/${id}`,
        {
          name: `${name} (edited)`,
          priority: 'critical',
        },
      );
      expect(patch.status, JSON.stringify(patch.data)).toBe(200);
      expect(patch.data?.success).toBe(true);

      // CLOSE with lessons learned + outcome='cancelled' (terminal).
      const close = await clientApi.post(
        `/api/portal/brain/initiatives/${id}/close`,
        {
          outcome: 'cancelled',
          reason: 'descoped',
          lessonsLearned: 'We learned that scope > capacity for this quarter.',
        },
      );
      expect(close.status, JSON.stringify(close.data)).toBe(200);
      expect(close.data?.success).toBe(true);
      const closedInit = close.data.data.initiative ?? close.data.data;
      expect(closedInit.status).toBe('cancelled');
      expect(closedInit.closedAt).toBeTruthy();

      // REOPEN from 'cancelled' is a terminal state per the close-flow lib —
      // PLAN.md spec: "reopen from cancelled forbidden". Should return 400.
      const reopen = await clientApi.post(
        `/api/portal/brain/initiatives/${id}/reopen`,
      );
      expect(reopen.status, JSON.stringify(reopen.data)).toBe(400);
      expect(reopen.data?.success).toBe(false);

      // LIST default — closed initiative excluded from `status=active` slice.
      const listAfter = await clientApi.get(
        '/api/portal/brain/initiatives?status=active&limit=100',
      );
      expect(listAfter.status).toBe(200);
      const afterItems: Array<{ id: number }> = listAfter.data.data.items;
      expect(afterItems.some((r) => r.id === id)).toBe(false);

      // But LIST with status=cancelled DOES include it — the row is not gone,
      // just no longer in the default active slice.
      const listCancelled = await clientApi.get(
        '/api/portal/brain/initiatives?status=cancelled&limit=200',
      );
      expect(listCancelled.status).toBe(200);
      const cancelledItems: Array<{ id: number }> =
        listCancelled.data.data.items;
      expect(cancelledItems.some((r) => r.id === id)).toBe(true);
    } finally {
      if (id != null) await softCancelInitiative(clientApi, id);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. Goals lifecycle + checkin + auto-classification
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Goals — checkin + auto-classify @brain @brain-goals-checkin', () => {
  test('create goal under initiative → checkin updates currentMetric + lastCheckedInAt → omitted status auto-classifies', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let initiativeId: number | null = null;
    let goalId: number | null = null;

    try {
      // Seed parent initiative.
      const init = await clientApi.post('/api/portal/brain/initiatives', {
        name: `E2E goals parent ${ts}`,
        priority: 'medium',
        status: 'active',
      });
      expect(init.status, JSON.stringify(init.data)).toBe(200);
      initiativeId = init.data.data.id as number;

      // CREATE goal — unit='percent', target=100, current=0.
      const create = await clientApi.post('/api/portal/brain/goals', {
        initiativeId,
        title: `E2E goal ${ts}`,
        description: 'auto-classify smoke',
        unit: 'percent',
        targetMetric: 100,
        currentMetric: 0,
      });
      expect(create.status, JSON.stringify(create.data)).toBe(200);
      expect(create.data?.success).toBe(true);
      goalId = create.data.data.id as number;
      const initialStatus = create.data.data.status;
      // New goals default to 'open' per the schema default.
      expect(typeof initialStatus).toBe('string');

      const beforeCheckin = await clientApi.get(
        `/api/portal/brain/goals/${goalId}`,
      );
      expect(beforeCheckin.status).toBe(200);
      const beforeRow =
        beforeCheckin.data.data.goal ?? beforeCheckin.data.data;
      const beforeLastCheckedInAt = beforeRow?.lastCheckedInAt ?? null;

      // CHECKIN — set currentMetric to 120 (over target). Omit `status` so
      // the auto-classifier runs. Should land at 'achieved'.
      const checkin = await clientApi.post(
        `/api/portal/brain/goals/${goalId}/checkin`,
        {
          currentMetric: 120,
          note: 'beat the target',
        },
      );
      expect(checkin.status, JSON.stringify(checkin.data)).toBe(200);
      expect(checkin.data?.success).toBe(true);
      const checkedIn = checkin.data.data;

      // currentMetric updated.
      expect(checkedIn.currentMetric).toBe(120);
      // lastCheckedInAt should be populated AND differ from pre-checkin value.
      expect(checkedIn.lastCheckedInAt).toBeTruthy();
      if (beforeLastCheckedInAt) {
        expect(checkedIn.lastCheckedInAt).not.toBe(beforeLastCheckedInAt);
      }
      // Auto-classify: currentMetric > targetMetric → 'achieved'.
      expect(checkedIn.status).toBe('achieved');

      // Re-fetch GET to confirm persistence.
      const afterCheckin = await clientApi.get(
        `/api/portal/brain/goals/${goalId}`,
      );
      expect(afterCheckin.status).toBe(200);
      const afterRow =
        afterCheckin.data.data.goal ?? afterCheckin.data.data;
      expect(afterRow.currentMetric).toBe(120);
      expect(afterRow.status).toBe('achieved');
    } finally {
      if (goalId != null) await hardDeleteGoal(clientApi, goalId);
      if (initiativeId != null) await softCancelInitiative(clientApi, initiativeId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Polymorphic links — attach + unlink + byType reflects change
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Initiative Links — attach + unlink @brain @brain-initiatives-links', () => {
  test('attach a task → byType.task increments → unlink → byType.task decrements', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let initiativeId: number | null = null;
    // Synthetic task id — the polymorphic link does NOT enforce FK to tasks
    // (entityId is a plain integer, resolution is app-layer). Using a high
    // synthetic id keeps the test deterministic without seeding a real task.
    const syntheticTaskId = 999_000 + Math.floor(Math.random() * 1000);

    try {
      const init = await clientApi.post('/api/portal/brain/initiatives', {
        name: `E2E links ${ts}`,
        priority: 'medium',
        status: 'active',
      });
      expect(init.status, JSON.stringify(init.data)).toBe(200);
      initiativeId = init.data.data.id as number;

      // Baseline byType counts via detail.
      const baseline = await clientApi.get(
        `/api/portal/brain/initiatives/${initiativeId}?includeLinks=true`,
      );
      expect(baseline.status).toBe(200);
      const baseTaskCount: number =
        baseline.data.data?.links?.byType?.task ?? 0;

      // ATTACH task.
      const attach = await clientApi.post(
        `/api/portal/brain/initiatives/${initiativeId}/links`,
        {
          entityType: 'task',
          entityId: syntheticTaskId,
          note: 'e2e attach',
        },
      );
      expect(attach.status, JSON.stringify(attach.data)).toBe(200);
      expect(attach.data?.success).toBe(true);

      // byType.task should be baseline + 1.
      const afterAttach = await clientApi.get(
        `/api/portal/brain/initiatives/${initiativeId}?includeLinks=true`,
      );
      expect(afterAttach.status).toBe(200);
      const attachedTaskCount: number =
        afterAttach.data.data?.links?.byType?.task ?? 0;
      expect(attachedTaskCount).toBe(baseTaskCount + 1);

      // UNLINK — body-bearing DELETE. ApiClient.delete was extended to take
      // an optional second-arg body for exactly this contract; the brain
      // initiative /links DELETE route is the first in-tree consumer.
      const detach = await clientApi.delete(
        `/api/portal/brain/initiatives/${initiativeId}/links`,
        { entityType: 'task', entityId: syntheticTaskId },
      );
      expect(detach.status, JSON.stringify(detach.data)).toBe(200);
      expect(detach.data?.success).toBe(true);

      // byType.task back to baseline.
      const afterDetach = await clientApi.get(
        `/api/portal/brain/initiatives/${initiativeId}?includeLinks=true`,
      );
      expect(afterDetach.status).toBe(200);
      const detachedTaskCount: number =
        afterDetach.data.data?.links?.byType?.task ?? 0;
      expect(detachedTaskCount).toBe(baseTaskCount);
    } finally {
      if (initiativeId != null) await softCancelInitiative(clientApi, initiativeId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. PATCH refuses status changes — error_use_close_or_reopen contract
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Initiatives — PATCH status guard @brain @brain-initiatives-patch-guard', () => {
  test('PATCH /initiatives/[id] with status returns 400 directing caller to /close or /reopen', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let id: number | null = null;

    try {
      const create = await clientApi.post('/api/portal/brain/initiatives', {
        name: `E2E patch-guard ${ts}`,
        priority: 'low',
        status: 'planned',
      });
      expect(create.status).toBe(200);
      id = create.data.data.id as number;

      // Attempt to flip status via PATCH — the route returns 400 with the
      // "status changes go through /close or /reopen" message. This is the
      // documented `error_use_close_or_reopen` contract.
      const patch = await clientApi.patch(
        `/api/portal/brain/initiatives/${id}`,
        { status: 'active' },
      );
      expect(patch.status, JSON.stringify(patch.data)).toBe(400);
      expect(patch.data?.success).toBe(false);
      const msg: string = patch.data?.message ?? '';
      expect(/close|reopen/i.test(msg)).toBe(true);
    } finally {
      if (id != null) await softCancelInitiative(clientApi, id);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Soft-cancel via DELETE → status='cancelled', closeReason='deleted'
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Initiatives — soft cancel via DELETE @brain @brain-initiatives-soft-cancel', () => {
  test('DELETE /initiatives/[id] sets status=cancelled and closeReason=deleted', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let id: number | null = null;

    try {
      const create = await clientApi.post('/api/portal/brain/initiatives', {
        name: `E2E soft-cancel ${ts}`,
        priority: 'medium',
        status: 'active',
      });
      expect(create.status).toBe(200);
      id = create.data.data.id as number;

      const del = await clientApi.delete(
        `/api/portal/brain/initiatives/${id}`,
      );
      expect(del.status, JSON.stringify(del.data)).toBe(200);
      expect(del.data?.success).toBe(true);
      expect(del.data?.data?.deleted).toBe('soft');
      expect(del.data?.data?.status).toBe('cancelled');

      // GET still returns 200 — the row exists, just terminal-cancelled.
      const get = await clientApi.get(`/api/portal/brain/initiatives/${id}`);
      expect(get.status).toBe(200);
      const row = get.data?.data?.initiative ?? get.data?.data;
      expect(row.status).toBe('cancelled');
      expect(row.closeReason).toBe('deleted');
      expect(row.closedAt).toBeTruthy();
    } finally {
      // DELETE on an already-cancelled initiative throws — softCancelInitiative
      // swallows that.
      if (id != null) await softCancelInitiative(clientApi, id);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Browser-driven flows — deferred.
//
// The PLAN test plan explicitly says "API-driven specs only this branch
// (browser specs `test.skip` with TODO)". These are stubs so future Waves
// can fill them in once the editor / drag-reparent infra supports them.
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Initiatives — browser flows (deferred) @brain @brain-initiatives-browser', () => {
  test.skip('TODO: drag-reparent a goal between initiatives in the UI', async () => {
    // Pattern not yet supported — drag flows currently require manual
    // postMessage choreography in the iframe-rendered editor. Pick up once
    // a stable selector exists for the goal card + initiative drop zones
    // on /portal/brain/initiatives/[id].
  });

  test.skip('TODO: submit the create-initiative form via the real /new page', async () => {
    // Pattern not yet supported — InitiativeForm posts via fetch from a
    // client component; the API path is already covered by the lifecycle
    // spec above. Convert once we want to assert form validation messages
    // are rendered (vs returned by the API).
  });

  test.skip('TODO: GoalProgress checkin button drives /checkin and re-renders the bar', async () => {
    // Pattern not yet supported — see above. The auto-classify branch is
    // already covered through the API; this spec is purely about UI render.
  });
});
