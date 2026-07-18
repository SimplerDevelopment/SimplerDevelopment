/**
 * MCP tools for Custom Post Types (CPTs).
 *
 * Mirrors the portal's `/api/portal/cms/websites/[siteId]/content-types/**`
 * surface so MCP clients can manage CPTs end-to-end: type definitions,
 * the visual template (block tree wrapping every post), per-type custom
 * CSS/JS, and the custom-fields schema attached to each type.
 *
 * Scopes: reads use `sites:read`, writes use `sites:write` — same as the
 * `posts_*` family, since CPTs are a property of the site's CMS surface.
 *
 * The template editor enforces "exactly one post-content placeholder";
 * we replicate the dedupe/prepend logic from
 * `app/api/portal/cms/websites/[siteId]/content-types/[typeId]/template/route.ts`
 * so MCP-authored templates land in a valid state.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { and, asc, eq, isNull, or } from 'drizzle-orm';
import { db } from '@/lib/db';
import { clientWebsites, postTypes, customFields } from '@/lib/db/schema';
import { hasScope, type PortalMcpContext } from '@/lib/mcp-auth';
import { json, denied } from '@/lib/mcp/types';

function revalidate() {
  try {
    revalidatePath('/portal', 'layout');
    revalidatePath('/sites', 'layout');
  } catch {
    // best-effort — the route renders dynamic so a missed revalidate is harmless
  }
}

// ─── post-content placeholder normalization ──────────────────────────────
// Mirrors the contract in the template/ route: exactly one `post-content`
// block, marked required:true. We dedupe on PUT and prepend if missing so
// MCP-authored templates can never lose the substitution point.

const POST_CONTENT_TYPE = 'post-content';

interface BlockLike {
  id?: string;
  type?: string;
  order?: number;
  required?: boolean;
  blocks?: BlockLike[];
  columns?: Array<{ blocks?: BlockLike[] }>;
  [k: string]: unknown;
}

function makeDefaultPlaceholder(): BlockLike {
  return { id: `block-post-content-${Date.now()}`, type: POST_CONTENT_TYPE, order: 0, required: true };
}

function makeDefaultTemplate() {
  return { blocks: [makeDefaultPlaceholder()], version: '1.0' };
}

function countPostContent(blocks: BlockLike[] | undefined): number {
  if (!Array.isArray(blocks)) return 0;
  let n = 0;
  for (const b of blocks) {
    if (b?.type === POST_CONTENT_TYPE) n++;
    if (Array.isArray(b?.blocks)) n += countPostContent(b.blocks);
    if (Array.isArray(b?.columns)) for (const c of b.columns) n += countPostContent(c?.blocks);
  }
  return n;
}

function markPostContentRequired(blocks: BlockLike[]): BlockLike[] {
  return blocks.map(b => {
    let next = b;
    if (b?.type === POST_CONTENT_TYPE) next = { ...next, required: true };
    if (Array.isArray(b?.blocks)) next = { ...next, blocks: markPostContentRequired(b.blocks) };
    if (Array.isArray(b?.columns)) {
      next = { ...next, columns: b.columns.map(c => Array.isArray(c?.blocks) ? { ...c, blocks: markPostContentRequired(c.blocks) } : c) };
    }
    return next;
  });
}

function normalizeTemplate(input: { blocks?: BlockLike[]; version?: string } | null | undefined) {
  let inputBlocks: BlockLike[] = [];
  let version = '1.0';
  if (input && Array.isArray(input.blocks)) {
    inputBlocks = input.blocks;
    if (input.version) version = input.version;
  }
  let seenPlaceholder = false;
  function dedupe(blocks: BlockLike[]): BlockLike[] {
    const out: BlockLike[] = [];
    for (const b of blocks) {
      if (b?.type === POST_CONTENT_TYPE) {
        if (seenPlaceholder) continue;
        seenPlaceholder = true;
        out.push({ ...b, required: true });
        continue;
      }
      let next = b;
      if (Array.isArray(b?.blocks)) next = { ...next, blocks: dedupe(b.blocks) };
      if (Array.isArray(b?.columns)) {
        next = { ...next, columns: b.columns.map(c => Array.isArray(c?.blocks) ? { ...c, blocks: dedupe(c.blocks) } : c) };
      }
      out.push(next);
    }
    return out;
  }
  let normalized = dedupe(inputBlocks);
  if (!seenPlaceholder) {
    normalized = [makeDefaultPlaceholder(), ...normalized.map((b, i) => ({ ...b, order: (b.order ?? i) + 1 }))];
  }
  normalized = markPostContentRequired(normalized);
  return { blocks: normalized, version };
}

// ─── access guards ────────────────────────────────────────────────────────

async function siteOwnedByClient(siteId: number, clientId: number) {
  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, siteId), eq(clientWebsites.clientId, clientId)))
    .limit(1);
  return site ?? null;
}

async function findEditableType(siteId: number, typeId: number, clientId: number) {
  const site = await siteOwnedByClient(siteId, clientId);
  if (!site) return null;
  // Only site-specific types are editable — global (websiteId IS NULL) types
  // are admin-managed and read-only from the portal/MCP surface.
  const [type] = await db
    .select()
    .from(postTypes)
    .where(and(eq(postTypes.id, typeId), eq(postTypes.websiteId, site.id)))
    .limit(1);
  return type ? { site, type } : null;
}

const FIELD_TYPE_ENUM = ['text', 'textarea', 'number', 'date', 'select', 'checkbox', 'url', 'email', 'image', 'user_select', 'repeater', 'group', 'reference'] as const;

export function registerPostTypeToolsOnSdk(server: McpServer, ctx: PortalMcpContext) {
  const clientId = ctx.client.id;

  // ── POST TYPE CRUD ─────────────────────────────────────────────────────

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'post_types_list',
    {
      title: 'List custom post types',
      description: 'List custom post types (CPTs) available on a website. Includes site-specific types plus global/built-in types (page, blog, etc.). Pass `siteOnly: true` to exclude globals.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        siteOnly: z.boolean().optional(),
      },
    },
    async ({ websiteId, siteOnly }) => {
      if (!hasScope(ctx.scopes, 'sites:read')) return denied('sites:read');
      const site = await siteOwnedByClient(websiteId, clientId);
      if (!site) return json({ error: 'Site not found' });
      const where = siteOnly
        ? eq(postTypes.websiteId, site.id)
        : or(eq(postTypes.websiteId, site.id), isNull(postTypes.websiteId));
      const rows = await db.select().from(postTypes).where(where).orderBy(asc(postTypes.name));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'post_types_get',
    {
      title: 'Get custom post type',
      description: 'Fetch a single CPT including its template + custom code. Use the dedicated `post_types_get_template` / `post_types_get_code` tools when you only need one of those.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
      },
    },
    async ({ websiteId, typeId }) => {
      if (!hasScope(ctx.scopes, 'sites:read')) return denied('sites:read');
      const site = await siteOwnedByClient(websiteId, clientId);
      if (!site) return json({ error: 'Site not found' });
      // Allow read-through to global types so callers can inspect built-ins.
      const [type] = await db
        .select()
        .from(postTypes)
        .where(and(eq(postTypes.id, typeId), or(eq(postTypes.websiteId, site.id), isNull(postTypes.websiteId))))
        .limit(1);
      if (!type) return json({ error: 'Post type not found' });
      return json(type);
    },
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'post_types_create',
    {
      title: 'Create custom post type',
      description: 'Create a new CPT scoped to a website. Slug must be unique within the site (collisions with global types are also rejected).',
      inputSchema: {
        websiteId: z.number().int().positive(),
        name: z.string().min(1),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
        description: z.string().nullable().optional(),
        icon: z.string().optional(),
      },
    },
    async ({ websiteId, name, slug, description, icon }) => {
      if (!hasScope(ctx.scopes, 'sites:write')) return denied('sites:write');
      const site = await siteOwnedByClient(websiteId, clientId);
      if (!site) return json({ error: 'Site not found' });
      const [collision] = await db
        .select({ id: postTypes.id })
        .from(postTypes)
        .where(and(eq(postTypes.slug, slug), or(eq(postTypes.websiteId, site.id), isNull(postTypes.websiteId))))
        .limit(1);
      if (collision) return json({ error: 'A post type with this slug already exists' });
      const [row] = await db.insert(postTypes).values({
        name,
        slug,
        description: description ?? null,
        icon: icon ?? 'article',
        active: true,
        websiteId: site.id,
      }).returning();
      revalidate();
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'post_types_update',
    {
      title: 'Update custom post type',
      description: 'Update the name/slug/description/icon/active flag of a site-owned CPT. Built-in / global types are not editable through this tool.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
        name: z.string().min(1).optional(),
        slug: z.string().min(1).regex(/^[a-z0-9-]+$/).optional(),
        description: z.string().nullable().optional(),
        icon: z.string().optional(),
        active: z.boolean().optional(),
      },
    },
    async ({ websiteId, typeId, ...rest }) => {
      if (!hasScope(ctx.scopes, 'sites:write')) return denied('sites:write');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found or not editable' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(postTypes).set(patch).where(eq(postTypes.id, access.type.id)).returning();
      revalidate();
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'post_types_delete',
    {
      title: 'Delete custom post type',
      description: 'Permanently delete a site-owned CPT. Posts of that type cascade to deletion. Built-in/global types are not deletable.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
      },
    },
    async ({ websiteId, typeId }) => {
      if (!hasScope(ctx.scopes, 'sites:write')) return denied('sites:write');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found or not editable' });
      await db.delete(postTypes).where(eq(postTypes.id, access.type.id));
      revalidate();
      return json({ success: true, id: access.type.id });
    },
  );

  // ── TEMPLATE (visual block-tree wrapper) ──────────────────────────────

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'post_types_get_template',
    {
      title: 'Get CPT template',
      description: 'Get the block-tree template that wraps every post of this type. The template contains exactly one `{ type: "post-content" }` placeholder block — at render time the post\'s own blocks are substituted in. Returns `{ template, defaulted }` where `defaulted: true` means the type has no saved template yet (the response body shows the starter template).',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
      },
    },
    async ({ websiteId, typeId }) => {
      if (!hasScope(ctx.scopes, 'sites:read')) return denied('sites:read');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found' });
      if (!access.type.template) {
        return json({ template: makeDefaultTemplate(), defaulted: true });
      }
      let template: { blocks?: BlockLike[]; version?: string } | null = null;
      try { template = JSON.parse(access.type.template); } catch { template = null; }
      // Defensive: if a previously-saved template lost its placeholder, put
      // one back so callers always receive a renderable tree.
      if (template && Array.isArray(template.blocks) && countPostContent(template.blocks) === 0) {
        template = {
          blocks: [makeDefaultPlaceholder(), ...template.blocks.map((b, i) => ({ ...b, order: (b.order ?? i) + 1 }))],
          version: template.version || '1.0',
        };
      }
      return json({ template, defaulted: false });
    },
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'post_types_update_template',
    {
      title: 'Update CPT template',
      description: 'Replace the block-tree template for a CPT. The server enforces "exactly one post-content placeholder" — extras are dropped (first one wins), and a placeholder is prepended if absent. Pass `template: null` to reset to the default starter (a single placeholder).',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
        template: z.object({
          blocks: z.array(z.any()).optional(),
          version: z.string().optional(),
        }).nullable().optional(),
      },
    },
    async ({ websiteId, typeId, template }) => {
      if (!hasScope(ctx.scopes, 'sites:write')) return denied('sites:write');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found or not editable' });
      const normalized = normalizeTemplate(template ?? null);
      const serialized = JSON.stringify(normalized);
      const [row] = await db
        .update(postTypes)
        .set({ template: serialized, updatedAt: new Date() })
        .where(eq(postTypes.id, access.type.id))
        .returning();
      revalidate();
      let parsed: unknown = null;
      if (row.template) { try { parsed = JSON.parse(row.template); } catch {} }
      return json({ template: parsed, defaulted: false });
    },
  );

  // ── CUSTOM CODE (CSS / JS) ────────────────────────────────────────────

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'post_types_get_code',
    {
      title: 'Get CPT custom CSS/JS',
      description: 'Get the type-wide custom CSS and JS that cascades to every post of this type. Cascade order: site code → CPT code → per-post code.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
      },
    },
    async ({ websiteId, typeId }) => {
      if (!hasScope(ctx.scopes, 'sites:read')) return denied('sites:read');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found' });
      return json({ customCss: access.type.customCss || '', customJs: access.type.customJs || '' });
    },
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'post_types_update_code',
    {
      title: 'Update CPT custom CSS/JS',
      description: 'Update the type-wide custom CSS/JS. Pass an empty string to clear a field; omit to leave unchanged.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
        customCss: z.string().optional(),
        customJs: z.string().optional(),
      },
    },
    async ({ websiteId, typeId, customCss, customJs }) => {
      if (!hasScope(ctx.scopes, 'sites:write')) return denied('sites:write');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found or not editable' });
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (customCss !== undefined) patch.customCss = customCss === '' ? null : customCss;
      if (customJs !== undefined) patch.customJs = customJs === '' ? null : customJs;
      const [row] = await db.update(postTypes).set(patch).where(eq(postTypes.id, access.type.id)).returning();
      revalidate();
      return json({ customCss: row.customCss || '', customJs: row.customJs || '' });
    },
  );

  // ── CUSTOM FIELDS (schema attached to a CPT) ──────────────────────────

  hasScope(ctx.scopes, 'sites:read') && server.registerTool(
    'post_types_fields_list',
    {
      title: 'List CPT custom fields',
      description: 'List custom field definitions for a CPT, ordered by `order`. Includes parent + child fields (children of repeater/group fields have parentId set).',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
      },
    },
    async ({ websiteId, typeId }) => {
      if (!hasScope(ctx.scopes, 'sites:read')) return denied('sites:read');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found' });
      const rows = await db
        .select()
        .from(customFields)
        .where(eq(customFields.postTypeId, access.type.id))
        .orderBy(asc(customFields.order));
      return json(rows);
    },
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'post_types_fields_create',
    {
      title: 'Create CPT custom field',
      description: 'Add a custom field to a CPT. For nested fields (children of repeater/group), pass `parentId`. `options` is required for select-type fields.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
        parentId: z.number().int().positive().nullable().optional(),
        name: z.string().min(1),
        slug: z.string().min(1),
        fieldType: z.enum(FIELD_TYPE_ENUM),
        options: z.array(z.string()).nullable().optional(),
        required: z.boolean().optional(),
        defaultValue: z.string().nullable().optional(),
        helpText: z.string().nullable().optional(),
        order: z.number().int().optional(),
      },
    },
    async ({ websiteId, typeId, parentId, name, slug, fieldType, options, required, defaultValue, helpText, order }) => {
      if (!hasScope(ctx.scopes, 'sites:write')) return denied('sites:write');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found or not editable' });
      // Validate parent (if any) belongs to this same CPT and is a container.
      if (parentId) {
        const [parent] = await db
          .select({ id: customFields.id, postTypeId: customFields.postTypeId, fieldType: customFields.fieldType })
          .from(customFields)
          .where(eq(customFields.id, parentId))
          .limit(1);
        if (!parent || parent.postTypeId !== access.type.id) {
          return json({ error: 'parentId is not a field on this content type' });
        }
        if (parent.fieldType !== 'repeater' && parent.fieldType !== 'group') {
          return json({ error: 'parentId must point to a repeater or group field' });
        }
      }
      const [row] = await db
        .insert(customFields)
        .values({
          postTypeId: access.type.id,
          parentId: parentId ?? null,
          name,
          slug,
          fieldType,
          options: options ?? null,
          required: required ?? false,
          defaultValue: defaultValue ?? null,
          helpText: helpText ?? null,
          order: order ?? 0,
        })
        .returning();
      revalidate();
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'post_types_fields_update',
    {
      title: 'Update CPT custom field',
      description: 'Update a custom field. Reparenting (changing parentId) requires the new parent to belong to the same CPT and be a repeater/group.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
        fieldId: z.number().int().positive(),
        parentId: z.number().int().positive().nullable().optional(),
        name: z.string().min(1).optional(),
        slug: z.string().min(1).optional(),
        fieldType: z.enum(FIELD_TYPE_ENUM).optional(),
        options: z.array(z.string()).nullable().optional(),
        required: z.boolean().optional(),
        defaultValue: z.string().nullable().optional(),
        helpText: z.string().nullable().optional(),
        order: z.number().int().optional(),
      },
    },
    async ({ websiteId, typeId, fieldId, parentId, ...rest }) => {
      if (!hasScope(ctx.scopes, 'sites:write')) return denied('sites:write');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found or not editable' });
      const [field] = await db
        .select()
        .from(customFields)
        .where(and(eq(customFields.id, fieldId), eq(customFields.postTypeId, access.type.id)))
        .limit(1);
      if (!field) return json({ error: 'Custom field not found on this CPT' });
      if (parentId) {
        const [parent] = await db
          .select({ id: customFields.id, postTypeId: customFields.postTypeId, fieldType: customFields.fieldType })
          .from(customFields)
          .where(eq(customFields.id, parentId))
          .limit(1);
        if (!parent || parent.postTypeId !== access.type.id) {
          return json({ error: 'parentId is not a field on this content type' });
        }
        if (parent.fieldType !== 'repeater' && parent.fieldType !== 'group') {
          return json({ error: 'parentId must point to a repeater or group field' });
        }
      }
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (parentId !== undefined) patch.parentId = parentId;
      for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
      const [row] = await db.update(customFields).set(patch).where(eq(customFields.id, field.id)).returning();
      revalidate();
      return json(row);
    },
  );

  hasScope(ctx.scopes, 'sites:write') && server.registerTool(
    'post_types_fields_delete',
    {
      title: 'Delete CPT custom field',
      description: 'Delete a custom field from a CPT. Stored values cascade. For repeater/group parents, child fields cascade too.',
      inputSchema: {
        websiteId: z.number().int().positive(),
        typeId: z.number().int().positive(),
        fieldId: z.number().int().positive(),
      },
    },
    async ({ websiteId, typeId, fieldId }) => {
      if (!hasScope(ctx.scopes, 'sites:write')) return denied('sites:write');
      const access = await findEditableType(websiteId, typeId, clientId);
      if (!access) return json({ error: 'Post type not found or not editable' });
      const [field] = await db
        .select({ id: customFields.id })
        .from(customFields)
        .where(and(eq(customFields.id, fieldId), eq(customFields.postTypeId, access.type.id)))
        .limit(1);
      if (!field) return json({ error: 'Custom field not found on this CPT' });
      await db.delete(customFields).where(eq(customFields.id, field.id));
      revalidate();
      return json({ success: true, id: field.id });
    },
  );
}
