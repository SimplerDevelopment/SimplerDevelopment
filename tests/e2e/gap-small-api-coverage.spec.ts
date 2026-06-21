/**
 * Gap coverage: small API surface (4 newly-implemented endpoints)
 *
 * Covers:
 *   1. GET  /api/portal/automations/[id]         — fetch a single rule
 *   2. PUT  /api/portal/crm/pipelines/[id]        — rename a pipeline
 *   3. DELETE /api/portal/crm/pipelines/[id]      — delete a pipeline (guards)
 *   4. PATCH  /api/portal/ai/conversations/[id]   — rename a conversation
 *      DELETE /api/portal/ai/conversations/[id]   — delete a conversation
 *
 * Conversations have no create endpoint — they are seeded directly via psql.
 * Pipelines have no delete helper — they are created per-test and cleaned up.
 *
 * @gap @small-api
 */

import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';
import { execSync } from 'child_process';

// ── DB helpers ────────────────────────────────────────────────────────────────

const DB_URL =
  process.env.DATABASE_URL || 'postgresql://dancoyle@localhost:5432/simplerdev_test';

/**
 * Feed SQL via stdin so multiline statements and special chars don't need
 * shell escaping. -t = tuples-only (no headers/footers). --no-psqlrc = clean.
 */
function psql(sql: string): string {
  return execSync(`psql "${DB_URL}" --no-psqlrc -t`, {
    input: sql,
    encoding: 'utf8',
    timeout: 15_000,
  }).trim();
}

/**
 * Run a single-row INSERT/SELECT with RETURNING and parse the first data line.
 */
function psqlRow(sql: string): string[] {
  const raw = psql(sql);
  const dataLine = raw
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l !== '' && !/^(INSERT|UPDATE|DELETE|SELECT)\b/i.test(l));
  if (!dataLine) return [];
  return dataLine.split('|').map((s) => s.trim());
}

// ── Automation rule helpers ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createAutomationRule(api: any, overrides?: Record<string, unknown>) {
  const ts = Date.now();
  return api.post('/api/portal/automations', {
    name: `E2E Rule ${ts}`,
    trigger: { event: 'crm.contact.created' },
    actions: [{ tool: 'get_my_tickets', params: {} }],
    ...overrides,
  });
}

