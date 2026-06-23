'use client';

import { useEffect, useMemo, useState } from 'react';

interface CustomCodeFormProps {
  /**
   * REST endpoint to GET/PUT { customCss, customJs } from.
   * Saves now stage into draft_*. Companion endpoints:
   *   POST `${endpoint}/publish` — promote draft → live.
   *   POST `${endpoint}/discard` — clear draft.
   * Older callers that don't have those sub-routes can set
   * `supportsDrafts={false}` to fall back to the legacy live-only UI.
   */
  endpoint: string;
  /** Optional title shown in the page header. */
  title?: string;
  /** Optional one-line subtitle / scope hint shown under the title. */
  subtitle?: string;
  /**
   * When false, the component behaves like the original single-state form
   * (saves go straight to live; no publish/discard). Defaults to true.
   */
  supportsDrafts?: boolean;
}

interface DraftAuthor {
  id: number;
  name: string | null;
  email: string | null;
}

interface CodePayload {
  customCss: string;
  customJs: string;
  draftCustomCss: string | null;
  draftCustomJs: string | null;
  draftUpdatedAt: string | null;
  draftUpdatedBy: DraftAuthor | null;
  hasDraft: boolean;
}

function relativeTime(iso: string | null): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString();
}

export function CustomCodeForm({
  endpoint,
  title = 'Custom CSS & JavaScript',
  subtitle,
  supportsDrafts = true,
}: CustomCodeFormProps) {
  // What's currently live on the public site (read-only display).
  const [liveCss, setLiveCss] = useState('');
  const [liveJs, setLiveJs] = useState('');
  // Draft buffer — what the user is editing. Seeded from draft_* if present,
  // otherwise from live (so the editor never starts empty when no draft exists).
  const [draftCss, setDraftCss] = useState('');
  const [draftJs, setDraftJs] = useState('');
  // Last-known-saved draft values (used to detect dirty state).
  const [savedDraftCss, setSavedDraftCss] = useState('');
  const [savedDraftJs, setSavedDraftJs] = useState('');
  // Server-side "is there a draft at all?" + metadata.
  const [hasDraft, setHasDraft] = useState(false);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null);
  const [draftUpdatedBy, setDraftUpdatedBy] = useState<DraftAuthor | null>(null);

  const [view, setView] = useState<'draft' | 'live'>('draft');
  const [lang, setLang] = useState<'css' | 'js'>('css');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Seed both live + draft from the API. Draft falls back to live values when
  // no server-side draft exists yet — so the user can start editing without
  // confronting an empty textarea.
  function applyPayload(data: CodePayload) {
    setLiveCss(data.customCss || '');
    setLiveJs(data.customJs || '');
    const seedCss = data.draftCustomCss ?? data.customCss ?? '';
    const seedJs = data.draftCustomJs ?? data.customJs ?? '';
    setDraftCss(seedCss);
    setDraftJs(seedJs);
    setSavedDraftCss(seedCss);
    setSavedDraftJs(seedJs);
    setHasDraft(data.hasDraft);
    setDraftUpdatedAt(data.draftUpdatedAt);
    setDraftUpdatedBy(data.draftUpdatedBy);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(endpoint).then(r => r.json());
        if (cancelled) return;
        if (res.success && res.data) {
          applyPayload({
            customCss: res.data.customCss || '',
            customJs: res.data.customJs || '',
            draftCustomCss: res.data.draftCustomCss ?? null,
            draftCustomJs: res.data.draftCustomJs ?? null,
            draftUpdatedAt: res.data.draftUpdatedAt ?? null,
            draftUpdatedBy: res.data.draftUpdatedBy ?? null,
            hasDraft: res.data.hasDraft ?? false,
          });
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

  // Auto-dismiss success toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  const dirty = draftCss !== savedDraftCss || draftJs !== savedDraftJs;

  // "Draft differs from live" — drives the publish button + the dirty pill.
  const draftDiffersFromLive = useMemo(() => {
    return (savedDraftCss || '') !== (liveCss || '') || (savedDraftJs || '') !== (liveJs || '');
  }, [savedDraftCss, savedDraftJs, liveCss, liveJs]);

  const canPublish = supportsDrafts && hasDraft && draftDiffersFromLive && !publishing && !saving && !discarding;
  const canDiscard = supportsDrafts && hasDraft && !publishing && !saving && !discarding;

  async function saveDraft() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customCss: draftCss, customJs: draftJs }),
      }).then(r => r.json());
      if (res.success && res.data) {
        setSavedDraftCss(draftCss);
        setSavedDraftJs(draftJs);
        if (supportsDrafts) {
          setLiveCss(res.data.customCss || '');
          setLiveJs(res.data.customJs || '');
          setDraftUpdatedAt(res.data.draftUpdatedAt ?? new Date().toISOString());
          setHasDraft(true);
        } else {
          // Legacy mode — saves are live writes.
          setLiveCss(draftCss);
          setLiveJs(draftJs);
        }
        setToast(supportsDrafts ? 'Draft saved' : 'Saved');
      } else {
        setError(res.message || 'Save failed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    if (!supportsDrafts) return;
    if (!confirm('Publish draft to live? This affects every page on the site.')) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}/publish`, { method: 'POST' }).then(r => r.json());
      if (res.success && res.data) {
        applyPayload(res.data as CodePayload);
        setView('live');
        setToast('Published to live');
      } else {
        setError(res.message || 'Publish failed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Publish failed.');
    } finally {
      setPublishing(false);
    }
  }

  async function discardDraft() {
    if (!supportsDrafts) return;
    if (!confirm('Discard draft and revert to the published version?')) return;
    setDiscarding(true);
    setError(null);
    try {
      const res = await fetch(`${endpoint}/discard`, { method: 'POST' }).then(r => r.json());
      if (res.success && res.data) {
        applyPayload(res.data as CodePayload);
        setToast('Draft discarded');
      } else {
        setError(res.message || 'Discard failed.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Discard failed.');
    } finally {
      setDiscarding(false);
    }
  }

  const showingLive = supportsDrafts && view === 'live';
  const cssValue = showingLive ? liveCss : draftCss;
  const jsValue = showingLive ? liveJs : draftJs;
  const readOnly = showingLive;

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {supportsDrafts && hasDraft && draftDiffersFromLive && (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300 px-2 py-1 rounded-md">
              <span className="material-icons text-sm">edit_note</span>
              Draft has unpublished changes
            </span>
          )}
          {dirty && (
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
          )}
          {supportsDrafts && canDiscard && (
            <button
              type="button"
              onClick={discardDraft}
              disabled={!canDiscard}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-border text-foreground hover:bg-accent transition-colors disabled:opacity-50"
            >
              {discarding ? (
                <span className="material-icons text-base animate-spin">refresh</span>
              ) : (
                <span className="material-icons text-base">delete_sweep</span>
              )}
              Discard draft
            </button>
          )}
          <button
            type="button"
            onClick={saveDraft}
            disabled={!dirty || saving || loading || showingLive}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors disabled:opacity-50"
            title={showingLive ? 'Switch to Draft tab to edit' : undefined}
          >
            {saving ? (
              <span className="material-icons text-base animate-spin">refresh</span>
            ) : (
              <span className="material-icons text-base">save</span>
            )}
            {supportsDrafts ? 'Save draft' : 'Save'}
          </button>
          {supportsDrafts && (
            <button
              type="button"
              onClick={publishDraft}
              disabled={!canPublish}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              title={!canPublish ? 'No draft changes to publish' : undefined}
            >
              {publishing ? (
                <span className="material-icons text-base animate-spin">refresh</span>
              ) : (
                <span className="material-icons text-base">publish</span>
              )}
              Publish
            </button>
          )}
        </div>
      </div>

      {supportsDrafts && hasDraft && draftUpdatedAt && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span className="material-icons text-sm">history</span>
          Drafted by{' '}
          <span className="font-medium text-foreground">
            {draftUpdatedBy?.name || draftUpdatedBy?.email || 'unknown'}
          </span>
          {' · '}
          <span title={new Date(draftUpdatedAt).toLocaleString()}>{relativeTime(draftUpdatedAt)}</span>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {supportsDrafts && (
          <div className="flex items-center gap-1 px-4 pt-2 border-b border-border bg-muted/30">
            <button
              type="button"
              onClick={() => setView('draft')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
                view === 'draft'
                  ? 'bg-background text-foreground border border-border border-b-background -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base">edit</span>
              Draft
              {hasDraft && draftDiffersFromLive && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="Unpublished changes" />
              )}
            </button>
            <button
              type="button"
              onClick={() => setView('live')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
                view === 'live'
                  ? 'bg-background text-foreground border border-border border-b-background -mb-px'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="material-icons text-base">public</span>
              Live
            </button>
            <div className="ml-auto text-xs text-muted-foreground pb-1">
              {showingLive ? 'Currently serving on the public site (read-only).' : 'Edits stage here until you publish.'}
            </div>
          </div>
        )}

        <div className="flex items-center gap-1 px-4 pt-2 border-b border-border">
          <button
            type="button"
            onClick={() => setLang('css')}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
              lang === 'css' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            CSS
          </button>
          <button
            type="button"
            onClick={() => setLang('js')}
            className={`px-3 py-1.5 text-sm font-medium rounded-t-md transition-colors ${
              lang === 'js' ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            JavaScript
          </button>
          <div className="ml-auto text-xs text-muted-foreground pb-1">
            {lang === 'css'
              ? 'Injected as a <style> tag at render time. Cascades after earlier layers.'
              : 'Wrapped in an IIFE and run after window load on the public site.'}
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center h-[60vh] text-muted-foreground">
              <span className="material-icons animate-spin">refresh</span>
            </div>
          ) : lang === 'css' ? (
            <textarea
              value={cssValue}
              onChange={readOnly ? undefined : (e) => setDraftCss(e.target.value)}
              readOnly={readOnly}
              spellCheck={false}
              placeholder={'/* Custom CSS */'}
              className={`w-full h-[60vh] resize-none rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary ${readOnly ? 'opacity-90 cursor-default' : ''}`}
            />
          ) : (
            <textarea
              value={jsValue}
              onChange={readOnly ? undefined : (e) => setDraftJs(e.target.value)}
              readOnly={readOnly}
              spellCheck={false}
              placeholder={'// Custom JS — runs once on the public site after window load.'}
              className={`w-full h-[60vh] resize-none rounded-lg border border-border bg-muted/20 px-4 py-3 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary ${readOnly ? 'opacity-90 cursor-default' : ''}`}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg px-4 py-3 flex items-center gap-2">
          <span className="material-icons text-base">error</span>
          {error}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 bg-foreground text-background text-sm rounded-lg px-4 py-2 shadow-lg flex items-center gap-2 z-50">
          <span className="material-icons text-base">check_circle</span>
          {toast}
        </div>
      )}
    </div>
  );
}
