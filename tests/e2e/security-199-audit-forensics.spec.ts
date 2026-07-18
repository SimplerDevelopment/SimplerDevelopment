/**
 * Agent Audit & Forensics E2E Coverage (project 199)
 *
 * Exercises the shipped-this-session AAF surface:
 *   - AAF-001: encrypted, reconstructable argument capture for high-risk MCP
 *     tool calls (`lib/mcp/telemetry.ts` -> `agent_action_captures`), gated
 *     behind a single-row admin decrypt route
 *     (`app/api/admin/agent-captures/[id]/route.ts`) that is itself
 *     audit-logged (`audit:capture_decrypt` rows in `agent_action_logs`).
 *   - AAF-001 retention: `app/api/cron/purge-agent-captures/route.ts`
 *     hard-purges capture ciphertext older than the 90-day window.
 *   - AAF-003: per-credential rate limit + high-risk-burst anomaly signal on
 *     every MCP tool call (`lib/mcp/telemetry.ts`, `MCP_TOOL_RATE_LIMIT` /
 *     `MCP_HIGH_RISK_BURST`).
 *
 * DB-verification note: the capture surface deliberately has NO list/browse
 * API — only GET /api/admin/agent-captures/[id] by known id, and the purge
 * cron. That is the point (a narrow single-row forensic read, not a
 * searchable index) but it means an e2e test that triggers a capture has no
 * portal-API path to discover the row's id or to verify the purge cron's DB
 * effect. Like tests/e2e/cov-u57.spec.ts and siblings (cron-plugin-jobs-tick,
 * gap-agency-coverage, ...), we shell out to `psql` for that setup/
 * verification step only — every security assertion itself still goes
 * through the real HTTP route.
 */
import { execSync } from 'child_process';
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, createTestWebsite, McpTestClient } from './setup/helpers';
import type { ApiClient } from './setup/api-client';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres@localhost:5432/simplerdev_test';

// ── Direct-DB helpers (setup/verification only — see file header) ──────────

function psql(sqlStr: string): string {
  return execSync(`psql "${DB_URL}" -t -A -c "${sqlStr.replace(/"/g, '\\"')}"`, {
    stdio: 'pipe',
    encoding: 'utf-8',
  }).trim();
}

async function getActiveClientId(api: ApiClient): Promise<number> {
  const res = await api.get('/api/portal/clients');
  const clientId = (res.data as { activeClientId?: number | null } | null)?.activeClientId;
  if (!clientId) throw new Error('No activeClientId resolved for the test client account');
  return clientId;
}

interface DecryptEnvelope {
  success: boolean;
  message?: string;
  data?: { toolName: string; args: Record<string, unknown>; createdAt: string };
}

/**
 * Poll for an `agent_action_captures` row matching (clientId, toolName,
 * created_at >= sinceIso) whose decrypted args satisfy `matches`. The
 * capture insert is fire-and-forget (`lib/mcp/telemetry.ts`), so the row can
 * land a beat after the triggering tool call's HTTP response returns.
 *
 * This also *is* the "admin can decrypt a real capture" + "decrypted args
 * reconstruct the call" assertion — finding a match requires a successful
 * 200 decrypt whose payload matches the predicate — and its LIMIT 5 /
 * predicate-match approach (rather than a bare "latest row") keeps it safe
 * against other parallel workers writing captures for the same tool.
 */
