/**
 * Smoke test for the brain → CRM auto-linking pipeline. NOT a unit test —
 * it touches the configured DATABASE_URL and calls the live Anthropic API.
 *
 * Usage:
 *   tsx scripts/smoke-classify-crm.ts <client_id>
 *
 * Assumes brain_profiles for that client has autoLinkCrm = true. Resets
 * any state it creates with a single console.log + clearly-prefixed source_ref.
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

import { db } from '@/lib/db';
import {
  brainMeetings,
  brainAiReviewItems,
  brainMeetingParticipants,
  brainProfiles,
  crmContacts,
  crmCompanies,
  users,
  clientMembers,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { processBrainMeeting } from '@/lib/brain/process-meeting';

async function main() {
  const clientId = Number(process.argv[2] ?? '98');
  if (!Number.isFinite(clientId)) throw new Error('Pass a numeric client_id as arg 1');

  const sourceRef = `smoke-classify-${Date.now()}`;
  console.log(`[smoke] client=${clientId} source_ref=${sourceRef}`);

  // 1. Ensure profile flags.
  const [profile] = await db.select().from(brainProfiles).where(eq(brainProfiles.clientId, clientId)).limit(1);
  if (!profile) throw new Error(`No brain_profile for client ${clientId}`);
  console.log(`[smoke] profile: enabled=${profile.enabled} autoProcessEmail=${profile.autoProcessEmail} autoLinkCrm=${profile.autoLinkCrm}`);

  // 2. Find a user to attribute the AI job to (owner > first member).
  const [owner] = await db.select().from(users)
    .innerJoin(clientMembers, and(eq(clientMembers.userId, users.id), eq(clientMembers.clientId, clientId)))
    .limit(1);
  const userId = owner?.users.id ?? 1;
  console.log(`[smoke] userId=${userId}`);

  // 3. Insert a draft brain_meeting with email source — mirrors the inbound
  //    handler's insert.
  const [meeting] = await db.insert(brainMeetings).values({
    clientId,
    title: 'Following up on Q2 proposal — smoke',
    transcript:
      "Hi Dan,\n\nCircling back on the Q2 proposal we discussed last week. " +
      "Can you send the updated pricing tier breakdown by Friday? We'd like to move forward " +
      "and get this signed before end of month.\n\nThanks,\nJane Doe\nVP of Operations\nACME Corp",
    status: 'draft',
    source: 'email',
    sourceRef,
    sourceMetadata: {
      from: 'Jane Doe <jane@acmecorp.test>',
      to: `brain+${profile.emailIngestToken}@simplerdevelopment.com`,
      senderEmail: 'jane@acmecorp.test',
      attachments: [],
    },
    createdBy: userId,
  }).returning();
  console.log(`[smoke] inserted meeting id=${meeting.id}`);

  // 4. Run the pipeline.
  const t0 = Date.now();
  const result = await processBrainMeeting({
    clientId,
    meetingId: meeting.id,
    userId,
  });
  const elapsed = Date.now() - t0;
  console.log(`[smoke] processBrainMeeting completed in ${elapsed}ms`);
  console.log(`[smoke] result:`, JSON.stringify(result, null, 2));

  // 5. Read back state.
  const [updatedMeeting] = await db.select().from(brainMeetings).where(eq(brainMeetings.id, meeting.id)).limit(1);
  console.log(`[smoke] meeting.status=${updatedMeeting.status} companyId=${updatedMeeting.companyId} dealId=${updatedMeeting.dealId} aiSummary?=${!!updatedMeeting.aiSummary}`);

  const participants = await db.select().from(brainMeetingParticipants).where(eq(brainMeetingParticipants.meetingId, meeting.id));
  console.log(`[smoke] participants (${participants.length}):`);
  for (const p of participants) console.log(`  - ${p.name} <${p.email}> contactId=${p.contactId} role=${p.roleInMeeting}`);

  const [contact] = await db.select().from(crmContacts).where(and(eq(crmContacts.clientId, clientId), eq(crmContacts.email, 'jane@acmecorp.test'))).limit(1);
  console.log(`[smoke] crm_contact:`, contact ? { id: contact.id, firstName: contact.firstName, lastName: contact.lastName, status: contact.status, companyId: contact.companyId } : 'NONE');

  const reviewItems = await db.select().from(brainAiReviewItems)
    .where(and(eq(brainAiReviewItems.clientId, clientId), eq(brainAiReviewItems.sourceType, 'meeting'), eq(brainAiReviewItems.sourceId, meeting.id)))
    .orderBy(desc(brainAiReviewItems.createdAt));
  console.log(`[smoke] review_items (${reviewItems.length}):`);
  for (const r of reviewItems) console.log(`  - id=${r.id} type=${r.proposedType} status=${r.status}`);

  const acmeCompanies = await db.select().from(crmCompanies).where(and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.domain, 'acmecorp.test')));
  console.log(`[smoke] crm_companies for acmecorp.test (${acmeCompanies.length}):`);
  for (const c of acmeCompanies) console.log(`  - id=${c.id} name=${c.name}`);

  console.log(`[smoke] sourceRef=${sourceRef} — sweep with: DELETE FROM brain_meetings WHERE source_ref='${sourceRef}';`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[smoke] FAILED:', e);
  process.exit(1);
});
