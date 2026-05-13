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
 * Block-type author gate — DISABLED.
 *
 * Previously restricted `html-render` / `html-embed` authorship to staff roles
 * to limit the surface for re-executed `<script>` tags in their renderers.
 * Removed at request — both blocks are now author-self-service for tenant
 * users. The renderer-side `<script>` execution is unchanged; if/when a
 * tighter posture is needed the right fix is a sandbox-subdomain render path,
 * not a UI-layer gate.
 *
 * Kept as a no-op (rather than ripped out) so the call sites in
 * `/api/portal/cms/websites/[siteId]/posts`, `/api/portal/tools/pitch-decks/[id]`,
 * and `/api/block-templates` keep compiling without per-route edits.
 */
export function assertBlocksAllowedForRole(_content: unknown, _role: string | undefined | null): void {
  return;
}

export async function assertBlocksAllowedForUserId(_content: unknown, _userId: number): Promise<void> {
  return;
}
