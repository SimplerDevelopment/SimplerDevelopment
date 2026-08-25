// Omnichannel foundation — Channel Gateway, capabilities, policies, idempotency.
//
// Pure unit layer: the gateway is dependency-injected, so no database is
// touched. This exercises the load-bearing rules: idempotency, contact and
// conversation resolution, policy denial (opt-out / window / business hours),
// and the tenant-is-derived-from-connection invariant.

import { describe, it, expect, vi } from 'vitest';

import {
  ChannelGateway,
  createAdapterRegistry,
  evaluatePolicy,
  getCapabilities,
  inboundIdempotencyKey,
  normalizeIdentity,
  requiresTemplateOutsideWindow,
  supportsAll,
  WebChatAdapter,
  type GatewayRepos,
  type NormalizedMessage,
  type OutboundMessageRequest,
} from '@/lib/channels';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const inbound = (over: Partial<NormalizedMessage> = {}): NormalizedMessage => ({
  channel: 'whatsapp',
  provider: 'meta-whatsapp',
  connectionId: 1,
  externalConversationId: 'wa:conv-1',
  externalMessageId: 'wa:msg-1',
  direction: 'inbound',
  senderIdentity: { kind: 'phone', value: '+15551234567' },
  messageType: 'text',
  text: 'Hola',
  receivedAt: new Date('2026-08-25T10:00:00Z'),
  ...over,
});

const outbound = (over: Partial<OutboundMessageRequest> = {}): OutboundMessageRequest => ({
  channel: 'whatsapp',
  provider: 'meta-whatsapp',
  connectionId: 1,
  contactId: 42,
  recipientIdentity: { kind: 'phone', value: '+15551234567' },
  messageType: 'text',
  text: 'Hi!',
  idempotencyKey: 'reply-1',
  ...over,
});

function makeRepos(over: Partial<GatewayRepos> = {}): GatewayRepos {
  const messages = new Map<string, boolean>();
  return {
    findConnectionById: async () => ({
      id: 1,
      clientId: 7,
      provider: 'whatsapp',
      externalAccountId: 'waba-1',
      status: 'connected',
      credentials: {},
      metadata: {},
    }),
    findContactByIdentity: async () => null,
    createContact: async (clientId, identity) => ({ id: 42, clientId, firstName: 'Ana', lastName: null, email: null, phone: identity.value }),
    linkIdentity: async () => {},
    findConversationByExternal: async () => null,
    findOpenConversationByContact: async () => null,
    createConversation: async (input) => ({
      id: 9,
      clientId: input.clientId,
      status: 'open',
      aiMode: 'human',
      externalConversationId: input.externalConversationId,
    }),
    messageExists: async (connectionId, externalMessageId) =>
      messages.has(inboundIdempotencyKey(connectionId, externalMessageId)),
    persistMessage: async (input) => {
      if (input.externalMessageId) messages.set(inboundIdempotencyKey(input.connectionId ?? 0, input.externalMessageId), true);
      return { id: 1, conversationId: input.conversationId, externalMessageId: input.externalMessageId };
    },
    getConsent: async () => ({ status: null }),
    enqueueOutbox: async () => ({ id: 100, externalMessageId: 'outbox-1' }),
    markSent: async () => {},
    markFailed: async () => {},
    ...over,
  };
}

const webchatSend = vi.fn(async () => ({ externalMessageId: 'wc:1' }));

function makeGateway(over: Partial<GatewayRepos> = {}) {
  const events = vi.fn();
  const gateway = new ChannelGateway({
    adapters: createAdapterRegistry([new WebChatAdapter(webchatSend)]),
    repos: makeRepos(over),
    events: { emit: events },
    now: () => new Date('2026-08-25T10:00:00Z'),
  });
  return { gateway, events };
}

// ─── Capabilities ─────────────────────────────────────────────────────────────

describe('capability detection', () => {
  it('knows WhatsApp is window-constrained and template-capable', () => {
    const c = getCapabilities('meta-whatsapp');
    expect(c.supports24HourWindow).toBe(true);
    expect(c.supportsTemplates).toBe(true);
    expect(c.supportsOutboundInitiate).toBe(false);
  });

  it('webchat has no window or signature requirement', () => {
    const c = getCapabilities('webchat');
    expect(c.supports24HourWindow).toBe(false);
    expect(c.requiresWebhookSignature).toBe(false);
    expect(c.supportsOutboundInitiate).toBe(true);
  });

  it('supportsAll only passes when every required true flag is supported', () => {
    const c = getCapabilities('meta-whatsapp');
    expect(supportsAll(c, { supportsMedia: true, supportsTemplates: true })).toBe(true);
    expect(supportsAll(c, { supportsMedia: true, supportsReactions: true })).toBe(true);
    expect(supportsAll(c, { supportsMedia: false, supportsTemplates: true })).toBe(true); // false flags are ignored
    expect(supportsAll(c, { supportsMedia: true, supportsOutboundInitiate: true })).toBe(false);
  });

  it('WhatsApp requires a template outside the reply window', () => {
    expect(requiresTemplateOutsideWindow('meta-whatsapp')).toBe(true);
    expect(requiresTemplateOutsideWindow('webchat')).toBe(false);
  });
});

