/**
 * Block-type author gating.
 *
 * The `html-render` and `html-embed` block types intentionally re-execute
 * `<script>` tags in their renderers (see HtmlRenderBlockRender / HtmlEmbedBlockRender).
 * That's effectively `eval()` exposed to anyone with sites:write — i.e. any
 * tenant client user who can edit a page. The audit recommended gating these
 * to admin/editor authorship until a sandbox-subdomain rendering path lands.
 *
 * Use `assertBlocksAllowedForRole` server-side BEFORE persisting any
 * post.content / page.content payload that came from a request body.
 */

export const RESTRICTED_BLOCK_TYPES = ['html-render', 'html-embed'] as const;

export const PRIVILEGED_ROLES = new Set(['admin', 'editor', 'employee']);

export class BlockGateError extends Error {
  constructor(public restrictedType: string) {
    super(
      `Block type '${restrictedType}' may only be authored by admin/editor staff. ` +
      `Contact your administrator to insert raw HTML/JS blocks.`
    );
  }
}

function findRestrictedType(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const hit = findRestrictedType(item);
      if (hit) return hit;
    }
    return null;
  }
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.type === 'string' && (RESTRICTED_BLOCK_TYPES as readonly string[]).includes(obj.type)) {
      return obj.type;
    }
    for (const v of Object.values(obj)) {
      const hit = findRestrictedType(v);
      if (hit) return hit;
    }
  }
  return null;
}

/**
 * Throws `BlockGateError` if `content` contains a restricted block type and
 * `role` is not in `PRIVILEGED_ROLES`. No-op for staff. No-op for content
 * without restricted types.
 */
export function assertBlocksAllowedForRole(content: unknown, role: string | undefined | null): void {
  if (role && PRIVILEGED_ROLES.has(role)) return;
  const hit = findRestrictedType(content);
  if (hit) throw new BlockGateError(hit);
}

/**
 * MCP-side variant: looks up the underlying user's role from `users` by id,
 * then delegates. Used in `lib/mcp/tools/*` where the context only carries
 * `userId` (not the role). Cheap one-shot query; only runs on writes.
 *
 * If the user can't be found, the most conservative interpretation is used —
 * treat as a non-privileged caller. Throws `BlockGateError` on hit.
 */
export async function assertBlocksAllowedForUserId(content: unknown, userId: number): Promise<void> {
  // Fast-path: skip the DB lookup when the content can't contain a restricted
  // block at all. Saves a query on every non-block MCP write.
  const hit = findRestrictedType(content);
  if (!hit) return;
  const { db } = await import('@/lib/db');
  const { users } = await import('@/lib/db/schema');
  const { eq } = await import('drizzle-orm');
  const [row] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)).limit(1);
  if (row && PRIVILEGED_ROLES.has(row.role)) return;
  throw new BlockGateError(hit);
}
