// Capability detection: a static registry of what each provider supports, plus
// the runtime intersection helpers used by the gateway and the inbox UI. The
// adapter instances are the authoritative source at runtime; this table is the
// fallback used for capability checks before an adapter is loaded.

import type { ChannelAdapterKey, ChannelCapabilities } from './types';

const ALL: ChannelCapabilities = {
  supportsTemplates: true,
  supportsReadReceipts: true,
  supportsMedia: true,
  supportsReactions: true,
  supportsInteractiveMessages: true,
  supportsTyping: true,
  supports24HourWindow: true,
  supportsOutboundInitiate: true,
  requiresWebhookSignature: true,
};

/** Static capability table. Kept conservative: unknown = most-restrictive. */
export const PROVIDER_CAPABILITIES: Record<ChannelAdapterKey, ChannelCapabilities> = {
  'meta-whatsapp': {
    supportsTemplates: true,
    supportsReadReceipts: true,
    supportsMedia: true,
    supportsReactions: true,
    supportsInteractiveMessages: true,
    supportsTyping: true,
    supports24HourWindow: true,
    supportsOutboundInitiate: false, // requires a template outside the window
    requiresWebhookSignature: true,
  },
  'meta-instagram': {
    supportsTemplates: false,
    supportsReadReceipts: false,
    supportsMedia: true,
    supportsReactions: true,
    supportsInteractiveMessages: false,
    supportsTyping: true,
    supports24HourWindow: true,
    supportsOutboundInitiate: false,
    requiresWebhookSignature: true,
  },
  'meta-messenger': {
    supportsTemplates: false,
    supportsReadReceipts: true,
    supportsMedia: true,
    supportsReactions: true,
    supportsInteractiveMessages: true,
    supportsTyping: true,
    supports24HourWindow: true,
    supportsOutboundInitiate: false,
    requiresWebhookSignature: true,
  },
  webchat: {
    supportsTemplates: false,
    supportsReadReceipts: false,
    supportsMedia: true,
    supportsReactions: false,
    supportsInteractiveMessages: false,
    supportsTyping: true,
    supports24HourWindow: false,
    supportsOutboundInitiate: true,
    requiresWebhookSignature: false,
  },
  resend: {
    supportsTemplates: false,
    supportsReadReceipts: false,
    supportsMedia: true,
    supportsReactions: false,
    supportsInteractiveMessages: false,
    supportsTyping: false,
    supports24HourWindow: false,
    supportsOutboundInitiate: true,
    requiresWebhookSignature: false,
  },
  local: { ...ALL, requiresWebhookSignature: false },
};

/** Capability lookup with a safe fallback (everything false → most restricted). */
export function getCapabilities(key: ChannelAdapterKey): ChannelCapabilities {
  return (
    PROVIDER_CAPABILITIES[key] ?? {
      supportsTemplates: false,
      supportsReadReceipts: false,
      supportsMedia: false,
      supportsReactions: false,
      supportsInteractiveMessages: false,
      supportsTyping: false,
      supports24HourWindow: false,
      supportsOutboundInitiate: false,
      requiresWebhookSignature: true,
    }
  );
}

/** True when `adapter` supports every capability in `required`. */
export function supportsAll(
  adapter: ChannelCapabilities,
  required: Partial<ChannelCapabilities>,
): boolean {
  return Object.entries(required).every(([k, v]) => v === false || adapter[k as keyof ChannelCapabilities] === true);
}

export type { ChannelCapabilities };
