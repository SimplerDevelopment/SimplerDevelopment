import { db } from '@/lib/db';
import {
  brainCalendarEvents,
  brainTasks,
  brainMeetings,
  brainRelationshipOverlays,
  crmCompanies,
  crmDeals,
} from '@/lib/db/schema';
import { and, asc, eq, gte, isNotNull, lt, gt, inArray } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainCalendarEvent = typeof brainCalendarEvents.$inferSelect;

interface ListEventsOpts {
  from: Date;
  to: Date;
}

/** Events that overlap [from, to). */
export async function listEvents(clientId: number, opts: ListEventsOpts): Promise<BrainCalendarEvent[]> {
  return db.select().from(brainCalendarEvents)
    .where(and(
      eq(brainCalendarEvents.clientId, clientId),
      lt(brainCalendarEvents.startAt, opts.to),
      gt(brainCalendarEvents.endAt, opts.from),
    ))
    .orderBy(asc(brainCalendarEvents.startAt));
}

export async function getEvent(clientId: number, eventId: number): Promise<BrainCalendarEvent | null> {
  const [row] = await db.select().from(brainCalendarEvents)
    .where(and(eq(brainCalendarEvents.id, eventId), eq(brainCalendarEvents.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

interface CreateEventInput {
  clientId: number;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date;
  allDay?: boolean;
  timezone?: string;
  location?: string | null;
  link?: string | null;
  relatedTaskId?: number | null;
  relatedMeetingId?: number | null;
  relatedRelationshipOverlayId?: number | null;
  createdBy?: number | null;
}

export async function createEvent(input: CreateEventInput): Promise<BrainCalendarEvent> {
  if (input.endAt < input.startAt) {
    throw new Error('endAt must be >= startAt');
  }
  const [created] = await db.insert(brainCalendarEvents).values({
    clientId: input.clientId,
    title: input.title.trim().slice(0, 255),
    description: input.description ?? null,
    startAt: input.startAt,
    endAt: input.endAt,
    allDay: input.allDay ?? false,
    timezone: input.timezone ?? 'UTC',
    location: input.location ?? null,
    link: input.link ?? null,
    relatedTaskId: input.relatedTaskId ?? null,
    relatedMeetingId: input.relatedMeetingId ?? null,
    relatedRelationshipOverlayId: input.relatedRelationshipOverlayId ?? null,
    source: 'manual',
    createdBy: input.createdBy ?? null,
  }).returning();

  await logAudit({
    clientId: input.clientId,
    actorId: input.createdBy ?? null,
    action: 'calendar_event.created',
    entityType: 'brain_calendar_event',
    entityId: created.id,
  });
  return created;
}

interface UpdateEventInput {
  title?: string;
  description?: string | null;
  startAt?: Date;
  endAt?: Date;
  allDay?: boolean;
  timezone?: string;
  location?: string | null;
  link?: string | null;
  relatedTaskId?: number | null;
  relatedMeetingId?: number | null;
  relatedRelationshipOverlayId?: number | null;
}

export async function updateEvent(
  clientId: number,
  eventId: number,
  input: UpdateEventInput,
  actorId: number | null,
): Promise<BrainCalendarEvent | null> {
  const before = await getEvent(clientId, eventId);
  if (!before) return null;

  const startAt = input.startAt ?? before.startAt;
  const endAt = input.endAt ?? before.endAt;
  if (endAt < startAt) {
    throw new Error('endAt must be >= startAt');
  }

  const patch: Partial<typeof brainCalendarEvents.$inferInsert> = { updatedAt: new Date() };
  if (input.title !== undefined) patch.title = input.title.trim().slice(0, 255);
  if (input.description !== undefined) patch.description = input.description;
  if (input.startAt !== undefined) patch.startAt = input.startAt;
  if (input.endAt !== undefined) patch.endAt = input.endAt;
  if (input.allDay !== undefined) patch.allDay = input.allDay;
  if (input.timezone !== undefined) patch.timezone = input.timezone;
  if (input.location !== undefined) patch.location = input.location;
  if (input.link !== undefined) patch.link = input.link;
  if (input.relatedTaskId !== undefined) patch.relatedTaskId = input.relatedTaskId;
  if (input.relatedMeetingId !== undefined) patch.relatedMeetingId = input.relatedMeetingId;
  if (input.relatedRelationshipOverlayId !== undefined) patch.relatedRelationshipOverlayId = input.relatedRelationshipOverlayId;

  const [updated] = await db.update(brainCalendarEvents).set(patch)
    .where(and(eq(brainCalendarEvents.id, eventId), eq(brainCalendarEvents.clientId, clientId)))
    .returning();

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'calendar_event.updated',
      entityType: 'brain_calendar_event',
      entityId: eventId,
      metadata: { changedFields: Object.keys(input) },
    });
  }
  return updated ?? null;
}

export async function deleteEvent(clientId: number, eventId: number, actorId: number | null): Promise<boolean> {
  const before = await getEvent(clientId, eventId);
  if (!before) return false;
  await db.delete(brainCalendarEvents)
    .where(and(eq(brainCalendarEvents.id, eventId), eq(brainCalendarEvents.clientId, clientId)));
  await logAudit({
    clientId,
    actorId,
    action: 'calendar_event.deleted',
    entityType: 'brain_calendar_event',
    entityId: eventId,
  });
  return true;
}

// ─── Agenda ──────────────────────────────────────────────────────────────────
// Aggregated, normalized view of everything-with-a-date for a date range:
// brain calendar events + tasks (by dueDate) + meetings (by meetingDate) +
// relationships (by nextReviewAt). One stable item type for the UI.

export type AgendaItemKind = 'event' | 'task_due' | 'meeting' | 'relationship_review';

export interface AgendaItem {
  kind: AgendaItemKind;
  /** Stable cross-kind id, "kind:id". */
  key: string;
  /** Source row id. */
  id: number;
  title: string;
  /** Always set; UI groups by local-date(startAt). */
  startAt: string;
  /** Set for events, equal to startAt otherwise. */
  endAt: string | null;
  allDay: boolean;
  /** Optional secondary line (e.g. relationship name, priority). */
  subtitle?: string;
  /** Where to send the user when they click. */
  href: string;
}

export async function getAgenda(
  clientId: number,
  from: Date,
  to: Date,
): Promise<AgendaItem[]> {
  const [events, tasks, meetings, overlays] = await Promise.all([
    listEvents(clientId, { from, to }),

    db.select().from(brainTasks)
      .where(and(
        eq(brainTasks.clientId, clientId),
        isNotNull(brainTasks.dueDate),
        gte(brainTasks.dueDate, from),
        lt(brainTasks.dueDate, to),
      )),

    db.select().from(brainMeetings)
      .where(and(
        eq(brainMeetings.clientId, clientId),
        isNotNull(brainMeetings.meetingDate),
        gte(brainMeetings.meetingDate, from),
        lt(brainMeetings.meetingDate, to),
      )),

    db.select().from(brainRelationshipOverlays)
      .where(and(
        eq(brainRelationshipOverlays.clientId, clientId),
        isNotNull(brainRelationshipOverlays.nextReviewAt),
        gte(brainRelationshipOverlays.nextReviewAt, from),
        lt(brainRelationshipOverlays.nextReviewAt, to),
      )),
  ]);

  // Resolve overlay names (companies/deals) so the agenda can render a label.
  const companyIds = overlays.map((o) => o.companyId).filter((v): v is number => v !== null);
  const dealIds = overlays.map((o) => o.dealId).filter((v): v is number => v !== null);
  const [companies, deals] = await Promise.all([
    companyIds.length > 0
      ? db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies).where(inArray(crmCompanies.id, companyIds))
      : Promise.resolve([] as { id: number; name: string }[]),
    dealIds.length > 0
      ? db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals).where(inArray(crmDeals.id, dealIds))
      : Promise.resolve([] as { id: number; title: string }[]),
  ]);
  const companyMap = new Map(companies.map((c) => [c.id, c.name]));
  const dealMap = new Map(deals.map((d) => [d.id, d.title]));

  const items: AgendaItem[] = [];

  for (const e of events) {
    items.push({
      kind: 'event',
      key: `event:${e.id}`,
      id: e.id,
      title: e.title,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      allDay: e.allDay,
      subtitle: e.location ?? undefined,
      href: `/portal/brain/calendar?event=${e.id}`,
    });
  }

  for (const t of tasks) {
    if (!t.dueDate) continue;
    items.push({
      kind: 'task_due',
      key: `task_due:${t.id}`,
      id: t.id,
      title: t.title,
      startAt: t.dueDate.toISOString(),
      endAt: null,
      allDay: true,
      subtitle: `${t.priority} · ${t.status}`,
      href: `/portal/brain/tasks?focus=${t.id}`,
    });
  }

  for (const m of meetings) {
    if (!m.meetingDate) continue;
    items.push({
      kind: 'meeting',
      key: `meeting:${m.id}`,
      id: m.id,
      title: m.title,
      startAt: m.meetingDate.toISOString(),
      endAt: null,
      allDay: false,
      subtitle: m.status.replace(/_/g, ' '),
      href: `/portal/brain/communications/${m.id}`,
    });
  }

  for (const o of overlays) {
    if (!o.nextReviewAt) continue;
    const name = o.companyId
      ? (companyMap.get(o.companyId) ?? `Company #${o.companyId}`)
      : o.dealId
        ? (dealMap.get(o.dealId) ?? `Deal #${o.dealId}`)
        : 'Relationship';
    items.push({
      kind: 'relationship_review',
      key: `relationship_review:${o.id}`,
      id: o.id,
      title: `Review: ${name}`,
      startAt: o.nextReviewAt.toISOString(),
      endAt: null,
      allDay: true,
      subtitle: `${o.relationshipType.replace(/_/g, ' ')} · ${o.priority}`,
      href: `/portal/brain/relationships/${o.id}`,
    });
  }

  // Stable sort by startAt
  items.sort((a, b) => a.startAt.localeCompare(b.startAt));
  return items;
}
