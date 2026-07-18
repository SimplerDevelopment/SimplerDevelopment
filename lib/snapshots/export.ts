// Build a portable SnapshotPayload from a single client website.
// Strips IDs/FKs and replaces them with slugs/keys so the payload can be
// re-applied into a different client/site.

import { db } from '@/lib/db';
import {
  clientWebsites,
  posts,
  postTypes,
  customFields,
  siteNavigation,
} from '@/lib/db/schema';
import { eq, asc } from 'drizzle-orm';

import type {
  SnapshotPayload,
  SnapshotPost,
  SnapshotPostType,
  SnapshotBlockTemplate,
} from './types';
import { buildNavTree, type FlatNavRow } from './util';

/** Build a portable payload from a site. The caller is responsible for any
 *  authorisation (we trust `siteId`). */
export async function exportSite(siteId: number): Promise<SnapshotPayload> {
  const [site] = await db
    .select()
    .from(clientWebsites)
    .where(eq(clientWebsites.id, siteId))
    .limit(1);

  if (!site) throw new Error(`Site ${siteId} not found`);

  // ── Posts ────────────────────────────────────────────────────────────
  const postRows = await db
    .select()
    .from(posts)
    .where(eq(posts.websiteId, site.id))
    .orderBy(asc(posts.id));

  const exportedPosts: SnapshotPost[] = postRows.map((p) => ({
    slug: p.slug,
    type: p.postType,
    title: p.title,
    status: p.published ? 'published' : 'draft',
    content: safeParse(p.content),
    meta: {
      excerpt: p.excerpt,
      coverImage: p.coverImage,
      seoTitle: p.seoTitle,
      seoDescription: p.seoDescription,
      ogImage: p.ogImage,
      noIndex: p.noIndex,
      canonicalUrl: p.canonicalUrl,
      customCss: p.customCss,
      customJs: p.customJs,
    },
  }));

  // ── Navigation ──────────────────────────────────────────────────────
  // The site_navigation rows form a flat parent-pointer tree. Reassemble
  // into a slug-keyed nested structure.
  const navRows = await db
    .select()
    .from(siteNavigation)
    .where(eq(siteNavigation.websiteId, site.id))
    .orderBy(asc(siteNavigation.sortOrder));

  const navItems = buildNavTree(navRows as unknown as FlatNavRow[]);

  // ── Post types (custom ones scoped to this site) ─────────────────────
  const ptRows = await db
    .select()
    .from(postTypes)
    .where(eq(postTypes.websiteId, site.id))
    .orderBy(asc(postTypes.id));

  const exportedPostTypes: SnapshotPostType[] = [];
  for (const pt of ptRows) {
    const fields = await db
      .select()
      .from(customFields)
      .where(eq(customFields.postTypeId, pt.id))
      .orderBy(asc(customFields.order));

    exportedPostTypes.push({
      slug: pt.slug,
      name: pt.name,
      description: pt.description,
      icon: pt.icon,
      active: pt.active,
      template: pt.template,
      customCss: pt.customCss,
      customJs: pt.customJs,
      fields: fields.map((f) => ({
        slug: f.slug,
        name: f.name,
        fieldType: f.fieldType,
        options: f.options,
        required: f.required,
        defaultValue: f.defaultValue,
        helpText: f.helpText,
        order: f.order,
      })),
    });
  }

  // ── Block templates ─────────────────────────────────────────────────
  // block_templates is intentionally global (no websiteId column) but we
  // still want to bundle them so the importer can recreate referenced
  // templates if they go missing. Skipped if the table has no
  // owner-scoping; we just take all rows that have been used by posts on
  // this site. For v1 we just include none — leaving the array empty
  // (the importer treats undefined and [] the same way).
  const exportedBlockTemplates: SnapshotBlockTemplate[] = [];

  // ── Site shell ──────────────────────────────────────────────────────
  return {
    schemaVersion: 1,
    site: {
      name: site.name,
      settings: {
        description: site.description,
        active: site.active,
        customLayout: site.customLayout,
        publicAccess: site.publicAccess,
      },
      customCode: {
        customCss: site.customCss,
        customJs: site.customJs,
      },
    },
    posts: exportedPosts,
    navigation: [{ key: 'main', items: navItems }],
    postTypes: exportedPostTypes,
    blockTemplates: exportedBlockTemplates,
  };
}

// ─── helpers ───────────────────────────────────────────────────────────

function safeParse(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

