'use client';

import { useState } from 'react';
import type { FieldType, SurveyField } from './SurveyBuilder.types';
import {
  FIELD_TYPES,
  TYPE_MAP,
  hasOptions,
  hasMediaUrl,
  genId,
} from './SurveyBuilder.constants';
import { FieldRow } from './survey-builder/FieldRow';
import { FieldEditorBody } from './survey-builder/FieldEditorBody';
import ThreePane from './survey-builder/ThreePane';
import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import { sBtnGhost } from '@/components/portal/portal-ui';

export type { FieldType, SurveyField };

interface Props {
  fields: SurveyField[];
  onChange: (fields: SurveyField[]) => void;
}

export default function SurveyBuilder({ fields, onChange }: Props) {
  const [showTypePicker, setShowTypePicker] = useState(false);
  // PUX-179 (design doc screen 38): three panes under the redesign — list · respondent view · settings. Flag off is the accordion.
  const studio = useFeatureFlag('portal-redesign');
  const [expandedId, setExpandedId]         = useState<string | null>(null);

  function addField(type: FieldType) {
    const next: SurveyField = {
      id: genId(),
      type,
      label: TYPE_MAP[type].label,
      placeholder: '',
      helpText: '',
      required: false,
      options: hasOptions(type) ? ['Option 1', 'Option 2'] : [],
      ...(type === 'slider' ? { min: 500, max: 50000, step: 500 } : {}),
      ...(hasMediaUrl(type) ? { mediaUrl: '' } : {}),
      order: fields.length,
    };
    const updated = [...fields, next];
    onChange(updated);
    setShowTypePicker(false);
    setExpandedId(next.id);
  }

  function updateField(id: string, patch: Partial<SurveyField>) {
    // IMPORTANT: Never include 'id' in patch — field IDs are immutable after creation
    // Changing IDs corrupts analytics for existing responses (FOUND-03)
    if ('id' in patch) {
      console.error('[SurveyBuilder] Attempted to change field ID — blocked');
      return;
    }
    onChange(fields.map(f => f.id === id ? { ...f, ...patch } : f));
  }

  function deleteField(id: string) {
    onChange(fields.filter(f => f.id !== id).map((f, i) => ({ ...f, order: i })));
    if (expandedId === id) setExpandedId(null);
  }

  function moveField(id: string, dir: -1 | 1) {
    const idx = fields.findIndex(f => f.id === id);
    if (idx + dir < 0 || idx + dir >= fields.length) return;
    const next = [...fields];
    [next[idx], next[idx + dir]] = [next[idx + dir], next[idx]];
    onChange(next.map((f, i) => ({ ...f, order: i })));
  }

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary';

  return (
    <div className="sm:col-span-2 space-y-3">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-foreground">Survey / Intake Form</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add fields clients must fill out when requesting this service. Leave empty to show a simple request form instead.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTypePicker(v => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
        >
          <span className="material-icons text-sm">add</span>
          Add Field
        </button>
      </div>

      {/* Type picker */}
      {showTypePicker && (
        <div className="border border-border rounded-xl p-4 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Choose field type</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {FIELD_TYPES.map(ft => (
              <button
                key={ft.type}
                type="button"
                onClick={() => addField(ft.type)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-card hover:bg-accent hover:border-primary/50 text-sm text-foreground transition-colors text-left"
              >
                <span className="material-icons text-base text-primary">{ft.icon}</span>
                <span className="text-xs leading-tight">{ft.label}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowTypePicker(false)}
            className="mt-3 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Field list */}
      {fields.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl py-8 text-center text-sm text-muted-foreground">
          No fields yet — click &ldquo;Add Field&rdquo; to build your intake form.
        </div>
      ) : studio ? (
        <ThreePane
          fields={fields}
          inputCls={inputCls}
          onPatch={updateField}
          onMove={moveField}
          onDelete={deleteField}
          addButton={<button type="button" onClick={() => setShowTypePicker(v => !v)} className={`${sBtnGhost} !py-1`}><span className="material-icons text-base">add</span>Add</button>}
        />
      ) : (
        <div className="space-y-2">
          {fields.map((field, idx) => {
            const isOpen = expandedId === field.id;

            // Page break rendered as a visual divider
            if (field.type === 'page_break') {
              const pageNum = fields.slice(0, idx).filter(f => f.type === 'page_break').length + 2;
              return (
                <FieldRow
                  key={field.id}
                  field={field}
                  idx={idx}
                  total={fields.length}
                  pageNumber={pageNum}
                  isOpen={isOpen}
                  onToggleOpen={() => setExpandedId(isOpen ? null : field.id)}
                  onMoveUp={() => moveField(field.id, -1)}
                  onMoveDown={() => moveField(field.id, 1)}
                  onDelete={() => deleteField(field.id)}
                />
              );
            }

            return (
              <div key={field.id} className={`border border-border rounded-xl bg-card overflow-hidden${field.showIf ? ' opacity-60' : ''}`}>
                <FieldRow
                  field={field}
                  idx={idx}
                  total={fields.length}
                  isOpen={isOpen}
                  onToggleOpen={() => setExpandedId(isOpen ? null : field.id)}
                  onMoveUp={() => moveField(field.id, -1)}
                  onMoveDown={() => moveField(field.id, 1)}
                  onDelete={() => deleteField(field.id)}
                />

                {/* Expanded editor */}
                {isOpen && (
                  <FieldEditorBody
                    field={field}
                    fields={fields}
                    inputCls={inputCls}
                    onChange={(patch) => updateField(field.id, patch)}
                    onDone={() => setExpandedId(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
