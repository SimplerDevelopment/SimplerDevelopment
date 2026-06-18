'use client';

/**
 * VariantBlockEditor
 *
 * Structured visual editor for an A/B variant's blockTreeOverride.
 *
 * The blockTreeOverride is a full polymorphic block tree (`{ blocks, version }`)
 * — every block has a different field shape. Rather than a free-form JSON
 * textarea, this component:
 *
 *  1. Parses the JSON and shows each block as a labeled card with the text /
 *     link fields that are most commonly varied in an A/B test surfaced as
 *     proper form inputs.
 *  2. Non-text blocks (spacer, divider, booking, survey, product-grid, …) that
 *     have no meaningful A/B-testable text fields are shown as a read-only
 *     badge so the user can see the structure without visual noise.
 *  3. A collapsible "Advanced — raw JSON" section at the bottom lets power
 *     users drop to full JSON editing. Edits there are reflected back into
 *     the structured view on blur/parse.
 *  4. The parent's `onChange` is called with a serialized JSON string every
 *     time a field changes — same shape as the old variantJson string so the
 *     existing saveVariant() path requires zero changes.
 *
 * Block fields surfaced per type:
 *   text         — content
 *   heading      — content
 *   quote        — content, author, citation
 *   button       — text, url
 *   image        — url, alt
 *   video/youtube— url, caption
 *   hero         — title, subtitle, description, ctaText, ctaLink, secondaryCtaText, secondaryCtaLink
 *   hero-slideshow — each slide: title, subtitle, description, ctaText, ctaLink
 *   cta          — title, description, primaryButtonText, primaryButtonUrl, secondaryButtonText, secondaryButtonUrl
 *   services-grid— title, description, overline, each service: title, description
 *   testimonial  — content/quote, author, role
 *   stats        — each stat: value, label
 *   card-grid    — title, each card: title, description
 *   (everything else) — read-only badge
 */

import { useState, useCallback, useEffect, useMemo } from 'react';

// ---------------------------------------------------------------------------
// Types (local — avoids importing the full Block union which isn't needed here)
// ---------------------------------------------------------------------------

interface RawBlock {
  id: string;
  type: string;
  order?: number;
  [key: string]: unknown;
}

interface BlockTree {
  blocks: RawBlock[];
  version?: string;
}

// ---------------------------------------------------------------------------
// Field descriptor — what to render for a given block type
// ---------------------------------------------------------------------------

type FieldKind = 'text' | 'textarea' | 'url';

interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
}

