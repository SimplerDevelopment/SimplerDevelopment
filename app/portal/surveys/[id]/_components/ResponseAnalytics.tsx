'use client';

/**
 * ResponseAnalytics — analytics tab for the survey detail page.
 *
 * Lifted verbatim from page.tsx. Renders summary cards, per-question
 * analytics (rating/slider/radio/select/checkbox/toggle/text breakdowns),
 * a 14-day response-volume timeline, and a source breakdown bar.
 *
 * Behavior is preserved 1:1 — no logic changes during refactor.
 */

import type { SurveyField } from '@/components/admin/SurveyBuilder';
import type { Survey, SurveyResponse, SurveyResponseStats } from '../_lib/api';
import AiSummaryPanel from './AiSummaryPanel';

const SUMMARIZABLE_TYPES = new Set(['text', 'textarea']);

interface Props {
  survey: Survey;
  responses: SurveyResponse[];
  stats: SurveyResponseStats;
}

export default function ResponseAnalytics({ survey, responses, stats }: Props) {
  if (responses.length === 0) {
    return (
      <div className="space-y-6">
        <div className="bg-card border border-border rounded-xl p-10 text-center">
          <span className="material-icons text-4xl text-muted-foreground/50">bar_chart</span>
          <p className="text-muted-foreground mt-2 text-sm">No responses to analyze yet</p>
        </div>
      </div>
    );
  }

  const fields = ((survey.fields || []) as SurveyField[]).filter(
    (f) => f.type !== 'heading' && f.type !== 'page_break',
  );

  // AI summary only makes sense when there's free-text content to summarize.
  const summarizableFieldIds = new Set(
    fields.filter((f) => SUMMARIZABLE_TYPES.has(f.type)).map((f) => f.id),
  );
  const hasSummarizableContent =
    summarizableFieldIds.size > 0 &&
    responses.some((r) => {
      for (const id of summarizableFieldIds) {
        const v = r.answers[id];
        if (typeof v === 'string' && v.trim()) return true;
      }
      return false;
    });

  return (
    <div className="space-y-6">
      {/* AI summary (AI-01 / AI-02) — only when there's text content */}
      {hasSummarizableContent && <AiSummaryPanel surveyId={survey.id} />}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          <p className="text-xs text-muted-foreground">Total Responses</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.completed}</p>
          <p className="text-xs text-muted-foreground">Completed</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">
            {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
          </p>
          <p className="text-xs text-muted-foreground">Completion Rate</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-foreground">{stats.withEmail}</p>
          <p className="text-xs text-muted-foreground">Identified</p>
        </div>
      </div>

      {/* Per-question analytics */}
      {fields.map((field) => {
        const allVals = responses
          .map((r) => r.answers[field.id])
          .filter((v) => v !== undefined && v !== null && v !== '');

        return (
          <div key={field.id} className="bg-card border border-border rounded-xl p-5">
            <h4 className="font-semibold text-foreground text-sm mb-3">{field.label}</h4>
            <p className="text-xs text-muted-foreground mb-4">
              {allVals.length} of {responses.length} answered
            </p>

            {/* Rating / Slider — average + distribution */}
            {(field.type === 'rating' || field.type === 'slider') &&
              (() => {
                const nums = allVals.map(Number).filter((n) => !isNaN(n));
                const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                const min = field.type === 'rating' ? 1 : field.min ?? 0;
                const max = field.type === 'rating' ? 5 : field.max ?? 100;

                if (field.type === 'rating') {
                  const dist = [1, 2, 3, 4, 5].map((star) => nums.filter((n) => n === star).length);
                  const maxCount = Math.max(...dist, 1);
                  return (
                    <div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-2xl font-bold text-foreground">{avg.toFixed(1)}</span>
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <span
                              key={s}
                              className="text-lg"
                              style={{ color: s <= Math.round(avg) ? survey.color || '#2563eb' : '#d1d5db' }}
                            >
                              &#9733;
                            </span>
                          ))}
                        </div>
                        <span className="text-xs text-muted-foreground">({nums.length} ratings)</span>
                      </div>
                      <div className="space-y-1">
                        {[5, 4, 3, 2, 1].map((star) => (
                          <div key={star} className="flex items-center gap-2 text-xs">
                            <span className="w-3 text-right text-muted-foreground">{star}</span>
                            <span className="text-muted-foreground">&#9733;</span>
                            <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{
                                  width: `${(dist[star - 1] / maxCount) * 100}%`,
                                  backgroundColor: survey.color || '#2563eb',
                                }}
                              />
                            </div>
                            <span className="w-8 text-right text-muted-foreground">{dist[star - 1]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                }

                // Slider
                return (
                  <div className="flex items-center gap-4">
                    <div>
                      <span className="text-2xl font-bold text-foreground">{avg.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground ml-1">avg</span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Range: {min} &ndash; {max} | Min response: {Math.min(...nums)} | Max: {Math.max(...nums)}
                    </div>
                  </div>
                );
              })()}

            {/* Radio / Select / Checkbox — bar chart */}
            {(field.type === 'radio' || field.type === 'select' || field.type === 'checkbox') &&
              (() => {
                const counts: Record<string, number> = {};
                for (const opt of field.options) counts[opt] = 0;
                for (const val of allVals) {
                  if (Array.isArray(val)) {
                    for (const v of val) counts[String(v)] = (counts[String(v)] || 0) + 1;
                  } else {
                    counts[String(val)] = (counts[String(val)] || 0) + 1;
                  }
                }
                const maxCount = Math.max(...Object.values(counts), 1);
                const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

                return (
                  <div className="space-y-1.5">
                    {entries.map(([label, count]) => (
                      <div key={label} className="flex items-center gap-2 text-xs">
                        <span className="w-28 text-right text-muted-foreground truncate shrink-0">{label}</span>
                        <div className="flex-1 h-5 bg-muted rounded overflow-hidden">
                          <div
                            className="h-full rounded transition-all flex items-center px-2"
                            style={{
                              width: `${Math.max((count / maxCount) * 100, 2)}%`,
                              backgroundColor: survey.color || '#2563eb',
                            }}
                          >
                            {count > 0 && <span className="text-white text-xs font-medium">{count}</span>}
                          </div>
                        </div>
                        <span className="w-10 text-right text-muted-foreground">
                          {allVals.length > 0 ? Math.round((count / allVals.length) * 100) : 0}%
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}

            {/* Toggle — yes/no split */}
            {field.type === 'toggle' &&
              (() => {
                const yesCount = allVals.filter((v) => v === true || v === 'true').length;
                const noCount = allVals.length - yesCount;
                return (
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-6 rounded-full overflow-hidden bg-muted flex">
                        <div
                          className="h-full bg-green-500"
                          style={{ width: `${allVals.length ? (yesCount / allVals.length) * 100 : 50}%` }}
                        />
                        <div className="h-full bg-red-400 flex-1" />
                      </div>
                    </div>
                    <span className="text-xs text-green-600 font-medium">
                      Yes: {yesCount} ({allVals.length ? Math.round((yesCount / allVals.length) * 100) : 0}%)
                    </span>
                    <span className="text-xs text-red-500 font-medium">
                      No: {noCount} ({allVals.length ? Math.round((noCount / allVals.length) * 100) : 0}%)
                    </span>
                  </div>
                );
              })()}

            {/* Text / textarea / other — show recent responses */}
            {['text', 'textarea', 'email', 'phone', 'url', 'number', 'date'].includes(field.type) && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {allVals.slice(0, 10).map((val, i) => (
                  <div key={i} className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded">
                    {String(val)}
                  </div>
                ))}
                {allVals.length > 10 && (
                  <p className="text-xs text-muted-foreground">+ {allVals.length - 10} more responses</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Response timeline */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
          <span className="material-icons text-lg text-primary">timeline</span>
          Response Timeline
        </h4>
        {(() => {
          // Group by date
          const byDate: Record<string, number> = {};
          for (const r of responses) {
            const d = new Date(r.createdAt).toLocaleDateString();
            byDate[d] = (byDate[d] || 0) + 1;
          }
          const dates = Object.entries(byDate).slice(-14); // last 14 days
          const maxDay = Math.max(...dates.map((d) => d[1]), 1);

          return (
            <div className="flex items-end gap-1 h-24">
              {dates.map(([date, count]) => (
                <div key={date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-xs text-muted-foreground">{count}</span>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: `${Math.max((count / maxDay) * 64, 4)}px`,
                      backgroundColor: survey.color || '#2563eb',
                      opacity: 0.8,
                    }}
                    title={`${date}: ${count} responses`}
                  />
                  <span className="text-[10px] text-muted-foreground truncate w-full text-center">
                    {new Date(date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Source breakdown */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h4 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
          <span className="material-icons text-lg text-primary">donut_small</span>
          Response Sources
        </h4>
        {(() => {
          const bySrc: Record<string, number> = {};
          for (const r of responses) bySrc[r.source] = (bySrc[r.source] || 0) + 1;
          const entries = Object.entries(bySrc).sort((a, b) => b[1] - a[1]);
          const srcColors: Record<string, string> = {
            link: '#2563eb',
            email: '#16a34a',
            embed: '#9333ea',
            crm: '#ea580c',
            booking: '#0891b2',
          };

          return (
            <div className="flex items-center gap-6">
              <div className="flex gap-1 h-6 flex-1 rounded-full overflow-hidden">
                {entries.map(([src, count]) => (
                  <div
                    key={src}
                    style={{
                      width: `${(count / responses.length) * 100}%`,
                      backgroundColor: srcColors[src] || '#6b7280',
                    }}
                    title={`${src}: ${count}`}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-3 text-xs">
                {entries.map(([src, count]) => (
                  <div key={src} className="flex items-center gap-1.5">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: srcColors[src] || '#6b7280' }}
                    />
                    <span className="text-muted-foreground">
                      {src}: {count}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
