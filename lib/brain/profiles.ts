import { db } from '@/lib/db';
import { brainProfiles, type BrainEnabledModules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { getIndustryTemplate, type IndustryTemplateId } from './industry-templates';

export type BrainProfile = typeof brainProfiles.$inferSelect;

export async function getBrainProfile(clientId: number): Promise<BrainProfile | null> {
  const [row] = await db.select().from(brainProfiles).where(eq(brainProfiles.clientId, clientId)).limit(1);
  return row ?? null;
}

/**
 * Idempotent: returns the existing brain profile for the client, or creates
 * a disabled one with sensible defaults if none exists.
 */
export async function getOrCreateBrainProfile(clientId: number, defaultName: string): Promise<BrainProfile> {
  const existing = await getBrainProfile(clientId);
  if (existing) return existing;

  const [created] = await db.insert(brainProfiles).values({
    clientId,
    name: defaultName,
  }).returning();

  return created;
}

interface UpdateBrainProfileInput {
  name?: string;
  industryTemplate?: IndustryTemplateId;
  enabled?: boolean;
  defaultConfidentiality?: 'standard' | 'restricted' | 'confidential';
  enabledModules?: Partial<BrainEnabledModules>;
  serviceLines?: string[];
}

export async function updateBrainProfile(clientId: number, input: UpdateBrainProfileInput): Promise<BrainProfile | null> {
  const existing = await getBrainProfile(clientId);
  if (!existing) return null;

  const merged: typeof brainProfiles.$inferInsert = {
    ...existing,
    ...(input.name !== undefined && { name: input.name }),
    ...(input.industryTemplate !== undefined && { industryTemplate: input.industryTemplate }),
    ...(input.enabled !== undefined && { enabled: input.enabled }),
    ...(input.defaultConfidentiality !== undefined && { defaultConfidentiality: input.defaultConfidentiality }),
    ...(input.serviceLines !== undefined && { serviceLines: input.serviceLines }),
    ...(input.enabledModules !== undefined && {
      enabledModules: { ...existing.enabledModules, ...input.enabledModules },
    }),
    updatedAt: new Date(),
  };

  const [updated] = await db
    .update(brainProfiles)
    .set(merged)
    .where(eq(brainProfiles.clientId, clientId))
    .returning();

  return updated;
}

/**
 * When a profile's industry template changes, seed reasonable defaults
 * (service lines etc) from the new template — but only if the client hasn't
 * already customized them.
 */
export async function applyIndustryTemplateDefaults(clientId: number, templateId: IndustryTemplateId): Promise<BrainProfile | null> {
  const profile = await getBrainProfile(clientId);
  if (!profile) return null;

  const template = getIndustryTemplate(templateId);
  const shouldSeedServiceLines = profile.serviceLines.length === 0;

  return updateBrainProfile(clientId, {
    industryTemplate: templateId,
    ...(shouldSeedServiceLines && { serviceLines: template.serviceLines }),
  });
}
