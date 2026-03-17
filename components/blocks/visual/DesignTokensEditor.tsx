'use client';

import { useState } from 'react';
import { useDesignTokens, TokenColor } from '@/contexts/DesignTokensContext';

export function DesignTokensEditor() {
  const { tokens, addColor, removeColor, updateColor, resetToDefaults } = useDesignTokens();
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('#6366f1');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAdd = () => {
    if (newName.trim() && newValue) {
      addColor({ name: newName.trim(), value: newValue });
      setNewName('');
      setNewValue('#6366f1');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Brand Colors</h4>
        <button
          type="button"
          onClick={resetToDefaults}
          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Color List */}
      <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
        {tokens.colors.map((color, i) => (
          <div key={i} className="flex items-center gap-2 group">
            {editingIndex === i ? (
              <>
                <input
                  type="color"
                  value={color.value}
                  onChange={(e) => updateColor(i, { ...color, value: e.target.value })}
                  className="w-7 h-7 rounded border border-border cursor-pointer flex-shrink-0"
                />
                <input
                  type="text"
                  value={color.name}
                  onChange={(e) => updateColor(i, { ...color, name: e.target.value })}
                  className="flex-1 text-xs rounded border border-border bg-background px-2 py-1 text-foreground"
                  onBlur={() => setEditingIndex(null)}
                  onKeyDown={(e) => e.key === 'Enter' && setEditingIndex(null)}
                  autoFocus
                />
                <input
                  type="text"
                  value={color.value}
                  onChange={(e) => updateColor(i, { ...color, value: e.target.value })}
                  className="w-20 text-xs rounded border border-border bg-background px-2 py-1 text-foreground font-mono"
                />
              </>
            ) : (
              <>
                <div
                  className="w-6 h-6 rounded border border-border flex-shrink-0 cursor-pointer"
                  style={{ backgroundColor: color.value }}
                  onClick={() => setEditingIndex(i)}
                />
                <span className="flex-1 text-xs text-foreground truncate cursor-pointer" onClick={() => setEditingIndex(i)}>
                  {color.name}
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">{color.value}</span>
                <button
                  type="button"
                  onClick={() => removeColor(i)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-all p-0.5"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Add New Color */}
      <div className="pt-2 border-t border-border">
        <div className="flex gap-1.5">
          <input
            type="color"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            className="w-7 h-7 rounded border border-border cursor-pointer flex-shrink-0"
          />
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Color name"
            className="flex-1 text-xs rounded border border-border bg-background px-2 py-1 text-foreground"
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <button
            type="button"
            onClick={handleAdd}
            disabled={!newName.trim()}
            className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-40 transition-colors"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
