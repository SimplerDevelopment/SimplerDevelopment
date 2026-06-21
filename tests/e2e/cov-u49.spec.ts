/**
 * Chat Realtime Voice — E2E coverage slice [4..7]
 *
 * Card 4: POST /api/portal/voice/session rejects unauthenticated (401)
 * Card 5: POST /api/portal/voice/session returns 402 when plan gate blocks or credits exhausted
 * Card 6: POST /api/portal/voice/tool returns 400 for unknown tool name
 * Card 7: POST /api/portal/voice/tool rejects unauthenticated (401)
 *
 * NOTE on card 5: checkAiPlanGate currently always returns allowed:true (see lib/ai/plan-gate.ts).
 * The 402 path requires either: (a) plan gate returning allowed:false, or (b) hasCredits() returning
 * false when using the platform key. Neither can be deterministically triggered in a seeded test env
 * without mocking — this card is marked needs-spec below.
 */
import { test, expect } from './setup/fixtures';

// ── Card 4: POST /api/portal/voice/session rejects unauthenticated (401) ──

test.describe('Voice Session — unauthenticated', () => {
  test('POST /api/portal/voice/session rejects unauthenticated request with 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/voice/session', {});
    expect(res.status).toBe(401);
  });
});

// ── Card 6: POST /api/portal/voice/tool returns 400 for unknown tool name ──

test.describe('Voice Tool — unknown tool name', () => {
  test('POST /api/portal/voice/tool with unknown tool name returns 400 (no auth required for tool lookup)', async ({ unauthApi }) => {
    // The route checks the tool name BEFORE the auth check, so an unknown tool
    // returns 400 regardless of authentication state.
    const res = await unauthApi.post('/api/portal/voice/tool', {
      tool: 'definitely_not_a_real_tool_xyz_12345',
      args: {},
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
    expect(res.data.message).toMatch(/Unknown tool/i);
  });

  test('POST /api/portal/voice/tool with empty tool string returns 400', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/voice/tool', {
      tool: '',
      args: {},
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });
});

// ── Card 7: POST /api/portal/voice/tool rejects unauthenticated (401) ──

test.describe('Voice Tool — unauthenticated', () => {
  test('POST /api/portal/voice/tool with a valid tool name and no auth returns 401', async ({ unauthApi }) => {
    // 'search_brain' is a real read tool (requiresConfirm: false, action: 'read').
    // Auth check runs after tool lookup — so with a valid tool we reach the auth gate.
    const res = await unauthApi.post('/api/portal/voice/tool', {
      tool: 'search_brain',
      args: { query: 'test' },
    });
    expect(res.status).toBe(401);
  });

  test('POST /api/portal/voice/tool list_open_deals with no auth returns 401', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/voice/tool', {
      tool: 'list_open_deals',
      args: {},
    });
    expect(res.status).toBe(401);
  });
});