// ── Pipeline helpers ──────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function createPipeline(api: any, name?: string) {
  const ts = Date.now();
  return api.post('/api/portal/crm/pipelines', { name: name ?? `E2E Pipeline ${ts}` });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. GET /api/portal/automations/[id]
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('GET /api/portal/automations/[id] @gap @small-api', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async ({ clientApi }) => {
    await runCleanups(cleanups);
    cleanups = [];
    void clientApi;
  });

  test('200: fetches a rule by id after creating it', async ({ clientApi }) => {
    const createRes = await createAutomationRule(clientApi);
    expect(createRes.status).toBe(200);
    const rule = createRes.data.rule;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${rule.id}`);
    });

    const getRes = await clientApi.get(`/api/portal/automations/${rule.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.success).toBe(true);
    expect(getRes.data.rule).toBeDefined();
    expect(getRes.data.rule.id).toBe(rule.id);
    expect(getRes.data.rule.name).toBe(rule.name);
  });

  test('404: unknown id returns { success: false }', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/automations/999999999');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('400: non-numeric id returns 400', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/automations/not-a-number');
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('401: unauthenticated caller gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/automations/1');
    expect(res.status).toBe(401);
  });

  test('404: cross-tenant rule is not visible (tenant isolation)', async ({ clientApi }) => {
    // Create a rule as client 1 (clientApi). Then attempt to GET it using a
    // DIFFERENT clientId by directly mutating the row's clientId in the DB,
    // simulating another tenant's rule having the same numeric id.
    // Simpler approach: seed a row for a different clientId directly via psql
    // and try to fetch it as client 1.
    const otherClientId = 101; // Test Co — not the authenticated user's client

    const row = psqlRow(`
      INSERT INTO automation_rules (client_id, name, trigger, actions, scopes, enabled, created_at, updated_at)
      VALUES (
        ${otherClientId},
        'Cross-tenant rule',
        '{"event":"crm.contact.created"}'::json,
        '[{"tool":"get_my_tickets","params":{}}]'::json,
        '["tickets:read"]'::json,
        true,
        NOW(), NOW()
      )
      RETURNING id
    `);
    const foreignRuleId = Number(row[0]);
    if (!foreignRuleId) throw new Error('Failed to seed cross-tenant rule');

    try {
      const res = await clientApi.get(`/api/portal/automations/${foreignRuleId}`);
      // Client 1 must NOT see client 101's rule
      expect(res.status).toBe(404);
    } finally {
      psql(`DELETE FROM automation_rules WHERE id = ${foreignRuleId}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. PUT /api/portal/crm/pipelines/[id]
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('PUT /api/portal/crm/pipelines/[id] @gap @small-api', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async ({ clientApi }) => {
    await runCleanups(cleanups);
    cleanups = [];
    void clientApi;
  });

  test('200: renames an existing pipeline', async ({ clientApi }) => {
    const createRes = await createPipeline(clientApi);
    expect([200, 201]).toContain(createRes.status);
    expect(createRes.data.success).toBe(true);
    const pipeline = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/pipelines/${pipeline.id}`).catch(() => {});
    });

    const putRes = await clientApi.put(`/api/portal/crm/pipelines/${pipeline.id}`, {
      name: 'Renamed Pipeline',
    });
    expect(putRes.status).toBe(200);
    expect(putRes.data.success).toBe(true);
    expect(putRes.data.data.name).toBe('Renamed Pipeline');
    expect(putRes.data.data.id).toBe(pipeline.id);
  });

  test('400: missing name returns 400', async ({ clientApi }) => {
    const createRes = await createPipeline(clientApi);
    expect([200, 201]).toContain(createRes.status);
    const pipeline = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/pipelines/${pipeline.id}`).catch(() => {});
    });

    const res = await clientApi.put(`/api/portal/crm/pipelines/${pipeline.id}`, {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('400: empty string name returns 400', async ({ clientApi }) => {
    const createRes = await createPipeline(clientApi);
    expect([200, 201]).toContain(createRes.status);
    const pipeline = createRes.data.data;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/pipelines/${pipeline.id}`).catch(() => {});
    });

    const res = await clientApi.put(`/api/portal/crm/pipelines/${pipeline.id}`, { name: '   ' });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('404: unknown pipeline id returns 404', async ({ clientApi }) => {
    const res = await clientApi.put('/api/portal/crm/pipelines/999999999', {
      name: 'Ghost',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('401: unauthenticated caller gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.put('/api/portal/crm/pipelines/1', { name: 'X' });
    expect(res.status).toBe(401);
  });

  test('404: cross-tenant pipeline returns 404', async ({ clientApi }) => {
    // Seed a pipeline belonging to another client directly
    const otherClientId = 101;
    const row = psqlRow(`
      INSERT INTO crm_pipelines (client_id, name, is_default, created_at, updated_at)
      VALUES (${otherClientId}, 'Cross-tenant pipe', false, NOW(), NOW())
      RETURNING id
    `);
    const foreignPipelineId = Number(row[0]);
    if (!foreignPipelineId) throw new Error('Failed to seed cross-tenant pipeline');

    try {
      const res = await clientApi.put(`/api/portal/crm/pipelines/${foreignPipelineId}`, {
        name: 'Hijacked',
      });
      expect(res.status).toBe(404);
    } finally {
      psql(`DELETE FROM crm_pipelines WHERE id = ${foreignPipelineId}`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DELETE /api/portal/crm/pipelines/[id]
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('DELETE /api/portal/crm/pipelines/[id] @gap @small-api', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async ({ clientApi }) => {
    await runCleanups(cleanups);
    cleanups = [];
    void clientApi;
  });

  test('200: deletes a non-default pipeline successfully', async ({ clientApi }) => {
    // Create a brand-new (non-default) pipeline
    const createRes = await createPipeline(clientApi);
    expect([200, 201]).toContain(createRes.status);
    const pipeline = createRes.data.data;
    // Soft cleanup in case delete fails
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/pipelines/${pipeline.id}`).catch(() => {});
    });

    const delRes = await clientApi.delete(`/api/portal/crm/pipelines/${pipeline.id}`);
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);

    // Verify it's gone: a PUT should 404 now
    const putRes = await clientApi.put(`/api/portal/crm/pipelines/${pipeline.id}`, {
      name: 'Should 404',
    });
    expect(putRes.status).toBe(404);
  });

  test('409: deleting the default pipeline is blocked', async ({ clientApi }) => {
    // Get the default pipeline id from the list
    const listRes = await clientApi.get('/api/portal/crm/pipelines');
    expect(listRes.status).toBe(200);
    const pipelines = (listRes.data.data ?? listRes.data.pipelines ?? []) as Array<{
      id: number;
      isDefault: boolean;
    }>;
    const defaultPipeline = pipelines.find((p) => p.isDefault);
    if (!defaultPipeline) {
      // Guard: if there's no default pipeline the test can't run meaningfully
      console.warn('No default pipeline found; skipping deletion guard assertion');
      return;
    }

    const res = await clientApi.delete(`/api/portal/crm/pipelines/${defaultPipeline.id}`);
    expect(res.status).toBe(409);
    expect(res.data.success).toBe(false);
  });

  test('409: pipeline with a deal cannot be deleted', async ({ clientApi }) => {
    // Create a pipeline — the create endpoint auto-seeds default stages and
    // returns them in data.stages.
    const createRes = await createPipeline(clientApi, `E2E HasDeal ${Date.now()}`);
    expect([200, 201]).toContain(createRes.status);
    const pipeline = createRes.data.data as {
      id: number;
      stages?: Array<{ id: number }>;
    };

    // Use the first auto-created stage from the create response.
    // If the API didn't embed stages, query them directly.
    let stageId: number | undefined = pipeline.stages?.[0]?.id;
    if (!stageId) {
      const stageRow = psqlRow(
        `SELECT id FROM crm_pipeline_stages WHERE pipeline_id = ${pipeline.id} ORDER BY sort_order LIMIT 1`,
      );
      stageId = Number(stageRow[0]);
    }
    if (!stageId) throw new Error('No stage found for pipeline');

    // Seed a deal in this pipeline via the API (no psql needed — stages exist)
    const dealRes = await clientApi.post('/api/portal/crm/deals', {
      title: `E2E Deal ${Date.now()}`,
      pipelineId: pipeline.id,
      stageId,
      value: 100,
      currency: 'USD',
    });
    expect(dealRes.status === 200 || dealRes.status === 201).toBe(true);
    const dealId = dealRes.data.data?.id ?? dealRes.data.deal?.id;

    cleanups.push(async () => {
      if (dealId) await clientApi.delete(`/api/portal/crm/deals/${dealId}`).catch(() => {});
      psql(`DELETE FROM crm_pipeline_stages WHERE pipeline_id = ${pipeline.id}`);
      psql(`DELETE FROM crm_pipelines WHERE id = ${pipeline.id}`);
    });

    const delRes = await clientApi.delete(`/api/portal/crm/pipelines/${pipeline.id}`);
    expect(delRes.status).toBe(409);
    expect(delRes.data.success).toBe(false);
  });

  test('404: unknown pipeline id returns 404', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/crm/pipelines/999999999');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('401: unauthenticated caller gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.delete('/api/portal/crm/pipelines/1');
    expect(res.status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. PATCH + DELETE /api/portal/ai/conversations/[id]
// ═══════════════════════════════════════════════════════════════════════════════
//
// There is no POST create endpoint for conversations. We seed them directly via
// psql, scoped to client 1 (the `client@example.com` authenticated user) for
// happy-path tests, and to client 101 for cross-tenant tests.

test.describe('PATCH /api/portal/ai/conversations/[id] @gap @small-api', () => {
  // The clientId for the authenticated e2e user (client@example.com = Acme Corp)
  const E2E_CLIENT_ID = 1;
  const OTHER_CLIENT_ID = 101;

  let convIds: number[] = [];

  function seedConversation(clientId: number, title = 'Seed Conv'): number {
    const row = psqlRow(`
      INSERT INTO ai_conversations (client_id, title, flagged, total_input_tokens, total_output_tokens, created_at, updated_at)
      VALUES (${clientId}, '${title.replace(/'/g, "''")}', false, 0, 0, NOW(), NOW())
      RETURNING id
    `);
    const id = Number(row[0]);
    if (!id) throw new Error('Failed to seed conversation');
    return id;
  }

  test.afterEach(() => {
    // Clean up any seeded conversations
    for (const id of convIds) {
      try {
        psql(`DELETE FROM ai_conversations WHERE id = ${id}`);
      } catch {}
    }
    convIds = [];
  });

  test('200: renames a conversation (PATCH title)', async ({ clientApi }) => {
    const convId = seedConversation(E2E_CLIENT_ID, 'Original Title');
    convIds.push(convId);

    const res = await clientApi.patch(`/api/portal/ai/conversations/${convId}`, {
      title: 'Renamed Conversation',
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.title).toBe('Renamed Conversation');
    expect(res.data.data.id).toBe(convId);
  });

  test('400: missing title returns 400', async ({ clientApi }) => {
    const convId = seedConversation(E2E_CLIENT_ID, 'No Title Test');
    convIds.push(convId);

    const res = await clientApi.patch(`/api/portal/ai/conversations/${convId}`, {});
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('400: empty title string returns 400', async ({ clientApi }) => {
    const convId = seedConversation(E2E_CLIENT_ID, 'Empty Title Test');
    convIds.push(convId);

    const res = await clientApi.patch(`/api/portal/ai/conversations/${convId}`, {
      title: '   ',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('400: non-numeric id returns 400', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/ai/conversations/not-a-number', {
      title: 'X',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('404: unknown conversation id returns 404', async ({ clientApi }) => {
    const res = await clientApi.patch('/api/portal/ai/conversations/999999999', {
      title: 'Ghost',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('401: unauthenticated caller gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.patch('/api/portal/ai/conversations/1', { title: 'X' });
    expect(res.status).toBe(401);
  });

  test('404: cross-tenant conversation is not visible (tenant isolation)', async ({
    clientApi,
  }) => {
    const convId = seedConversation(OTHER_CLIENT_ID, 'Cross-tenant conv');
    convIds.push(convId);

    const res = await clientApi.patch(`/api/portal/ai/conversations/${convId}`, {
      title: 'Hijacked',
    });
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });
});

test.describe('DELETE /api/portal/ai/conversations/[id] @gap @small-api', () => {
  const E2E_CLIENT_ID = 1;
  const OTHER_CLIENT_ID = 101;

  let convIds: number[] = [];

  function seedConversation(clientId: number, title = 'Seed Conv'): number {
    const row = psqlRow(`
      INSERT INTO ai_conversations (client_id, title, flagged, total_input_tokens, total_output_tokens, created_at, updated_at)
      VALUES (${clientId}, '${title.replace(/'/g, "''")}', false, 0, 0, NOW(), NOW())
      RETURNING id
    `);
    const id = Number(row[0]);
    if (!id) throw new Error('Failed to seed conversation');
    return id;
  }

  test.afterEach(() => {
    for (const id of convIds) {
      try {
        psql(`DELETE FROM ai_conversations WHERE id = ${id}`);
      } catch {}
    }
    convIds = [];
  });

  test('200: deletes a conversation and confirms it is gone', async ({ clientApi }) => {
    const convId = seedConversation(E2E_CLIENT_ID, 'To Delete');
    // Track for cleanup in case delete fails
    convIds.push(convId);

    const delRes = await clientApi.delete(`/api/portal/ai/conversations/${convId}`);
    expect(delRes.status).toBe(200);
    expect(delRes.data.success).toBe(true);

    // Remove from cleanup list since it's gone
    convIds = convIds.filter((id) => id !== convId);

    // Confirm gone — GET should 404
    const getRes = await clientApi.get(`/api/portal/ai/conversations/${convId}`);
    expect(getRes.status).toBe(404);
  });

  test('404: unknown conversation id returns 404', async ({ clientApi }) => {
    const res = await clientApi.delete('/api/portal/ai/conversations/999999999');
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });

  test('401: unauthenticated caller gets 401', async ({ unauthApi }) => {
    const res = await unauthApi.delete('/api/portal/ai/conversations/1');
    expect(res.status).toBe(401);
  });

  test('404: cross-tenant conversation deletion is blocked', async ({ clientApi }) => {
    const convId = seedConversation(OTHER_CLIENT_ID, 'Cross-tenant delete');
    convIds.push(convId);

    const res = await clientApi.delete(`/api/portal/ai/conversations/${convId}`);
    expect(res.status).toBe(404);
    expect(res.data.success).toBe(false);
  });
});
