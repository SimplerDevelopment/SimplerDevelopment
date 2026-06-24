/**
 * Survey AI tools.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { db } from '@/lib/db';
import { surveys, surveyResponses } from '@/lib/db/schema';
import type { SurveyFieldDef } from '@/lib/db/schema';
import { eq, and, desc, sql } from 'drizzle-orm';
import { emitEvent } from '@/lib/automation/event-bus';
import { slugify } from '@/lib/publishing/slug';

export const surveyTools: Anthropic.Tool[] = [
  {
    name: 'get_my_surveys',
    description: 'Get all surveys for this client.',
    input_schema: { type: 'object' as const, properties: {}, required: [] },
  },
  {
    name: 'get_survey_details',
    description: 'Get a survey with its responses and stats.',
    input_schema: {
      type: 'object' as const,
      properties: { survey_id: { type: 'number', description: 'Survey ID' } },
      required: ['survey_id'],
    },
  },
  {
    name: 'create_survey',
    description: 'Create a new survey. Confirm details with user first.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Survey title' },
        description: { type: 'string', description: 'Survey description' },
        fields: { type: 'string', description: 'JSON array of field objects: [{label, type (text|email|textarea|select|radio|checkbox|rating|number), required, options (for select/radio)}]' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_survey',
    description: 'Update a survey (title, description, status, fields).',
    input_schema: {
      type: 'object' as const,
      properties: {
        survey_id: { type: 'number', description: 'Survey ID' },
        title: { type: 'string' }, description: { type: 'string' },
        status: { type: 'string', description: 'draft, active, or closed' },
        fields: { type: 'string', description: 'JSON array of fields' },
      },
      required: ['survey_id'],
    },
  },
];

export type SurveyHandler = (
  input: Record<string, unknown>,
  clientId: number,
  userId: number,
) => Promise<unknown>;

export const surveyHandlers: Record<string, SurveyHandler> = {
  get_my_surveys: async (_input, clientId, _userId) => {
    const rows = await db.select({
      id: surveys.id, title: surveys.title, slug: surveys.slug,
      status: surveys.status, description: surveys.description,
      createdAt: surveys.createdAt, updatedAt: surveys.updatedAt,
    }).from(surveys).where(eq(surveys.clientId, clientId)).orderBy(desc(surveys.updatedAt));
    return rows;
  },

  get_survey_details: async (input, clientId, _userId) => {
    const surveyId = input.survey_id as number;
    const [survey] = await db.select().from(surveys)
      .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId)));
    if (!survey) return { error: 'Survey not found' };
    const responses = await db.select().from(surveyResponses)
      .where(eq(surveyResponses.surveyId, surveyId)).orderBy(desc(surveyResponses.createdAt)).limit(50);
    const [stats] = await db.select({
      total: sql<number>`count(*)::int`,
      withEmail: sql<number>`count(respondent_email)::int`,
    }).from(surveyResponses).where(eq(surveyResponses.surveyId, surveyId));
    return { survey, responses, stats };
  },

  create_survey: async (input, clientId, userId) => {
    const title = (input.title as string).trim();
    const baseSlug = slugify(title);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;
    let fields: SurveyFieldDef[] = [];
    if (input.fields) { try { fields = JSON.parse(input.fields as string); } catch { return { error: 'Invalid fields JSON' }; } }
    const [survey] = await db.insert(surveys).values({
      clientId, title, slug,
      description: (input.description as string)?.trim() || null,
      fields, createdBy: userId,
    }).returning();
    emitEvent('survey.created', clientId, userId, { id: survey.id, title });
    return { success: true, surveyId: survey.id, slug: survey.slug, message: `Survey "${title}" created. Share link: /s/${survey.slug}` };
  },

  update_survey: async (input, clientId, _userId) => {
    const surveyId = input.survey_id as number;
    const [existing] = await db.select({ id: surveys.id }).from(surveys)
      .where(and(eq(surveys.id, surveyId), eq(surveys.clientId, clientId)));
    if (!existing) return { error: 'Survey not found' };
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (input.title !== undefined) updates.title = (input.title as string).trim();
    if (input.description !== undefined) updates.description = (input.description as string).trim() || null;
    if (input.status !== undefined) updates.status = input.status as string;
    if (input.fields !== undefined) { try { updates.fields = JSON.parse(input.fields as string); } catch { return { error: 'Invalid fields JSON' }; } }
    await db.update(surveys).set(updates).where(eq(surveys.id, surveyId));
    return { success: true, message: 'Survey updated.' };
  },
};
