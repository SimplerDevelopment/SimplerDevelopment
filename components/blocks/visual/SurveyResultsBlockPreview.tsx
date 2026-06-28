'use client';

import { SurveyResultsBlock } from '@/types/blocks';

interface Props {
  block: SurveyResultsBlock;
  isSelected: boolean;
  onChange: (updates: Partial<SurveyResultsBlock>) => void;
}

const MOCK_BAR_DATA = [
  { label: 'Very Satisfied', pct: 45, color: '#10b981' },
  { label: 'Satisfied', pct: 30, color: '#0ea5e9' },
  { label: 'Neutral', pct: 15, color: '#f59e0b' },
  { label: 'Dissatisfied', pct: 7, color: '#f97316' },
  { label: 'Very Dissatisfied', pct: 3, color: '#f43f5e' },
];

const MOCK_PIE_SEGMENTS = [
  { label: 'Email', pct: 38, color: '#6366f1' },
  { label: 'Social Media', pct: 28, color: '#06b6d4' },
  { label: 'Word of Mouth', pct: 22, color: '#f59e0b' },
  { label: 'Other', pct: 12, color: '#94a3b8' },
];

function MockBarChart({ accentColor }: { accentColor?: string }) {
  return (
    <div className="space-y-3">
      {MOCK_BAR_DATA.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-28 text-right shrink-0 truncate">{d.label}</span>
          <div className="flex-1 h-6 bg-muted/30 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${d.pct}%`, backgroundColor: accentColor || d.color }}
            />
          </div>
          <span className="text-xs font-medium w-8 text-right">{d.pct}%</span>
        </div>
      ))}
    </div>
  );
}

function MockDonutChart({ accentColor }: { accentColor?: string }) {
  const total = MOCK_PIE_SEGMENTS.reduce((a, s) => a + s.pct, 0);
  const dashes = MOCK_PIE_SEGMENTS.map((s) => (s.pct / total) * 100);
  const offsets = dashes.reduce<number[]>(
    (acc, _, i) => [...acc, i === 0 ? 0 : acc[i - 1] + dashes[i - 1]],
    []
  );
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 36 36" className="w-28 h-28 shrink-0">
        {MOCK_PIE_SEGMENTS.map((s, i) => (
          <circle key={s.label} r="15.915" cx="18" cy="18" fill="none"
            stroke={accentColor || s.color} strokeWidth="5"
            strokeDasharray={`${dashes[i]} ${100 - dashes[i]}`}
            strokeDashoffset={`${-offsets[i]}`}
            className="transition-all" />
        ))}
      </svg>
      <div className="space-y-1.5">
        {MOCK_PIE_SEGMENTS.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: accentColor || s.color }} />
            <span className="text-xs">{s.label}</span>
            <span className="text-xs font-medium text-muted-foreground">{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockNumberStat() {
  return (
    <div className="flex items-center gap-8 justify-center">
      <div className="text-center">
        <div className="text-4xl font-bold text-primary">4.2</div>
        <div className="flex gap-0.5 justify-center mt-1">
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={`material-icons text-lg ${s <= 4 ? 'text-amber-400' : 'text-muted-foreground/20'}`}>star</span>
          ))}
        </div>
        <div className="text-xs text-muted-foreground mt-1">Avg. Rating</div>
      </div>
      <div className="text-center">
        <div className="text-4xl font-bold text-emerald-600">87</div>
        <div className="text-xs text-muted-foreground mt-1">Responses</div>
      </div>
      <div className="text-center">
        <div className="text-4xl font-bold text-sky-600">72%</div>
        <div className="text-xs text-muted-foreground mt-1">Would Recommend</div>
      </div>
    </div>
  );
}

function MockTextResponses() {
  const samples = [
    'The onboarding process was smooth and intuitive.',
    'I wish there were more customization options.',
    'Great customer support team - very responsive!',
  ];
  return (
    <div className="space-y-2">
      {samples.map((s, i) => (
        <div key={i} className="flex gap-2 items-start">
          <span className="material-icons text-sm text-muted-foreground/40 mt-0.5">format_quote</span>
          <p className="text-sm text-muted-foreground italic">{s}</p>
        </div>
      ))}
    </div>
  );
}

export function SurveyResultsBlockPreview({ block, isSelected, onChange }: Props) {
  return (
    <div className="py-8 px-6">
      {(block.title || isSelected) && (
        <input type="text" value={block.title || ''} onChange={(e) => onChange({ title: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="font-heading text-3xl font-bold mb-2 w-full bg-transparent border-none focus:outline-none focus:border-b-2 border-primary text-foreground"
          placeholder="Survey Results" />
      )}
      {(block.description || isSelected) && (
        <input type="text" value={block.description || ''} onChange={(e) => onChange({ description: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="text-lg mb-6 w-full bg-transparent border-none focus:outline-none focus:border-b border-primary/50 text-muted-foreground"
          placeholder="See what our customers are saying" />
      )}

      {block.showResponseCount !== false && (
        <div className="flex items-center gap-2 mb-6 text-sm text-muted-foreground">
          <span className="material-icons text-base">groups</span>
          <span><strong className="text-foreground">87</strong> responses</span>
        </div>
      )}

      <div className="space-y-8">
        {/* Bar chart question */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span className="material-icons text-primary text-base">bar_chart</span>
            How satisfied are you with our service?
          </h4>
          <MockBarChart accentColor={block.accentColor} />
        </div>

        {/* Donut chart question */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span className="material-icons text-primary text-base">donut_large</span>
            How did you hear about us?
          </h4>
          <MockDonutChart accentColor={block.accentColor} />
        </div>

        {/* Number stats */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
            <span className="material-icons text-primary text-base">star</span>
            Overall Rating
          </h4>
          <MockNumberStat />
        </div>

        {/* Text responses */}
        {block.showTextResponses !== false && (
          <div className="rounded-lg border border-border bg-card p-5">
            <h4 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <span className="material-icons text-primary text-base">chat_bubble_outline</span>
              What could we improve?
            </h4>
            <MockTextResponses />
          </div>
        )}
      </div>

      {isSelected && !block.surveySlug && (
        <p className="text-center text-xs text-amber-500 mt-4">
          <span className="material-icons text-xs align-middle mr-1">warning</span>
          Select a survey in the settings panel to display real results.
        </p>
      )}

      <p className="text-center text-xs text-muted-foreground mt-4 italic">
        Preview: Live results load from survey &ldquo;{block.surveySlug || 'your-survey'}&rdquo;
      </p>
    </div>
  );
}
