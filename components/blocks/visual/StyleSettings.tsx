'use client';

import { useState, useEffect } from 'react';
import { Block } from '@/types/blocks';
import { Breakpoint, BREAKPOINTS, SpacingSize, SpacingValue, ResponsiveSettings as ResponsiveSettingsType } from '@/types/responsive';
import { TokenColorPicker } from './TokenColorPicker';
import MediaPicker from '@/components/admin/MediaPicker';

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

function isCustomValue(value: string, sizes: string[]): boolean {
  if (!value) return false;
  return !sizes.includes(value);
}

function SpacingInput({
  value,
  onChange,
  position,
  label,
  sizes,
}: {
  value: string;
  onChange: (v: string) => void;
  position: string;
  label: string;
  sizes: string[];
}) {
  const [customMode, setCustomMode] = useState(() => isCustomValue(value, sizes));
  const [customNum, setCustomNum] = useState(() => {
    if (!value) return '';
    const match = value.match(/^([\d.]+)/);
    return match ? match[1] : '';
  });
  const [customUnit, setCustomUnit] = useState<'px' | '%'>(() => {
    if (value?.includes('%')) return '%';
    return 'px';
  });

  // Sync custom fields when value changes externally
  useEffect(() => {
    if (isCustomValue(value, sizes)) {
      setCustomMode(true);
      const match = value.match(/^([\d.]+)/);
      if (match) setCustomNum(match[1]);
      if (value?.includes('%')) setCustomUnit('%');
      else setCustomUnit('px');
    }
  }, [value, sizes]);

  if (customMode) {
    return (
      <div className="flex items-center gap-0.5">
        <input
          type="number"
          value={customNum}
          onChange={(e) => {
            setCustomNum(e.target.value);
            if (e.target.value) {
              onChange(`${e.target.value}${customUnit}`);
            }
          }}
          className="w-10 text-[10px] text-center rounded-l border border-border bg-background py-1 text-foreground"
          title={`${label}-${position}`}
          min="0"
          step="1"
          placeholder="0"
        />
        <select
          value={customUnit}
          onChange={(e) => {
            const unit = e.target.value as 'px' | '%';
            setCustomUnit(unit);
            if (customNum) {
              onChange(`${customNum}${unit}`);
            }
          }}
          className="w-8 text-[9px] rounded-none border-y border-border bg-background py-1 text-foreground appearance-none cursor-pointer text-center"
        >
          <option value="px">px</option>
          <option value="%">%</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setCustomMode(false);
            setCustomNum('');
            onChange('');
          }}
          className="w-5 h-[26px] flex items-center justify-center rounded-r border border-border bg-background text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title="Back to presets"
        >
          <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === '__custom__') {
          setCustomMode(true);
          setCustomNum('');
          return;
        }
        onChange(e.target.value);
      }}
      className="w-14 text-[10px] text-center rounded border border-border bg-background px-0.5 py-1 text-foreground appearance-none cursor-pointer"
      title={`${label}-${position}`}
    >
      {sizes.map((size) => (
        <option key={size} value={size}>
          {pxLabels[size] !== undefined ? pxLabels[size] : size || '-'}
        </option>
      ))}
      <option value="__custom__">...</option>
    </select>
  );
}