// Per-block-type: flat scalar fields to surface
const BLOCK_FIELDS: Record<string, FieldDef[]> = {
  text:    [{ key: 'content', label: 'Text content', kind: 'textarea' }],
  heading: [{ key: 'content', label: 'Heading text', kind: 'text' }],
  quote:   [
    { key: 'content', label: 'Quote', kind: 'textarea' },
    { key: 'author',  label: 'Author', kind: 'text' },
    { key: 'citation', label: 'Citation', kind: 'text' },
  ],
  button: [
    { key: 'text', label: 'Button label', kind: 'text' },
    { key: 'url',  label: 'Button URL', kind: 'url' },
  ],
  image: [
    { key: 'url', label: 'Image URL', kind: 'url' },
    { key: 'alt', label: 'Alt text', kind: 'text' },
  ],
  video: [
    { key: 'url',     label: 'Video URL', kind: 'url' },
    { key: 'caption', label: 'Caption', kind: 'text' },
  ],
  youtube: [
    { key: 'url',     label: 'YouTube URL', kind: 'url' },
    { key: 'caption', label: 'Caption', kind: 'text' },
  ],
  hero: [
    { key: 'title',              label: 'Title', kind: 'text' },
    { key: 'subtitle',           label: 'Subtitle', kind: 'text' },
    { key: 'description',        label: 'Description', kind: 'textarea' },
    { key: 'ctaText',            label: 'CTA button text', kind: 'text' },
    { key: 'ctaLink',            label: 'CTA button URL', kind: 'url' },
    { key: 'secondaryCtaText',   label: 'Secondary CTA text', kind: 'text' },
    { key: 'secondaryCtaLink',   label: 'Secondary CTA URL', kind: 'url' },
  ],
  cta: [
    { key: 'title',              label: 'Title', kind: 'text' },
    { key: 'description',        label: 'Description', kind: 'textarea' },
    { key: 'primaryButtonText',  label: 'Primary button text', kind: 'text' },
    { key: 'primaryButtonUrl',   label: 'Primary button URL', kind: 'url' },
    { key: 'secondaryButtonText', label: 'Secondary button text', kind: 'text' },
    { key: 'secondaryButtonUrl', label: 'Secondary button URL', kind: 'url' },
  ],
  'services-grid': [
    { key: 'overline',    label: 'Overline', kind: 'text' },
    { key: 'title',       label: 'Section title', kind: 'text' },
    { key: 'description', label: 'Section description', kind: 'textarea' },
  ],
  testimonial: [
    { key: 'content', label: 'Quote text', kind: 'textarea' },
    { key: 'quote',   label: 'Quote text (alt field)', kind: 'textarea' },
    { key: 'author',  label: 'Author name', kind: 'text' },
    { key: 'role',    label: 'Author role', kind: 'text' },
    { key: 'company', label: 'Company', kind: 'text' },
  ],
  'featured-content': [
    { key: 'title',       label: 'Title', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'textarea' },
    { key: 'ctaText',     label: 'CTA text', kind: 'text' },
    { key: 'ctaLink',     label: 'CTA URL', kind: 'url' },
  ],
  'card-grid': [
    { key: 'title',       label: 'Section title', kind: 'text' },
    { key: 'description', label: 'Section description', kind: 'textarea' },
  ],
  'bento-grid': [
    { key: 'title',       label: 'Section title', kind: 'text' },
    { key: 'description', label: 'Section description', kind: 'textarea' },
  ],
  'metric-cards': [
    { key: 'title',    label: 'Section title', kind: 'text' },
    { key: 'subtitle', label: 'Subtitle', kind: 'text' },
  ],
  'team-showcase': [
    { key: 'title',       label: 'Section title', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'textarea' },
  ],
  'team-flip-grid': [
    { key: 'title',       label: 'Section title', kind: 'text' },
    { key: 'description', label: 'Description', kind: 'textarea' },
  ],
  'store-banner': [
    { key: 'title',       label: 'Banner headline', kind: 'text' },
    { key: 'description', label: 'Banner description', kind: 'textarea' },
    { key: 'ctaText',     label: 'CTA text', kind: 'text' },
    { key: 'ctaLink',     label: 'CTA URL', kind: 'url' },
  ],
  timeline: [
    { key: 'title',       label: 'Section title', kind: 'text' },
    { key: 'description', label: 'Section description', kind: 'textarea' },
  ],
};

