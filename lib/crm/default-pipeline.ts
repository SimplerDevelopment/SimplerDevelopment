import { db } from '@/lib/db';
import { crmPipelines, crmPipelineStages } from '@/lib/db/schema';
import { eq, desc, asc } from 'drizzle-orm';

const DEFAULT_PIPELINE_NAME = 'Sales Pipeline';

const DEFAULT_STAGES = [
  { name: 'Lead', color: '#94a3b8', sortOrder: 0, probability: 10 },
  { name: 'Qualified', color: '#3b82f6', sortOrder: 1, probability: 25 },
  { name: 'Proposal', color: '#8b5cf6', sortOrder: 2, probability: 50 },
  { name: 'Negotiation', color: '#f59e0b', sortOrder: 3, probability: 75 },
  { name: 'Closed Won', color: '#22c55e', sortOrder: 4, probability: 100 },
  { name: 'Closed Lost', color: '#ef4444', sortOrder: 5, probability: 0 },
];

/**
 * Ensure the client has a default CRM pipeline with stages.
 * Idempotent — returns the existing default (or first) pipeline if one already exists,
 * otherwise creates "Sales Pipeline" with the standard 6 stages and returns it.
 *
 * Tolerates the rare race where two callers create simultaneously (matches the
 * existing pattern in /api/portal/crm/pipelines POST). Worst case: two pipelines,
 * both functional.
 */
export async function ensureDefaultPipeline(clientId: number): Promise<{ id: number }> {
  const existing = await db.select({ id: crmPipelines.id })
    .from(crmPipelines)
    .where(eq(crmPipelines.clientId, clientId))
    .orderBy(desc(crmPipelines.isDefault), asc(crmPipelines.id))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const [pipeline] = await db.insert(crmPipelines).values({
    clientId,
    name: DEFAULT_PIPELINE_NAME,
    isDefault: true,
  }).returning({ id: crmPipelines.id });

  await db.insert(crmPipelineStages).values(
    DEFAULT_STAGES.map((s) => ({
      pipelineId: pipeline.id,
      name: s.name,
      color: s.color,
      sortOrder: s.sortOrder,
      probability: s.probability,
    }))
  );

  return pipeline;
}
