import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { googleWorkspaceTenantCredentials } from '@/lib/db/schema';
import { decryptSecret } from '@/lib/crypto/secrets';
import type { GoogleOAuthCredentials } from '@/lib/google/oauth';

/**
 * Resolved enterprise-tier Workspace context for a single client (tenant).
 *
 * The OAuth credentials inside .oauth are decrypted and ready to hand directly
 * to lib/google/oauth.ts helpers (buildAuthUrl, exchangeCode, etc.).
 *
 * The pubsubVerificationToken is plaintext as stored — used by the webhook
 * router to authenticate incoming Pub/Sub pushes (?token=… match).
 */
export interface TenantWorkspaceContext {
  clientId: number;
  googleProjectId: string;
  pubsubTopic: string;
  pubsubVerificationToken: string;
  oauth: GoogleOAuthCredentials;
  status: 'pending' | 'configured' | 'active' | 'revoked';
  consentScreenUserType: 'internal' | 'external';
}

/**
 * Resolve a client's enterprise Workspace credentials.
 *
 * Returns null when the client has no row — that means they are on the
 * standard tier (MX-based email tracking) and should not be invoking any
 * Workspace OAuth flows.
 *
 * Throws if the row exists but status is 'revoked' — caller should treat as
 * "tenant exists but Workspace integration disabled" and surface a clear
 * UI message rather than continuing with stale credentials.
 *
 * Throws if decryption fails (wrong WORKSPACE_TENANT_SECRETS_KEY in env, or
 * tampered DB row) — these are operational incidents and should not be
 * silently masked.
 */
export async function getTenantWorkspaceCredentialsByClientId(
  clientId: number
): Promise<TenantWorkspaceContext | null> {
  const rows = await db
    .select()
    .from(googleWorkspaceTenantCredentials)
    .where(eq(googleWorkspaceTenantCredentials.clientId, clientId))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.status === 'revoked') {
    throw new Error(
      `Workspace credentials for client ${clientId} are revoked; ` +
      `re-onboard the tenant before resuming Workspace operations`
    );
  }

  return {
    clientId: row.clientId,
    googleProjectId: row.googleProjectId,
    pubsubTopic: row.pubsubTopic,
    pubsubVerificationToken: row.pubsubVerificationToken,
    oauth: {
      clientId: row.oauthClientId,
      clientSecret: decryptSecret(row.oauthClientSecretEncrypted),
      redirectUri: row.oauthRedirectUri,
    },
    status: row.status,
    consentScreenUserType: row.consentScreenUserType,
  };
}

/**
 * Look up a tenant by the verification token attached to an inbound Pub/Sub
 * push. Used by the webhook router to identify which tenant a message is for.
 *
 * Returns null if no tenant matches — caller should respond 401/404 to drop
 * the unrecognized push without giving Pub/Sub a 5xx that would trigger
 * retry storms.
 *
 * Note: the unique index on pubsub_verification_token makes this O(1) on the
 * DB side even with many tenants.
 */
export async function getTenantWorkspaceCredentialsByPubsubToken(
  token: string
): Promise<TenantWorkspaceContext | null> {
  const rows = await db
    .select()
    .from(googleWorkspaceTenantCredentials)
    .where(eq(googleWorkspaceTenantCredentials.pubsubVerificationToken, token))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (row.status === 'revoked') {
    return null;
  }

  return {
    clientId: row.clientId,
    googleProjectId: row.googleProjectId,
    pubsubTopic: row.pubsubTopic,
    pubsubVerificationToken: row.pubsubVerificationToken,
    oauth: {
      clientId: row.oauthClientId,
      clientSecret: decryptSecret(row.oauthClientSecretEncrypted),
      redirectUri: row.oauthRedirectUri,
    },
    status: row.status,
    consentScreenUserType: row.consentScreenUserType,
  };
}
