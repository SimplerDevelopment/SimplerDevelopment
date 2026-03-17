'use client';

import { Block } from '@/types/blocks';
import { Breakpoint, BREAKPOINTS, SpacingSize, ResponsiveSettings as ResponsiveSettingsType } from '@/types/responsive';

interface StyleSettingsProps {
  block: Block;
  onChange: (updates: Partial<Block>) => void;
  currentViewport: Breakpoint;
}

const pxSizes = ['', '0', '0.25rem', '0.5rem', '0.75rem', '1rem', '1.5rem', '2rem', '3rem', '4rem'];
const pxLabels: Record<string, string> = {
  '': '-', '0': '0', '0.25rem': '4', '0.5rem': '8', '0.75rem': '12',
  '1rem': '16', '1.5rem': '24', '2rem': '32', '3rem': '48', '4rem': '64',
};

function parseSide(shorthand: string | undefined, side: 'top' | 'right' | 'bottom' | 'left'): string {
  if (!shorthand) return '';
  const parts = shorthand.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return side === 'top' || side === 'bottom' ? parts[0] : parts[1];
  if (parts.length === 3) {
    if (side === 'top') return parts[0];
    if (side === 'left' || side === 'right') return parts[1];
    return parts[2];
  }
  if (parts.length === 4) {
    return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] }[side];
  }
  return parts[0];
}

function buildShorthand(top: string, right: string, bottom: string, left: string): string {
  const t = top || '0', r = right || '0', b = bottom || '0', l = left || '0';
  if (t === '0' && r === '0' && b === '0' && l === '0') return '';
  if (t === r && r === b && b === l) return t;
  if (t === b && r === l) return `${t} ${r}`;
  if (r === l) return `${t} ${r} ${b}`;
  return `${t} ${r} ${b} ${l}`;
}

interface BoxModelControlProps {
  top: string;
  right: string;
  bottom: string;
  left: string;
  onTopChange: (v: string) => void;
  onRightChange: (v: string) => void;
  onBottomChange: (v: string) => void;
  onLeftChange: (v: string) => void;
  sizes: string[];
  outerLabel: string;
  color: 'blue' | 'green' | 'orange';
}

function BoxModelControl({ top, right, bottom, left, onTopChange, onRightChange, onBottomChange, onLeftChange, sizes, outerLabel, color }: BoxModelControlProps) {
  const borderColor = color === 'blue' ? 'border-blue-400/50' : color === 'green' ? 'border-green-400/50' : 'border-orange-400/50';
  const bgColor = color === 'blue' ? 'bg-blue-500/5' : color === 'green' ? 'bg-green-500/5' : 'bg-orange-500/5';
  const labelColor = color === 'blue' ? 'text-blue-400/60' : color === 'green' ? 'text-green-400/60' : 'text-orange-400/60';

  const renderSelect = (value: string, onChange: (v: string) => void, position: string) => (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-14 text-[10px] text-center rounded border border-border bg-background px-0.5 py-1 text-foreground appearance-none cursor-pointer"
      title={`${outerLabel}-${position}`}
    >
      {sizes.map((size) => (
        <option key={size} value={size}>
          {pxLabels[size] !== undefined ? pxLabels[size] : size || '-'}
        </option>
      ))}
    </select>
  );

  return (
    <div className={`relative border ${borderColor} ${bgColor} rounded-md p-1`}>
      {/* Label */}
      <span className={`absolute top-1 left-2 text-[9px] uppercase tracking-wider ${labelColor}`}>
        {outerLabel}
      </span>

      {/* Top */}
      <div className="flex justify-center pt-3 pb-1">
        {renderSelect(top, onTopChange, 'top')}
      </div>

      {/* Left - Content - Right */}
      <div className="flex items-center justify-between px-1">
        {renderSelect(left, onLeftChange, 'left')}
        <div className="flex-1 mx-2 h-8 border border-border/50 rounded bg-background/50 flex items-center justify-center">
          <span className="text-[9px] text-muted-foreground/50">content</span>
        </div>
        {renderSelect(right, onRightChange, 'right')}
      </div>

      {/* Bottom */}
      <div className="flex justify-center pt-1 pb-1">
        {renderSelect(bottom, onBottomChange, 'bottom')}
      </div>
    </div>
  );
}

