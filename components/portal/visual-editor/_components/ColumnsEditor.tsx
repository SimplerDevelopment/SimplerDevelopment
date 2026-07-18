'use client';

import type { Block, ColumnsBlock } from '@/types/blocks';
import { CheckboxField } from '../panel-fields';

// ─── Columns Editor ──────────────────────────────────────────────────────────

export function ColumnsEditor({ block, onUpdate }: { block: Block & { type: 'columns' }; onUpdate: (updates: Partial<Block>) => void }) {
  const cols = (block as ColumnsBlock).columns;
  const parseW = (w: number | string) => typeof w === 'string' ? parseFloat(w) : w;
  const totalWidth = cols.reduce((sum, c) => sum + parseW(c.width), 0);

  const updateColumnWidth = (index: number, width: number) => {
    // Relative resize: take the delta for the dragged column out of the OTHER
    // columns proportional to their current share (10% floor each), then
    // normalize so the widths always sum to exactly 100 — no invalid 50%+75%.
    const current = cols.map((c) => parseW(c.width));
    const clamped = Math.max(10, Math.min(90, width));
    const delta = clamped - current[index];
    const othersTotal = current.reduce((sum, w, i) => (i === index ? sum : sum + w), 0);
    let next = current.map((w, i) => {
      if (i === index) return clamped;
      if (othersTotal <= 0) return w;
      return Math.max(10, w - delta * (w / othersTotal));
    });
    const sum = next.reduce((a, b) => a + b, 0) || 1;
    next = next.map((w) => Math.round((w / sum) * 100));
    next[index] += 100 - next.reduce((a, b) => a + b, 0); // absorb rounding drift
    const updated = cols.map((col, i) => ({ ...col, width: next[i] }));
    onUpdate({ columns: updated } as Partial<Block>);
  };

  const addColumn = () => {
    const newCol = { id: `col-${Date.now()}`, width: Math.round(100 / (cols.length + 1)), blocks: [] };
    // Redistribute widths evenly
    const evenWidth = Math.round(100 / (cols.length + 1));
    const updated = cols.map(col => ({ ...col, width: evenWidth }));
    updated.push(newCol);
    onUpdate({ columns: updated } as Partial<Block>);
  };

  const removeColumn = (index: number) => {
    if (cols.length <= 1) return;
    const removed = cols.filter((_, i) => i !== index);
    const evenWidth = Math.round(100 / removed.length);
    const updated = removed.map(col => ({ ...col, width: evenWidth }));
    onUpdate({ columns: updated } as Partial<Block>);
  };

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-muted-foreground">Columns ({cols.length})</span>
          <button type="button" onClick={addColumn} className="text-xs text-primary hover:text-primary/80 font-medium">+ Add Column</button>
        </div>

        {/* Visual width bar */}
        <div className="flex gap-0.5 mb-3 h-8 rounded overflow-hidden border border-border">
          {cols.map((col, i) => (
            <div
              key={col.id}
              className="bg-primary/10 text-primary text-[10px] font-medium flex items-center justify-center relative group"
              style={{ width: `${(parseW(col.width) / totalWidth) * 100}%` }}
            >
              {Math.round(parseW(col.width))}%
              {cols.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeColumn(i)}
                  className="absolute top-0 right-0 text-[8px] text-destructive/70 hover:text-destructive opacity-0 group-hover:opacity-100 p-0.5"
                  title="Remove column"
                >x</button>
              )}
            </div>
          ))}
        </div>

        {/* Per-column width sliders */}
        <div className="space-y-2">
          {cols.map((col, i) => (
            <div key={col.id} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-8 shrink-0">Col {i + 1}</span>
              <input
                type="range"
                min={10}
                max={90}
                value={parseW(col.width)}
                onChange={(e) => updateColumnWidth(i, Number(e.target.value))}
                className="flex-1 h-1.5 accent-primary"
              />
              <span className="text-[10px] text-muted-foreground w-8 text-right">{Math.round(parseW(col.width))}%</span>
              {cols.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeColumn(i)}
                  className="shrink-0 w-5 h-5 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title={`Delete column ${i + 1}`}
                  aria-label={`Delete column ${i + 1}`}
                >
                  <span className="material-icons text-[14px] leading-none">delete</span>
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      <CheckboxField label="Stack on mobile" checked={block.stackOnMobile !== false} onChange={(v) => onUpdate({ stackOnMobile: v } as Partial<Block>)} />
      <CheckboxField label="Stack on tablet" checked={block.stackOnTablet === true} onChange={(v) => onUpdate({ stackOnTablet: v } as Partial<Block>)} />
      <CheckboxField label="Reverse when stacked" checked={block.reverseOnStack === true} onChange={(v) => onUpdate({ reverseOnStack: v } as Partial<Block>)} />

      <p className="text-xs text-muted-foreground">{cols.reduce((sum, c) => sum + c.blocks.length, 0)} nested blocks total</p>
    </div>
  );
}
