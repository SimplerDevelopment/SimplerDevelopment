/**
 * Demo workspace seeder — called once per new self-serve client at signup.
 *
 * Inserts a small but realistic set of sample data so the in-app AI agent has
 * something to act on immediately (the activation aha). The seed is clearly
 * labelled "(sample)" so users know it is demo data.
 *
 * TENANCY: every INSERT carries `clientId`. No cross-tenant reads exist here.
 * IDEMPOTENT: returns early if the client already has any CRM contacts.
 */

import { db } from '@/lib/db';
import {
  crmCompanies,
  crmContacts,
  crmDeals,
  crmPipelineStages,
  projects,
  kanbanColumns,
  kanbanCards,
} from '@/lib/db/schema';
import { eq, count } from 'drizzle-orm';
import { ensureDefaultPipeline } from '@/lib/crm/default-pipeline';

// ---------------------------------------------------------------------------
// Sample data — kept minimal; clearly marked as demo via "(sample)" suffix
// ---------------------------------------------------------------------------

const SAMPLE_COMPANY = {
  name: 'Northwind Trading (sample)',
  domain: 'northwindtrading.example',
  industry: 'Wholesale',
  size: '11-50',
  website: 'https://northwindtrading.example',
  notes: 'Demo company — feel free to edit or delete this sample record.',
};

const SAMPLE_CONTACTS = [
  {
    firstName: 'Alice',
    lastName: 'Chen (sample)',
    email: 'alice.chen@northwindtrading.example',
    title: 'Head of Procurement',
    status: 'lead' as const,
    notes: 'Sample contact — demo data.',
  },
  {
    firstName: 'Marcus',
    lastName: 'Reyes (sample)',
    email: 'marcus.reyes@northwindtrading.example',
    title: 'CEO',
    status: 'active' as const,
    notes: 'Sample contact — demo data.',
  },
  {
    firstName: 'Priya',
    lastName: 'Nair (sample)',
    email: 'priya.nair@northwindtrading.example',
    title: 'Operations Manager',
    status: 'customer' as const,
    notes: 'Sample contact — demo data.',
  },
];

// Stage names we target in the default pipeline (Lead → Proposal)
const SAMPLE_DEAL_STAGE_NAMES = ['Lead', 'Proposal'];

const SAMPLE_DEALS = [
  {
    title: 'Northwind Q3 Retainer (sample)',
    value: 750000, // $7,500.00 in cents
    currency: 'USD' as const,
    status: 'open' as const,
    priority: 'high' as const,
    notes: 'Sample deal — demo data.',
    stageIndex: 0, // Lead
  },
  {
    title: 'Website Redesign Proposal (sample)',
    value: 1200000, // $12,000.00 in cents
    currency: 'USD' as const,
    status: 'open' as const,
    priority: 'medium' as const,
    notes: 'Sample deal — demo data.',
    stageIndex: 1, // Proposal
  },
];

const SAMPLE_PROJECT_NAME = 'Onboarding Checklist (sample)';
const SAMPLE_PROJECT_DESCRIPTION =
  'Sample project to help you explore the kanban board. Edit or delete it whenever you like.';

const SAMPLE_COLUMNS = [
  { name: 'To Do', order: 0 },
  { name: 'In Progress', order: 1 },
  { name: 'Done', order: 2, isDone: true },
];

const SAMPLE_CARDS = [
  {
    title: 'Add your first real contact (sample)',
    description: 'Head to the CRM tab and import or create a live contact.',
    priority: 'high' as const,
    columnIndex: 0,
  },
  {
    title: 'Set up your pipeline stages (sample)',
    description: 'Go to CRM → Settings to rename or add stages that match your sales process.',
    priority: 'medium' as const,
    columnIndex: 0,
  },
  {
    title: 'Explore the AI agent (sample)',
    description: 'Open the Brain tab and ask the AI a question about your workspace.',
    priority: 'medium' as const,
    columnIndex: 1,
  },
];

