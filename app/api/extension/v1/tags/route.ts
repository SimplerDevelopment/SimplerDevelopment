/**
 * GET /api/extension/v1/tags?prefix={s}&limit={n}
 *
 * Tag autocomplete for the extension popup's tag picker. Returns the tenant's
 * tag inventory with per-tag note counts, optionally filtered by a
 * case-insensitive prefix and capped to `limit`.
 *
 * Tenant-scoped via the resolved API key context.
 */

import { z } from 'zod';
import {
  withExtensionAuth,
  extensionOk,
  extensionError,
} from '@/lib/extension/with-auth';
import { listTagsWithCounts } from '@/lib/brain/notes';

export const runtime = 'nodejs';

const querySchema = z.object({
  prefix: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const handler = withExtensionAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    prefix: url.searchParams.get('prefix') ?? undefined,
    limit: url.searchParams.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return extensionError(`Invalid query: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  const { prefix, limit } = parsed.data;

  const { tags } = await listTagsWithCounts(ctx.client.id);

  let filtered = tags;
  if (prefix) {
    const needle = prefix.toLowerCase();
    filtered = tags.filter((t) => t.tag.toLowerCase().startsWith(needle));
  }

  // listTagsWithCounts already returns rows ordered by count desc, tag asc.
  // Re-sort defensively in case the upstream contract drifts.
  filtered = [...filtered].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.tag.localeCompare(b.tag);
  });

  return extensionOk({ items: filtered.slice(0, limit) });
});

export { handler as GET, handler as OPTIONS };