function BoxModelControl({ top, right, bottom, left, onTopChange, onRightChange, onBottomChange, onLeftChange, sizes, outerLabel, color }: BoxModelControlProps) {
  const borderColor = color === 'blue' ? 'border-blue-400/50' : color === 'green' ? 'border-green-400/50' : 'border-orange-400/50';
  const bgColor = color === 'blue' ? 'bg-blue-500/5' : color === 'green' ? 'bg-green-500/5' : 'bg-orange-500/5';
  const labelColor = color === 'blue' ? 'text-blue-400/60' : color === 'green' ? 'text-green-400/60' : 'text-orange-400/60';

  return (
    <div className={`relative border ${borderColor} ${bgColor} rounded-md p-1`}>
      {/* Label */}
      <span className={`absolute top-1 left-2 text-[9px] uppercase tracking-wider ${labelColor}`}>
        {outerLabel}
      </span>

      {/* Top */}
      <div className="flex justify-center pt-3 pb-1">
        <SpacingInput value={top} onChange={onTopChange} position="top" label={outerLabel} sizes={sizes} />
      </div>

      {/* Left - Content - Right */}
      <div className="flex items-center justify-between px-1">
        <SpacingInput value={left} onChange={onLeftChange} position="left" label={outerLabel} sizes={sizes} />
        <div className="flex-1 mx-2 h-8 border border-border/50 rounded bg-background/50 flex items-center justify-center">
          <span className="text-[9px] text-muted-foreground/50">content</span>
        </div>
        <SpacingInput value={right} onChange={onRightChange} position="right" label={outerLabel} sizes={sizes} />
      </div>

      {/* Bottom */}
      <div className="flex justify-center pt-1 pb-1">
        <SpacingInput value={bottom} onChange={onBottomChange} position="bottom" label={outerLabel} sizes={sizes} />
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

  // Blocks that don't have meaningful text content — no font size controls needed
  const nonTextBlocks: string[] = ['spacer', 'divider', 'image', 'video', 'youtube'];
  const hasTextContent = !nonTextBlocks.includes(block.type);

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
          onTopChange={(v) => updateResponsiveSetting('marginTop', currentViewport, v as SpacingValue)}
          onBottomChange={(v) => updateResponsiveSetting('marginBottom', currentViewport, v as SpacingValue)}
          onLeftChange={(v) => updateResponsiveSetting('marginLeft', currentViewport, v as SpacingValue)}
          onRightChange={(v) => updateResponsiveSetting('marginRight', currentViewport, v as SpacingValue)}
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
          onTopChange={(v) => updateResponsiveSetting('paddingTop', currentViewport, v as SpacingValue)}
          onBottomChange={(v) => updateResponsiveSetting('paddingBottom', currentViewport, v as SpacingValue)}
          onLeftChange={(v) => updateResponsiveSetting('paddingLeft', currentViewport, v as SpacingValue)}
          onRightChange={(v) => updateResponsiveSetting('paddingRight', currentViewport, v as SpacingValue)}
          sizes={spacingSizes}
          outerLabel="padding"
          color="green"
        />
      </div>

      {/* Responsive Font Size */}
      {hasTextContent && (
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
          <p className="text-[10px] text-muted-foreground mt-1">Per-breakpoint size. Use static font size below for all breakpoints.</p>
        </div>
      )}

      <div className="border-t border-border pt-6"></div>
      {/* Background */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Background</label>
        <div className="space-y-3">
          <TokenColorPicker
            label="Background Color"
            value={style.backgroundColor || ''}
            onChange={(v) => updateStyle('backgroundColor', v)}
            placeholder="#ffffff"
          />
        </div>
      </div>

      {/* Text Color */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Text</label>
        <div className="space-y-3">
          <TokenColorPicker
            label="Text Color"
            value={style.color || ''}
            onChange={(v) => updateStyle('color', v)}
            placeholder="#000000"
          />

          {/* Font Size */}
          {hasTextContent && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Font Size</label>
              <select
                value={style.fontSize || ''}
                onChange={(e) => updateStyle('fontSize', e.target.value)}
                className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
              >
                <option value="">Default</option>
                <option value="0.75rem">XS (12px)</option>
                <option value="0.875rem">SM (14px)</option>
                <option value="1rem">Base (16px)</option>
                <option value="1.125rem">LG (18px)</option>
                <option value="1.25rem">XL (20px)</option>
                <option value="1.5rem">2XL (24px)</option>
                <option value="1.875rem">3XL (30px)</option>
                <option value="2.25rem">4XL (36px)</option>
                <option value="3rem">5XL (48px)</option>
                <option value="3.75rem">6XL (60px)</option>
                <option value="4.5rem">7XL (72px)</option>
                <option value="6rem">8XL (96px)</option>
              </select>
            </div>
          )}

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
              <TokenColorPicker
                label="Border Color"
                value={style.borderColor || ''}
                onChange={(v) => updateStyle('borderColor', v)}
                placeholder="#e5e7eb"
              />

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

      {/* Layout (Flex/Grid) */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Layout</label>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Display</label>
            <select
              value={style.display || ''}
              onChange={(e) => updateStyle('display', e.target.value)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">Default (block)</option>
              <option value="flex">Flex</option>
              <option value="inline-flex">Inline Flex</option>
              <option value="grid">Grid</option>
              <option value="inline-block">Inline Block</option>
              <option value="none">None (hidden)</option>
            </select>
          </div>

          {(style.display === 'flex' || style.display === 'inline-flex') && (
            <>
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Direction</label>
                <div className="grid grid-cols-4 gap-1">
                  {([
                    { value: 'row', label: 'Row', icon: '→' },
                    { value: 'column', label: 'Col', icon: '↓' },
                    { value: 'row-reverse', label: 'Row ←', icon: '←' },
                    { value: 'column-reverse', label: 'Col ↑', icon: '↑' },
                  ] as const).map(({ value, label, icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateStyle('flexDirection', value)}
                      className={`px-2 py-1.5 text-[10px] rounded border transition-colors text-center ${
                        (style.flexDirection || 'row') === value
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:border-foreground/30'
                      }`}
                      title={label}
                    >
                      <span className="text-sm block">{icon}</span>
                      <span>{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Justify Content</label>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { value: 'flex-start', label: 'Start' },
                    { value: 'center', label: 'Center' },
                    { value: 'flex-end', label: 'End' },
                    { value: 'space-between', label: 'Between' },
                    { value: 'space-around', label: 'Around' },
                    { value: 'space-evenly', label: 'Evenly' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateStyle('justifyContent', value)}
                      className={`px-2 py-1.5 text-[10px] rounded border transition-colors ${
                        (style.justifyContent || 'flex-start') === value
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Align Items</label>
                <div className="grid grid-cols-5 gap-1">
                  {([
                    { value: 'flex-start', label: 'Start' },
                    { value: 'center', label: 'Center' },
                    { value: 'flex-end', label: 'End' },
                    { value: 'stretch', label: 'Stretch' },
                    { value: 'baseline', label: 'Base' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateStyle('alignItems', value)}
                      className={`px-1 py-1.5 text-[10px] rounded border transition-colors ${
                        (style.alignItems || 'stretch') === value
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Wrap</label>
                <div className="grid grid-cols-3 gap-1">
                  {([
                    { value: 'nowrap', label: 'No Wrap' },
                    { value: 'wrap', label: 'Wrap' },
                    { value: 'wrap-reverse', label: 'Reverse' },
                  ] as const).map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => updateStyle('flexWrap', value)}
                      className={`px-2 py-1.5 text-[10px] rounded border transition-colors ${
                        (style.flexWrap || 'nowrap') === value
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'border-border text-muted-foreground hover:border-foreground/30'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Gap</label>
                <select
                  value={style.gap || ''}
                  onChange={(e) => updateStyle('gap', e.target.value)}
                  className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
                >
                  <option value="">None</option>
                  <option value="0.25rem">4px (xs)</option>
                  <option value="0.5rem">8px (sm)</option>
                  <option value="0.75rem">12px</option>
                  <option value="1rem">16px (md)</option>
                  <option value="1.5rem">24px (lg)</option>
                  <option value="2rem">32px (xl)</option>
                  <option value="3rem">48px (2xl)</option>
                  <option value="4rem">64px (3xl)</option>
                </select>
              </div>
            </>
          )}

          {/* Align Self — always available (positions this block within a parent flex) */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Align Self</label>
            <select
              value={style.alignSelf || ''}
              onChange={(e) => updateStyle('alignSelf', e.target.value)}
              className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
            >
              <option value="">Auto (inherit)</option>
              <option value="flex-start">Start</option>
              <option value="center">Center</option>
              <option value="flex-end">End</option>
              <option value="stretch">Stretch</option>
              <option value="baseline">Baseline</option>
            </select>
            <p className="text-[10px] text-muted-foreground mt-1">Position within a parent flex container</p>
          </div>
        </div>
      </div>

      {/* Dimensions */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Size</label>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Width</label>
              <input type="text" value={style.width || ''} onChange={(e) => updateStyle('width', e.target.value)} placeholder="auto" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Height</label>
              <input type="text" value={style.height || ''} onChange={(e) => updateStyle('height', e.target.value)} placeholder="auto" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Min Width</label>
              <input type="text" value={style.minWidth || ''} onChange={(e) => updateStyle('minWidth', e.target.value)} placeholder="0" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Max Width</label>
              <input type="text" value={style.maxWidth || ''} onChange={(e) => updateStyle('maxWidth', e.target.value)} placeholder="none" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Min Height</label>
              <input type="text" value={style.minHeight || ''} onChange={(e) => updateStyle('minHeight', e.target.value)} placeholder="0" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Max Height</label>
              <input type="text" value={style.maxHeight || ''} onChange={(e) => updateStyle('maxHeight', e.target.value)} placeholder="none" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Overflow</label>
            <select value={style.overflow || ''} onChange={(e) => updateStyle('overflow', e.target.value)} className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground">
              <option value="">Visible</option>
              <option value="hidden">Hidden</option>
              <option value="scroll">Scroll</option>
              <option value="auto">Auto</option>
            </select>
          </div>
        </div>
      </div>

      {/* Position */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Position</label>
        <div className="space-y-3">
          <select value={style.position || ''} onChange={(e) => updateStyle('position', e.target.value)} className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground">
            <option value="">Static</option>
            <option value="relative">Relative</option>
            <option value="absolute">Absolute</option>
            <option value="fixed">Fixed</option>
            <option value="sticky">Sticky</option>
          </select>
          {style.position && style.position !== 'static' && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Top</label>
                  <input type="text" value={style.top || ''} onChange={(e) => updateStyle('top', e.target.value)} placeholder="auto" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Right</label>
                  <input type="text" value={style.right || ''} onChange={(e) => updateStyle('right', e.target.value)} placeholder="auto" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Bottom</label>
                  <input type="text" value={style.bottom || ''} onChange={(e) => updateStyle('bottom', e.target.value)} placeholder="auto" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Left</label>
                  <input type="text" value={style.left || ''} onChange={(e) => updateStyle('left', e.target.value)} placeholder="auto" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
                </div>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Z-Index</label>
                <input type="text" value={style.zIndex || ''} onChange={(e) => updateStyle('zIndex', e.target.value)} placeholder="auto" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Text Formatting */}
      {hasTextContent && (
        <div>
          <label className="block text-sm font-semibold text-foreground mb-3">Text Format</label>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Text Align</label>
              <div className="grid grid-cols-4 gap-1">
                {([
                  { value: '', label: 'Auto' },
                  { value: 'left', label: 'Left' },
                  { value: 'center', label: 'Center' },
                  { value: 'right', label: 'Right' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => updateStyle('textAlign', value)}
                    className={`px-2 py-1.5 text-[10px] rounded border transition-colors ${
                      (style.textAlign || '') === value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-foreground/30'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Transform</label>
              <div className="grid grid-cols-4 gap-1">
                {([
                  { value: '', label: 'None' },
                  { value: 'uppercase', label: 'ABC' },
                  { value: 'lowercase', label: 'abc' },
                  { value: 'capitalize', label: 'Abc' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => updateStyle('textTransform', value)}
                    className={`px-2 py-1.5 text-[10px] rounded border transition-colors ${
                      (style.textTransform || '') === value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-foreground/30'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Decoration</label>
              <div className="grid grid-cols-3 gap-1">
                {([
                  { value: '', label: 'None' },
                  { value: 'underline', label: 'Underline' },
                  { value: 'line-through', label: 'Strike' },
                ] as const).map(({ value, label }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => updateStyle('textDecoration', value)}
                    className={`px-2 py-1.5 text-[10px] rounded border transition-colors ${
                      (style.textDecoration || '') === value
                        ? 'border-primary bg-primary/10 text-primary font-medium'
                        : 'border-border text-muted-foreground hover:border-foreground/30'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Background Image */}
      <div>
        <div className="space-y-3">
          <MediaPicker
            value={style.backgroundImage || ''}
            onChange={(url) => updateStyle('backgroundImage', url)}
            label="Background Image"
          />
          {style.backgroundImage && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Size</label>
                <select value={style.backgroundSize || ''} onChange={(e) => updateStyle('backgroundSize', e.target.value)} className="w-full text-xs rounded border border-border bg-background px-2 py-1 text-foreground">
                  <option value="">Auto</option>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Position</label>
                <select value={style.backgroundPosition || ''} onChange={(e) => updateStyle('backgroundPosition', e.target.value)} className="w-full text-xs rounded border border-border bg-background px-2 py-1 text-foreground">
                  <option value="">Center</option>
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid Layout (when display is grid) */}
      {style.display === 'grid' && (
        <div>
          <label className="block text-sm font-semibold text-foreground mb-3">Grid</label>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Columns</label>
              <input type="text" value={style.gridTemplateColumns || ''} onChange={(e) => updateStyle('gridTemplateColumns', e.target.value)} placeholder="1fr 1fr 1fr" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Rows</label>
              <input type="text" value={style.gridTemplateRows || ''} onChange={(e) => updateStyle('gridTemplateRows', e.target.value)} placeholder="auto" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Gap</label>
              <input type="text" value={style.gridGap || ''} onChange={(e) => updateStyle('gridGap', e.target.value)} placeholder="16px" className="w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono" />
            </div>
          </div>
        </div>
      )}

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

      {/* Transition */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Transition</label>
        <select
          value={style.transition || ''}
          onChange={(e) => updateStyle('transition', e.target.value)}
          className="w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground"
        >
          <option value="">None</option>
          <option value="all 0.15s ease">Fast (150ms)</option>
          <option value="all 0.3s ease">Normal (300ms)</option>
          <option value="all 0.5s ease">Slow (500ms)</option>
          <option value="all 0.3s ease-in-out">Smooth (300ms)</option>
          <option value="transform 0.3s ease, opacity 0.3s ease">Transform + Opacity</option>
        </select>
      </div>

      {/* Custom CSS */}
      <div>
        <label className="block text-sm font-semibold text-foreground mb-3">Custom CSS</label>
        <textarea
          value={style.customCSS || ''}
          onChange={(e) => updateStyle('customCSS', e.target.value)}
          placeholder="property: value; property: value;"
          rows={3}
          className="w-full text-xs rounded border border-border bg-background px-3 py-2 text-foreground font-mono resize-y"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Raw CSS rules for anything not covered above. Use semicolons to separate. Example: <code>filter: blur(2px); mix-blend-mode: multiply</code>
        </p>
      </div>
    </div>
  );
}
