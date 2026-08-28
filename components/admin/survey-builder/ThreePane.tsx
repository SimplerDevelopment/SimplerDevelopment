'use client';

/**
 * PUX-179 (design doc screen 38): the builder as three panes — the question
 * list to select from, the selected question as a respondent meets it, and
 * its settings (type, label, options, required, logic, scoring). Reuses the
 * verbatim FieldRow / FieldEditorBody the accordion renders; only the
 * arrangement is new. Studio-only: SurveyBuilder gates on the flag.
 */

import { useState } from 'react';
import type { SurveyField } from '@/components/admin/SurveyBuilder.types';
import { FieldRow } from './FieldRow';
import { FieldEditorBody } from './FieldEditorBody';
import QuestionPreview from './QuestionPreview';

export default function ThreePane({
  fields, inputCls, onPatch, onMove, onDelete, addButton,
}: {
  fields: SurveyField[];
  inputCls: string;
  onPatch: (id: string, patch: Partial<SurveyField>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
  /** The builder's own Add Field control, rendered at the top of the list pane. */
  addButton: React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(fields[0]?.id ?? null);
  const selected = fields.find((f) => f.id === selectedId) ?? null;

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)_320px] lg:items-start">
      <aside className="space-y-2" aria-label="Questions">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-foreground">Questions</h3>
          {addButton}
        </div>
        <ol className="space-y-1.5">
          {fields.map((field, idx) => {
            // Same numbering as the accordion: breaks before this one, plus the first page.
            const page = fields.slice(0, idx).filter((f) => f.type === 'page_break').length + 2;
            return (
              <li key={field.id} onClick={() => setSelectedId(field.id)} aria-current={field.id === selectedId ? 'true' : undefined}
                className={`cursor-pointer rounded-xl ${field.id === selectedId ? 'ring-2 ring-primary' : ''}`}>
                <FieldRow
                  field={field} idx={idx} total={fields.length} pageNumber={field.type === 'page_break' ? page : undefined}
                  isOpen={field.id === selectedId}
                  onToggleOpen={() => setSelectedId(field.id)}
                  onMoveUp={() => onMove(field.id, -1)}
                  onMoveDown={() => onMove(field.id, 1)}
                  onDelete={() => { if (selectedId === field.id) setSelectedId(null); onDelete(field.id); }}
                />
              </li>
            );
          })}
        </ol>
      </aside>
      <section aria-label="Preview" className="rounded-2xl bg-muted/40 p-6">
        <QuestionPreview field={selected} />
      </section>
      <aside aria-label="Question settings" className="rounded-2xl border border-border bg-card p-4">
        {selected ? (
          <FieldEditorBody field={selected} fields={fields} inputCls={inputCls} onChange={(patch) => onPatch(selected.id, patch)} onDone={() => setSelectedId(null)} />
        ) : (
          <p className="text-sm text-muted-foreground">Select a question to edit its settings.</p>
        )}
      </aside>
    </div>
  );
}
