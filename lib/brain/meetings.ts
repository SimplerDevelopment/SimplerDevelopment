import { db } from '@/lib/db';
import {
  brainMeetings,
  brainMeetingParticipants,
  brainAiJobs,
  brainAiReviewItems,
  brainRelationshipOverlays,
  crmCompanies,
  crmDeals,
  type BrainMeetingStatus,
} from '@/lib/db/schema';
import { eq, and, desc, asc, sql } from 'drizzle-orm';
import { logAudit } from './audit';
import { getMeetingAdapter, type AdapterContext, type NormalizedMeetingInput } from './meeting-sources';
import { stripQuotedReply } from './strip-quoted';

export type BrainMeeting = typeof brainMeetings.$inferSelect;
export type BrainMeetingParticipant = typeof brainMeetingParticipants.$inferSelect;

/**
 * Lightweight per-segment shape for the Gmail thread timeline. Skips heavier
 * fields (aiSummary, humanSummary, reviewedAt, etc.) that aren't needed for
 * rendering each sibling message in the thread view.
 */
export interface ThreadSegment {
  id: number;
  title: string;
  meetingDate: Date | null;
  createdAt: Date;
  transcript: string | null;
  sourceMetadata: BrainMeeting['sourceMetadata'];
}

/**
 * Joins a Gmail thread's segments into one transcript that the AI processor
 * can reason about as a conversation. Each segment is preceded by a small
 * `From / Date / To` header and uses stripQuotedReply to drop inline-quoted
 * history (which would otherwise repeat content already present in earlier
 * segments). Segments without a body are skipped.
 */
export function buildThreadTranscript(thread: ThreadSegment[]): string {
  const parts: string[] = [];
  for (const seg of thread) {
    const meta = (seg.sourceMetadata ?? null) as { from?: string; to?: string } | null;
    const date = seg.meetingDate ? new Date(seg.meetingDate) : new Date(seg.createdAt);
    const { body } = stripQuotedReply(seg.transcript);
    if (!body) continue;
    const header = [
      `From: ${meta?.from ?? '(unknown sender)'}`,
      `Date: ${date.toISOString()}`,
      meta?.to ? `To: ${meta.to}` : null,
    ].filter(Boolean).join('\n');
    parts.push(`---\n${header}\n\n${body}`);
  }
  return parts.join('\n\n').trim();
}

/**
 * Collects unique participants across a thread by inspecting each segment's
 * sourceMetadata.from / senderEmail. Falls back gracefully when only one of
 * name or email is present. De-dupes case-insensitively on email (or name
 * when no email).
 */
export function collectThreadParticipants(thread: ThreadSegment[]): { name: string; email?: string }[] {
  const seen = new Map<string, { name: string; email?: string }>();
  for (const seg of thread) {
    const meta = (seg.sourceMetadata ?? null) as { from?: string; senderEmail?: string } | null;
    if (!meta?.from && !meta?.senderEmail) continue;
    const fromHeader = meta.from ?? '';
    const emailMatch = fromHeader.match(/<([^>]+)>/);
    const email = (meta.senderEmail || emailMatch?.[1] || '').toLowerCase().trim() || undefined;
    const namePart = fromHeader.replace(/<[^>]+>/, '').trim().replace(/^"|"$/g, '').trim();
    const name = namePart || email || 'Unknown';
    const key = (email || name).toLowerCase();
    if (!seen.has(key)) seen.set(key, { name, email });
  }
  return [...seen.values()];
}

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
  /**
   * Sibling Gmail messages in the same thread, ordered oldest → newest.
   * Only populated when source='gmail-api' AND sourceMetadata.gmailThreadId
   * is set AND the thread contains more than one message.
   */
  thread?: ThreadSegment[];
  /**
   * Latest AI job for this meeting (any type), most recent first by createdAt.
   * Used by the detail UI to surface a failure reason when a Draft meeting got
   * there because processing errored — without this, failures are silent.
   */
  latestJob?: {
    id: number;
    jobType: string;
    status: string;
    error: string | null;
    createdAt: string;
    completedAt: string | null;
  };
}

/**
 * Slim row shape returned by {@link listMeetings} by default. Omits the
 * heavy text columns — `transcript` can be tens of KB per meeting and
 * `aiSummary` / `humanSummary` add up fast across a tenant's history. The
 * list pages (`/portal/brain/communications`, the dashboard recent-comms
 * panel) only render id/title/date/status/source/createdAt + sourceMetadata.
 * Detail loaders (`getMeeting`) and the MCP fetch path keep returning the
 * full row including transcript.
 *
 * Defined as a structural shape rather than `Omit<BrainMeeting, ...>` so the
 * type doesn't force TS to materialize `BrainMeeting`'s full key set, which
 * cascades into "property missing" errors at consumer sites when
 * `drizzle-orm` typings are unavailable in a partial typecheck.
 */