async function findCaptureId(
  adminApi: ApiClient,
  clientId: number,
  toolName: string,
  sinceIso: string,
  matches: (args: Record<string, unknown>) => boolean,
): Promise<{ id: number; args: Record<string, unknown>; createdAt: string }> {
  // The capture insert is fire-and-forget (lib/mcp/telemetry.ts) and the MCP
  // HTTP response can return before it lands. 40 attempts * 500ms = ~20s
  // baseline, plus per-attempt psql/adminApi round-trip overhead — mirrors
  // the 20s/500ms pollUntil convention in security-198-agent-gating.spec.ts
  // for the same "wait on a fire-and-forget DB write" shape. The original
  // 20 * 250ms (~5s) window was too tight under CI load and produced a false
  // "no capture found" timeout even though the capture eventually landed.
  for (let attempt = 0; attempt < 40; attempt++) {
    const raw = psql(
      `SELECT id FROM agent_action_captures WHERE client_id = ${clientId} AND tool_name = '${toolName}' AND created_at >= '${sinceIso}' ORDER BY id DESC LIMIT 5`,
    );
    const ids = raw.split('\n').map((s) => s.trim()).filter(Boolean).map(Number);
    for (const id of ids) {
      const res = await adminApi.get(`/api/admin/agent-captures/${id}`);
      const body = res.data as DecryptEnvelope | null;
      if (res.status === 200 && body?.success && body.data && matches(body.data.args)) {
        return { id, args: body.data.args, createdAt: body.data.createdAt };
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No agent_action_captures row for tool="${toolName}" matched the predicate within the poll window`);
}

function countCaptures(clientId: number, toolName: string, sinceIso: string): number {
  const out = psql(
    `SELECT COUNT(*) FROM agent_action_captures WHERE client_id = ${clientId} AND tool_name = '${toolName}' AND created_at >= '${sinceIso}'`,
  );
  return parseInt(out, 10) || 0;
}

/** Status of the most recent `audit:capture_decrypt` row logged against `captureId`. */
function latestDecryptAuditStatus(captureId: number): string | null {
  const out = psql(
    `SELECT status FROM agent_action_logs WHERE tool_name = 'audit:capture_decrypt' AND (inputs_summary->>'captureId')::int = ${captureId} ORDER BY id DESC LIMIT 1`,
  );
  return out || null;
}

/**
 * Create a website + wildcard-scope API key, create a post, then delete it
 * via `posts_delete` (high-risk: matches the `_delete` suffix in
 * `lib/mcp/high-risk-tools.ts`), and resolve the resulting
 * `agent_action_captures` row. Pushes its own cleanups onto `cleanups`.
 */
async function triggerHighRiskCapture(
  clientApi: ApiClient,
  adminApi: ApiClient,
  cleanups: Array<() => Promise<void>>,
): Promise<{ captureId: number; postId: number; clientId: number }> {
  const clientId = await getActiveClientId(clientApi);
  const { website } = await createTestWebsite(clientApi);
  const { keyRecord, cleanup: keyCleanup } = await createTestApiKey(clientApi, { scopes: ['*'] });
  cleanups.push(keyCleanup);
  const mcp = await new McpTestClient(keyRecord.key).init();
  cleanups.push(() => mcp.dispose());

  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const created = await mcp.callTool('posts_create', {
    websiteId: website.id,
    title: `AAF Capture Probe ${ts}-${rand}`,
    slug: `aaf-capture-probe-${ts}-${rand}`,
    content: 'x',
  });
  expect(created.isError).toBeFalsy();
  const postId = (created.data as { id: number }).id;
  expect(postId).toBeDefined();

  const sinceIso = new Date().toISOString();
  const deleted = await mcp.callTool('posts_delete', { id: postId });
  expect(deleted.isError).toBeFalsy();
  expect((deleted.data as { success: boolean })?.success).toBe(true);

  const found = await findCaptureId(adminApi, clientId, 'posts_delete', sinceIso, (args) => args?.id === postId);
  return { captureId: found.id, postId, clientId };
}

// ── 1. High-risk capture: created, decryptable, args reconstruct the call ──

test.describe('Agent Audit & Forensics — high-risk capture reconstruction @security @mcp @aaf-001', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('posts_delete (high-risk) creates a decryptable capture whose reconstructed args equal what was sent, and the decrypt read is itself audit-logged @security', async ({ clientApi, adminApi }) => {
    const { captureId, postId } = await triggerHighRiskCapture(clientApi, adminApi, cleanups);

    const decrypted = await adminApi.get(`/api/admin/agent-captures/${captureId}`);
    expect(decrypted.status).toBe(200);
    const body = decrypted.data as DecryptEnvelope;
    expect(body.success).toBe(true);
    expect(body.data?.toolName).toBe('posts_delete');
    // Reconstructed args must equal exactly what the MCP client sent — this
    // is the whole point of the capture (post-incident forensic replay).
    expect(body.data?.args).toEqual({ id: postId });
    expect(body.data?.createdAt).toBeTruthy();

    // The decrypt read is fail-closed audited per the ADR — there is no
    // un-audited read path (app/api/admin/agent-captures/[id]/route.ts).
    const auditStatus = latestDecryptAuditStatus(captureId);
    expect(auditStatus).toBe('success');
  });
});

// ── 2. Decrypt route auth gate ──────────────────────────────────────────────

test.describe('Agent Audit & Forensics — decrypt route auth gate @security @admin @aaf-001', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('unauthenticated caller is rejected (401) @security', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/admin/agent-captures/1');
    expect(res.status).toBe(401);
  });

  test('non-admin client-role user is rejected (401) @security', async ({ clientApi }) => {
    // requireAdmin() only accepts role === 'admin' (app/api/admin/prompts/_auth.ts) —
    // the seeded client@example.com portal user is role 'client'.
    const res = await clientApi.get('/api/admin/agent-captures/1');
    expect(res.status).toBe(401);
  });

  test('admin can decrypt a real capture (200) @security', async ({ clientApi, adminApi }) => {
    const { captureId } = await triggerHighRiskCapture(clientApi, adminApi, cleanups);

    const res = await adminApi.get(`/api/admin/agent-captures/${captureId}`);
    expect(res.status).toBe(200);
    const body = res.data as DecryptEnvelope;
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('args');
    expect(body.data).toHaveProperty('toolName');
  });

  test('non-numeric id returns 400 @security', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/agent-captures/not-a-number');
    expect(res.status).toBe(400);
    expect((res.data as DecryptEnvelope).success).toBe(false);
  });

  test('non-existent id returns 404 @security', async ({ adminApi }) => {
    const res = await adminApi.get('/api/admin/agent-captures/999999999');
    expect(res.status).toBe(404);
    expect((res.data as DecryptEnvelope).success).toBe(false);
  });
});

// ── 3. Rate limit + high-risk-only capture scoping (AAF-003) ───────────────

test.describe('Agent Audit & Forensics — rate limit + high-risk-only capture scoping @security @mcp @aaf-003', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('a benign (non-high-risk) tool call does NOT create an agent_action_captures row @security', async ({ clientApi }) => {
    const clientId = await getActiveClientId(clientApi);
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['hosting:read'] });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    const sinceIso = new Date().toISOString();
    const res = await mcp.callTool('hosting_list', {});
    expect(res.isError).toBeFalsy();

    // The capture insert is fire-and-forget and lands within ~1s when it
    // fires at all; give it a moment then assert absence. hosting_list
    // matches neither the high-risk suffix pattern nor the explicit
    // HIGH_RISK_TOOL_SET (lib/mcp/high-risk-tools.ts) — only
    // agent_action_logs (redacted summary) gets a row for this call, not
    // agent_action_captures (encrypted reconstructable args).
    await new Promise((r) => setTimeout(r, 1500));
    expect(countCaptures(clientId, 'hosting_list', sinceIso)).toBe(0);
  });

  test('a burst beyond MCP_TOOL_RATE_LIMIT is throttled with an isError response @security', async ({ clientApi }) => {
    const configuredLimit = Number(process.env.MCP_TOOL_RATE_LIMIT) || 0;
    // Default MCP_TOOL_RATE_LIMIT is 240/min (lib/mcp/telemetry.ts) — firing
    // 240+ sequential HTTP calls in a single e2e test is impractical/flaky
    // here. Only run the real burst when the env has been lowered for e2e.
    // @security TODO(rate-limit-env): set MCP_TOOL_RATE_LIMIT to a small
    // value (e.g. 20) in the e2e environment to exercise this deterministically
    // on every run instead of conditionally skipping.
    test.skip(
      !configuredLimit || configuredLimit > 60,
      'MCP_TOOL_RATE_LIMIT not lowered for this env (defaults to 240/min) — skipping the real burst; see @security TODO(rate-limit-env) above.',
    );

    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['hosting:read'] });
    cleanups.push(cleanup);
    const mcp = await new McpTestClient(keyRecord.key).init();
    cleanups.push(() => mcp.dispose());

    let throttled: { isError: boolean; text: string | null } | null = null;
    for (let i = 0; i < configuredLimit + 5 && !throttled; i++) {
      const res = await mcp.callTool('hosting_list', {});
      if (res.isError && /rate limit/i.test(res.text ?? '')) {
        throttled = res;
      }
    }
    expect(throttled).not.toBeNull();
    expect(throttled?.text).toMatch(/rate limit/i);
  });
});

// ── 4. Purge cron ────────────────────────────────────────────────────────────

test.describe('Agent Audit & Forensics — purge-agent-captures cron @security @cron @aaf-001', () => {
  test('rejects unauthenticated requests (401) @security', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/cron/purge-agent-captures');
    expect(res.status).toBe(401);
  });

  test('rejects a bogus bearer token (401) @security', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cron/purge-agent-captures`, {
      headers: { Authorization: 'Bearer wrong-secret' },
    });
    expect(res.status()).toBe(401);
  });

  test('accepts the Vercel cron header and returns { purged } on GET @security', async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/cron/purge-agent-captures`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.purged).toBe('number');
  });

  test('also accepts POST (manual trigger) with the Vercel cron header @security', async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/cron/purge-agent-captures`, {
      headers: { 'x-vercel-cron': '1' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.purged).toBe('number');
  });

  test('accepts a valid CRON_SECRET bearer token @security', async ({ request }) => {
    const secret = process.env.CRON_SECRET;
    test.skip(!secret, 'CRON_SECRET not set — skipping positive auth test');

    const res = await request.get(`${BASE_URL}/api/cron/purge-agent-captures`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    expect(res.status()).toBe(200);
  });

  test('purges a capture older than the 90-day retention window and leaves a recent one intact @security', async ({ clientApi, request }) => {
    const clientId = await getActiveClientId(clientApi);
    const oldId = parseInt(
      psql(
        `INSERT INTO agent_action_captures (client_id, tool_name, ciphertext, created_at) VALUES (${clientId}, 'e2e_security_199_purge_old', 'deadbeef', NOW() - INTERVAL '95 days') RETURNING id`,
      ),
      10,
    );
    const freshId = parseInt(
      psql(
        `INSERT INTO agent_action_captures (client_id, tool_name, ciphertext, created_at) VALUES (${clientId}, 'e2e_security_199_purge_fresh', 'deadbeef', NOW()) RETURNING id`,
      ),
      10,
    );

    try {
      const res = await request.get(`${BASE_URL}/api/cron/purge-agent-captures`, {
        headers: { 'x-vercel-cron': '1' },
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(typeof body.purged).toBe('number');

      // The 95-day-old row is gone...
      expect(psql(`SELECT COUNT(*) FROM agent_action_captures WHERE id = ${oldId}`)).toBe('0');
      // ...but the fresh row (created_at ~ now) survives — only the
      // retention-expired ciphertext is purged (RETENTION_DAYS = 90 in
      // app/api/cron/purge-agent-captures/route.ts).
      expect(psql(`SELECT COUNT(*) FROM agent_action_captures WHERE id = ${freshId}`)).toBe('1');
    } finally {
      // oldId is already gone if the purge ran; DELETE ... IN (...) is a safe no-op for it.
      psql(`DELETE FROM agent_action_captures WHERE id IN (${oldId}, ${freshId})`);
    }
  });
});
