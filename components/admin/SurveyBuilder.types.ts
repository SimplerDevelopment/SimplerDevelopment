import type { ShowIfCondition, FieldScoring } from '@/lib/db/schema';

export type FieldType =
  | 'text' | 'textarea' | 'number' | 'email' | 'phone' | 'url'
  | 'select' | 'radio' | 'checkbox' | 'toggle' | 'date' | 'rating' | 'heading' | 'slider'
  | 'page_break' | 'file' | 'image' | 'video';

export interface SurveyField {
  id: string;
  type: FieldType;
  label: string;
  placeholder: string;
  helpText: string;
  required: boolean;
  options: string[];
  min?: number;
  max?: number;
  step?: number;
  showIf?: { fieldId: string; values: string[] } | ShowIfCondition;
  conditionalOptions?: { fieldId: string; map: Record<string, string[]>; default?: string[] };
  goToPage?: Record<string, number>;
  order: number;
  page?: number;
  // SCORE-01: optional per-field scoring rule.
  scoring?: FieldScoring;
  mediaUrl?: string;
}
