/**
 * Idempotent demo seed for Company Brain.
 *
 *   bun run scripts/seed-brain-demo.ts <clientId>
 *   bun run scripts/seed-brain-demo.ts --client-id=<clientId>
 *
 * Re-runnable: every insert checks for an existing row first (by name within
 * the tenant) and updates instead. Re-running on a seeded tenant should report
 * everything as "found-existing" and mutate nothing.
 *
 * Seeds (per spec, see docs/guides/BRAIN.md §"Seeded data"):
 *   - 1 brain_profiles row (industryTemplate = 'wealth_advisory', enabled=true).
 *   - 2 crm_companies (Acme Wealth Partners, Sunrise Family Office).
 *   - 2 crm_contacts per company.
 *   - 2 crm_deals (one Lead-stage, one Proposal-stage).
 *   - 1 brain_relationship_overlays per company.
 *   - 3 brain_meetings (approved + needs_review + draft).
 *   - 5 brain_tasks across open|in_progress|blocked|done.
 *   - 4 brain_notes in kb/discovery/* and kb/marketing/* tag folders.
 *   - 2 brain_note_templates (Daily standup, Discovery call notes).
 *   - 1 brain_saved_searches pinning tagPrefix='kb/discovery'.
 *
 * Notification preferences are NOT seeded — defaults work without rows.
 *
 * Pattern is from scripts/seed-portal-client.ts and scripts/seed-services.ts.
 */

import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env' });

interface Args {
  clientId: number;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  let clientId: number | null = null;

  for (const a of argv) {
    if (a.startsWith('--client-id=')) {
      clientId = parseInt(a.slice('--client-id='.length), 10);
    } else if (!a.startsWith('--')) {
      const n = parseInt(a, 10);
      if (Number.isFinite(n)) clientId = n;
    }
  }

  if (clientId === null || !Number.isFinite(clientId)) {
    console.error('Usage: bun run scripts/seed-brain-demo.ts <clientId>');
    console.error('   or: bun run scripts/seed-brain-demo.ts --client-id=<clientId>');
    process.exit(1);
  }

  return { clientId: clientId as number };
}

interface Counts {
  profile: { seeded: number; existing: number };
  companies: { seeded: number; existing: number };
  contacts: { seeded: number; existing: number };
  deals: { seeded: number; existing: number };
  overlays: { seeded: number; existing: number };
  meetings: { seeded: number; existing: number };
  tasks: { seeded: number; existing: number };
  notes: { seeded: number; existing: number };
  templates: { seeded: number; existing: number };
  savedSearches: { seeded: number; existing: number };
}

const counts: Counts = {
  profile: { seeded: 0, existing: 0 },
  companies: { seeded: 0, existing: 0 },
  contacts: { seeded: 0, existing: 0 },
  deals: { seeded: 0, existing: 0 },
  overlays: { seeded: 0, existing: 0 },
  meetings: { seeded: 0, existing: 0 },
  tasks: { seeded: 0, existing: 0 },
  notes: { seeded: 0, existing: 0 },
  templates: { seeded: 0, existing: 0 },
  savedSearches: { seeded: 0, existing: 0 },
};

