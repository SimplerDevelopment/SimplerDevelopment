import { db } from '@/lib/db';
import { brainNoteTemplates, type BrainNoteTemplateTrigger } from '@/lib/db/schema';
import { and, desc, eq } from 'drizzle-orm';
import { logAudit } from './audit';

export type BrainNoteTemplate = typeof brainNoteTemplates.$inferSelect;
export type { BrainNoteTemplateTrigger };

const VALID_TRIGGERS: BrainNoteTemplateTrigger[] = ['manual', 'daily', 'meeting', 'slash'];

interface ListOpts {
  trigger?: BrainNoteTemplateTrigger;
  enabled?: boolean;
}

export async function listTemplates(clientId: number, opts: ListOpts = {}): Promise<BrainNoteTemplate[]> {
  const conds = [eq(brainNoteTemplates.clientId, clientId)];
  if (opts.trigger !== undefined) conds.push(eq(brainNoteTemplates.trigger, opts.trigger));
  if (opts.enabled !== undefined) conds.push(eq(brainNoteTemplates.enabled, opts.enabled));
  return db.select().from(brainNoteTemplates)
    .where(and(...conds))
    .orderBy(desc(brainNoteTemplates.updatedAt));
}

export async function getTemplate(clientId: number, templateId: number): Promise<BrainNoteTemplate | null> {
  const [row] = await db.select().from(brainNoteTemplates)
    .where(and(eq(brainNoteTemplates.id, templateId), eq(brainNoteTemplates.clientId, clientId)))
    .limit(1);
  return row ?? null;
}

interface CreateTemplateInput {
  clientId: number;
  name: string;
  body: string;
  trigger?: BrainNoteTemplateTrigger;
  variables?: string[] | null;
  enabled?: boolean;
  defaultTags?: string[] | null;
  createdBy?: number | null;
}

/**
 * Sentinel error for the unique (clientId, name) constraint. Routes catch this
 * to translate into a 409 without leaking driver-level error shapes.
 */
export class DuplicateTemplateNameError extends Error {
  constructor(name: string) {
    super(`Template name already exists: ${name}`);
    this.name = 'DuplicateTemplateNameError';
  }
}

function isUniqueViolation(err: unknown): boolean {
  // Postgres unique_violation. Drizzle/pg surfaces the underlying code on the error.
  return typeof err === 'object' && err !== null && 'code' in err && (err as { code: unknown }).code === '23505';
}

export async function createTemplate(input: CreateTemplateInput): Promise<BrainNoteTemplate> {
  const trigger: BrainNoteTemplateTrigger = input.trigger && VALID_TRIGGERS.includes(input.trigger)
    ? input.trigger
    : 'manual';

  let created: BrainNoteTemplate;
  try {
    [created] = await db.insert(brainNoteTemplates).values({
      clientId: input.clientId,
      name: input.name.trim().slice(0, 150),
      body: input.body,
      trigger,
      variables: input.variables ?? null,
      enabled: input.enabled ?? true,
      defaultTags: input.defaultTags ?? null,
      createdBy: input.createdBy ?? null,
    }).returning();
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateTemplateNameError(input.name);
    throw err;
  }

  await logAudit({
    clientId: input.clientId,
    actorId: input.createdBy ?? null,
    action: 'template.created',
    entityType: 'brain_note_template',
    entityId: created.id,
  });

  return created;
}

interface UpdateTemplateInput {
  name?: string;
  body?: string;
  trigger?: BrainNoteTemplateTrigger;
  variables?: string[] | null;
  enabled?: boolean;
  defaultTags?: string[] | null;
}

export async function updateTemplate(
  clientId: number,
  templateId: number,
  patch: UpdateTemplateInput,
  actorId: number | null = null,
): Promise<BrainNoteTemplate | null> {
  const before = await getTemplate(clientId, templateId);
  if (!before) return null;

  const set: Partial<typeof brainNoteTemplates.$inferInsert> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name.trim().slice(0, 150);
  if (patch.body !== undefined) set.body = patch.body;
  if (patch.trigger !== undefined && VALID_TRIGGERS.includes(patch.trigger)) set.trigger = patch.trigger;
  if (patch.variables !== undefined) set.variables = patch.variables;
  if (patch.enabled !== undefined) set.enabled = patch.enabled;
  if (patch.defaultTags !== undefined) set.defaultTags = patch.defaultTags;

  let updated: BrainNoteTemplate | undefined;
  try {
    [updated] = await db.update(brainNoteTemplates).set(set)
      .where(and(eq(brainNoteTemplates.id, templateId), eq(brainNoteTemplates.clientId, clientId)))
      .returning();
  } catch (err) {
    if (isUniqueViolation(err)) throw new DuplicateTemplateNameError(patch.name ?? before.name);
    throw err;
  }

  if (updated) {
    await logAudit({
      clientId,
      actorId,
      action: 'template.updated',
      entityType: 'brain_note_template',
      entityId: templateId,
      metadata: { changedFields: Object.keys(patch) },
    });
  }
  return updated ?? null;
}

export async function deleteTemplate(
  clientId: number,
  templateId: number,
  actorId: number | null = null,
): Promise<boolean> {
  const before = await getTemplate(clientId, templateId);
  if (!before) return false;
  await db.delete(brainNoteTemplates)
    .where(and(eq(brainNoteTemplates.id, templateId), eq(brainNoteTemplates.clientId, clientId)));

  await logAudit({
    clientId,
    actorId,
    action: 'template.deleted',
    entityType: 'brain_note_template',
    entityId: templateId,
  });
  return true;
}
