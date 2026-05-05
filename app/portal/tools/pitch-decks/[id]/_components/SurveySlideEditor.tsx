/** Survey-slide editor — two views: question list (pickable cards) and survey-field editor (live SurveySlideRenderer + properties panel). */
'use client';

import type { ReactNode } from 'react';
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import { SurveySlideRenderer, type SurveySlideField } from '@/components/pitch-deck/SurveySlideRenderer';
import { getSurveyFieldIcon } from '../_lib/helpers';
import { SurveyFieldPropertiesPanel, type SurveyFieldForPanel } from './SurveyFieldPropertiesPanel';

export interface SurveyField {
  id: string;
  type: string;
  label: string;
  required: boolean;
  options: string[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
}

export interface SurveySlideQuestionListProps {
  slide: PitchDeckSlideV2;
  fields: SurveyField[];
  onSelectField: (fieldId: string) => void;
  onRemoveSlide: () => void;
}

export function SurveySlideQuestionList({ slide, fields, onSelectField, onRemoveSlide }: SurveySlideQuestionListProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-6 space-y-4" style={{ minHeight: '600px' }}>
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
          <span className="material-icons text-xl text-emerald-500">assignment</span>
        </div>
        <div className="flex-1">
          <h3 className="text-base font-semibold text-foreground">{slide.label}</h3>
          <p className="text-xs text-muted-foreground">Click a question to customize its slide layout</p>
        </div>
        <div className="flex items-center gap-1.5">
          <a
            href={`/portal/surveys/${slide.surveyId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <span className="material-icons text-sm">open_in_new</span>
            Edit Survey
          </a>
          <button
            onClick={onRemoveSlide}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-border rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <span className="material-icons text-sm">delete</span>
          </button>
        </div>
      </div>

      <div className="space-y-1">
        {fields.map((field, fieldIdx) => {
          const hasCustomBlocks = !!(slide.surveyFieldBlocks?.[field.id]);
          return (
            <button
              key={field.id}
              onClick={() => onSelectField(field.id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left hover:bg-accent transition-colors group/field border border-transparent hover:border-border"
            >
              <span className="text-xs font-mono text-muted-foreground/50 w-5 text-right shrink-0">{fieldIdx + 1}</span>
              <span className="material-icons text-base text-emerald-500 shrink-0">{getSurveyFieldIcon(field.type)}</span>
              <div className="flex-1 min-w-0">
                <span className="text-sm text-foreground truncate block">{field.label}</span>
                <span className="text-[10px] text-muted-foreground">{field.type}{field.required ? ' (required)' : ''}</span>
              </div>
              {hasCustomBlocks && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium shrink-0">customized</span>
              )}
              <span className="material-icons text-sm text-muted-foreground/50 group-hover/field:text-foreground transition-colors shrink-0">chevron_right</span>
            </button>
          );
        })}
        {fields.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            <span className="material-icons text-2xl mb-2 block">quiz</span>
            No questions found. Add questions in the survey editor.
          </div>
        )}
      </div>

      <div className="bg-accent/30 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <span className="material-icons text-sm text-emerald-500 mt-0.5">info</span>
          <p className="text-xs text-muted-foreground">
            Each question expands into its own full-screen slide during the presentation.
            Customize the layout by clicking a question above. Required blocks (heading, input) cannot be deleted.
          </p>
        </div>
      </div>

      <div className="bg-accent/30 rounded-lg p-3">
        <div className="flex items-start gap-2">
          <span className="material-icons text-sm text-primary mt-0.5">recommend</span>
          <div className="flex-1 text-xs text-muted-foreground">
            Need to edit the dynamic result slide after the survey?
            <a
              href={`/portal/surveys/${slide.surveyId}#recommendation`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline ml-1 inline-flex items-center gap-0.5"
            >
              Edit recommendation in the survey
              <span className="material-icons text-xs">open_in_new</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface SurveyFieldEditorViewProps {
  slide: PitchDeckSlideV2;
  theme: PitchDeckTheme;
  fields: SurveyField[];
  editingFieldId: string;
  onSelectFieldId: (id: string | null) => void;
  onUpdateField: (updates: Record<string, unknown>) => void;
  slideSettingsPanel: ReactNode;
}

export function SurveyFieldEditorView({
  slide, theme, fields, editingFieldId, onSelectFieldId, onUpdateField, slideSettingsPanel,
}: SurveyFieldEditorViewProps) {
  const editingField = fields.find(f => f.id === editingFieldId);
  const idx = fields.findIndex(f => f.id === editingFieldId);

  return (
    <>
      <div className="flex items-center gap-2 mb-3">
        <button
          onClick={() => onSelectFieldId(null)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg transition-colors shrink-0"
        >
          <span className="material-icons text-sm">arrow_back</span>
          Back
        </button>
        <button
          onClick={() => { if (idx > 0) onSelectFieldId(fields[idx - 1].id); }}
          disabled={idx <= 0}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="Previous question"
        >
          <span className="material-icons text-sm">chevron_left</span>
        </button>
        <div className="relative flex-1 min-w-0">
          <select
            value={editingFieldId || ''}
            onChange={(e) => onSelectFieldId(e.target.value)}
            className="w-full appearance-none bg-accent/50 border border-border rounded-lg pl-7 pr-7 py-1 text-xs text-foreground cursor-pointer hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary/50 truncate"
          >
            {fields.map((f, i) => (
              <option key={f.id} value={f.id}>
                {i + 1}. {f.label} ({f.type})
              </option>
            ))}
          </select>
          {editingField && (
            <span className="material-icons text-xs text-emerald-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none">
              {getSurveyFieldIcon(editingField.type)}
            </span>
          )}
          <span className="material-icons text-xs text-muted-foreground absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
            unfold_more
          </span>
        </div>
        <button
          onClick={() => { if (idx < fields.length - 1) onSelectFieldId(fields[idx + 1].id); }}
          disabled={idx >= fields.length - 1}
          className="inline-flex items-center justify-center w-7 h-7 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          title="Next question"
        >
          <span className="material-icons text-sm">chevron_right</span>
        </button>
      </div>
      {/* Live-parity survey field preview. Renders the exact same SurveySlideRenderer
          the public tenant-subdomain view uses, so the editor and the live deck never drift.
          Field properties are edited in the right-hand SurveyFieldPropertiesPanel, which
          writes back to the survey record (source of truth). */}
      <div className="flex gap-4" style={{ minHeight: '600px' }}>
        <div
          className="flex-1 rounded-xl border border-border relative"
          style={{
            backgroundColor: slide.pageSettings?.backgroundColor || theme.backgroundColor,
            color: theme.textColor,
            fontFamily: `"${theme.bodyFont}", sans-serif`,
            minHeight: 'calc(100vh - 220px)',
          }}
        >
          <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
          {editingField ? (
            <SurveySlideRenderer
              field={editingField as unknown as SurveySlideField}
              answers={{}}
              onAnswer={() => {}}
              theme={theme}
              surveyTitle={slide.label || 'Survey'}
              onNext={() => { if (idx < fields.length - 1) onSelectFieldId(fields[idx + 1].id); }}
              onBack={() => { if (idx > 0) onSelectFieldId(fields[idx - 1].id); }}
              showBack
              isLastQuestion={false}
              isSubmitting={false}
              containerClassName="min-h-[calc(100vh-220px)] px-8 py-12"
            />
          ) : null}
        </div>
        <div className="w-80 shrink-0 bg-card border border-border rounded-xl p-4 overflow-y-auto space-y-6" style={{ maxHeight: 'calc(100vh - 220px)' }}>
          {editingField && slide.surveyId ? (
            <SurveyFieldPropertiesPanel
              field={editingField as SurveyFieldForPanel}
              surveyId={slide.surveyId}
              onUpdate={onUpdateField}
            />
          ) : null}
          {slideSettingsPanel}
        </div>
      </div>
    </>
  );
}
