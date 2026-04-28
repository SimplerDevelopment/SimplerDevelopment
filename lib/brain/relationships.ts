import { db } from '@/lib/db';
import {
  brainRelationshipOverlays,
  brainMeetings,
  brainTasks,
  crmCompanies,
  crmContacts,
  crmDeals,
  type BrainRelationshipPriority,
  type BrainRelationshipStatus,
} from '@/lib/db/schema';
import { eq, and, or, desc, inArray, sql } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainRelationshipOverlay = typeof brainRelationshipOverlays.$inferSelect;

export interface RelationshipListRow {
  overlay: BrainRelationshipOverlay;
  /** Snapshot of the underlying CRM record. */
  underlying: {
    type: 'company' | 'deal';
    id: number;
    name: string;
    /** For deals: a hint of the linked company. */
    secondaryName?: string;
  };
  /** Computed: open task count for this relationship. */
  openTaskCount: number;
  /** Computed: stale flag based on lastTouchAt + staleAfterDays. */
  isStale: boolean;
}

interface ListOpts {
  type?: string;
  ownerId?: number;
  priority?: BrainRelationshipPriority;
  status?: BrainRelationshipStatus;
  staleOnly?: boolean;
}

export async function listRelationships(clientId: number, opts: ListOpts = {}): Promise<RelationshipListRow[]> {
  const overlayConditions = [eq(brainRelationshipOverlays.clientId, clientId)];
  if (opts.type) overlayConditions.push(eq(brainRelationshipOverlays.relationshipType, opts.type));
  if (opts.ownerId !== undefined) overlayConditions.push(eq(brainRelationshipOverlays.ownerId, opts.ownerId));
  if (opts.priority) overlayConditions.push(eq(brainRelationshipOverlays.priority, opts.priority));
  if (opts.status) overlayConditions.push(eq(brainRelationshipOverlays.status, opts.status));

  const overlays = await db.select().from(brainRelationshipOverlays)
    .where(and(...overlayConditions))
    .orderBy(desc(brainRelationshipOverlays.priority), desc(brainRelationshipOverlays.lastTouchAt));

  if (overlays.length === 0) return [];

  const companyIds = overlays.map((o) => o.companyId).filter((v): v is number => v !== null);
  const dealIds = overlays.map((o) => o.dealId).filter((v): v is number => v !== null);

  const [companies, deals] = await Promise.all([
    companyIds.length > 0
      ? db.select().from(crmCompanies).where(inArray(crmCompanies.id, companyIds))
      : Promise.resolve([] as (typeof crmCompanies.$inferSelect)[]),
    dealIds.length > 0
      ? db.select().from(crmDeals).where(inArray(crmDeals.id, dealIds))
      : Promise.resolve([] as (typeof crmDeals.$inferSelect)[]),
  ]);

  // Pre-fetch deal company names for secondaryName.
  const dealCompanyIds = deals.map((d) => d.companyId).filter((v): v is number => v !== null);
  const dealCompanyMap = new Map<number, string>();
  if (dealCompanyIds.length > 0) {
    const cos = await db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
      .where(inArray(crmCompanies.id, dealCompanyIds));
    for (const c of cos) dealCompanyMap.set(c.id, c.name);
  }

  // Open task counts (single grouped query).
  const overlayIds = overlays.map((o) => o.id);
  const openTaskCounts = new Map<string, number>(); // key: company:<id> or deal:<id>
  if (overlays.length > 0) {
    const taskCounts = await db.select({
      companyId: brainTasks.companyId,
      dealId: brainTasks.dealId,
      count: sql<number>`count(*)::int`,
    })
      .from(brainTasks)
      .where(and(
        eq(brainTasks.clientId, clientId),
        inArray(brainTasks.status, ['open', 'in_progress', 'blocked']),
        or(
          companyIds.length > 0 ? inArray(brainTasks.companyId, companyIds) : sql`false`,
          dealIds.length > 0 ? inArray(brainTasks.dealId, dealIds) : sql`false`,
        ),
      ))
      .groupBy(brainTasks.companyId, brainTasks.dealId);
    for (const row of taskCounts) {
      if (row.companyId !== null) openTaskCounts.set(`company:${row.companyId}`, row.count);
      if (row.dealId !== null) openTaskCounts.set(`deal:${row.dealId}`, row.count);
    }
  }

  const now = Date.now();

  return overlays
    .map((overlay): RelationshipListRow | null => {
      let underlying: RelationshipListRow['underlying'] | null = null;
      let key = '';
      if (overlay.companyId !== null) {
        const co = companies.find((c) => c.id === overlay.companyId);
        if (!co) return null; // dangling FK
        underlying = { type: 'company', id: co.id, name: co.name };
        key = `company:${co.id}`;
      } else if (overlay.dealId !== null) {
        const dl = deals.find((d) => d.id === overlay.dealId);
        if (!dl) return null;
        underlying = {
          type: 'deal',
          id: dl.id,
          name: dl.title,
          secondaryName: dl.companyId ? dealCompanyMap.get(dl.companyId) : undefined,
        };
        key = `deal:${dl.id}`;
      }
      if (!underlying) return null;

      const isStale = overlay.staleAfterDays && overlay.lastTouchAt
        ? (now - overlay.lastTouchAt.getTime()) / 86400000 > overlay.staleAfterDays
        : false;

      const out: RelationshipListRow = {
        overlay,
        underlying,
        openTaskCount: openTaskCounts.get(key) ?? 0,
        isStale: Boolean(isStale),
      };
      return out;
    })
    .filter((r): r is RelationshipListRow => r !== null)
    .filter((r) => !opts.staleOnly || r.isStale);
}

