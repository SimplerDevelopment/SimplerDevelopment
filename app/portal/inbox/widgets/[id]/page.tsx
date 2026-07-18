'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { PortalPageHeader } from '@/components/portal/PortalPageHeader';
import { pBtnPrimary, pBtnGhost, pCard, pSelect, pSectionTitle } from '@/components/portal/portal-ui';

interface Widget {
  id: number;
  siteId: number;
  enabled: boolean;
  greetingMessage: string | null;
  position: string;
  primaryColor: string;
  awayMessage: string | null;
}

const POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];

export default function WidgetSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const widgetId = Number.parseInt(id, 10);
  const [widget, setWidget] = useState<Widget | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedJs, setCopiedJs] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/portal/chat/widgets/${widgetId}`);
    const json = await res.json();
    if (!json.success) throw new Error(json.message || 'Load failed');
    setWidget(json.data as Widget);
  }, [widgetId]);

  useEffect(() => {
    load().catch((e) => setError(e instanceof Error ? e.message : 'Load failed'));
  }, [load]);

  const save = useCallback(async () => {
    if (!widget) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/portal/chat/widgets/${widgetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: widget.enabled,
          greetingMessage: widget.greetingMessage,
          position: widget.position,
          primaryColor: widget.primaryColor,
          awayMessage: widget.awayMessage,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || 'Save failed');
      setWidget(json.data as Widget);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [widget, widgetId]);

  const embed = useMemo(() => {
    if (!widget) return '';
    const origin = typeof window === 'undefined' ? 'https://your-portal' : window.location.origin;
    return `<script src="${origin}/widget/chat.js" data-widget-id="${widget.id}" async></script>`;
  }, [widget]);

  // Site Custom Code's JS field wraps its value in a <script> body (see
  // SiteBlockRenderer's dangerouslySetInnerHTML) — pasting the <script> tag
  // above there produces a nested `<script>...<script>...</script>` whose
  // closing raw-text `</script` match truncates the outer tag, so the widget
  // never loads. This variant creates the tag via the DOM API instead.
  const embedJs = useMemo(() => {
    if (!widget) return '';
    const origin = typeof window === 'undefined' ? 'https://your-portal' : window.location.origin;
    return `var s=document.createElement('script');s.src='${origin}/widget/chat.js';s.setAttribute('data-widget-id','${widget.id}');s.async=true;document.head.appendChild(s);`;
  }, [widget]);

  if (!widget) {
    return <div className="p-6 text-sm text-muted-foreground">{error || 'Loading…'}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/portal/inbox" className="hover:text-foreground inline-flex items-center gap-1">
          <span className="material-icons text-base">arrow_back</span>
          Inbox
        </Link>
      </div>
      <PortalPageHeader eyebrow="Inbox" title="Chat Widget Settings" />

      {error && <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">{error}</div>}

      <section className={`${pCard} p-5 space-y-4`}>
        <div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={widget.enabled}
              onChange={(e) => setWidget({ ...widget, enabled: e.target.checked })}
            />
            Widget enabled
          </label>
          <p className="text-xs text-muted-foreground mt-1">
            When off, embed scripts on this site will return 404.
          </p>
        </div>

        <div>
          <label className="text-sm font-medium">Greeting message</label>
          <textarea
            className="w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 mt-1 resize-none"
            rows={2}
            value={widget.greetingMessage ?? ''}
            onChange={(e) => setWidget({ ...widget, greetingMessage: e.target.value })}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Away message</label>
          <textarea
            className="w-full rounded-xl border border-border bg-card px-3.5 py-2 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-primary focus:ring-4 focus:ring-primary/15 mt-1 resize-none"
            rows={2}
            value={widget.awayMessage ?? ''}
            onChange={(e) => setWidget({ ...widget, awayMessage: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Position</label>
            <select
              className={`${pSelect} mt-1`}
              value={widget.position}
              onChange={(e) => setWidget({ ...widget, position: e.target.value })}
            >
              {POSITIONS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Primary color</label>
            <input
              type="color"
              className="w-full border rounded-md p-1 mt-1 bg-background h-10"
              value={widget.primaryColor}
              onChange={(e) => setWidget({ ...widget, primaryColor: e.target.value })}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className={pBtnPrimary}
        >
          <span className="material-icons text-base">save</span>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </section>

      <section className={`${pCard} p-5 space-y-2`}>
        <h2 className={`${pSectionTitle} flex items-center gap-2`}>
          <span className="material-icons">code</span>
          Embed
        </h2>
        <p className="text-sm text-muted-foreground">
          For direct HTML paste (&lt;head&gt;)
        </p>
        <pre className="bg-muted p-3 rounded-xl text-xs overflow-x-auto">{embed}</pre>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(embed);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              // ignore
            }
          }}
          className={pBtnGhost}
        >
          <span className="material-icons text-base">{copied ? 'check' : 'content_copy'}</span>
          {copied ? 'Copied' : 'Copy'}
        </button>

        <p className="text-sm text-muted-foreground pt-2">
          For Site Custom Code (JavaScript field) — do not use the HTML snippet above there, it
          will break the page&apos;s custom code script.
        </p>
        <pre className="bg-muted p-3 rounded-xl text-xs overflow-x-auto">{embedJs}</pre>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(embedJs);
              setCopiedJs(true);
              setTimeout(() => setCopiedJs(false), 1500);
            } catch {
              // ignore
            }
          }}
          className={pBtnGhost}
        >
          <span className="material-icons text-base">{copiedJs ? 'check' : 'content_copy'}</span>
          {copiedJs ? 'Copied' : 'Copy'}
        </button>
      </section>
    </div>
  );
}
