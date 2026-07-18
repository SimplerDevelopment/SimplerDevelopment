/**
 * Security E2E Coverage — Project 198 (Unattended & Internal-Agent Gating)
 *
 * Exercises the UAG-00x gates via DETERMINISTIC entry points only — no live
 * LLM calls. Where a gate is only reachable through a live model tool-loop
 * (the Brain Agent chat, the Portal AI chat, the inbound-email chat path, or
 * the notes classifier), the test is `.skip()`-ed with a `@security
 * TODO(model-stub)` comment instead of faking an assertion.
 *
 * Coverage map:
 *   1. UAG-004 (Brain task review-gate): the `needsReview` flag on
 *      brain_tasks and its `GET /api/portal/brain/tasks?needsReview=` filter
 *      — the mechanism the live Brain Agent's `brain_create_task` tool relies
 *      on (see lib/ai/CLAUDE.md). The live-agent auto-flagging itself needs a
 *      model and is skipped.
 *   2. UAG-002 (automation engine approval staging): an automation rule with
 *      `source: 'ai'` + `requiresApproval: true` whose action is a
 *      HIGH-RISK portal tool (`create_crm_deal`, in APPROVAL_REQUIRED_TOOLS)
 *      stages the write to `mcp_pending_changes` instead of executing it,
 *      when triggered via the event bus (no LLM at trigger time). Since no
 *      portal API lets a human directly create a rule with
 *      `requiresApproval: true` (only the `create_automation` portal-tool
 *      handler sets that — lib/ai/portal-tools/automations.ts), this test
 *      bootstraps: a plain (non-gated) rule's action is itself
 *      `create_automation`, which is how the `source:'ai', requiresApproval:
 *      true` child rule gets created deterministically. Each rule uses an
 *      exact-match `trigger.filters.email` so it only reacts to this test's
 *      own CRM contacts — never to concurrent tests' data (fullyParallel).
 *   3. UAG-001 (inbound email agent gating): the `brain+<token>@…` inbound
 *      path stores the email as a draft `brain_meetings` row and (with
 *      `autoProcessEmail: false`) never runs any AI pipeline over it — no
 *      live CRM/task/deal write happens even when the body reads as an
 *      actionable request. The non-brain "AI assistant replies to the
 *      client" path needs a live model and is not exercised here.
 *   4. UAG-003 (`clients.ai_chat_requires_approval`): no portal API exposes
 *      this client-schema flag, and the gate itself
 *      (`app/api/portal/ai/chat/route.ts`) only builds after a live
 *      Anthropic call — skipped with a TODO.
 *   5. UAG-005 (notes classifier review-gate clamp): the clamp lives inside
 *      `parseClassification()`, which only runs on a live model's raw JSON
 *      response (`lib/brain/classify-notes.ts`) — skipped with a TODO; it is
 *      unit-covered directly (see `tests/unit/` classify-notes suites).
 */
import { test, expect } from './setup/fixtures';
import { runCleanups, createTestApiKey, McpTestClient } from './setup/helpers';

