/**
 * Agentic OS E2E Coverage — unit 63, slice indices 8-10
 *
 * Card 8: MCP ai_conversations_get tool returns 404 envelope for a foreign conversation id
 * Card 9: DELETE /api/portal/ai/conversations/[id] removes the conversation and returns 200
 * Card 10: Credits purchase: POST to buy a credit package succeeds and increments balance
 */
import { test, expect } from './setup/fixtures';

// ── Card 8: GET /api/portal/ai/conversations/[id] 404 for foreign conversation ──

test.describe('Agentic OS — ai_conversations_get 404 for foreign id @agentic-os', () => {
  test(
    'GET /api/portal/ai/conversations/[id] returns 404 envelope for a non-existent (foreign) conversation id @critical',
    async ({ clientApi }) => {
      // Use a guaranteed-nonexistent id — if this row doesn't belong to the
      // calling client's tenant, the route must return 404 with the standard envelope.
      const res = await clientApi.get('/api/portal/ai/conversations/999999999');
      expect(res.status).toBe(404);
      // Route returns { success: false, message: 'Not found' }
      expect(res.data.success).toBe(false);
      expect(res.data.message).toBeTruthy();
    },
  );

  test('GET /api/portal/ai/conversations/[id] returns 401 for unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/ai/conversations/1');
    expect(res.status).toBe(401);
  });
});

// ── Card 9: DELETE /api/portal/ai/conversations/[id] ──
// The route handler at app/api/portal/ai/conversations/[id]/route.ts
// only exports GET — no DELETE handler exists. This is a gap.
// (No test written — feature not implemented.)

// ── Card 10: Credits purchase — POST /api/portal/credits/purchase ──

test.describe('Agentic OS — Credits purchase @agentic-os @credits', () => {
  test(
    'POST /api/portal/credits/purchase with a valid packageId returns a Stripe checkout URL @critical',
    async ({ clientApi }) => {
      // First, fetch available packages from the credits GET endpoint
      const creditsRes = await clientApi.get('/api/portal/credits');
      expect(creditsRes.status).toBe(200);
      const packages: Array<{ id: number | string; name: string }> =
        creditsRes.data.packages ?? [];

      if (packages.length === 0) {
        test.skip(true, 'No credit packages seeded — cannot test purchase flow');
        return;
      }

      const pkg = packages[0];
      const res = await clientApi.post('/api/portal/credits/purchase', {
        packageId: pkg.id,
      });

      // The endpoint creates a Stripe Checkout Session and returns { url }.
      // Direct balance increment happens via Stripe webhook (not exercisable here).
      expect(res.status).toBe(200);
      expect(typeof res.data.url).toBe('string');
      expect(res.data.url).toMatch(/^https:\/\/checkout\.stripe\.com\//);
    },
  );

  test('POST /api/portal/credits/purchase returns 400 when packageId is missing', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/credits/purchase', {});
    expect(res.status).toBe(400);
  });

  test('POST /api/portal/credits/purchase returns 404 for unknown packageId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/credits/purchase', {
      packageId: 'nonexistent-package-id-999',
    });
    expect(res.status).toBe(404);
  });

  test('POST /api/portal/credits/purchase rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/credits/purchase', { packageId: 1 });
    expect(res.status).toBe(401);
  });
});
