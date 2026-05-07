'use client';

// LayoutPanel: dispatcher for related block types' settings panels.
import type { Block, SectionBlock, DividerBlock, SpacerBlock, ColumnsBlock, StickyScrollTabsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';
import { ColumnsBlockSettings } from './ColumnsSettings';

interface PanelProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function LayoutPanel({ block, onChange, currentViewport }: PanelProps) {
  switch (block.type) {
    case 'spacer':
      return <SpacerBlockSettings block={block as SpacerBlock} onChange={onChange as (u: Partial<SpacerBlock>) => void} currentViewport={currentViewport} />;
    case 'divider':
      return <DividerBlockSettings block={block as DividerBlock} onChange={onChange as (u: Partial<DividerBlock>) => void} currentViewport={currentViewport} />;
    case 'columns':
      return <ColumnsBlockSettings block={block as ColumnsBlock} onChange={onChange as (u: Partial<ColumnsBlock>) => void} currentViewport={currentViewport} />;
    case 'section':
      return <SectionBlockSettings block={block as SectionBlock} onChange={onChange as (u: Partial<SectionBlock>) => void} />;
    case 'sticky-scroll-tabs':
      return <StickyScrollTabsBlockSettings block={block as StickyScrollTabsBlock} onChange={onChange as (u: Partial<StickyScrollTabsBlock>) => void} />;
    default:
      return null;
  }
}

function StickyScrollTabsBlockSettings({ block, onChange }: { block: StickyScrollTabsBlock; onChange: (updates: Partial<StickyScrollTabsBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Overline</label>
        <input
          type="text"
          value={block.overline || ''}
          onChange={(e) => onChange({ overline: e.target.value || undefined })}
          className={inputClass}
          placeholder="Optional eyebrow"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Section Title</label>
        <input
          type="text"
          value={block.title || ''}
          onChange={(e) => onChange({ title: e.target.value || undefined })}
          className={inputClass}
          placeholder="Optional heading above the tabs"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Description</label>
        <textarea
          value={block.description || ''}
          onChange={(e) => onChange({ description: e.target.value || undefined })}
          rows={2}
          className={inputClass}
          placeholder="Optional supporting paragraph"
        />
      </div>

      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Panels ({(block.panels || []).length})</label>
        {(block.panels || []).map((panel, i) => (
          <div key={panel.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <input
              type="text"
              value={panel.label}
              onChange={(e) => {
                const next = [...(block.panels || [])];
                next[i] = { ...next[i], label: e.target.value };
                onChange({ panels: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground font-bold"
              placeholder="Panel label"
            />
            <input
              type="text"
              value={panel.icon || ''}
              onChange={(e) => {
                const next = [...(block.panels || [])];
                next[i] = { ...next[i], icon: e.target.value || undefined };
                onChange({ panels: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Material Icon name (optional)"
            />
            <p className="text-xs text-muted-foreground">{(panel.blocks || []).length} nested block(s) — edit on canvas.</p>
            <button
              type="button"
              onClick={() => onChange({ panels: (block.panels || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove panel
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({
            panels: [
              ...(block.panels || []),
              { id: `panel-${Date.now()}`, label: 'New Panel', blocks: [] },
            ],
          })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Panel
        </button>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">Layout</label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Sticky Top Offset</label>
            <input
              type="number"
              value={block.stickyTopOffset ?? 80}
              onChange={(e) => {
                const n = Number(e.target.value);
                onChange({ stickyTopOffset: Number.isNaN(n) ? undefined : n });
              }}
              className={inputClass}
              placeholder="80"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">Panel Min Height</label>
            <input
              type="text"
              value={block.panelMinHeight || ''}
              onChange={(e) => onChange({ panelMinHeight: e.target.value || undefined })}
              className={inputClass}
              placeholder="60vh"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Tab Border Radius</label>
          <input
            type="text"
            value={block.tabBorderRadius || ''}
            onChange={(e) => onChange({ tabBorderRadius: e.target.value || undefined })}
            className={inputClass}
            placeholder="999px"
          />
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">Tab Colors (Desktop)</label>
        <div className="grid grid-cols-2 gap-3">
          <TokenColorPicker label="Active Background" value={block.activeTabBackground || ''} onChange={(v) => onChange({ activeTabBackground: v || undefined })} />
          <TokenColorPicker label="Active Text" value={block.activeTabColor || ''} onChange={(v) => onChange({ activeTabColor: v || undefined })} />
          <TokenColorPicker label="Inactive Background" value={block.inactiveTabBackground || ''} onChange={(v) => onChange({ inactiveTabBackground: v || undefined })} />
          <TokenColorPicker label="Inactive Text" value={block.inactiveTabColor || ''} onChange={(v) => onChange({ inactiveTabColor: v || undefined })} />
        </div>
      </div>

      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">Tab Colors (Mobile, optional)</label>
        <p className="text-xs text-muted-foreground">Leave blank to inherit from desktop colors.</p>
        <div className="grid grid-cols-2 gap-3">
          <TokenColorPicker label="Active Background" value={block.mobileActiveTabBackground || ''} onChange={(v) => onChange({ mobileActiveTabBackground: v || undefined })} />
          <TokenColorPicker label="Active Text" value={block.mobileActiveTabColor || ''} onChange={(v) => onChange({ mobileActiveTabColor: v || undefined })} />
          <TokenColorPicker label="Inactive Background" value={block.mobileInactiveTabBackground || ''} onChange={(v) => onChange({ mobileInactiveTabBackground: v || undefined })} />
          <TokenColorPicker label="Inactive Text" value={block.mobileInactiveTabColor || ''} onChange={(v) => onChange({ mobileInactiveTabColor: v || undefined })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Mobile Tab Behavior</label>
          <select
            value={block.mobileTabsBehavior || 'carousel'}
            onChange={(e) => onChange({ mobileTabsBehavior: e.target.value as StickyScrollTabsBlock['mobileTabsBehavior'] })}
            className={inputClass}
          >
            <option value="carousel">Carousel — sticky horizontal-scroll tabs</option>
            <option value="hide">Hide — panels stack, no mobile tab strip</option>
          </select>
        </div>
      </div>
    </div>
  );
}

function SectionBlockSettings({ block, onChange }: { block: SectionBlock; onChange: (updates: Partial<SectionBlock>) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">HTML Tag</label>
        <select
          value={block.htmlTag || 'section'}
          onChange={(e) => onChange({ htmlTag: e.target.value as SectionBlock['htmlTag'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="section">section</option>
          <option value="div">div</option>
          <option value="article">article</option>
          <option value="aside">aside</option>
          <option value="header">header</option>
          <option value="footer">footer</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Max Width</label>
        <input
          type="text"
          value={block.maxWidth || ''}
          onChange={(e) => onChange({ maxWidth: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. 1280px, 100%"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">CSS Class</label>
        <input
          type="text"
          value={block.cssClass || ''}
          onChange={(e) => onChange({ cssClass: e.target.value })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          placeholder="e.g. rounded-lg shadow-md"
        />
      </div>
      <div className="border-t border-border pt-4 space-y-3">
        <label className="block text-sm font-medium text-foreground">Diagonal Split (advanced)</label>
        <p className="text-xs text-muted-foreground">
          Optional second-color overlay rendered with a clip-path. Leave blank to disable.
        </p>
        <TokenColorPicker
          label="Split Color"
          value={block.splitColor || ''}
          onChange={(v) => onChange({ splitColor: v || undefined })}
          placeholder="transparent"
        />
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">Clip Path</label>
          <input
            type="text"
            value={block.splitClipPath || ''}
            onChange={(e) => onChange({ splitClipPath: e.target.value || undefined })}
            placeholder="polygon(55% 0, 100% 0, 100% 100%, 45% 100%)"
            className="w-full text-xs font-mono rounded border border-border bg-background px-2 py-1.5 text-foreground"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Defaults to a right-side diagonal when Split Color is set.
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{block.blocks.length} nested block{block.blocks.length !== 1 ? 's' : ''}</p>
      <p className="text-xs text-muted-foreground italic">Use the Style tab for colors, padding, borders, and other visual properties.</p>
    </div>
  );
}

function DividerBlockSettings({ block, onChange, currentViewport }: { block: DividerBlock; onChange: (updates: Partial<DividerBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Line Style</label>
        <select
          value={block.lineStyle || 'solid'}
          onChange={(e) => onChange({ lineStyle: e.target.value as DividerBlock['lineStyle'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="solid">Solid</option>
          <option value="dashed">Dashed</option>
          <option value="dotted">Dotted</option>
        </select>
      </div>
    </div>
  );
}

function SpacerBlockSettings({ block, onChange, currentViewport }: { block: SpacerBlock; onChange: (updates: Partial<SpacerBlock>) => void; currentViewport: Breakpoint }) {
  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Height</label>
        <select
          value={block.height}
          onChange={(e) => onChange({ height: e.target.value as SpacerBlock['height'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Small (1rem)</option>
          <option value="md">Medium (2rem)</option>
          <option value="lg">Large (4rem)</option>
          <option value="xl">Extra Large (6rem)</option>
        </select>
      </div>
    </div>
  );
}

