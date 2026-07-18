import { and, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { linkedinUserConnections } from '@/lib/db/schema';
import { encryptSecret, decryptSecret } from '@/lib/crypto/secrets';
import {
  getEnvLinkedinCredentials,
  refreshIfExpired,
  type ExchangeResult,
  type LinkedinConnectionLike,
} from './oauth';

/**
 * Persistence + token lifecycle for LinkedIn personal-profile connections.
 * Tokens are AES-256-GCM encrypted at rest (auth-surface rule). Rows are keyed
 * by (clientId, userId) — multi-tenant by construction.
 */

/** Upsert the connection for (clientId, userId) after a successful OAuth exchange. */
export async function storeConnection(params: {
  clientId: number;
  userId: number;
  result: ExchangeResult;
}): Promise<void> {
  const { clientId, userId, result } = params;
  const row = {
    clientId,
    userId,
    memberUrn: result.memberUrn,
    linkedinName: result.name || null,
    accessTokenEncrypted: encryptSecret(result.accessToken),
    refreshTokenEncrypted: result.refreshToken ? encryptSecret(result.refreshToken) : null,
    expiresAt: result.expiresAt,
    refreshTokenExpiresAt: result.refreshTokenExpiresAt,
    scopes: result.scopes,
    revokedAt: null,
    updatedAt: new Date(),
  };
  await db
    .insert(linkedinUserConnections)
    .values(row)
    .onConflictDoUpdate({
      target: [linkedinUserConnections.clientId, linkedinUserConnections.userId],
      set: row,
    });
}

interface DecryptedConnection extends LinkedinConnectionLike {
  memberUrn: string;
}

/** Load the active (non-revoked) connection with decrypted tokens, or null. */
export async function getConnection(
  clientId: number,
  userId: number,
): Promise<DecryptedConnection | null> {
  const [row] = await db
    .select()
    .from(linkedinUserConnections)
    .where(
      and(
        eq(linkedinUserConnections.clientId, clientId),
        eq(linkedinUserConnections.userId, userId),
        isNull(linkedinUserConnections.revokedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  return {
    accessToken: decryptSecret(row.accessTokenEncrypted),
    refreshToken: row.refreshTokenEncrypted ? decryptSecret(row.refreshTokenEncrypted) : '',
    expiresAt: row.expiresAt,
    memberUrn: row.memberUrn,
  };
}

/**
 * Return a currently-valid access token for posting, refreshing + persisting if
 * needed. Throws if there is no active connection (caller should surface a
 * "connect LinkedIn" / "re-authorize" prompt).
 */
export async function getValidAccessToken(
  clientId: number,
  userId: number,
): Promise<{ accessToken: string; memberUrn: string }> {
  const conn = await getConnection(clientId, userId);
  if (!conn) {
    throw new Error('No active LinkedIn connection for this user — connect LinkedIn first.');
  }
  const credentials = getEnvLinkedinCredentials('');
  const { connection, refreshed } = await refreshIfExpired(conn, credentials);
  if (refreshed) {
    await db
      .update(linkedinUserConnections)
      .set({
        accessTokenEncrypted: encryptSecret(connection.accessToken),
        refreshTokenEncrypted: connection.refreshToken
          ? encryptSecret(connection.refreshToken)
          : null,
        expiresAt: connection.expiresAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(linkedinUserConnections.clientId, clientId),
          eq(linkedinUserConnections.userId, userId),
        ),
      );
  }
  return { accessToken: connection.accessToken, memberUrn: conn.memberUrn };
}

/** Mark the connection revoked (disconnect). */
export async function markRevoked(clientId: number, userId: number): Promise<void> {
  await db
    .update(linkedinUserConnections)
    .set({ revokedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(linkedinUserConnections.clientId, clientId),
        eq(linkedinUserConnections.userId, userId),
      ),
    );
}
