'use client';

import MediaPicker from '@/components/admin/MediaPicker';
import type { Block } from '@/types/blocks';
import { GoogleFontPicker } from '@/components/blocks/visual/GoogleFontPicker';
import {
  ColorField,
  Field,
  SelectField,
} from '../../panel-fields';
import { ColumnsEditor } from '../ColumnsEditor';
import type { PanelProps } from './ContentPanel';

// ─── Layout Panel — columns, section ─────────────────────────────────────────

export function LayoutPanel({ block, onUpdate, siteId }: PanelProps) {
  const b = block as unknown as Record<string, unknown>;
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';
  return (
    <>
      {block.type === 'columns' && (
        <ColumnsEditor block={block} onUpdate={onUpdate} />
      )}
      {block.type === 'section' && (
        <>
          <ColorField label="Background Color" value={(b.backgroundColor as string) || ''} onChange={(v) => onUpdate({ backgroundColor: v } as Partial<Block>)} />
          <div><span className="text-xs font-medium text-muted-foreground">Background Image</span><MediaPicker value={b.backgroundImage as string} onChange={(v) => onUpdate({ backgroundImage: v } as Partial<Block>)} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
          <Field label="Max Width" value={b.maxWidth as string} onChange={(v) => onUpdate({ maxWidth: v } as Partial<Block>)} />
          <ColorField label="Text Color" value={(b.color as string) || ''} onChange={(v) => onUpdate({ color: v } as Partial<Block>)} />
          <div>
            <span className="text-xs font-medium text-muted-foreground">Font Family</span>
            <GoogleFontPicker value={(b.fontFamily as string) || ''} onChange={(v) => onUpdate({ fontFamily: v } as Partial<Block>)} />
          </div>
          <SelectField label="HTML Tag" value={(b.htmlTag as string) || 'section'} options={['section','div','article','aside','header','footer']} onChange={(v) => onUpdate({ htmlTag: v } as Partial<Block>)} />
          <details className="pt-2 border-t border-border mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground select-none py-1">
              <span className="material-icons text-sm">call_split</span>
              Diagonal Split (advanced)
            </summary>
            <div className="pt-3 space-y-3">
              <p className="text-xs text-muted-foreground">Optional second-color overlay rendered with a clip-path. Leave blank to disable.</p>
              <ColorField label="Split Color" value={(b.splitColor as string) || ''} onChange={(v) => onUpdate({ splitColor: v || undefined } as Partial<Block>)} />
              <div>
                <span className="text-xs font-medium text-muted-foreground">Clip Path</span>
                <input
                  type="text"
                  value={(b.splitClipPath as string) || ''}
                  onChange={(e) => onUpdate({ splitClipPath: e.target.value || undefined } as Partial<Block>)}
                  placeholder="polygon(55% 0, 100% 0, 100% 100%, 45% 100%)"
                  className="w-full text-xs font-mono rounded border border-border bg-background px-2 py-1.5 text-foreground mt-1"
                />
                <p className="text-xs text-muted-foreground mt-0.5">Defaults to a right-side diagonal when Split Color is set.</p>
              </div>
            </div>
          </details>
          <p className="text-xs text-muted-foreground mt-2">Nested blocks: {block.blocks.length}. Edit via layers panel.</p>
        </>
      )}
    </>
  );
}
