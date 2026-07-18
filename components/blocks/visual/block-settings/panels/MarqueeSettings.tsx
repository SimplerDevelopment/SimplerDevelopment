'use client';

// Settings panel for the `MarqueeBlockSettings` block type, extracted from the BlockSettings monolith.
import type { MarqueeBlock, MarqueeItem } from '@/types/blocks';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';

export function MarqueeBlockSettings({ block, onChange }: { block: MarqueeBlock; onChange: (updates: Partial<MarqueeBlock>) => void }) {
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Direction</label>
          <select
            value={block.direction || 'left'}
            onChange={(e) => onChange({ direction: e.target.value as MarqueeBlock['direction'] })}
            className={inputClass}
          >
            <option value="left">Left</option>
            <option value="right">Right</option>
            <option value="up">Up</option>
            <option value="down">Down</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Speed (px/s)</label>
          <input
            type="number"
            value={block.speed ?? 50}
            onChange={(e) => onChange({ speed: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Gap</label>
          <input
            type="text"
            value={block.gap || '40px'}
            onChange={(e) => onChange({ gap: e.target.value })}
            className={inputClass}
            placeholder="40px"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Height (vertical)</label>
          <input
            type="text"
            value={block.height || ''}
            onChange={(e) => onChange({ height: e.target.value || undefined })}
            className={inputClass}
            placeholder="300px"
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Loop Count</label>
        <input
          type="number"
          min={0}
          value={block.loop ?? 0}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({ loop: Number.isNaN(n) ? undefined : n });
          }}
          className={inputClass}
          placeholder="0"
        />
        <p className="text-xs text-muted-foreground mt-1">0 = infinite loop. Set a positive number to stop after N loops.</p>
      </div>
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.pauseOnHover ?? true}
            onChange={(e) => onChange({ pauseOnHover: e.target.checked })}
            className="rounded border-border"
          />
          Pause on hover
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.pauseOnClick ?? false}
            onChange={(e) => onChange({ pauseOnClick: e.target.checked })}
            className="rounded border-border"
          />
          Pause on click
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.autoFill ?? true}
            onChange={(e) => onChange({ autoFill: e.target.checked })}
            className="rounded border-border"
          />
          Auto-fill (loop content)
        </label>
        <label className="flex items-center gap-2 text-sm text-foreground">
          <input
            type="checkbox"
            checked={block.gradient ?? false}
            onChange={(e) => onChange({ gradient: e.target.checked })}
            className="rounded border-border"
          />
          Edge gradient fade
        </label>
      </div>
      {block.gradient && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Gradient Color</label>
            <TokenColorPicker value={block.gradientColor || ''} onChange={(color) => onChange({ gradientColor: color || undefined })} />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">Gradient Width (px)</label>
            <input
              type="number"
              value={block.gradientWidth ?? 200}
              onChange={(e) => onChange({ gradientWidth: Number(e.target.value) })}
              className={inputClass}
            />
          </div>
        </div>
      )}
      <div className="border-t border-border pt-4 space-y-2">
        <label className="block text-sm font-medium text-foreground">Items</label>
        {(block.items || []).map((item, i) => (
          <div key={item.id ?? i} className="space-y-1 p-2 rounded border border-border">
            <select
              value={item.type}
              onChange={(e) => {
                const next = [...(block.items || [])];
                next[i] = { ...next[i], type: e.target.value as MarqueeItem['type'] };
                onChange({ items: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
            >
              <option value="text">Text</option>
              <option value="image">Image</option>
              <option value="icon">Icon</option>
            </select>
            {item.type === 'image' ? (
              <>
                <input
                  type="url"
                  value={item.imageUrl || ''}
                  onChange={(e) => {
                    const next = [...(block.items || [])];
                    next[i] = { ...next[i], imageUrl: e.target.value || undefined };
                    onChange({ items: next });
                  }}
                  className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                  placeholder="Image URL"
                />
                <input
                  type="text"
                  value={item.imageAlt || ''}
                  onChange={(e) => {
                    const next = [...(block.items || [])];
                    next[i] = { ...next[i], imageAlt: e.target.value || undefined };
                    onChange({ items: next });
                  }}
                  className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                  placeholder="Alt text"
                />
              </>
            ) : (
              <input
                type="text"
                value={item.content || ''}
                onChange={(e) => {
                  const next = [...(block.items || [])];
                  next[i] = { ...next[i], content: e.target.value || undefined };
                  onChange({ items: next });
                }}
                className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
                placeholder={item.type === 'icon' ? 'Material Icon name' : 'Text content'}
              />
            )}
            <input
              type="url"
              value={item.link || ''}
              onChange={(e) => {
                const next = [...(block.items || [])];
                next[i] = { ...next[i], link: e.target.value || undefined };
                onChange({ items: next });
              }}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground"
              placeholder="Link (optional)"
            />
            <button
              type="button"
              onClick={() => onChange({ items: (block.items || []).filter((_, j) => j !== i) })}
              className="text-xs text-destructive hover:underline"
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ items: [...(block.items || []), { id: `marq-${Date.now()}`, type: 'text', content: '' }] })}
          className="w-full px-3 py-2 text-xs font-medium rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:bg-accent/50"
        >
          + Add Item
        </button>
      </div>
    </div>
  );
}
