'use client';

import { useEffect, useState } from 'react';

interface CustomCodeFormProps {
  /** REST endpoint to GET/PUT { customCss, customJs } from. */
  endpoint: string;
  /** Optional title shown in the page header. */
  title?: string;
  /** Optional one-line subtitle / scope hint shown under the title. */
  subtitle?: string;
}

export function CustomCodeForm({ endpoint, title = 'Custom CSS & JavaScript', subtitle }: CustomCodeFormProps) {
  const [tab, setTab] = useState<'css' | 'js'>('css');
  const [css, setCss] = useState('');
  const [js, setJs] = useState('');
  const [savedCss, setSavedCss] = useState('');
  const [savedJs, setSavedJs] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(endpoint).then(r => r.json());
        if (cancelled) return;
        if (res.success && res.data) {
          setCss(res.data.customCss || '');
          setJs(res.data.customJs || '');
          setSavedCss(res.data.customCss || '');
          setSavedJs(res.data.customJs || '');
        } else {
          setError(res.message || 'Failed to load custom code.');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [endpoint]);

  const dirty = css !== savedCss || js !== savedJs;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCss: css, customJs: js }),
      }).then(r => r.json());
      if (res.success) {
        setSavedCss(css);
        setSavedJs(js);
        setSavedAt(new Date());
      } else {
        setError(res.message || 'Save failed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {dirty ? 'Unsaved changes' : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : ''}
          </span>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving || loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving && <span className="material-icons text-base animate-spin">refresh</span>}
            <span className="material-icons text-base">save</span>
            Save
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-1 px-4 pt-2 border-b border-border">
          <button
            type="button"
            onClick={() => setTab('css')}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
              tab === 'css' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            CSS
          </button>
          <button
            type="button"
            onClick={() => setTab('js')}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
              tab === 'js' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            JavaScript
          </button>
          <div className="ml-auto text-xs text-muted-foreground pb-1">
            {tab === 'css'
              ? 'Injected as a <style> tag at render time. Cascades after earlier layers.'
              : 'Wrapped in an IIFE and run after window load on the public site.'}
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
              <span className="material-icons animate-spin">refresh</span>
            </div>
          ) : tab === 'css' ? (
            <textarea
              value={css}
              onChange={(e) => setCss(e.target.value)}
              spellCheck={false}
              placeholder={'/* Custom CSS */'}
              className="w-full h-[60vh] resize-none rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          ) : (
            <textarea
              value={js}
              onChange={(e) => setJs(e.target.value)}
              spellCheck={false}
              placeholder={'// Custom JS — runs once on the public site after window load.'}
              className="w-full h-[60vh] resize-none rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"
            />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}
    </div>
  );
}
