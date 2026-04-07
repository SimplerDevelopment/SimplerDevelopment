'use client';

import { useState, useEffect } from 'react';
import type { ShowIfRule, ShowIfCondition } from '@/lib/db/schema';

interface SurveyFieldMinimal {
  id: string;
  type: string;
  label: string;
  options: string[];
  showIf?: { fieldId: string; values: string[] } | ShowIfCondition;
}

interface Props {
  field: SurveyFieldMinimal;
  allFields: SurveyFieldMinimal[]; // pre-filtered: no page_break, no heading, no self, only fields before current
  onChange: (patch: { showIf?: ShowIfCondition | undefined }) => void;
}

type UiOperator = 'equals' | 'not_equals' | 'is_one_of' | 'is_not_one_of';

interface RuleState {
  fieldId: string;
  uiOperator: UiOperator;
  values: string[];
}

/** Convert UiOperator + values to stored ShowIfRule operator + values. */
function toStoredRule(rule: RuleState): ShowIfRule {
  const operator: 'equals' | 'not_equals' =
    rule.uiOperator === 'equals' || rule.uiOperator === 'is_one_of'
      ? 'equals'
      : 'not_equals';
  return { fieldId: rule.fieldId, operator, values: rule.values };
}

/** Convert stored ShowIfRule to internal RuleState (best-effort operator recovery). */
function fromStoredRule(rule: ShowIfRule, allFields: SurveyFieldMinimal[]): RuleState {
  const triggerField = allFields.find(f => f.id === rule.fieldId);
  const isChoice = triggerField
    ? ['select', 'radio', 'checkbox'].includes(triggerField.type)
    : false;

  // If values has multiple entries, infer is_one_of / is_not_one_of
  const isMulti = rule.values.length > 1;
  let uiOperator: UiOperator;
  if (rule.operator === 'equals') {
    uiOperator = isMulti && isChoice ? 'is_one_of' : 'equals';
  } else {
    uiOperator = isMulti && isChoice ? 'is_not_one_of' : 'not_equals';
  }

  return { fieldId: rule.fieldId, uiOperator, values: rule.values };
}

/** Parse initial showIf into a flat RuleState array. */
function parseShowIf(
  showIf: SurveyFieldMinimal['showIf'],
  allFields: SurveyFieldMinimal[]
): RuleState[] {
  if (!showIf) return [];
  // Legacy shape: { fieldId, values }
  if ('fieldId' in showIf && !('combinator' in showIf)) {
    const legacy = showIf as { fieldId: string; values: string[] };
    return [{ fieldId: legacy.fieldId, uiOperator: 'equals', values: legacy.values }];
  }
  // Compound shape
  const compound = showIf as ShowIfCondition;
  return compound.rules.map(r => fromStoredRule(r, allFields));
}

function emptyRule(): RuleState {
  return { fieldId: '', uiOperator: 'equals', values: [] };
}

const inputCls =
  'px-2 py-2 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary';