async function run() {
  const { clientId } = parseArgs();

  const { db } = await import('../lib/db');
  const {
    clients,
    crmCompanies,
    crmContacts,
    crmDeals,
    crmPipelineStages,
    brainProfiles,
    brainRelationshipOverlays,
    brainMeetings,
    brainTasks,
    brainNotes,
    brainNoteTemplates,
    brainSavedSearches,
  } = await import('../lib/db/schema');
  const { ensureDefaultPipeline } = await import('../lib/crm/default-pipeline');
  const { and, asc, eq } = await import('drizzle-orm');

  // Sanity: confirm the client exists.
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) {
    console.error(`Client ${clientId} not found.`);
    process.exit(1);
  }

  console.log(`Seeding brain demo data for client ${clientId}…`);

  // ─── Brain profile ─────────────────────────────────────────────────────────
  const enabledModules = {
    meetings: true,
    tasks: true,
    prospects: true,
    knowledge: true,
    ask: true,
    automations: true,
    calendar: true,
  } as const;

  const [existingProfile] = await db.select().from(brainProfiles).where(eq(brainProfiles.clientId, clientId)).limit(1);
  if (existingProfile) {
    counts.profile.existing += 1;
  } else {
    await db.insert(brainProfiles).values({
      clientId,
      name: 'Demo Brain',
      industryTemplate: 'wealth_advisory',
      enabled: true,
      defaultConfidentiality: 'standard',
      enabledModules,
      serviceLines: ['Investments & Planning', 'Family Business'],
    });
    counts.profile.seeded += 1;
  }

  // ─── CRM companies ─────────────────────────────────────────────────────────
  const COMPANY_SEEDS = [
    { name: 'Acme Wealth Partners', domain: 'acmewealth.example.com', industry: 'Wealth Advisory' },
    { name: 'Sunrise Family Office', domain: 'sunrisefo.example.com', industry: 'Family Office' },
  ];

  const companyIds: Record<string, number> = {};
  for (const c of COMPANY_SEEDS) {
    const [existing] = await db.select({ id: crmCompanies.id })
      .from(crmCompanies)
      .where(and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.name, c.name)))
      .limit(1);
    if (existing) {
      companyIds[c.name] = existing.id;
      counts.companies.existing += 1;
    } else {
      const [inserted] = await db.insert(crmCompanies).values({
        clientId,
        name: c.name,
        domain: c.domain,
        industry: c.industry,
        notes: 'Seeded by scripts/seed-brain-demo.ts',
      }).returning({ id: crmCompanies.id });
      companyIds[c.name] = inserted.id;
      counts.companies.seeded += 1;
    }
  }

  // ─── CRM contacts (2 per company) ──────────────────────────────────────────
  const CONTACT_SEEDS: Array<{ company: string; firstName: string; lastName: string; email: string; title: string }> = [
    { company: 'Acme Wealth Partners', firstName: 'Jordan', lastName: 'Reyes', email: 'jordan@acmewealth.example.com', title: 'Managing Partner' },
    { company: 'Acme Wealth Partners', firstName: 'Priya', lastName: 'Shah', email: 'priya@acmewealth.example.com', title: 'Director of Operations' },
    { company: 'Sunrise Family Office', firstName: 'Eleanor', lastName: 'Park', email: 'eleanor@sunrisefo.example.com', title: 'Family Office Lead' },
    { company: 'Sunrise Family Office', firstName: 'Marcus', lastName: 'Nguyen', email: 'marcus@sunrisefo.example.com', title: 'Investment Analyst' },
  ];

  const contactIds: Record<string, number> = {};
  for (const c of CONTACT_SEEDS) {
    const companyId = companyIds[c.company];
    const [existing] = await db.select({ id: crmContacts.id })
      .from(crmContacts)
      .where(and(
        eq(crmContacts.clientId, clientId),
        eq(crmContacts.email, c.email),
      ))
      .limit(1);
    if (existing) {
      contactIds[c.email] = existing.id;
      counts.contacts.existing += 1;
    } else {
      const [inserted] = await db.insert(crmContacts).values({
        clientId,
        companyId,
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        title: c.title,
        status: 'lead',
      }).returning({ id: crmContacts.id });
      contactIds[c.email] = inserted.id;
      counts.contacts.seeded += 1;
    }
  }

  // ─── CRM deals (need a pipeline + stages) ──────────────────────────────────
  const pipeline = await ensureDefaultPipeline(clientId);
  const stages = await db.select({ id: crmPipelineStages.id, name: crmPipelineStages.name })
    .from(crmPipelineStages)
    .where(eq(crmPipelineStages.pipelineId, pipeline.id))
    .orderBy(asc(crmPipelineStages.sortOrder));

  const stageByName = new Map(stages.map((s) => [s.name.toLowerCase(), s.id]));
  const leadStageId = stageByName.get('lead') ?? stages[0]?.id;
  const proposalStageId = stageByName.get('proposal') ?? stages[2]?.id ?? stages[0]?.id;

  if (!leadStageId || !proposalStageId) {
    console.error('Could not resolve default pipeline stages — aborting deal seed.');
    process.exit(1);
  }

  const DEAL_SEEDS = [
    {
      title: 'Acme — Q3 advisory expansion',
      stageId: leadStageId,
      companyName: 'Acme Wealth Partners',
      contactEmail: 'jordan@acmewealth.example.com',
      value: 4500000, // $45,000
      priority: 'medium' as const,
    },
    {
      title: 'Sunrise — proposal sent for FO retainer',
      stageId: proposalStageId,
      companyName: 'Sunrise Family Office',
      contactEmail: 'eleanor@sunrisefo.example.com',
      value: 12000000, // $120,000
      priority: 'high' as const,
    },
  ];

  const dealIds: Record<string, number> = {};
  for (const d of DEAL_SEEDS) {
    const [existing] = await db.select({ id: crmDeals.id })
      .from(crmDeals)
      .where(and(eq(crmDeals.clientId, clientId), eq(crmDeals.title, d.title)))
      .limit(1);
    if (existing) {
      dealIds[d.title] = existing.id;
      counts.deals.existing += 1;
    } else {
      const [inserted] = await db.insert(crmDeals).values({
        clientId,
        pipelineId: pipeline.id,
        stageId: d.stageId,
        contactId: contactIds[d.contactEmail],
        companyId: companyIds[d.companyName],
        title: d.title,
        value: d.value,
        priority: d.priority,
        status: 'open',
      }).returning({ id: crmDeals.id });
      dealIds[d.title] = inserted.id;
      counts.deals.seeded += 1;
    }
  }

  // ─── Relationship overlays (1 per company) ─────────────────────────────────
  const OVERLAY_SEEDS = [
    {
      companyName: 'Acme Wealth Partners',
      relationshipType: 'plan_sponsor',
      priority: 'high' as const,
      summary: 'Multi-generational wealth advisory engagement. Primary sponsor: Jordan Reyes.',
      currentPriorities: 'Q3 portfolio rebalance; onboarding of family business succession plan.',
      openLoops: 'Awaiting compliance sign-off on tax overlay strategy; follow-up call scheduled.',
      serviceLines: ['Investments & Planning', 'Family Business'],
      staleAfterDays: 30,
    },
    {
      companyName: 'Sunrise Family Office',
      relationshipType: 'household',
      priority: 'critical' as const,
      summary: 'Single-family office covering investments, estate planning, and crypto education.',
      currentPriorities: 'Finalize discovery deliverables; confirm proposal scope.',
      openLoops: 'Need IPS draft from CIO; pending answer on crypto allocation tolerance.',
      serviceLines: ['Investments & Planning', 'Cryptocurrency Education'],
      staleAfterDays: 21,
    },
  ];

  const overlayIds: Record<string, number> = {};
  for (const o of OVERLAY_SEEDS) {
    const companyId = companyIds[o.companyName];
    const [existing] = await db.select({ id: brainRelationshipOverlays.id })
      .from(brainRelationshipOverlays)
      .where(and(
        eq(brainRelationshipOverlays.clientId, clientId),
        eq(brainRelationshipOverlays.companyId, companyId),
      ))
      .limit(1);
    if (existing) {
      overlayIds[o.companyName] = existing.id;
      counts.overlays.existing += 1;
    } else {
      const [inserted] = await db.insert(brainRelationshipOverlays).values({
        clientId,
        companyId,
        relationshipType: o.relationshipType,
        status: 'active',
        priority: o.priority,
        serviceLines: o.serviceLines,
        summary: o.summary,
        currentPriorities: o.currentPriorities,
        openLoops: o.openLoops,
        confidentialityLevel: 'standard',
        staleAfterDays: o.staleAfterDays,
        lastTouchAt: new Date(),
      }).returning({ id: brainRelationshipOverlays.id });
      overlayIds[o.companyName] = inserted.id;
      counts.overlays.seeded += 1;
    }
  }

  // ─── Meetings ──────────────────────────────────────────────────────────────
  const MEETING_SEEDS = [
    {
      title: 'Acme Q3 Strategy Review',
      sourceRef: 'demo:acme-q3-strategy',
      status: 'approved' as const,
      companyName: 'Acme Wealth Partners',
      transcript: 'Jordan walked through Q3 priorities: rebalance the portfolio toward fixed income and finalize the succession plan for the family business. Action items captured.',
      aiSummary: 'Q3 priorities: portfolio rebalance toward fixed income; succession plan finalization. Two follow-ups committed: send revised IPS by Friday; schedule estate counsel call.',
      humanSummary: 'Confirmed Q3 priorities and committed to two follow-ups. Reviewed and approved.',
    },
    {
      title: 'Sunrise Discovery Call',
      sourceRef: 'demo:sunrise-discovery',
      status: 'needs_review' as const,
      companyName: 'Sunrise Family Office',
      transcript: 'Eleanor described the family office structure and current gaps: no formal IPS, ad-hoc crypto exposure, estate plan last refreshed 7 years ago.',
      aiSummary: 'Discovery surfaced three gaps: missing IPS, unmanaged crypto exposure, dated estate plan. Proposal scope should cover all three.',
      humanSummary: null,
    },
    {
      title: 'Internal — Compliance Calibration',
      sourceRef: 'demo:internal-compliance',
      status: 'draft' as const,
      companyName: null,
      transcript: 'Pending — transcript not yet pasted in.',
      aiSummary: null,
      humanSummary: null,
    },
  ];

  const meetingIds: Record<string, number> = {};
  for (const m of MEETING_SEEDS) {
    const [existing] = await db.select({ id: brainMeetings.id })
      .from(brainMeetings)
      .where(and(
        eq(brainMeetings.clientId, clientId),
        eq(brainMeetings.sourceRef, m.sourceRef),
      ))
      .limit(1);
    if (existing) {
      meetingIds[m.sourceRef] = existing.id;
      counts.meetings.existing += 1;
    } else {
      const [inserted] = await db.insert(brainMeetings).values({
        clientId,
        companyId: m.companyName ? companyIds[m.companyName] : null,
        title: m.title,
        meetingDate: new Date(),
        transcript: m.transcript,
        aiSummary: m.aiSummary,
        humanSummary: m.humanSummary,
        status: m.status,
        confidentialityLevel: 'standard',
        source: 'paste',
        sourceRef: m.sourceRef,
        sourceMetadata: { seededBy: 'seed-brain-demo' },
      }).returning({ id: brainMeetings.id });
      meetingIds[m.sourceRef] = inserted.id;
      counts.meetings.seeded += 1;
    }
  }

  // ─── Tasks (5, mixed status) ───────────────────────────────────────────────
  const TASK_SEEDS: Array<{
    title: string;
    status: 'open' | 'in_progress' | 'blocked' | 'done';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    description: string;
    blockedReason?: string;
    companyName?: string;
    meetingSourceRef?: string;
  }> = [
    {
      title: 'Send revised IPS to Acme',
      status: 'open',
      priority: 'high',
      description: 'Per Q3 review — incorporate fixed-income shift.',
      companyName: 'Acme Wealth Partners',
      meetingSourceRef: 'demo:acme-q3-strategy',
    },
    {
      title: 'Schedule estate counsel call for Acme succession plan',
      status: 'in_progress',
      priority: 'medium',
      description: 'Coordinate with external counsel. Target: end of week.',
      companyName: 'Acme Wealth Partners',
    },
    {
      title: 'Draft IPS for Sunrise',
      status: 'blocked',
      priority: 'high',
      description: 'Discovery surfaced no formal IPS.',
      blockedReason: 'Awaiting CIO input on crypto allocation tolerance.',
      companyName: 'Sunrise Family Office',
      meetingSourceRef: 'demo:sunrise-discovery',
    },
    {
      title: 'Refresh Sunrise estate plan',
      status: 'open',
      priority: 'medium',
      description: 'Plan last refreshed 7 years ago — flag to estate team.',
      companyName: 'Sunrise Family Office',
    },
    {
      title: 'Confirm Q3 advisory expansion budget approval',
      status: 'done',
      priority: 'low',
      description: 'Internal sign-off from finance — completed last week.',
      companyName: 'Acme Wealth Partners',
    },
  ];

  for (const t of TASK_SEEDS) {
    const [existing] = await db.select({ id: brainTasks.id })
      .from(brainTasks)
      .where(and(
        eq(brainTasks.clientId, clientId),
        eq(brainTasks.title, t.title),
      ))
      .limit(1);
    if (existing) {
      counts.tasks.existing += 1;
    } else {
      await db.insert(brainTasks).values({
        clientId,
        companyId: t.companyName ? companyIds[t.companyName] : null,
        meetingId: t.meetingSourceRef ? meetingIds[t.meetingSourceRef] : null,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        blockedReason: t.blockedReason,
        source: t.meetingSourceRef ? 'meeting' : 'manual',
      });
      counts.tasks.seeded += 1;
    }
  }

  // ─── Notes (4, slash-prefix tag folders) ──────────────────────────────────
  const NOTE_SEEDS: Array<{ title: string; body: string; tags: string[]; companyName?: string }> = [
    {
      title: 'Discovery checklist — Sunrise',
      body: '- Family structure mapped\n- Asset inventory pulled\n- Current IPS: none\n- Crypto exposure: ~12%\n- Estate plan: last refreshed 2019',
      tags: ['kb/discovery', 'kb/discovery/sunrise'],
      companyName: 'Sunrise Family Office',
    },
    {
      title: 'Acme onboarding playbook',
      body: 'Standard onboarding flow for plan-sponsor relationships. 4 phases: discovery → IPS → implementation → review.',
      tags: ['kb/discovery', 'kb/discovery/playbooks'],
      companyName: 'Acme Wealth Partners',
    },
    {
      title: 'Marketing — referral partner outreach script',
      body: 'Cold outreach template for CPA referral partners. Lead with shared-client framing.',
      tags: ['kb/marketing', 'kb/marketing/outreach'],
    },
    {
      title: 'Marketing — Q3 content calendar',
      body: 'Three-pillar content plan for Q3: market commentary, succession planning, crypto education.',
      tags: ['kb/marketing', 'kb/marketing/content'],
    },
  ];

  for (const n of NOTE_SEEDS) {
    const [existing] = await db.select({ id: brainNotes.id })
      .from(brainNotes)
      .where(and(
        eq(brainNotes.clientId, clientId),
        eq(brainNotes.title, n.title),
      ))
      .limit(1);
    if (existing) {
      counts.notes.existing += 1;
    } else {
      await db.insert(brainNotes).values({
        clientId,
        title: n.title,
        body: n.body,
        tags: n.tags,
        companyId: n.companyName ? companyIds[n.companyName] : null,
        confidentialityLevel: 'standard',
        source: 'manual',
      });
      counts.notes.seeded += 1;
    }
  }

  // ─── Note templates ────────────────────────────────────────────────────────
  const TEMPLATE_SEEDS: Array<{
    name: string;
    body: string;
    trigger: 'manual' | 'daily';
    defaultTags: string[];
  }> = [
    {
      name: 'Daily standup',
      body: '## What I did yesterday\n\n## What I am doing today\n\n## Blockers\n',
      trigger: 'daily',
      defaultTags: ['daily', 'standup'],
    },
    {
      name: 'Discovery call notes',
      body: '## Attendees\n\n## Goals\n\n## Pain points\n\n## Action items\n\n## Follow-up date\n',
      trigger: 'manual',
      defaultTags: ['kb/discovery'],
    },
  ];

  for (const t of TEMPLATE_SEEDS) {
    const [existing] = await db.select({ id: brainNoteTemplates.id })
      .from(brainNoteTemplates)
      .where(and(
        eq(brainNoteTemplates.clientId, clientId),
        eq(brainNoteTemplates.name, t.name),
      ))
      .limit(1);
    if (existing) {
      counts.templates.existing += 1;
    } else {
      await db.insert(brainNoteTemplates).values({
        clientId,
        name: t.name,
        body: t.body,
        trigger: t.trigger,
        defaultTags: t.defaultTags,
        enabled: true,
      });
      counts.templates.seeded += 1;
    }
  }

  // ─── Saved searches ───────────────────────────────────────────────────────
  const SAVED_NAME = 'Discovery folder';
  const [existingSaved] = await db.select({ id: brainSavedSearches.id })
    .from(brainSavedSearches)
    .where(and(
      eq(brainSavedSearches.clientId, clientId),
      eq(brainSavedSearches.name, SAVED_NAME),
    ))
    .limit(1);
  if (existingSaved) {
    counts.savedSearches.existing += 1;
  } else {
    await db.insert(brainSavedSearches).values({
      clientId,
      userId: null, // shared
      name: SAVED_NAME,
      icon: 'folder',
      filters: {
        tagPrefix: 'kb/discovery',
        sort: 'updated',
        order: 'desc',
      },
      sortOrder: 0,
    });
    counts.savedSearches.seeded += 1;
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\nDone. Summary (seeded / found-existing):');
  const rows: Array<[string, { seeded: number; existing: number }]> = [
    ['brain_profile           ', counts.profile],
    ['crm_companies           ', counts.companies],
    ['crm_contacts            ', counts.contacts],
    ['crm_deals               ', counts.deals],
    ['relationship_overlays   ', counts.overlays],
    ['brain_meetings          ', counts.meetings],
    ['brain_tasks             ', counts.tasks],
    ['brain_notes             ', counts.notes],
    ['brain_note_templates    ', counts.templates],
    ['brain_saved_searches    ', counts.savedSearches],
  ];
  for (const [label, c] of rows) {
    console.log(`  ${label}  seeded=${c.seeded}  existing=${c.existing}`);
  }
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('seed-brain-demo failed:', err);
    process.exit(1);
  });