export function StyleSettings({ block, onChange, currentViewport }: StyleSettingsProps) {
  // Get current style values or defaults
  const style = typeof block.style === 'object' ? block.style : {};
  const responsive = block.responsive || {};

  const updateStyle = (property: string, value: any) => {
    const existingStyle = typeof block.style === 'object' ? block.style : {};
    onChange({
      style: {
        ...existingStyle,
        [property]: value,
      },
    });
  };

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
    <div className="space-y-6">
      {/* Viewport Indicator */}
      <div className="flex items-center justify-between pb-3 border-b border-border">
        <div className="text-sm font-semibold text-foreground">Responsive Styles</div>
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

      {/* Margin - Box Model Control */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Margin</label>
        <BoxModelControl
          top={responsive.marginTop?.[currentViewport] || ''}
          bottom={responsive.marginBottom?.[currentViewport] || ''}
          left={responsive.marginLeft?.[currentViewport] || ''}
          right={responsive.marginRight?.[currentViewport] || ''}
          onTopChange={(v) => updateResponsiveSetting('marginTop', currentViewport, v as SpacingSize)}
          onBottomChange={(v) => updateResponsiveSetting('marginBottom', currentViewport, v as SpacingSize)}
          onLeftChange={(v) => updateResponsiveSetting('marginLeft', currentViewport, v as SpacingSize)}
          onRightChange={(v) => updateResponsiveSetting('marginRight', currentViewport, v as SpacingSize)}
          sizes={spacingSizes}
          outerLabel="margin"
          color="blue"
        />
      </div>

      {/* Padding - Box Model Control */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Padding</label>
        <BoxModelControl
          top={responsive.paddingTop?.[currentViewport] || ''}
          bottom={responsive.paddingBottom?.[currentViewport] || ''}
          left={responsive.paddingLeft?.[currentViewport] || ''}
          right={responsive.paddingRight?.[currentViewport] || ''}
          onTopChange={(v) => updateResponsiveSetting('paddingTop', currentViewport, v as SpacingSize)}
          onBottomChange={(v) => updateResponsiveSetting('paddingBottom', currentViewport, v as SpacingSize)}
          onLeftChange={(v) => updateResponsiveSetting('paddingLeft', currentViewport, v as SpacingSize)}
          onRightChange={(v) => updateResponsiveSetting('paddingRight', currentViewport, v as SpacingSize)}
          sizes={spacingSizes}
          outerLabel="padding"
          color="green"
        />
      </div>

      {/* Responsive Font Size (for text-based blocks) */}
      {(block.type === 'text' || block.type === 'heading' || block.type === 'quote') && (
        <div>
          <label className="block text-sm font-semibold text-foreground mb-3">Responsive Font Size</label>
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

      <div className="border-t border-border pt-6"></div>
      {/* Background */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Background</label>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Background Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={style.backgroundColor || '#ffffff'}
                onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                className="w-12 h-10 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={style.backgroundColor || '#ffffff'}
                onChange={(e) => updateStyle('backgroundColor', e.target.value)}
                className="flex-1 text-sm rounded border border-border bg-background px-3 py-2 text-foreground font-mono"
                placeholder="#ffffff"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Text Color */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Text</label>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Text Color</label>
            <div className="flex gap-2">
              <input
                type="color"
                value={style.color || '#000000'}
                onChange={(e) => updateStyle('color', e.target.value)}
                className="w-12 h-10 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={style.color || '#000000'}
                onChange={(e) => updateStyle('color', e.target.value)}
                className="flex-1 text-sm rounded border border-border bg-background px-3 py-2 text-foreground font-mono"
                placeholder="#000000"
              />
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Font Family</label>
            <select
              value={style.fontFamily || ''}
              onChange={(e) => updateStyle('fontFamily', e.target.value)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">Default</option>
              <option value="font-sans">Sans Serif</option>
              <option value="font-serif">Serif</option>
              <option value="font-mono">Monospace</option>
              <option value="font-geist-sans">Geist Sans</option>
              <option value="font-orbitron">Orbitron</option>
              <option value="font-rajdhani">Rajdhani</option>
            </select>
          </div>

          {/* Font Weight */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Font Weight</label>
            <select
              value={style.fontWeight || ''}
              onChange={(e) => updateStyle('fontWeight', e.target.value)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">Default</option>
              <option value="300">Light (300)</option>
              <option value="400">Normal (400)</option>
              <option value="500">Medium (500)</option>
              <option value="600">Semibold (600)</option>
              <option value="700">Bold (700)</option>
              <option value="800">Extra Bold (800)</option>
              <option value="900">Black (900)</option>
            </select>
          </div>

          {/* Line Height */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Line Height</label>
            <select
              value={style.lineHeight || ''}
              onChange={(e) => updateStyle('lineHeight', e.target.value)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">Default</option>
              <option value="1">None (1)</option>
              <option value="1.25">Tight (1.25)</option>
              <option value="1.375">Snug (1.375)</option>
              <option value="1.5">Normal (1.5)</option>
              <option value="1.625">Relaxed (1.625)</option>
              <option value="2">Loose (2)</option>
            </select>
          </div>

          {/* Letter Spacing */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Letter Spacing</label>
            <select
              value={style.letterSpacing || ''}
              onChange={(e) => updateStyle('letterSpacing', e.target.value)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">Default</option>
              <option value="-0.05em">Tighter</option>
              <option value="-0.025em">Tight</option>
              <option value="0">Normal</option>
              <option value="0.025em">Wide</option>
              <option value="0.05em">Wider</option>
              <option value="0.1em">Widest</option>
            </select>
          </div>
        </div>
      </div>

      {/* Border */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Border</label>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Border Width</label>
            <select
              value={style.borderWidth || ''}
              onChange={(e) => updateStyle('borderWidth', e.target.value)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">None</option>
              <option value="1px">1px</option>
              <option value="2px">2px</option>
              <option value="4px">4px</option>
              <option value="8px">8px</option>
            </select>
          </div>

          {style.borderWidth && (
            <>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Border Color</label>
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={style.borderColor || '#e5e7eb'}
                    onChange={(e) => updateStyle('borderColor', e.target.value)}
                    className="w-12 h-10 rounded border border-border cursor-pointer"
                  />
                  <input
                    type="text"
                    value={style.borderColor || '#e5e7eb'}
                    onChange={(e) => updateStyle('borderColor', e.target.value)}
                    className="flex-1 text-sm rounded border border-border bg-background px-3 py-2 text-foreground font-mono"
                    placeholder="#e5e7eb"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Border Style</label>
                <select
                  value={style.borderStyle || 'solid'}
                  onChange={(e) => updateStyle('borderStyle', e.target.value)}
                  className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                  <option value="double">Double</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Border Radius</label>
            <select
              value={style.borderRadius || ''}
              onChange={(e) => updateStyle('borderRadius', e.target.value)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">None</option>
              <option value="0.25rem">Small (4px)</option>
              <option value="0.375rem">Medium (6px)</option>
              <option value="0.5rem">Large (8px)</option>
              <option value="0.75rem">Extra Large (12px)</option>
              <option value="1rem">2XL (16px)</option>
              <option value="1.5rem">3XL (24px)</option>
              <option value="9999px">Full (Pill)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Spacing - Static (non-responsive) */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Static Spacing</label>
        <p className="text-xs text-muted-foreground mb-3">Applied at all breakpoints. Use responsive spacing above for per-breakpoint control.</p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Padding (all sides)</label>
            <BoxModelControl
              top={parseSide(style.padding, 'top')}
              right={parseSide(style.padding, 'right')}
              bottom={parseSide(style.padding, 'bottom')}
              left={parseSide(style.padding, 'left')}
              onTopChange={(v) => updateStyle('padding', buildShorthand(v, parseSide(style.padding, 'right'), parseSide(style.padding, 'bottom'), parseSide(style.padding, 'left')))}
              onRightChange={(v) => updateStyle('padding', buildShorthand(parseSide(style.padding, 'top'), v, parseSide(style.padding, 'bottom'), parseSide(style.padding, 'left')))}
              onBottomChange={(v) => updateStyle('padding', buildShorthand(parseSide(style.padding, 'top'), parseSide(style.padding, 'right'), v, parseSide(style.padding, 'left')))}
              onLeftChange={(v) => updateStyle('padding', buildShorthand(parseSide(style.padding, 'top'), parseSide(style.padding, 'right'), parseSide(style.padding, 'bottom'), v))}
              sizes={pxSizes}
              outerLabel="padding"
              color="green"
            />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Margin (all sides)</label>
            <BoxModelControl
              top={parseSide(style.margin, 'top')}
              right={parseSide(style.margin, 'right')}
              bottom={parseSide(style.margin, 'bottom')}
              left={parseSide(style.margin, 'left')}
              onTopChange={(v) => updateStyle('margin', buildShorthand(v, parseSide(style.margin, 'right'), parseSide(style.margin, 'bottom'), parseSide(style.margin, 'left')))}
              onRightChange={(v) => updateStyle('margin', buildShorthand(parseSide(style.margin, 'top'), v, parseSide(style.margin, 'bottom'), parseSide(style.margin, 'left')))}
              onBottomChange={(v) => updateStyle('margin', buildShorthand(parseSide(style.margin, 'top'), parseSide(style.margin, 'right'), v, parseSide(style.margin, 'left')))}
              onLeftChange={(v) => updateStyle('margin', buildShorthand(parseSide(style.margin, 'top'), parseSide(style.margin, 'right'), parseSide(style.margin, 'bottom'), v))}
              sizes={pxSizes}
              outerLabel="margin"
              color="blue"
            />
          </div>
        </div>
      </div>

      {/* Shadow */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Shadow</label>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Box Shadow</label>
          <select
            value={style.boxShadow || ''}
            onChange={(e) => updateStyle('boxShadow', e.target.value)}
            className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
          >
            <option value="">None</option>
            <option value="0 1px 2px 0 rgb(0 0 0 / 0.05)">Small</option>
            <option value="0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)">Medium</option>
            <option value="0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)">Large</option>
            <option value="0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)">Extra Large</option>
            <option value="0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)">2XL</option>
            <option value="0 25px 50px -12px rgb(0 0 0 / 0.25)">Inner</option>
          </select>
        </div>
      </div>

      {/* Opacity */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Opacity</label>
        <div className="space-y-2">
          <input
            type="range"
            min="0"
            max="100"
            value={style.opacity ? parseFloat(style.opacity) * 100 : 100}
            onChange={(e) => updateStyle('opacity', (parseInt(e.target.value) / 100).toString())}
            className="w-full"
          />
          <div className="text-xs text-muted-foreground text-center">
            {style.opacity ? Math.round(parseFloat(style.opacity) * 100) : 100}%
          </div>
        </div>
      </div>
    </div>
  );
}
