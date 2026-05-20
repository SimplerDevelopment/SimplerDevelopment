/**
 * Seed the `postcaptain-tools` plugin into the plugin registry.
 *
 * Run via:
 *   bunx tsx scripts/migrations/plugins/seed-postcaptain-tools.ts
 *
 * Required env vars:
 *   - PORTAL_KMS_KEY  base64 of 32 random bytes (or dev fallback used)
 *   - DATABASE_URL    standard Postgres connection string
 *
 * What it does (idempotent — safe to re-run):
 *   1. Upsert a `services` row of category='plugins' for billing/entitlement
 *   2. Upsert a `client_services` grant for client 103 (Post Captain)
 *   3. Upsert the `registered_apps` row (status='draft' on first insert)
 *   4. Mint a fresh 32-byte HMAC signing key, AES-GCM-encrypt it via
 *      `lib/plugins/kms.ts`, insert the `registered_app_signing_keys` row
 *      with status='active'
 *   5. Print the plaintext secret to stdout once with a "write this down"
 *      warning — the secret is NEVER printed again and NEVER persisted in
 *      plaintext anywhere.
 *
 * The operator's post-run step:
 *   - Copy the printed secret into the postcaptain-tools deploy's
 *     PORTAL_JWT_SECRET env var.
 *   - Flip `registered_apps.status` to 'active' once the host responds.
 *
 * NOTE: Worker 2A's `lib/plugins/kms.ts` provides `encryptSecret`. If that
 * file isn't on disk when you run typecheck on this script, the import will
 * fail — the orchestrator will re-run tsc once Wave 2 lands.
 */

import * as dotenv from 'dotenv';
import { randomBytes, createHash } from 'node:crypto';

dotenv.config({ path: '.env' });

// Post Captain Consulting — clients.id=100 in prod (verified
// 2026-05-19). The earlier value 103 was wrong (that's Crossover
// Capital Advisors); a seed run with the old constant would have
// granted the plugin entitlement to the wrong tenant.
const POSTCAPTAIN_CLIENT_ID = 100;
const SERVICE_SLUG = 'plugin-postcaptain-tools';
const APP_SLUG = 'postcaptain-tools';

