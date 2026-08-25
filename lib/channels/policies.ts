// ChannelPolicyEngine — deterministic provider/legal/business rules that gate
// every outbound send. The LLM never decides whether a message may be sent;
// it only decides content. This module answers the allow/deny question.

import type { ChannelAdapterKey, ChannelProvider, OutboundMessageRequest } from './types';
import { getCapabilities } from './capabilities';

export type PolicyDecision =
  | { allowed: true }
  | { allowed: false; reason: string; code: string };

export interface ConsentState {
  /** Most recent opt-in/opt-out for this contact + channel, or null if none. */
  status: 'opt_in' | 'opt_out' | null;
}

export interface PolicyContext {
  provider: ChannelAdapterKey;
  channel: ChannelProvider;
  request: OutboundMessageRequest;
  consent: ConsentState;
  /** Whether the message is a template/marketing send (vs. a reply in an active window). */
  isTemplate: boolean;
  /** True if the contact messaged us within the provider's reply window. */
  withinReplyWindow: boolean;
  /** Tenant business-hours check, evaluated by the caller against the tenant TZ. */
  withinBusinessHours: boolean;
  /** Tenant-level suppression (e.g. hard stop / do-not-contact list). */
  suppressed?: boolean;
  now?: Date;
}

const DENY = (reason: string, code: string): PolicyDecision => ({ allowed: false, reason, code });

/**
 * Evaluate every policy gate. Rules are provider-specific where the provider
 * has hard constraints (WhatsApp 24-hour window + template requirement) and
 * platform-wide elsewhere (opt-out, suppression, business hours for
 * cold/marketing sends).
 */
export function evaluatePolicy(ctx: PolicyContext): PolicyDecision {
  const caps = getCapabilities(ctx.provider);

  // 1. Opt-out is absolute across every channel.
  if (ctx.consent.status === 'opt_out') {
    return DENY('Contact has opted out of this channel', 'consent_opt_out');
  }

  // 2. Tenant hard suppression wins next.
  if (ctx.suppressed) {
    return DENY('Contact is suppressed for this tenant', 'suppressed');
  }

  // 3. Provider window + template rules.
  if (caps.supports24HourWindow && !ctx.withinReplyWindow) {
    // Outside the reply window, outbound is only allowed via an approved
    // template for providers that permit template-based outreach.
    if (!ctx.isTemplate || !caps.supportsTemplates) {
      return DENY(
        'Provider requires an approved template outside the reply window',
        'provider_window',
      );
    }
  }

  // 4. Business hours — only enforced for non-reply (cold/marketing) sends, so
  //    a live agent/assistant can always answer an active customer.
  if (!ctx.withinReplyWindow && !ctx.withinBusinessHours) {
    return DENY('Outside the tenant business hours', 'business_hours');
  }

  // 5. Message-type capability guard (media on a channel that can't send it).
  if (ctx.request.messageType !== 'text' && !caps.supportsMedia && ctx.request.media?.length) {
    return DENY('Channel does not support media messages', 'unsupported_media');
  }

  return { allowed: true };
}

/** WhatsApp-specific: whether a message outside the window needs a template. */
export function requiresTemplateOutsideWindow(provider: ChannelAdapterKey): boolean {
  const caps = getCapabilities(provider);
  return caps.supports24HourWindow && !caps.supportsOutboundInitiate && caps.supportsTemplates;
}
