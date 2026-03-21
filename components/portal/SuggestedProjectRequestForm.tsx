'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SurveyField } from '@/lib/db/schema';

interface Props {
  projectId: number;
  projectTitle: string;
  projectDescription: string | null;
  surveyFields: SurveyField[];
  heroGradient: string;
}

type AnswerMap = Record<string, string | string[] | boolean | number>;

export default function SuggestedProjectRequestForm({
  projectId,
  projectTitle,
  projectDescription,
  surveyFields,
  heroGradient,
}: Props) {
  const router = useRouter();
  const hasSurvey = surveyFields.length > 0;
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function setAnswer(id: string, value: string | string[] | boolean | number) {
    setAnswers(prev => ({ ...prev, [id]: value }));
  }

  function toggleCheckbox(id: string, option: string) {
    const current = (answers[id] as string[]) ?? [];
    setAnswer(id, current.includes(option) ? current.filter(v => v !== option) : [...current, option]);
  }

  function isFieldVisible(field: SurveyField): boolean {
    if (!field.showIf) return true;
    const { fieldId, values } = field.showIf;
    const refValue = answers[fieldId];
    if (Array.isArray(refValue)) return refValue.some(v => values.includes(v));
    return values.includes(refValue as string);
  }

  function getFieldOptions(field: SurveyField): string[] {
    if (field.conditionalOptions) {
      const { fieldId, map, default: defaultOpts } = field.conditionalOptions;
      const refValue = answers[fieldId] as string;
      if (!refValue) return [];
      if (map[refValue]) return map[refValue];
      return defaultOpts ?? field.options ?? [];
    }
    return field.options ?? [];
  }

  function isConditionalPending(field: SurveyField): boolean {
    return !!field.conditionalOptions && !answers[field.conditionalOptions.fieldId];
  }

  const requiredFields = surveyFields.filter(f => f.required && f.type !== 'heading' && isFieldVisible(f));
  const answeredRequired = requiredFields.filter(f => {
    const v = answers[f.id];
    return v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0);
  });
  const progress = requiredFields.length > 0 ? Math.round((answeredRequired.length / requiredFields.length) * 100) : 100;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    for (const field of surveyFields) {
      if (!field.required || field.type === 'heading' || !isFieldVisible(field)) continue;
      const val = answers[field.id];
      if (val === undefined || val === '' || (Array.isArray(val) && val.length === 0)) {
        setError(`"${field.label}" is required.`);
        setLoading(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    const namedAnswers: Record<string, unknown> = {};
    if (hasSurvey) {
      for (const field of surveyFields) {
        if (field.type === 'heading' || !isFieldVisible(field)) continue;
        namedAnswers[field.label] = answers[field.id] ?? '';
      }
    }

    try {
      const res = await fetch('/api/portal/suggested-project-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestedProjectId: projectId,
          answers: hasSurvey ? namedAnswers : undefined,
          message: !hasSurvey ? message : undefined,
        }),
      });

      const data = await res.json();
      setLoading(false);
      if (!data.success) {
        setError(data.message ?? 'Failed to submit request.');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        router.push('/portal/suggested-projects?requested=1');
      }
    } catch {
      setLoading(false);
      setError('Something went wrong. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  const inputCls = 'w-full px-4 py-3 rounded-xl border border-border bg-muted/40 text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:bg-background focus:border-transparent transition-colors';

  function renderField(field: SurveyField, index: number) {
    if (!isFieldVisible(field)) return null;
    const val = answers[field.id];
    const opts = getFieldOptions(field);
    const fieldNumber = surveyFields.filter(f => f.type !== 'heading' && isFieldVisible(f)).indexOf(field) + 1;

    if (field.type === 'heading') {
      return (
        <div key={field.id} className="flex items-center gap-3 pt-4 pb-1">
          <div className="w-1 h-5 bg-primary rounded-full flex-shrink-0" />
          <span className="text-xs font-bold text-foreground uppercase tracking-widest">{field.label}</span>
          <div className="flex-1 h-px bg-border" />
        </div>
      );
    }

    return (
      <div key={field.id} className="group">
        <div className="flex items-start gap-3 mb-2">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-muted text-muted-foreground text-xs font-bold flex items-center justify-center mt-0.5 group-focus-within:bg-primary group-focus-within:text-primary-foreground transition-colors">
            {fieldNumber}
          </span>
          <div className="flex-1 min-w-0">
            <label className="block text-sm font-semibold text-foreground leading-tight">
              {field.label}
              {field.required && <span className="text-primary ml-1">*</span>}
            </label>
            {field.helpText && (
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{field.helpText}</p>
            )}
          </div>
        </div>

        <div className="ml-9">
          {isConditionalPending(field) && (
            <p className="text-sm text-muted-foreground italic">
              Answer the previous question to see options.
            </p>
          )}
          {field.type === 'text' && (
            <input type="text" value={(val as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)}
              placeholder={field.placeholder} className={inputCls} />
          )}
          {field.type === 'textarea' && (
            <textarea rows={4} value={(val as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)}
              placeholder={field.placeholder} className={`${inputCls} resize-y`} />
          )}
          {field.type === 'number' && (
            <input type="number" value={(val as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)}
              placeholder={field.placeholder} className={inputCls} />
          )}
          {field.type === 'email' && (
            <input type="email" value={(val as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)}
              placeholder={field.placeholder || 'you@example.com'} className={inputCls} />
          )}
          {field.type === 'phone' && (
            <input type="tel" value={(val as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)}
              placeholder={field.placeholder || '+1 (555) 000-0000'} className={inputCls} />
          )}
          {field.type === 'url' && (
            <input type="url" value={(val as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)}
              placeholder={field.placeholder || 'https://example.com'} className={inputCls} />
          )}
          {field.type === 'date' && (
            <input type="date" value={(val as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)}
              className={inputCls} />
          )}
          {field.type === 'select' && (
            <select value={(val as string) ?? ''} onChange={e => setAnswer(field.id, e.target.value)} className={inputCls}>
              <option value="">Select an option...</option>
              {opts.filter(Boolean).map((opt, i) => (
                <option key={i} value={opt}>{opt}</option>
              ))}
            </select>
          )}

          {/* Radio — card tiles */}
          {field.type === 'radio' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {opts.filter(Boolean).map((opt, i) => {
                const selected = (val as string) === opt;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setAnswer(field.id, opt)}
                    className={`text-left px-4 py-3 rounded-xl border-2 text-sm transition-all ${
                      selected
                        ? 'border-primary bg-primary/8 text-foreground font-medium shadow-sm'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40 text-foreground'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span>{opt}</span>
                      <span className={`material-icons text-base flex-shrink-0 transition-opacity ${selected ? 'text-primary opacity-100' : 'opacity-0'}`}>
                        check_circle
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Checkbox — pill multi-select */}
          {field.type === 'checkbox' && (
            <div className="flex flex-wrap gap-2">
              {opts.filter(Boolean).map((opt, i) => {
                const checked = ((val as string[]) ?? []).includes(opt);
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleCheckbox(field.id, opt)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                      checked
                        ? 'border-primary bg-primary/8 text-foreground shadow-sm'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40 text-foreground'
                    }`}
                  >
                    <span className={`material-icons text-base flex-shrink-0 transition-colors ${checked ? 'text-primary' : 'text-muted-foreground/40'}`}>
                      {checked ? 'check_box' : 'check_box_outline_blank'}
                    </span>
                    {opt}
                  </button>
                );
              })}
            </div>
          )}

          {/* Toggle */}
          {field.type === 'toggle' && (
            <div
              onClick={() => setAnswer(field.id, !val)}
              className={`inline-flex items-center gap-3 px-4 py-3 rounded-xl border-2 cursor-pointer select-none transition-all ${
                val ? 'border-primary bg-primary/8' : 'border-border bg-card hover:border-primary/30'
              }`}
            >
              <div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0 ${val ? 'bg-primary' : 'bg-muted-foreground/30'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${val ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
              <span className={`text-sm font-medium ${val ? 'text-primary' : 'text-muted-foreground'}`}>{val ? 'Yes' : 'No'}</span>
            </div>
          )}

          {/* Range Slider */}
          {field.type === 'slider' && (() => {
            const min = field.min ?? 0;
            const max = field.max ?? 10000;
            const step = field.step ?? 500;
            const current = (val as number) ?? min;
            const pct = ((current - min) / (max - min)) * 100;
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">${min.toLocaleString()}</span>
                  <span className="text-lg font-bold text-primary">${current.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground">${max.toLocaleString()}</span>
                </div>
                <div className="relative py-2">
                  <div className="h-2 bg-muted rounded-full">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border-2 border-primary shadow-md transition-all pointer-events-none"
                    style={{ left: `calc(${pct}% - 10px)` }}
                  />
                  <input
                    type="range"
                    min={min} max={max} step={step}
                    value={current}
                    onChange={e => setAnswer(field.id, Number(e.target.value))}
                    className="absolute inset-0 w-full opacity-0 cursor-pointer"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Drag to set your budget</span>
                  <span>Step: ${step.toLocaleString()}</span>
                </div>
              </div>
            );
          })()}

          {/* Rating */}
          {field.type === 'rating' && (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setAnswer(field.id, star)}
                  className={`transition-all hover:scale-110 ${(val as number) >= star ? 'text-amber-400' : 'text-muted-foreground/25'}`}
                >
                  <span className="material-icons text-3xl">star</span>
                </button>
              ))}
              {val && <span className="text-sm text-muted-foreground ml-2 font-medium">{val} / 5</span>}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12">
      {/* Progress bar — fixed to viewport top */}
      {hasSurvey && requiredFields.length > 0 && (
        <div className="fixed top-0 inset-x-0 z-30 lg:pl-64 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="max-w-2xl mx-auto px-6 py-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>{answeredRequired.length} of {requiredFields.length} required fields answered</span>
              <span className={progress === 100 ? 'text-green-600 font-medium' : ''}>{progress}%</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      <div className={`max-w-2xl mx-auto space-y-6${hasSurvey && requiredFields.length > 0 ? ' pt-16' : ''}`}>
      {/* Hero header */}
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
          <Link href="/portal/suggested-projects" className="hover:text-foreground transition-colors">Suggested Projects</Link>
          <span className="material-icons text-sm">chevron_right</span>
          <span className="text-foreground">Get Started</span>
        </div>
        <div className={`bg-gradient-to-br ${heroGradient} rounded-2xl p-6 text-white`}>
          <div className="flex items-center gap-3 mb-1">
            <span className="material-icons text-2xl opacity-90">rocket_launch</span>
            <h1 className="text-2xl font-bold">{projectTitle}</h1>
          </div>
          {projectDescription && (
            <p className="text-white/75 text-sm leading-relaxed mt-1">{projectDescription}</p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-destructive/8 border border-destructive/20 rounded-xl flex items-center gap-3 text-sm text-destructive">
          <span className="material-icons text-base flex-shrink-0">error_outline</span>
          {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} noValidate>
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 space-y-6">
            {hasSurvey ? (
              surveyFields.map((f, i) => renderField(f, i))
            ) : (
              <div>
                <p className="text-sm text-muted-foreground mb-4">
                  Tell us about your project goals and we&apos;ll schedule a free discovery call.
                </p>
                <label className="block text-sm font-semibold text-foreground mb-2">
                  Message <span className="text-primary">*</span>
                </label>
                <textarea
                  rows={6}
                  required
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder="Describe your goals, timeline, and any specific requirements..."
                  className={`${inputCls} resize-y`}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border px-6 py-4 bg-muted/30 flex items-center justify-between gap-4">
            <Link href={`/portal/suggested-projects/${projectId}`}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
              <span className="material-icons text-base">arrow_back</span>
              Back
            </Link>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center gap-2 px-6 py-2.5 bg-gradient-to-r ${heroGradient} text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity shadow-md`}
            >
              {loading ? (
                <><span className="material-icons text-base animate-spin">refresh</span>Submitting...</>
              ) : (
                <><span className="material-icons text-base">send</span>Submit Request</>
              )}
            </button>
          </div>
        </div>
      </form>
      </div>
    </div>
  );
}