// Blocks whose sub-items (slides, services[], stats[], cards[]) can be
// inline-edited via a list editor — we surface them specially below BLOCK_FIELDS.
const LIST_BLOCK_ITEM_FIELDS: Record<string, { listKey: string; label: string; fields: FieldDef[] }> = {
  'hero-slideshow': {
    listKey: 'slides',
    label: 'Slides',
    fields: [
      { key: 'title',            label: 'Title', kind: 'text' },
      { key: 'subtitle',         label: 'Subtitle', kind: 'text' },
      { key: 'description',      label: 'Description', kind: 'textarea' },
      { key: 'ctaText',          label: 'CTA text', kind: 'text' },
      { key: 'ctaLink',          label: 'CTA URL', kind: 'url' },
      { key: 'secondaryCtaText', label: 'Secondary CTA text', kind: 'text' },
      { key: 'secondaryCtaLink', label: 'Secondary CTA URL', kind: 'url' },
    ],
  },
  'services-grid': {
    listKey: 'services',
    label: 'Services',
    fields: [
      { key: 'title',       label: 'Title', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'textarea' },
      { key: 'link',        label: 'Link URL', kind: 'url' },
      { key: 'linkText',    label: 'Link text', kind: 'text' },
    ],
  },
  stats: {
    listKey: 'stats',
    label: 'Stats',
    fields: [
      { key: 'value', label: 'Value', kind: 'text' },
      { key: 'label', label: 'Label', kind: 'text' },
    ],
  },
  'card-grid': {
    listKey: 'cards',
    label: 'Cards',
    fields: [
      { key: 'title',       label: 'Title', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'textarea' },
    ],
  },
  'flip-card-grid': {
    listKey: 'cards',
    label: 'Flip cards',
    fields: [
      { key: 'frontTitle', label: 'Front title', kind: 'text' },
      { key: 'backText',   label: 'Back text', kind: 'textarea' },
      { key: 'backLinkText', label: 'Back link text', kind: 'text' },
    ],
  },
  'metric-cards': {
    listKey: 'metrics',
    label: 'Metrics',
    fields: [
      { key: 'value',  label: 'Value', kind: 'text' },
      { key: 'label',  label: 'Label', kind: 'text' },
      { key: 'change', label: 'Change / note', kind: 'text' },
    ],
  },
  testimonial: {
    listKey: 'items',
    label: 'Testimonials',
    fields: [
      { key: 'content', label: 'Quote', kind: 'textarea' },
      { key: 'author',  label: 'Author', kind: 'text' },
      { key: 'role',    label: 'Role', kind: 'text' },
    ],
  },
  timeline: {
    listKey: 'items',
    label: 'Steps',
    fields: [
      { key: 'title',       label: 'Step title', kind: 'text' },
      { key: 'description', label: 'Description', kind: 'textarea' },
    ],
  },
  'logo-strip': {
    listKey: 'logos',
    label: 'Logos',
    fields: [
      { key: 'alt',      label: 'Alt text / name', kind: 'text' },
      { key: 'imageUrl', label: 'Image URL', kind: 'url' },
    ],
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseTree(raw: string): BlockTree | null {
  if (!raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.blocks)) return parsed as BlockTree;
    // Some variants store a bare array — wrap it.
    if (Array.isArray(parsed)) return { blocks: parsed, version: '1.0' };
  } catch {
    // fall through
  }
  return null;
}

function blockLabel(type: string): string {
  return type
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function blockIcon(type: string): string {
  const MAP: Record<string, string> = {
    text: 'notes', heading: 'title', button: 'smart_button', image: 'image',
    video: 'videocam', youtube: 'play_circle', hero: 'view_carousel',
    'hero-slideshow': 'slideshow', cta: 'campaign', quote: 'format_quote',
    testimonial: 'rate_review', stats: 'bar_chart', 'services-grid': 'apps',
    'card-grid': 'grid_view', 'flip-card-grid': 'flip',
    'metric-cards': 'insights', 'logo-strip': 'view_column',
    'store-banner': 'sell', timeline: 'timeline',
    'featured-content': 'star', 'bento-grid': 'view_quilt',
    'team-showcase': 'groups', 'team-flip-grid': 'flip',
    spacer: 'height', divider: 'horizontal_rule',
    section: 'crop_free', columns: 'view_column',
    tabs: 'tab', accordion: 'expand_more',
  };
  return MAP[type] ?? 'widgets';
}

// ─── Sub-component: single field input ──────────────────────────────────────

function FieldInput({
  fieldDef,
  value,
  onChange,
}: {
  fieldDef: FieldDef;
  value: string;
  onChange: (v: string) => void;
}) {
  const baseClass = 'w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  if (fieldDef.kind === 'textarea') {
    return (
      <textarea
        className={baseClass}
        rows={3}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    );
  }
  return (
    <input
      type={fieldDef.kind === 'url' ? 'url' : 'text'}
      className={`${baseClass} ${fieldDef.kind === 'url' ? 'font-mono text-xs' : ''}`}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  );
}

// ─── Sub-component: one block card ──────────────────────────────────────────

