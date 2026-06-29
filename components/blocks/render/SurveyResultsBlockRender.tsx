'use client';

import { useEffect, useState } from 'react';
import type { SurveyResultsBlock, SurveyResultsChartType } from '@/types/blocks';
import { getElementCSS } from '@/lib/utils/elementStyles';

interface QuestionResult {
  fieldId: string;
  label: string;
  type: string;
  optionCounts?: Record<string, number>;
  numericStats?: { average: number; min: number; max: number; count: number };
  textSamples?: string[];
  answerCount: number;
}

interface ResultsData {
  surveyTitle: string;
  totalResponses: number;
  questions: QuestionResult[];
}

const CHART_COLORS = [
  '#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b',
];

function BarChart({ data, accentColor }: { data: Record<string, number>; accentColor?: string }) {
  const entries = Object.entries(data);
  const maxVal = Math.max(...entries.map(([, v]) => v), 1);
  const total = entries.reduce((a, [, v]) => a + v, 0);

  return (
    <div className="space-y-2.5">
      {entries.map(([label, count], i) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const color = accentColor || CHART_COLORS[i % CHART_COLORS.length];
        return (
          <div key={label} className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground w-28 text-right shrink-0 truncate" title={label}>{label}</span>
            <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(count / maxVal) * 100}%`, backgroundColor: color }} />
            </div>
            <span className="text-xs font-medium w-14 text-right">{pct}% ({count})</span>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ data, accentColor }: { data: Record<string, number>; accentColor?: string }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total === 0) return <p className="text-sm text-muted-foreground">No responses yet</p>;

  let offset = 0;
  return (
    <div className="flex items-center gap-6 flex-wrap">
      <svg viewBox="0 0 36 36" className="w-28 h-28 shrink-0">
        {entries.map(([label, count], i) => {
          const pct = (count / total) * 100;
          const thisOffset = offset;
          offset += pct;
          const color = accentColor ? accentColor : CHART_COLORS[i % CHART_COLORS.length];
          return (
            <circle key={label} r="15.915" cx="18" cy="18" fill="none"
              stroke={color} strokeWidth="5"
              strokeDasharray={`${pct} ${100 - pct}`}
              strokeDashoffset={`${-thisOffset}`} />
          );
        })}
      </svg>
      <div className="space-y-1.5">
        {entries.map(([label, count], i) => {
          const pct = Math.round((count / total) * 100);
          const color = accentColor ? accentColor : CHART_COLORS[i % CHART_COLORS.length];
          return (
            <div key={label} className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
              <span className="text-xs">{label}</span>
              <span className="text-xs font-medium text-muted-foreground">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ListChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort(([, a], [, b]) => b - a);
  const total = entries.reduce((a, [, v]) => a + v, 0);

  return (
    <div className="divide-y divide-border">
      {entries.map(([label, count]) => {
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        return (
          <div key={label} className="flex items-center justify-between py-2.5">
            <span className="text-sm">{label}</span>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{count}</span>
              <span className="text-xs text-muted-foreground w-10 text-right">{pct}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NumericStat({ stats, label }: { stats: { average: number; min: number; max: number; count: number }; label: string }) {
  const isRating = stats.max <= 10;
  return (
    <div className="flex items-center gap-8 flex-wrap">
      <div className="text-center">
        <div className="text-4xl font-bold" style={{ color: 'var(--brand-primary, #6366f1)' }}>{stats.average}</div>
        {isRating && (
          <div className="flex gap-0.5 justify-center mt-1">
            {Array.from({ length: Math.ceil(stats.max) }, (_, i) => (
              <span key={i} className={`material-icons text-lg ${i < Math.round(stats.average) ? 'text-amber-400' : 'text-muted-foreground/20'}`}>star</span>
            ))}
          </div>
        )}
        <div className="text-xs text-muted-foreground mt-1">Average {label}</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-foreground">{stats.count}</div>
        <div className="text-xs text-muted-foreground mt-1">Responses</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-foreground">{stats.min} - {stats.max}</div>
        <div className="text-xs text-muted-foreground mt-1">Range</div>
      </div>
    </div>
  );
}

function TextResponses({ samples, limit }: { samples: string[]; limit: number }) {
  const shown = samples.slice(0, limit);
  return (
    <div className="space-y-2">
      {shown.map((s, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="material-icons text-sm text-muted-foreground/40 mt-0.5 shrink-0">format_quote</span>
          <p className="text-sm text-muted-foreground italic">{s}</p>
        </div>
      ))}
      {samples.length > limit && (
        <p className="text-xs text-muted-foreground">+ {samples.length - limit} more responses</p>
      )}
    </div>
  );
}

function chartIconForType(chartType: SurveyResultsChartType): string {
  switch (chartType) {
    case 'bar': return 'bar_chart';
    case 'pie': case 'donut': return 'donut_large';
    case 'list': return 'format_list_numbered';
    case 'number': return 'tag';
    default: return 'bar_chart';
  }
}

function renderQuestion(q: QuestionResult, chartType: SurveyResultsChartType, accentColor?: string, showText?: boolean, textLimit?: number) {
  if (q.answerCount === 0) return null;

  let content: React.ReactNode = null;
  let icon = 'bar_chart';

  if (q.optionCounts) {
    icon = chartIconForType(chartType);
    switch (chartType) {
      case 'pie':
      case 'donut':
        content = <DonutChart data={q.optionCounts} accentColor={accentColor} />;
        break;
      case 'list':
        content = <ListChart data={q.optionCounts} />;
        break;
      default:
        content = <BarChart data={q.optionCounts} accentColor={accentColor} />;
    }
  } else if (q.numericStats) {
    icon = 'star';
    content = <NumericStat stats={q.numericStats} label={q.label} />;
  } else if (q.textSamples && showText !== false) {
    icon = 'chat_bubble_outline';
    content = <TextResponses samples={q.textSamples} limit={textLimit || 5} />;
  }

  if (!content) return null;

  return (
    <div key={q.fieldId} className="rounded-lg border border-border bg-card p-5">
      <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
        <span className="material-icons text-base" style={{ color: 'var(--brand-primary, #6366f1)' }}>{icon}</span>
        {q.label}
        <span className="text-xs font-normal text-muted-foreground ml-auto">{q.answerCount} answers</span>
      </h4>
      {content}
    </div>
  );
}

export function SurveyResultsBlockRender({ block }: { block: SurveyResultsBlock }) {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState(0);

  useEffect(() => {
    if (!block.surveySlug) { void Promise.resolve().then(() => setLoading(false)); return; }
    fetch(`/api/surveys/${block.surveySlug}/results`)
      .then(r => r.json())
      .then(json => {
        if (json.success) setData(json.data);
        else setError(json.message || 'Failed to load results');
      })
      .catch(() => setError('Failed to load results'))
      .finally(() => setLoading(false));
  }, [block.surveySlug]);

  if (!block.surveySlug) return null;

  if (loading) {
    return (
      <div className="py-12 text-center">
        <span className="material-icons animate-spin text-2xl text-muted-foreground">autorenew</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <span className="material-icons text-2xl mb-2 block">error_outline</span>
        <p className="text-sm">{error || 'No results available'}</p>
      </div>
    );
  }

  const chartType = block.chartType || 'bar';
  const filteredQuestions = block.fieldIds?.length
    ? data.questions.filter(q => block.fieldIds!.includes(q.fieldId))
    : data.questions;

  return (
    <div className="py-8 px-4 max-w-4xl mx-auto">
      {block.title && <h2 className="font-heading text-3xl font-bold mb-2" style={getElementCSS(block.elementStyles, 'title')}>{block.title}</h2>}
      {block.description && <p className="text-lg text-muted-foreground mb-6" style={getElementCSS(block.elementStyles, 'description')}>{block.description}</p>}

      {block.showResponseCount !== false && (
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <span className="material-icons text-base">groups</span>
          <span><strong className="text-foreground">{data.totalResponses}</strong> responses</span>
        </div>
      )}

      {block.layout === 'tabbed' && filteredQuestions.length > 1 ? (
        <div>
          <div className="flex gap-1 border-b border-border mb-6 overflow-x-auto">
            {filteredQuestions.map((q, i) => (
              <button key={q.fieldId} onClick={() => setActiveTab(i)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${i === activeTab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                {q.label}
              </button>
            ))}
          </div>
          {renderQuestion(filteredQuestions[activeTab], chartType, block.accentColor, block.showTextResponses, block.textResponseLimit)}
        </div>
      ) : (
        <div className="space-y-6">
          {filteredQuestions.map(q => renderQuestion(q, chartType, block.accentColor, block.showTextResponses, block.textResponseLimit))}
        </div>
      )}
    </div>
  );
}
