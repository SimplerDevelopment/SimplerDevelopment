'use client';

// ─── HtmlRenderAddFieldMenu — quick-add presets for common field shapes ────
// Each preset is a single field with sensible defaults (and optionally
// `itemFields` for arrays/groups). The dropdown closes after selection; the
// new field is appended to the end of the list. Authors can rename or
// re-type from the schema editor afterward.

import React, { useState, useEffect, useRef } from 'react';
import type { HtmlRenderField } from '@/types/blocks';

interface AddFieldPreset {
  key: string;
  label: string;
  icon: string;
  build: (uniqueName: (base: string) => string) => HtmlRenderField;
}

const ADD_FIELD_PRESETS: AddFieldPreset[] = [
  { key: 'text', label: 'Text', icon: 'text_fields', build: (u) => ({ name: u('text'), label: '', type: 'text' }) },
  { key: 'textarea', label: 'Textarea', icon: 'subject', build: (u) => ({ name: u('textarea'), label: '', type: 'textarea' }) },
  { key: 'richtext', label: 'Rich text', icon: 'format_color_text', build: (u) => ({ name: u('body'), label: '', type: 'richtext' }) },
  { key: 'number', label: 'Number', icon: 'pin', build: (u) => ({ name: u('number'), label: '', type: 'number', step: 1 }) },
  { key: 'boolean', label: 'Toggle (boolean)', icon: 'toggle_on', build: (u) => ({ name: u('toggle'), label: '', type: 'boolean' }) },
  { key: 'image', label: 'Image', icon: 'image', build: (u) => ({ name: u('image'), label: '', type: 'image' }) },
  { key: 'url', label: 'URL', icon: 'link', build: (u) => ({ name: u('url'), label: '', type: 'url' }) },
  { key: 'link', label: 'Link (URL + label + target)', icon: 'open_in_new', build: (u) => ({ name: u('link'), label: '', type: 'link' }) },
  { key: 'select', label: 'Select dropdown', icon: 'arrow_drop_down_circle', build: (u) => ({ name: u('select'), label: '', type: 'select', options: ['Option A', 'Option B'] }) },
  { key: 'radio', label: 'Radio buttons', icon: 'radio_button_checked', build: (u) => ({ name: u('radio'), label: '', type: 'radio', options: ['Option A', 'Option B'] }) },
  { key: 'color', label: 'Color', icon: 'palette', build: (u) => ({ name: u('color'), label: '', type: 'color' }) },
  { key: 'date', label: 'Date', icon: 'event', build: (u) => ({ name: u('date'), label: '', type: 'date' }) },
  { key: 'datetime', label: 'Date & time', icon: 'schedule', build: (u) => ({ name: u('datetime'), label: '', type: 'datetime' }) },
  { key: 'post', label: 'Post (pick from this site)', icon: 'article', build: (u) => ({ name: u('post'), label: '', type: 'post' }) },
  { key: 'array', label: 'Repeater (array)', icon: 'view_list', build: (u) => ({ name: u('items'), label: '', type: 'array', itemFields: [{ name: 'label', type: 'text' }] }) },
  { key: 'group', label: 'Group (single nested object)', icon: 'group_work', build: (u) => ({ name: u('group'), label: '', type: 'group', itemFields: [{ name: 'title', type: 'text' }] }) },
  { key: 'tab', label: 'Tab (panel section)', icon: 'tab', build: (u) => ({ name: u('tab'), label: 'New Tab', type: 'tab' }) },
  { key: 'gallery', label: 'Gallery (image array)', icon: 'collections', build: (u) => ({ name: u('gallery'), label: 'Gallery', type: 'array', itemFields: [{ name: 'src', type: 'image' }, { name: 'alt', type: 'text' }, { name: 'caption', type: 'text' }] }) },
];

export function HtmlRenderAddFieldMenu({
  existingNames,
  onAdd,
}: {
  existingNames: string[];
  onAdd: (field: HtmlRenderField) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const uniqueName = (base: string): string => {
    if (!existingNames.includes(base)) return base;
    let i = 2;
    while (existingNames.includes(`${base}_${i}`)) i++;
    return `${base}_${i}`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-primary hover:underline py-2 rounded border border-dashed border-border"
      >
        <span className="material-icons text-sm">add</span>
        Add field
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-20 mt-1 max-h-64 overflow-y-auto rounded border border-border bg-card shadow-lg">
          {ADD_FIELD_PRESETS.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                onAdd(p.build(uniqueName));
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent text-left"
            >
              <span className="material-icons text-sm text-muted-foreground">{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
