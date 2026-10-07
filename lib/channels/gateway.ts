// ChannelGateway — the single choke point between providers and the platform.
//
// Responsibilities (per spec):
//   identify tenant · identify connection · normalize messages · idempotency ·
//   resolve contact · resolve conversation · persist message · dispatch events ·
//   send response · handle errors · respect provider policies.
//
// Upper layers (agents, sequences, inbox) call this module; they never call
// Meta/Instagram/Facebook/Resend directly. The gateway is dependency-injected
// so it is fully unit-testable without a database or live provider.

import type {
  ChannelAdapter,
  ChannelAdapterKey,
  ChannelConnectionRef,
  ContactRef,
  ConversationRef,
  MessageRef,
  NormalizedMessage,
  OutboundMessageRequest,
} from './types';
import type { ConsentState } from './policies';
import { evaluatePolicy } from './policies';

// ─── Repository seam (implemented by lib/db consumers, mocked in tests) ──────

export interface GatewayRepos {
  /** Resolve a connection by id — the tenant (clientId) is derived from it, never trusted from the request. */
  findConnectionById(connectionId: number): Promise<ChannelConnectionRef | null>;
  findContactByIdentity(clientId: number, identity: { kind: string; value: string }): Promise<ContactRef | null>;
  createContact(
    clientId: number,
    identity: { kind: string; value: string },
    opts?: { name?: string },
  ): Promise<ContactRef>;
  linkIdentity(clientId: number, contactId: number, identity: { kind: string; value: string }): Promise<void>;
  findConversationByExternal(connectionId: number, externalConversationId: string): Promise<ConversationRef | null>;
  findOpenConversationByContact(clientId: number, contactId: number, channel: string): Promise<ConversationRef | null>;
  createConversation(input: {
    clientId: number;
    channel: string;
    provider: string;
    connectionId: number | null;
    contactId: number | null;
    externalConversationId: string | null;
  }): Promise<ConversationRef>;
  messageExists(connectionId: number, externalMessageId: string): Promise<boolean>;
  persistMessage(input: {
    conversationId: number;
    clientId: number;
    channel: string;
    provider: string;
    connectionId: number | null;
    contactId?: number | null;
    direction: 'inbound' | 'outbound';
    externalMessageId: string | null;
    authorKind: 'visitor' | 'agent' | 'system';
    body: string;
    messageType: string;
    media?: unknown[];
    senderIdentity?: { kind: string; value: string } | null;
    recipientIdentity?: { kind: string; value: string } | null;
    receivedAt?: Date | null;
  }): Promise<MessageRef>;
  getConsent(contactId: number, channel: string): Promise<ConsentState>;
  enqueueOutbox(input: {
    clientId: number;
    connectionId: number;
    conversationId?: number;
    contactId?: number;
    channel: string;
    provider: string;
    recipientIdentity: { kind: string; value: string };
    messageType: string;
    body?: string;
    media?: unknown[];
    idempotencyKey?: string;
  }): Promise<{ id: number; externalMessageId: string; status?: string; claimed?: boolean }>;
  markSent(input: { id: number; externalMessageId: string; sentAt: Date }): Promise<void>;
  markFailed(input: { id: number; error: string; errorCode?: string }): Promise<void>;
}

export interface EventSink {
  emit(type: string, payload: Record<string, unknown>): void;
}

export interface GatewayDeps {
  adapters: { get(key: ChannelAdapterKey): ChannelAdapter | null };
  repos: GatewayRepos;
  events?: EventSink;
  policy?: typeof evaluatePolicy;
  /** Injected clock for deterministic tests. */
  now?: () => Date;
}

// ─── Results ──────────────────────────────────────────────────────────────────

export interface InboundResult {
  status: 'created' | 'duplicate' | 'error';
  conversation?: ConversationRef;
  message?: MessageRef;
  contact?: ContactRef;
  error?: string;
}

export interface SendResult {
  status: 'sent' | 'queued' | 'denied' | 'error';
  reason?: string;
  code?: string;
  externalMessageId?: string;
  outboxId?: number;
}

const noEvents: EventSink = { emit: () => {} };

const adapterChannels: Record<ChannelAdapterKey, ChannelConnectionRef['provider'] | null> = {
  'meta-whatsapp': 'whatsapp', 'meta-instagram': 'instagram', 'meta-messenger': 'messenger',
  webchat: 'webchat', resend: 'email', local: null,
};

// ─── Gateway ──────────────────────────────────────────────────────────────────

export class ChannelGateway {
  private readonly deps: GatewayDeps;

  constructor(deps: GatewayDeps) {
    this.deps = deps;
  }

  private events(): EventSink {
    return this.deps.events ?? noEvents;
  }

  private policy() {
    return this.deps.policy ?? evaluatePolicy;
  }

