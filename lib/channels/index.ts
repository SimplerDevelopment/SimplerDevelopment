// Omnichannel public surface. Import from `@/lib/channels`, never from the
// per-file modules directly (matches the `@/lib/db/schema` barrel convention).

export * from './types';
export * from './capabilities';
export * from './idempotency';
export * from './policies';
export { ChannelGateway, type GatewayRepos, type EventSink, type GatewayDeps, type InboundResult, type SendResult } from './gateway';
export { createAdapterRegistry, pendingAdapters } from './adapters';
export { WebChatAdapter, type WebChatInboundPayload, type WebChatSendFn } from './adapters/webchat';
// NOTE: repos-db and webchat-flow are server-only (they open the Drizzle
// client on import) and are intentionally NOT re-exported here — the unit
// suite imports this barrel without a DATABASE_URL. Import them directly
// from '@/lib/channels/repos-db' / '@/lib/channels/webchat-flow'.
