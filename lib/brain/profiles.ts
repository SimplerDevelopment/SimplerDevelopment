import { db } from '@/lib/db';
import { brainProfiles, type BrainEnabledModules } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { getIndustryTemplate, type IndustryTemplateId } from './industry-templates';

export type BrainProfile = typeof brainProfiles.$inferSelect;

/** 128-bit random token for the brain inbound email gateway. */
function generateEmailIngestToken(): string {
  return randomBytes(16).toString('hex');
}

export async function getBrainProfile(clientId: number): Promise<BrainProfile | null> {
  const [row] = await db.select().from(brainProfiles).where(eq(brainProfiles.clientId, clientId)).limit(1);
  return row ?? null;
}

/**
 * Idempotent: returns the existing brain profile for the client, or creates a
 * disabled one with sensible defaults if none exists. New profiles get a
 * random emailIngestToken; existing profiles missing one are backfilled in
 * place so the brain inbound email always works as soon as the page loads.
 */
export async function getOrCreateBrainProfile(clientId: number, defaultName: string): Promise<BrainProfile> {
  const existing = await getBrainProfile(clientId);
  if (existing) {
    if (!existing.emailIngestToken) {
      const [updated] = await db
        .update(brainProfiles)
        .set({ emailIngestToken: generateEmailIngestToken() })
        .where(eq(brainProfiles.id, existing.id))
        .returning();
      return updated;
    }
    return existing;
  }

  const [created] = await db.insert(brainProfiles).values({
    clientId,
    name: defaultName,
    emailIngestToken: generateEmailIngestToken(),
  }).returning();

  return created;
}

/** Rotate the per-client email ingest token. Old aliases stop working. */
export async function rotateEmailIngestToken(clientId: number): Promise<BrainProfile | null> {
  const [updated] = await db
    .update(brainProfiles)
    .set({ emailIngestToken: generateEmailIngestToken(), updatedAt: new Date() })
    .where(eq(brainProfiles.clientId, clientId))
    .returning();
  return updated ?? null;
}

interface UpdateBrainProfileInput {
  name?: string;
  industryTemplate?: IndustryTemplateId;
  enabled?: boolean;
  autoProcessEmail?: boolean;
  autoLinkCrm?: boolean;
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
    ...(input.autoProcessEmail !== undefined && { autoProcessEmail: input.autoProcessEmail }),
    ...(input.autoLinkCrm !== undefined && { autoLinkCrm: input.autoLinkCrm }),
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
