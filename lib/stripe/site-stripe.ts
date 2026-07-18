// Per-site Stripe client resolver — picks between platform-managed Stripe
// Connect (default) and tenant-supplied BYOK keys based on `store_settings`.
//
// All Wave-3 call sites (checkout, refunds, webhooks, connection-test) go
// through `resolveSiteStripe(websiteId)` so the routing decision lives in
// exactly one place. Connect-mode callers continue to pass
// `application_fee_amount` + `transfer_data: { destination }` on a per-call
// basis; BYOK callers operate directly on the tenant's account so no
// application_fee plumbing is needed.

import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { storeSettings } from '@/lib/db/schema';
import { decryptApiKey } from '@/lib/crypto/api-key';
import { getStripeClient } from './index';

export type SiteStripeMode = 'connect' | 'byok';

export interface SiteStripeContext {
  /**
   * Stripe client bound to the right account. In `connect` mode this is the
   * shared platform client (`getStripeClient()`); in `byok` mode it's a fresh
   * `new Stripe(...)` instantiated with the tenant's decrypted secret key.
   */
  stripe: Stripe;
  mode: SiteStripeMode;
  /**
   * Row from `store_settings` — useful for callers that need other store
   * config (currency, tax, etc.) without an extra DB round-trip.
   */
  settings: typeof storeSettings.$inferSelect;
  /**
   * Connect mode only: the connected account id that money is routed to via
   * `transfer_data.destination`. Null in BYOK mode (tenant IS the account).
   * Also null in Connect mode if the tenant has not finished onboarding —
   * callers should check `settings.stripeOnboardingComplete` if they need to
   * differentiate "no account" from "account exists but not onboarded".
   */
  stripeAccountId: string | null;
  /**
   * Connect mode only: platform application fee in basis points (e.g. 500 =
   * 5%). Derived from `settings.platformFeePercent` (numeric string '5.00').
   * Null in BYOK mode (no platform cut) and null if the column is unset.
   */
  applicationFeeBps: number | null;
  /**
   * BYOK mode only: decrypted webhook signing secret for verifying inbound
   * Stripe webhooks for this tenant's endpoint. Null in Connect mode
   * (callers fall back to `STRIPE_ECOMMERCE_WEBHOOK_SECRET`). Null in BYOK
   * mode if no webhook secret is configured OR if decryption failed (a
   * console.warn is emitted in the decryption-failure case so the webhook
   * route can choose to 401 rather than silently accept unverified events).
   */
  webhookSecret: string | null;
}

/**
 * Typed error for resolver failures. The discriminating `code` field lets
 * route handlers map cleanly to envelopes / HTTP status codes without
 * inspecting message strings.
 */
export class SiteStripeError extends Error {
  constructor(
    public readonly code:
      | 'no_settings'
      | 'byok_no_key'
      | 'byok_decrypt_failed'
      | 'connect_not_onboarded'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'SiteStripeError';
  }
}

/**
 * Resolve the Stripe client + routing context for a given website.
 *
 * Throws `SiteStripeError` for resolver-fatal conditions:
 *   - `no_settings`         — no `store_settings` row exists for the website
 *   - `byok_no_key`         — BYOK mode is enabled but no secret key is stored
 *   - `byok_decrypt_failed` — secret key ciphertext present but decrypt threw
 *                             (typically a wrong/rotated `ENCRYPTION_KEY`)
 *
 * Does NOT throw `connect_not_onboarded` — Connect-mode callers can decide
 * whether a missing `stripeAccountId` should block their flow (some flows,
 * e.g. test connection or marketplace-wide reads, don't need it).
 */
export async function resolveSiteStripe(websiteId: number): Promise<SiteStripeContext> {
  const [settings] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, websiteId))
    .limit(1);

  if (!settings) {
    throw new SiteStripeError('no_settings', `No store_settings for websiteId ${websiteId}`);
  }

  if (settings.stripeMode === 'byok') {
    // Defensive: `stripeMode === 'byok'` should never be persisted while
    // `stripeByokAllowed === false`, but we don't throw here — the settings
    // PUT route is the source of truth for that invariant. If it's ever
    // violated we still resolve the BYOK client (the admin gate's job is
    // to prevent the misconfiguration upstream, not to break checkout).

    if (!settings.stripeSecretKeyEncrypted) {
      throw new SiteStripeError(
        'byok_no_key',
        'BYOK mode enabled but no Stripe secret key is configured',
      );
    }

    let secret: string;
    try {
      secret = decryptApiKey(settings.stripeSecretKeyEncrypted);
    } catch {
      throw new SiteStripeError(
        'byok_decrypt_failed',
        'Failed to decrypt Stripe secret key — check ENCRYPTION_KEY env',
      );
    }

    let webhookSecret: string | null = null;
    if (settings.stripeWebhookSecretEncrypted) {
      try {
        webhookSecret = decryptApiKey(settings.stripeWebhookSecretEncrypted);
      } catch {
        // Webhook-secret decrypt failure is non-fatal at resolve time —
        // surface as null + warning, let the webhook route 401.
        console.warn(
          `[site-stripe] Failed to decrypt webhook secret for websiteId=${websiteId}; ` +
            'webhook verification will fail until the secret is re-saved.',
        );
        webhookSecret = null;
      }
    }

    return {
      // New instance per call: SDK only does HTTP at method-call time, so
      // construction is cheap; caching by websiteId would require
      // invalidation on settings update which we don't currently have.
      stripe: new Stripe(secret),
      mode: 'byok',
      settings,
      stripeAccountId: null,
      applicationFeeBps: null,
      webhookSecret,
    };
  }

  // Connect mode (default). `platformFeePercent` is a Drizzle numeric column
  // → comes back as a string like '5.00'. Round-via-*100 converts
  // percent → basis points (500). Null column → null bps.
  const feeRaw = settings.platformFeePercent;
  const applicationFeeBps =
    feeRaw === null || feeRaw === undefined
      ? null
      : Math.round(parseFloat(feeRaw as unknown as string) * 100);

  return {
    stripe: getStripeClient(),
    mode: 'connect',
    settings,
    stripeAccountId: settings.stripeAccountId ?? null,
    applicationFeeBps,
    webhookSecret: null,
  };
}
