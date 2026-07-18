// OBQA-014: after Stripe Checkout, activate entitlements server-side instead
// of waiting for the webhook. Failure is deliberately swallowed — the webhook
// is the backstop, so callers advance regardless.
export function verifyCheckoutSession(sessionId: string | null): Promise<unknown> {
  if (!sessionId) return Promise.resolve(null);
  return fetch('/api/portal/billing/modules/verify-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  }).catch(() => null);
}
