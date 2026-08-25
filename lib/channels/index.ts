// Omnichannel public surface. Import from `@/lib/channels`, never from the
// per-file modules directly (matches the `@/lib/db/schema` barrel convention).

export * from './types';
export * from './capabilities';
export * from './idempotency';
export * from './policies';
export { ChannelGateway, type GatewayRepos, type EventSink, type GatewayDeps, type InboundResult, type SendResult } from './gateway';
export { createAdapterRegistry, pendingAdapters } from './adapters';
export { WebChatAdapter, type WebChatInboundPayload, type WebChatSendFn } from './adapters/webchat';
