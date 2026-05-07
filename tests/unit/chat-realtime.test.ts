import { describe, it, expect, beforeEach, vi } from 'vitest';

// Stub postgres-js BEFORE importing the realtime module so the cached
// listener client uses our spy instead of a real Postgres connection.
//
// Typed loosely on purpose — vi.fn(() => …) infers the parameter list as
// `[]`, which makes mock.calls[0][0] a `never` access. We coerce to
// `(...args: unknown[]) => unknown` so the test can introspect the args.
type AnyFn = (...args: unknown[]) => unknown;
const notifySpy = vi.fn<AnyFn>(async () => undefined);
const listenSpy = vi.fn<AnyFn>(() => Promise.resolve({ unlisten: vi.fn<AnyFn>(async () => undefined) }));

vi.mock('postgres', () => {
  // Default export is a factory: postgres(url, opts) → sql client.
  return {
    default: vi.fn(() => ({
      notify: notifySpy,
      listen: listenSpy,
    })),
  };
});

// Lazy-imported after the mock is registered.
let realtime: typeof import('@/lib/chat/realtime');

describe('chat realtime publishers', () => {
  beforeEach(async () => {
    notifySpy.mockClear();
    listenSpy.mockClear();
    process.env.DATABASE_URL = 'postgres://stub@localhost/stub';
    vi.resetModules();
    realtime = await import('@/lib/chat/realtime');
    realtime.__resetForTesting();
  });

  it('builds the per-conversation channel name', () => {
    expect(realtime.conversationChannel(42)).toBe('chat_conv_42');
    expect(realtime.inboxChannel(7)).toBe('chat_inbox_7');
  });

  it('rejects invalid ids in channel naming', () => {
    expect(() => realtime.conversationChannel(0)).toThrow();
    expect(() => realtime.conversationChannel(-1)).toThrow();
    expect(() => realtime.conversationChannel(1.5)).toThrow();
    expect(() => realtime.inboxChannel(Number.NaN)).toThrow();
  });

  it('publishMessage notifies BOTH the conversation and inbox channels', async () => {
    await realtime.publishMessage(11, 22, {
      id: 1001,
      conversationId: 11,
      authorKind: 'visitor',
      authorName: 'Visitor',
      body: 'Hello',
      occurredAt: new Date('2025-01-01T00:00:00Z'),
    });

    expect(notifySpy).toHaveBeenCalledTimes(2);
    const channels = notifySpy.mock.calls.map((c) => c[0]).sort();
    expect(channels).toEqual(['chat_conv_11', 'chat_inbox_22']);

    const payload = JSON.parse(notifySpy.mock.calls[0][1] as string);
    expect(payload.kind).toBe('message');
    expect(payload.data.id).toBe(1001);
    expect(payload.data.body).toBe('Hello');
    expect(typeof payload.eventId).toBe('string');
    expect(payload.eventId.length).toBeGreaterThan(4);
  });

  it('publishConversationUpdate notifies only the inbox channel', async () => {
    await realtime.publishConversationUpdate(33, {
      conversationId: 99,
      status: 'assigned',
      assignedUserId: 12,
      visitorName: 'Anon',
      lastMessageAt: new Date('2025-01-01T00:00:00Z'),
      kind: 'updated',
    });

    expect(notifySpy).toHaveBeenCalledTimes(1);
    const [channel, raw] = notifySpy.mock.calls[0];
    expect(channel).toBe('chat_inbox_33');
    const payload = JSON.parse(raw as string);
    expect(payload.kind).toBe('conversation');
    expect(payload.data.status).toBe('assigned');
    expect(payload.data.assignedUserId).toBe(12);
    expect(payload.data.lastMessageAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('subscribeChannel registers a LISTEN and forwards parsed payloads', async () => {
    let captured: unknown = null;
    const sub = realtime.subscribeChannel('chat_conv_5', (p) => {
      captured = p;
    });
    await sub.ready;
    expect(listenSpy).toHaveBeenCalledTimes(1);
    expect(listenSpy.mock.calls[0][0]).toBe('chat_conv_5');

    // Pull the callback the realtime layer registered and feed it a payload.
    const handler = listenSpy.mock.calls[0][1] as (raw: string) => void;
    handler(JSON.stringify({ kind: 'message', eventId: 'x', occurredAt: 'now', data: { id: 1 } }));
    expect(captured).toMatchObject({ kind: 'message', data: { id: 1 } });

    // Malformed payloads must NOT throw — they're silently dropped.
    expect(() => handler('not-json')).not.toThrow();
  });
});
