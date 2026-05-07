// Apply a SnapshotPayload into a target client. Either creates a fresh site
// or imports into an existing one. All work happens in a single DB
// transaction so partial failures roll back. Slug conflicts are resolved by
// suffixing `-imported-N` and recorded on the result.

import { db } from '@/lib/db';
import {
  clientWebsites,
  posts,
  postTypes,
  customFields,
  siteNavigation,
  blockTemplates,
} from '@/lib/db/schema';
import { and, eq, inArray } from 'drizzle-orm';

import type {
  SnapshotPayload,
  SnapshotNavEntry,
} from './types';
import { uniquifySlug } from './util';

export type ImportSnapshotOpts = {
  /** Target an existing site instead of creating a new one. */
  siteId?: number;
  /** Create a fresh client_websites row owned by `targetClientId`. Mutually
   *  exclusive with `siteId`. */
  createNewSite?: boolean;
  /** Override the new site's name. Defaults to payload.site.name (with a
   *  numeric suffix if the source name was the same site). */
  newSiteName?: string;
};

export type ImportSnapshotResult = {
  siteId: number;
  postsCreated: number;
  conflicts: string[];
};

export async function importSnapshot(
  payload: SnapshotPayload,
  targetClientId: number,
  opts: ImportSnapshotOpts = {},
): Promise<ImportSnapshotResult> {
  if (!opts.siteId && !opts.createNewSite) {
    throw new Error('importSnapshot: must specify either `siteId` or `createNewSite`');
  }
  if (opts.siteId && opts.createNewSite) {
    throw new Error('importSnapshot: `siteId` and `createNewSite` are mutually exclusive');
  }
  if (payload.schemaVersion !== 1) {
    throw new Error(`importSnapshot: unsupported schemaVersion ${payload.schemaVersion}`);
  }

  const conflicts: string[] = [];

  // We use db.transaction to roll back on any thrown error.
  return await db.transaction(async (tx) => {
    // ── 1. Resolve / create the target site row ──────────────────────
    let targetSiteId: number;
    if (opts.createNewSite) {
      const baseName = opts.newSiteName?.trim() || payload.site.name || 'Imported Site';
      const [created] = await tx
        .insert(clientWebsites)
        .values({
          clientId: targetClientId,
          name: baseName,
          description: payload.site.settings.description ?? null,
          active: payload.site.settings.active ?? true,
          customLayout: payload.site.settings.customLayout ?? false,
          publicAccess: false, // imported sites start gated until the agency reviews
          customCss: payload.site.customCode?.customCss ?? null,
          customJs: payload.site.customCode?.customJs ?? null,
          deploymentStatus: 'pending',
        })
        .returning({ id: clientWebsites.id });
      targetSiteId = created.id;
    } else {
      // siteId branch: verify the site belongs to targetClientId so we
      // never import into a foreign tenant by mistake.
      const [site] = await tx
        .select({ id: clientWebsites.id, clientId: clientWebsites.clientId })
        .from(clientWebsites)
        .where(eq(clientWebsites.id, opts.siteId!))
        .limit(1);
      if (!site || site.clientId !== targetClientId) {
        throw new Error('importSnapshot: target siteId does not belong to targetClientId');
      }
      targetSiteId = site.id;
      // For an in-place import we update the site's custom code if the
      // payload supplies it (caller-explicit overwrite is acceptable —
      // the API layer can prompt before this runs).
      if (payload.site.customCode) {
        await tx
          .update(clientWebsites)
          .set({
            customCss: payload.site.customCode.customCss ?? null,
            customJs: payload.site.customCode.customJs ?? null,
            updatedAt: new Date(),
          })
          .where(eq(clientWebsites.id, targetSiteId));
      }
    }

    // ── 2. Post types (and their custom fields) ─────────────────────
    // We upsert by slug — a post type with the same slug on the target
    // site is reused. No slug-collision suffix here because post-type
    // slugs are intentionally identifier-like.
    if (payload.postTypes?.length) {
      for (const pt of payload.postTypes) {
        const [existing] = await tx
          .select({ id: postTypes.id })
          .from(postTypes)
          .where(and(eq(postTypes.slug, pt.slug), eq(postTypes.websiteId, targetSiteId)))
          .limit(1);

        if (existing) continue;

        const [created] = await tx
          .insert(postTypes)
          .values({
            name: pt.name,
            slug: pt.slug,
            description: pt.description ?? null,
            icon: pt.icon ?? 'article',
            active: pt.active ?? true,
            websiteId: targetSiteId,
            customCss: pt.customCss ?? null,
            customJs: pt.customJs ?? null,
            template: pt.template ?? null,
          })
          .returning({ id: postTypes.id });

        for (const f of pt.fields) {
          await tx.insert(customFields).values({
            postTypeId: created.id,
            name: f.name,
            slug: f.slug,
            fieldType: f.fieldType,
            options: f.options ?? null,
            required: f.required ?? false,
            defaultValue: f.defaultValue ?? null,
            helpText: f.helpText ?? null,
            order: f.order ?? 0,
          });
        }
      }
    }

    // ── 3. Posts ────────────────────────────────────────────────────
    // For slug conflicts: pre-fetch existing slugs and compute a unique
    // slug per imported post.
    const existingSlugRows = await tx
      .select({ slug: posts.slug })
      .from(posts)
      .where(eq(posts.websiteId, targetSiteId));
    const usedSlugs = new Set(existingSlugRows.map((r) => r.slug));

    let postsCreated = 0;
    for (const p of payload.posts) {
      const finalSlug = uniquifySlug(p.slug, usedSlugs);
      if (finalSlug !== p.slug) {
        conflicts.push(`post slug "${p.slug}" → "${finalSlug}"`);
      }
      usedSlugs.add(finalSlug);

      const contentText =
        typeof p.content === 'string' ? p.content : JSON.stringify(p.content);

      await tx.insert(posts).values({
        title: p.title,
        slug: finalSlug,
        postType: p.type,
        excerpt: p.meta?.excerpt ?? null,
        content: contentText,
        coverImage: p.meta?.coverImage ?? null,
        published: p.status === 'published',
        publishedAt: p.status === 'published' ? new Date() : null,
        seoTitle: p.meta?.seoTitle ?? null,
        seoDescription: p.meta?.seoDescription ?? null,
        ogImage: p.meta?.ogImage ?? null,
        noIndex: p.meta?.noIndex ?? false,
        canonicalUrl: p.meta?.canonicalUrl ?? null,
        customCss: p.meta?.customCss ?? null,
        customJs: p.meta?.customJs ?? null,
        websiteId: targetSiteId,
      });
      postsCreated += 1;
    }

    // ── 4. Navigation ──────────────────────────────────────────────
    // For an in-place import we wipe the existing nav for this site
    // first; for a new site there's nothing there yet. We only consume
    // the menu with key === 'main' for v1.
    const mainMenu = payload.navigation.find((n) => n.key === 'main') ?? payload.navigation[0];
    if (mainMenu?.items?.length) {
      if (opts.siteId) {
        await tx.delete(siteNavigation).where(eq(siteNavigation.websiteId, targetSiteId));
      }
      await insertNavLevel(tx, targetSiteId, mainMenu.items, null);
    }

    // ── 5. Block templates ─────────────────────────────────────────
    // block_templates table has a globally-unique slug. We attempt to
    // upsert: if a template with that slug exists, leave it alone; only
    // insert missing ones. (No conflict added — silent skip.)
    if (payload.blockTemplates?.length) {
      const incomingSlugs = payload.blockTemplates.map((t) => t.slug);
      const existing = await tx
        .select({ slug: blockTemplates.slug })
        .from(blockTemplates)
        .where(inArray(blockTemplates.slug, incomingSlugs));
      const existingSet = new Set(existing.map((r) => r.slug));

      for (const t of payload.blockTemplates) {
        if (existingSet.has(t.slug)) continue;
        await tx.insert(blockTemplates).values({
          slug: t.slug,
          name: t.name,
          description: t.description ?? null,
          category: t.category ?? 'custom',
          scope: t.scope ?? 'block',
          blocks: t.content,
          tags: t.tags ?? [],
        });
      }
    }

    return { siteId: targetSiteId, postsCreated, conflicts };
  });
}

// ─── helpers ───────────────────────────────────────────────────────

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function insertNavLevel(
  tx: Tx,
  websiteId: number,
  entries: SnapshotNavEntry[],
  parentId: number | null,
): Promise<void> {
  for (const [idx, entry] of entries.entries()) {
    const [row] = await tx
      .insert(siteNavigation)
      .values({
        websiteId,
        label: entry.label,
        href: entry.href,
        parentId,
        sortOrder: entry.sortOrder ?? idx,
        openInNewTab: entry.openInNewTab ?? false,
        isButton: entry.isButton ?? false,
        description: entry.description ?? null,
        icon: entry.icon ?? null,
        featuredImage: entry.featuredImage ?? null,
        columnGroup: entry.columnGroup ?? null,
      })
      .returning({ id: siteNavigation.id });
    if (entry.children?.length) {
      await insertNavLevel(tx, websiteId, entry.children, row.id);
    }
  }
}
