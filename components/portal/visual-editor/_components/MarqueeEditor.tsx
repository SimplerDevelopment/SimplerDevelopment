'use client';

import type { Block } from '@/types/blocks';
import MediaPicker from '@/components/admin/MediaPicker';
import { Field, SelectField, CheckboxField, ColorField } from '../panel-fields';

// ─── Marquee Editor ─────────────────────────────────────────────────────────

export function MarqueeEditor({ block, onUpdate, siteId }: { block: Block; onUpdate: (updates: Partial<Block>) => void; siteId?: number }) {
  const b = block as unknown as Record<string, unknown>;
  const items = (b.items as Array<Record<string, unknown>>) || [];
  const mediaApi = siteId ? `/api/portal/cms/websites/${siteId}/media` : '/api/portal/media';

  function updateItem(index: number, updates: Record<string, unknown>) {
    const newItems = items.map((it, i) => i === index ? { ...it, ...updates } : it);
    onUpdate({ items: newItems } as Partial<Block>);
  }

  function addItem(type: 'text' | 'image' | 'icon') {
    const newItem: Record<string, unknown> = {
      id: `mi-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      content: type === 'text' ? 'New item' : type === 'icon' ? 'star' : '',
      imageUrl: '',
    };
    onUpdate({ items: [...items, newItem] } as Partial<Block>);
  }

  function removeItem(index: number) {
    onUpdate({ items: items.filter((_, i) => i !== index) } as Partial<Block>);
  }

  function moveItem(from: number, dir: -1 | 1) {
    const to = from + dir;
    if (to < 0 || to >= items.length) return;
    const arr = [...items];
    [arr[from], arr[to]] = [arr[to], arr[from]];
    onUpdate({ items: arr } as Partial<Block>);
  }

  return (
    <div className="space-y-3">
      {/* Items list */}
      <div>
        <span className="text-xs font-medium text-muted-foreground">Items ({items.length})</span>
        <div className="space-y-2 mt-1">
          {items.map((item, i) => (
            <div key={(item.id as string) || i} className="border border-border rounded p-2 space-y-2 bg-muted/20">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-muted-foreground font-medium flex-1">{String(item.type).toUpperCase()} {i + 1}</span>
                <button type="button" onClick={() => moveItem(i, -1)} disabled={i === 0} className="p-0.5 text-xs rounded hover:bg-muted disabled:opacity-30"><span className="material-icons text-xs">arrow_upward</span></button>
                <button type="button" onClick={() => moveItem(i, 1)} disabled={i === items.length - 1} className="p-0.5 text-xs rounded hover:bg-muted disabled:opacity-30"><span className="material-icons text-xs">arrow_downward</span></button>
                <button type="button" onClick={() => removeItem(i)} className="p-0.5 text-xs rounded text-destructive hover:bg-destructive/10"><span className="material-icons text-xs">close</span></button>
              </div>
              {item.type === 'text' && (
                <Field label="Text" value={(item.content as string) || ''} onChange={(v) => updateItem(i, { content: v })} />
              )}
              {item.type === 'icon' && (
                <Field label="Icon Name" value={(item.content as string) || ''} onChange={(v) => updateItem(i, { content: v })} />
              )}
              {item.type === 'image' && (
                <div><span className="text-xs text-muted-foreground">Image</span><MediaPicker value={(item.imageUrl as string) || ''} onChange={(v) => updateItem(i, { imageUrl: v })} mimeTypeFilter="image" label="" apiEndpoint={mediaApi} /></div>
              )}
              {item.type === 'image' && (
                <Field label="Alt Text" value={(item.imageAlt as string) || ''} onChange={(v) => updateItem(i, { imageAlt: v })} />
              )}
              <Field label="Link (optional)" value={(item.link as string) || ''} onChange={(v) => updateItem(i, { link: v })} />
            </div>
          ))}
        </div>
        <div className="flex gap-1 mt-2">
          <button type="button" onClick={() => addItem('text')} className="flex-1 px-2 py-1.5 text-xs rounded bg-muted text-muted-foreground hover:text-foreground">+ Text</button>
          <button type="button" onClick={() => addItem('image')} className="flex-1 px-2 py-1.5 text-xs rounded bg-muted text-muted-foreground hover:text-foreground">+ Image</button>
          <button type="button" onClick={() => addItem('icon')} className="flex-1 px-2 py-1.5 text-xs rounded bg-muted text-muted-foreground hover:text-foreground">+ Icon</button>
        </div>
      </div>

      {/* Marquee settings */}
      <div className="border-t border-border pt-3 space-y-2">
        <span className="text-xs font-medium text-muted-foreground">Marquee Settings</span>
        <SelectField label="Direction" value={(b.direction as string) || 'left'} options={['left','right','up','down']} onChange={(v) => onUpdate({ direction: v } as Partial<Block>)} />
        <Field label="Speed (px/s)" value={String((b.speed as number) || 50)} onChange={(v) => onUpdate({ speed: Number(v) || 50 } as Partial<Block>)} />
        <Field label="Gap" value={(b.gap as string) || '40px'} onChange={(v) => onUpdate({ gap: v } as Partial<Block>)} />
        <Field label="Height (vertical)" value={(b.height as string) || ''} onChange={(v) => onUpdate({ height: v } as Partial<Block>)} />
        <CheckboxField label="Auto Fill" checked={(b.autoFill as boolean) ?? true} onChange={(v) => onUpdate({ autoFill: v } as Partial<Block>)} />
        <CheckboxField label="Pause on Hover" checked={(b.pauseOnHover as boolean) ?? false} onChange={(v) => onUpdate({ pauseOnHover: v } as Partial<Block>)} />
        <CheckboxField label="Pause on Click" checked={(b.pauseOnClick as boolean) ?? false} onChange={(v) => onUpdate({ pauseOnClick: v } as Partial<Block>)} />
        <CheckboxField label="Gradient Edges" checked={(b.gradient as boolean) ?? false} onChange={(v) => onUpdate({ gradient: v } as Partial<Block>)} />
        {(b.gradient as boolean) && (
          <>
            <ColorField label="Gradient Color" value={(b.gradientColor as string) || 'white'} onChange={(v) => onUpdate({ gradientColor: v } as Partial<Block>)} />
            <Field label="Gradient Width" value={String((b.gradientWidth as number) || 200)} onChange={(v) => onUpdate({ gradientWidth: Number(v) || 200 } as Partial<Block>)} />
          </>
        )}
        <Field label="Loop Count (0=infinite)" value={String((b.loop as number) || 0)} onChange={(v) => onUpdate({ loop: Number(v) || 0 } as Partial<Block>)} />
      </div>
    </div>
  );
}
