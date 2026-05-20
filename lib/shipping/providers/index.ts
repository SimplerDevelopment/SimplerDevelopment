// Public entrypoint for shipping providers.
//
// Callers should import only from `@/lib/shipping/providers` — never reach
// inside to `easypost.ts`. That keeps the contract narrow so we can add /
// swap providers later without touching the storefront, admin, or webhook
// routes.

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { storeSettings } from '@/lib/db/schema';
import { decryptApiKey } from '@/lib/crypto/api-key';
import type { CarrierProvider } from './types';
import { EasyPostProvider } from './easypost';

export type {
  Address,
  Parcel,
  RateQuote,
  BuyLabelResult,
  ParsedWebhookEvent,
  GetRatesInput,
  CarrierProvider,
  TrackingStatus,
} from './types';
export { CarrierProviderError } from './types';
export { EasyPostProvider } from './easypost';

/**
 * Resolve the active shipping provider for a website.
 *
 * Returns `null` when the website has no `store_settings` row, or the
 * provider is not `easypost`, or no API key is configured — callers must
 * treat `null` as "fall back to manual zone-based rates".
 */
export async function resolveProvider(
  websiteId: number,
): Promise<{ provider: CarrierProvider; settings: typeof storeSettings.$inferSelect } | null> {
  const [s] = await db
    .select()
    .from(storeSettings)
    .where(eq(storeSettings.websiteId, websiteId))
    .limit(1);
  if (!s) return null;
  if (s.shippingProvider !== 'easypost') return null;
  if (!s.easypostApiKeyEncrypted) return null;
  const apiKey = decryptApiKey(s.easypostApiKeyEncrypted);
  return {
    provider: new EasyPostProvider({
      apiKey,
      mode: (s.easypostMode as 'test' | 'production') ?? 'test',
      webhookSecret: s.easypostWebhookSecret ?? undefined,
    }),
    settings: s,
  };
}
