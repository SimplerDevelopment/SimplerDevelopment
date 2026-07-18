/**
 * Pure state-machine helpers for contract e-signature status.
 *
 * Status values: 'not_sent' | 'sent' | 'viewed' | 'signed' | 'declined' | 'canceled'.
 *
 * These helpers are unit-testable in isolation (no DB / no env) and are
 * the single source of truth for "is this transition allowed". The API
 * routes import them rather than hand-coding the rules in each handler.
 */

export type EsignStatus =
  | 'not_sent'
  | 'sent'
  | 'viewed'
  | 'signed'
  | 'declined'
  | 'canceled';

export type EsignAction = 'send' | 'view' | 'sign' | 'decline' | 'cancel' | 'resend';

const TERMINAL: ReadonlySet<EsignStatus> = new Set(['signed', 'declined', 'canceled']);

export function isTerminal(status: EsignStatus | null | undefined): boolean {
  if (!status) return false;
  return TERMINAL.has(status);
}

export function canSend(status: EsignStatus | null | undefined): boolean {
  // First send (not_sent) or re-send after a non-success terminal state.
  return !status || status === 'not_sent' || status === 'declined' || status === 'canceled';
}

export function canSign(status: EsignStatus | null | undefined): boolean {
  return status === 'sent' || status === 'viewed';
}

export function canCancel(status: EsignStatus | null | undefined): boolean {
  return status === 'sent' || status === 'viewed';
}

/**
 * Apply a webhook event to a status. Returns the new status (which may
 * equal the previous status — webhooks can be idempotent or replayed).
 *
 * Critical invariant: only webhooks can promote 'sent'/'viewed' → 'signed'.
 * The send route never sets 'signed' directly. The cancel route sets
 * 'canceled' immediately (we don't wait for the provider's cancel-webhook).
 */
export function applyWebhookEvent(
  current: EsignStatus | null | undefined,
  eventType: string,
  isComplete: boolean,
): EsignStatus {
  const status: EsignStatus = current ?? 'not_sent';
  // Terminal states are sticky. Re-deliveries don't re-open them.
  if (TERMINAL.has(status)) return status;

  switch (eventType) {
    case 'signature_request_viewed':
      return status === 'sent' ? 'viewed' : status;
    case 'signature_request_signed':
      return isComplete ? 'signed' : status;
    case 'signature_request_all_signed':
      return 'signed';
    case 'signature_request_declined':
      return 'declined';
    case 'signature_request_canceled':
      return 'canceled';
    default:
      return status;
  }
}
