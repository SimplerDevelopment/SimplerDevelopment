'use client';

/**
 * HtmlRenderEditor — settings-panel surface for the `html-render` block.
 *
 * Three sections, in order:
 *   1. Values form — what authors edit day-to-day. Tab fields split the form
 *      into ACF-style tabbed sections via `HtmlRenderTabbedForm`.
 *   2. Loop source — exposed when the template contains `data-loop="posts"`.
 *      Repeats the marked element once per matching post.
 *   3. Field schema — power-user view to rename labels, override types, set
 *      help text / validation / conditional logic, reorder, copy/paste/import/
 *      export the schema across blocks.
 *   4. HTML template — CodeMirror editor (with full-screen modal). Detection
 *      runs on every change so the schema stays in sync.
 *
 * Also exports `ImagePickerModal` for the iframe click-to-swap flow — opened
 * from `VisualEditorShell` when the iframe sends `REQUEST_IMAGE_PICKER`. Lives
 * here because it's coupled to the same MediaPicker + writeback path.
 *
 * Extracted from `VisualEditorShell.tsx` to keep the shell focused on the
 * iframe orchestration / per-block dispatch table; this file owns everything
 * specific to the html-render block type.
 */

import React, { useState, useEffect, useRef } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor, closestCenter } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import MediaPicker from '@/components/admin/MediaPicker';
import { HtmlTemplateEditor } from '@/components/blocks/visual/HtmlTemplateEditor';
import { reconcileFields, countFieldUsage, renameFieldInTemplate } from '@/lib/blocks/html-render-template';
import { validateField, isFieldVisible } from '@/lib/blocks/html-render-validation';
import {
  buildSchemaSnapshot,
  applySchemaSnapshot,
  writeSchemaClipboard,
  readSchemaClipboard,
  downloadSchemaJson,
  parseImportedSchema,
  type HtmlRenderSchema,
} from '@/lib/blocks/html-render-schema';
import type { Block, HtmlRenderBlock, HtmlRenderField, HtmlRenderLoop, HtmlRenderConditional } from '@/types/blocks';

import { Field, SelectField, NumberField, CheckboxField, TextareaField, RichTextField, ColorField } from './panel-fields';

type HtmlRenderValues = Record<string, string | Array<Record<string, string>> | Record<string, string>>;
type AnyHtmlRenderValue = string | Array<Record<string, string>> | Record<string, string>;

// ─── HtmlRenderEditor ────────────────────────────────────────────────────────
// Editing the template auto-reconciles the fields list (new vars added,
// removed vars dropped) but preserves the author's per-field customisations
// via reconcileFields().

