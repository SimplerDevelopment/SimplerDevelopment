'use client';

// ─── HtmlRenderFullJson — copy/paste the entire block (schema + content) ────
// One textarea with the JSON, plus Copy and Apply buttons. Apply validates the
// payload and replaces html/fields/loop/values/width on the current block.

import React, { useState, useEffect, useRef } from 'react';
import type { HtmlRenderBlock, HtmlRenderField, HtmlRenderLoop } from '@/types/blocks';

export function HtmlRenderFullJson({
  block,
  onApply,
}: {
  block: HtmlRenderBlock;
  onApply: (updates: Partial<HtmlRenderBlock>) => void;
}) {
  const exported = useRef('');
  exported.current = JSON.stringify(
    {
      version: 1,
      type: 'html-render',
      width: block.width || 'full',
      html: block.html || '',
      fields: block.fields || [],
      loop: block.loop,
      values: block.values || {},
    },
    null,
    2,
  );

  const [draft, setDraft] = useState(exported.current);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keep the textarea in sync when the block changes externally (e.g. another
  // edit in the iframe). Comparing against the last-rendered exported value
  // avoids clobbering an in-progress paste the author hasn't applied yet.
  const lastSeenRef = useRef(exported.current);
  useEffect(() => {
    if (draft === lastSeenRef.current) {
      setDraft(exported.current);
    }
    lastSeenRef.current = exported.current;
  }, [block.html, block.fields, block.values, block.loop, block.width]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = draft !== exported.current;

  const handleCopy = async () => {
    setError(null);
    try {
      await navigator.clipboard.writeText(exported.current);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Clipboard write failed — select the text and copy manually.');
    }
  };

  const handleApply = () => {
    setError(null);
    let parsed: unknown;
    try { parsed = JSON.parse(draft); }
    catch (e) { setError('Invalid JSON: ' + (e instanceof Error ? e.message : 'parse failed')); return; }
    if (!parsed || typeof parsed !== 'object') { setError('Payload must be a JSON object.'); return; }
    const p = parsed as Record<string, unknown>;
    if (typeof p.html !== 'string') { setError('Missing `html` (string).'); return; }
    if (!Array.isArray(p.fields)) { setError('Missing `fields` (array).'); return; }
    if (p.values && (typeof p.values !== 'object' || Array.isArray(p.values))) {
      setError('`values` must be a plain object.'); return;
    }
    onApply({
      html: p.html,
      fields: p.fields as HtmlRenderField[],
      loop: (p.loop ?? undefined) as HtmlRenderLoop | undefined,
      values: ((p.values as Record<string, unknown>) || {}) as HtmlRenderBlock['values'],
      width: (p.width === 'contained' ? 'contained' : 'full'),
    });
  };

  return (
    <details className="rounded border border-border">
      <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground bg-accent/40 hover:bg-accent/60 flex items-center gap-1.5">
        <span className="material-icons text-sm">data_object</span>
        Full block JSON (export / import)
      </summary>
      <div className="p-3 space-y-2">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Includes the HTML template, field schema, loop, current values, and width — everything needed
          to clone this block. Edit and Apply to overwrite the current block.
        </p>
        <textarea
          value={draft}
          onChange={(e) => { setDraft(e.target.value); setError(null); }}
          spellCheck={false}
          className="block w-full h-64 font-mono text-[11px] leading-snug rounded border border-border bg-background px-2 py-1.5 text-foreground focus:border-primary focus:ring-1 focus:ring-primary"
        />
        {error && (
          <div className="rounded border border-destructive/40 bg-destructive/5 px-2 py-1.5 text-[11px] text-destructive leading-snug">
            {error}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs hover:bg-accent"
          >
            <span className="material-icons text-sm">{copied ? 'check' : 'content_copy'}</span>
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
          <button
            type="button"
            onClick={() => { setDraft(exported.current); setError(null); }}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            <span className="material-icons text-sm">restart_alt</span>
            Reset
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 rounded bg-primary text-primary-foreground px-2.5 py-1 text-xs hover:bg-primary/90 disabled:opacity-50"
          >
            <span className="material-icons text-sm">play_arrow</span>
            Apply
          </button>
        </div>
      </div>
    </details>
  );
}
