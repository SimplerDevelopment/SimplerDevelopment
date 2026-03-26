/**
 * Portal AI Chat API E2E Tests
 *
 * Tests for /api/portal/ai/conversations
 * Note: POST /ai/conversations (chat) requires a real AI API key, so we test
 * the conversation listing and detail endpoints, and validate chat rejects bad input.
 */
import { test, expect } from './setup/fixtures';

test.describe('Portal AI Conversations @ai @critical', () => {
  test('GET /ai/conversations lists client conversations', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/ai/conversations');
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(Array.isArray(res.data.data)).toBe(true);
  });

  test('GET /ai/conversations rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/ai/conversations');
    expect(res.status).toBe(401);
  });

  test('GET /ai/conversations/:id returns 404 for non-existent conversation', async ({ clientApi }) => {
    const res = await clientApi.get('/api/portal/ai/conversations/999999');
    expect(res.status).toBe(404);
  });

  test('POST /ai/conversations rejects empty message', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/ai/conversations', {
      message: '',
    });
    expect(res.status).toBe(400);
    expect(res.data.success).toBe(false);
  });

  test('POST /ai/conversations rejects staff users', async ({ adminApi }) => {
    const res = await adminApi.post('/api/portal/ai/conversations', {
      message: 'Hello from admin',
    });
    expect(res.status).toBe(403);
  });

  test('POST /ai/conversations rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.post('/api/portal/ai/conversations', {
      message: 'Hello',
    });
    expect(res.status).toBe(401);
  });

  test('POST /ai/conversations rejects invalid conversationId', async ({ clientApi }) => {
    const res = await clientApi.post('/api/portal/ai/conversations', {
      message: 'Hello',
      conversationId: 999999,
    });
    expect(res.status).toBe(404);
  });
});

test.describe('Portal AI Conversation Detail @ai', () => {
  test('GET /ai/conversations/:id returns conversation with messages if exists', async ({ clientApi }) => {
    // List conversations first to find an existing one
    const list = await clientApi.get('/api/portal/ai/conversations');
    if (!list.data.data?.length) {
      test.skip(); // no conversations exist
      return;
    }

    const conversationId = list.data.data[0].id;
    const res = await clientApi.get(`/api/portal/ai/conversations/${conversationId}`);
    expect(res.status).toBe(200);
    expect(res.data.success).toBe(true);
    expect(res.data.data).toHaveProperty('conversation');
    expect(res.data.data).toHaveProperty('messages');
    expect(res.data.data.conversation.id).toBe(conversationId);
    expect(Array.isArray(res.data.data.messages)).toBe(true);
  });

  test('GET /ai/conversations/:id rejects unauthenticated', async ({ unauthApi }) => {
    const res = await unauthApi.get('/api/portal/ai/conversations/1');
    expect(res.status).toBe(401);
  });
});
