'use client';

/**
 * ResponsesTab — individual responses table for the survey detail page.
 *
 * Responses are grouped by `formName` so custom-form submissions (arbitrary
 * JSON payloads from html-render decks etc.) appear in their own section
 * alongside the structured 'main' submissions. Within a row, known answer
 * keys render via the survey's field schema; unknown keys render as raw
 * key/value pairs.
 */

import { useMemo, useState } from 'react';
import type { SurveyField } from '@/components/admin/SurveyBuilder';
import { type ResponseFilters, type Survey, type SurveyResponse, responseFiltersToQuery } from '../_lib/api';
import ResponseFiltersBar from './ResponseFiltersBar';

interface Props {
  surveyId: string | number;
  survey: Survey;
  responses: SurveyResponse[];
  filters: ResponseFilters;
  onFiltersChange: (next: ResponseFilters) => void;
  sourcesPresent: string[];
}

export default function ResponsesTab({ surveyId, survey, responses, filters, onFiltersChange, sourcesPresent }: Props) {
  // Group by formName, preserving insertion order so the most-recent form
  // (whatever first appears in the desc-by-createdAt list) is on top.
  const groups = useMemo(() => {
    const map = new Map<string, SurveyResponse[]>();
    for (const r of responses) {
      const key = r.formName || 'main';
      const arr = map.get(key);
      if (arr) arr.push(r);
      else map.set(key, [r]);
    }
    return Array.from(map.entries());
  }, [responses]);

  const fieldsById = useMemo(() => {
    const map = new Map<string, SurveyField>();
    for (const f of (survey.fields as SurveyField[] | null) || []) {
      if (f?.id) map.set(f.id, f);
    }
    return map;
  }, [survey.fields]);

  // Pass current filters through to the CSV export so the download matches
  // what's on screen.
  const exportQs = responseFiltersToQuery(filters).toString();
  const exportHref = `/api/portal/surveys/${surveyId}/export${exportQs ? `?${exportQs}` : ''}`;

  const hasAnyFilter = !!(filters.from || filters.to || filters.source || filters.q);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-stretch lg:justify-between">
        <div className="flex-1 min-w-0">
          <ResponseFiltersBar
            filters={filters}
            onChange={onFiltersChange}
            sourcesPresent={sourcesPresent}
            filteredCount={responses.length}
          />
        </div>
        {responses.length > 0 && (
          <div className="flex items-end">
            <a
              href={exportHref}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors whitespace-nowrap"
            >
              <span className="material-icons text-lg">download</span>
              Export CSV
            </a>
          </div>
        )}
      </div>
      {responses.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <span className="material-icons text-4xl text-muted-foreground/50">{hasAnyFilter ? 'filter_alt_off' : 'inbox'}</span>
          <p className="text-muted-foreground mt-2 text-sm">
            {hasAnyFilter ? 'No responses match these filters' : 'No responses yet'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {hasAnyFilter ? 'Try widening the date range or clearing the keyword search.' : 'Share your survey to start collecting responses'}
          </p>
        </div>
      ) : (
        groups.map(([formName, rows]) => (
          <FormGroup
            key={formName}
            formName={formName}
            responses={rows}
            fieldsById={fieldsById}
            isOnlyGroup={groups.length === 1}
          />
        ))
      )}
    </div>
  );
}

function FormGroup({
  formName,
  responses,
  fieldsById,
  isOnlyGroup,
}: {
  formName: string;
  responses: SurveyResponse[];
  fieldsById: Map<string, SurveyField>;
  isOnlyGroup: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
        >
          <span className="material-icons text-base">{open ? 'expand_more' : 'chevron_right'}</span>
          <code className="font-mono">{formName}</code>
          <span className="text-xs font-medium text-muted-foreground">({responses.length})</span>
          {isOnlyGroup && formName === 'main' && (
            <span className="text-[10px] font-medium text-muted-foreground/80 uppercase tracking-wider ml-1">structured</span>
          )}
        </button>
      </header>
      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/20">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Respondent</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Answers</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {responses.map((r, i) => (
                <tr key={r.id} className="hover:bg-muted/30 transition-colors align-top">
                  <td className="px-4 py-3 text-muted-foreground">{i + 1}</td>
                  <td className="px-4 py-3 text-foreground">
                    {r.respondentEmail || r.respondentName || (
                      <span className="text-muted-foreground italic">Anonymous</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {r.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{new Date(r.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <details className="cursor-pointer">
                      <summary className="text-primary text-xs hover:underline">View answers</summary>
                      <AnswersList answers={r.answers} fieldsById={fieldsById} />
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AnswersList({
  answers,
  fieldsById,
}: {
  answers: Record<string, unknown>;
  fieldsById: Map<string, SurveyField>;
}) {
  const entries = Object.entries(answers);
  return (
    <div className="mt-2 space-y-1">
      {entries.length === 0 && (
        <div className="text-xs text-muted-foreground italic">No answers recorded</div>
      )}
      {entries.map(([key, val]) => {
        const field = fieldsById.get(key);
        return (
          <div key={key} className="text-xs flex items-baseline gap-1.5">
            <span className="font-medium text-foreground shrink-0">
              {field?.label || key}
              {!field && <span className="ml-1 text-[10px] text-muted-foreground/60 font-mono">(custom)</span>}:
            </span>
            <span className="text-muted-foreground break-all">{formatValue(val)}</span>
          </div>
        );
      })}
    </div>
  );
}

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}
