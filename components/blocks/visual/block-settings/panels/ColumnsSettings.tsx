'use client';

// Settings panel for the `ColumnsBlockSettings` block type, extracted from the BlockSettings monolith.
import type { ColumnsBlock } from '@/types/blocks';
import type { Breakpoint } from '@/types/responsive';
import { useState } from 'react';
import { TokenColorPicker } from '@/components/blocks/visual/TokenColorPicker';

export function ColumnsBlockSettings({ block, onChange, currentViewport }: { block: ColumnsBlock; onChange: (updates: Partial<ColumnsBlock>) => void; currentViewport: Breakpoint }) {
  const [expandedColumnId, setExpandedColumnId] = useState<string | null>(null);

  const updateColumn = (columnId: string, updates: Partial<typeof block.columns[0]>) => {
    onChange({
      columns: block.columns.map(col =>
        col.id === columnId ? { ...col, ...updates } : col
      ),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Layout</label>
        <p className="text-sm text-muted-foreground mb-2">{block.columns.length} columns</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Gap Between Columns</label>
        <select
          value={block.gap || 'md'}
          onChange={(e) => onChange({ gap: e.target.value as ColumnsBlock['gap'] })}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </div>

      {/* Per-Column Settings */}
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-3">Column Settings</label>
        <div className="space-y-2">
          {block.columns.map((column, index) => (
            <div key={column.id} className="border border-border rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedColumnId(expandedColumnId === column.id ? null : column.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-accent transition-colors"
              >
                <span className="font-medium">Column {index + 1} ({Math.round(parseFloat(String(column.width)))}%)</span>
                <svg
                  className={`w-4 h-4 text-muted-foreground transition-transform ${expandedColumnId === column.id ? 'rotate-180' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedColumnId === column.id && (
                <div className="px-3 pb-3 space-y-3 border-t border-border">
                  <div className="pt-3">
                    <label className="block text-xs font-medium text-muted-foreground mb-1">Width (%)</label>
                    <input
                      type="number"
                      min={5}
                      max={95}
                      value={Math.round(parseFloat(String(column.width)))}
                      onChange={(e) => updateColumn(column.id, { width: Math.max(5, Math.min(95, parseInt(e.target.value) || 5)) })}
                      className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                    />
                  </div>
                  <div>
                    <TokenColorPicker
                      label="Background"
                      value={column.backgroundColor || ''}
                      onChange={(v) => updateColumn(column.id, { backgroundColor: v || undefined })}
                      placeholder="transparent"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">Padding</label>
                      <select
                        value={column.padding || 'none'}
                        onChange={(e) => updateColumn(column.id, { padding: e.target.value as any })}
                        className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                      >
                        <option value="none">None</option>
                        <option value="sm">Small</option>
                        <option value="md">Medium</option>
                        <option value="lg">Large</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-muted-foreground mb-1">V. Align</label>
                      <select
                        value={column.verticalAlign || 'top'}
                        onChange={(e) => updateColumn(column.id, { verticalAlign: e.target.value as any })}
                        className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                      >
                        <option value="top">Top</option>
                        <option value="center">Center</option>
                        <option value="bottom">Bottom</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-muted-foreground mb-1">CSS Class</label>
                    <input
                      type="text"
                      value={column.cssClass || ''}
                      onChange={(e) => updateColumn(column.id, { cssClass: e.target.value || undefined })}
                      placeholder="e.g., rounded-lg shadow-sm"
                      className="w-full text-sm rounded border border-border bg-background px-2 py-1 text-foreground"
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Responsive Stacking */}
      <div className="border-t border-border pt-4">
        <label className="block text-sm font-medium text-foreground mb-3">Responsive Stacking</label>
        <div className="space-y-3">
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={block.stackOnMobile !== false}
              onChange={(e) => onChange({ stackOnMobile: e.target.checked })}
              className="rounded border-border mt-0.5"
            />
            <div>
              <div className="font-medium">Stack on Mobile</div>
              <div className="text-xs text-muted-foreground">Columns display vertically on screens &le; 767px</div>
            </div>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={block.stackOnTablet === true}
              onChange={(e) => onChange({ stackOnTablet: e.target.checked })}
              className="rounded border-border mt-0.5"
            />
            <div>
              <div className="font-medium">Stack on Tablet</div>
              <div className="text-xs text-muted-foreground">Columns display vertically on screens 768px - 1023px</div>
            </div>
          </label>
          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={block.reverseOnStack === true}
              onChange={(e) => onChange({ reverseOnStack: e.target.checked })}
              className="rounded border-border mt-0.5"
            />
            <div>
              <div className="font-medium">Reverse on Stack</div>
              <div className="text-xs text-muted-foreground">Show last column first when stacked vertically</div>
            </div>
          </label>
        </div>
      </div>

    </div>
  );
}