export interface RelationshipDetail {
  overlay: BrainRelationshipOverlay;
  underlying: RelationshipListRow['underlying'] & {
    industry?: string | null;
    domain?: string | null;
    value?: number | null;
    stage?: string | null;
  };
  contacts: { id: number; firstName: string; lastName: string | null; email: string | null; title: string | null }[];
  meetings: { id: number; title: string; meetingDate: Date | null; status: string; createdAt: Date }[];
  tasks: { id: number; title: string; status: string; priority: string; dueDate: Date | null; createdByAi: boolean }[];
}

export async function getRelationship(clientId: number, overlayId: number): Promise<RelationshipDetail | null> {
  const [overlay] = await db.select().from(brainRelationshipOverlays)
    .where(and(eq(brainRelationshipOverlays.id, overlayId), eq(brainRelationshipOverlays.clientId, clientId)))
    .limit(1);
  if (!overlay) return null;

  let underlying: RelationshipDetail['underlying'] | null = null;
  let companyIdForContacts: number | null = null;

  if (overlay.companyId !== null) {
    const [co] = await db.select().from(crmCompanies)
      .where(eq(crmCompanies.id, overlay.companyId)).limit(1);
    if (!co) return null;
    underlying = { type: 'company', id: co.id, name: co.name, industry: co.industry, domain: co.domain };
    companyIdForContacts = co.id;
  } else if (overlay.dealId !== null) {
    const [dl] = await db.select().from(crmDeals)
      .where(eq(crmDeals.id, overlay.dealId)).limit(1);
    if (!dl) return null;
    let secondaryName: string | undefined;
    if (dl.companyId) {
      const [co] = await db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
        .where(eq(crmCompanies.id, dl.companyId)).limit(1);
      secondaryName = co?.name;
      companyIdForContacts = dl.companyId;
    }
    underlying = {
      type: 'deal',
      id: dl.id,
      name: dl.title,
      secondaryName,
      value: dl.value,
      stage: dl.status,
    };
  }
  if (!underlying) return null;

  const [contacts, meetings, tasks] = await Promise.all([
    companyIdForContacts
      ? db.select({
          id: crmContacts.id,
          firstName: crmContacts.firstName,
          lastName: crmContacts.lastName,
          email: crmContacts.email,
          title: crmContacts.title,
        })
        .from(crmContacts)
        .where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.companyId, companyIdForContacts)))
        .orderBy(crmContacts.lastName, crmContacts.firstName)
      : Promise.resolve([] as RelationshipDetail['contacts']),
    db.select({
      id: brainMeetings.id,
      title: brainMeetings.title,
      meetingDate: brainMeetings.meetingDate,
      status: brainMeetings.status,
      createdAt: brainMeetings.createdAt,
    })
      .from(brainMeetings)
      .where(and(
        eq(brainMeetings.clientId, clientId),
        overlay.companyId !== null
          ? eq(brainMeetings.companyId, overlay.companyId)
          : eq(brainMeetings.dealId, overlay.dealId!),
      ))
      .orderBy(desc(brainMeetings.createdAt))
      .limit(20),
    db.select({
      id: brainTasks.id,
      title: brainTasks.title,
      status: brainTasks.status,
      priority: brainTasks.priority,
      dueDate: brainTasks.dueDate,
      createdByAi: brainTasks.createdByAi,
    })
      .from(brainTasks)
      .where(and(
        eq(brainTasks.clientId, clientId),
        overlay.companyId !== null
          ? eq(brainTasks.companyId, overlay.companyId)
          : eq(brainTasks.dealId, overlay.dealId!),
      ))
      .orderBy(desc(brainTasks.createdAt))
      .limit(50),
  ]);

  return { overlay, underlying, contacts, meetings, tasks };
}

