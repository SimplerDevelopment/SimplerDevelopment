import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getPortalClient } from '@/lib/portal-client';
import { db } from '@/lib/db';
import {
  clientWebsites,
  siteNavigation,
  type SiteNavigationDraft,
} from '@/lib/db/schema';
import { and, asc, eq } from 'drizzle-orm';

interface IncomingItem {
  id?: number;
  label: string;
  href: string;
  parentId?: number | null;
  sortOrder: number;
  openInNewTab?: boolean;
  isButton?: boolean;
  description?: string | null;
  icon?: string | null;
  featuredImage?: string | null;
  columnGroup?: number | null;
  // Editor preserves the row but flips this when the user clicks "remove".
  // The PUT honors this as a tombstone (does NOT merge other fields onto
  // the draft for this row).
  draft?: { pendingDelete?: boolean; pendingCreate?: boolean } | null;
}

async function verifySiteAccess(siteId: string) {
  const session = await auth();
  if (!session?.user?.id) return null;

  const userId = parseInt(session.user.id, 10);
  const client = await getPortalClient(userId);
  if (!client) return null;

  const [site] = await db
    .select({ id: clientWebsites.id })
    .from(clientWebsites)
    .where(and(eq(clientWebsites.id, parseInt(siteId)), eq(clientWebsites.clientId, client.id)))
    .limit(1);

  return site ? { site, userId } : null;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const access = await verifySiteAccess(siteId);
  if (!access) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  // The portal editor wants the full row INCLUDING `draft` so it can render
  // the draft badge / pendingDelete strike-through. The public renderer at
  // /api/sites/[siteId]/navigation uses an explicit projection that excludes
  // `draft` — confirmed in that route.
  const items = await db
    .select()
    .from(siteNavigation)
    .where(eq(siteNavigation.websiteId, access.site.id))
    .orderBy(asc(siteNavigation.sortOrder));

  return NextResponse.json({ success: true, data: items });
}

