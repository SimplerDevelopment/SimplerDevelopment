import type { SurveyFieldDef, ShowIfRule, ShowIfCondition } from '@/lib/db/schema';

export type AnswerMap = Record<string, unknown>;

/**
 * Type guard: discriminates legacy single-rule shape from compound shape.
 * Legacy shape has 'fieldId' at top level; compound shape has 'combinator'.
 */
function isLegacyRule(showIf: { fieldId: string; values: string[] } | ShowIfCondition): showIf is { fieldId: string; values: string[] } {
  return 'fieldId' in showIf && !('combinator' in showIf);
}

/**
 * Evaluate a single typed rule against the answer map.
 * Operators: 'equals' (answer is in values), 'not_equals' (answer is NOT in values).
 */
function evaluateRule(rule: ShowIfRule, answers: AnswerMap): boolean {
  const rawVal = answers[rule.fieldId];
  if (rawVal === undefined || rawVal === null) return rule.operator === 'not_equals';
  const strVal = String(rawVal);
  switch (rule.operator) {
    case 'equals':
      return rule.values.includes(strVal);
    case 'not_equals':
      return !rule.values.includes(strVal);
    default:
      return rule.values.includes(strVal);
  }
}

/**
 * Determine whether a field should be visible given current answers.
 * Handles both legacy single-rule shape and compound AND shape.
 * Per D-05: only AND combinator is supported in the UI.
 */
export function isFieldVisible(
  field: Pick<SurveyFieldDef, 'showIf'>,
  answers: AnswerMap
): boolean {
  if (!field.showIf) return true;
  const showIf = field.showIf;

  if (isLegacyRule(showIf)) {
    // Backward-compatible: old single-rule shape (no operator field)
    const depVal = answers[showIf.fieldId];
    if (depVal === undefined || depVal === null) return false;
    return showIf.values.includes(String(depVal));
  }

  // Compound condition — per D-05, combinator is always 'AND'
  const { rules } = showIf;
  if (rules.length === 0) return true;
  return rules.every(r => evaluateRule(r, answers));
}

/**
 * Return the conditional option set for a field based on current answers.
 * Unchanged from Phase 1 — D-07 confirms no changes needed.
 */
export function getConditionalOptions(
  field: Pick<SurveyFieldDef, 'conditionalOptions' | 'options'>,
  answers: AnswerMap
): string[] {
  if (!field.conditionalOptions) return field.options;
  const depVal = String(answers[field.conditionalOptions.fieldId] ?? '');
  return field.conditionalOptions.map[depVal] ?? field.conditionalOptions.default ?? field.options;
}

/**
 * Replace piping tokens {fieldId} in a template string with live answer values.
 * Token format per D-08: {fieldId} using single curly braces and internal field ID.
 * Per D-09: only used in question labels and helpText.
 * Per D-10: unanswered tokens render as empty string (blank).
 */
export function resolvePiping(
  template: string,
  answers: AnswerMap
): string {
  if (!template || !template.includes('{')) return template;
  return template.replace(/\{([^}]+)\}/g, (_match, fieldId: string) => {
    const val = answers[fieldId];
    if (val === undefined || val === null || val === '') return '';
    return String(val);
  });
}
