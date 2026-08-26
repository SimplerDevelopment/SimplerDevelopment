/**
 * PUX-033 step 1 — pure, DB-free generator turning a project snapshot into a
 * survey definition shaped exactly like `surveys_create`'s input
 * (`lib/mcp/tools/surveys.ts`). No persistence, no CRM linking, no route, no
 * MCP tool here — those are separate units (route + MCP tool) that call this
 * function and then hand the result to `surveys_create` / `db.insert(surveys)`.
 *
 * Deterministic by construction: never calls `Date.now()` / `new Date()`
 * internally. A caller that wants a dated title passes `opts.date`.
 */
import type { SurveyFieldDef, FieldScoring } from '@/lib/db/schema';

export type ProjectSurveyPreset = 'qa_review' | 'stakeholder_feedback' | 'retro';

export interface ProjectSurveySnapshot {
  project: { id: number; name: string; description?: string | null; dueDate?: string | null };
  cards: Array<{
    id: number;
    title: string;
    columnName: string;
    isDone: boolean;
    workflowState?: string | null;
  }>;
  sprints?: Array<{ id: number; name: string; status?: string | null }>;
}

export interface ProjectSurveyOptions {
  /** Injected "today" for a dated title, e.g. '2026-08-25'. Omit for a dateless, fully deterministic title. */
  date?: string;
}

/** Shape a caller can pass straight into `surveys_create`'s input. */
export interface ProjectSurveyResult {
  title: string;
  description: string;
  fields: SurveyFieldDef[];
  thankYouTitle: string;
  thankYouMessage: string;
  requireEmail: boolean;
  allowMultiple: boolean;
  /** qa_review only: card ids a per-card section was generated for, so a caller can link artifacts. */
  meta?: { reviewedCardIds: number[] };
}

const REVIEW_WORTHY_COLUMNS = new Set(['validating', 'approved']);

function isReviewWorthy(card: ProjectSurveySnapshot['cards'][number]): boolean {
  return !card.isDone && REVIEW_WORTHY_COLUMNS.has(card.columnName.trim().toLowerCase());
}

/** Counters threaded through field construction so `order` stays sequential and unique ids stay unique. */
interface Cursor {
  order: number;
}

function mkField(
  cursor: Cursor,
  page: number,
  def: Partial<SurveyFieldDef> & Pick<SurveyFieldDef, 'id' | 'type' | 'label'>,
): SurveyFieldDef {
  return {
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    page,
    ...def,
    order: cursor.order++,
  };
}

function titleFor(prefix: string, projectName: string, date?: string): string {
  return date ? `${prefix} — ${projectName} — ${date}` : `${prefix} — ${projectName}`;
}

function buildQaReview(snapshot: ProjectSurveySnapshot, opts: ProjectSurveyOptions): ProjectSurveyResult {
  const cursor: Cursor = { order: 0 };
  const fields: SurveyFieldDef[] = [];
  const reviewedCardIds: number[] = [];
  const reviewCards = snapshot.cards.filter(isReviewWorthy);

  let page = 0;
  for (const card of reviewCards) {
    fields.push(mkField(cursor, page, { id: `card-${card.id}-heading`, type: 'heading', label: card.title }));
    fields.push(
      mkField(cursor, page, {
        id: `card-${card.id}-verdict`,
        type: 'radio',
        label: `Verdict — ${card.title}`,
        required: true,
        options: ['Pass', 'Fail', 'Needs changes'],
      }),
    );
    fields.push(
      mkField(cursor, page, {
        id: `card-${card.id}-notes`,
        type: 'textarea',
        label: 'Notes (optional)',
        required: false,
      }),
    );
    reviewedCardIds.push(card.id);
    // Page break stays on the page it closes out (matches lib/survey-templates.ts convention) —
    // the *next* section's fields carry the incremented page number, not the break itself.
    fields.push(mkField(cursor, page, { id: `card-${card.id}-page-break`, type: 'page_break', label: 'Page Break' }));
    page += 1;
  }

  fields.push(
    mkField(cursor, page, {
      id: 'overall-rating',
      type: 'rating',
      label: 'Overall rating for this review round',
      required: true,
      min: 1,
      max: 5,
    }),
  );
  fields.push(
    mkField(cursor, page, {
      id: 'overall-callouts',
      type: 'textarea',
      label: 'Callouts / anything else the team should know?',
      required: false,
    }),
  );

  return {
    title: titleFor('QA review', snapshot.project.name, opts.date),
    description: `Card-by-card QA review for "${snapshot.project.name}" — one section per card in Validating or Approved.`,
    fields,
    thankYouTitle: 'Thanks for reviewing!',
    thankYouMessage: 'Your verdicts have been recorded.',
    requireEmail: false,
    allowMultiple: false,
    meta: { reviewedCardIds },
  };
}

