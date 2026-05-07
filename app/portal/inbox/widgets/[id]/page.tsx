'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

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

  if (!widget) {
    return <div className="p-6 text-sm text-muted-foreground">{error || 'Loading…'}</div>;
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <Link
          href="/portal/inbox"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
        >
          <span className="material-icons text-base">arrow_back</span>
          Inbox
        </Link>
        <h1 className="text-2xl font-semibold flex items-center gap-2 mt-2">
          <span className="material-icons">settings</span>
          Chat widget settings
        </h1>
      </div>

      {error && <div className="bg-destructive/10 text-destructive p-3 rounded-md text-sm">{error}</div>}

      <section className="border rounded-md p-4 bg-card space-y-4">
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
            className="w-full border rounded-md p-2 mt-1 bg-background"
            rows={2}
            value={widget.greetingMessage ?? ''}
            onChange={(e) => setWidget({ ...widget, greetingMessage: e.target.value })}
          />
        </div>

        <div>
          <label className="text-sm font-medium">Away message</label>
          <textarea
            className="w-full border rounded-md p-2 mt-1 bg-background"
            rows={2}
            value={widget.awayMessage ?? ''}
            onChange={(e) => setWidget({ ...widget, awayMessage: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-medium">Position</label>
            <select
              className="w-full border rounded-md p-2 mt-1 bg-background"
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
          className="inline-flex items-center gap-1 px-3 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
        >
          <span className="material-icons text-base">save</span>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </section>

      <section className="border rounded-md p-4 bg-card space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <span className="material-icons">code</span>
          Embed
        </h2>
        <p className="text-sm text-muted-foreground">
          Paste this into the head of any page that should show the chat widget.
        </p>
        <pre className="bg-muted p-3 rounded-md text-xs overflow-x-auto">{embed}</pre>
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
          className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-accent"
        >
          <span className="material-icons text-base">{copied ? 'check' : 'content_copy'}</span>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </section>
    </div>
  );
}
