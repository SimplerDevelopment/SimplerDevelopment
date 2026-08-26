/**
 * PUX-033 step 1 — unit tests for the pure project→survey builder.
 *
 * `surveys_create`'s real Zod input schema (lib/mcp/tools/surveys.ts:212-220)
 * declares `fields: z.array(z.any()).optional()` — it's exported only as an
 * inline object literal on the `registerTool` call, not as a standalone
 * schema, and even if it were importable it does not validate field *shape*
 * (z.any() accepts anything). So this file (a) reconstructs the top-level
 * `surveys_create` input schema by hand from that source range and validates
 * against it, and (b) separately hand-asserts every field matches
 * `SurveyFieldDef` (lib/db/schema/surveys.ts:128-153), since that's the part
 * z.any() can't catch.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  buildProjectSurvey,
  type ProjectSurveyPreset,
  type ProjectSurveySnapshot,
} from '@/lib/projects/generate-survey';
import type { SurveyFieldDef } from '@/lib/db/schema';

// Hand-reconstructed from lib/mcp/tools/surveys.ts:212-220 (surveys_create inputSchema).
const surveysCreateInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  fields: z.array(z.any()).optional(),
  thankYouTitle: z.string().optional(),
  thankYouMessage: z.string().optional(),
  requireEmail: z.boolean().optional(),
  allowMultiple: z.boolean().optional(),
});

const SURVEY_FIELD_TYPES = new Set<SurveyFieldDef['type']>([
  'text', 'textarea', 'number', 'email', 'phone', 'url',
  'select', 'radio', 'checkbox', 'toggle', 'date', 'rating', 'heading', 'slider',
  'page_break', 'file', 'image', 'video', 'media-carousel',
]);

function assertIsSurveyFieldDef(field: unknown, ctx: string): asserts field is SurveyFieldDef {
  const f = field as SurveyFieldDef;
  expect(f, ctx).toBeTruthy();
  expect(typeof f.id, `${ctx}.id`).toBe('string');
  expect(f.id.length, `${ctx}.id`).toBeGreaterThan(0);
  expect(SURVEY_FIELD_TYPES.has(f.type), `${ctx}.type=${f.type}`).toBe(true);
  expect(typeof f.label, `${ctx}.label`).toBe('string');
  expect(typeof f.placeholder, `${ctx}.placeholder`).toBe('string');
  expect(typeof f.helpText, `${ctx}.helpText`).toBe('string');
  expect(typeof f.required, `${ctx}.required`).toBe('boolean');
  expect(Array.isArray(f.options), `${ctx}.options`).toBe(true);
  expect(typeof f.order, `${ctx}.order`).toBe('number');
  if (f.page !== undefined) expect(typeof f.page, `${ctx}.page`).toBe('number');
}

const baseSnapshot: ProjectSurveySnapshot = {
  project: { id: 1, name: 'Acme Rebuild', description: 'Rebuild the marketing site', dueDate: '2026-09-01' },
  cards: [
    { id: 101, title: 'PUX-201: fix nav overlap', columnName: 'Validating', isDone: false },
    { id: 102, title: 'PUX-202: hero copy', columnName: 'Approved', isDone: false },
    { id: 103, title: 'PUX-203: already shipped', columnName: 'Approved', isDone: true }, // excluded: isDone
    { id: 104, title: 'PUX-204: still in progress', columnName: 'In Progress', isDone: false }, // excluded: wrong column
    { id: 105, title: 'PUX-205: mixed case column', columnName: 'vAlIdAtInG', isDone: false }, // included: case-insensitive
  ],
  sprints: [{ id: 1, name: 'Sprint 4', status: 'active' }],
};

const PRESETS: ProjectSurveyPreset[] = ['qa_review', 'stakeholder_feedback', 'retro'];

describe('buildProjectSurvey', () => {
  for (const preset of PRESETS) {
    it(`${preset}: validates against the surveys_create input schema and every field is a valid SurveyFieldDef`, () => {
      const result = buildProjectSurvey(preset, baseSnapshot, { date: '2026-08-25' });
      const parsed = surveysCreateInputSchema.safeParse(result);
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.error.issues)).toBe(true);

      result.fields.forEach((f, i) => assertIsSurveyFieldDef(f, `${preset}.fields[${i}]`));
    });
  }

  it('qa_review: produces exactly one section per Validating/Approved-not-done card, ignoring others', () => {
    const result = buildProjectSurvey('qa_review', baseSnapshot, { date: '2026-08-25' });

    // 3 cards qualify: 101 (Validating), 102 (Approved), 105 (vAlIdAtInG, case-insensitive).
    // Excluded: 103 (isDone), 104 (wrong column).
    const verdictFields = result.fields.filter(f => f.id.endsWith('-verdict'));
    const headingFields = result.fields.filter(f => f.id.endsWith('-heading'));
    const notesFields = result.fields.filter(f => f.id.endsWith('-notes'));

    expect(verdictFields).toHaveLength(3);
    expect(headingFields).toHaveLength(3);
    expect(notesFields).toHaveLength(3);
    expect(verdictFields.map(f => f.id).sort()).toEqual(
      ['card-101-verdict', 'card-102-verdict', 'card-105-verdict'].sort(),
    );

    // Headings keep the leading SKU.
    const heading101 = result.fields.find(f => f.id === 'card-101-heading');
    expect(heading101?.label).toBe('PUX-201: fix nav overlap');

    // Every verdict field is a required radio with the pass/fail/needs-changes options.
    for (const v of verdictFields) {
      expect(v.type).toBe('radio');
      expect(v.required).toBe(true);
      expect(v.options).toEqual(['Pass', 'Fail', 'Needs changes']);
    }

    // Excluded cards never appear anywhere in the field set.
    const allIds = result.fields.map(f => f.id).join(' ');
    expect(allIds).not.toContain('card-103');
    expect(allIds).not.toContain('card-104');
  });

  it('qa_review: meta.reviewedCardIds matches the reviewed cards in order', () => {
    const result = buildProjectSurvey('qa_review', baseSnapshot, { date: '2026-08-25' });
    expect(result.meta).toBeDefined();
    expect(result.meta?.reviewedCardIds).toEqual([101, 102, 105]);
  });

  it('qa_review: field ids are unique and order is sequential', () => {
    const result = buildProjectSurvey('qa_review', baseSnapshot, { date: '2026-08-25' });
    const ids = result.fields.map(f => f.id);
    expect(new Set(ids).size).toBe(ids.length);

    const orders = result.fields.map(f => f.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    expect(new Set(orders).size).toBe(orders.length);
    expect(orders[0]).toBe(0);
  });

  it('qa_review: page numbering is monotonic non-decreasing across page_breaks, and increments after each break', () => {
    const result = buildProjectSurvey('qa_review', baseSnapshot, { date: '2026-08-25' });
    const pages = result.fields.map(f => f.page ?? 0);
    for (let i = 1; i < pages.length; i++) {
      expect(pages[i]).toBeGreaterThanOrEqual(pages[i - 1]);
    }

    // 3 reviewed cards => 3 page_break fields => final page (overall rating/callouts) is page 3.
    const breakCount = result.fields.filter(f => f.type === 'page_break').length;
    expect(breakCount).toBe(3);
    const finalRating = result.fields.find(f => f.id === 'overall-rating');
    expect(finalRating?.page).toBe(3);
  });

  it('qa_review: zero review-worthy cards still yields a valid survey with only the final page', () => {
    const emptySnapshot: ProjectSurveySnapshot = {
      project: { id: 2, name: 'Nothing To Review' },
      cards: [
        { id: 1, title: 'Card A', columnName: 'Backlog', isDone: false },
        { id: 2, title: 'Card B', columnName: 'Approved', isDone: true },
      ],
    };
    const result = buildProjectSurvey('qa_review', emptySnapshot, { date: '2026-08-25' });

    expect(result.meta?.reviewedCardIds).toEqual([]);
    expect(result.fields.some(f => f.type === 'page_break')).toBe(false);
    const ids = result.fields.map(f => f.id);
    expect(ids).toEqual(['overall-rating', 'overall-callouts']);
    result.fields.forEach(f => expect(f.page ?? 0).toBe(0));

    const parsed = surveysCreateInputSchema.safeParse(result);
    expect(parsed.success).toBe(true);
  });

  it('stakeholder_feedback: has an NPS-scored 0-10 rating, a status radio, and two textareas; requires email', () => {
    const result = buildProjectSurvey('stakeholder_feedback', baseSnapshot, { date: '2026-08-25' });
    const nps = result.fields.find(f => f.id === 'nps-score');
    expect(nps?.type).toBe('rating');
    expect(nps?.min).toBe(0);
    expect(nps?.max).toBe(10);
    expect(nps?.scoring).toEqual({ type: 'nps' });

    const status = result.fields.find(f => f.id === 'status');
    expect(status?.type).toBe('radio');
    expect(status?.options).toEqual(['On track', 'At risk', 'Off track']);

    const textareas = result.fields.filter(f => f.type === 'textarea');
    expect(textareas).toHaveLength(2);

    expect(result.requireEmail).toBe(true);
  });

  it('retro: has three textareas plus an overall project rating', () => {
    const result = buildProjectSurvey('retro', baseSnapshot, { date: '2026-08-25' });
    const textareas = result.fields.filter(f => f.type === 'textarea');
    expect(textareas).toHaveLength(3);
    const rating = result.fields.find(f => f.type === 'rating');
    expect(rating).toBeDefined();
    expect(rating?.min).toBe(1);
    expect(rating?.max).toBe(5);
  });

  it('title includes the date when opts.date is given, and omits it otherwise', () => {
    const withDate = buildProjectSurvey('retro', baseSnapshot, { date: '2026-08-25' });
    expect(withDate.title).toContain('2026-08-25');
    expect(withDate.title).toContain('Acme Rebuild');

    const withoutDate = buildProjectSurvey('retro', baseSnapshot);
    expect(withoutDate.title).not.toContain('2026-08-25');
    expect(withoutDate.title).toContain('Acme Rebuild');
  });

  for (const preset of PRESETS) {
    it(`${preset}: deterministic — two calls with the same input deep-equal`, () => {
      const a = buildProjectSurvey(preset, baseSnapshot, { date: '2026-08-25' });
      const b = buildProjectSurvey(preset, baseSnapshot, { date: '2026-08-25' });
      expect(a).toEqual(b);
    });
  }

  // NEGATIVE CHECK anchor: this test only passes when qa_review correctly
  // excludes isDone cards. Documented in the PR body with revert/restore
  // pass/fail counts per the worker prompt's negative-check requirement.
  it('qa_review: never includes a done card even if its column is review-worthy', () => {
    const result = buildProjectSurvey('qa_review', baseSnapshot, { date: '2026-08-25' });
    expect(result.meta?.reviewedCardIds).not.toContain(103);
  });
});
