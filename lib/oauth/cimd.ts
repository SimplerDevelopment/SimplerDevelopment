import { db } from '@/lib/db';
import { oauthClients } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { fetchCimdDocument } from './server';

/** Resolve an OAuth client record by client_id, auto-registering from a CIMD
 *  document when the client_id is an HTTPS URL and no pre-registered record
 *  exists. This implements SEP-991 / draft-ietf-oauth-client-metadata-document
 *  as used by ChatGPT MCP connectors.
 *
 *  For pre-registered clients (client_id starts with `oc_`) behaviour is
 *  unchanged: a plain DB lookup. For URL-based clients the metadata is fetched
 *  and the row is upserted on every call so redirect_uris stay in sync. */
export async function resolveOrRegisterOAuthClient(clientId: string) {
  // Standard pre-registered client (oc_…, or any non-URL string).
  if (!clientId.startsWith('https://')) {
    const [existing] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
    return existing ?? null;
  }

  // varchar(64) guard — CIMD URLs longer than this can't be stored.
  if (clientId.length > 64) return null;

  // Fetch the metadata document from the client_id URL.
  const cimd = await fetchCimdDocument(clientId);
  if (!cimd) return null;

  const name = cimd.client_name ?? new URL(clientId).hostname;

  const [record] = await db
    .insert(oauthClients)
    .values({
      clientId,
      clientName: name,
      redirectUris: cimd.redirect_uris,
      tokenEndpointAuthMethod: 'none', // CIMD clients are always public PKCE
    })
    .onConflictDoUpdate({
      target: oauthClients.clientId,
      set: { redirectUris: cimd.redirect_uris, clientName: name },
    })
    .returning();

  return record ?? null;
}
