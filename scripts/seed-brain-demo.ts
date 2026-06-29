/**
 * Idempotent demo seed for Company Brain.
 *
 *   bun run scripts/seed-brain-demo.ts <clientId>
 *   bun run scripts/seed-brain-demo.ts --client-id=<clientId>
 *
 * Re-runnable: every insert checks for an existing row first (by a stable key
 * within the tenant) and skips instead of duplicating. Re-running on a seeded
 * tenant should report everything as "found-existing" and mutate nothing.
 *
 * Structure: the demo content lives in ./seed-brain-demo.data.ts (pure, static
 * descriptors keyed by stable strings); this file owns orchestration. The
 * repeated find-or-create dance is collapsed into the `upsert` factory below,
 * so each entity is one declarative call instead of a hand-rolled loop.
 *
 * Seeds (per spec, see docs/guides/BRAIN.md §"Seeded data"):
 *   - 1 brain_profiles (industryTemplate = 'wealth_advisory', enabled=true)
 *   - 2 crm_companies, 2 crm_contacts each, 2 crm_deals (Lead + Proposal stage)
 *   - 1 brain_relationship_overlays per company
 *   - 3 brain_meetings (approved + needs_review + draft)
 *   - 5 brain_tasks across open|in_progress|blocked|done
 *   - 4 brain_notes in kb/discovery/* and kb/marketing/* tag folders
 *   - 2 brain_note_templates, 1 brain_saved_searches (tagPrefix='kb/discovery')
 *   - 3 brain_decisions, 4 brain_people, 4 brain_glossary_terms, 2 brain_initiatives
 *
 * Notification preferences are NOT seeded — defaults work without rows.
 * Pattern is from scripts/seed-portal-client.ts and scripts/seed-services.ts.
 */

import * as dotenv from 'dotenv';
import type { SQL } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import {
  PROFILE_SEED,
  COMPANY_SEEDS,
  CONTACT_SEEDS,
  DEAL_SEEDS,
  OVERLAY_SEEDS,
  MEETING_SEEDS,
  TASK_SEEDS,
  NOTE_SEEDS,
  TEMPLATE_SEEDS,
  SAVED_SEARCH_SEED,
  DECISION_SEEDS,
  PEOPLE_SEEDS,
  GLOSSARY_SEEDS,
  INITIATIVE_SEEDS,
} from './seed-brain-demo.data';

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

type SeedBucket = { seeded: number; existing: number };

interface Counts {
  profile: SeedBucket;
  companies: SeedBucket;
  contacts: SeedBucket;
  deals: SeedBucket;
  overlays: SeedBucket;
  meetings: SeedBucket;
  tasks: SeedBucket;
  notes: SeedBucket;
  templates: SeedBucket;
  savedSearches: SeedBucket;
  decisions: SeedBucket;
  people: SeedBucket;
  glossary: SeedBucket;
  initiatives: SeedBucket;
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
  decisions: { seeded: 0, existing: 0 },
  people: { seeded: 0, existing: 0 },
  glossary: { seeded: 0, existing: 0 },
  initiatives: { seeded: 0, existing: 0 },
};

/** slugify helpers — used by the glossary/initiative lazy value builders. */
function slugifyGlossary(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'term';
}

