'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import SurveyBuilder, { SurveyField } from '@/components/admin/SurveyBuilder';
import { SURVEY_TEMPLATES } from '@/lib/survey-templates';
import Link from 'next/link';

export default function NewSurveyPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<SurveyField[]>([]);
  const [requireEmail, setRequireEmail] = useState(false);
  const [color, setColor] = useState('#2563eb');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'choose' | 'build'>('choose');

  function applyTemplate(templateId: string) {
    const tpl = SURVEY_TEMPLATES.find(t => t.id === templateId);
    if (!tpl) return;
    // Re-generate unique IDs for each field
    const newFields = tpl.fields.map((f, i) => ({
      ...f,
      id: Math.random().toString(36).slice(2, 10),
      order: i,
    }));
    setTitle(tpl.name);
    setDescription(tpl.description);
    setFields(newFields as SurveyField[]);
    setRequireEmail(tpl.requireEmail);
    setStep('build');
  }

  function startBlank() {
    setStep('build');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required'); return; }
    if (fields.length === 0) { setError('Add at least one question'); return; }

    setSaving(true);
    setError('');

    const res = await fetch('/api/portal/surveys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, description, fields, requireEmail, color }),
    });
    const data = await res.json();
    if (!data.success) { setError(data.message || 'Failed to create survey'); setSaving(false); return; }

    router.push(`/portal/surveys/${data.data.id}`);
  }

  // Group templates by category
  const categories = Array.from(new Set(SURVEY_TEMPLATES.map(t => t.category)));

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/portal/surveys" className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <span className="material-icons text-xl text-muted-foreground">arrow_back</span>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground">New Survey</h1>
          <p className="text-muted-foreground text-sm">
            {step === 'choose' ? 'Start from a template or build from scratch' : 'Design your survey and add questions'}
          </p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* ─── Step 1: Template Picker ─── */}
      {step === 'choose' && (
        <div className="space-y-6">
          {/* Blank option */}
          <button
            onClick={startBlank}
            className="w-full bg-card border-2 border-dashed border-border rounded-xl p-6 text-left hover:border-primary/50 hover:bg-muted/30 transition-all group"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                <span className="material-icons text-2xl text-muted-foreground group-hover:text-primary">add</span>
              </div>
              <div>
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">Start from Scratch</p>
                <p className="text-sm text-muted-foreground">Build a custom survey with your own questions</p>
              </div>
            </div>
          </button>

          {/* Templates by category */}
          {categories.map(cat => (
            <div key={cat}>
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{cat}</h3>
              <div className="grid sm:grid-cols-2 gap-3">
                {SURVEY_TEMPLATES.filter(t => t.category === cat).map(tpl => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl.id)}
                    className="bg-card border border-border rounded-xl p-5 text-left hover:border-primary/50 hover:shadow-sm transition-all group"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="material-icons text-xl text-primary">{tpl.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground group-hover:text-primary transition-colors text-sm">{tpl.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.description}</p>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          {tpl.fields.filter(f => f.type !== 'heading' && f.type !== 'page_break').length} questions
                          {tpl.fields.some(f => f.type === 'page_break') && (
                            <> &middot; {tpl.fields.filter(f => f.type === 'page_break').length + 1} pages</>
                          )}
                        </p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Step 2: Build Survey ─── */}
      {step === 'build' && (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Template indicator */}
          <button
            type="button"
            onClick={() => { setStep('choose'); setFields([]); setTitle(''); setDescription(''); }}
            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
          >
            <span className="material-icons text-sm">arrow_back</span>
            Change template
          </button>

          {/* Basic Info */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">info</span>
              Survey Details
            </h2>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Customer Satisfaction Survey"
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description shown at the top of the survey"
                rows={2}
                className="w-full px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              />
            </div>
            <div className="flex items-center gap-6">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1">Brand Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded border border-border cursor-pointer" />
                  <span className="text-xs text-muted-foreground">{color}</span>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={requireEmail} onChange={(e) => setRequireEmail(e.target.checked)} className="rounded border-border" />
                <span className="text-sm text-foreground">Require respondent email</span>
              </label>
            </div>
          </div>

          {/* Questions */}
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
              <span className="material-icons text-primary">quiz</span>
              Questions
            </h2>
            <SurveyBuilder fields={fields} onChange={setFields} />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-3">
            <Link href="/portal/surveys" className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors">Cancel</Link>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <><span className="material-icons text-lg animate-spin">progress_activity</span>Creating...</>
              ) : (
                <><span className="material-icons text-lg">add_circle</span>Create Survey</>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
