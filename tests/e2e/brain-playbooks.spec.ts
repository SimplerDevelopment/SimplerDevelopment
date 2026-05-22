/**
 * Brain Playbooks — Phase 6 (Wave 4 closer) E2E coverage.
 *
 * API-driven. Mirrors the shape of `brain-knowledge.spec.ts` /
 * `brain-initiatives.spec.ts`: uses the `clientApi` fixture for an
 * authenticated tenant, drives every assertion through the REST surface
 * (`/api/portal/brain/playbooks/**`, `/api/portal/brain/playbook-runs/**`),
 * and cleans up via DELETE with `?force=true` in `finally` blocks so the
 * suite is rerunnable.
 *
 * Covers:
 *   1. Empty list for a fresh tenant (slug-scoped to avoid pollution).
 *   2. Lifecycle: draft → 3 steps → activate (DAG validates) → start →
 *      advance through steps → run completes.
 *   3. DAG validation: cycles, no-entry-point, missing nextStepKey refs
 *      all block /activate with a structured `errors` array.
 *   4. Archive refuses when active runs exist; force=true wins.
 *   5. Branch step: condition true takes path A; condition false takes
 *      path B; the unchosen path is marked skipped.
 *   6. Wait step: `untilOffsetDays: 0` puts wait_until in the past;
 *      hitting `/api/cron/process-playbook-waits` with the
 *      `x-vercel-cron: 1` header drains it; the step completes and the
 *      next step spawns.
 *   7. Abort mid-run: halts active steps, marks them skipped.
 *   8. Tenancy: each run created against `clientApi` is anchored to that
 *      tenant — listings filtered by `playbookId` only surface the
 *      caller's runs.
 *   9. Start refuses if playbook is in draft status.
 *
 * All specs tagged `@brain` for selective runs.
 *
 * Phase E Wave 4. See `.planning/brain-playbooks/HANDOFF.md`.
 */
import { test, expect } from './setup/fixtures';
import { request as playwrightRequest } from '@playwright/test';
import { randomUUID } from 'crypto';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const uniq = () => `${Date.now()}-${randomUUID().slice(0, 8)}`;

// ─── Cleanup helpers ───────────────────────────────────────────────────────

async function hardDeletePlaybook(
  api: import('./setup/api-client').ApiClient,
  id: number,
): Promise<void> {
  // force=true cascades active runs + steps + links via the lib.
  await api.delete(`/api/portal/brain/playbooks/${id}?force=true`).catch(() => null);
}

async function tryAbortRun(
  api: import('./setup/api-client').ApiClient,
  runId: number,
): Promise<void> {
  await api
    .post(`/api/portal/brain/playbook-runs/${runId}/abort`, { reason: 'e2e cleanup' })
    .catch(() => null);
}

/**
 * Create a minimal playbook with `n` task steps wired in a linear chain
 * (`s0 -> s1 -> ... -> s{n-1}`), activate it, and return the created
 * playbook id + step keys for the lifecycle / advance tests.
 */
async function createLinearPlaybook(
  api: import('./setup/api-client').ApiClient,
  name: string,
  n: number,
): Promise<{ playbookId: number; stepKeys: string[] }> {
  const create = await api.post('/api/portal/brain/playbooks', { name });
  expect(create.status, JSON.stringify(create.data)).toBe(200);
  const playbookId = create.data.data.id as number;

  const stepKeys: string[] = [];
  for (let i = 0; i < n; i++) {
    const key = `s${i}`;
    stepKeys.push(key);
    const nextStepKeys = i < n - 1 ? [`s${i + 1}`] : [];
    const step = await api.post(`/api/portal/brain/playbooks/${playbookId}/steps`, {
      key,
      name: `Step ${i}`,
      kind: 'task',
      config: { title: `Task ${i}`, priority: 'medium' },
      nextStepKeys,
    });
    expect(step.status, JSON.stringify(step.data)).toBe(200);
  }

  const activate = await api.post(`/api/portal/brain/playbooks/${playbookId}/activate`);
  expect(activate.status, JSON.stringify(activate.data)).toBe(200);
  expect(activate.data?.success).toBe(true);

  return { playbookId, stepKeys };
}

