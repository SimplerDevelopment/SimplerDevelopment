'use client';

/**
 * QuestionTypePicker — choose a question type.
 *
 * Standalone version of the type-picker grid that currently lives inside
 * components/admin/SurveyBuilder. Used by tests as a target for type-change
 * callbacks and reserved as the public seam if/when the picker is lifted out
 * of SurveyBuilder for reuse (templates, AI-suggested questions, etc.).
 */

import type { FieldType } from '@/components/admin/SurveyBuilder';

interface TypeMeta {
  type: FieldType;
  label: string;
  icon: string;
}

export const QUESTION_TYPES: TypeMeta[] = [
  { type: 'text', label: 'Short Text', icon: 'short_text' },
  { type: 'textarea', label: 'Long Text', icon: 'notes' },
  { type: 'number', label: 'Number', icon: 'tag' },
  { type: 'email', label: 'Email', icon: 'email' },
  { type: 'phone', label: 'Phone', icon: 'phone' },
  { type: 'url', label: 'URL / Website', icon: 'link' },
  { type: 'date', label: 'Date', icon: 'calendar_today' },
  { type: 'select', label: 'Dropdown', icon: 'arrow_drop_down_circle' },
  { type: 'radio', label: 'Multiple Choice', icon: 'radio_button_checked' },
  { type: 'checkbox', label: 'Checkboxes', icon: 'check_box' },
  { type: 'toggle', label: 'Yes / No Toggle', icon: 'toggle_on' },
  { type: 'rating', label: 'Star Rating (1-5)', icon: 'star' },
  { type: 'slider', label: 'Range Slider', icon: 'tune' },
  { type: 'file', label: 'File Upload', icon: 'attach_file' },
  { type: 'heading', label: 'Section Heading', icon: 'title' },
  { type: 'page_break', label: 'Page Break', icon: 'insert_page_break' },
];

interface Props {
  value: FieldType;
  onChange: (type: FieldType) => void;
}

export default function QuestionTypePicker({ value, onChange }: Props) {
  return (
    <div>
      <label className="block text-xs font-medium text-foreground mb-1">Field Type</label>
      <select
        aria-label="Question type"
        value={value}
        onChange={(e) => onChange(e.target.value as FieldType)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        {QUESTION_TYPES.map((t) => (
          <option key={t.type} value={t.type}>
            {t.label}
          </option>
        ))}
      </select>
    </div>
  );
}
