'use client';

import type { Block } from '@/types/blocks';
import { IconPicker } from '@/components/portal/IconPicker';
import {
  Field,
  TextareaField,
  RichTextField,
  SelectField,
  CheckboxField,
  OverrideBadge,
} from '../../panel-fields';

// ─── Button block: Style-tab values that shadow a Content-tab control ───────
// Mirrors the precedence in components/blocks/render/ButtonBlockRender.tsx:
// variant -> (brand preset) -> block.style, where each later stage wins.
// These booleans tell the Content tab when a control it renders no longer
// has any visible effect because a Style-tab value already overrides it.
function buttonOverrideFlags(b: Record<string, unknown>) {
  const style = (typeof b.style === 'object' && b.style ? b.style : {}) as Record<string, unknown>;
  const hasPreset = !!(b.presetId as string);
  return {
    // ButtonBlockRender.tsx: hasCustomBg/hasCustomColor blank out the variant's
    // Tailwind bg/text classes, and style.backgroundColor/style.color are
    // re-applied last (after preset + variant), so they always win.
    variantOverridden: !!style.backgroundColor || !!style.color,
    // ButtonBlockRender.tsx: preset supplies the base inline style, then each
    // of these style.* keys is individually re-applied on top of it if set.
    presetOverridden:
      hasPreset &&
      !!(
        style.backgroundColor ||
        style.color ||
        style.borderColor ||
        style.borderWidth ||
        style.borderStyle ||
        style.borderRadius ||
        style.boxShadow
      ),
    // ButtonBlockRender.tsx: hasCustomFontSize blanks out the size-driven
    // text-size class in favor of style.fontSize.
    sizeOverridden: !!style.fontSize,
  };
}

// ─── Shared props ────────────────────────────────────────────────────────────

export interface PanelProps {
  block: Block;
  onUpdate: (updates: Partial<Block>) => void;
  siteId?: number;
  /** VEQA-041 — see BlockContentEditor.tsx's PanelProps for the contract.
   *  Used here to force-preview the button's Hover Effect while the control
   *  is being interacted with. */
  onForceHoverChange?: (active: boolean) => void;
}

// ─── Content Panel — heading, text, button, quote, code, spacer, divider ─────

export function ContentPanel({ block, onUpdate, onForceHoverChange }: PanelProps) {
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
      {block.type === 'button' && (() => {
        const { variantOverridden, presetOverridden, sizeOverridden } = buttonOverrideFlags(b);
        return (
          <>
            <Field label="Text" value={b.text as string} onChange={(v) => onUpdate({ text: v } as Partial<Block>)} />
            <Field label="URL" value={b.url as string} onChange={(v) => onUpdate({ url: v } as Partial<Block>)} />
            <div>
              <SelectField label="Variant" value={(b.variant as string) || 'primary'} options={['primary','secondary','outline']} onChange={(v) => onUpdate({ variant: v } as Partial<Block>)} />
              {variantOverridden && <OverrideBadge />}
            </div>
            <div>
              <SelectField label="Size" value={(b.size as string) || 'md'} options={['sm','md','lg']} onChange={(v) => onUpdate({ size: v } as Partial<Block>)} />
              {sizeOverridden && <OverrideBadge />}
            </div>
            <SelectField label="Alignment" value={(b.alignment as string) || 'left'} options={['left','center','right']} onChange={(v) => onUpdate({ alignment: v } as Partial<Block>)} />
            <CheckboxField label="Open in new tab" checked={b.openInNewTab as boolean} onChange={(v) => onUpdate({ openInNewTab: v } as Partial<Block>)} />
            <div>
              <span className="text-xs font-medium text-muted-foreground">Icon</span>
              <IconPicker value={(b.icon as string) || ''} onChange={(v) => onUpdate({ icon: v || undefined } as Partial<Block>)} />
            </div>
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
            <div
              // VEQA-041 — hovering this control force-previews the button's
              // hover CSS on the canvas (via `.force-hover`, see
              // ButtonBlockRender.tsx) so the user sees the effect without
              // moving the mouse onto the iframe. Cleared on mouse-leave so
              // it never sticks after the user moves on.
              onMouseEnter={() => onForceHoverChange?.(true)}
              onMouseLeave={() => onForceHoverChange?.(false)}
            >
              <SelectField label="Hover Effect" value={(b.hoverEffect as string) || 'none'} options={['none','lift','glow','fill','slide','pulse']} onChange={(v) => onUpdate({ hoverEffect: v } as Partial<Block>)} />
            </div>
            <div>
              <Field label="Brand Preset (optional)" value={(b.presetId as string) || ''} onChange={(v) => onUpdate({ presetId: v || undefined } as Partial<Block>)} />
              <p className="text-xs text-muted-foreground mt-0.5">Preset key from brand presets. Preset styles apply first, block styles override on top.</p>
              {presetOverridden && <OverrideBadge />}
            </div>
          </>
        );
      })()}
      {block.type === 'quote' && (
        <>
          <RichTextField label="Quote" value={b.content as string} onChange={(v) => onUpdate({ content: v } as Partial<Block>)} />
          <RichTextField label="Author" value={b.author as string} onChange={(v) => onUpdate({ author: v } as Partial<Block>)} singleLine />
          <RichTextField label="Citation" value={b.citation as string} onChange={(v) => onUpdate({ citation: v } as Partial<Block>)} singleLine />
        </>
      )}
      {block.type === 'code' && (
        <>
          <TextareaField label="Code" value={b.code as string} onChange={(v) => onUpdate({ code: v } as Partial<Block>)} rows={6} />
          <SelectField label="Language" value={(b.language as string) || 'plaintext'} options={['javascript','typescript','jsx','tsx','html','css','json','bash','python','go','rust','java','sql','yaml','markdown','plaintext']} onChange={(v) => onUpdate({ language: v } as Partial<Block>)} />
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
