import * as dotenv from 'dotenv';

dotenv.config({ path: '.env' });

/**
 * Seed the well-known OAuth client for the `simpler` CLI browser login flow
 * (`simpler auth login`). Public PKCE client — no secret. Redirect URIs are
 * exact-match on /oauth/authorize, so the CLI tries these loopback ports in
 * order. Idempotent: upserts on client_id.
 */
const CLIENT_ID = 'oc_simpler-cli';
const REDIRECT_URIS = [
  'http://127.0.0.1:8976/callback',
  'http://127.0.0.1:8977/callback',
  'http://127.0.0.1:8978/callback',
];

async function seedCliOAuthClient() {
  const { db } = await import('../lib/db');
  const { oauthClients } = await import('../lib/db/schema');
  const { sql } = await import('drizzle-orm');

  await db
    .insert(oauthClients)
    .values({
      clientId: CLIENT_ID,
      clientName: 'simpler CLI',
      redirectUris: REDIRECT_URIS,
      clientUri: 'https://www.npmjs.com/package/@simplerdevelopment/cli',
      tokenEndpointAuthMethod: 'none',
    })
    .onConflictDoUpdate({
      target: oauthClients.clientId,
      set: {
        clientName: 'simpler CLI',
        redirectUris: REDIRECT_URIS,
        clientUri: 'https://www.npmjs.com/package/@simplerdevelopment/cli',
        tokenEndpointAuthMethod: 'none',
        clientSecretHash: sql`null`,
      },
    });

  console.log(`Seeded OAuth client ${CLIENT_ID} with ${REDIRECT_URIS.length} loopback redirect URIs.`);
  process.exit(0);
}

seedCliOAuthClient().catch((err) => {
  console.error(err);
  process.exit(1);
});