async function run() {
  const { db } = await import('../../../lib/db');
  const {
    services,
    clientServices,
  } = await import('../../../lib/db/schema');
  const {
    registeredApps,
    registeredAppSigningKeys,
  } = await import('../../../lib/db/schema/plugins');
  const { encryptSecret } = await import('../../../lib/plugins/kms');
  const { eq, and } = await import('drizzle-orm');

  // ── Step 1: services row ────────────────────────────────────────────────
  const SERVICE_NAME = 'Postcaptain Tools';
  const SERVICE_DESC =
    'Research-and-drafting automation for higher-ed admissions content (Slate / Technolutions / enrollment marketing).';
  const SERVICE_FEATURES = [
    'Scheduled weekly research briefs',
    'Blog post drafting with web search citations',
    'Run history',
  ];

  const [existingService] = await db
    .select({ id: services.id })
    .from(services)
    .where(eq(services.slug, SERVICE_SLUG))
    .limit(1);

  let serviceId: number;
  if (existingService) {
    serviceId = existingService.id;
    console.log(`[services] reusing existing row id=${serviceId} (${SERVICE_SLUG})`);
  } else {
    const [inserted] = await db
      .insert(services)
      .values({
        slug: SERVICE_SLUG,
        name: SERVICE_NAME,
        category: 'plugins',
        description: SERVICE_DESC,
        price: 0,
        billingCycle: 'monthly',
        active: true,
        features: SERVICE_FEATURES,
      })
      .returning({ id: services.id });
    serviceId = inserted.id;
    console.log(`[services] inserted id=${serviceId} (${SERVICE_SLUG})`);
  }

  // ── Step 2: client_services grant for postcaptain (client 103) ──────────
  const [existingGrant] = await db
    .select({ id: clientServices.id, status: clientServices.status })
    .from(clientServices)
    .where(and(
      eq(clientServices.clientId, POSTCAPTAIN_CLIENT_ID),
      eq(clientServices.serviceId, serviceId),
    ))
    .limit(1);

  if (existingGrant) {
    if (existingGrant.status !== 'active') {
      await db
        .update(clientServices)
        .set({ status: 'active', updatedAt: new Date() })
        .where(eq(clientServices.id, existingGrant.id));
      console.log(`[client_services] reactivated grant id=${existingGrant.id}`);
    } else {
      console.log(`[client_services] grant already active id=${existingGrant.id}`);
    }
  } else {
    const [grant] = await db
      .insert(clientServices)
      .values({
        clientId: POSTCAPTAIN_CLIENT_ID,
        serviceId,
        status: 'active',
        startDate: new Date(),
      })
      .returning({ id: clientServices.id });
    console.log(`[client_services] inserted grant id=${grant.id} for client ${POSTCAPTAIN_CLIENT_ID}`);
  }

  // ── Step 3: registered_apps row ─────────────────────────────────────────
  // TODO: After the postcaptain-tools Vercel project is deployed, update
  // hostUrl + manifestUrl to the production domain.
  const HOST_URL = 'https://postcaptain-tools.simplerdevelopment.com';
  const MANIFEST_URL = `${HOST_URL}/sd-manifest.json`;
  const DEFAULT_SCOPES = [
    'postcaptain:research:read',
    'postcaptain:research:write',
    // Internal scopes added in the Wave 2 dispatch refactor. SD mints
    // ':execute' on dispatch to the worker; the worker mints ':complete'
    // on the result callback. Both must be in defaultScopes so the
    // manifest cross-check (requiredScopes ⊆ defaultScopes) passes once
    // the manifest is bumped to advertise ':complete'.
    'postcaptain:internal:execute',
    'postcaptain:internal:complete',
  ];

  const [existingApp] = await db
    .select({ id: registeredApps.id, status: registeredApps.status })
    .from(registeredApps)
    .where(eq(registeredApps.slug, APP_SLUG))
    .limit(1);

  let appId: number;
  if (existingApp) {
    appId = existingApp.id;
    // Refresh the mutable bits but DON'T downgrade status if an operator
    // has already flipped it to 'active'.
    await db
      .update(registeredApps)
      .set({
        name: 'Postcaptain Tools',
        icon: 'science',
        hostUrl: HOST_URL,
        manifestUrl: MANIFEST_URL,
        defaultScopes: DEFAULT_SCOPES,
        billingServiceId: serviceId,
        visibility: 'allowlist',
        allowedClientIds: [POSTCAPTAIN_CLIENT_ID],
        updatedAt: new Date(),
      })
      .where(eq(registeredApps.id, appId));
    console.log(`[registered_apps] refreshed id=${appId} status=${existingApp.status} (left unchanged)`);
  } else {
    const [inserted] = await db
      .insert(registeredApps)
      .values({
        slug: APP_SLUG,
        name: 'Postcaptain Tools',
        icon: 'science',
        hostUrl: HOST_URL,
        manifestUrl: MANIFEST_URL,
        defaultScopes: DEFAULT_SCOPES,
        billingServiceId: serviceId,
        visibility: 'allowlist',
        allowedClientIds: [POSTCAPTAIN_CLIENT_ID],
        status: 'draft',
      })
      .returning({ id: registeredApps.id });
    appId = inserted.id;
    console.log(`[registered_apps] inserted id=${appId} status='draft'`);
  }

  // ── Step 4: mint + encrypt signing key, insert row ──────────────────────
  // Only mint a fresh key if there isn't already an active one — re-running
  // the seed shouldn't rotate the secret out from under a live deploy.
  const [existingActiveKey] = await db
    .select({ id: registeredAppSigningKeys.id, kid: registeredAppSigningKeys.kid })
    .from(registeredAppSigningKeys)
    .where(and(
      eq(registeredAppSigningKeys.appId, appId),
      eq(registeredAppSigningKeys.status, 'active'),
    ))
    .limit(1);

  if (existingActiveKey) {
    console.log(`[registered_app_signing_keys] active key already exists kid=${existingActiveKey.kid}`);
    console.log('\nSkipping new-secret generation. If you need to rotate, run a rotation script (TBD).');
    console.log('\n=== SEED COMPLETE (idempotent re-run) ===');
    console.log(JSON.stringify({ serviceId, appId, kid: existingActiveKey.kid }));
    process.exit(0);
  }

  const secretBytes = randomBytes(32);
  const secretPlaintext = secretBytes.toString('base64');
  const secretHex = secretBytes.toString('hex');
  const kid = `kid-${secretHex.slice(0, 8)}`;
  const secretEncrypted = encryptSecret(secretPlaintext);
  // Fingerprint of plaintext — does NOT enable verification. Used for
  // rotation auditing per the schema comment on registered_app_signing_keys.
  const secretHash = createHash('sha256').update(secretPlaintext, 'utf8').digest('hex');

  const [keyRow] = await db
    .insert(registeredAppSigningKeys)
    .values({
      appId,
      kid,
      secretHash,
      secretEncrypted,
      algo: 'HS256',
      status: 'active',
    })
    .returning({ id: registeredAppSigningKeys.id });

  console.log(`[registered_app_signing_keys] inserted id=${keyRow.id} kid=${kid} algo=HS256 status=active`);

  // ── Step 5: print plaintext secret — ONE TIME ONLY ──────────────────────
  console.log('\n' + '='.repeat(72));
  console.log('!!  WRITE THIS DOWN  !!  WRITE THIS DOWN  !!  WRITE THIS DOWN  !!');
  console.log('='.repeat(72));
  console.log('');
  console.log('  postcaptain-tools needs this value as PORTAL_JWT_SECRET in');
  console.log('  its Vercel project env vars. It will NOT be printed again');
  console.log('  and CANNOT be recovered from the database.');
  console.log('');
  console.log(`  kid: ${kid}`);
  console.log(`  PORTAL_JWT_SECRET=${secretPlaintext}`);
  console.log('');
  console.log('='.repeat(72));
  console.log('');
  console.log('=== SEED COMPLETE ===');
  console.log(JSON.stringify({ serviceId, appId, kid, signingKeyId: keyRow.id }));

  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
