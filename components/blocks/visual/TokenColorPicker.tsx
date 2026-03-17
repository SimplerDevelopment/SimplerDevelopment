'use client';

import { useState } from 'react';
import { useDesignTokens } from '@/contexts/DesignTokensContext';

interface TokenColorPickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}

export function TokenColorPicker({ value, onChange, label, placeholder = 'transparent' }: TokenColorPickerProps) {
  const { tokens } = useDesignTokens();
  const [showSwatches, setShowSwatches] = useState(false);

  // Normalize color for input[type=color] (must be #rrggbb)
  const colorForInput = value && value.startsWith('#') && value.length >= 7 ? value.slice(0, 7) : '#ffffff';

  return (
    <div>
      {label && <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>}
      <div className="flex gap-2">
        <input
          type="color"
          value={colorForInput}
          onChange={(e) => onChange(e.target.value)}
          className="w-10 h-9 rounded border border-border cursor-pointer flex-shrink-0"
        />
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          className="flex-1 text-sm rounded border border-border bg-background px-3 py-1.5 text-foreground font-mono"
          placeholder={placeholder}
          onFocus={() => setShowSwatches(true)}
          onBlur={() => setTimeout(() => setShowSwatches(false), 200)}
        />
      </div>

      {/* Token Swatches */}
      {showSwatches && tokens.colors.length > 0 && (
        <div className="mt-2 p-2 border border-border rounded-lg bg-background shadow-sm">
          <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium mb-1.5 px-0.5">Design Tokens</div>
          <div className="flex flex-wrap gap-1">
            {tokens.colors.map((token, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(token.value);
                  setShowSwatches(false);
                }}
                className={`w-6 h-6 rounded border transition-all hover:scale-110 ${
                  value === token.value
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-foreground/30'
                }`}
                style={{ backgroundColor: token.value }}
                title={`${token.name} (${token.value})`}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
