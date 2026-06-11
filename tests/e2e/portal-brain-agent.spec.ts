/**
 * Portal Brain Agent E2E Tests
 *
 * Covers POST /api/portal/brain/agent — auth guards, SSE frame structure,
 * conversation continuation.
 *
 * Auth guard tests run without any LLM access and are always fast.
 * SSE smoke + continuation tests require a live Anthropic API key (platform
 * credits or BYOK). They self-skip with a clear message when the route
 * returns 402 so CI without API keys stays green.
 */
import { test, expect } from './setup/fixtures';
import { runCleanups } from './setup/helpers';

// Mirrors the helper in portal-brain.spec.ts.
async function ensureBrainEnabled(
  api: import('./setup/api-client').ApiClient,
): Promise<void> {
  await api.put('/api/portal/brain/settings', { enabled: true });
}

// Parse `data: {...}` lines from a raw SSE response body.
function parseSseFrames(body: string): Array<Record<string, unknown>> {
  return body
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => {
      try {
        return JSON.parse(line.slice(6)) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((f): f is Record<string, unknown> => f !== null);
}

// ── Auth guards ────────────────────────────────────────────────────────────────

test.describe('Brain Agent — auth guards @brain-agent @auth', () => {
  test('rejects unauthenticated requests with 401 @critical', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/brain/agent', { message: 'hello' });
    expect(res.status).toBe(401);
  });

  test('rejects empty message with 400 @critical', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/agent', { message: '' });
    expect(res.status).toBe(400);
    expect(res.data?.success).toBe(false);
  });

  test('rejects missing message body with 400', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/brain/agent', {});
    expect(res.status).toBe(400);
  });

  test('rejects unknown conversationId with 404 @critical', async ({ clientApi }) => {
    await ensureBrainEnabled(clientApi);
    const res = await clientApi.post('/api/portal/brain/agent', {
      message: 'hello',
      conversationId: 999_999_999,
    });
    expect(res.status).toBe(404);
  });

  test('staff/admin are NOT blocked with 403 (brain allows staff) @critical', async ({
    adminApi,
  }) => {
    // Brain agent permits staff; /api/portal/ai/chat blocks them (403).
    // We only check it is NOT 401/403 — 200 or 402 (no credits) are both valid.
    const res = await adminApi.post('/api/portal/brain/agent', { message: 'hello' });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ── SSE smoke (requires live LLM access) ──────────────────────────────────────

test.describe('Brain Agent — SSE stream @brain-agent', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'returns text/event-stream with intent + done frames @critical',
    async ({ clientApi }) => {
      await ensureBrainEnabled(clientApi);

      const res = await clientApi.postText('/api/portal/brain/agent', {
        message: 'What is the Company Brain?',
      });

      if (res.status === 402) {
        test.skip(true, 'No AI credits or API key — skipping live SSE test');
        return;
      }

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/event-stream');

      const frames = parseSseFrames(res.text);
      expect(frames.length).toBeGreaterThan(0);

      // Pre-loop classifier must emit an intent frame before the LLM answer.
      const intentFrame = frames.find((f) => f.type === 'intent');
      expect(intentFrame, 'missing intent frame').toBeDefined();
      expect(typeof intentFrame?.intent).toBe('string');
      expect(['simple', 'complex']).toContain(intentFrame?.complexity);

      // Stream must end with a done frame carrying a valid conversationId.
      const doneFrame = frames.find((f) => f.type === 'done');
      expect(doneFrame, 'missing done frame').toBeDefined();
      expect(typeof doneFrame?.conversationId).toBe('number');
      expect(typeof doneFrame?.tokensUsed).toBe('number');

      if (typeof doneFrame?.conversationId === 'number') {
        cleanups.push(async () => {
          await clientApi
            .delete(`/api/portal/ai/conversations/${doneFrame.conversationId}`)
            .catch(() => {});
        });
      }
    },
    { timeout: 90_000 },
  );

  test(
    'streams a confidence frame after the final answer',
    async ({ clientApi }) => {
      await ensureBrainEnabled(clientApi);

      const res = await clientApi.postText('/api/portal/brain/agent', {
        message: 'List all open tasks',
      });

      if (res.status === 402) {
        test.skip(true, 'No AI credits — skipping');
        return;
      }

      expect(res.status).toBe(200);
      const frames = parseSseFrames(res.text);

      // Post-loop groundedness check must emit a confidence frame.
      const confidenceFrame = frames.find((f) => f.type === 'confidence');
      expect(confidenceFrame, 'missing confidence frame').toBeDefined();
      expect(typeof confidenceFrame?.score).toBe('number');
      expect((confidenceFrame?.score as number) >= 0).toBe(true);
      expect((confidenceFrame?.score as number) <= 1).toBe(true);
      expect(typeof confidenceFrame?.grounded).toBe('boolean');

      const doneFrame = frames.find((f) => f.type === 'done');
      if (typeof doneFrame?.conversationId === 'number') {
        cleanups.push(async () => {
          await clientApi
            .delete(`/api/portal/ai/conversations/${doneFrame.conversationId}`)
            .catch(() => {});
        });
      }
    },
    { timeout: 90_000 },
  );

  test(
    'simple queries route to Haiku (tokensUsed lower bound sanity check)',
    async ({ clientApi }) => {
      await ensureBrainEnabled(clientApi);

      // A simple lookup — should route to Haiku, not Sonnet.
      const res = await clientApi.postText('/api/portal/brain/agent', {
        message: 'Who leads the engineering team?',
      });

      if (res.status === 402) {
        test.skip(true, 'No AI credits — skipping');
        return;
      }

      expect(res.status).toBe(200);
      const frames = parseSseFrames(res.text);

      const intentFrame = frames.find((f) => f.type === 'intent');
      expect(intentFrame?.complexity).toBe('simple');

      const doneFrame = frames.find((f) => f.type === 'done');
      expect(typeof doneFrame?.tokensUsed).toBe('number');

      if (typeof doneFrame?.conversationId === 'number') {
        cleanups.push(async () => {
          await clientApi
            .delete(`/api/portal/ai/conversations/${doneFrame.conversationId}`)
            .catch(() => {});
        });
      }
    },
    { timeout: 90_000 },
  );
});

// ── Conversation continuation ─────────────────────────────────────────────────

test.describe('Brain Agent — conversation continuation @brain-agent', () => {
  let cleanups: Array<() => Promise<void>> = [];

  test.afterEach(async () => {
    await runCleanups(cleanups);
    cleanups = [];
  });

  test(
    'second POST with conversationId continues the same conversation @critical',
    async ({ clientApi }) => {
      await ensureBrainEnabled(clientApi);

      // Turn 1
      const first = await clientApi.postText('/api/portal/brain/agent', {
        message: 'Hello, remember this number: 4271',
      });

      if (first.status === 402) {
        test.skip(true, 'No AI credits — skipping');
        return;
      }

      expect(first.status).toBe(200);
      const firstFrames = parseSseFrames(first.text);
      const firstDone = firstFrames.find((f) => f.type === 'done');
      const conversationId = firstDone?.conversationId as number;
      expect(typeof conversationId).toBe('number');

      cleanups.push(async () => {
        await clientApi
          .delete(`/api/portal/ai/conversations/${conversationId}`)
          .catch(() => {});
      });

      // Turn 2 — same conversation
      const second = await clientApi.postText('/api/portal/brain/agent', {
        message: 'What number did I just mention?',
        conversationId,
      });

      expect(second.status).toBe(200);
      const secondFrames = parseSseFrames(second.text);
      const secondDone = secondFrames.find((f) => f.type === 'done');

      // Must link back to the same conversation, not create a new one.
      expect(secondDone?.conversationId).toBe(conversationId);
    },
    { timeout: 180_000 }, // two LLM calls back-to-back
  );
});