function slugifyInitiative(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 140) || 'initiative';
}

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
    brainDecisions,
    brainPeople,
    brainGlossaryTerms,
    brainInitiatives,
  } = await import('../lib/db/schema');
  const { ensureDefaultPipeline } = await import('../lib/crm/default-pipeline');
  const { and, asc, eq } = await import('drizzle-orm');

  /**
   * Find-or-create factory. Looks the row up by `where` (a tenant-scoped unique
   * match); if absent, inserts `values` (eager object or a lazy thunk, for rows
   * that must compute a unique slug only when actually inserting). Increments
   * the right counter, optionally logs on insert, and returns the row id so
   * callers can wire later entities to it.
   */
  async function upsert<T extends PgTable & { id: PgColumn }>(
    table: T,
    where: SQL,
    bucket: SeedBucket,
    values: T['$inferInsert'] | (() => T['$inferInsert'] | Promise<T['$inferInsert']>),
    label?: string,
  ): Promise<number> {
    const [existing] = await db.select({ id: table.id }).from(table).where(where).limit(1);
    if (existing) {
      bucket.existing += 1;
      return existing.id as number;
    }
    const row = typeof values === 'function' ? await (values as () => Promise<T['$inferInsert']>)() : values;
    const [inserted] = await db.insert(table).values(row).returning({ id: table.id });
    bucket.seeded += 1;
    if (label) console.log(label);
    return inserted.id as number;
  }

  // Sanity: confirm the client exists.
  const [client] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) {
    console.error(`Client ${clientId} not found.`);
    process.exit(1);
  }

  console.log(`Seeding brain demo data for client ${clientId}…`);

  // ─── Brain profile (one per client) ────────────────────────────────────────
  await upsert(brainProfiles, eq(brainProfiles.clientId, clientId), counts.profile, {
    clientId,
    name: PROFILE_SEED.name,
    industryTemplate: PROFILE_SEED.industryTemplate,
    enabled: PROFILE_SEED.enabled,
    defaultConfidentiality: PROFILE_SEED.defaultConfidentiality,
    enabledModules: PROFILE_SEED.enabledModules,
    serviceLines: [...PROFILE_SEED.serviceLines],
  });

  // ─── CRM companies ─────────────────────────────────────────────────────────
  const companyIds: Record<string, number> = {};
  for (const c of COMPANY_SEEDS) {
    companyIds[c.name] = await upsert(
      crmCompanies,
      and(eq(crmCompanies.clientId, clientId), eq(crmCompanies.name, c.name))!,
      counts.companies,
      { clientId, name: c.name, domain: c.domain, industry: c.industry, notes: 'Seeded by scripts/seed-brain-demo.ts' },
    );
  }

  // ─── CRM contacts (2 per company) ──────────────────────────────────────────
  const contactIds: Record<string, number> = {};
  for (const c of CONTACT_SEEDS) {
    contactIds[c.email] = await upsert(
      crmContacts,
      and(eq(crmContacts.clientId, clientId), eq(crmContacts.email, c.email))!,
      counts.contacts,
      {
        clientId,
        companyId: companyIds[c.company],
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        title: c.title,
        status: 'lead',
      },
    );
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

  for (const d of DEAL_SEEDS) {
    await upsert(
      crmDeals,
      and(eq(crmDeals.clientId, clientId), eq(crmDeals.title, d.title))!,
      counts.deals,
      {
        clientId,
        pipelineId: pipeline.id,
        stageId: d.stage === 'lead' ? leadStageId : proposalStageId,
        contactId: contactIds[d.contactEmail],
        companyId: companyIds[d.companyName],
        title: d.title,
        value: d.value,
        priority: d.priority,
        status: 'open',
      },
    );
  }

  // ─── Relationship overlays (1 per company) ─────────────────────────────────
  for (const o of OVERLAY_SEEDS) {
    const companyId = companyIds[o.companyName];
    await upsert(
      brainRelationshipOverlays,
      and(eq(brainRelationshipOverlays.clientId, clientId), eq(brainRelationshipOverlays.companyId, companyId))!,
      counts.overlays,
      {
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
      },
    );
  }

  // ─── Meetings ──────────────────────────────────────────────────────────────
  const meetingIds: Record<string, number> = {};
  for (const m of MEETING_SEEDS) {
    meetingIds[m.sourceRef] = await upsert(
      brainMeetings,
      and(eq(brainMeetings.clientId, clientId), eq(brainMeetings.sourceRef, m.sourceRef))!,
      counts.meetings,
      {
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
      },
    );
  }

  // ─── Tasks (5, mixed status) ───────────────────────────────────────────────
  for (const t of TASK_SEEDS) {
    await upsert(
      brainTasks,
      and(eq(brainTasks.clientId, clientId), eq(brainTasks.title, t.title))!,
      counts.tasks,
      {
        clientId,
        companyId: t.companyName ? companyIds[t.companyName] : null,
        meetingId: t.meetingSourceRef ? meetingIds[t.meetingSourceRef] : null,
        title: t.title,
        description: t.description,
        status: t.status,
        priority: t.priority,
        blockedReason: t.blockedReason,
        source: t.meetingSourceRef ? 'meeting' : 'manual',
      },
    );
  }

  // ─── Notes (4, slash-prefix tag folders) ──────────────────────────────────
  for (const n of NOTE_SEEDS) {
    await upsert(
      brainNotes,
      and(eq(brainNotes.clientId, clientId), eq(brainNotes.title, n.title))!,
      counts.notes,
      {
        clientId,
        title: n.title,
        body: n.body,
        tags: n.tags,
        companyId: n.companyName ? companyIds[n.companyName] : null,
        confidentialityLevel: 'standard',
        source: 'manual',
      },
    );
  }

  // ─── Note templates ────────────────────────────────────────────────────────
  for (const t of TEMPLATE_SEEDS) {
    await upsert(
      brainNoteTemplates,
      and(eq(brainNoteTemplates.clientId, clientId), eq(brainNoteTemplates.name, t.name))!,
      counts.templates,
      { clientId, name: t.name, body: t.body, trigger: t.trigger, defaultTags: t.defaultTags, enabled: true },
    );
  }

  // ─── Saved searches ───────────────────────────────────────────────────────
  await upsert(
    brainSavedSearches,
    and(eq(brainSavedSearches.clientId, clientId), eq(brainSavedSearches.name, SAVED_SEARCH_SEED.name))!,
    counts.savedSearches,
    {
      clientId,
      userId: null, // shared
      name: SAVED_SEARCH_SEED.name,
      icon: SAVED_SEARCH_SEED.icon,
      filters: { ...SAVED_SEARCH_SEED.filters },
      sortOrder: SAVED_SEARCH_SEED.sortOrder,
    },
  );

  // ─── Decisions (3, varied status) ─────────────────────────────────────────
  for (const d of DECISION_SEEDS) {
    await upsert(
      brainDecisions,
      and(eq(brainDecisions.clientId, clientId), eq(brainDecisions.title, d.title))!,
      counts.decisions,
      {
        clientId,
        title: d.title,
        context: d.context,
        decision: d.decision,
        rationale: d.rationale,
        status: d.status,
        reversibility: d.reversibility,
        companyId: d.companyName ? companyIds[d.companyName] : null,
        source: 'manual',
        confidentialityLevel: 'standard',
        decidedAt: new Date(),
        createdBy: null,
      },
      `  [decisions] seeded: "${d.title}"`,
    );
  }

  // ─── People (4 internal team members) ─────────────────────────────────────
  for (const p of PEOPLE_SEEDS) {
    await upsert(
      brainPeople,
      and(eq(brainPeople.clientId, clientId), eq(brainPeople.fullName, p.fullName))!,
      counts.people,
      { clientId, fullName: p.fullName, email: p.email, title: p.title, status: 'active', source: 'manual', createdBy: null, profileUrls: [] },
      `  [people] seeded: "${p.fullName}"`,
    );
  }

  // ─── Glossary terms (4 domain terms) ──────────────────────────────────────
  for (const g of GLOSSARY_SEEDS) {
    await upsert(
      brainGlossaryTerms,
      and(eq(brainGlossaryTerms.clientId, clientId), eq(brainGlossaryTerms.term, g.term))!,
      counts.glossary,
      // Lazy: only resolve a free slug when we're actually inserting.
      async () => {
        let finalSlug = g.slug || slugifyGlossary(g.term);
        let counter = 2;
        while (true) {
          const [collision] = await db.select({ id: brainGlossaryTerms.id })
            .from(brainGlossaryTerms)
            .where(and(eq(brainGlossaryTerms.clientId, clientId), eq(brainGlossaryTerms.slug, finalSlug)))
            .limit(1);
          if (!collision) break;
          finalSlug = `${g.slug}-${counter}`.slice(0, 100);
          counter++;
          if (counter > 100) { finalSlug = `${g.slug}-${Date.now()}`; break; }
        }
        return {
          clientId,
          term: g.term,
          slug: finalSlug,
          definition: g.definition,
          shortDefinition: g.shortDefinition,
          aliases: [],
          status: 'active',
          category: g.category,
          relatedTermIds: [],
          source: 'manual',
          createdBy: null,
        };
      },
      `  [glossary] seeded: "${g.term}"`,
    );
  }

  // ─── Initiatives (2: one active, one planned) ──────────────────────────────
  for (const ini of INITIATIVE_SEEDS) {
    await upsert(
      brainInitiatives,
      and(eq(brainInitiatives.clientId, clientId), eq(brainInitiatives.name, ini.name))!,
      counts.initiatives,
      // Lazy: derive a unique per-tenant slug only when inserting.
      async () => {
        const baseSlug = slugifyInitiative(ini.name);
        const takenSlugs = await db.select({ slug: brainInitiatives.slug })
          .from(brainInitiatives)
          .where(eq(brainInitiatives.clientId, clientId));
        const takenSet = new Set(takenSlugs.map((r) => r.slug));
        let finalSlug = baseSlug;
        let sfx = 2;
        while (takenSet.has(finalSlug)) {
          finalSlug = `${baseSlug}-${sfx}`.slice(0, 150);
          sfx++;
          if (sfx > 10_000) { finalSlug = `${baseSlug}-${Date.now()}`; break; }
        }
        return {
          clientId,
          name: ini.name,
          slug: finalSlug,
          description: ini.description,
          status: ini.status,
          priority: ini.priority,
          confidentialityLevel: 'standard',
          createdBy: null,
        };
      },
      `  [initiatives] seeded: "${ini.name}"`,
    );
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  console.log('\nDone. Summary (seeded / found-existing):');
  const rows: Array<[string, SeedBucket]> = [
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
    ['brain_decisions         ', counts.decisions],
    ['brain_people            ', counts.people],
    ['brain_glossary_terms    ', counts.glossary],
    ['brain_initiatives       ', counts.initiatives],
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
