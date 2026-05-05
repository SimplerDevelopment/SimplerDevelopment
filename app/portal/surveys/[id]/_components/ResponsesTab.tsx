'use client';

/**
 * ResponsesTab — individual responses table for the survey detail page.
 *
 * Lifted verbatim from page.tsx. Renders the export-CSV button, an
 * empty-state card, or the per-response table with expandable answers.
 */

import type { SurveyField } from '@/components/admin/SurveyBuilder';
import type { Survey, SurveyResponse } from '../_lib/api';

interface Props {
  surveyId: string | number;
  survey: Survey;
  responses: SurveyResponse[];
}

export default function ResponsesTab({ surveyId, survey, responses }: Props) {
  return (
    <div className="space-y-4">
      {responses.length > 0 && (
        <div className="flex justify-end">
          <a
            href={`/api/portal/surveys/${surveyId}/export`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-background border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <span className="material-icons text-lg">download</span>
            Export CSV
          </a>
        </div>
      )}
      {responses.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <span className="material-icons text-4xl text-muted-foreground/50">inbox</span>
          <p className="text-muted-foreground mt-2 text-sm">No responses yet</p>
          <p className="text-xs text-muted-foreground mt-1">Share your survey to start collecting responses</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">#</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Respondent</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Source</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Answers</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {responses.map((r, i) => (
                  <tr key={r.id} className="hover:bg-muted/30 transition-colors">
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
                    <td className="px-4 py-3 text-muted-foreground">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <details className="cursor-pointer">
                        <summary className="text-primary text-xs hover:underline">View answers</summary>
                        <div className="mt-2 space-y-1">
                          {Object.entries(r.answers).map(([key, val]) => {
                            const field = (survey.fields as SurveyField[])?.find((f) => f.id === key);
                            return (
                              <div key={key} className="text-xs">
                                <span className="font-medium text-foreground">{field?.label || key}:</span>{' '}
                                <span className="text-muted-foreground">{String(val)}</span>
                              </div>
                            );
                          })}
                        </div>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
