'use client';

// Agency-level branding overrides. Distinct from per-website branding —
// these three fields drive the *portal chrome* (sidebar header, login
// page wordmark, document title) when white-label is enabled.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pInput } from '@/components/portal/portal-ui';

interface BrandingState {
  agencyName: string | null;
  agencyLogoUrl: string | null;
  agencyPrimaryColor: string | null;
  whiteLabelEnabled: boolean;
}

export default function AgencyBrandingPage() {
  const [state, setState] = useState<BrandingState>({
    agencyName: '',
    agencyLogoUrl: '',
    agencyPrimaryColor: '',
    whiteLabelEnabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetch('/api/portal/agency/branding')
      .then(r => r.json())
      .then(res => {
        if (res.success) {
          setState({
            agencyName: res.data.agencyName ?? '',
            agencyLogoUrl: res.data.agencyLogoUrl ?? '',
            agencyPrimaryColor: res.data.agencyPrimaryColor ?? '',
            whiteLabelEnabled: res.data.whiteLabelEnabled ?? false,
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/portal/agency/branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agencyName: state.agencyName || null,
          agencyLogoUrl: state.agencyLogoUrl || null,
          agencyPrimaryColor: state.agencyPrimaryColor || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'Branding saved.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Could not save.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl">
      <Link href="/portal/agency" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
        <span className="material-icons text-base">arrow_back</span>
        Agency settings
      </Link>

      <PortalPageHeader
        eyebrow="Agency"
        title="Agency Branding"
        subtitle="These overrides appear in the portal chrome — sidebar header, login wordmark, document title — when white-label mode is on."
      />

      {message && (
        <div
          className={`mb-4 p-3 rounded-xl flex items-center gap-2 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
              : 'bg-destructive/10 text-destructive border border-destructive/20'
          }`}
        >
          <span className="material-icons text-base">
            {message.type === 'success' ? 'check_circle' : 'error_outline'}
          </span>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : (
        <form onSubmit={save} className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-foreground">Agency name</span>
            <input
              type="text"
              value={state.agencyName ?? ''}
              onChange={e => setState(s => ({ ...s, agencyName: e.target.value }))}
              placeholder="Acme Digital Agency"
              maxLength={255}
              className={`mt-1 ${pInput}`}
            />
            <span className="text-xs text-muted-foreground mt-1 block">
              Replaces &quot;Simpler Development&quot; in the sidebar and login page.
            </span>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-foreground">Logo URL</span>
            <input
              type="url"
              value={state.agencyLogoUrl ?? ''}
              onChange={e => setState(s => ({ ...s, agencyLogoUrl: e.target.value }))}
              placeholder="https://cdn.your-agency.com/logo.png"
              maxLength={500}
              className={`mt-1 ${pInput}`}
            />
            <span className="text-xs text-muted-foreground mt-1 block">
              Square or rectangular logo. Replaces the platform icon in portal chrome.
            </span>
          </label>

          {state.agencyLogoUrl && (
            <div className="rounded-xl border border-border bg-muted/30 p-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Preview</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={state.agencyLogoUrl} alt="Agency logo preview" className="h-8 w-auto object-contain" />
            </div>
          )}

          <label className="block">
            <span className="text-sm font-medium text-foreground">Primary color</span>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="color"
                value={state.agencyPrimaryColor || '#2563eb'}
                onChange={e => setState(s => ({ ...s, agencyPrimaryColor: e.target.value }))}
                className="h-10 w-14 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={state.agencyPrimaryColor ?? ''}
                onChange={e => setState(s => ({ ...s, agencyPrimaryColor: e.target.value }))}
                placeholder="#2563eb"
                pattern="^#(?:[0-9a-fA-F]{3}){1,2}$"
                className={`flex-1 font-mono ${pInput}`}
              />
              {state.agencyPrimaryColor && (
                <button
                  type="button"
                  onClick={() => setState(s => ({ ...s, agencyPrimaryColor: '' }))}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </label>

          <button
            type="submit"
            disabled={saving}
            className={pBtnPrimary}
          >
            {saving && <span className="material-icons animate-spin text-base">refresh</span>}
            Save
          </button>
        </form>
      )}
    </div>
  );
}
