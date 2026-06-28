'use client';

// ─── HtmlRenderArrayEditor — list editor for array fields ────────────────────
// Adds, removes, and reorders items. Each item collapses by default to keep
// long lists scannable; click to expand into a per-item form. Uses the first
// non-empty richtext or text sub-field as the item's summary label.

// ─── SortableArrayItem — drag wrapper for array editor items ───────────────
// Same render-prop pattern as SortableSchemaField, just a different selector
// (item-N rather than the field name).

import React from 'react';
import { DndContext, useSensor, useSensors, PointerSensor, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HtmlRenderField } from '@/types/blocks';
import { HtmlRenderFieldInput } from './HtmlRenderFieldInput';

type AnyHtmlRenderValue = string | Array<Record<string, string>> | Record<string, string>;

function SortableArrayItem({
  id,
  children,
}: {
  id: string;
  children: (handleProps: Record<string, unknown>) => React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, setActivatorNodeRef } = useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  const handleProps: Record<string, unknown> = {
    ref: setActivatorNodeRef,
    ...attributes,
    ...listeners,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children(handleProps)}
    </div>
  );
}

export function HtmlRenderArrayEditor({
  label,
  itemFields,
  items,
  onChange,
  mediaApi,
  siteId,
}: {
  label: string;
  itemFields: HtmlRenderField[];
  items: Array<Record<string, string>>;
  onChange: (items: Array<Record<string, string>>) => void;
  mediaApi: string;
  siteId?: number;
}) {
  // FIX: useSensors hoisted to component body to comply with rules-of-hooks
  // (was previously called inline inside the conditional DndContext JSX).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const addItem = () => {
    const blank: Record<string, string> = {};
    for (const sf of itemFields) {
      blank[sf.name] = sf.default ?? '';
    }
    onChange([...items, blank]);
  };
  const removeItem = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const setItemField = (idx: number, name: string, val: AnyHtmlRenderValue) => {
    // Item sub-fields are flat strings today (one nesting level only) — coerce
    // any nested object/array values down to JSON for safety until we lift the
    // restriction.
    const flat = typeof val === 'string' ? val : JSON.stringify(val);
    const next = items.map((it, i) => (i === idx ? { ...it, [name]: flat } : it));
    onChange(next);
  };

  const summarize = (item: Record<string, string>) => {
    for (const sf of itemFields) {
      const v = item[sf.name];
      if (v && typeof v === 'string') {
        const stripped = v.replace(/<[^>]+>/g, '').trim();
        if (stripped) return stripped.slice(0, 60);
      }
    }
    return '(empty)';
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          {label} <span className="text-muted-foreground/60">({items.length})</span>
        </span>
        <button
          type="button"
          onClick={addItem}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <span className="material-icons text-sm">add</span>
          Add item
        </button>
      </div>
      {items.length === 0 ? (
        <div className="rounded border border-dashed border-border p-3 text-center text-xs text-muted-foreground">
          No items yet — click <strong>Add item</strong> to create one.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => {
            const a = e.active.id as string;
            const o = e.over?.id as string | undefined;
            if (!o || a === o) return;
            const ai = parseInt(a.replace(/^item-/, ''), 10);
            const oi = parseInt(o.replace(/^item-/, ''), 10);
            if (Number.isNaN(ai) || Number.isNaN(oi)) return;
            onChange(arrayMove(items, ai, oi));
          }}
        >
          <SortableContext items={items.map((_, idx) => `item-${idx}`)} strategy={verticalListSortingStrategy}>
            <div className="space-y-1.5">
              {items.map((item, idx) => (
                <SortableArrayItem key={`item-${idx}`} id={`item-${idx}`}>
                  {(handleProps) => (
                    <details className="rounded border border-border bg-background">
                      <summary className="cursor-pointer select-none px-2 py-1.5 flex items-center gap-1.5 text-xs hover:bg-accent/40">
                        <span
                          {...handleProps}
                          className="cursor-grab active:cursor-grabbing material-icons text-sm text-muted-foreground/60 hover:text-foreground"
                          title="Drag to reorder"
                          onClick={(e) => e.preventDefault()}
                        >drag_indicator</span>
                        <span className="flex-1 truncate text-foreground">{summarize(item)}</span>
                        <button
                          type="button"
                          title="Remove"
                          onClick={(e) => { e.preventDefault(); removeItem(idx); }}
                          className="p-0.5 rounded text-destructive hover:bg-destructive/10"
                        >
                          <span className="material-icons text-sm">delete_outline</span>
                        </button>
                      </summary>
                      <div className="p-2 space-y-2 border-t border-border">
                        {itemFields.map((sf) => (
                          <HtmlRenderFieldInput
                            key={sf.name}
                            field={sf}
                            value={item[sf.name]}
                            onChange={(val) => setItemField(idx, sf.name, val)}
                            mediaApi={mediaApi}
                            siteId={siteId}
                            siblingValues={item as Record<string, AnyHtmlRenderValue>}
                          />
                        ))}
                      </div>
                    </details>
                  )}
                </SortableArrayItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}
