'use client';

/**
 * Brain Note Templates — manage page.
 *
 *   ┌──────────────────────┬───────────────────────────────────┐
 *   │ + New template       │  Edit form: name / trigger /       │
 *   │ ─────────────────    │  enabled / defaultTags / body      │
 *   │ • Daily standup [m]  │  ─── variable hints ───            │
 *   │ • Meeting notes [g]  │  Save | Try it | Delete            │
 *   │ • …                  │                                    │
 *   └──────────────────────┴───────────────────────────────────┘
 *
 * Selection state is local. The list pane on the left lets you pick a
 * template; the right pane is the create-or-edit form. 409-on-duplicate-name
 * surfaces inline. Everything talks to /api/portal/brain/templates.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Trigger = 'manual' | 'daily' | 'meeting' | 'slash';

interface BrainNoteTemplate {
  id: number;
  name: string;
  body: string;
  trigger: Trigger;
  variables: string[] | null;
  defaultTags: string[] | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  trigger: Trigger;
  enabled: boolean;
  defaultTagsInput: string;
  body: string;
}

const TRIGGERS: Array<{ value: Trigger; label: string; icon: string; hint: string }> = [
  { value: 'manual', label: 'Manual', icon: 'touch_app', hint: 'Pick from the templates menu when creating a note.' },
  { value: 'daily', label: 'Daily', icon: 'today', hint: 'Auto-materialized once per day by the daily-note cron.' },
  { value: 'meeting', label: 'Meeting', icon: 'groups', hint: 'Auto-attached when a new meeting is created.' },
  { value: 'slash', label: 'Slash', icon: 'keyboard', hint: 'Available as a /slash command inside the note editor.' },
];

const TRIGGER_BADGE: Record<Trigger, string> = {
  manual: 'bg-muted text-muted-foreground',
  daily: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  meeting: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  slash: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
};

// Mirrors lib/brain/template.ts. `today.long` is real but skipped here to
// keep the hint card short — power users will discover it from the README.
const VARIABLE_HINTS: Array<{ name: string; description: string }> = [
  { name: '{{today}}', description: 'ISO date — e.g. 2026-05-06' },
  { name: '{{week}}', description: 'ISO week label — e.g. 2026-W19' },
  { name: '{{userName}}', description: "Current user's display name" },
  { name: '{{open_tasks}}', description: 'Bulleted list of up to 10 open tasks' },
  { name: '{{recent_meetings}}', description: 'Meetings from the last 7 days' },
];

const EMPTY_FORM: FormState = {
  name: '',
  trigger: 'manual',
  enabled: true,
  defaultTagsInput: '',
  body: '',
};

function tagsFromInput(input: string): string[] {
  return input
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function tagsToInput(tags: string[] | null | undefined): string {
  return (tags ?? []).join(', ');
}

function templateToForm(t: BrainNoteTemplate): FormState {
  return {
    name: t.name,
    trigger: t.trigger,
    enabled: t.enabled,
    defaultTagsInput: tagsToInput(t.defaultTags),
    body: t.body,
  };
}

export default function BrainTemplatesPage() {
  const router = useRouter();
  const [items, setItems] = useState<BrainNoteTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [tryingId, setTryingId] = useState<number | null>(null);

  const loadList = useCallback(async () => {
    setLoadError(null);
    try {
      const r = await fetch('/api/portal/brain/templates');
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setLoadError(json.message || `HTTP ${r.status}`);
        setItems([]);
        return;
      }
      setItems((json.data?.items ?? []) as BrainNoteTemplate[]);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
      setItems([]);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const selectedTemplate = useMemo(() => {
    if (selectedId === null || selectedId === 'new') return null;
    return items?.find((t) => t.id === selectedId) ?? null;
  }, [items, selectedId]);

  const handleSelect = useCallback((id: number) => {
    const target = items?.find((t) => t.id === id);
    if (!target) return;
    setSelectedId(id);
    setForm(templateToForm(target));
    setFormError(null);
  }, [items]);

  const handleNew = useCallback(() => {
    setSelectedId('new');
    setForm(EMPTY_FORM);
    setFormError(null);
  }, []);

  const handleSave = useCallback(async () => {
    setFormError(null);
    const name = form.name.trim();
    if (!name) {
      setFormError('Name is required.');
      return;
    }
    if (name.length > 150) {
      setFormError('Name must be 150 characters or fewer.');
      return;
    }
    if (!form.body.trim()) {
      setFormError('Body cannot be empty.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name,
        body: form.body,
        trigger: form.trigger,
        enabled: form.enabled,
        defaultTags: tagsFromInput(form.defaultTagsInput),
      };
      const isNew = selectedId === 'new' || selectedId === null;
      const url = isNew
        ? '/api/portal/brain/templates'
        : `/api/portal/brain/templates/${selectedId}`;
      const method = isNew ? 'POST' : 'PATCH';
      const r = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        if (r.status === 409) {
          setFormError('A template with that name already exists.');
        } else {
          setFormError(json.message || `Save failed (${r.status})`);
        }
        return;
      }
      const saved = json.data as BrainNoteTemplate;
      await loadList();
      setSelectedId(saved.id);
      setForm(templateToForm(saved));
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }, [form, selectedId, loadList]);

  const handleDelete = useCallback(async () => {
    if (selectedId === null || selectedId === 'new') return;
    if (!window.confirm(`Delete template "${form.name}"? This cannot be undone.`)) return;
    setSaving(true);
    setFormError(null);
    try {
      const r = await fetch(`/api/portal/brain/templates/${selectedId}`, { method: 'DELETE' });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success) {
        setFormError(json.message || `Delete failed (${r.status})`);
        return;
      }
      setSelectedId(null);
      setForm(EMPTY_FORM);
      await loadList();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  }, [selectedId, form.name, loadList]);

  const handleTryIt = useCallback(async () => {
    if (selectedId === null || selectedId === 'new') return;
    setTryingId(selectedId);
    setFormError(null);
    try {
      const r = await fetch(`/api/portal/brain/knowledge/from-template/${selectedId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json.success || !json.data?.id) {
        setFormError(json.message || `Try-it failed (${r.status})`);
        return;
      }
      router.push(`/portal/brain/knowledge?id=${json.data.id}`);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setTryingId(null);
    }
  }, [selectedId, router]);

  const isNewMode = selectedId === 'new';
  const showForm = selectedId !== null;

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <span className="material-icons text-primary">description</span>
            Note Templates
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Reusable note bodies with <code className="px-1 py-0.5 rounded bg-muted text-foreground text-xs">{'{{variable}}'}</code> placeholders. Apply manually, on a schedule, or when a meeting is created.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portal/brain/knowledge"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border text-foreground hover:bg-accent"
          >
            <span className="material-icons text-base">arrow_back</span>
            Knowledge
          </Link>
          <button
            type="button"
            onClick={handleNew}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <span className="material-icons text-base">add</span>
            New template
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        {/* List pane */}
        <aside className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-3 py-2 border-b border-border flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Templates</span>
            <span className="text-xs text-muted-foreground">{items?.length ?? 0}</span>
          </div>

          {items === null && !loadError && (
            <div className="px-3 py-6 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="material-icons animate-spin text-base">progress_activity</span>
              Loading templates…
            </div>
          )}

          {loadError && (
            <div className="px-3 py-4 text-sm text-red-500">
              <span className="material-icons text-base align-text-bottom mr-1">error</span>
              {loadError}
            </div>
          )}

          {items !== null && !loadError && items.length === 0 && (
            <div className="px-4 py-6 text-sm text-muted-foreground">
              No templates yet — create your first to enable from-template note creation.
            </div>
          )}

          {items !== null && items.length > 0 && (
            <ul className="divide-y divide-border">
              {items.map((tpl) => {
                const isActive = selectedId === tpl.id;
                const tags = tpl.defaultTags ?? [];
                return (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(tpl.id)}
                      className={`w-full text-left px-3 py-3 hover:bg-accent transition-colors ${
                        isActive ? 'bg-accent' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-foreground truncate flex-1">
                          {tpl.name}
                        </span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${TRIGGER_BADGE[tpl.trigger]}`}>
                          {tpl.trigger}
                        </span>
                        {!tpl.enabled && (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            off
                          </span>
                        )}
                      </div>
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.slice(0, 4).map((t) => (
                            <span
                              key={t}
                              className="inline-flex items-center px-1.5 py-0.5 rounded bg-muted text-[10px] text-muted-foreground"
                            >
                              {t}
                            </span>
                          ))}
                          {tags.length > 4 && (
                            <span className="text-[10px] text-muted-foreground">+{tags.length - 4}</span>
                          )}
                        </div>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Edit pane */}
        <section className="min-w-0">
          {!showForm && (
            <div className="bg-card border border-border rounded-xl p-10 text-center">
              <span className="material-icons text-5xl text-muted-foreground">description</span>
              <h3 className="mt-3 font-semibold text-lg">Select a template to edit</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Pick one from the list, or click <span className="font-medium text-foreground">New template</span> to start fresh.
              </p>
              {items !== null && items.length === 0 && (
                <button
                  type="button"
                  onClick={handleNew}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90"
                >
                  <span className="material-icons text-base">add</span>
                  Create your first template
                </button>
              )}
            </div>
          )}

          {showForm && (
            <div className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  {isNewMode ? 'New template' : 'Edit template'}
                </h2>
                {selectedTemplate && (
                  <span className="text-xs text-muted-foreground">
                    Updated {new Date(selectedTemplate.updatedAt).toLocaleString()}
                  </span>
                )}
              </div>

              <div className="space-y-5">
                {/* Name */}
                <div>
                  <label htmlFor="tpl-name" className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Name
                  </label>
                  <input
                    id="tpl-name"
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    maxLength={150}
                    placeholder="Daily standup"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/60"
                  />
                </div>

                {/* Trigger */}
                <div>
                  <span className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                    Trigger
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {TRIGGERS.map((t) => {
                      const active = form.trigger === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setForm({ ...form, trigger: t.value })}
                          className={`flex flex-col items-start gap-1 px-3 py-2 rounded-lg border text-left transition-colors ${
                            active
                              ? 'border-primary bg-primary/10 text-foreground'
                              : 'border-border bg-background hover:bg-accent text-foreground'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 text-sm font-medium">
                            <span className="material-icons text-base">{t.icon}</span>
                            {t.label}
                          </span>
                          <span className="text-[11px] text-muted-foreground leading-tight">
                            {t.hint}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Enabled + Default tags row */}
                <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4">
                  <label className="inline-flex items-center gap-2 self-start mt-6">
                    <input
                      type="checkbox"
                      checked={form.enabled}
                      onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <span className="text-sm">Enabled</span>
                  </label>

                  <div>
                    <label htmlFor="tpl-tags" className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Default tags
                    </label>
                    <input
                      id="tpl-tags"
                      type="text"
                      value={form.defaultTagsInput}
                      onChange={(e) => setForm({ ...form, defaultTagsInput: e.target.value })}
                      placeholder="daily, standup, eng"
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/60"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Comma-separated. Pre-attached to every note created from this template.
                    </p>
                  </div>
                </div>

                {/* Body + variable hints */}
                <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
                  <div>
                    <label htmlFor="tpl-body" className="block text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">
                      Body
                    </label>
                    <textarea
                      id="tpl-body"
                      value={form.body}
                      onChange={(e) => setForm({ ...form, body: e.target.value })}
                      placeholder={'# {{today}}\n\n## Open tasks\n{{open_tasks}}\n\n## Recent meetings\n{{recent_meetings}}'}
                      rows={18}
                      className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/60 resize-y min-h-[300px]"
                    />
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Markdown body. <code className="px-1 py-0.5 rounded bg-muted text-foreground text-xs">{'{{vars}}'}</code> are resolved at apply time; unrecognized ones are left as-is.
                    </p>
                  </div>

                  <aside className="bg-muted/30 border border-border rounded-lg p-4 self-start">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <span className="material-icons text-sm text-primary">data_object</span>
                      Variables
                    </h3>
                    <ul className="space-y-2">
                      {VARIABLE_HINTS.map((v) => (
                        <li key={v.name}>
                          <code className="text-xs font-mono bg-background px-1.5 py-0.5 rounded border border-border text-foreground">
                            {v.name}
                          </code>
                          <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                            {v.description}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </aside>
                </div>

                {formError && (
                  <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">
                    <span className="material-icons text-base">error</span>
                    {formError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between gap-3 pt-2 border-t border-border">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? (
                        <>
                          <span className="material-icons text-base animate-spin">autorenew</span>
                          Saving…
                        </>
                      ) : (
                        <>
                          <span className="material-icons text-base">save</span>
                          {isNewMode ? 'Create template' : 'Save changes'}
                        </>
                      )}
                    </button>

                    {!isNewMode && selectedTemplate && (
                      <button
                        type="button"
                        onClick={handleTryIt}
                        disabled={tryingId !== null}
                        title="Create a new note from this template and open it"
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-foreground hover:bg-accent text-sm font-medium disabled:opacity-50"
                      >
                        {tryingId === selectedTemplate.id ? (
                          <>
                            <span className="material-icons text-base animate-spin">autorenew</span>
                            Applying…
                          </>
                        ) : (
                          <>
                            <span className="material-icons text-base">play_arrow</span>
                            Try it
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {!isNewMode && (
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-50"
                    >
                      <span className="material-icons text-base">delete_outline</span>
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
