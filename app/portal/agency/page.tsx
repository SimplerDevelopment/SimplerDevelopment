'use client';

// Agency settings hub for the white-label / SaaS Mode tier. Orientation
// page: shows current state at a glance, links to the deeper config pages
// (custom domain, agency branding), and exposes the white-label kill-
// switch which gates on a verified custom domain.

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface AgencyStatus {
  customDomain: string | null;
  verifiedAt: string | null;
  whiteLabelEnabled: boolean;
  agencyName: string | null;
  agencyLogoUrl: string | null;
}

export default function AgencyHubPage() {
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [status, setStatus] = useState<AgencyStatus>({
    customDomain: null,
    verifiedAt: null,
    whiteLabelEnabled: false,
    agencyName: null,
    agencyLogoUrl: null,
  });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [domainRes, brandingRes] = await Promise.all([
        fetch('/api/portal/agency/custom-domain').then(r => r.json()),
        fetch('/api/portal/agency/branding').then(r => r.json()),
      ]);
      setStatus({
        customDomain: domainRes?.data?.customDomain ?? null,
        verifiedAt: domainRes?.data?.verifiedAt ?? null,
        whiteLabelEnabled: domainRes?.data?.whiteLabelEnabled ?? false,
        agencyName: brandingRes?.data?.agencyName ?? null,
        agencyLogoUrl: brandingRes?.data?.agencyLogoUrl ?? null,
      });
    } catch {
      setMessage({ type: 'error', text: 'Failed to load agency settings.' });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function toggleWhiteLabel(next: boolean) {
    setToggling(true);
    setMessage(null);
    try {
      const res = await fetch('/api/portal/agency/white-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(s => ({ ...s, whiteLabelEnabled: next }));
        setMessage({ type: 'success', text: next ? 'White-label enabled.' : 'White-label disabled.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Could not update white-label.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    } finally {
      setToggling(false);
    }
  }

  const verified = !!status.verifiedAt;
  const canEnable = verified && !!status.agencyName;

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Agency / White-Label</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Configure your agency&apos;s portal. Map a custom domain, override the brand chrome, and resell the
          platform under your own identity.
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
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
        <div className="space-y-4">
          {/* White-label toggle card */}
          <section className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <span className="material-icons text-primary">campaign</span>
                  White-Label Mode
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  When enabled, the portal chrome shows your agency name and logo instead of
                  &quot;Simpler Development&quot;. Available on the Scale tier.
                </p>
                {!canEnable && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-2 flex items-center gap-1">
                    <span className="material-icons text-sm">info</span>
                    {!verified
                      ? 'Verify a custom domain to unlock this toggle.'
                      : 'Set an agency name to unlock this toggle.'}
                  </p>
                )}
              </div>
              <label
                className={`relative inline-flex items-center cursor-pointer ${
                  !canEnable && !status.whiteLabelEnabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
                title={!canEnable && !status.whiteLabelEnabled ? 'Verify a custom domain and set an agency name first' : ''}
              >
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={status.whiteLabelEnabled}
                  disabled={toggling || (!canEnable && !status.whiteLabelEnabled)}
                  onChange={e => toggleWhiteLabel(e.target.checked)}
                />
                <div className="w-11 h-6 bg-muted rounded-full peer-checked:bg-primary peer-disabled:opacity-50 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-transform peer-checked:after:translate-x-5"></div>
              </label>
            </div>
          </section>

          {/* Custom domain card */}
          <Link
            href="/portal/agency/custom-domain"
            className="block bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start gap-4">
              <span className="material-icons text-primary text-3xl">dns</span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">Custom Portal Domain</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Map your own domain (e.g. portal.your-agency.com) to this portal.
                </p>
                <div className="mt-2 text-sm flex items-center gap-2">
                  {status.customDomain ? (
                    <>
                      <code className="px-2 py-0.5 rounded bg-muted text-foreground">{status.customDomain}</code>
                      {verified ? (
                        <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                          <span className="material-icons text-sm">verified</span>
                          Verified
                        </span>
                      ) : (
                        <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1">
                          <span className="material-icons text-sm">schedule</span>
                          Pending verification
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground italic">No custom domain configured</span>
                  )}
                </div>
              </div>
              <span className="material-icons text-muted-foreground">chevron_right</span>
            </div>
          </Link>

          {/* Agency branding card */}
          <Link
            href="/portal/agency/branding"
            className="block bg-card border border-border rounded-xl p-6 hover:border-primary/50 transition-colors"
          >
            <div className="flex items-start gap-4">
              <span className="material-icons text-primary text-3xl">palette</span>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-foreground">Agency Branding</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Override the portal chrome with your own name, logo, and accent color.
                </p>
                <div className="mt-2 text-sm flex items-center gap-2">
                  {status.agencyName ? (
                    <span className="text-foreground">{status.agencyName}</span>
                  ) : (
                    <span className="text-muted-foreground italic">Not configured</span>
                  )}
                  {status.agencyLogoUrl && (
                    <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                      <span className="material-icons text-sm">image</span>
                      Logo set
                    </span>
                  )}
                </div>
              </div>
              <span className="material-icons text-muted-foreground">chevron_right</span>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
