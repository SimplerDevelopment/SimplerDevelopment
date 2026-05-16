'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PROVIDERS, type TrackingProvider, type TrackingConfigClient } from '@/lib/site-tracking/providers';

type FieldValues = Record<string, string>;

function buildInitial(initialConfig: TrackingConfigClient | null): FieldValues {
  const out: FieldValues = {};
  for (const provider of PROVIDERS) {
    const raw = (initialConfig as Record<string, unknown> | null)?.[provider.key];
    out[provider.key] = typeof raw === 'string' ? raw : '';
  }
  return out;
}

function initialEnabled(initialConfig: TrackingConfigClient | null): boolean {
  if (initialConfig?.enabled === false) return false;
  return true;
}

export default function TrackingSettingsCard({
  siteId,
  initialConfig,
}: {
  siteId: number;
  initialConfig: TrackingConfigClient | null;
}) {
  const router = useRouter();

  const initialValues = useMemo(() => buildInitial(initialConfig), [initialConfig]);
  const initialEnabledFlag = useMemo(() => initialEnabled(initialConfig), [initialConfig]);

  const [values, setValues] = useState<FieldValues>(initialValues);
  const [baseline, setBaseline] = useState<FieldValues>(initialValues);
  const [enabled, setEnabled] = useState<boolean>(initialEnabledFlag);
  const [baselineEnabled, setBaselineEnabled] = useState<boolean>(initialEnabledFlag);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [messageKind, setMessageKind] = useState<'success' | 'error' | null>(null);

  // Per-field local validation errors (regex check).
  const fieldErrors = useMemo<Record<string, string | null>>(() => {
    const errs: Record<string, string | null> = {};
    for (const provider of PROVIDERS) {
      const raw = values[provider.key] ?? '';
      const trimmed = raw.trim();
      if (trimmed === '') {
        errs[provider.key] = null;
        continue;
      }
      if (provider.maxLength && trimmed.length > provider.maxLength) {
        errs[provider.key] = `Too long (max ${provider.maxLength}).`;
        continue;
      }
      if (provider.kind === 'rawHtml') {
        // Match server-side guard in normalizeTrackingValue.
        if (/\bjavascript:/i.test(trimmed)) {
          errs[provider.key] = 'Cannot contain javascript: URLs.';
        } else {
          errs[provider.key] = null;
        }
        continue;
      }
      // Script kind values are uppercased server-side; mirror that for the
      // client-side regex check so users see the same outcome as on save.
      const normalized = provider.kind === 'script' ? trimmed.toUpperCase() : trimmed;
      if (provider.pattern && !provider.pattern.test(normalized)) {
        errs[provider.key] = provider.patternError || `${provider.label} is not in the expected format.`;
      } else {
        errs[provider.key] = null;
      }
    }
    return errs;
  }, [values]);

  const hasErrors = useMemo(
    () => Object.values(fieldErrors).some(e => !!e),
    [fieldErrors],
  );

  // Diff vs baseline so we only PUT the changed keys.
  const changedKeys = useMemo(() => {
    const out: string[] = [];
    for (const provider of PROVIDERS) {
      if ((values[provider.key] ?? '') !== (baseline[provider.key] ?? '')) {
        out.push(provider.key);
      }
    }
    return out;
  }, [values, baseline]);

  const dirty = changedKeys.length > 0 || enabled !== baselineEnabled;

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
    if (message) {
      setMessage('');
      setMessageKind(null);
    }
  };

  const handleSave = async () => {
    if (hasErrors || !dirty) return;
    setSaving(true);
    setMessage('');
    setMessageKind(null);
    try {
      const body: Record<string, unknown> = { enabled };
      for (const key of changedKeys) {
        const raw = values[key] ?? '';
        const trimmed = raw.trim();
        body[key] = trimmed === '' ? null : trimmed;
      }
      const res = await fetch(`/api/portal/cms/websites/${siteId}/tracking`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json?.success) {
        // Reset baseline so dirty check resolves cleanly, preferring the
        // server's normalized values where available (uppercased script IDs,
        // trimmed verification values, etc.).
        const next: FieldValues = { ...values };
        const data = (json.data ?? {}) as Record<string, unknown>;
        for (const provider of PROVIDERS) {
          const v = data[provider.key];
          if (typeof v === 'string') next[provider.key] = v;
          else if (v === null || v === undefined) next[provider.key] = '';
        }
        const nextEnabled =
          typeof data.enabled === 'boolean' ? (data.enabled as boolean) : enabled;
        setValues(next);
        setBaseline(next);
        setEnabled(nextEnabled);
        setBaselineEnabled(nextEnabled);
        setMessage('Tracking settings saved.');
        setMessageKind('success');
        router.refresh();
      } else {
        setMessage(json?.message || 'Failed to save tracking settings.');
        setMessageKind('error');
      }
    } catch {
      setMessage('Failed to save tracking settings.');
      setMessageKind('error');
    } finally {
      setSaving(false);
    }
  };

  const scriptProviders = PROVIDERS.filter(p => p.kind === 'script');
  const verificationProviders = PROVIDERS.filter(p => p.kind === 'verification');
  const rawHtmlProviders = PROVIDERS.filter(p => p.kind === 'rawHtml');

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      <div className="flex items-center gap-3">
        <span className="material-icons text-muted-foreground text-lg">analytics</span>
        <h3 className="font-semibold text-sm text-foreground">Tracking & Analytics</h3>
      </div>

      <p className="text-sm text-muted-foreground">
        Connect analytics, ad pixels, and search-engine verification to this website. Values are
        injected on every public page when tracking is enabled.
      </p>

      {/* Enable toggle */}
      <div className="flex items-center justify-between py-3 border-t border-border">
        <div>
          <label className="block text-sm font-medium text-foreground">
            Enable tracking on this site
          </label>
          <p className="text-xs text-muted-foreground mt-0.5">
            {enabled
              ? 'Configured scripts and meta tags are emitted on every public page.'
              : 'All tracking is suppressed regardless of the IDs configured below.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEnabled(prev => !prev)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
            enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
          }`}
          aria-pressed={enabled}
          aria-label="Toggle tracking"
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
              enabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Analytics & Tag Managers */}
      <ProviderGroup
        title="Analytics & Tag Managers"
        icon="insights"
        providers={scriptProviders}
        values={values}
        errors={fieldErrors}
        onChange={handleChange}
      />

      {/* Search-engine verification */}
      <ProviderGroup
        title="Search-engine verification"
        icon="travel_explore"
        providers={verificationProviders}
        values={values}
        errors={fieldErrors}
        onChange={handleChange}
      />

      {/* Advanced HTML */}
      <div className="border-t border-border pt-4">
        <button
          type="button"
          onClick={() => setShowAdvanced(prev => !prev)}
          className="flex items-center gap-2 text-sm font-semibold text-foreground hover:text-primary transition-colors"
          aria-expanded={showAdvanced}
        >
          <span className="material-icons text-base">
            {showAdvanced ? 'expand_less' : 'expand_more'}
          </span>
          <span className="material-icons text-muted-foreground text-base">code</span>
          Advanced HTML
        </button>
        <p className="text-xs text-muted-foreground mt-1 ml-7">
          Inject custom HTML into &lt;head&gt; or the top of &lt;body&gt; for vendors not listed
          above. Use sparingly.
        </p>
        {showAdvanced && (
          <div className="mt-4 space-y-4">
            {rawHtmlProviders.map(provider => (
              <ProviderField
                key={provider.key}
                provider={provider}
                value={values[provider.key] ?? ''}
                error={fieldErrors[provider.key]}
                onChange={v => handleChange(provider.key, v)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <button
          onClick={handleSave}
          disabled={saving || !dirty || hasErrors}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving && <span className="material-icons text-base animate-spin">refresh</span>}
          {saving ? 'Saving...' : 'Save Tracking Settings'}
        </button>
        {hasErrors && !message && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <span className="material-icons text-base">error_outline</span>
            Fix the errors above before saving.
          </p>
        )}
        {message && (
          <p
            className={`text-sm flex items-center gap-1 ${
              messageKind === 'success' ? 'text-green-600' : 'text-red-600'
            }`}
          >
            <span className="material-icons text-base">
              {messageKind === 'success' ? 'check_circle' : 'error_outline'}
            </span>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

function ProviderGroup({
  title,
  icon,
  providers,
  values,
  errors,
  onChange,
}: {
  title: string;
  icon: string;
  providers: TrackingProvider[];
  values: FieldValues;
  errors: Record<string, string | null>;
  onChange: (key: string, val: string) => void;
}) {
  if (providers.length === 0) return null;
  return (
    <div className="border-t border-border pt-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="material-icons text-muted-foreground text-base">{icon}</span>
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
      </div>
      <div className="space-y-4">
        {providers.map(provider => (
          <ProviderField
            key={provider.key}
            provider={provider}
            value={values[provider.key] ?? ''}
            error={errors[provider.key]}
            onChange={v => onChange(provider.key, v)}
          />
        ))}
      </div>
    </div>
  );
}

function ProviderField({
  provider,
  value,
  error,
  onChange,
}: {
  provider: TrackingProvider;
  value: string;
  error: string | null;
  onChange: (val: string) => void;
}) {
  const isTextarea = provider.kind === 'rawHtml';
  const inputBase = `w-full px-3 py-2.5 bg-background border rounded-lg text-foreground outline-none text-sm transition-colors ${
    error
      ? 'border-red-500 focus:border-red-500'
      : 'border-border focus:border-primary'
  }`;
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <label className="block text-sm font-medium text-foreground">{provider.label}</label>
        {provider.docsUrl && (
          <a
            href={provider.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            title={`${provider.label} setup docs`}
          >
            Docs
            <span className="material-icons text-sm">open_in_new</span>
          </a>
        )}
      </div>
      {isTextarea ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={provider.placeholder}
          rows={4}
          maxLength={provider.maxLength}
          spellCheck={false}
          className={`${inputBase} font-mono resize-y`}
        />
      ) : (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={provider.placeholder}
          maxLength={provider.maxLength}
          autoComplete="off"
          spellCheck={false}
          className={`${inputBase} font-mono`}
        />
      )}
      <p className="text-xs text-muted-foreground mt-1">{provider.help}</p>
      {error && (
        <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
          <span className="material-icons text-sm">error_outline</span>
          {error}
        </p>
      )}
    </div>
  );
}
