'use client';

// ─── HtmlRenderTabbedForm — splits the values form into tabs ────────────────
// Walks the field list once. Each `tab` field starts a new section; subsequent
// non-tab fields belong to that tab. Fields before the first tab go into a
// default "General" tab. Single-tab forms render flat (no tab strip).

import React, { useState } from 'react';
import type { HtmlRenderField } from '@/types/blocks';
import { HtmlRenderFieldInput } from './HtmlRenderFieldInput';

type HtmlRenderValues = Record<string, string | Array<Record<string, string>> | Record<string, string>>;
type AnyHtmlRenderValue = string | Array<Record<string, string>> | Record<string, string>;

export function HtmlRenderTabbedForm({
  fields,
  values,
  onChange,
  mediaApi,
  siteId,
}: {
  fields: HtmlRenderField[];
  values: HtmlRenderValues;
  onChange: (name: string, value: AnyHtmlRenderValue) => void;
  mediaApi: string;
  siteId?: number;
}) {
  // Group fields into tabs
  const tabs: Array<{ key: string; label: string; fields: HtmlRenderField[] }> = [];
  let current: { key: string; label: string; fields: HtmlRenderField[] } = {
    key: '__default',
    label: 'General',
    fields: [],
  };
  for (const f of fields) {
    if (f.type === 'tab') {
      if (current.fields.length > 0) tabs.push(current);
      current = { key: f.name, label: f.label || f.name, fields: [] };
    } else {
      current.fields.push(f);
    }
  }
  if (current.fields.length > 0 || tabs.length === 0) tabs.push(current);

  const [activeKey, setActiveKey] = useState(tabs[0].key);
  const active = tabs.find(t => t.key === activeKey) || tabs[0];

  // Single-tab → render flat (no tab strip noise)
  if (tabs.length === 1) {
    return (
      <div className="p-3 space-y-3">
        {active.fields.map((f) => (
          <HtmlRenderFieldInput
            key={f.name}
            field={f}
            value={values[f.name] as AnyHtmlRenderValue | undefined}
            onChange={(v) => onChange(f.name, v)}
            mediaApi={mediaApi}
            siteId={siteId}
            siblingValues={values as Record<string, AnyHtmlRenderValue>}
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      <div className="flex border-b border-border bg-muted/20 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActiveKey(t.key)}
            className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
              t.key === activeKey
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="p-3 space-y-3">
        {active.fields.map((f) => (
          <HtmlRenderFieldInput
            key={f.name}
            field={f}
            value={values[f.name] as AnyHtmlRenderValue | undefined}
            onChange={(v) => onChange(f.name, v)}
            mediaApi={mediaApi}
            siteId={siteId}
            siblingValues={values as Record<string, AnyHtmlRenderValue>}
          />
        ))}
      </div>
    </div>
  );
}