export default function ConditionalLogicPanel({ field, allFields, onChange }: Props) {
  const [rules, setRules] = useState<RuleState[]>(() =>
    parseShowIf(field.showIf, allFields)
  );

  // Re-parse when field.showIf changes from outside (e.g. clear all from parent)
  useEffect(() => {
    setRules(parseShowIf(field.showIf, allFields));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.id]);

  function commit(nextRules: RuleState[]) {
    setRules(nextRules);
    if (nextRules.length === 0) {
      onChange({ showIf: undefined });
    } else {
      onChange({
        showIf: {
          combinator: 'AND',
          rules: nextRules.map(toStoredRule),
        },
      });
    }
  }

  function addRule() {
    commit([...rules, emptyRule()]);
  }

  function removeRule(idx: number) {
    commit(rules.filter((_, i) => i !== idx));
  }

  function clearAll() {
    commit([]);
  }

  function updateRule(idx: number, patch: Partial<RuleState>) {
    const next = rules.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    commit(next);
  }

  function handleFieldChange(idx: number, newFieldId: string) {
    updateRule(idx, { fieldId: newFieldId, values: [] });
  }

  function handleOperatorChange(idx: number, op: UiOperator) {
    // When switching to multi-value operators, clear single-value if it was a plain string
    updateRule(idx, { uiOperator: op, values: [] });
  }

  function handleSingleValueChange(idx: number, val: string) {
    updateRule(idx, { values: val ? [val] : [] });
  }

  function handleMultiValueFreeText(idx: number, raw: string) {
    const vals = raw
      .split(',')
      .map(v => v.trim())
      .filter(Boolean);
    updateRule(idx, { values: vals });
  }

  function handleCheckboxChange(idx: number, opt: string, checked: boolean) {
    const current = rules[idx].values;
    const next = checked ? [...current, opt] : current.filter(v => v !== opt);
    updateRule(idx, { values: next });
  }

  // ─── State 1: No condition ───────────────────────────────────────────────
  if (rules.length === 0) {
    return (
      <div className="sm:col-span-2 space-y-1">
        <p className="text-xs font-medium text-foreground">Conditional Logic</p>
        <p className="text-xs text-muted-foreground">Show this field only when...</p>
        <button
          type="button"
          onClick={addRule}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary/10 text-primary rounded-lg text-xs font-medium hover:bg-primary/20 transition-colors"
        >
          <span className="material-icons text-sm">add</span>
          Add Condition
        </button>
      </div>
    );
  }

  // ─── State 2 / 3: Rules configured ──────────────────────────────────────
  return (
    <div className="sm:col-span-2 space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-foreground">Conditional Logic</p>
          <p className="text-xs text-muted-foreground">Show this field only when...</p>
        </div>
        <button
          type="button"
          onClick={clearAll}
          title="Remove all conditions"
          className="p-1"
        >
          <span className="material-icons text-sm text-muted-foreground hover:text-destructive cursor-pointer">
            cancel
          </span>
        </button>
      </div>

      {/* Rule rows */}
      <div className="space-y-2">
        {rules.map((rule, idx) => {
          const triggerField = allFields.find(f => f.id === rule.fieldId);
          const isChoiceField =
            triggerField &&
            ['select', 'radio', 'checkbox'].includes(triggerField.type);
          const isMultiOp =
            rule.uiOperator === 'is_one_of' || rule.uiOperator === 'is_not_one_of';

          return (
            <div key={idx} className="flex items-start gap-2">
              {/* Field selector */}
              <select
                value={rule.fieldId}
                onChange={e => handleFieldChange(idx, e.target.value)}
                className={`${inputCls} flex-1 min-w-0`}
              >
                <option value="">Select field...</option>
                {allFields.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.label || f.type} ({f.type})
                  </option>
                ))}
              </select>

              {/* Operator selector */}
              <select
                value={rule.uiOperator}
                onChange={e => handleOperatorChange(idx, e.target.value as UiOperator)}
                className={`${inputCls} flex-shrink-0`}
              >
                <option value="equals">Is</option>
                <option value="not_equals">Is not</option>
                <option value="is_one_of">Is one of</option>
                <option value="is_not_one_of">Is not one of</option>
              </select>

              {/* Value input — depends on field type + operator */}
              <div className="flex-1 min-w-0">
                {isMultiOp && isChoiceField ? (
                  // Multi-value: checkboxes for choice fields
                  <div className="flex flex-wrap gap-2">
                    {triggerField.options.filter(Boolean).map(opt => (
                      <label key={opt} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="checkbox"
                          checked={rule.values.includes(opt)}
                          onChange={e => handleCheckboxChange(idx, opt, e.target.checked)}
                          className="w-3 h-3"
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                ) : isMultiOp ? (
                  // Multi-value: comma-separated free text
                  <input
                    type="text"
                    value={rule.values.join(', ')}
                    onChange={e => handleMultiValueFreeText(idx, e.target.value)}
                    placeholder="Enter values, comma-separated..."
                    className={`${inputCls} w-full`}
                  />
                ) : isChoiceField ? (
                  // Single-value: dropdown from field options
                  <select
                    value={rule.values[0] ?? ''}
                    onChange={e => handleSingleValueChange(idx, e.target.value)}
                    className={`${inputCls} w-full`}
                  >
                    <option value="">Select value...</option>
                    {triggerField.options.filter(Boolean).map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                ) : (
                  // Single-value: free text
                  <input
                    type="text"
                    value={rule.values[0] ?? ''}
                    onChange={e => handleSingleValueChange(idx, e.target.value)}
                    placeholder="Enter value..."
                    className={`${inputCls} w-full`}
                  />
                )}
              </div>

              {/* Remove rule button (always shown so rules can be removed) */}
              <button
                type="button"
                onClick={() => removeRule(idx)}
                title="Remove this rule"
                className="p-1 flex-shrink-0 self-start mt-0.5"
              >
                <span className="material-icons text-sm text-muted-foreground hover:text-destructive cursor-pointer">
                  remove_circle_outline
                </span>
              </button>
            </div>
          );
        })}
      </div>

      {/* Add another rule */}
      <button
        type="button"
        onClick={addRule}
        className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
      >
        <span className="material-icons text-sm">add</span>
        Add another rule
      </button>
    </div>
  );
}