function buildStakeholderFeedback(
  snapshot: ProjectSurveySnapshot,
  opts: ProjectSurveyOptions,
): ProjectSurveyResult {
  const cursor: Cursor = { order: 0 };
  const npsScoring: FieldScoring = { type: 'nps' };
  const fields: SurveyFieldDef[] = [
    mkField(cursor, 0, {
      id: 'nps-score',
      type: 'rating',
      label: 'How likely are you to recommend this project\'s progress to a colleague?',
      required: true,
      min: 0,
      max: 10,
      scoring: npsScoring,
    }),
    mkField(cursor, 0, {
      id: 'status',
      type: 'radio',
      label: 'How would you describe where things stand?',
      required: true,
      options: ['On track', 'At risk', 'Off track'],
    }),
    mkField(cursor, 0, {
      id: 'whats-working',
      type: 'textarea',
      label: "What's working well?",
      required: false,
    }),
    mkField(cursor, 0, {
      id: 'whats-missing',
      type: 'textarea',
      label: "What's missing or falling short?",
      required: false,
    }),
  ];

  return {
    title: titleFor('Milestone check-in', snapshot.project.name, opts.date),
    description: `Stakeholder check-in for "${snapshot.project.name}".`,
    fields,
    thankYouTitle: 'Thanks for the feedback!',
    thankYouMessage: 'We\'ll fold this into the next update.',
    requireEmail: true,
    allowMultiple: false,
    meta: undefined,
  };
}

function buildRetro(snapshot: ProjectSurveySnapshot, opts: ProjectSurveyOptions): ProjectSurveyResult {
  const cursor: Cursor = { order: 0 };
  const fields: SurveyFieldDef[] = [
    mkField(cursor, 0, { id: 'went-well', type: 'textarea', label: 'What went well?', required: false }),
    mkField(cursor, 0, { id: 'didnt-go-well', type: 'textarea', label: "What didn't go well?", required: false }),
    mkField(cursor, 0, { id: 'change', type: 'textarea', label: 'What should we change next time?', required: false }),
    mkField(cursor, 0, {
      id: 'overall-rating',
      type: 'rating',
      label: 'Overall rating for this project',
      required: true,
      min: 1,
      max: 5,
    }),
  ];

  return {
    title: titleFor('Retro', snapshot.project.name, opts.date),
    description: `Retrospective for "${snapshot.project.name}".`,
    fields,
    thankYouTitle: 'Thanks for the retro input!',
    thankYouMessage: 'Your answers have been recorded.',
    requireEmail: false,
    allowMultiple: false,
    meta: undefined,
  };
}

export function buildProjectSurvey(
  preset: ProjectSurveyPreset,
  snapshot: ProjectSurveySnapshot,
  opts: ProjectSurveyOptions = {},
): ProjectSurveyResult {
  switch (preset) {
    case 'qa_review':
      return buildQaReview(snapshot, opts);
    case 'stakeholder_feedback':
      return buildStakeholderFeedback(snapshot, opts);
    case 'retro':
      return buildRetro(snapshot, opts);
    default: {
      const _exhaustive: never = preset;
      throw new Error(`Unknown project survey preset: ${String(_exhaustive)}`);
    }
  }
}
