'use client';

// Multi-step custom-domain setup. Three states:
//   1. Empty   — show the "add a domain" form.
//   2. Pending — domain submitted, TXT record displayed, "Verify" button.
//   3. Verified — show domain + remove option.
//
// State is driven entirely by the GET endpoint, so a refresh always
// reflects the source of truth. The verify button surfaces 422 errors
// inline (DNS hasn't propagated yet, etc.).

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface DomainState {
  customDomain: string | null;
  verifiedAt: string | null;
  verificationRecord: { host: string; type: string; value: string } | null;
}

export default function CustomDomainPage() {
  const [state, setState] = useState<DomainState>({
    customDomain: null,
    verifiedAt: null,
    verificationRecord: null,
  });
  const [domainInput, setDomainInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/portal/agency/custom-domain').then(r => r.json());
      if (res.success) setState(res.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function submitDomain(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/portal/agency/custom-domain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: domainInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setState(data.data);
        setDomainInput('');
        setMessage({ type: 'info', text: 'Add the TXT record below at your DNS provider, then click Verify.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Could not save domain.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    } finally {
      setSubmitting(false);
    }
  }

  async function verify() {
    setVerifying(true);
    setMessage(null);
    try {
      const res = await fetch('/api/portal/agency/custom-domain/verify', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await refresh();
        setMessage({ type: 'success', text: 'Domain verified. White-label can now be enabled.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Verification failed.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    } finally {
      setVerifying(false);
    }
  }

  async function removeDomain() {
    if (!confirm('Remove this custom domain? White-label will be turned off.')) return;
    setRemoving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/portal/agency/custom-domain', { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await refresh();
        setMessage({ type: 'success', text: 'Custom domain removed.' });
      } else {
        setMessage({ type: 'error', text: data.error || 'Could not remove domain.' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Network error.' });
    } finally {
      setRemoving(false);
    }
  }

  function copyToken() {
    if (!state.verificationRecord) return;
    navigator.clipboard.writeText(state.verificationRecord.value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="max-w-3xl">
      <Link href="/portal/agency" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4">
        <span className="material-icons text-base">arrow_back</span>
        Agency settings
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Custom Portal Domain</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Map your own apex or subdomain to this portal so clients see your brand instead of
          simplerdevelopment.com.
        </p>
      </div>

      {message && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
            message.type === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20'
              : message.type === 'error'
              ? 'bg-destructive/10 text-destructive border border-destructive/20'
              : 'bg-primary/10 text-foreground border border-primary/20'
          }`}
        >
          <span className="material-icons text-base">
            {message.type === 'success'
              ? 'check_circle'
              : message.type === 'error'
              ? 'error_outline'
              : 'info'}
          </span>
          {message.text}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="material-icons animate-spin text-primary text-2xl">refresh</span>
        </div>
      ) : !state.customDomain ? (
        <form onSubmit={submitDomain} className="bg-card border border-border rounded-xl p-6 space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-foreground">Domain</span>
            <input
              type="text"
              value={domainInput}
              onChange={e => setDomainInput(e.target.value)}
              placeholder="portal.your-agency.com"
              required
              className="mt-1 block w-full px-3 py-2 rounded-md border border-border bg-background text-foreground"
            />
            <span className="text-xs text-muted-foreground mt-1 block">
              We&apos;ll generate a TXT record to verify ownership before activating it.
            </span>
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
          >
            {submitting && <span className="material-icons animate-spin text-base">refresh</span>}
            Continue
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{state.customDomain}</h2>
                {state.verifiedAt ? (
                  <p className="text-sm text-emerald-700 dark:text-emerald-300 mt-1 flex items-center gap-1">
                    <span className="material-icons text-base">verified</span>
                    Verified {new Date(state.verifiedAt).toLocaleString()}
                  </p>
                ) : (
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1 flex items-center gap-1">
                    <span className="material-icons text-base">schedule</span>
                    Pending DNS verification
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={removeDomain}
                disabled={removing}
                className="text-sm text-destructive hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>

          {state.verificationRecord && !state.verifiedAt && (
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-1">
                <span className="material-icons text-base">dns</span>
                Add this TXT record at your DNS provider
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                Once propagated (usually under 5 minutes), click Verify below.
              </p>

              <div className="grid grid-cols-[80px_1fr] gap-x-4 gap-y-2 text-sm font-mono">
                <span className="text-muted-foreground">Type</span>
                <span className="text-foreground">{state.verificationRecord.type}</span>

                <span className="text-muted-foreground">Host</span>
                <span className="text-foreground break-all">{state.verificationRecord.host}</span>

                <span className="text-muted-foreground">Value</span>
                <span className="text-foreground break-all flex items-start gap-2">
                  <code className="flex-1">{state.verificationRecord.value}</code>
                  <button
                    type="button"
                    onClick={copyToken}
                    className="shrink-0 text-xs text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <span className="material-icons text-sm">{copied ? 'check' : 'content_copy'}</span>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </span>
              </div>

              <button
                type="button"
                onClick={verify}
                disabled={verifying}
                className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 inline-flex items-center gap-1"
              >
                {verifying && <span className="material-icons animate-spin text-base">refresh</span>}
                Verify
              </button>
            </div>
          )}

          {state.verifiedAt && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-sm text-foreground">
              Your custom domain is live. To finish white-labeling, set your agency name and logo
              under <Link href="/portal/agency/branding" className="text-primary hover:underline">Agency
              Branding</Link>, then flip the switch on the <Link href="/portal/agency" className="text-primary hover:underline">agency
              settings hub</Link>.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
