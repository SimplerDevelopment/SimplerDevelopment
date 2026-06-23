// SCORE-01: survey response scoring.
//
// `computeSurveyScore` walks the served field set and the submitted answer
// map and returns an integer total (rounded half-up) — or `null` when no
// field has scoring configured (so the submit endpoint knows to leave
// `survey_responses.score` NULL instead of writing 0).
//
// Scoring semantics live in `FieldScoring` (lib/db/schema/surveys.ts):
//   - option_map: select / radio / checkbox / toggle — sum mapped values.
//                  checkbox answers are string[]; each entry contributes.
//                  Unknown keys / missing answers contribute 0.
//   - numeric:    rating / slider / number — weight * Number(answer) when the
//                  answer parses as a finite number, else 0.
//   - nps:        rating / slider — 0-6 → -1, 7-8 → 0, 9-10 → +1.

import type { SurveyFieldDef } from '@/lib/db/schema/surveys';

/** Math.round in JS rounds .5 toward +∞, which is exactly half-up. We wrap
 *  it so the rounding rule is explicit (and so it's easy to swap if the
 *  spec ever asks for bankers' rounding). */
function roundHalfUp(n: number): number {
  return Math.round(n);
}

function scoreOptionMap(field: SurveyFieldDef, answer: unknown): number {
  if (!field.scoring || field.scoring.type !== 'option_map') return 0;
  const map = field.scoring.options || {};
  if (Array.isArray(answer)) {
    // Checkbox: sum each selected option's mapped value.
    let total = 0;
    for (const a of answer) {
      const key = typeof a === 'string' ? a : String(a);
      const v = map[key];
      if (typeof v === 'number' && Number.isFinite(v)) total += v;
    }
    return total;
  }
  if (answer === undefined || answer === null || answer === '') return 0;
  // Single-value (select/radio/toggle). Toggle answers come through as boolean
  // or 'Yes'/'No' — normalize booleans so the option_map can key on the
  // human-readable labels.
  let key: string;
  if (typeof answer === 'boolean') key = answer ? 'Yes' : 'No';
  else if (typeof answer === 'string') key = answer;
  else key = String(answer);
  const v = map[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

function scoreNumeric(field: SurveyFieldDef, answer: unknown): number {
  if (!field.scoring || field.scoring.type !== 'numeric') return 0;
  if (answer === undefined || answer === null || answer === '') return 0;
  const n = Number(answer);
  if (!Number.isFinite(n)) return 0;
  return field.scoring.weight * n;
}

function scoreNps(answer: unknown): number {
  if (answer === undefined || answer === null || answer === '') return 0;
  const n = Number(answer);
  if (!Number.isFinite(n)) return 0;
  if (n >= 0 && n <= 6) return -1;
  if (n >= 7 && n <= 8) return 0;
  if (n >= 9 && n <= 10) return 1;
  return 0;
}

/**
 * Compute the total score for a survey response.
 *
 * @returns `null` when no field has a scoring rule (survey isn't scorable);
 *   otherwise the integer total (rounded half-up).
 */
export function computeSurveyScore(
  fields: SurveyFieldDef[],
  answers: Record<string, unknown>,
): number | null {
  if (!Array.isArray(fields) || fields.length === 0) return null;

  const scored = fields.filter((f) => f.scoring);
  if (scored.length === 0) return null;

  let total = 0;
  for (const field of scored) {
    const answer = answers ? answers[field.id] : undefined;
    const rule = field.scoring!;
    switch (rule.type) {
      case 'option_map':
        total += scoreOptionMap(field, answer);
        break;
      case 'numeric':
        total += scoreNumeric(field, answer);
        break;
      case 'nps':
        total += scoreNps(answer);
        break;
      default:
        // Forward-compat: unknown scoring shape contributes 0.
        break;
    }
  }

  return roundHalfUp(total);
}
