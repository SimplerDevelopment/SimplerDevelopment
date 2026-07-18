import { useEffect, useState } from 'react';
import { api, ApiAuthError, ApiNetworkError } from '../lib/api';
import { getConfig, normalizePortalUrl, setConfig } from '../lib/storage';
import { Spinner } from '../popup/components/Spinner';

export default function App() {
  const [portalUrl, setPortalUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [status, setStatus] = useState<{
    level: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  useEffect(() => {
    getConfig().then((cfg) => {
      if (cfg) {
        setPortalUrl(cfg.portalUrl);
        setApiKey(cfg.apiKey);
      }
      setLoaded(true);
    });
  }, []);

  async function onTestAndSave(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setSaved(false);
    const url = normalizePortalUrl(portalUrl);
    if (!url) {
      setStatus({ level: 'error', text: 'Portal URL is required.' });
      return;
    }
    if (!apiKey.startsWith('sd_mcp_')) {
      setStatus({
        level: 'error',
        text: 'API keys start with "sd_mcp_". Mint one in the portal.',
      });
      return;
    }
    setTesting(true);
    try {
      const res = await api.authTest({ portalUrl: url, apiKey });
      await setConfig({
        portalUrl: url,
        apiKey,
        user: { name: res.user.name ?? null, email: res.user.email ?? null },
        client: { name: res.client.name },
      });
      setStatus({
        level: 'success',
        text: `Connected as ${res.user.name || res.user.email || 'user'} (${res.client.name})`,
      });
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiAuthError) {
        setStatus({ level: 'error', text: 'API key was rejected. Double-check it.' });
      } else if (err instanceof ApiNetworkError) {
        setStatus({ level: 'error', text: "Couldn't reach portal. Check the URL." });
      } else {
        setStatus({ level: 'error', text: err instanceof Error ? err.message : String(err) });
      }
    } finally {
      setTesting(false);
    }
  }

  const normalized = normalizePortalUrl(portalUrl);
  const apiKeyHref = normalized ? `${normalized}/portal/integrations/api-keys` : null;

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-500">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="max-w-xl mx-auto px-6">
        <div className="flex items-center gap-3 mb-6">
          <Logo size={36} />
          <div>
            <h1 className="text-xl font-semibold text-slate-900">SD Brain — Settings</h1>
            <p className="text-sm text-slate-500">Connect this extension to your portal.</p>
          </div>
        </div>

        <form
          onSubmit={onTestAndSave}
          className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">Portal URL</label>
            <input
              type="text"
              value={portalUrl}
              onChange={(e) => {
                setPortalUrl(e.target.value);
                setSaved(false);
              }}
              placeholder="https://simplerdevelopment.com"
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
              required
            />
            <p className="text-xs text-slate-500">
              The base URL of your SimplerDevelopment portal (no trailing slash needed).
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-900">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setSaved(false);
              }}
              placeholder="sd_mcp_..."
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 font-mono"
              required
            />
            <p className="text-xs text-slate-500">
              Don't have a key?{' '}
              {apiKeyHref ? (
                <a
                  className="text-brand-700 hover:underline font-medium"
                  href={apiKeyHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open {apiKeyHref}
                </a>
              ) : (
                <span className="text-slate-400">Set portal URL first.</span>
              )}
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={testing}
              className="inline-flex items-center gap-2 rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {testing && <Spinner size={14} />}
              {testing ? 'Testing...' : 'Test connection & save'}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-700">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Saved
              </span>
            )}
          </div>

          {status && (
            <div
              className={`rounded-md border p-3 text-sm ${
                status.level === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : status.level === 'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-900'
                  : 'border-slate-200 bg-slate-50 text-slate-900'
              }`}
            >
              {status.text}
            </div>
          )}
        </form>

        <div className="mt-6 text-xs text-slate-500 leading-relaxed">
          <strong className="text-slate-700">Tips.</strong> Use the keyboard shortcut{' '}
          <kbd className="rounded border border-slate-300 bg-white px-1 py-0.5 font-mono">
            ⌘⇧B
          </kbd>{' '}
          / <kbd className="rounded border border-slate-300 bg-white px-1 py-0.5 font-mono">Ctrl+Shift+B</kbd>{' '}
          to open quick capture. Right-click selected text to save it as a note. The toolbar badge shows how
          many notes already exist for the current URL.
        </div>
      </div>
    </div>
  );
}

function Logo({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#4f46e5" />
      <path
        d="M9 7c1.4-1.5 4.6-1.5 6 0s.5 3.5-1 4.5 1.5 1.5 1.5 3.5-2 3-4 3-3.5-1-3.5-3"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
