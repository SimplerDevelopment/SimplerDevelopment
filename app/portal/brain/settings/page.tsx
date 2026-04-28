'use client';

import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import type { BrainEnabledModules } from '@/lib/db/schema';
import type { BrainProfile } from '@/lib/brain/profiles';
import type { IndustryTemplate } from '@/lib/brain/industry-templates';

interface SettingsResponse {
  success: boolean;
  data?: {
    profile: BrainProfile;
    template: IndustryTemplate;
    availableTemplates: IndustryTemplate[];
  };
  message?: string;
}

const CONFIDENTIALITY_OPTIONS = [
  { id: 'standard', label: 'Standard', help: 'Visible to all team members.' },
  { id: 'restricted', label: 'Restricted', help: 'Visible to admins and explicitly granted members.' },
  { id: 'confidential', label: 'Confidential', help: 'Visible to owner and admins only. Recommended for compliance-sensitive industries.' },
] as const;

const MODULE_OPTIONS: { id: keyof BrainEnabledModules; label: string; help: string }[] = [
  { id: 'meetings', label: 'Meetings', help: 'Ingest transcripts, AI summarises, human approves.' },
  { id: 'tasks', label: 'Tasks', help: 'Brain-flavoured tasks with promotion to project boards.' },
  { id: 'prospects', label: 'Prospects', help: 'Stale-prospect detection over CRM deals.' },
  { id: 'knowledge', label: 'Knowledge', help: 'Notes and documents linked to relationships.' },
  { id: 'ask', label: 'Ask Brain', help: 'Conversational query layer with citations.' },
];

