import type { SurveyFieldDef } from '@/lib/db/schema';

export type AnswerMap = Record<string, unknown>;

export function isFieldVisible(
  field: Pick<SurveyFieldDef, 'showIf'>,
  answers: AnswerMap
): boolean {
  if (!field.showIf) return true;
  const depVal = answers[field.showIf.fieldId];
  if (depVal === undefined || depVal === null) return false;
  return field.showIf.values.includes(String(depVal));
}

export function getConditionalOptions(
  field: Pick<SurveyFieldDef, 'conditionalOptions' | 'options'>,
  answers: AnswerMap
): string[] {
  if (!field.conditionalOptions) return field.options;
  const depVal = String(answers[field.conditionalOptions.fieldId] ?? '');
  return field.conditionalOptions.map[depVal] ?? field.conditionalOptions.default ?? field.options;
}