export function HtmlRenderEditor({
  block,
  onUpdate,
  siteId,
}: {
  block: Block;
  onUpdate: (updates: Partial<Block>) => void;
  siteId?: number;
}) {
  const b = block as unknown as Record<string, unknown>;
  const html = (b.html as string) || '';
  const fields = (b.fields as HtmlRenderField[] | undefined) || [];
  const values = (b.values as HtmlRenderValues | undefined) || {};
  const loop = (b.loop as HtmlRenderLoop | undefined);
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';
  const hasLoopRegion = /\bdata-loop="posts"/.test(html);

  const setHtml = (next: string) => {
    // Re-detect fields whenever the template changes; preserves any
    // author-tweaked label/type/options on existing fields.
    const reconciled = reconcileFields(next, fields);
    onUpdate({ html: next, fields: reconciled } as Partial<Block>);
  };

  const setValue = (name: string, value: string | Array<Record<string, string>> | Record<string, string>) => {
    onUpdate({ values: { ...values, [name]: value } } as Partial<Block>);
  };

  const setField = (idx: number, patch: Partial<HtmlRenderField>) => {
    const next = fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onUpdate({ fields: next } as Partial<Block>);
  };

  const setLoop = (patch: Partial<HtmlRenderLoop> | null) => {
    if (patch === null) {
      onUpdate({ loop: undefined } as Partial<Block>);
      return;
    }
    const next: HtmlRenderLoop = {
      source: 'posts',
      postType: '',
      limit: 3,
      orderBy: 'recent',
      ...(loop || {}),
      ...patch,
    };
    onUpdate({ loop: next } as Partial<Block>);
  };

  return (
    <>
      <SelectField
        label="Width"
        value={(b.width as string) || 'full'}
        options={['full', 'contained']}
        onChange={(v) => onUpdate({ width: v } as Partial<Block>)}
      />

      {/* Values form — what authors actually edit day-to-day. Above the
          template editor since it's the most-used surface. Tab fields split
          the form into tabbed sections (ACF-style). */}
      {fields.length > 0 && (
        <details open className="rounded border border-border">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground bg-accent/40 hover:bg-accent/60 flex items-center gap-1.5">
            <span className="material-icons text-sm">tune</span>
            Content
          </summary>
          <HtmlRenderTabbedForm
            fields={fields}
            values={values}
            onChange={(name, val) => setValue(name, val)}
            mediaApi={mediaApi}
            siteId={siteId}
          />
        </details>
      )}

      {/* Loop source — exposes when the template contains a data-loop region.
          Repeats the marked element once per matching post so authors can
          build dynamic "Related X" lists without leaving the html-render
          model. Inside the loop, {{post.title}} / {{post.url}} /
          {{post.coverImage}} / {{post.values.X}} resolve per item. */}
      {(hasLoopRegion || loop) && (
        <details open={!loop?.postType} className="rounded border border-border">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground bg-accent/40 hover:bg-accent/60 flex items-center gap-1.5">
            <span className="material-icons text-sm">dynamic_feed</span>
            Loop source {loop?.postType ? `— ${loop.postType}` : ''}
          </summary>
          <div className="p-3 space-y-3">
            {!hasLoopRegion && (
              <div className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-900 dark:text-amber-100 leading-snug">
                No <code className="font-mono">data-loop=&quot;posts&quot;</code> element in the template. Add{' '}
                <code className="font-mono">data-loop=&quot;posts&quot;</code> to the element you want repeated.
              </div>
            )}
            <Field
              label="Post type slug"
              value={loop?.postType || ''}
              onChange={(v) => setLoop({ postType: v })}
            />
            <div className="grid grid-cols-2 gap-2">
              <NumberField label="Limit" value={loop?.limit ?? 3} min={1} max={24} onChange={(v) => setLoop({ limit: v })} />
              <SelectField label="Order" value={loop?.orderBy || 'recent'} options={['recent', 'oldest', 'title']} onChange={(v) => setLoop({ orderBy: v as HtmlRenderLoop['orderBy'] })} />
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Inside the loop element use{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.title}}'}</code>,{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.url}}'}</code>,{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.coverImage}}'}</code>,{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.excerpt}}'}</code>, or{' '}
              <code className="bg-accent/40 px-1 rounded">{'{{post.values.X}}'}</code> to pull a custom field from the target post.
            </p>
            {loop && (
              <button
                type="button"
                onClick={() => setLoop(null)}
                className="text-xs text-destructive hover:underline"
              >
                Disable loop (keep markup)
              </button>
            )}
          </div>
        </details>
      )}

      {/* Field schema — for power users to rename labels, override types, set
          help text, add tabs, or reorder. Adding/removing schema-only fields
          (tabs, group containers without HTML markers) is also supported here.
          Toolbar at top has Copy / Paste / Export / Import schema actions for
          reusing field definitions across blocks (and across browsers via JSON). */}
      {fields.length > 0 && (
        <details className="rounded border border-border">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground bg-accent/40 hover:bg-accent/60 flex items-center gap-1.5">
            <span className="material-icons text-sm">schema</span>
            Field schema ({fields.length})
          </summary>
          <HtmlRenderSchemaActions
            block={block as HtmlRenderBlock}
            fields={fields}
            onApply={(updates) => onUpdate(updates as Partial<Block>)}
          />
          <DndContext
            sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))}
            collisionDetection={closestCenter}
            onDragEnd={(e) => {
              const a = e.active.id as string;
              const o = e.over?.id as string | undefined;
              if (!o || a === o) return;
              const ai = fields.findIndex(f => f.name === a);
              const oi = fields.findIndex(f => f.name === o);
              if (ai < 0 || oi < 0) return;
              onUpdate({ fields: arrayMove(fields, ai, oi) } as Partial<Block>);
            }}
          >
            <SortableContext items={fields.map(f => f.name)} strategy={verticalListSortingStrategy}>
              <div className="p-3 space-y-3">
                {fields.map((f, i) => {
                  const usage = countFieldUsage(html, f.name);
                  return (
                  <SortableSchemaField key={f.name} id={f.name}>
                  {(dragHandleProps) => (
                  <div className="rounded border border-border p-2 space-y-2 bg-card">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        title="Drag to reorder"
                        className="cursor-grab active:cursor-grabbing p-0.5 rounded text-muted-foreground/60 hover:bg-accent hover:text-foreground"
                        {...dragHandleProps}
                      >
                        <span className="material-icons text-sm">drag_indicator</span>
                      </button>
                      <code className="flex-1 text-xs text-muted-foreground truncate" title={f.name}>{f.name}</code>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      usage === 0
                        ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                        : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    }`}
                    title={usage === 0 ? 'No template references — add {{' + f.name + '}} or data-field="' + f.name + '" to use this field' : `Referenced ${usage}× in the template`}
                  >
                    {usage === 0 ? 'unused' : `${usage}×`}
                  </span>
                  <button
                    type="button"
                    title="Rename field key (also rewrites template references)"
                    onClick={() => {
                      const next = window.prompt(`Rename field key "${f.name}" to:`, f.name);
                      if (!next || next === f.name) return;
                      if (!/^[a-zA-Z_][a-zA-Z0-9_-]*$/.test(next)) { window.alert('Field keys must start with a letter/underscore and contain only letters, numbers, hyphens, or underscores.'); return; }
                      if (fields.some(o => o.name === next)) { window.alert(`A field named "${next}" already exists.`); return; }
                      const newFields = fields.map((fld, idx) => idx === i ? { ...fld, name: next } : fld);
                      const newValues: HtmlRenderValues = { ...values };
                      if (f.name in newValues) {
                        newValues[next] = newValues[f.name];
                        delete newValues[f.name];
                      }
                      const { template: newHtml, replacements } = renameFieldInTemplate(html, f.name, next);
                      onUpdate({ fields: newFields, values: newValues, html: newHtml } as Partial<Block>);
                      if (replacements > 0) console.log(`[html-render] renamed ${f.name} → ${next} (${replacements} template refs updated)`);
                    }}
                    className="p-0.5 rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <span className="material-icons text-sm">edit</span>
                  </button>
                      <button
                        type="button"
                        title="Delete field (also clears its value; you may want to remove the matching {{name}} or data-field from the template)"
                        onClick={() => {
                          const next = fields.filter((_, idx) => idx !== i);
                          const nextValues = { ...values };
                          delete nextValues[f.name];
                          onUpdate({ fields: next, values: nextValues } as Partial<Block>);
                        }}
                        className="p-0.5 rounded text-destructive hover:bg-destructive/10"
                      >
                        <span className="material-icons text-sm">delete_outline</span>
                      </button>
                    </div>
                    <Field label="Label" value={f.label || ''} onChange={(val) => setField(i, { label: val })} />
                <SelectField
                  label="Type"
                  value={f.type}
                  options={['text', 'textarea', 'number', 'richtext', 'boolean', 'url', 'image', 'color', 'select', 'radio', 'date', 'datetime', 'link', 'post', 'array', 'group', 'tab']}
                  onChange={(val) => setField(i, { type: val as HtmlRenderField['type'] })}
                />
                {(f.type === 'array' || f.type === 'group') && (
                  <HtmlRenderSubFieldsEditor
                    parentField={f}
                    onChange={(next) => setField(i, { itemFields: next })}
                  />
                )}
                {(f.type === 'select' || f.type === 'radio') && (
                  <TextareaField
                    label="Options (one per line)"
                    value={(f.options || []).join('\n')}
                    onChange={(val) => setField(i, { options: val.split('\n').map((s) => s.trim()).filter(Boolean) })}
                    rows={3}
                  />
                )}
                {f.type === 'post' && (
                  <Field
                    label="Restrict to post type (optional)"
                    value={f.postType || ''}
                    onChange={(val) => setField(i, { postType: val || undefined })}
                  />
                )}
                {f.type === 'number' && (
                  <div className="grid grid-cols-3 gap-2">
                    <NumberField label="Min" value={f.min ?? 0} onChange={(v) => setField(i, { min: v })} />
                    <NumberField label="Max" value={f.max ?? 0} onChange={(v) => setField(i, { max: v })} />
                    <NumberField label="Step" value={f.step ?? 1} onChange={(v) => setField(i, { step: v })} />
                  </div>
                )}
                {f.type !== 'tab' && (
                  <Field label="Default" value={f.default || ''} onChange={(val) => setField(i, { default: val })} />
                )}
                <Field label="Help text" value={f.help || ''} onChange={(val) => setField(i, { help: val || undefined })} />

                {/* Validation rules */}
                {f.type !== 'tab' && f.type !== 'array' && f.type !== 'group' && (
                  <details className="border-t border-border pt-2">
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground hover:text-foreground">Validation</summary>
                    <div className="pt-2 space-y-2">
                      <CheckboxField label="Required" checked={f.required} onChange={(v) => setField(i, { required: v || undefined })} />
                      {(f.type === 'text' || f.type === 'textarea' || f.type === 'richtext') && (
                        <div className="grid grid-cols-2 gap-2">
                          <NumberField label="Min length" value={f.minLength ?? 0} onChange={(v) => setField(i, { minLength: v || undefined })} />
                          <NumberField label="Max length" value={f.maxLength ?? 0} onChange={(v) => setField(i, { maxLength: v || undefined })} />
                        </div>
                      )}
                      {(f.type === 'text' || f.type === 'url') && (
                        <Field label="Pattern (regex)" value={f.pattern || ''} onChange={(v) => setField(i, { pattern: v || undefined })} />
                      )}
                      <Field label="Custom error message" value={f.errorMessage || ''} onChange={(v) => setField(i, { errorMessage: v || undefined })} />
                    </div>
                  </details>
                )}

                {/* Conditional show/hide */}
                {f.type !== 'tab' && (
                  <details className="border-t border-border pt-2">
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-muted-foreground hover:text-foreground">
                      Conditional logic{f.conditional ? ' (active)' : ''}
                    </summary>
                    <div className="pt-2 space-y-2">
                      <SelectField
                        label="Show this field when"
                        value={f.conditional ? 'enabled' : 'always'}
                        options={['always', 'enabled']}
                        onChange={(v) => {
                          if (v === 'always') setField(i, { conditional: undefined });
                          else if (!f.conditional) setField(i, { conditional: { field: '', operator: 'truthy' } });
                        }}
                      />
                      {f.conditional && (
                        <>
                          <SelectField
                            label="Field"
                            value={f.conditional.field}
                            options={['', ...fields.filter(other => other.name !== f.name && other.type !== 'tab').map(other => other.name)]}
                            onChange={(v) => setField(i, { conditional: { ...f.conditional!, field: v } })}
                          />
                          <SelectField
                            label="Operator"
                            value={f.conditional.operator}
                            options={['truthy', 'falsy', 'eq', 'neq', 'in', 'notIn']}
                            onChange={(v) => setField(i, { conditional: { ...f.conditional!, operator: v as HtmlRenderConditional['operator'] } })}
                          />
                          {(f.conditional.operator === 'eq' || f.conditional.operator === 'neq') && (
                            <Field label="Value" value={f.conditional.value || ''} onChange={(v) => setField(i, { conditional: { ...f.conditional!, value: v } })} />
                          )}
                          {(f.conditional.operator === 'in' || f.conditional.operator === 'notIn') && (
                            <Field label="Values (pipe-delimited, e.g. a|b|c)" value={f.conditional.value || ''} onChange={(v) => setField(i, { conditional: { ...f.conditional!, value: v } })} />
                          )}
                        </>
                      )}
                    </div>
                  </details>
                )}
                  </div>
                  )}
                  </SortableSchemaField>
                  );
                })}

                {/* Add field — quick presets for common shapes. The "Empty…" entry
                    creates a bare text field; the rest insert a typed field with
                    sensible defaults so authors can start with the right input. */}
                <HtmlRenderAddFieldMenu
                  existingNames={fields.map(f => f.name)}
                  onAdd={(field) => onUpdate({ fields: [...fields, field] } as Partial<Block>)}
                />
              </div>
            </SortableContext>
          </DndContext>
        </details>
      )}

      {/* Template editor — the source HTML. Detection runs on every change
          so the fields list above stays in sync. CodeMirror with HTML syntax
          highlighting + an "Expand" button that opens a full-screen modal
          with the same editor for serious editing sessions. */}
      <details className="rounded border border-border">
        <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-foreground bg-accent/40 hover:bg-accent/60 flex items-center gap-1.5">
          <span className="material-icons text-sm">code</span>
          HTML template
        </summary>
        <div className="p-3 space-y-2">
          <HtmlTemplateEditor value={html} onChange={setHtml} />
          <p className="text-[11px] text-muted-foreground leading-snug">
            <code className="bg-accent/40 px-1 rounded">{'{{name}}'}</code> for attribute/text substitution.{' '}
            <code className="bg-accent/40 px-1 rounded">data-field=&quot;name&quot;</code> on an element to make its inner HTML editable inline.{' '}
            <code className="bg-accent/40 px-1 rounded">data-repeat=&quot;name&quot;</code> repeats per array item.{' '}
            <code className="bg-accent/40 px-1 rounded">data-group=&quot;name&quot;</code> wraps a single nested object.{' '}
            Inside repeats/groups: <code className="bg-accent/40 px-1 rounded">{'{{name.subfield}}'}</code> +{' '}
            <code className="bg-accent/40 px-1 rounded">data-field=&quot;subfield&quot;</code>.
          </p>
        </div>
      </details>

      {/* Full block JSON — html + fields + loop + values + width in one blob.
          Copy/paste between blocks, environments, or into source control.
          Distinct from the schema export above, which intentionally drops
          `values` so recipients start blank. */}
      <HtmlRenderFullJson
        block={block as HtmlRenderBlock}
        onApply={(updates) => onUpdate(updates as Partial<Block>)}
      />
    </>
  );
}

// ─── HtmlRenderFullJson — copy/paste the entire block (schema + content) ────
// One textarea with the JSON, plus Copy and Apply buttons. Apply validates the
// payload and replaces html/fields/loop/values/width on the current block.

function HtmlRenderFullJson({
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

// ─── HtmlRenderFieldInput — type-aware single-field editor ───────────────────
// Renders the appropriate input for one field. Recursive: array & group
// fields render nested forms via this same component. Help text shows under
// the label when set.

function HtmlRenderFieldInput({
  field,
  value,
  onChange,
  mediaApi,
  siteId,
  siblingValues,
}: {
  field: HtmlRenderField;
  value: AnyHtmlRenderValue | undefined;
  onChange: (v: AnyHtmlRenderValue) => void;
  mediaApi: string;
  siteId?: number;
  /** Sibling values at this nesting level — used to evaluate conditional
   *  visibility (`field.conditional`) and to scope error messages. Falls
   *  back to an empty record when omitted (the field is always visible). */
  siblingValues?: Record<string, AnyHtmlRenderValue>;
}) {
  // Conditional visibility — when the rule fails, the field is suppressed.
  // Doesn't affect template rendering or stored values; purely UX.
  if (!isFieldVisible(field, (siblingValues || {}) as Record<string, string | Array<Record<string, string>> | Record<string, string> | undefined>)) return null;

  const baseLabel = field.label || field.name;
  // Required fields get a visible asterisk in the label so authors don't have
  // to read the validation error to know what's mandatory.
  const label = field.required ? `${baseLabel} *` : baseLabel;
  const error = validateField(field, value);
  const helpEl = field.help ? <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{field.help}</p> : null;
  const errorEl = error ? <p className="text-[11px] text-destructive leading-snug mt-0.5">{error}</p> : null;
  const wrap = (input: React.ReactNode) => (
    <div className={error ? 'pc-field-error' : undefined}>
      {input}
      {helpEl}
      {errorEl}
    </div>
  );

  // ── Composite types ────────────────────────────────────────────────────
  if (field.type === 'tab') {
    // Tab fields are pure organizers — they carry no value. Render handled
    // by the parent (which groups successive tabs into a tabbed UI).
    return null;
  }

  if (field.type === 'array') {
    const items: Array<Record<string, string>> = Array.isArray(value) ? value : [];
    return (
      <div>
        <HtmlRenderArrayEditor
          label={label}
          itemFields={field.itemFields || []}
          items={items}
          onChange={(next) => onChange(next)}
          mediaApi={mediaApi}
          siteId={siteId}
        />
        {helpEl}
      </div>
    );
  }

  if (field.type === 'group' || field.type === 'link') {
    const obj: Record<string, string> = (value && !Array.isArray(value) && typeof value === 'object')
      ? (value as Record<string, string>) : {};
    // `link` is a group preset with hard-coded sub-fields. We materialize them
    // here so authors don't have to populate itemFields by hand, while keeping
    // the storage shape identical to a regular group.
    const subFields: HtmlRenderField[] = field.type === 'link'
      ? [
          { name: 'url', label: 'URL', type: 'url' },
          { name: 'label', label: 'Label', type: 'text' },
          { name: 'target', label: 'Open in', type: 'select', options: ['_self', '_blank'], default: '_self' },
        ]
      : (field.itemFields || []);
    return (
      <div className="space-y-1.5">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
        {helpEl}
        <div className="rounded border border-border p-2 space-y-2">
          {subFields.map((sf) => (
            <HtmlRenderFieldInput
              key={sf.name}
              field={sf}
              value={obj[sf.name]}
              onChange={(val) => onChange({ ...obj, [sf.name]: typeof val === 'string' ? val : '' })}
              mediaApi={mediaApi}
              siteId={siteId}
              siblingValues={obj as Record<string, AnyHtmlRenderValue>}
            />
          ))}
          {field.type === 'group' && subFields.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No sub-fields detected. Add <code className="font-mono">data-field</code> elements or <code className="font-mono">{'{{' + field.name + '.X}}'}</code> placeholders inside the group&apos;s <code className="font-mono">data-group</code> wrapper.</p>
          )}
        </div>
        {field.type === 'link' && (
          <p className="text-[11px] text-muted-foreground">
            Use <code className="font-mono">{'{{' + field.name + '.url}}'}</code>, <code className="font-mono">{'{{' + field.name + '.label}}'}</code>, <code className="font-mono">{'{{' + field.name + '.target}}'}</code> in the template.
          </p>
        )}
      </div>
    );
  }

  // ── Scalar inputs ──────────────────────────────────────────────────────
  const v = typeof value === 'string' ? value : (field.default ?? '');

  if (field.type === 'boolean') {
    return wrap(<CheckboxField label={label} checked={v === 'true'} onChange={(b) => onChange(b ? 'true' : 'false')} />);
  }
  if (field.type === 'number') {
    return wrap(
      <NumberField
        label={label}
        value={v ? Number(v) : 0}
        min={field.min}
        max={field.max}
        step={field.step ?? 1}
        onChange={(n) => onChange(String(n))}
      />,
    );
  }
  if (field.type === 'textarea') {
    return wrap(<TextareaField label={label} value={v} onChange={(val) => onChange(val)} rows={4} />);
  }
  if (field.type === 'richtext') {
    return wrap(<RichTextField label={label} value={v} onChange={(val) => onChange(val)} />);
  }
  if (field.type === 'image') {
    // MediaPicker renders its own thumbnail when a value is set — no need to
    // duplicate it above. Just show the label + the picker.
    return wrap(
      <div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <MediaPicker value={v} onChange={(val) => onChange(val)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} />
      </div>,
    );
  }
  if (field.type === 'color') {
    return wrap(<ColorField label={label} value={v} onChange={(val) => onChange(val)} />);
  }
  if (field.type === 'select' && field.options?.length) {
    return wrap(<SelectField label={label} value={v} options={field.options} onChange={(val) => onChange(val)} />);
  }
  if (field.type === 'radio' && field.options?.length) {
    return wrap(
      <div>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <div className="mt-1 space-y-1">
          {field.options.map(opt => (
            <label key={opt} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name={`field-${field.name}`}
                value={opt}
                checked={v === opt}
                onChange={() => onChange(opt)}
                className="h-3.5 w-3.5 text-primary"
              />
              <span className="text-foreground">{opt}</span>
            </label>
          ))}
        </div>
      </div>,
    );
  }
  if (field.type === 'date' || field.type === 'datetime') {
    const inputType = field.type === 'date' ? 'date' : 'datetime-local';
    return wrap(
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <input
          type={inputType}
          value={v}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </label>,
    );
  }
  if (field.type === 'post') {
    return wrap(<HtmlRenderPostPicker label={label} value={v} postType={field.postType} onChange={onChange} siteId={siteId} />);
  }
  if (field.type === 'url') {
    return wrap(<HtmlRenderUrlAutocomplete label={label} value={v} onChange={(val) => onChange(val)} siteId={siteId} />);
  }
  return wrap(<Field label={label} value={v} onChange={(val) => onChange(val)} />);
}

// ─── HtmlRenderPostPicker — fetches posts on this site for the `post` type ──
// Exposes a search + dropdown UI. Stores the selected post id as a string.
// Server-side resolution lives in lib/blocks/html-render-loops.ts (it turns
// the saved id into a `{ id, title, slug, url, ... }` record at render time
// so {{name.title}} / {{name.url}} resolve.)

interface PickerPostOption { id: number; title: string; slug: string; postType: string; }

function HtmlRenderPostPicker({
  label,
  value,
  postType,
  onChange,
  siteId,
}: {
  label: string;
  value: string;
  postType?: string;
  onChange: (v: string) => void;
  siteId?: number;
}) {
  const [options, setOptions] = useState<PickerPostOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!siteId) {
      setError('No site context — picker disabled');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const url = `/api/portal/cms/websites/${siteId}/posts/picker` + (postType ? `?postType=${encodeURIComponent(postType)}` : '');
        const res = await fetch(url);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) setOptions(json.data);
        else setError(json?.message || json?.error || 'Failed to load posts');
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load posts');
      }
    })();
    return () => { cancelled = true; };
  }, [postType, siteId]);

  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {error ? (
        <div className="mt-1 text-xs text-destructive">{error}</div>
      ) : !options ? (
        <div className="mt-1 text-xs text-muted-foreground">Loading posts…</div>
      ) : (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        >
          <option value="">— Select a post —</option>
          {options.map(o => (
            <option key={o.id} value={String(o.id)}>{o.title} ({o.postType})</option>
          ))}
        </select>
      )}
      {!postType && (
        <p className="text-[11px] text-muted-foreground/80 mt-0.5">All post types. Set a postType in the schema to filter.</p>
      )}
    </label>
  );
}

// ─── HtmlRenderUrlAutocomplete — URL field with internal-link suggestions ───
// Plain URL input with a dropdown of internal links the author can drop in:
// CMS posts on the active site, the client's other pitch decks, booking pages,
// and CRM proposals. Always allows freeform typing — the suggestions are an
// accelerator, not a constraint.
//
// Suggestions are fetched once on mount from /api/portal/url-suggestions and
// filtered client-side as the author types.

interface UrlSuggestion { id: number; label: string; url: string; sublabel?: string }
interface UrlSuggestionGroups {
  posts: UrlSuggestion[];
  decks: UrlSuggestion[];
  bookings: UrlSuggestion[];
  proposals: UrlSuggestion[];
}

const SUGGESTION_GROUP_META: Array<{ key: keyof UrlSuggestionGroups; icon: string; label: string }> = [
  { key: 'posts', icon: 'description', label: 'Pages' },
  { key: 'decks', icon: 'slideshow', label: 'Pitch Decks' },
  { key: 'bookings', icon: 'event', label: 'Booking Pages' },
  { key: 'proposals', icon: 'request_quote', label: 'Proposals' },
];

function HtmlRenderUrlAutocomplete({
  label,
  value,
  onChange,
  siteId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  siteId?: number;
}) {
  const [groups, setGroups] = useState<UrlSuggestionGroups | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = siteId ? `?siteId=${siteId}` : '';
        const res = await fetch(`/api/portal/url-suggestions${qs}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && json.data) setGroups(json.data as UrlSuggestionGroups);
      } catch {
        /* leave groups as null — input still works as plain text */
      }
    })();
    return () => { cancelled = true; };
  }, [siteId]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const q = value.trim().toLowerCase();
  const filteredGroups: UrlSuggestionGroups | null = groups
    ? {
        posts: filterSuggestions(groups.posts, q),
        decks: filterSuggestions(groups.decks, q),
        bookings: filterSuggestions(groups.bookings, q),
        proposals: filterSuggestions(groups.proposals, q),
      }
    : null;

  const totalCount = filteredGroups
    ? filteredGroups.posts.length + filteredGroups.decks.length + filteredGroups.bookings.length + filteredGroups.proposals.length
    : 0;

  return (
    <div ref={containerRef} className="relative">
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="https:// or pick a link below"
          className="mt-1 block w-full rounded border border-border px-2.5 py-1.5 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
        />
      </label>
      {open && filteredGroups && totalCount > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-y-auto rounded border border-border bg-popover shadow-lg">
          {SUGGESTION_GROUP_META.map(({ key, icon, label: groupLabel }) => {
            const items = filteredGroups[key];
            if (items.length === 0) return null;
            return (
              <div key={key} className="py-1">
                <div className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <span className="material-icons text-sm">{icon}</span>
                  {groupLabel}
                </div>
                {items.map((item) => (
                  <button
                    type="button"
                    key={`${key}-${item.id}`}
                    onMouseDown={(e) => { e.preventDefault(); onChange(item.url); setOpen(false); }}
                    className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-foreground">{item.label}</div>
                      <div className="truncate text-[11px] text-muted-foreground font-mono">{item.url}</div>
                    </div>
                    {item.sublabel && (
                      <span className="text-[10px] text-muted-foreground/80 mt-0.5 shrink-0">{item.sublabel}</span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function filterSuggestions(items: UrlSuggestion[], q: string): UrlSuggestion[] {
  if (!q) return items.slice(0, 8);
  return items
    .filter(it => it.label.toLowerCase().includes(q) || it.url.toLowerCase().includes(q))
    .slice(0, 8);
}

// ─── HtmlRenderArrayEditor — list editor for array fields ────────────────────
// Adds, removes, and reorders items. Each item collapses by default to keep
// long lists scannable; click to expand into a per-item form. Uses the first
// non-empty richtext or text sub-field as the item's summary label.

function HtmlRenderArrayEditor({
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
          sensors={useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))}
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

// ─── SortableArrayItem — drag wrapper for array editor items ───────────────
// Same render-prop pattern as SortableSchemaField, just a different selector
// (item-N rather than the field name).

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

// ─── HtmlRenderSchemaActions — copy / paste / export / import schema ───────
// Lives at the top of the Field-schema section. Authors can:
//   - Copy the current block's schema (HTML + fields + loop) to a localStorage
//     clipboard. Cross-tab: copy in one editor, paste in another.
//   - Paste — overwrites the current block's schema with the clipboard, BLANKS
//     values (recipient fills in their own content). Confirms first.
//   - Export — downloads the schema as a JSON file (cross-browser sharing,
//     git-trackable, version-controlled).
//   - Import — file picker that accepts the JSON exports above.

function HtmlRenderSchemaActions({
  block,
  fields,
  onApply,
}: {
  block: HtmlRenderBlock;
  fields: HtmlRenderField[];
  onApply: (updates: Partial<HtmlRenderBlock>) => void;
}) {
  const [clipboard, setClipboard] = useState<HtmlRenderSchema | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Read clipboard once on mount + listen for storage events so a copy in
  // another tab/window updates this UI's "paste" enabled state.
  useEffect(() => {
    setClipboard(readSchemaClipboard());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'sd-html-render-schema-clipboard') setClipboard(readSchemaClipboard());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const sourceLabel = block.label || (fields.length > 0 ? fields[0].name : 'html-render');

  const handleCopy = () => {
    const snapshot = buildSchemaSnapshot(block, sourceLabel);
    if (writeSchemaClipboard(snapshot)) {
      setClipboard(snapshot);
    }
  };

  const handlePaste = () => {
    if (!clipboard) return;
    const ok = window.confirm(
      `Replace this block's schema with the copied one?\n\n` +
      `Copied schema: ${clipboard.fields.length} fields from "${clipboard.sourceLabel || 'unknown'}"\n` +
      `Current block has ${fields.length} fields.\n\n` +
      `The current block's HTML, fields, and values will be overwritten.`,
    );
    if (!ok) return;
    onApply(applySchemaSnapshot(clipboard));
  };

  const handleExport = () => {
    downloadSchemaJson(buildSchemaSnapshot(block, sourceLabel));
  };

  const handleImport = (file: File) => {
    setImportError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || '');
      const result = parseImportedSchema(text);
      if ('error' in result) {
        setImportError(result.error);
        return;
      }
      const ok = window.confirm(
        `Import schema?\n\n` +
        `Source: ${result.sourceLabel || 'unknown'}\n` +
        `Fields: ${result.fields.length}\n\n` +
        `The current block's HTML, fields, and values will be overwritten.`,
      );
      if (!ok) return;
      onApply(applySchemaSnapshot(result));
    };
    reader.onerror = () => setImportError('Failed to read file');
    reader.readAsText(file);
  };

  const formatRelative = (ts: number): string => {
    const diff = Date.now() - ts;
    const m = Math.round(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-muted/20 text-[11px]">
      <button
        type="button"
        onClick={handleCopy}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="Copy this block's schema (fields + template + loop) to a shared clipboard"
      >
        <span className="material-icons text-sm">content_copy</span>
        Copy
      </button>
      <button
        type="button"
        onClick={handlePaste}
        disabled={!clipboard}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        title={clipboard ? `Paste ${clipboard.fields.length}-field schema from "${clipboard.sourceLabel || 'unknown'}" (${formatRelative(clipboard.copiedAt)})` : 'No schema in clipboard yet — Copy from another block first'}
      >
        <span className="material-icons text-sm">content_paste</span>
        Paste{clipboard ? ` (${formatRelative(clipboard.copiedAt)})` : ''}
      </button>
      <span className="flex-1" />
      <button
        type="button"
        onClick={handleExport}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="Download schema as JSON"
      >
        <span className="material-icons text-sm">file_download</span>
        Export
      </button>
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
        title="Import schema from JSON file"
      >
        <span className="material-icons text-sm">file_upload</span>
        Import
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleImport(f);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }}
      />
      {importError && (
        <div className="absolute right-3 top-12 z-30 max-w-sm rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive shadow-lg">
          {importError}
          <button type="button" onClick={() => setImportError(null)} className="ml-2 text-destructive/60 hover:text-destructive">×</button>
        </div>
      )}
    </div>
  );
}

// ─── ImagePickerModal — opens when an iframe img is clicked for swap ───────
// Reuses the standard MediaPicker. Renders in a small modal so the author
// can pick without leaving the visual editor. Pre-populates with the
// currently displayed image so they see what they're replacing.

export function ImagePickerModal({
  target,
  mediaApi,
  onSelect,
  onClose,
}: {
  target: { blockId: string; field: string; currentValue: string };
  mediaApi: string;
  onSelect: (url: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-label="Select image"
      className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div
        className="relative w-full max-w-2xl rounded-lg border border-border bg-card shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="material-icons text-base text-muted-foreground">image</span>
            <h2 className="text-sm font-semibold text-foreground">Replace image</h2>
            <code className="text-[11px] text-muted-foreground hidden md:inline">{target.field}</code>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-accent"
            title="Close (Esc)"
          >
            <span className="material-icons text-sm">close</span>
            Close
          </button>
        </header>
        <div className="p-4">
          <MediaPicker
            value={target.currentValue}
            onChange={(url) => onSelect(url)}
            mimeTypeFilter="image"
            label=""
            apiEndpoint={mediaApi}
          />
        </div>
      </div>
    </div>
  );
}

// ─── SortableSchemaField — drag wrapper for schema-editor field rows ────────
// Render-prop pattern: the parent passes the drag handle props down to
// whichever element should be the handle (so the rest of the row stays
// clickable for inputs, deletes, etc.).

function SortableSchemaField({
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
  // Compose the handle props the child needs — `setActivatorNodeRef` so dnd
  // tracks the right node for accessibility, plus the listeners that start
  // the drag. Spread them onto the small drag-icon button.
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

// ─── HtmlRenderAddFieldMenu — quick-add presets for common field shapes ────
// Each preset is a single field with sensible defaults (and optionally
// `itemFields` for arrays/groups). The dropdown closes after selection; the
// new field is appended to the end of the list. Authors can rename or
// re-type from the schema editor afterward.

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

// ─── HtmlRenderSubFieldsEditor — inline editor for an array/group's children ──
// Sub-fields are scalar-only today (the per-item value is coerced to a string
// in HtmlRenderArrayEditor.setItemField), so the type list excludes nested
// arrays/groups, link, post, tab, and select/radio (which would need their
// own options[] UI). Authors who need those should drop into the HTML and
// detect-fields will pick them up.

const SUBFIELD_TYPES: HtmlRenderField['type'][] = [
  'text', 'textarea', 'number', 'richtext', 'boolean',
  'url', 'image', 'color', 'date', 'datetime',
];

function HtmlRenderSubFieldsEditor({
  parentField,
  onChange,
}: {
  parentField: HtmlRenderField;
  onChange: (next: HtmlRenderField[]) => void;
}) {
  const items = parentField.itemFields || [];

  const addSubField = () => {
    const taken = new Set(items.map(s => s.name));
    let n = 'newField';
    let k = 2;
    while (taken.has(n)) { n = `newField_${k++}`; }
    onChange([...items, { name: n, type: 'text' }]);
  };

  const updateSubField = (idx: number, patch: Partial<HtmlRenderField>) => {
    onChange(items.map((sf, i) => (i === idx ? { ...sf, ...patch } : sf)));
  };

  const removeSubField = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  return (
    <div className="rounded border border-border/60 bg-muted/10 p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">
          Sub-fields ({items.length})
        </span>
        <button
          type="button"
          onClick={addSubField}
          className="text-[11px] text-primary hover:underline"
        >
          + Add sub-field
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/80 italic leading-snug">
          No sub-fields yet. Add some, or annotate the{' '}
          <code className="font-mono">{parentField.type === 'array' ? 'data-repeat' : 'data-group'}</code>{' '}
          wrapper&apos;s contents in the HTML — they&apos;ll be auto-detected on save.
        </p>
      ) : (
        items.map((sf, si) => (
          <div key={si} className="flex items-center gap-1">
            <input
              type="text"
              value={sf.name}
              onChange={(e) => updateSubField(si, { name: e.target.value })}
              className="flex-1 min-w-0 rounded border border-border px-1.5 py-1 text-[11px] font-mono focus:border-primary focus:ring-1 focus:ring-primary"
              placeholder="name"
              spellCheck={false}
            />
            <select
              value={sf.type}
              onChange={(e) => updateSubField(si, { type: e.target.value as HtmlRenderField['type'] })}
              className="rounded border border-border px-1 py-1 text-[11px] focus:border-primary focus:ring-1 focus:ring-primary"
            >
              {SUBFIELD_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => removeSubField(si)}
              className="p-0.5 rounded text-destructive hover:bg-destructive/10"
              title="Remove sub-field"
            >
              <span className="material-icons text-sm">delete_outline</span>
            </button>
          </div>
        ))
      )}
    </div>
  );
}

function HtmlRenderAddFieldMenu({
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

// ─── HtmlRenderTabbedForm — splits the values form into tabs ────────────────
// Walks the field list once. Each `tab` field starts a new section; subsequent
// non-tab fields belong to that tab. Fields before the first tab go into a
// default "General" tab. Single-tab forms render flat (no tab strip).

function HtmlRenderTabbedForm({
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