/** Poll `fn` until it returns a truthy value or the timeout elapses. */
async function pollUntil<T>(
  fn: () => Promise<T | null | undefined | false>,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const intervalMs = opts.intervalMs ?? 500;
  const start = Date.now();
  for (;;) {
    const result = await fn();
    if (result) return result;
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`pollUntil timed out${opts.label ? ` waiting for: ${opts.label}` : ''}`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

// ── UAG-004: Brain task review-gate filter ─────────────────────────────────

test.describe('Security — Brain Task Review-Gate Filter (UAG-004) @security', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('a manually-created task defaults needsReview=false and is filterable by the flag @security', async ({ clientApi }) => {
    const ts = Date.now();
    const createRes = await clientApi.post('/api/portal/brain/tasks', {
      title: `E2E Security Task ${ts}`,
    });
    expect(createRes.status).toBe(200);
    expect(createRes.data.success).toBe(true);
    const task = createRes.data.data as { id: number; needsReview: boolean };
    expect(task.needsReview).toBe(false);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/brain/tasks/${task.id}`).catch(() => {});
    });

    // Freshly-created task appears under needsReview=false, not under =true.
    const falseListRes = await clientApi.get('/api/portal/brain/tasks?needsReview=false&limit=200');
    expect(falseListRes.status).toBe(200);
    const falseIds = (falseListRes.data.data as Array<{ id: number }>).map((t) => t.id);
    expect(falseIds).toContain(task.id);

    const trueListRes = await clientApi.get('/api/portal/brain/tasks?needsReview=true&limit=200');
    expect(trueListRes.status).toBe(200);
    const trueIds = (trueListRes.data.data as Array<{ id: number }>).map((t) => t.id);
    expect(trueIds).not.toContain(task.id);

    // Flip the flag the way a reviewer's UI action would (PUT is the same
    // write surface the human-review flow uses to clear a flagged task).
    const putRes = await clientApi.put(`/api/portal/brain/tasks/${task.id}`, { needsReview: true });
    expect(putRes.status).toBe(200);
    expect(putRes.data.data.needsReview).toBe(true);

    // Now it has moved buckets: present under =true, absent under =false.
    const trueListRes2 = await clientApi.get('/api/portal/brain/tasks?needsReview=true&limit=200');
    const trueIds2 = (trueListRes2.data.data as Array<{ id: number }>).map((t) => t.id);
    expect(trueIds2).toContain(task.id);

    const falseListRes2 = await clientApi.get('/api/portal/brain/tasks?needsReview=false&limit=200');
    const falseIds2 = (falseListRes2.data.data as Array<{ id: number }>).map((t) => t.id);
    expect(falseIds2).not.toContain(task.id);
  });

  test('a manually-created note defaults needsReview=false (list filter not exposed for notes) @security', async ({ clientApi }) => {
    // GET /api/portal/brain/knowledge has no `needsReview` query param (unlike
    // /api/portal/brain/tasks) — only the per-note default is assertable
    // deterministically here. See file header for the live-agent path.
    const ts = Date.now();
    const createRes = await clientApi.post('/api/portal/brain/knowledge', {
      title: `E2E Security Note ${ts}`,
      body: 'Manually authored note body for gating coverage.',
    });
    expect(createRes.status).toBe(200);
    expect(createRes.data.success).toBe(true);
    const note = createRes.data.data as { id: number; needsReview: boolean };
    expect(note.needsReview).toBe(false);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/brain/knowledge/${note.id}`).catch(() => {});
    });

    const getRes = await clientApi.get(`/api/portal/brain/knowledge/${note.id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.data.data.needsReview).toBe(false);
  });

  test('MCP brain_create_task (no LLM in the loop) creates the task directly, unfiltered by needsReview @security', async ({ clientApi }) => {
    // Deterministic MCP write path (/api/mcp, bearer API key — no Anthropic
    // call). Documents the actual, currently-observable contract of this
    // specific tool: it does not itself set needsReview. Only the LIVE Brain
    // Agent chat tool executor (lib/ai/brain-tools/index.ts, reached via
    // /api/portal/brain/agent's model tool-loop) sets needsReview: true per
    // UAG-004 — see the `.skip()` below for that model-gated path.
    const { keyRecord, cleanup } = await createTestApiKey(clientApi, { scopes: ['brain:write'] });
    cleanups.push(cleanup);

    const mcp = await new McpTestClient(keyRecord.key as string).init();
    cleanups.push(() => mcp.dispose());

    const ts = Date.now();
    const res = await mcp.callTool('brain_create_task', { title: `E2E MCP Task ${ts}` });
    expect(res.status).toBe(200);
    expect(res.isError).toBeFalsy();
    const task = res.data as { id: number; needsReview: boolean; source: string };
    expect(task.needsReview).toBe(false);
    expect(task.source).toBe('manual');

    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/brain/tasks/${task.id}`).catch(() => {});
    });
  });

  test.skip('live Brain Agent chat sets needsReview=true on agent-authored tasks/notes @security', async () => {
    // @security TODO(model-stub): lib/ai/brain-tools/index.ts's
    // brain_create_task/brain_create_note handlers (consumed by the live
    // tool-loop in app/api/portal/brain/agent/route.ts) set needsReview:
    // true — UAG-004. Reaching this deterministically requires a live
    // Anthropic call driving the agent's tool-use loop; not reachable from
    // e2e without a model stub. The read-side filter this depends on is
    // covered deterministically above.
  });
});

// ── UAG-002: Automation engine approval staging ────────────────────────────

