'use client';

// Extracted verbatim from components/admin/SurveyBuilder.tsx (PUX-179) — the builder is pinned at 554 code lines.

import { useFeatureFlag } from '@/components/portal/FeatureFlagsProvider';
import type { SurveyField } from '../SurveyBuilder.types';
import { supportsNps, usesNumericScoring } from '../SurveyBuilder.constants';

export type { SurveyField };

interface Props {
  field: SurveyField;
  onChange: (patch: Partial<SurveyField>) => void;
  inputCls: string;
}

export function ScoringEditor({ field, onChange, inputCls }: Props) {
  // PUX-179 (design doc screen 38): NPS is the Brain-adjacent choice — gold-tinted under the redesign.
  const studio = useFeatureFlag('portal-redesign');
  return (
    <div className="sm:col-span-2 border-t border-border pt-3 mt-1">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-foreground">Scoring (optional)</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Contribute this field&apos;s answer to a total score for each response.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!field.scoring}
          onClick={() => {
            if (field.scoring) {
              onChange({ scoring: undefined });
              return;
            }
            // Default scoring shape depends on field type.
            if (usesNumericScoring(field.type)) {
              onChange({ scoring: { type: 'numeric', weight: 1 } });
            } else if (field.type === 'toggle') {
              onChange({
                scoring: { type: 'option_map', options: { Yes: 1, No: 0 } },
              });
            } else {
              // select / radio / checkbox — seed every option to 0
              // so authors can edit, never silently miss values.
              const seed: Record<string, number> = {};
              for (const opt of field.options) {
                if (opt.trim()) seed[opt] = 0;
              }
              onChange({ scoring: { type: 'option_map', options: seed } });
            }
          }}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
            field.scoring ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
        >
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            field.scoring ? 'translate-x-4' : 'translate-x-0.5'
          }`} />
        </button>
      </div>

      {field.scoring && (
        <div className="mt-3 space-y-3">
          {/* Numeric / NPS mode for rating, slider, number */}
          {usesNumericScoring(field.type) && (
            <>
              <div className="flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Mode:</label>
                <div className="inline-flex rounded-md border border-border overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => onChange({
                      scoring: {
                        type: 'numeric',
                        weight: field.scoring?.type === 'numeric' ? field.scoring.weight : 1,
                      },
                    })}
                    className={`px-2.5 py-1 ${field.scoring?.type === 'numeric' ? 'bg-primary text-primary-foreground' : 'bg-background text-foreground hover:bg-muted/50'}`}
                  >
                    Weighted
                  </button>
                  {supportsNps(field.type) && (
                    <button
                      type="button"
                      onClick={() => onChange({ scoring: { type: 'nps' } })}
                      className={`px-2.5 py-1 border-l border-border ${field.scoring?.type === 'nps' ? (studio ? 'bg-[var(--studio-gold-surface)] text-[var(--studio-gold-ink)] font-semibold' : 'bg-primary text-primary-foreground') : 'bg-background text-foreground hover:bg-muted/50'}`}
                      title="0-6 → -1 (detractor), 7-8 → 0 (passive), 9-10 → +1 (promoter)"
                    >
                      NPS
                    </button>
                  )}
                </div>
              </div>

              {field.scoring.type === 'numeric' && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Weight</label>
                  <input
                    type="number"
                    step="0.5"
                    value={field.scoring.weight}
                    onChange={(e) => {
                      const w = Number(e.target.value);
                      onChange({
                        scoring: { type: 'numeric', weight: Number.isFinite(w) ? w : 1 },
                      });
                    }}
                    className={`${inputCls} w-32`}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Score = weight × answer. Use 1 for raw values, 0.5 to halve, -1 to subtract.
                  </p>
                </div>
              )}

              {field.scoring.type === 'nps' && (
                <div className={studio ? 'rounded-md border border-[var(--studio-gold-line)] bg-[var(--studio-gold-surface)] px-3 py-2 text-xs text-[var(--studio-gold-ink)]' : 'rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground'}>
                  <span className={`material-icons text-sm align-middle mr-1 ${studio ? 'text-[var(--studio-gold)]' : 'text-primary'}`}>info</span>
                  NPS bucketing: 0-6 → -1 (detractor), 7-8 → 0 (passive), 9-10 → +1 (promoter).
                </div>
              )}
            </>
          )}

          {/* Option-map mode for select / radio / checkbox / toggle */}
          {!usesNumericScoring(field.type) && field.scoring.type === 'option_map' && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-foreground">Option values</label>
              {(() => {
                const optionLabels =
                  field.type === 'toggle'
                    ? ['Yes', 'No']
                    : field.options.filter((o) => o.trim());
                if (optionLabels.length === 0) {
                  return (
                    <p className="text-xs text-muted-foreground">
                      Add options above to assign scoring values.
                    </p>
                  );
                }
                const map = field.scoring.options || {};
                return optionLabels.map((opt) => (
                  <div key={opt} className="flex items-center gap-2 text-xs">
                    <span className="flex-1 min-w-0 truncate text-foreground">{opt}</span>
                    <span className="text-muted-foreground shrink-0">=</span>
                    <input
                      type="number"
                      step="0.5"
                      value={typeof map[opt] === 'number' ? map[opt] : 0}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        const nextMap: Record<string, number> = { ...map };
                        nextMap[opt] = Number.isFinite(v) ? v : 0;
                        onChange({
                          scoring: { type: 'option_map', options: nextMap },
                        });
                      }}
                      className="w-20 px-2 py-1 rounded border border-border bg-background text-xs text-foreground"
                    />
                  </div>
                ));
              })()}
              {field.type === 'checkbox' && (
                <p className="text-xs text-muted-foreground mt-1">
                  Checkboxes sum the values of every selected option.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ScoringEditor;