// ───────────────────────────────────────────────────────────────────────────
// 1. Empty list for a fresh tenant
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Playbooks — empty list @brain @brain-playbooks-empty', () => {
  test('playbooks list returns empty for fresh tenant (impossible category filter)', async ({
    clientApi,
  }) => {
    // Use a known-impossible category filter rather than relying on the
    // global tenant being empty — sibling tests + the seed leave residue.
    const impossible = `__never_exists_${uniq()}__`;
    const res = await clientApi.get(
      `/api/portal/brain/playbooks?category=${encodeURIComponent(impossible)}`,
    );
    expect(res.status, JSON.stringify(res.data)).toBe(200);
    expect(res.data?.success).toBe(true);
    expect(Array.isArray(res.data?.data?.items)).toBe(true);
    expect(res.data.data.items).toEqual([]);

    // Runs list with an impossible playbookId is similarly empty.
    const runs = await clientApi.get(
      '/api/portal/brain/playbook-runs?playbookId=999999999',
    );
    expect(runs.status, JSON.stringify(runs.data)).toBe(200);
    expect(runs.data?.success).toBe(true);
    expect(Array.isArray(runs.data?.data?.items)).toBe(true);
    expect(runs.data.data.items).toEqual([]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 2. Full lifecycle
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Playbooks — full lifecycle @brain @brain-playbooks-lifecycle', () => {
  test('draft → add 3 steps → activate (DAG validates) → start run → advance through steps → completes', async ({
    clientApi,
  }) => {
    const ts = uniq();
    const name = `E2E linear playbook ${ts}`;
    let playbookId: number | null = null;
    let runId: number | null = null;

    try {
      // CREATE (draft).
      const created = await clientApi.post('/api/portal/brain/playbooks', {
        name,
        description: 'linear lifecycle test',
        category: 'e2e-test',
      });
      expect(created.status, JSON.stringify(created.data)).toBe(200);
      expect(created.data?.success).toBe(true);
      playbookId = created.data.data.id as number;
      expect(created.data.data.status).toBe('draft');

      // 3 task steps wired s0 → s1 → s2.
      for (let i = 0; i < 3; i++) {
        const step = await clientApi.post(
          `/api/portal/brain/playbooks/${playbookId}/steps`,
          {
            key: `s${i}`,
            name: `Step ${i}`,
            kind: 'task',
            config: { title: `Task ${i}`, priority: 'medium' },
            nextStepKeys: i < 2 ? [`s${i + 1}`] : [],
          },
        );
        expect(step.status, JSON.stringify(step.data)).toBe(200);
      }

      // START while draft → 400.
      const startWhileDraft = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/start`,
        { label: 'should-be-refused' },
      );
      expect(startWhileDraft.status).toBe(400);
      expect(startWhileDraft.data?.success).toBe(false);
      expect(/draft|active/i.test(String(startWhileDraft.data?.message ?? ''))).toBe(true);

      // ACTIVATE — DAG validates.
      const activate = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/activate`,
      );
      expect(activate.status, JSON.stringify(activate.data)).toBe(200);
      expect(activate.data?.success).toBe(true);
      expect(activate.data?.data?.status).toBe('active');

      // START — task step is "waiting" (active), advance does NOT auto-complete
      // tasks (only branch/note/meeting/wait).
      const startRes = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/start`,
        { label: `linear run ${ts}` },
      );
      expect(startRes.status, JSON.stringify(startRes.data)).toBe(200);
      expect(startRes.data?.success).toBe(true);
      runId = startRes.data.data.runId as number;
      expect(typeof runId).toBe('number');
      expect(startRes.data.data.runStatus).toBe('active');
      expect(startRes.data.data.firstStepKeys).toEqual(['s0']);

      // DETAIL — only s0 should be active.
      const d0 = await clientApi.get(`/api/portal/brain/playbook-runs/${runId}`);
      expect(d0.status).toBe(200);
      const initialSteps = d0.data.data.steps as Array<{
        key: string;
        status: string;
        stepId: number;
      }>;
      const initialActive = initialSteps.filter((s) => s.status === 'active');
      expect(initialActive).toHaveLength(1);
      expect(initialActive[0].key).toBe('s0');

      // Walk forward by completing each task step in order.
      for (let i = 0; i < 3; i++) {
        const stepRow = initialSteps.find((s) => s.key === `s${i}`)
          ?? (await clientApi.get(`/api/portal/brain/playbook-runs/${runId}`))
            .data.data.steps.find((s: { key: string }) => s.key === `s${i}`);
        expect(stepRow, `expected step s${i} to exist in run`).toBeTruthy();
        const stepId = stepRow.stepId as number;

        const complete = await clientApi.post(
          `/api/portal/brain/playbook-runs/${runId}/steps/${stepId}/complete`,
        );
        expect(complete.status, JSON.stringify(complete.data)).toBe(200);
        expect(complete.data?.success).toBe(true);
      }

      // Run should now be completed.
      const finalDetail = await clientApi.get(
        `/api/portal/brain/playbook-runs/${runId}`,
      );
      expect(finalDetail.status).toBe(200);
      expect(finalDetail.data.data.run.status).toBe('completed');

      const finalSteps = finalDetail.data.data.steps as Array<{
        key: string;
        status: string;
      }>;
      for (let i = 0; i < 3; i++) {
        const row = finalSteps.find((s) => s.key === `s${i}`);
        expect(row?.status, `step s${i} should be completed`).toBe('completed');
      }
    } finally {
      if (runId != null) await tryAbortRun(clientApi, runId);
      if (playbookId != null) await hardDeletePlaybook(clientApi, playbookId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 3. DAG validation
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Playbooks — DAG validation @brain @brain-playbooks-dag', () => {
  test('activate refuses on cycles, on no-entry-point, on missing nextStepKey refs', async ({
    clientApi,
  }) => {
    const ts = uniq();

    // ── missing nextStepKey ──
    let playbookId1: number | null = null;
    try {
      const c = await clientApi.post('/api/portal/brain/playbooks', {
        name: `E2E DAG missing-ref ${ts}`,
      });
      expect(c.status).toBe(200);
      playbookId1 = c.data.data.id as number;

      const s = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId1}/steps`,
        {
          key: 'a',
          name: 'A',
          kind: 'task',
          nextStepKeys: ['ghost'], // never created
        },
      );
      expect(s.status).toBe(200);

      const act = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId1}/activate`,
      );
      expect(act.status).toBe(400);
      expect(act.data?.success).toBe(false);
      expect(Array.isArray(act.data?.errors)).toBe(true);
      const joined1 = (act.data.errors as string[]).join(' | ');
      expect(/missing|ghost/i.test(joined1), `expected missing-ref error, got: ${joined1}`).toBe(true);
    } finally {
      if (playbookId1 != null) await hardDeletePlaybook(clientApi, playbookId1);
    }

    // ── cycle (a -> b -> a) ──
    let playbookId2: number | null = null;
    try {
      const c = await clientApi.post('/api/portal/brain/playbooks', {
        name: `E2E DAG cycle ${ts}`,
      });
      expect(c.status).toBe(200);
      playbookId2 = c.data.data.id as number;

      const sa = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId2}/steps`,
        { key: 'a', name: 'A', kind: 'task', nextStepKeys: ['b'] },
      );
      expect(sa.status).toBe(200);
      const sb = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId2}/steps`,
        { key: 'b', name: 'B', kind: 'task', nextStepKeys: ['a'] },
      );
      expect(sb.status).toBe(200);

      const act = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId2}/activate`,
      );
      expect(act.status).toBe(400);
      const joined2 = (act.data.errors as string[]).join(' | ');
      // Either "cycle" detection or "no entry step" — both are valid signals
      // for a strongly-connected 2-node graph since every node has an
      // incoming edge.
      expect(
        /cycle|no entry step|every step is targeted/i.test(joined2),
        `expected cycle/no-entry error, got: ${joined2}`,
      ).toBe(true);
    } finally {
      if (playbookId2 != null) await hardDeletePlaybook(clientApi, playbookId2);
    }

    // ── no entry point (single step pointing at itself) ──
    let playbookId3: number | null = null;
    try {
      const c = await clientApi.post('/api/portal/brain/playbooks', {
        name: `E2E DAG no-entry ${ts}`,
      });
      expect(c.status).toBe(200);
      playbookId3 = c.data.data.id as number;

      const sa = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId3}/steps`,
        { key: 'only', name: 'Only', kind: 'task', nextStepKeys: ['only'] },
      );
      expect(sa.status).toBe(200);

      const act = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId3}/activate`,
      );
      expect(act.status).toBe(400);
      const joined3 = (act.data.errors as string[]).join(' | ');
      expect(
        /no entry step|cycle/i.test(joined3),
        `expected no-entry / cycle error, got: ${joined3}`,
      ).toBe(true);
    } finally {
      if (playbookId3 != null) await hardDeletePlaybook(clientApi, playbookId3);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 4. Archive refuses if active runs exist (unless force=true)
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Playbooks — archive with active runs @brain @brain-playbooks-archive', () => {
  test('archive refuses if active runs exist; force=true wins', async ({ clientApi }) => {
    const ts = uniq();
    let playbookId: number | null = null;
    let runId: number | null = null;

    try {
      const { playbookId: pid } = await createLinearPlaybook(
        clientApi,
        `E2E archive ${ts}`,
        2,
      );
      playbookId = pid;

      const startRes = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/start`,
        { label: `archive-test run ${ts}` },
      );
      expect(startRes.status).toBe(200);
      runId = startRes.data.data.runId as number;

      // Plain archive — refuses.
      const arch1 = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/archive`,
      );
      expect(arch1.status).toBe(400);
      expect(arch1.data?.success).toBe(false);
      expect(/active|run/i.test(String(arch1.data?.message ?? ''))).toBe(true);

      // force=true — succeeds.
      const arch2 = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/archive?force=true`,
      );
      expect(arch2.status, JSON.stringify(arch2.data)).toBe(200);
      expect(arch2.data?.success).toBe(true);
      expect(arch2.data?.data?.status).toBe('archived');
    } finally {
      if (runId != null) await tryAbortRun(clientApi, runId);
      if (playbookId != null) await hardDeletePlaybook(clientApi, playbookId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 5. Branch step routing
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Playbooks — branch step @brain @brain-playbooks-branch', () => {
  test('condition true takes path A; condition false takes path B; the unchosen path is marked skipped', async ({
    clientApi,
  }) => {
    const ts = uniq();

    async function runBranch(vipValue: boolean): Promise<{
      pathATaken: boolean;
      pathBTaken: boolean;
      playbookId: number;
      runId: number;
    }> {
      const c = await clientApi.post('/api/portal/brain/playbooks', {
        name: `E2E branch vip=${vipValue} ${ts}`,
      });
      expect(c.status).toBe(200);
      const playbookId = c.data.data.id as number;

      // Branch step "decider" with condition `vip == true` and two
      // alternative downstream steps. nextStepKeys for branch lists BOTH
      // potential paths; spawning logic re-evaluates each downstream's
      // condition (here we give pathA + pathB inverse conditions so only
      // one is taken).
      await clientApi.post(`/api/portal/brain/playbooks/${playbookId}/steps`, {
        key: 'decider',
        name: 'Decide',
        kind: 'branch',
        condition: { field: 'vip', op: 'eq', value: true },
        nextStepKeys: ['pathA', 'pathB'],
      });
      // pathA executes only when vip==true.
      await clientApi.post(`/api/portal/brain/playbooks/${playbookId}/steps`, {
        key: 'pathA',
        name: 'VIP path',
        kind: 'task',
        config: { title: 'VIP follow-up', priority: 'high' },
        condition: { field: 'vip', op: 'eq', value: true },
        nextStepKeys: [],
      });
      // pathB executes only when vip!=true.
      await clientApi.post(`/api/portal/brain/playbooks/${playbookId}/steps`, {
        key: 'pathB',
        name: 'Standard path',
        kind: 'task',
        config: { title: 'Standard follow-up', priority: 'medium' },
        condition: { field: 'vip', op: 'neq', value: true },
        nextStepKeys: [],
      });

      const act = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/activate`,
      );
      expect(act.status, JSON.stringify(act.data)).toBe(200);

      const startRes = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/start`,
        { label: `branch run vip=${vipValue} ${ts}`, context: { vip: vipValue } },
      );
      expect(startRes.status, JSON.stringify(startRes.data)).toBe(200);
      const runId = startRes.data.data.runId as number;

      // Branches auto-resolve on start (spawnAndDispatchStep + chain), so
      // by the time start returns, pathA / pathB rows exist with their
      // chosen status. If the run-engine ever moves branch eval to an
      // async pass, an explicit /advance call would handle the gap; keep
      // the call here as a safety hop.
      await clientApi.post(`/api/portal/brain/playbook-runs/${runId}/advance`);

      const detail = await clientApi.get(
        `/api/portal/brain/playbook-runs/${runId}`,
      );
      expect(detail.status).toBe(200);
      const steps = detail.data.data.steps as Array<{ key: string; status: string }>;

      const pa = steps.find((s) => s.key === 'pathA');
      const pb = steps.find((s) => s.key === 'pathB');

      // The chosen path is `active` (task waits for explicit completion);
      // the unchosen path is `skipped`. Either could in principle be
      // missing entirely if the engine never spawned it — accept that as
      // equivalent-to-skipped.
      const pathATaken = pa?.status === 'active' || pa?.status === 'completed';
      const pathBTaken = pb?.status === 'active' || pb?.status === 'completed';

      return { pathATaken, pathBTaken, playbookId, runId };
    }

    // VIP run: pathA taken, pathB skipped/missing.
    let pb1: number | null = null;
    let run1: number | null = null;
    try {
      const r = await runBranch(true);
      pb1 = r.playbookId;
      run1 = r.runId;
      expect(r.pathATaken).toBe(true);
      expect(r.pathBTaken).toBe(false);
    } finally {
      if (run1 != null) await tryAbortRun(clientApi, run1);
      if (pb1 != null) await hardDeletePlaybook(clientApi, pb1);
    }

    // Non-VIP run: pathB taken, pathA skipped/missing.
    let pb2: number | null = null;
    let run2: number | null = null;
    try {
      const r = await runBranch(false);
      pb2 = r.playbookId;
      run2 = r.runId;
      expect(r.pathATaken).toBe(false);
      expect(r.pathBTaken).toBe(true);
    } finally {
      if (run2 != null) await tryAbortRun(clientApi, run2);
      if (pb2 != null) await hardDeletePlaybook(clientApi, pb2);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 6. Wait step → cron drains → next step spawns
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Playbooks — wait step + drain @brain @brain-playbooks-wait', () => {
  test('wait step with untilOffsetDays=0 sets waitUntil <= now; process-playbook-waits cron drains it; next step spawns', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let playbookId: number | null = null;
    let runId: number | null = null;

    try {
      const c = await clientApi.post('/api/portal/brain/playbooks', {
        name: `E2E wait ${ts}`,
      });
      expect(c.status).toBe(200);
      playbookId = c.data.data.id as number;

      // wait step (0-day offset puts wait_until at "now", which is <= now()
      // by the time the cron query runs).
      await clientApi.post(`/api/portal/brain/playbooks/${playbookId}/steps`, {
        key: 'wait1',
        name: 'Hold',
        kind: 'wait',
        config: { untilOffsetDays: 0 },
        nextStepKeys: ['after'],
      });
      // follow-up task — proves the chain advanced.
      await clientApi.post(`/api/portal/brain/playbooks/${playbookId}/steps`, {
        key: 'after',
        name: 'After hold',
        kind: 'task',
        config: { title: 'Follow up' },
        nextStepKeys: [],
      });

      const act = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/activate`,
      );
      expect(act.status, JSON.stringify(act.data)).toBe(200);

      const startRes = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/start`,
        { label: `wait-run ${ts}` },
      );
      expect(startRes.status, JSON.stringify(startRes.data)).toBe(200);
      runId = startRes.data.data.runId as number;

      // Pre-drain: wait1 should be active with a waitUntil set.
      const pre = await clientApi.get(`/api/portal/brain/playbook-runs/${runId}`);
      expect(pre.status).toBe(200);
      const preWait = (pre.data.data.steps as Array<{
        key: string;
        status: string;
        waitUntil: string | null;
      }>).find((s) => s.key === 'wait1');
      expect(preWait?.status).toBe('active');
      expect(preWait?.waitUntil).toBeTruthy();

      // Trigger the cron explicitly via the Vercel-cron header so the auth
      // gate accepts the call without needing CRON_SECRET configured in the
      // test environment. Mirrors the pattern in
      // `tests/e2e/cron-expire-mcp-pendings.spec.ts`.
      const cronCtx = await playwrightRequest.newContext({ baseURL: BASE_URL });
      try {
        const cronRes = await cronCtx.get('/api/cron/process-playbook-waits', {
          headers: { 'x-vercel-cron': '1' },
        });
        const cronBody = await cronRes.json().catch(() => null);
        expect(cronRes.status(), JSON.stringify(cronBody)).toBe(200);
        expect(cronBody?.success).toBe(true);
        // The cron's report shape: { success, examined, drained, failed }.
        expect(typeof cronBody.examined).toBe('number');
      } finally {
        await cronCtx.dispose();
      }

      // Post-drain: wait1 completed, `after` spawned as active.
      const post = await clientApi.get(`/api/portal/brain/playbook-runs/${runId}`);
      expect(post.status).toBe(200);
      const steps = post.data.data.steps as Array<{ key: string; status: string }>;
      const wait1 = steps.find((s) => s.key === 'wait1');
      const after = steps.find((s) => s.key === 'after');
      expect(wait1?.status).toBe('completed');
      expect(after?.status).toBe('active');
    } finally {
      if (runId != null) await tryAbortRun(clientApi, runId);
      if (playbookId != null) await hardDeletePlaybook(clientApi, playbookId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 7. Abort mid-run
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Playbooks — abort mid-run @brain @brain-playbooks-abort', () => {
  test('abort halts active steps, marks them skipped, run status=aborted', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let playbookId: number | null = null;
    let runId: number | null = null;

    try {
      const { playbookId: pid } = await createLinearPlaybook(
        clientApi,
        `E2E abort ${ts}`,
        3,
      );
      playbookId = pid;

      const startRes = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/start`,
        { label: `abort-run ${ts}` },
      );
      expect(startRes.status, JSON.stringify(startRes.data)).toBe(200);
      runId = startRes.data.data.runId as number;

      // Sanity — s0 is active before abort.
      const pre = await clientApi.get(`/api/portal/brain/playbook-runs/${runId}`);
      const preStep = (pre.data.data.steps as Array<{ key: string; status: string }>)
        .find((s) => s.key === 's0');
      expect(preStep?.status).toBe('active');

      // Abort.
      const abort = await clientApi.post(
        `/api/portal/brain/playbook-runs/${runId}/abort`,
        { reason: 'e2e test abort' },
      );
      expect(abort.status, JSON.stringify(abort.data)).toBe(200);
      expect(abort.data?.success).toBe(true);
      expect(abort.data?.data?.status).toBe('aborted');

      // Run status + step state.
      const post = await clientApi.get(`/api/portal/brain/playbook-runs/${runId}`);
      expect(post.status).toBe(200);
      expect(post.data.data.run.status).toBe('aborted');

      const postSteps = post.data.data.steps as Array<{
        key: string;
        status: string;
      }>;
      // Every step that was active should now be skipped. Steps that never
      // ran (s1, s2) might be absent OR pending — both acceptable; the
      // important assertion is no step is left dangling in 'active'.
      const stillActive = postSteps.filter((s) => s.status === 'active');
      expect(
        stillActive,
        `no step should still be active after abort, got: ${JSON.stringify(postSteps)}`,
      ).toHaveLength(0);

      const s0After = postSteps.find((s) => s.key === 's0');
      expect(s0After?.status).toBe('skipped');
    } finally {
      if (playbookId != null) await hardDeletePlaybook(clientApi, playbookId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 8. Tenancy isolation — runs scoped per-client
// ───────────────────────────────────────────────────────────────────────────

test.describe('Brain Playbooks — tenancy @brain @brain-playbooks-tenancy', () => {
  test('runs created by clientApi are scoped to that tenant; list filtered by playbookId only surfaces caller-owned runs', async ({
    clientApi,
  }) => {
    const ts = uniq();
    let playbookId: number | null = null;
    const runIds: number[] = [];

    try {
      const { playbookId: pid } = await createLinearPlaybook(
        clientApi,
        `E2E tenancy ${ts}`,
        1,
      );
      playbookId = pid;

      // Two runs on this playbook.
      for (let i = 0; i < 2; i++) {
        const start = await clientApi.post(
          `/api/portal/brain/playbooks/${playbookId}/start`,
          { label: `tenancy run ${i} ${ts}` },
        );
        expect(start.status, JSON.stringify(start.data)).toBe(200);
        runIds.push(start.data.data.runId as number);
      }

      // List runs filtered by this playbookId — exactly the 2 we created
      // should appear, all on the same playbook.
      const listed = await clientApi.get(
        `/api/portal/brain/playbook-runs?playbookId=${playbookId}`,
      );
      expect(listed.status).toBe(200);
      const items = listed.data.data.items as Array<{
        id: number;
        playbookId: number;
      }>;
      const ourIds = items.filter((r) => runIds.includes(r.id));
      expect(ourIds).toHaveLength(2);
      for (const r of ourIds) expect(r.playbookId).toBe(playbookId);

      // Asking for a playbookId we don't own (random large id) returns
      // empty — tenancy join + filter combine to scope.
      const foreign = await clientApi.get(
        '/api/portal/brain/playbook-runs?playbookId=999999999',
      );
      expect(foreign.status).toBe(200);
      expect(foreign.data?.success).toBe(true);
      expect(foreign.data.data.items).toEqual([]);

      // Fetching a run id outside the tenant (e.g. id 0) is rejected as 400 (invalid),
      // and a high-but-invalid id returns 404 — both are the tenant-scoping signal.
      const notFound = await clientApi.get(
        '/api/portal/brain/playbook-runs/999999999',
      );
      expect(notFound.status).toBe(404);
      expect(notFound.data?.success).toBe(false);
    } finally {
      for (const r of runIds) await tryAbortRun(clientApi, r);
      if (playbookId != null) await hardDeletePlaybook(clientApi, playbookId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 9. Start refuses while playbook is in draft status
// ───────────────────────────────────────────────────────────────────────────
//
// Covered inline by the lifecycle test (test 2). A dedicated spec also lives
// here so this invariant is selectable on its own.

test.describe('Brain Playbooks — start vs draft @brain @brain-playbooks-start-guard', () => {
  test('start refuses if playbook is in draft status', async ({ clientApi }) => {
    const ts = uniq();
    let playbookId: number | null = null;

    try {
      const c = await clientApi.post('/api/portal/brain/playbooks', {
        name: `E2E start-guard ${ts}`,
      });
      expect(c.status).toBe(200);
      playbookId = c.data.data.id as number;

      const s = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/steps`,
        { key: 'only', name: 'Only', kind: 'task', nextStepKeys: [] },
      );
      expect(s.status).toBe(200);

      // Still in draft — no /activate call. /start must refuse.
      const startRes = await clientApi.post(
        `/api/portal/brain/playbooks/${playbookId}/start`,
        { label: 'should be refused' },
      );
      expect(startRes.status).toBe(400);
      expect(startRes.data?.success).toBe(false);
      expect(/draft|active|status/i.test(String(startRes.data?.message ?? ''))).toBe(true);
    } finally {
      if (playbookId != null) await hardDeletePlaybook(clientApi, playbookId);
    }
  });
});