/**
 * Stages a bulk nav update as drafts.
 *
 * Per-item semantics:
 *   - Item with `id` matching an existing row → MERGE the patch into
 *     `siteNavigation.draft`. Live columns are left untouched.
 *   - Item without `id` (new) → INSERT a fresh row with live columns populated
 *     (required NOT NULL) AND `draft = { pendingCreate: true, …fields }`.
 *   - Existing row id not present in the incoming list → set
 *     `draft.pendingDelete = true`. The row stays live until publish.
 *
 * Publish happens via the per-item `…/[itemId]/publish` route or the
 * `…/publish-all` route, both of which mirror the MCP `nav_publish` /
 * `nav_publish_all` apply cases.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ siteId: string }> },
) {
  const { siteId } = await params;
  const access = await verifySiteAccess(siteId);
  if (!access) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  const { items } = (await req.json()) as { items: IncomingItem[] };
  if (!Array.isArray(items)) {
    return NextResponse.json({ success: false, message: 'items array required' }, { status: 400 });
  }

  const now = new Date();
  const nowIso = now.toISOString();
  const userId = access.userId;
  const websiteId = access.site.id;

  const existing = await db
    .select({ id: siteNavigation.id, draft: siteNavigation.draft })
    .from(siteNavigation)
    .where(eq(siteNavigation.websiteId, websiteId));

  const existingById = new Map(existing.map((r) => [r.id, r] as const));
  const incomingIds = new Set<number>();

  // Maps temp/client-side ids (the editor uses negative ids for new items, or
  // ids assigned by previous create-drafts that the editor doesn't know about
  // yet) → real DB ids so children can reference newly inserted parents.
  const tempIdToRealId = new Map<number, number>();

  // Insert new items level-by-level so children can resolve parent ids.
  const insertLevel = async (parentTempId: number | null) => {
    const level = items.filter((i) => {
      const noRealId = !i.id || i.id < 0 || !existingById.has(i.id);
      if (!noRealId) return false;
      const itemParent = i.parentId ?? null;
      return itemParent === parentTempId;
    });
    for (const item of level) {
      const resolvedParentId =
        item.parentId == null
          ? null
          : tempIdToRealId.get(item.parentId) ??
            (existingById.has(item.parentId) ? item.parentId : null);
      const draft: SiteNavigationDraft = {
        pendingCreate: true,
        label: item.label,
        href: item.href,
        parentId: resolvedParentId,
        sortOrder: item.sortOrder,
        openInNewTab: item.openInNewTab ?? false,
        isButton: item.isButton ?? false,
        description: item.description ?? null,
        icon: item.icon ?? null,
        featuredImage: item.featuredImage ?? null,
        columnGroup: item.columnGroup ?? null,
        updatedAt: nowIso,
        updatedBy: userId,
      };
      const [inserted] = await db
        .insert(siteNavigation)
        .values({
          websiteId,
          label: item.label,
          href: item.href,
          parentId: resolvedParentId,
          sortOrder: item.sortOrder,
          openInNewTab: item.openInNewTab ?? false,
          isButton: item.isButton ?? false,
          description: item.description ?? null,
          icon: item.icon ?? null,
          featuredImage: item.featuredImage ?? null,
          columnGroup: item.columnGroup ?? null,
          draft,
        })
        .returning();
      if (item.id != null) tempIdToRealId.set(item.id, inserted.id);
      incomingIds.add(inserted.id);
      // Recurse into children of this brand-new item.
      if (item.id != null) await insertLevel(item.id);
    }
  };

  // Update existing items: merge a patch into their draft.
  for (const item of items) {
    if (item.id == null || item.id < 0 || !existingById.has(item.id)) continue;
    incomingIds.add(item.id);
    const prev: SiteNavigationDraft = existingById.get(item.id)!.draft ?? {};

    // The editor preserves rows that the user clicked "remove" on, but flips
    // `draft.pendingDelete` on the wire. Honor that as a tombstone — do NOT
    // merge other fields, just stamp the flag.
    if (item.draft?.pendingDelete) {
      const next: SiteNavigationDraft = {
        ...prev,
        pendingDelete: true,
        updatedAt: nowIso,
        updatedBy: userId,
      };
      await db
        .update(siteNavigation)
        .set({ draft: next, updatedAt: now })
        .where(eq(siteNavigation.id, item.id));
      continue;
    }

    // If this item was a pendingDelete tombstone but the editor now re-sends
    // it as live (pendingDelete:false), the user is reviving it — clear flag.
    const wasTombstone = !!prev.pendingDelete;
    const next: SiteNavigationDraft = {
      ...prev,
      label: item.label,
      href: item.href,
      parentId:
        item.parentId == null
          ? null
          : tempIdToRealId.get(item.parentId) ?? item.parentId,
      sortOrder: item.sortOrder,
      openInNewTab: item.openInNewTab ?? false,
      isButton: item.isButton ?? false,
      description: item.description ?? null,
      icon: item.icon ?? null,
      featuredImage: item.featuredImage ?? null,
      columnGroup: item.columnGroup ?? null,
      updatedAt: nowIso,
      updatedBy: userId,
    };
    if (wasTombstone) next.pendingDelete = false;
    await db
      .update(siteNavigation)
      .set({ draft: next, updatedAt: now })
      .where(eq(siteNavigation.id, item.id));
  }

  // Insert any wholly new items (depth-first so parents land first).
  await insertLevel(null);

  // Tombstone existing rows that disappeared from the incoming list. Skip
  // anything that's already pendingCreate (draft-only) — the renderer doesn't
  // show those anyway; physically delete instead so the editor's "discard"
  // for a draft-only row works.
  for (const row of existing) {
    if (incomingIds.has(row.id)) continue;
    const prevDraft: SiteNavigationDraft = row.draft ?? {};
    if (prevDraft.pendingCreate) {
      await db.delete(siteNavigation).where(eq(siteNavigation.id, row.id));
      continue;
    }
    const next: SiteNavigationDraft = {
      ...prevDraft,
      pendingDelete: true,
      updatedAt: nowIso,
      updatedBy: userId,
    };
    await db
      .update(siteNavigation)
      .set({ draft: next, updatedAt: now })
      .where(eq(siteNavigation.id, row.id));
  }

  const updated = await db
    .select()
    .from(siteNavigation)
    .where(eq(siteNavigation.websiteId, websiteId))
    .orderBy(asc(siteNavigation.sortOrder));

  return NextResponse.json({ success: true, data: updated });
}
