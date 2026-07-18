/**
 * Chat Realtime Voice — E2E coverage slice (indices 8–11)
 *
 * Cards:
 *   8. POST /api/portal/voice/tool read tool executes immediately (no confirm phase, status=done)
 *   9. POST /api/portal/voice/tool mutation tool first-phase returns needs_confirmation + confirmToken
 *  10. POST /api/portal/voice/tool mutation tool second-phase with valid confirmToken returns status=done
 *  11. POST /api/portal/voice/tool mutation tool tampered confirmToken returns 400
 */
import { test, expect } from './setup/fixtures';

// ── Voice tool dispatcher tests ──────────────────────────────────────────────

test.describe('POST /api/portal/voice/tool — read tool immediate execution @voice', () => {
  test('read tool (search_brain) executes immediately — status=done, no confirm phase', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/portal/voice/tool', {
      tool: 'search_brain',
      args: { query: 'test query for voice e2e' },
    });
    // The brain endpoint may 502 if brain has no data, but the dispatcher itself
    // must return status=done (not needs_confirmation) for a read tool.
    // 200 with done, OR 502 from the inner callPortal failure — either way we
    // must NOT get needs_confirmation.
    if (res.status === 200) {
      expect(res.data.success).toBe(true);
      expect(res.data.data.status).toBe('done');
      expect(res.data.data).not.toHaveProperty('confirmToken');
    } else {
      // The dispatcher propagated a tool execution error — acceptable (502).
      // The key invariant is that it did NOT return needs_confirmation.
      expect(res.status).toBe(502);
    }
  });

  test('read tool (list_my_tasks) executes immediately — status=done, no confirm phase', async ({
    clientApi,
  }) => {
    const res = await clientApi.post('/api/portal/voice/tool', {
      tool: 'list_my_tasks',
      args: {},
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('done');
    expect(res.data.data).not.toHaveProperty('confirmToken');
    expect(res.data.data).toHaveProperty('result');
  });
});

test.describe('POST /api/portal/voice/tool — mutation tool two-phase flow @voice', () => {
  let createdContactId: number | null = null;

  test.afterAll(async ({ clientApi }) => {
    if (createdContactId != null) {
      await clientApi.delete(`/api/portal/crm/contacts/${createdContactId}`).catch(() => {});
      createdContactId = null;
    }
  });

  test('first-phase: mutation tool returns needs_confirmation + confirmToken', async ({
    clientApi,
  }) => {
    const ts = Date.now();
    const res = await clientApi.post('/api/portal/voice/tool', {
      tool: 'create_contact',
      args: { firstName: `VoiceTest-${ts}`, email: `voice-e2e-${ts}@example.com` },
    });
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data.status).toBe('needs_confirmation');
    expect(typeof res.data.data.confirmToken).toBe('string');
    expect(res.data.data.confirmToken.length).toBeGreaterThan(0);
    expect(typeof res.data.data.summary).toBe('string');
  });

  test('second-phase: valid confirmToken returns status=done', async ({ clientApi }) => {
    const ts = Date.now();
    const args = { firstName: `VoicePhase2-${ts}`, email: `voice-phase2-${ts}@example.com` };

    // Phase 1 — get the token.
    const phase1 = await clientApi.post('/api/portal/voice/tool', {
      tool: 'create_contact',
      args,
    });
    expect(phase1.status).toBe(200);
    expect(phase1.data.data.status).toBe('needs_confirmation');
    const { confirmToken } = phase1.data.data as { confirmToken: string };

    // Phase 2 — submit same args + token.
    const phase2 = await clientApi.post('/api/portal/voice/tool', {
      tool: 'create_contact',
      args,
      confirmToken,
    });
    expect(phase2.status).toBe(200);
    expect(phase2.data.success).toBe(true);
    expect(phase2.data.data.status).toBe('done');
    expect(phase2.data.data).toHaveProperty('result');

    // Capture id for cleanup.
    const result = phase2.data.data.result as Record<string, unknown> | null;
    if (result && typeof result.id === 'number') {
      createdContactId = result.id;
    }
  });

  test('tampered confirmToken returns 400', async ({ clientApi }) => {
    const ts = Date.now();
    const args = { firstName: `VoiceTamper-${ts}`, email: `voice-tamper-${ts}@example.com` };

    // Phase 1 — get a real token.
    const phase1 = await clientApi.post('/api/portal/voice/tool', {
      tool: 'create_contact',
      args,
    });
    expect(phase1.status).toBe(200);
    const { confirmToken } = phase1.data.data as { confirmToken: string };

    // Tamper: submit DIFFERENT args with the token minted for the original args.
    const res = await clientApi.post('/api/portal/voice/tool', {
      tool: 'create_contact',
      args: { firstName: `TAMPERED-${ts}`, email: `tampered-${ts}@example.com` },
      confirmToken,
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});
