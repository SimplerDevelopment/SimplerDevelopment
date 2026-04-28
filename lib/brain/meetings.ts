import { db } from '@/lib/db';
import {
  brainMeetings,
  brainMeetingParticipants,
  brainRelationshipOverlays,
  crmCompanies,
  crmDeals,
  type BrainMeetingStatus,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { logAudit } from './audit';
import { getMeetingAdapter, type AdapterContext, type NormalizedMeetingInput } from './meeting-sources';

export type BrainMeeting = typeof brainMeetings.$inferSelect;
export type BrainMeetingParticipant = typeof brainMeetingParticipants.$inferSelect;

interface MeetingWithParticipants extends BrainMeeting {
  participants: BrainMeetingParticipant[];
  /** Set when the meeting links to a CRM record. */
  link?: {
    type: 'company' | 'deal';
    id: number;
    name: string;
    /** The Brain overlay id if one exists for this CRM record. */
    overlayId: number | null;
  };
}

export async function listMeetings(clientId: number, opts?: { status?: BrainMeetingStatus; limit?: number }): Promise<BrainMeeting[]> {
  const conditions = [eq(brainMeetings.clientId, clientId)];
  if (opts?.status) conditions.push(eq(brainMeetings.status, opts.status));
  const rows = await db.select().from(brainMeetings)
    .where(and(...conditions))
    .orderBy(desc(brainMeetings.createdAt))
    .limit(opts?.limit ?? 100);
  return rows;
}

export async function getMeeting(clientId: number, meetingId: number): Promise<MeetingWithParticipants | null> {
  const [row] = await db.select().from(brainMeetings)
    .where(and(eq(brainMeetings.id, meetingId), eq(brainMeetings.clientId, clientId)))
    .limit(1);
  if (!row) return null;
  const participants = await db.select().from(brainMeetingParticipants)
    .where(eq(brainMeetingParticipants.meetingId, meetingId));

  let link: MeetingWithParticipants['link'];
  if (row.companyId !== null) {
    const [co] = await db.select({ id: crmCompanies.id, name: crmCompanies.name }).from(crmCompanies)
      .where(eq(crmCompanies.id, row.companyId)).limit(1);
    if (co) {
      const [overlay] = await db.select({ id: brainRelationshipOverlays.id }).from(brainRelationshipOverlays)
        .where(and(eq(brainRelationshipOverlays.clientId, clientId), eq(brainRelationshipOverlays.companyId, co.id)))
        .limit(1);
      link = { type: 'company', id: co.id, name: co.name, overlayId: overlay?.id ?? null };
    }
  } else if (row.dealId !== null) {
    const [dl] = await db.select({ id: crmDeals.id, title: crmDeals.title }).from(crmDeals)
      .where(eq(crmDeals.id, row.dealId)).limit(1);
    if (dl) {
      const [overlay] = await db.select({ id: brainRelationshipOverlays.id }).from(brainRelationshipOverlays)
        .where(and(eq(brainRelationshipOverlays.clientId, clientId), eq(brainRelationshipOverlays.dealId, dl.id)))
        .limit(1);
      link = { type: 'deal', id: dl.id, name: dl.title, overlayId: overlay?.id ?? null };
    }
  }

  return { ...row, participants, link };
}

interface CreateFromAdapterArgs {
  adapterId: string;
  input: unknown;
  ctx: AdapterContext;
  /** Optional CRM-relationship link set at creation time. */
  link?: { companyId?: number | null; dealId?: number | null };
}

/**
 * The single entry point for creating a meeting from any adapter. Inserts the
 * brain_meetings row, persists participants, writes an audit log, and returns
 * the new row. Callers decide whether to enqueue AI processing afterwards.
 *
 * Idempotent on (clientId, sourceRef): re-importing the same source updates
 * the existing draft instead of creating a duplicate.
 */
export async function createMeetingFromAdapter({ adapterId, input, ctx, link }: CreateFromAdapterArgs): Promise<BrainMeeting> {
  const adapter = getMeetingAdapter(adapterId);
  if (!adapter) throw new Error(`Unknown meeting source adapter: ${adapterId}`);

  const enabled = await adapter.enabledFor(ctx.profile);
  if (!enabled) throw new Error(`Adapter ${adapterId} not enabled for this workspace.`);

  const normalized: NormalizedMeetingInput = await adapter.fetch(input, ctx);
  const title = normalized.title || `Meeting — ${new Date().toLocaleString()}`;
  const titleTrimmed = title.length > 255 ? `${title.slice(0, 252)}...` : title;

  // Idempotent on (clientId, sourceRef).
  const existing = await db.select().from(brainMeetings)
    .where(and(eq(brainMeetings.clientId, ctx.clientId), eq(brainMeetings.sourceRef, normalized.sourceRef)))
    .limit(1);

  let meeting: BrainMeeting;
  if (existing[0]) {
    const [updated] = await db.update(brainMeetings).set({
      title: titleTrimmed,
      transcript: normalized.transcript,
      meetingDate: normalized.meetingDate ?? existing[0].meetingDate,
      sourceMetadata: normalized.sourceMetadata ?? existing[0].sourceMetadata,
      updatedAt: new Date(),
    }).where(eq(brainMeetings.id, existing[0].id)).returning();
    meeting = updated;
  } else {
    const [created] = await db.insert(brainMeetings).values({
      clientId: ctx.clientId,
      companyId: link?.companyId ?? null,
      dealId: link?.dealId ?? null,
      title: titleTrimmed,
      meetingDate: normalized.meetingDate,
      transcript: normalized.transcript,
      status: 'draft',
      confidentialityLevel: ctx.profile.defaultConfidentiality,
      source: adapter.id,
      sourceRef: normalized.sourceRef,
      sourceMetadata: normalized.sourceMetadata ?? {},
      createdBy: ctx.userId,
    }).returning();
    meeting = created;

    if (normalized.participants?.length) {
      await db.insert(brainMeetingParticipants).values(
        normalized.participants.map((p) => ({
          meetingId: meeting.id,
          name: p.name,
          email: p.email,
          contactId: p.contactId ?? null,
          roleInMeeting: p.roleInMeeting ?? null,
        })),
      );
    }
  }

  await logAudit({
    clientId: ctx.clientId,
    actorId: ctx.userId,
    action: existing[0] ? 'meeting.reimported' : 'meeting.imported',
    entityType: 'brain_meeting',
    entityId: meeting.id,
    metadata: { adapterId: adapter.id, sourceRef: normalized.sourceRef, byteCount: normalized.transcript.length },
  });

  return meeting;
}

export async function linkMeeting(
  clientId: number,
  meetingId: number,
  link: { companyId?: number | null; dealId?: number | null },
): Promise<BrainMeeting | null> {
  const update: Partial<typeof brainMeetings.$inferInsert> = { updatedAt: new Date() };
  if (link.companyId !== undefined) update.companyId = link.companyId;
  if (link.dealId !== undefined) update.dealId = link.dealId;
  const [updated] = await db.update(brainMeetings).set(update)
    .where(and(eq(brainMeetings.id, meetingId), eq(brainMeetings.clientId, clientId)))
    .returning();
  return updated ?? null;
}

export async function updateMeetingStatus(
  clientId: number,
  meetingId: number,
  status: BrainMeetingStatus,
  reviewerId?: number,
): Promise<BrainMeeting | null> {
  const update: Partial<typeof brainMeetings.$inferInsert> = {
    status,
    updatedAt: new Date(),
  };
  if (status === 'approved') {
    update.reviewedBy = reviewerId ?? null;
    update.reviewedAt = new Date();
  }
  const [updated] = await db.update(brainMeetings).set(update)
    .where(and(eq(brainMeetings.id, meetingId), eq(brainMeetings.clientId, clientId)))
    .returning();
  return updated ?? null;
}

export async function setMeetingAiSummary(
  clientId: number,
  meetingId: number,
  aiSummary: string,
): Promise<BrainMeeting | null> {
  const [updated] = await db.update(brainMeetings).set({
    aiSummary,
    updatedAt: new Date(),
  })
    .where(and(eq(brainMeetings.id, meetingId), eq(brainMeetings.clientId, clientId)))
    .returning();
  return updated ?? null;
}

export async function deleteMeeting(clientId: number, meetingId: number): Promise<boolean> {
  const result = await db.delete(brainMeetings)
    .where(and(eq(brainMeetings.id, meetingId), eq(brainMeetings.clientId, clientId)))
    .returning({ id: brainMeetings.id });
  return result.length > 0;
}