export default function BrainSettingsPage() {
  const [profile, setProfile] = useState<BrainProfile | null>(null);
  const [template, setTemplate] = useState<IndustryTemplate | null>(null);
  const [availableTemplates, setAvailableTemplates] = useState<IndustryTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings');
      const json: SettingsResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'Failed to load settings.');
      } else {
        setProfile(json.data.profile);
        setTemplate(json.data.template);
        setAvailableTemplates(json.data.availableTemplates);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (patch: Record<string, unknown>) => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch('/api/portal/brain/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const json: SettingsResponse = await r.json();
      if (!r.ok || !json.success || !json.data) {
        setError(json.message || 'Failed to save.');
        return;
      }
      setProfile(json.data.profile);
      setTemplate(json.data.template);
      setSavedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-16 text-muted-foreground">
        <span className="material-icons animate-spin mr-2">progress_activity</span>
        Loading...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 text-sm text-destructive">
          {error || 'Settings unavailable.'}
        </div>
      </div>
    );
  }

  const modules = profile.enabledModules;

  return (
    <div className="max-w-3xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Company Brain Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure how Company Brain behaves for your team.
          </p>
        </div>
        <Link
          href="/portal/brain"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md border border-border text-foreground hover:bg-accent"
        >
          <span className="material-icons text-base">arrow_back</span>
          Back
        </Link>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-md p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-md p-3 text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
          <span className="material-icons text-base">check_circle</span>
          Saved.
        </div>
      )}

      {/* Enable / disable */}
      <Section title="Status" icon="power_settings_new">
        <Row
          label="Company Brain enabled"
          help="Disable to hide Brain from the sidebar and pause processing."
        >
          <Toggle
            checked={profile.enabled}
            onChange={(v) => save({ enabled: v })}
            disabled={saving}
          />
        </Row>
      </Section>

      {/* Identity */}
      <Section title="Identity" icon="badge">
        <Row label="Display name" help="Shown at the top of the Brain dashboard.">
          <NameField
            value={profile.name}
            onSave={(v) => save({ name: v })}
            disabled={saving}
          />
        </Row>
      </Section>

      {/* Inbound email gateway. The token in the alias both identifies this
          tenant and authorizes the ingest — anyone with the address can drop
          mail into the brain. Treat it like a shared secret. */}
      {profile.emailIngestToken && (
        <Section title="Inbound email" icon="mark_email_read">
          <p className="text-xs text-muted-foreground mb-3">
            Forward or BCC any email to the address below to add it as a meeting in your Brain.
            Attachments are stored automatically.
          </p>
          <Row label="Brain email address">
            <EmailIngestField token={profile.emailIngestToken} />
          </Row>
          <Row
            label="Auto-process on arrival"
            help="Run the full AI pipeline (attachment analysis, link previews, transcript summary) automatically when an email lands. Off by default — meetings stay in Draft until you click Process."
          >
            <Toggle
              checked={profile.autoProcessEmail}
              onChange={(v) => save({ autoProcessEmail: v })}
              disabled={saving}
            />
          </Row>
        </Section>
      )}

      {/* Industry template */}
      <Section title="Industry template" icon="apartment">
        <p className="text-xs text-muted-foreground mb-3">
          Sets default relationship types, service lines, and compliance defaults. Switching template won&apos;t overwrite custom service lines.
        </p>
        <div className="grid gap-2">
          {availableTemplates.map((t) => (
            <button
              key={t.id}
              onClick={() => save({ industryTemplate: t.id })}
              disabled={saving || profile.industryTemplate === t.id}
              className={`text-left rounded-md border p-3 transition-colors ${
                profile.industryTemplate === t.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{t.label}</span>
                {profile.industryTemplate === t.id && (
                  <span className="material-icons text-base text-primary">check_circle</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>
            </button>
          ))}
        </div>
        {template && (
          <div className="mt-3 text-xs text-muted-foreground">
            <strong>Relationship types:</strong> {template.relationshipTypes.map(r => r.label).join(', ') || '—'}
          </div>
        )}
      </Section>

      {/* Confidentiality */}
      <Section title="Default confidentiality" icon="lock">
        <p className="text-xs text-muted-foreground mb-3">
          New meetings, notes, and documents inherit this confidentiality level by default.
        </p>
        <div className="grid gap-2">
          {CONFIDENTIALITY_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => save({ defaultConfidentiality: opt.id })}
              disabled={saving || profile.defaultConfidentiality === opt.id}
              className={`text-left rounded-md border p-3 transition-colors ${
                profile.defaultConfidentiality === opt.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{opt.label}</span>
                {profile.defaultConfidentiality === opt.id && (
                  <span className="material-icons text-base text-primary">check_circle</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{opt.help}</p>
            </button>
          ))}
        </div>
      </Section>

      {/* Modules */}
      <Section title="Enabled modules" icon="extension">
        <p className="text-xs text-muted-foreground mb-3">
          Toggle which Brain modules are available. Disabled modules don&apos;t appear in navigation.
        </p>
        <div className="space-y-2">
          {MODULE_OPTIONS.map((m) => (
            <Row key={m.id} label={m.label} help={m.help}>
              <Toggle
                checked={modules[m.id]}
                onChange={(v) => save({ enabledModules: { [m.id]: v } })}
                disabled={saving}
              />
            </Row>
          ))}
        </div>
      </Section>

      {/* Service lines */}
      <Section title="Service lines" icon="category">
        <p className="text-xs text-muted-foreground mb-3">
          Used to categorize relationships and prospects. One per line.
        </p>
        <ServiceLinesField
          value={profile.serviceLines}
          onSave={(v) => save({ serviceLines: v })}
          disabled={saving}
        />
      </Section>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-lg p-5">
      <h2 className="text-sm font-semibold text-foreground flex items-center gap-2 mb-4">
        <span className="material-icons text-base text-muted-foreground">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">{label}</div>
        {help && <p className="text-xs text-muted-foreground mt-0.5">{help}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      disabled={disabled}
      role="switch"
      aria-checked={checked}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-border'
      } disabled:opacity-50`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

function NameField({ value, onSave, disabled }: { value: string; onSave: (v: string) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const dirty = draft.trim() !== value && draft.trim().length > 0;
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled}
        className="px-3 py-1.5 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
      />
      <button
        onClick={() => dirty && onSave(draft.trim())}
        disabled={disabled || !dirty}
        className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        Save
      </button>
    </div>
  );
}

function EmailIngestField({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const address = `brain+${token}@simplerdevelopment.com`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <div className="flex items-center gap-2 w-full">
      <code className="flex-1 px-2 py-1.5 text-xs font-mono bg-muted rounded border border-border text-foreground truncate">
        {address}
      </code>
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-md border border-border text-foreground hover:bg-accent shrink-0"
      >
        <span className="material-icons text-sm">{copied ? 'check' : 'content_copy'}</span>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

function ServiceLinesField({ value, onSave, disabled }: { value: string[]; onSave: (v: string[]) => void; disabled?: boolean }) {
  const [draft, setDraft] = useState(value.join('\n'));
  useEffect(() => setDraft(value.join('\n')), [value]);
  const parsed = draft.split('\n').map(s => s.trim()).filter(Boolean);
  const dirty = JSON.stringify(parsed) !== JSON.stringify(value);
  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        disabled={disabled}
        rows={Math.max(4, parsed.length + 1)}
        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        placeholder="e.g. Investments &amp; Planning"
      />
      <button
        onClick={() => dirty && onSave(parsed)}
        disabled={disabled || !dirty}
        className="px-3 py-1.5 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        Save service lines
      </button>
    </div>
  );
}