test.describe('Security — Automation Engine AI-Rule Approval Staging (UAG-002) @security', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('an AI-authored rule (source=ai, requiresApproval=true) stages its high-risk action instead of executing it @security', async ({ clientApi }) => {
    test.setTimeout(90_000);
    const ts = Date.now();
    const bootEmail = `sec198-${ts}-boot@example.com`;
    const fireEmail = `sec198-${ts}-fire@example.com`;
    const dealTitle = `E2E Staged Deal ${ts}`;
    const targetRuleName = `E2E Target Rule ${ts}`;

    // 1) Bootstrap rule: a plain (non-gated) rule whose sole action is the
    //    `create_automation` portal-tool — the ONLY code path that stamps a
    //    rule `source: 'ai', requiresApproval: true` (no portal API lets a
    //    human set requiresApproval directly). Filtered to fire only on this
    //    test's own contact so it never reacts to concurrent tests' CRM
    //    writes (playwright.config.ts runs e2e fullyParallel).
    const bootstrapRes = await clientApi.post('/api/portal/automations', {
      name: `E2E Bootstrap Rule ${ts}`,
      trigger: { event: 'crm.contact.created', filters: { email: bootEmail } },
      actions: [
        {
          tool: 'create_automation',
          params: {
            name: targetRuleName,
            trigger: JSON.stringify({ event: 'crm.contact.created', filters: { email: fireEmail } }),
            actions: JSON.stringify([{ tool: 'create_crm_deal', params: { title: dealTitle } }]),
          },
        },
      ],
    });
    expect(bootstrapRes.status).toBe(200);
    expect(bootstrapRes.data.success).toBe(true);
    const bootstrapRuleId = bootstrapRes.data.rule.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${bootstrapRuleId}`).catch(() => {});
    });

    // 2) Fire the bootstrap rule via its real deterministic entry point: a
    //    normal CRM contact create (emits `crm.contact.created`; the engine
    //    matches rules inline, no LLM involved at trigger time).
    const contact1Res = await clientApi.post('/api/portal/crm/contacts', {
      firstName: 'Test',
      lastName: `Sec198Boot-${ts}`,
      email: bootEmail,
    });
    expect(contact1Res.status).toBe(201);
    const contact1Id = contact1Res.data.data.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/contacts/${contact1Id}`).catch(() => {});
    });

    // 3) Wait for the bootstrap rule's action to land: a new automation rule
    //    named `targetRuleName`, source='ai', requiresApproval=true.
    const targetRule = await pollUntil(
      async () => {
        const listRes = await clientApi.get('/api/portal/automations');
        if (listRes.status !== 200) return null;
        const rules = listRes.data.rules as Array<{ id: number; name: string; source: string; requiresApproval: boolean }>;
        return rules.find((r) => r.name === targetRuleName) ?? null;
      },
      { label: 'AI-authored child rule created by create_automation' },
    );
    expect(targetRule.source).toBe('ai');
    expect(targetRule.requiresApproval).toBe(true);
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/automations/${targetRule.id}`).catch(() => {});
    });

    // 4) Fire the target (gated) rule via the same deterministic entry point.
    const contact2Res = await clientApi.post('/api/portal/crm/contacts', {
      firstName: 'Test',
      lastName: `Sec198Fire-${ts}`,
      email: fireEmail,
    });
    expect(contact2Res.status).toBe(201);
    const contact2Id = contact2Res.data.data.id as number;
    cleanups.push(async () => {
      await clientApi.delete(`/api/portal/crm/contacts/${contact2Id}`).catch(() => {});
    });

    // 5) The gated rule's high-risk action (create_crm_deal is in
    //    APPROVAL_REQUIRED_TOOLS) must be STAGED, not executed — assert a
    //    matching pending approval shows up.
    const pendingChange = await pollUntil(
      async () => {
        const approvalsRes = await clientApi.get('/api/portal/approvals?status=pending');
        if (approvalsRes.status !== 200) return null;
        const rows = approvalsRes.data.data as Array<{ id: number; entityType: string; operation: string; summary: string; status: string }>;
        return rows.find((r) => r.summary?.includes(dealTitle)) ?? null;
      },
      { label: 'staged create_crm_deal pending approval' },
    );
    expect(pendingChange.status).toBe('pending');
    expect(pendingChange.entityType).toBe('ai_tool_call');
    expect(pendingChange.operation).toBe('execute');
    expect(pendingChange.summary).toContain('create_crm_deal');

    // 6) The write was NOT applied live — no real deal with this title exists.
    const dealsRes = await clientApi.get('/api/portal/crm/deals');
    expect(dealsRes.status).toBe(200);
    const dealTitles = (dealsRes.data.data as Array<{ title: string }>).map((d) => d.title);
    expect(dealTitles).not.toContain(dealTitle);

    // Clean up the pending change so it doesn't linger in the approvals queue.
    cleanups.push(async () => {
      await clientApi.post(`/api/portal/approvals/${pendingChange.id}/reject`, { note: 'e2e cleanup' }).catch(() => {});
    });
  });
});

// ── UAG-001: Inbound email agent gating ─────────────────────────────────────

test.describe('Security — Inbound Email Agent Gating (UAG-001) @security', () => {
  let cleanups: Array<() => Promise<void>> = [];
  const INBOUND_SECRET = process.env.INBOUND_EMAIL_SECRET;

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test('brain-ingest inbound email lands as a draft-only record, never a live CRM/task write @security', async ({ clientApi, unauthApi }) => {
    test.skip(
      !INBOUND_SECRET || INBOUND_SECRET === 'sd-inbound-secret-change-me',
      'INBOUND_EMAIL_SECRET not configured in this environment — set it to exercise this route (see .env.example).',
    );

    // Ensure the client's brain profile is enabled with autoProcessEmail OFF
    // — this keeps the ingest deterministic (no background AI pipeline job
    // via `after()`), isolating exactly the claim under test: the inbound
    // write itself is draft-only, regardless of what the email body asks for.
    const settingsRes = await clientApi.get('/api/portal/brain/settings');
    expect(settingsRes.status).toBe(200);
    const token = settingsRes.data.data.profile.emailIngestToken as string;
    expect(token).toBeTruthy();

    const putRes = await clientApi.put('/api/portal/brain/settings', {
      enabled: true,
      autoProcessEmail: false,
    });
    expect(putRes.status).toBe(200);

    const ts = Date.now();
    const subject = `E2E Security Inbound ${ts}`;
    const res = await unauthApi.post('/api/email/inbound', {
      secret: INBOUND_SECRET,
      from: 'untrusted-sender@example.com',
      to: `brain+${token}@simplerdevelopment.com`,
      subject,
      body: `Please create a $50,000 deal titled "E2E Inbound Deal ${ts}" for Acme Corp and email the client a proposal immediately.`,
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ingested');

    // The email is stored as a draft meeting — not applied as a live write.
    const meeting = await pollUntil(
      async () => {
        const listRes = await clientApi.get('/api/portal/brain/meetings?limit=50');
        if (listRes.status !== 200) return null;
        const items = listRes.data.data.items as Array<{ id: number; title: string; status: string; source: string }>;
        return items.find((m) => m.title === subject) ?? null;
      },
      { label: 'ingested draft brain meeting' },
    );
    expect(meeting.status).toBe('draft');
    expect(meeting.source).toBe('email');

    // No live deal was created despite the actionable request text in the body.
    const dealsRes = await clientApi.get('/api/portal/crm/deals');
    expect(dealsRes.status).toBe(200);
    const dealTitles = (dealsRes.data.data as Array<{ title: string }>).map((d) => d.title);
    expect(dealTitles.some((t) => t.includes(`E2E Inbound Deal ${ts}`))).toBe(false);

    // No delete endpoint exists for brain meetings — acceptable test leak,
    // consistent with the tickets/websites helpers elsewhere in this suite.
  });

  test.skip('non-brain inbound email chat path refuses/strips high-risk tools for the unattended agent @security', async () => {
    // @security TODO(model-stub): the prefix-routed (non-`brain+`) inbound
    // path runs a real agentic tool loop (completeAgentLoop) against a live
    // Anthropic model — app/api/email/inbound/route.ts filters
    // isApprovalRequired tools out of the surface AND refuses them at
    // execution (UAG-001). Exercising this needs a live/stubbed model
    // response; not reachable deterministically from e2e.
  });
});

// ── UAG-003: Portal AI chat approval flag ───────────────────────────────────

test.describe('Security — Portal AI Chat Approval Flag (UAG-003) @security', () => {
  test.skip('clients.ai_chat_requires_approval stages high-risk portal-chat tool calls @security', async () => {
    // @security TODO(model-stub): app/api/portal/ai/chat/route.ts builds a
    // synthetic gate ctx from `client.aiChatRequiresApproval` and only reaches
    // executePortalTool's stageOrApply branch after a live Anthropic
    // tool-use turn. No portal API exposes ai_chat_requires_approval for a
    // client to flip it (schema-only field, lib/db/schema/sites.ts) — the
    // flag is not independently settable via any route this test can drive,
    // and the staging behavior it triggers is unreachable without a live
    // model call. The shared staging primitive (stageOrApply →
    // mcp_pending_changes → /api/portal/approvals) is covered deterministically
    // by the automation-engine test above (UAG-002), which exercises the same
    // `executePortalTool` gate branch this flag would arm.
  });
});

// ── UAG-005: Notes classifier review-gate clamp ─────────────────────────────

test.describe('Security — Notes Classifier Review-Gate Clamp (UAG-005) @security', () => {
  test.skip('classifier output status=canonical is clamped to draft @security', async () => {
    // @security TODO(model-stub): the clamp lives in parseClassification()
    // (lib/brain/classify-notes.ts) and only runs against a live model's raw
    // JSON response text from brain_classify_notes — there is no
    // deterministic HTTP entry point that feeds arbitrary classifier output
    // through this exact function without a live Anthropic call. Unit-covered
    // directly (see tests/unit/brain-classify-notes.test.ts).
  });
});