interface UpsertOverlayInput {
  clientId: number;
  actorId: number;
  /** Provide exactly one of companyId or dealId. */
  companyId?: number;
  dealId?: number;
  relationshipType?: string;
  status?: BrainRelationshipStatus;
  ownerId?: number | null;
  secondaryOwnerId?: number | null;
  priority?: BrainRelationshipPriority;
  serviceLines?: string[];
  summary?: string | null;
  currentPriorities?: string | null;
  openLoops?: string | null;
  lastTouchAt?: Date | null;
  nextReviewAt?: Date | null;
  confidentialityLevel?: string;
  complianceFlags?: string[];
  staleAfterDays?: number | null;
}

export async function createOverlay(input: UpsertOverlayInput): Promise<BrainRelationshipOverlay> {
  if ((input.companyId == null) === (input.dealId == null)) {
    throw new Error('Provide exactly one of companyId or dealId.');
  }

  // Verify the underlying CRM record belongs to the client.
  if (input.companyId != null) {
    const [co] = await db.select({ id: crmCompanies.id }).from(crmCompanies)
      .where(and(eq(crmCompanies.id, input.companyId), eq(crmCompanies.clientId, input.clientId))).limit(1);
    if (!co) throw new Error('Company not found in this workspace.');
  } else if (input.dealId != null) {
    const [dl] = await db.select({ id: crmDeals.id }).from(crmDeals)
      .where(and(eq(crmDeals.id, input.dealId), eq(crmDeals.clientId, input.clientId))).limit(1);
    if (!dl) throw new Error('Deal not found in this workspace.');
  }

  // Idempotent: if an overlay already exists for this (client, target), update + return it.
  const existing = await db.select().from(brainRelationshipOverlays).where(and(
    eq(brainRelationshipOverlays.clientId, input.clientId),
    input.companyId != null
      ? eq(brainRelationshipOverlays.companyId, input.companyId)
      : eq(brainRelationshipOverlays.dealId, input.dealId!),
  )).limit(1);

  if (existing[0]) {
    return updateOverlay(input.clientId, existing[0].id, input.actorId, input);
  }

  const [created] = await db.insert(brainRelationshipOverlays).values({
    clientId: input.clientId,
    companyId: input.companyId ?? null,
    dealId: input.dealId ?? null,
    relationshipType: input.relationshipType ?? 'generic',
    status: input.status ?? 'active',
    ownerId: input.ownerId ?? null,
    secondaryOwnerId: input.secondaryOwnerId ?? null,
    priority: input.priority ?? 'medium',
    serviceLines: input.serviceLines ?? [],
    summary: input.summary ?? null,
    currentPriorities: input.currentPriorities ?? null,
    openLoops: input.openLoops ?? null,
    lastTouchAt: input.lastTouchAt ?? null,
    nextReviewAt: input.nextReviewAt ?? null,
    confidentialityLevel: input.confidentialityLevel ?? 'standard',
    complianceFlags: input.complianceFlags ?? [],
    staleAfterDays: input.staleAfterDays ?? null,
  }).returning();

  await logAudit({
    clientId: input.clientId,
    actorId: input.actorId,
    action: 'relationship.created',
    entityType: 'brain_relationship_overlay',
    entityId: created.id,
    metadata: {
      target: input.companyId != null ? { type: 'company', id: input.companyId } : { type: 'deal', id: input.dealId! },
      relationshipType: created.relationshipType,
    },
  });

  return created;
}

