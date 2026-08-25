// WebChat adapter — reference implementation of the ChannelAdapter contract.
// WebChat has no external provider; inbound events are the already-normalized
// visitor messages from the widget, and outbound sends go to the widget's
// realtime stream. Because the existing widget persists through the chat API,
// this adapter is deliberately thin: it only normalizes payloads and hands
// sends to an injected sender.

import type {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelIdentity,
  MediaAttachment,
  NormalizedMessage,
  OutboundMessageRequest,
} from '../types';
import { getCapabilities } from '../capabilities';

export interface WebChatSendFn {
  (request: OutboundMessageRequest): Promise<{ externalMessageId: string }>;
}

/** Raw visitor message as the widget produces it. */
export interface WebChatInboundPayload {
  connectionId: number;
  conversationId?: number;
  externalConversationId?: string;
  externalMessageId?: string;
  visitorId?: string;
  text?: string;
  media?: MediaAttachment[];
  name?: string;
  receivedAt?: string;
}

export class WebChatAdapter implements ChannelAdapter {
  readonly key = 'webchat' as const;
  readonly capabilities: ChannelCapabilities;
  private readonly sendFn: WebChatSendFn;

  constructor(sendFn: WebChatSendFn) {
    this.capabilities = getCapabilities('webchat');
    this.sendFn = sendFn;
  }

  async receiveEvent(payload: unknown): Promise<NormalizedMessage[]> {
    const p = payload as WebChatInboundPayload;
    if (!p || typeof p !== 'object') return [];
    const identity: ChannelIdentity = { kind: 'webchat', value: p.visitorId ?? `visitor:${p.conversationId ?? 'unknown'}` };
    const message: NormalizedMessage = {
      channel: 'webchat',
      provider: 'webchat',
      connectionId: p.connectionId,
      externalConversationId: p.externalConversationId,
      externalMessageId: p.externalMessageId,
      direction: 'inbound',
      senderIdentity: identity,
      messageType: p.media?.length ? (p.media[0].type as NormalizedMessage['messageType']) : 'text',
      text: p.text ?? '',
      media: p.media,
      receivedAt: p.receivedAt ? new Date(p.receivedAt) : new Date(),
      metadata: { visitorId: p.visitorId },
    };
    return [message];
  }

  async sendMessage(request: OutboundMessageRequest): Promise<{ externalMessageId: string }> {
    return this.sendFn(request);
  }
}
