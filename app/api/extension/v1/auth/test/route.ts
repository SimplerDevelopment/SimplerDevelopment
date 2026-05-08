/**
 * POST /api/extension/v1/auth/test
 *
 * Lightweight identity probe — the extension calls this once after the user
 * pastes their `sd_mcp_…` API key to confirm the key works and to surface the
 * authenticated user + client name in the popup header.
 *
 * Reuses the portal API key infrastructure (`resolvePortalFromRequest`).
 * Tenant-scoped: never leaks any other client's data.
 */

import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';

export const runtime = 'nodejs';

const handler = withExtensionAuth(async (_req, ctx) => {
  const [user] = await db.select({
    id: users.id,
    name: users.name,
    email: users.email,
  }).from(users).where(eq(users.id, ctx.userId)).limit(1);

  if (!user) return extensionError('User not found', 404);

  return extensionOk({
    user,
    client: { id: ctx.client.id, name: ctx.client.company ?? `Client #${ctx.client.id}` },
    scopes: ctx.scopes,
  });
});

export { handler as POST, handler as OPTIONS };
