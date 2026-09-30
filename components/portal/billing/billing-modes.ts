// The four modes of the unified Billing view (PUX-137). Shared by the page
// (renders the mode), the settings layout (the active Billing tab cycles it),
// and the tests — one list, one cycle order, one parser.
//
// `?mode=` in the URL is the single source of truth: the page reads it
// reactively via useSearchParams (NOT read-once state, because the layout tab
// changes it from outside the page) and writes it with router.replace so a
// refresh keeps the mode and history doesn't fill with tab clicks.

export const BILLING_MODES = ['usage', 'plan', 'invoices', 'payment-methods'] as const;
export type BillingMode = (typeof BILLING_MODES)[number];
export const DEFAULT_BILLING_MODE: BillingMode = 'usage';

export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  usage: 'Usage',
  plan: 'Plan',
  invoices: 'Invoices',
  'payment-methods': 'Payment methods',
};

export const BILLING_PATH = '/portal/settings/billing';

/** Allowlist parse — anything unknown falls back to the default. */
export function parseBillingMode(v: string | null | undefined): BillingMode {
  return (BILLING_MODES as readonly string[]).includes(v ?? '') ? (v as BillingMode) : DEFAULT_BILLING_MODE;
}

/** Cycle order for the active Billing tab: usage → plan → invoices → payment-methods → usage. */
export function nextBillingMode(m: BillingMode): BillingMode {
  return BILLING_MODES[(BILLING_MODES.indexOf(m) + 1) % BILLING_MODES.length];
}

/** `/portal/settings/billing?mode=plan&highlight=crm` — keeps any extra params (highlight/status/session_id). */
export function billingModeHref(mode: BillingMode, extra?: URLSearchParams | Record<string, string>): string {
  const params = new URLSearchParams(extra instanceof URLSearchParams ? extra : (extra ?? {}));
  params.set('mode', mode);
  return `${BILLING_PATH}?${params.toString()}`;
}
