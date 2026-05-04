'use client';

// LayoutPanel: dispatcher for related block types' settings panels.
import type { Block, SectionBlock, DividerBlock, SpacerBlock, ColumnsBlock } from '@/types/blocks';
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
    default:
      return null;
  }
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

