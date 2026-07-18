/**
 * One-time backfill: encrypt any legacy plaintext OAuth tokens at rest.
 *
 * The `encryptedText` column type (lib/db/schema/columns.ts) encrypts on write
 * and tolerates legacy plaintext on read, so adoption needed no migration — but
 * rows written before the switch still sit in the clear until their next OAuth
 * refresh. This script forces that: it reads each row (transparently decrypting,
 * incl. legacy plaintext via decryptMaybe) and writes it straight back (which
 * re-encrypts via toDriver). Idempotent — running it on already-encrypted rows
 * just rotates the IV.
 *
 * Run against a known-correct DATABASE_URL (the column requires
 * WORKSPACE_TENANT_SECRETS_KEY):
 *   bun run scripts/security/backfill-encrypt-oauth-tokens.ts
 */
import { db } from '@/lib/db';
import { githubConnections } from '@/lib/db/schema/auth';
import {
  googleWebsiteTokens,
} from '@/lib/db/schema/sites';
import {
  googleCalendarTokens,
  googleWorkspaceClientConnections,
  googleWorkspaceUserConnections,
  microsoftTeamsUserConnections,
  zoomTokens,
} from '@/lib/db/schema/tools';
import { eq } from 'drizzle-orm';

// Each table + the encrypted token columns it carries.
const TABLES = [
  { name: 'google_website_tokens', table: googleWebsiteTokens },
  { name: 'google_calendar_tokens', table: googleCalendarTokens },
  { name: 'google_workspace_client_connections', table: googleWorkspaceClientConnections },
  { name: 'google_workspace_user_connections', table: googleWorkspaceUserConnections },
  { name: 'microsoft_teams_user_connections', table: microsoftTeamsUserConnections },
  { name: 'zoom_tokens', table: zoomTokens },
] as const;

async function main() {
  for (const { name, table } of TABLES) {
    // Reading decrypts (tolerant of legacy plaintext); writing re-encrypts.
    const rows = (await db
      .select({ id: table.id, accessToken: table.accessToken, refreshToken: table.refreshToken })
      .from(table)) as Array<{ id: number; accessToken: string; refreshToken: string }>;

    let n = 0;
    for (const row of rows) {
      await db
        .update(table)
        .set({ accessToken: row.accessToken, refreshToken: row.refreshToken })
        .where(eq(table.id, row.id));
      n++;
    }
    console.log(`[backfill] ${name}: re-encrypted ${n} row(s)`);
  }

  // github_connections carries an access token only (no refresh token).
  const ghRows = (await db
    .select({ id: githubConnections.id, accessToken: githubConnections.accessToken })
    .from(githubConnections)) as Array<{ id: number; accessToken: string }>;
  for (const row of ghRows) {
    await db
      .update(githubConnections)
      .set({ accessToken: row.accessToken })
      .where(eq(githubConnections.id, row.id));
  }
  console.log(`[backfill] github_connections: re-encrypted ${ghRows.length} row(s)`);

  console.log('[backfill] done.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill] failed:', err);
    process.exit(1);
  });
