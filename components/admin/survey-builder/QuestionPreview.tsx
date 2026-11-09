'use client';

/**
 * PUX-179 (design doc screen 38): the centre pane — one question drawn the way
 * a respondent meets it, not as builder chrome. Read-only, no answers held.
 * ponytail: styled with the studio tokens (ink / gold), not the survey's
 * branding profile — the builder receives only `fields`; the public form's
 * cascade lives in components/blocks/render/SurveyFormInline.tsx and is the
 * upgrade path once a branding profile is threaded into the builder.
 */

import type { SurveyField } from '@/components/admin/SurveyBuilder.types';

const inputCls = 'w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground';

function Control({ f }: { f: SurveyField }) {
  switch (f.type) {
    case 'textarea': return <textarea readOnly rows={3} placeholder={f.placeholder || 'Your answer'} className={inputCls} />;
    case 'select': return <select disabled className={inputCls}><option>{f.placeholder || 'Choose…'}</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>;
    case 'radio':
    case 'checkbox': return (
      <ul className="space-y-1.5">
        {(f.options.length ? f.options : ['Option 1', 'Option 2']).map((o) => (
          <li key={o} className="flex items-center gap-2 text-sm text-foreground"><input type={f.type} readOnly disabled className="accent-primary" />{o}</li>
        ))}
      </ul>
    );
    case 'toggle': return <span className="inline-flex items-center gap-2 text-sm"><span className="h-5 w-9 rounded-full border border-border bg-muted" aria-hidden /> Yes / No</span>;
    case 'rating': return <span className="flex gap-1 text-[var(--studio-gold)]">{[1, 2, 3, 4, 5].map((n) => <span key={n} className="material-icons">star_border</span>)}</span>;
    case 'slider': {
      const min = f.min ?? 0, max = f.max ?? 10;
      return (
        <div>
          <input type="range" min={min} max={max} step={f.step ?? 1} defaultValue={min} disabled className="w-full accent-primary" />
          <div className="flex justify-between text-[11px] text-muted-foreground"><span>{min}</span><span>{max}</span></div>
        </div>
      );
    }
    case 'date': return <input type="date" readOnly className={inputCls} />;
    case 'file': return <div className="rounded-xl border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Drop a file or click to upload</div>;
    case 'heading': return null;
    case 'page_break': return <hr className="border-border" />;
    case 'image':
    case 'video':
    case 'media-carousel': return <div className="flex h-28 items-center justify-center rounded-xl bg-muted text-muted-foreground"><span className="material-icons">{f.type === 'video' ? 'movie' : 'image'}</span></div>;
    default: return <input type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'} readOnly placeholder={f.placeholder || 'Your answer'} className={inputCls} />;
  }
}

export default function QuestionPreview({ field, surveyTitle }: { field: SurveyField | null; surveyTitle?: string }) {
  if (!field) return <p className="p-6 text-center text-sm text-muted-foreground">Pick a question to see it as a respondent will.</p>;
  const isNps = field.scoring?.type === 'nps';
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm">
      {surveyTitle && <p className="mb-4 font-mono text-[10.5px] uppercase tracking-[.08em] text-muted-foreground">{surveyTitle}</p>}
      <p className={`font-display font-semibold tracking-[-0.01em] text-foreground ${field.type === 'heading' ? 'text-lg' : 'text-[15px]'}`}>
        {field.label || 'Untitled question'}{field.required && <span className="ml-1 text-[var(--portal-warn)]" aria-label="required">*</span>}
      </p>
      {field.helpText && <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{field.helpText}</p>}
      <div className={`mt-3 ${isNps ? 'rounded-xl border border-[var(--studio-gold-line)] bg-[var(--studio-gold-surface)] p-3' : ''}`}>
        <Control f={field} />
        {isNps && <p className="mt-2 text-[11px] text-[var(--studio-gold-ink)]">Not likely — Very likely · scored as NPS</p>}
      </div>
    </div>
  );
}
