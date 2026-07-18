import type { FieldType } from './SurveyBuilder.types';

export const FIELD_TYPES: { type: FieldType; label: string; icon: string }[] = [
  { type: 'text',     label: 'Short Text',       icon: 'short_text' },
  { type: 'textarea', label: 'Long Text',         icon: 'notes' },
  { type: 'number',   label: 'Number',            icon: 'tag' },
  { type: 'email',    label: 'Email',             icon: 'email' },
  { type: 'phone',    label: 'Phone',             icon: 'phone' },
  { type: 'url',      label: 'URL / Website',     icon: 'link' },
  { type: 'date',     label: 'Date',              icon: 'calendar_today' },
  { type: 'select',   label: 'Dropdown',          icon: 'arrow_drop_down_circle' },
  { type: 'radio',    label: 'Multiple Choice',   icon: 'radio_button_checked' },
  { type: 'checkbox', label: 'Checkboxes',        icon: 'check_box' },
  { type: 'toggle',   label: 'Yes / No Toggle',   icon: 'toggle_on' },
  { type: 'rating',   label: 'Star Rating (1–5)', icon: 'star' },
  { type: 'slider',   label: 'Range Slider',      icon: 'tune' },
  { type: 'file',     label: 'File Upload',       icon: 'attach_file' },
  { type: 'heading',  label: 'Section Heading',   icon: 'title' },
  { type: 'page_break', label: 'Page Break',      icon: 'insert_page_break' },
  { type: 'image',    label: 'Image',             icon: 'image' },
  { type: 'video',    label: 'Video',             icon: 'movie' },
];

export const TYPE_MAP = Object.fromEntries(FIELD_TYPES.map(t => [t.type, t]));

export const hasOptions    = (t: FieldType) => t === 'select' || t === 'radio' || t === 'checkbox';
export const hasPlaceholder = (t: FieldType) =>
  ['text', 'textarea', 'number', 'email', 'phone', 'url', 'date'].includes(t);
export const hasRequired   = (t: FieldType) => t !== 'heading' && t !== 'page_break' && t !== 'image' && t !== 'video';
export const hasBranching  = (t: FieldType) => t === 'select' || t === 'radio';
// SCORE-01: which field types can carry a scoring rule.
export const hasScoring    = (t: FieldType) =>
  t === 'rating' || t === 'slider' || t === 'select' || t === 'radio'
  || t === 'checkbox' || t === 'toggle' || t === 'number';
export const supportsNps   = (t: FieldType) => t === 'rating' || t === 'slider';
// Numeric weight (vs option-map). Numeric covers rating/slider/number; the
// option types use option_map. NPS is a separate sub-mode of numeric-eligible
// types (rating/slider).
export const usesNumericScoring = (t: FieldType) => t === 'rating' || t === 'slider' || t === 'number';
// Display-only media fields: no answer collected, just a `mediaUrl` to render.
export const hasMediaUrl = (t: FieldType) => t === 'image' || t === 'video';

export function genId() {
  return Math.random().toString(36).slice(2, 10);
}
