'use client';

import { Block } from '@/types/blocks';
import { Breakpoint, BREAKPOINTS, SpacingSize, ResponsiveSettings as ResponsiveSettingsType } from '@/types/responsive';

interface ResponsiveSettingsProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

export function ResponsiveSettings({ block, onChange, currentViewport }: ResponsiveSettingsProps) {
  const responsive = block.responsive || {};

  const updateResponsiveSetting = (
    property: keyof ResponsiveSettingsType,
    breakpoint: Breakpoint,
    value: any
  ) => {
    const currentProperty = responsive[property] || {};
    onChange({
      responsive: {
        ...responsive,
        [property]: {
          ...currentProperty,
          [breakpoint]: value,
        },
      },
    });
  };

  const spacingSizes: SpacingSize[] = ['none', 'xs', 'sm', 'md', 'lg', 'xl', '2xl'];
  const fontSizes = ['xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl'];

  return (
    <div className="space-y-4 border-t border-border pt-4 mt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-foreground">Responsive Settings</h4>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>{BREAKPOINTS[currentViewport].icon}</span>
          <span>Editing for {BREAKPOINTS[currentViewport].label}</span>
        </div>
      </div>

      {/* Visibility Toggle */}
      <div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={responsive.visibility?.[currentViewport] !== false}
            onChange={(e) => updateResponsiveSetting('visibility', currentViewport, e.target.checked)}
            className="rounded border-border"
          />
          <span className="font-medium">Visible on {BREAKPOINTS[currentViewport].label}</span>
        </label>
        <p className="text-xs text-muted-foreground mt-1">
          Hide this block on {BREAKPOINTS[currentViewport].label.toLowerCase()} devices
        </p>
      </div>

      {/* Padding */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Padding</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Top</label>
            <select
              value={responsive.paddingTop?.[currentViewport] || ''}
              onChange={(e) => updateResponsiveSetting('paddingTop', currentViewport, e.target.value as SpacingSize)}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1"
            >
              <option value="">Default</option>
              {spacingSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Bottom</label>
            <select
              value={responsive.paddingBottom?.[currentViewport] || ''}
              onChange={(e) => updateResponsiveSetting('paddingBottom', currentViewport, e.target.value as SpacingSize)}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1"
            >
              <option value="">Default</option>
              {spacingSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Left</label>
            <select
              value={responsive.paddingLeft?.[currentViewport] || ''}
              onChange={(e) => updateResponsiveSetting('paddingLeft', currentViewport, e.target.value as SpacingSize)}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1"
            >
              <option value="">Default</option>
              {spacingSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Right</label>
            <select
              value={responsive.paddingRight?.[currentViewport] || ''}
              onChange={(e) => updateResponsiveSetting('paddingRight', currentViewport, e.target.value as SpacingSize)}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1"
            >
              <option value="">Default</option>
              {spacingSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Margin */}
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">Margin</label>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Top</label>
            <select
              value={responsive.marginTop?.[currentViewport] || ''}
              onChange={(e) => updateResponsiveSetting('marginTop', currentViewport, e.target.value as SpacingSize)}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1"
            >
              <option value="">Default</option>
              {spacingSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Bottom</label>
            <select
              value={responsive.marginBottom?.[currentViewport] || ''}
              onChange={(e) => updateResponsiveSetting('marginBottom', currentViewport, e.target.value as SpacingSize)}
              className="w-full text-xs rounded border border-border bg-background px-2 py-1"
            >
              <option value="">Default</option>
              {spacingSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Font Size (for text-based blocks) */}
      {(block.type === 'text' || block.type === 'heading' || block.type === 'quote') && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">Font Size</label>
          <select
            value={responsive.fontSize?.[currentViewport] || ''}
            onChange={(e) => updateResponsiveSetting('fontSize', currentViewport, e.target.value)}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2"
          >
            <option value="">Default</option>
            {fontSizes.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