export async function updateOverlay(
  clientId: number,
  overlayId: number,
  actorId: number,
  patch: Partial<UpsertOverlayInput>,
): Promise<BrainRelationshipOverlay> {
  const [existing] = await db.select().from(brainRelationshipOverlays)
    .where(and(eq(brainRelationshipOverlays.id, overlayId), eq(brainRelationshipOverlays.clientId, clientId)))
    .limit(1);
  if (!existing) throw new Error('Relationship not found.');

  // Don't allow changing the underlying CRM target via update.
  const update: Partial<typeof brainRelationshipOverlays.$inferInsert> = { updatedAt: new Date() };
  if (patch.relationshipType !== undefined) update.relationshipType = patch.relationshipType;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.ownerId !== undefined) update.ownerId = patch.ownerId;
  if (patch.secondaryOwnerId !== undefined) update.secondaryOwnerId = patch.secondaryOwnerId;
  if (patch.priority !== undefined) update.priority = patch.priority;
  if (patch.serviceLines !== undefined) update.serviceLines = patch.serviceLines;
  if (patch.summary !== undefined) update.summary = patch.summary;
  if (patch.currentPriorities !== undefined) update.currentPriorities = patch.currentPriorities;
  if (patch.openLoops !== undefined) update.openLoops = patch.openLoops;
  if (patch.lastTouchAt !== undefined) update.lastTouchAt = patch.lastTouchAt;
  if (patch.nextReviewAt !== undefined) update.nextReviewAt = patch.nextReviewAt;
  if (patch.confidentialityLevel !== undefined) update.confidentialityLevel = patch.confidentialityLevel;
  if (patch.complianceFlags !== undefined) update.complianceFlags = patch.complianceFlags;
  if (patch.staleAfterDays !== undefined) update.staleAfterDays = patch.staleAfterDays;

  const [updated] = await db.update(brainRelationshipOverlays).set(update)
    .where(eq(brainRelationshipOverlays.id, overlayId)).returning();

  await logAudit({
    clientId,
    actorId,
    action: 'relationship.updated',
    entityType: 'brain_relationship_overlay',
    entityId: overlayId,
    metadata: { changedFields: Object.keys(update).filter((k) => k !== 'updatedAt') },
  });

  return updated;
}

export async function deleteOverlay(clientId: number, overlayId: number, actorId: number): Promise<boolean> {
  const result = await db.delete(brainRelationshipOverlays)
    .where(and(eq(brainRelationshipOverlays.id, overlayId), eq(brainRelationshipOverlays.clientId, clientId)))
    .returning({ id: brainRelationshipOverlays.id });
  if (result.length === 0) return false;

  await logAudit({
    clientId,
    actorId,
    action: 'relationship.deleted',
    entityType: 'brain_relationship_overlay',
    entityId: overlayId,
  });
  return true;
}

/**
 * Suggest CRM companies/deals that don't yet have a Brain overlay. Used by
 * the New Relationship picker.
 */
export async function suggestCrmTargets(clientId: number, query: string, limit = 20): Promise<{
  companies: { id: number; name: string; industry: string | null; hasOverlay: boolean }[];
  deals: { id: number; title: string; companyName: string | null; hasOverlay: boolean }[];
}> {
  const q = `%${query.replace(/[%_]/g, '\\$&')}%`;

  const [cos, dls, existingOverlays] = await Promise.all([
    db.select({ id: crmCompanies.id, name: crmCompanies.name, industry: crmCompanies.industry })
      .from(crmCompanies)
      .where(and(eq(crmCompanies.clientId, clientId), sql`${crmCompanies.name} ILIKE ${q}`))
      .limit(limit),
    db.select({ id: crmDeals.id, title: crmDeals.title, companyId: crmDeals.companyId })
      .from(crmDeals)
      .where(and(eq(crmDeals.clientId, clientId), sql`${crmDeals.title} ILIKE ${q}`))
      .limit(limit),
    db.select({ companyId: brainRelationshipOverlays.companyId, dealId: brainRelationshipOverlays.dealId })
      .from(brainRelationshipOverlays)
      .where(eq(brainRelationshipOverlays.clientId, clientId)),
  ]);

  const overlayCompanyIds = new Set(existingOverlays.map((o) => o.companyId).filter((v): v is number => v !== null));
  const overlayDealIds = new Set(existingOverlays.map((o) => o.dealId).filter((v): v is number => v !== null));

  const dealCompanyIds = dls.map((d) => d.companyId).filter((v): v is number => v !== null);
  const dealCompanyMap = new Map<number, string>();
  if (dealCompanyIds.length > 0) {
    const cos2 = await db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
      .where(inArray(crmCompanies.id, dealCompanyIds));
    for (const c of cos2) dealCompanyMap.set(c.id, c.name);
  }

  return {
    companies: cos.map((c) => ({ ...c, hasOverlay: overlayCompanyIds.has(c.id) })),
    deals: dls.map((d) => ({
      id: d.id,
      title: d.title,
      companyName: d.companyId ? dealCompanyMap.get(d.companyId) ?? null : null,
      hasOverlay: overlayDealIds.has(d.id),
    })),
  };
}