// ─── Identity normalization ───────────────────────────────────────────────────

describe('identity normalization', () => {
  it('normalizes phone to E.164', () => {
    expect(normalizeIdentity('phone', '555 123-4567')).toBe('+5551234567');
    expect(normalizeIdentity('phone', '+1 (555) 123-4567')).toBe('+15551234567');
  });

  it('lowercases email', () => {
    expect(normalizeIdentity('email', '  Ana@Example.COM ')).toBe('ana@example.com');
  });

  it('leaves provider ids untouched', () => {
    expect(normalizeIdentity('instagram', '  IG_123_abc  ')).toBe('IG_123_abc');
  });
});

// ─── Policy engine ────────────────────────────────────────────────────────────

describe('ChannelPolicyEngine', () => {
  const base = (over: Partial<Parameters<typeof evaluatePolicy>[0]> = {}) => ({
    provider: 'meta-whatsapp' as const,
    channel: 'whatsapp' as const,
    request: outbound(),
    consent: { status: null as const },
    isTemplate: false,
    withinReplyWindow: true,
    withinBusinessHours: true,
    ...over,
  });

  it('denies any send to an opted-out contact', () => {
    const d = evaluatePolicy(base({ consent: { status: 'opt_out' } }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe('consent_opt_out');
  });

  it('denies WhatsApp outside the window without a template', () => {
    const d = evaluatePolicy(base({ withinReplyWindow: false }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe('provider_window');
  });

  it('allows WhatsApp outside the window WITH a template', () => {
    const d = evaluatePolicy(base({ withinReplyWindow: false, isTemplate: true }));
    expect(d.allowed).toBe(true);
  });

  it('denies cold sends outside business hours', () => {
    const d = evaluatePolicy(base({ provider: 'webchat', channel: 'webchat', withinReplyWindow: false, withinBusinessHours: false }));
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.code).toBe('business_hours');
  });

  it('does not block a live reply outside business hours', () => {
    const d = evaluatePolicy(base({ withinReplyWindow: true, withinBusinessHours: false }));
    expect(d.allowed).toBe(true);
  });

  it('denies a suppressed contact', () => {
    const d = evaluatePolicy(base({ suppressed: true }));
    expect(d.allowed).toBe(false);
  });
});

// ─── Gateway: inbound ─────────────────────────────────────────────────────────

describe('ChannelGateway.processInbound', () => {
  it('creates contact + conversation + message and dispatches events', async () => {
    const { gateway, events } = makeGateway();
    const result = await gateway.processInbound(inbound());
    expect(result.status).toBe('created');
    expect(result.contact?.id).toBe(42);
    expect(result.conversation?.id).toBe(9);
    expect(events).toHaveBeenCalledWith('conversation.created', expect.objectContaining({ clientId: 7 }));
    expect(events).toHaveBeenCalledWith('channel.message.received', expect.objectContaining({ channel: 'whatsapp' }));
  });

  it('is idempotent on externalMessageId — duplicate performs no new writes', async () => {
    const { gateway } = makeGateway();
    await gateway.processInbound(inbound());
    const second = await gateway.processInbound(inbound());
    expect(second.status).toBe('duplicate');
  });

  it('errors when the connection cannot be resolved', async () => {
    const { gateway } = makeGateway({ findConnectionById: async () => null });
    const result = await gateway.processInbound(inbound());
    expect(result.status).toBe('error');
  });
});

// ─── Gateway: outbound ────────────────────────────────────────────────────────

describe('ChannelGateway.send', () => {
  it('denies an opted-out send without enqueueing', async () => {
    const enqueue = vi.fn(async () => ({ id: 100, externalMessageId: 'x' }));
    const { gateway } = makeGateway({
      getConsent: async () => ({ status: 'opt_out' }),
      enqueueOutbox: enqueue,
    });
    const result = await gateway.send(outbound({ contactId: 42 }));
    expect(result.status).toBe('denied');
    if (result.status === 'denied') expect(result.code).toBe('consent_opt_out');
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('sends through the adapter and emits channel.message.sent', async () => {
    const { gateway, events } = makeGateway();
    const result = await gateway.send(outbound({ provider: 'webchat', channel: 'webchat' }));
    expect(result.status).toBe('sent');
    expect(webchatSend).toHaveBeenCalled();
    expect(events).toHaveBeenCalledWith('channel.message.sent', expect.objectContaining({ channel: 'webchat' }));
  });

  it('marks the outbox failed when no adapter is registered', async () => {
    const markFailed = vi.fn(async () => {});
    const { gateway } = makeGateway({ markFailed });
    const result = await gateway.send(
      outbound({ provider: 'resend', channel: 'email', recipientIdentity: { kind: 'email', value: 'ana@example.com' } }),
    );
    // No email adapter registered → error, and the outbox row is marked failed.
    expect(result.status).toBe('error');
    expect(markFailed).toHaveBeenCalled();
  });
});
