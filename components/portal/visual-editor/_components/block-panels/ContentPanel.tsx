'use client';

import type { Block } from '@/types/blocks';
import {
  Field,
  TextareaField,
  RichTextField,
  SelectField,
  CheckboxField,
} from '../../panel-fields';

// ─── Shared props ────────────────────────────────────────────────────────────

export interface PanelProps {
  block: Block;
  onUpdate: (updates: Partial<Block>) => void;
  siteId?: number;
}

// ─── Content Panel — heading, text, button, quote, code, spacer, divider ─────

export function ContentPanel({ block, onUpdate }: PanelProps) {
  const b = block as unknown as Record<string, unknown>;
  return (
    <>
      {block.type === 'heading' && (
        <>
          <RichTextField label="Content" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} singleLine />
          <SelectField label="Level" value={String(b.level || 2)} options={['1','2','3','4','5','6']} onChange={(v) => onUpdate({ level: Number(v) } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'text' && (
        <>
          <RichTextField label="Content" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'base'} options={['sm','base','lg','xl']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'button' && (
        <>
          <Field label="Text" value={b.text as string} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
          <Field label="URL" value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
          <SelectField label="Variant" value={(b.variant as string) || 'primary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
          <SelectField label="Size" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
          <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
          <CheckboxField label="Open in new tab" checked={b.openInNewTab as boolean} onChange={(v) => onUpdate({ openInNewTab: v } as Partial<Block>)} />
          <Field label="Icon (Material Icon name)" value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v || undefined } as Partial<Block>)} />
          <div>
            <span className="text-xs font-medium text-muted-foreground">Icon Position</span>
            <select
              value={(b.iconPosition as string) || 'left'}
              onChange={(e) => onUpdate({ iconPosition: e.target.value } as Partial<Block>)}
              disabled={!(b.icon as string)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground mt-1"
            >
              <option value="left">Left of text</option>
              <option value="right">Right of text</option>
            </select>
          </div>
          <SelectField label="Hover Effect" value={(b.hoverEffect as string) || 'none'} options={['none','lift','glow','fill','slide','pulse']} onChange={(v) => onUpdate({ hoverEffect: v } as Partial<Block>)} />
          <div>
            <Field label="Brand Preset (optional)" value={(b.presetId as string) || ''} onChange={(v) => onUpdate({ presetId: v || undefined } as Partial<Block>)} />
            <p className="text-xs text-muted-foreground mt-0.5">Preset key from brand presets. Preset styles apply first, block styles override on top.</p>
          </div>
        </>
      )}
      {block.type === 'quote' && (
        <>
          <RichTextField label="Quote" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
          <Field label="Author" value={b.author as string} onChange={(v) => onUpdate({ author: v } as Partial<Block>)} />
          <Field label="Citation" value={b.citation as string} onChange={(v) => onUpdate({ citation: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'code' && (
        <>
          <TextareaField label="Code" value={b.code as string} onChange={(v) => onUpdate({ code: v } as Partial<Block>)} rows={6} />
          <Field label="Language" value={b.language as string} onChange={(v) => onUpdate({ language: v } as Partial<Block>)} />
        </>
      )}
      {block.type === 'spacer' && (
        <SelectField label="Height" value={(b.height as string) || 'md'} options={['sm','md','lg','xl']} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
      )}
      {block.type === 'divider' && (
        <SelectField label="Line Style" value={(b.lineStyle as string) || 'solid'} options={['solid','dashed','dotted']} onChange={(v) => onUpdate({ lineStyle: v } as Partial<Block>)} />
      )}
    </>
  );
}
