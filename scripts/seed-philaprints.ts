import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

/**
 * Idempotent provisioning for the **philaprints** print-on-demand store.
 *
 * Creates the tenant chain a store needs — user → client → client_website →
 * store_settings — and stops there. Run `seed-pod-product.ts` afterwards with the
 * SITE_ID this prints to add the designable product itself; the two are separate
 * so re-seeding products never risks touching tenancy rows.
 *
 * Naming follows the repo convention: the client login is derived from the site
 * name as `<sitename>@simplerdevelopment.com`.
 *
 * ── About the password ──────────────────────────────────────────────────────
 * `users.password` is NOT NULL, so the row cannot exist without a hash. This
 * script generates 32 random bytes, hashes them, and throws the plaintext away —
 * it is never printed, logged, or stored. The account is therefore unusable
 * until someone completes a password reset, which is the intended way for a real
 * operator to take ownership of it. Do NOT "fix" this by seeding a known
 * password: a predictable credential on a live tenant is worse than no login.
 *
 * ── What it deliberately does NOT do ────────────────────────────────────────
 * The store is created **disabled**, with `fulfillment_provider` left at
 * 'manual' and no Stripe or Printful credentials. Enabling a storefront that
 * cannot take payment or fulfil an order just exposes a broken checkout to the
 * public. Flip those on in the portal once the credentials are in place.
 *
 * Usage:
 *   bun scripts/seed-philaprints.ts
 *   DOMAIN=philaprints.com bun scripts/seed-philaprints.ts
 */
import { randomBytes } from 'node:crypto';
import { hash } from 'bcryptjs';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import { clients, clientWebsites } from '@/lib/db/schema';
import { storeSettings } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

const SITE_NAME = 'philaprints';
const EMAIL = `${SITE_NAME}@simplerdevelopment.com`;
const DOMAIN = process.env.DOMAIN ?? 'philaprints.com';

async function main() {
  // ── user ───────────────────────────────────────────────────────────────────
  let [user] = await db.select().from(users).where(eq(users.email, EMAIL)).limit(1);
  if (!user) {
    // Random, discarded immediately — see the header note. Reset-only account.
    const throwaway = randomBytes(32).toString('hex');
    [user] = await db.insert(users).values({
      name: 'PhilaPrints',
      email: EMAIL,
      password: await hash(throwaway, 10),
      role: 'client',
    }).returning();
    console.log(`created user #${user.id} (${EMAIL}) — password is random; use "forgot password" to take ownership`);
  } else {
    console.log(`reused user #${user.id} (${EMAIL})`);
  }

  // ── client ─────────────────────────────────────────────────────────────────
  let [client] = await db.select().from(clients).where(eq(clients.userId, user.id)).limit(1);
  if (!client) {
    [client] = await db.insert(clients).values({
      userId: user.id,
      company: 'PhilaPrints',
      emailPrefix: SITE_NAME,
    }).returning();
    console.log(`created client #${client.id}`);
  } else {
    console.log(`reused client #${client.id}`);
  }

  // ── website ────────────────────────────────────────────────────────────────
  let [site] = await db.select().from(clientWebsites).where(eq(clientWebsites.domain, DOMAIN)).limit(1);
  if (!site) {
    [site] = await db.insert(clientWebsites).values({
      clientId: client.id,
      name: 'PhilaPrints',
      domain: DOMAIN,
    }).returning();
    console.log(`created website #${site.id} (${DOMAIN})`);
  } else {
    console.log(`reused website #${site.id} (${DOMAIN})`);
  }

  if (client.defaultWebsiteId == null) {
    await db.update(clients).set({ defaultWebsiteId: site.id }).where(eq(clients.id, client.id));
    console.log(`set client.defaultWebsiteId = ${site.id}`);
  }

  // ── store settings (disabled on purpose — see header) ──────────────────────
  const [existingStore] = await db.select().from(storeSettings)
    .where(eq(storeSettings.websiteId, site.id)).limit(1);
  if (!existingStore) {
    await db.insert(storeSettings).values({
      websiteId: site.id,
      enabled: false,
      storeName: 'PhilaPrints',
      currency: 'usd',
    });
    console.log(`created store_settings for site #${site.id} (enabled=false)`);
  } else {
    console.log(`reused store_settings #${existingStore.id} (enabled=${existingStore.enabled})`);
  }

  console.log(`\nSITE_ID=${site.id}`);
  console.log(`Next:  SITE_ID=${site.id} bun scripts/seed-pod-product.ts`);
  console.log('\nStill required before this store can sell:');
  console.log('  ✗ password reset to take ownership of ' + EMAIL);
  console.log('  ✗ Stripe: link a Connect account (or store a BYOK key)');
  console.log('  ✗ Printful: API key + store ID, and fulfillment_provider -> printful');
  console.log('  ✗ store_settings.enabled -> true, once the two above are done');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