export interface BrainMeetingListItem {
  id: number;
  clientId: number;
  companyId: number | null;
  dealId: number | null;
  title: string;
  meetingDate: Date | null;
  status: BrainMeetingStatus;
  reviewedBy: number | null;
  reviewedAt: Date | null;
  confidentialityLevel: string;
  source: string;
  sourceRef: string;
  sourceMetadata: Record<string, unknown> | null;
  createdBy: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function listMeetings(
  clientId: number,
  opts?: { status?: BrainMeetingStatus; limit?: number; includeTranscript?: boolean },
): Promise<BrainMeetingListItem[]> {
  const conditions = [eq(brainMeetings.clientId, clientId)];
  if (opts?.status) conditions.push(eq(brainMeetings.status, opts.status));

  if (opts?.includeTranscript) {
    // Opt-in path — return rows including transcript/aiSummary/humanSummary.
    // Returned as BrainMeetingListItem[] for a uniform signature; callers that
    // need the full BrainMeeting shape can cast or use a sibling helper. The
    // MCP path is the main caller; it forwards the rows verbatim to the model
    // which doesn't care about TS narrowing.
    const rows = await db.select().from(brainMeetings)
      .where(and(...conditions))
      .orderBy(desc(brainMeetings.createdAt))
      .limit(opts.limit ?? 100);
    return rows as BrainMeetingListItem[];
  }

  // Slim projection — drops transcript/aiSummary/humanSummary. Every other
  // column is preserved so existing list-page renderers (which read
  // sourceMetadata, source, status, etc.) keep working.
  return db.select({
    id: brainMeetings.id,
    clientId: brainMeetings.clientId,
    companyId: brainMeetings.companyId,
    dealId: brainMeetings.dealId,
    title: brainMeetings.title,
    meetingDate: brainMeetings.meetingDate,
    status: brainMeetings.status,
    reviewedBy: brainMeetings.reviewedBy,
    reviewedAt: brainMeetings.reviewedAt,
    confidentialityLevel: brainMeetings.confidentialityLevel,
    source: brainMeetings.source,
    sourceRef: brainMeetings.sourceRef,
    sourceMetadata: brainMeetings.sourceMetadata,
    createdBy: brainMeetings.createdBy,
    createdAt: brainMeetings.createdAt,
    updatedAt: brainMeetings.updatedAt,
  })
    .from(brainMeetings)
    .where(and(...conditions))
    .orderBy(desc(brainMeetings.createdAt))
    .limit(opts?.limit ?? 100);
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

  // Gmail thread context — surface sibling messages so the detail page can
  // render a segmented timeline. Each segment keeps its own attachments via
  // the existing /attachments/[idx] proxy keyed on the segment's row id.
  let thread: ThreadSegment[] | undefined;
  const meta = (row.sourceMetadata ?? null) as { gmailThreadId?: string } | null;
  if (row.source === 'gmail-api' && meta?.gmailThreadId) {
    const siblings = await db.select({
      id: brainMeetings.id,
      title: brainMeetings.title,
      meetingDate: brainMeetings.meetingDate,
      createdAt: brainMeetings.createdAt,
      transcript: brainMeetings.transcript,
      sourceMetadata: brainMeetings.sourceMetadata,
    }).from(brainMeetings)
      .where(and(
        eq(brainMeetings.clientId, clientId),
        eq(brainMeetings.source, 'gmail-api'),
        sql`brain_meetings.source_metadata->>'gmailThreadId' = ${meta.gmailThreadId}`,
      ))
      .orderBy(asc(brainMeetings.meetingDate));
    if (siblings.length > 1) thread = siblings;
  }

  // Latest AI job — surface failure reason when processing errored out and
  // silently reset the meeting to Draft. Filtering by input.meetingId so we
  // catch all job types (process_meeting, crm_classify, etc.) that ran on
  // this meeting.
  const [job] = await db.select({
    id: brainAiJobs.id,
    jobType: brainAiJobs.jobType,
    status: brainAiJobs.status,
    error: brainAiJobs.error,
    createdAt: brainAiJobs.createdAt,
    completedAt: brainAiJobs.completedAt,
  }).from(brainAiJobs)
    .where(and(
      eq(brainAiJobs.clientId, clientId),
      sql`(brain_ai_jobs.input->>'meetingId')::int = ${meetingId}`,
    ))
    .orderBy(desc(brainAiJobs.createdAt))
    .limit(1);
  const latestJob = job ? {
    id: job.id,
    jobType: job.jobType,
    status: job.status,
    error: job.error,
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt ? job.completedAt.toISOString() : null,
  } : undefined;

  return { ...row, participants, link, thread, latestJob };
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
  return await db.transaction(async (tx) => {
    // brain_ai_review_items.sourceId has no FK, so we must clean up orphans
    // explicitly before deleting the meeting. Without this the review queue
    // keeps showing items pointing at a meeting that no longer exists.
    await tx.delete(brainAiReviewItems).where(and(
      eq(brainAiReviewItems.clientId, clientId),
      eq(brainAiReviewItems.sourceType, 'meeting'),
      eq(brainAiReviewItems.sourceId, meetingId),
    ));

    const result = await tx.delete(brainMeetings)
      .where(and(eq(brainMeetings.id, meetingId), eq(brainMeetings.clientId, clientId)))
      .returning({ id: brainMeetings.id });
    return result.length > 0;
  });
}