function BlockCard({
  block,
  index,
  onBlockChange,
}: {
  block: RawBlock;
  index: number;
  onBlockChange: (updated: RawBlock) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const scalarFields = BLOCK_FIELDS[block.type] ?? [];
  const listMeta = LIST_BLOCK_ITEM_FIELDS[block.type];

  // Filter scalar fields that actually have a non-empty value OR that have a
  // defined field def (so we always show known fields even when empty).
  const visibleScalars = scalarFields.filter(f => {
    const v = block[f.key];
    return v !== undefined && v !== null;
  });
  // For blocks with no known fields and no list, fall through to read-only badge.
  const hasContent = visibleScalars.length > 0 || !!listMeta;

  const updateScalar = (fieldKey: string, val: string) => {
    onBlockChange({ ...block, [fieldKey]: val });
  };

  const updateListItem = (listKey: string, itemIdx: number, fieldKey: string, val: string) => {
    const list = Array.isArray(block[listKey]) ? [...(block[listKey] as Record<string, unknown>[])] : [];
    const item = { ...(list[itemIdx] ?? {}) };
    item[fieldKey] = val;
    list[itemIdx] = item;
    onBlockChange({ ...block, [listKey]: list });
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setCollapsed(c => !c)}
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="material-icons text-base text-gray-500">{blockIcon(block.type)}</span>
          <span className="text-sm font-medium text-gray-700">{blockLabel(block.type)}</span>
          {block.label ? (
            <span className="text-xs text-gray-400 truncate">— {block.label as string}</span>
          ) : null}
          <span className="text-xs text-gray-400 font-mono">#{index + 1}</span>
        </div>
        <span className="material-icons text-base text-gray-400 flex-shrink-0">
          {collapsed ? 'expand_more' : 'expand_less'}
        </span>
      </button>

      {/* Body */}
      {!collapsed && (
        <div className="px-4 py-4 space-y-4">
          {!hasContent ? (
            <p className="text-xs text-gray-400 italic">
              This block type has no text fields — edit via Advanced JSON if needed.
            </p>
          ) : null}

          {/* Scalar fields */}
          {visibleScalars.length > 0 && (
            <div className="space-y-3">
              {visibleScalars.map(f => (
                <label key={f.key} className="block text-sm">
                  <span className="block text-gray-600 font-medium mb-1">{f.label}</span>
                  <FieldInput
                    fieldDef={f}
                    value={String(block[f.key] ?? '')}
                    onChange={val => updateScalar(f.key, val)}
                  />
                </label>
              ))}
            </div>
          )}

          {/* Show all known scalar fields (even empty) for common block types */}
          {visibleScalars.length === 0 && scalarFields.length > 0 && (
            <div className="space-y-3">
              {scalarFields.map(f => (
                <label key={f.key} className="block text-sm">
                  <span className="block text-gray-600 font-medium mb-1">{f.label}</span>
                  <FieldInput
                    fieldDef={f}
                    value={String(block[f.key] ?? '')}
                    onChange={val => updateScalar(f.key, val)}
                  />
                </label>
              ))}
            </div>
          )}

          {/* List items */}
          {listMeta && Array.isArray(block[listMeta.listKey]) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {listMeta.label}
              </p>
              {(block[listMeta.listKey] as Record<string, unknown>[]).map((item, itemIdx) => (
                <div key={itemIdx} className="border border-gray-100 rounded-md p-3 space-y-2 bg-white">
                  <p className="text-xs text-gray-400 font-mono">Item {itemIdx + 1}</p>
                  {listMeta.fields.map(f => {
                    const v = item[f.key];
                    if (v === undefined && f.kind !== 'text') return null;
                    return (
                      <label key={f.key} className="block text-sm">
                        <span className="block text-gray-600 mb-0.5">{f.label}</span>
                        <FieldInput
                          fieldDef={f}
                          value={String(v ?? '')}
                          onChange={val => updateListItem(listMeta.listKey, itemIdx, f.key, val)}
                        />
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

interface VariantBlockEditorProps {
  /** Raw JSON string — same shape the old textarea held. Empty string = no override. */
  value: string;
  /** Called whenever the structured editor or raw JSON changes. */
  onChange: (json: string) => void;
  /** Label shown in "Seed from …" button text. */
  kindLabel: string;
  /** Whether the experiment is running (disable edits). */
  disabled?: boolean;
  /** Placeholder text (for empty/control variant). */
  placeholder?: string;
}

export function VariantBlockEditor({
  value,
  onChange,
  kindLabel,
  disabled = false,
  placeholder,
}: VariantBlockEditorProps) {
  // Single source of truth for local edits. Initialized from `value` prop.
  // Both the structured view and the raw textarea derive from this.
  const [localJson, setLocalJson] = useState(value);
  // Whether the advanced panel is open.
  const [showRaw, setShowRaw] = useState(false);
  // Syntax error flag — set when the raw textarea has unparseable content.
  const [rawError, setRawError] = useState<string | null>(null);

  // When the parent resets `value` externally (e.g. "Seed from page"), pull
  // it in. This is a controlled sync from prop → local state — the textbook
  // use case for setState-in-effect (external system = parent JSON string).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalJson(value);
    setRawError(null);
  }, [value]);

  // Derive the parsed block tree from localJson — memoized so BlockCards only
  // re-render when the relevant block actually changes.
  const tree = useMemo(() => parseTree(localJson), [localJson]);

  // Structured edit → serialize + propagate up.
  const handleBlockChange = useCallback((index: number, updated: RawBlock) => {
    if (!tree) return;
    const newBlocks = tree.blocks.map((b, i) => (i === index ? updated : b));
    const newTree = { ...tree, blocks: newBlocks };
    const serialized = JSON.stringify(newTree, null, 2);
    setLocalJson(serialized);
    onChange(serialized);
  }, [tree, onChange]);

  // Raw JSON edit → always propagate (parent validates on save) + re-parse.
  const handleRawChange = (raw: string) => {
    setLocalJson(raw);
    setRawError(null);
    onChange(raw);
  };

  const handleRawBlur = () => {
    if (!localJson.trim()) {
      setRawError(null);
      return;
    }
    try {
      JSON.parse(localJson);
      setRawError(null);
    } catch {
      setRawError('Invalid JSON — fix before saving.');
    }
  };

  const isEmpty = !value.trim();

  return (
    <div className="space-y-3">
      {isEmpty ? (
        <div className="border border-dashed border-gray-200 rounded-lg px-4 py-6 text-center">
          <span className="material-icons text-gray-300 text-3xl block mb-2">view_module</span>
          <p className="text-sm text-gray-400">
            {placeholder ?? `No override — this variant uses the live ${kindLabel.toLowerCase()} content.`}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Use <strong>Seed from {kindLabel.toLowerCase()}</strong> to copy the current content and start editing.
          </p>
        </div>
      ) : tree ? (
        <div className="space-y-2">
          {tree.blocks.length === 0 ? (
            <p className="text-sm text-gray-400 italic">Block tree is empty.</p>
          ) : (
            tree.blocks.map((block, index) => (
              <BlockCard
                key={block.id ?? index}
                block={block}
                index={index}
                onBlockChange={updated => handleBlockChange(index, updated)}
              />
            ))
          )}
        </div>
      ) : (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 flex items-start gap-2">
          <span className="material-icons text-base mt-0.5 flex-shrink-0">warning</span>
          <span>
            This variant&apos;s JSON could not be parsed as a block tree. Edit it in Advanced JSON below.
          </span>
        </div>
      )}

      {/* Advanced / raw JSON escape hatch */}
      {!isEmpty && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
            onClick={() => setShowRaw(r => !r)}
          >
            <span className="text-xs font-medium text-gray-500 flex items-center gap-1">
              <span className="material-icons text-sm">code</span>
              Advanced — raw JSON
            </span>
            <span className="material-icons text-sm text-gray-400">
              {showRaw ? 'expand_less' : 'expand_more'}
            </span>
          </button>
          {showRaw && (
            <div className="p-3 space-y-2">
              {rawError ? (
                <p className="text-xs text-red-600 flex items-center gap-1">
                  <span className="material-icons text-sm">error</span>
                  {rawError}
                </p>
              ) : null}
              <textarea
                disabled={disabled}
                className="w-full font-mono text-xs border border-gray-200 rounded-md px-3 py-2 bg-gray-50 disabled:opacity-50"
                rows={12}
                value={localJson}
                onChange={e => handleRawChange(e.target.value)}
                onBlur={handleRawBlur}
                placeholder='{ "blocks": [], "version": "1.0" }'
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
