/**
 * Portal AI — Extras (sentinel)
 *
 * Documents the deliberate choice not to add tests for PATCH/DELETE on
 * /api/portal/ai/conversations/[id]: as of this writing the route only exports
 * GET (verified in app/api/portal/ai/conversations/[id]/route.ts). GET coverage
 * lives in portal-ai-chat.spec.ts. If PATCH / DELETE are added later, replace
 * the skip below with real tests for rename + delete + auth.
 */
import { test } from './setup/fixtures';

test.describe('Portal AI Conversation Detail — extras @ai', () => {
  test.skip('PATCH and DELETE not implemented on /ai/conversations/[id] — sentinel only', () => {
    // Intentionally empty. The route handler currently exports only GET.
    // Keep this file in the suite so the gap is discoverable in the spec list.
  });
});