  /**
   * Process one normalized inbound message end-to-end. Idempotent on
   * (connectionId, externalMessageId): a duplicate returns `duplicate` and
   * performs no writes.
   */
  async processInbound(message: NormalizedMessage): Promise<InboundResult> {
    const { repos } = this.deps;
    try {
      const connectionId = message.connectionId;
      if (!connectionId) {
        return { status: 'error', error: 'inbound message has no connectionId' };
      }

      // Idempotency first — no contact/conversation/message writes for a dupe.
      if (message.externalMessageId) {
        const exists = await repos.messageExists(connectionId, message.externalMessageId);
        if (exists) return { status: 'duplicate' };
      }

      const connection = await repos.findConnectionById(connectionId);
      if (!connection) {
        return { status: 'error', error: 'connection not found' };
      }
      const clientId = connection.clientId;

      // Resolve (or create) the CRM contact from the sender identity.
      const identity = message.senderIdentity;
      let contact = await repos.findContactByIdentity(clientId, identity);
      if (!contact) {
        contact = await repos.createContact(clientId, identity);
        await repos.linkIdentity(clientId, contact.id, identity);
      }

      // Resolve (or create) the conversation.
      let conversation: ConversationRef | null = null;
      if (message.externalConversationId) {
        conversation = await repos.findConversationByExternal(connectionId, message.externalConversationId);
      }
      if (!conversation) {
        conversation = await repos.findOpenConversationByContact(clientId, contact.id, message.channel);
      }
      if (!conversation) {
        conversation = await repos.createConversation({
          clientId,
          channel: message.channel,
          provider: message.provider,
          connectionId,
          contactId: contact.id,
          externalConversationId: message.externalConversationId ?? null,
        });
        this.events().emit('conversation.created', {
          clientId,
          conversationId: conversation.id,
          contactId: contact.id,
          channel: message.channel,
        });
      }

      // Persist the normalized message.
      const persisted = await repos.persistMessage({
        conversationId: conversation.id,
        clientId,
        channel: message.channel,
        provider: message.provider,
        connectionId,
        contactId: contact.id,
        direction: message.direction,
        externalMessageId: message.externalMessageId ?? null,
        authorKind: message.direction === 'inbound' ? 'visitor' : 'agent',
        body: message.text ?? '',
        messageType: message.messageType,
        media: message.media,
        senderIdentity: message.senderIdentity,
        recipientIdentity: message.recipientIdentity ?? null,
        receivedAt: message.receivedAt ?? this.deps.now?.() ?? new Date(),
      });

      this.events().emit('channel.message.received', {
        clientId,
        conversationId: conversation.id,
        contactId: contact.id,
        channel: message.channel,
        provider: message.provider,
        messageId: persisted.id,
        externalMessageId: message.externalMessageId ?? null,
      });

      return { status: 'created', conversation, message: persisted, contact };
    } catch (err) {
      return {
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /**
   * Send an outbound message. Policy is evaluated FIRST; a denied send performs
   * no writes and returns `denied`. Allowed sends are enqueued to the outbox
   * (durable + idempotent) and dispatched through the adapter.
   */
  async send(request: OutboundMessageRequest): Promise<SendResult> {
    const { repos } = this.deps;
    try {
      const connection = await repos.findConnectionById(request.connectionId);
      if (!connection) return { status: 'error', reason: 'connection not found' };
      if (request.channel !== connection.provider ||
          (adapterChannels[request.provider] !== null && adapterChannels[request.provider] !== connection.provider)) {
        return { status: 'error', reason: 'Outbound provider/channel does not match connection' };
      }

      // Contact consent is required for the policy gate.
      let consent: ConsentState = { status: null };
      if (request.contactId) {
        consent = await repos.getConsent(request.contactId, request.channel);
      }

      const decision = this.policy()({
        provider: request.provider,
        channel: request.channel,
        request,
        consent,
        isTemplate: request.messageType === 'template' || Boolean(request.templateName),
        withinReplyWindow: request.withinReplyWindow ?? false,
        withinBusinessHours: request.withinBusinessHours ?? true,
      });

      if (!decision.allowed) {
        return { status: 'denied', reason: decision.reason, code: decision.code };
      }

      const enqueued = await repos.enqueueOutbox({
        clientId: connection.clientId,
        connectionId: request.connectionId,
        conversationId: request.conversationId,
        contactId: request.contactId,
        channel: request.channel,
        provider: request.provider,
        recipientIdentity: request.recipientIdentity,
        messageType: request.messageType,
        body: request.text,
        media: request.media,
        idempotencyKey: request.idempotencyKey,
      });

      if (enqueued.status === 'sent') {
        return { status: 'sent', externalMessageId: enqueued.externalMessageId, outboxId: enqueued.id };
      }
      if (enqueued.claimed === false) return { status: 'queued', outboxId: enqueued.id };

      const adapter = this.deps.adapters.get(request.provider);
      if (!adapter) {
        await repos.markFailed({ id: enqueued.id, error: 'no adapter registered' });
        return { status: 'error', reason: 'no adapter registered' };
      }

      try {
        const sent = await adapter.sendMessage(request);
        await repos.markSent({
          id: enqueued.id,
          externalMessageId: sent.externalMessageId,
          sentAt: this.deps.now?.() ?? new Date(),
        });
        this.events().emit('channel.message.sent', {
          clientId: connection.clientId,
          conversationId: request.conversationId ?? null,
          channel: request.channel,
          externalMessageId: sent.externalMessageId,
        });
        return { status: 'sent', externalMessageId: sent.externalMessageId, outboxId: enqueued.id };
      } catch (err) {
        await repos.markFailed({
          id: enqueued.id,
          error: err instanceof Error ? err.message : String(err),
        });
        return { status: 'error', reason: err instanceof Error ? err.message : String(err), outboxId: enqueued.id };
      }
    } catch (err) {
      return { status: 'error', reason: err instanceof Error ? err.message : String(err) };
    }
  }
}