// ---------------------------------------------------------------------------
// Main seeder
// ---------------------------------------------------------------------------

export async function seedDemoWorkspace(clientId: number): Promise<void> {
  // IDEMPOTENCY CHECK — bail early if any contacts already exist for this client.
  const [{ value: contactCount }] = await db
    .select({ value: count() })
    .from(crmContacts)
    .where(eq(crmContacts.clientId, clientId));

  if (contactCount > 0) return;

  // ── 1. Ensure default CRM pipeline + stages ──────────────────────────────
  const pipeline = await ensureDefaultPipeline(clientId);

  // Fetch the stages so we can map deal targets by name.
  const stages = await db
    .select({ id: crmPipelineStages.id, name: crmPipelineStages.name, sortOrder: crmPipelineStages.sortOrder })
    .from(crmPipelineStages)
    .where(eq(crmPipelineStages.pipelineId, pipeline.id));

  // Build a name → id map; gracefully fall back to the first/second stage if
  // the target name is somehow absent (should never happen with the defaults).
  const stageByName = new Map(stages.map((s) => [s.name, s.id]));
  const sortedStageIds = stages
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((s) => s.id);

  function resolveStageId(targetName: string, fallbackIndex: number): number {
    return stageByName.get(targetName) ?? sortedStageIds[fallbackIndex] ?? sortedStageIds[0];
  }

  // ── 2. Sample company ────────────────────────────────────────────────────
  const [company] = await db
    .insert(crmCompanies)
    .values({ clientId, ...SAMPLE_COMPANY })
    .returning({ id: crmCompanies.id });

  // ── 3. Sample contacts (linked to company) ───────────────────────────────
  const insertedContacts = await db
    .insert(crmContacts)
    .values(
      SAMPLE_CONTACTS.map((c) => ({
        clientId,
        companyId: company.id,
        ...c,
      }))
    )
    .returning({ id: crmContacts.id });

  const [primaryContact, secondaryContact] = insertedContacts;

  // ── 4. Sample deals ──────────────────────────────────────────────────────
  await db.insert(crmDeals).values(
    SAMPLE_DEALS.map((deal, i) => {
      const stageName = SAMPLE_DEAL_STAGE_NAMES[deal.stageIndex] ?? SAMPLE_DEAL_STAGE_NAMES[0];
      return {
        clientId,
        pipelineId: pipeline.id,
        stageId: resolveStageId(stageName, deal.stageIndex),
        companyId: company.id,
        contactId: i === 0 ? primaryContact.id : secondaryContact?.id ?? primaryContact.id,
        title: deal.title,
        value: deal.value,
        currency: deal.currency,
        status: deal.status,
        priority: deal.priority,
        notes: deal.notes,
        sortOrder: i,
      };
    })
  );

  // ── 5. Sample project + columns + cards ──────────────────────────────────
  const [project] = await db
    .insert(projects)
    .values({
      clientId,
      name: SAMPLE_PROJECT_NAME,
      description: SAMPLE_PROJECT_DESCRIPTION,
      status: 'active',
    })
    .returning({ id: projects.id });

  const insertedColumns = await db
    .insert(kanbanColumns)
    .values(
      SAMPLE_COLUMNS.map((col) => ({
        projectId: project.id,
        name: col.name,
        order: col.order,
        isDone: col.isDone ?? false,
      }))
    )
    .returning({ id: kanbanColumns.id });

  const columnIdByIndex = new Map(insertedColumns.map((col, idx) => [idx, col.id]));

  await db.insert(kanbanCards).values(
    SAMPLE_CARDS.map((card, i) => ({
      projectId: project.id,
      columnId: columnIdByIndex.get(card.columnIndex) ?? insertedColumns[0].id,
      title: card.title,
      description: card.description,
      priority: card.priority,
      order: i,
      workflowState: card.columnIndex === 2 ? ('done' as const) : ('todo' as const),
    }))
  );
}
