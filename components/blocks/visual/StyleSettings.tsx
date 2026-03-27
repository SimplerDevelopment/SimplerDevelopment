'use client';

import { useState, useEffect } from 'react';
import { Block } from '@/types/blocks';
import { Breakpoint, BREAKPOINTS, SpacingSize, SpacingValue, ResponsiveSettings as ResponsiveSettingsType } from '@/types/responsive';
import { TokenColorPicker } from './TokenColorPicker';
import { GoogleFontPicker } from './GoogleFontPicker';
import MediaPicker from '@/components/admin/MediaPicker';

// Collapsible section — defined outside component to keep stable reference across renders
function StyleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        {title}
        <span className="material-icons text-base text-muted-foreground">
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

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
    const match = value.match(/^(-?[\d.]+)/);
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
      const match = value.match(/^(-?[\d.]+)/);
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

  const selectClass = 'w-full text-sm rounded border border-border bg-background px-3 py-2 text-foreground';
  const inputClass = 'w-full text-sm rounded border border-border bg-background px-2 py-1.5 text-foreground font-mono';
  const toggleBtn = (active: boolean) =>
    `px-2 py-1.5 text-[10px] rounded border transition-colors ${
      active
        ? 'border-primary bg-primary/10 text-primary font-medium'
        : 'border-border text-muted-foreground hover:border-foreground/30'
    }`;

  return (
    <div className="-mx-4">
      {/* ── Layout ──────────────────────────────────────────────── */}
      <StyleSection title="Layout" defaultOpen>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Display</label>
          <select value={style.display || ''} onChange={(e) => updateStyle('display', e.target.value)} className={selectClass}>
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
                  { value: 'row', label: 'Row', icon: 'arrow_forward' },
                  { value: 'column', label: 'Col', icon: 'arrow_downward' },
                  { value: 'row-reverse', label: 'Row Rev', icon: 'arrow_back' },
                  { value: 'column-reverse', label: 'Col Rev', icon: 'arrow_upward' },
                ] as const).map(({ value, label, icon }) => (
                  <button key={value} type="button" onClick={() => updateStyle('flexDirection', value)} className={`${toggleBtn((style.flexDirection || 'row') === value)} text-center`} title={label}>
                    <span className="material-icons text-sm block">{icon}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Justify Content</label>
              <div className="grid grid-cols-3 gap-1">
                {(['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => updateStyle('justifyContent', v)} className={toggleBtn((style.justifyContent || 'flex-start') === v)}>
                    {v.replace('flex-', '').replace('space-', '')}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Align Items</label>
              <div className="grid grid-cols-5 gap-1">
                {(['flex-start', 'center', 'flex-end', 'stretch', 'baseline'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => updateStyle('alignItems', v)} className={toggleBtn((style.alignItems || 'stretch') === v)}>
                    {v.replace('flex-', '').slice(0, 6)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Wrap</label>
              <div className="grid grid-cols-3 gap-1">
                {(['nowrap', 'wrap', 'wrap-reverse'] as const).map((v) => (
                  <button key={v} type="button" onClick={() => updateStyle('flexWrap', v)} className={toggleBtn((style.flexWrap || 'nowrap') === v)}>
                    {v === 'nowrap' ? 'No Wrap' : v === 'wrap' ? 'Wrap' : 'Reverse'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Gap</label>
              <select value={style.gap || ''} onChange={(e) => updateStyle('gap', e.target.value)} className={selectClass}>
                <option value="">None</option>
                <option value="0.25rem">4px</option><option value="0.5rem">8px</option><option value="0.75rem">12px</option>
                <option value="1rem">16px</option><option value="1.5rem">24px</option><option value="2rem">32px</option>
                <option value="3rem">48px</option><option value="4rem">64px</option>
              </select>
            </div>
          </>
        )}

        {style.display === 'grid' && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Columns</label>
              <input type="text" value={style.gridTemplateColumns || ''} onChange={(e) => updateStyle('gridTemplateColumns', e.target.value)} placeholder="1fr 1fr 1fr" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Rows</label>
              <input type="text" value={style.gridTemplateRows || ''} onChange={(e) => updateStyle('gridTemplateRows', e.target.value)} placeholder="auto" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1">Gap</label>
              <input type="text" value={style.gridGap || ''} onChange={(e) => updateStyle('gridGap', e.target.value)} placeholder="16px" className={inputClass} />
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Align Self</label>
          <select value={style.alignSelf || ''} onChange={(e) => updateStyle('alignSelf', e.target.value)} className={selectClass}>
            <option value="">Auto</option><option value="flex-start">Start</option><option value="center">Center</option>
            <option value="flex-end">End</option><option value="stretch">Stretch</option><option value="baseline">Baseline</option>
          </select>
        </div>

        {/* Size */}
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-xs text-muted-foreground mb-1">Width</label><input type="text" value={style.width || ''} onChange={(e) => updateStyle('width', e.target.value)} placeholder="auto" className={inputClass} /></div>
          <div><label className="block text-xs text-muted-foreground mb-1">Height</label><input type="text" value={style.height || ''} onChange={(e) => updateStyle('height', e.target.value)} placeholder="auto" className={inputClass} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="block text-xs text-muted-foreground mb-1">Max Width</label><input type="text" value={style.maxWidth || ''} onChange={(e) => updateStyle('maxWidth', e.target.value)} placeholder="none" className={inputClass} /></div>
          <div><label className="block text-xs text-muted-foreground mb-1">Min Height</label><input type="text" value={style.minHeight || ''} onChange={(e) => updateStyle('minHeight', e.target.value)} placeholder="0" className={inputClass} /></div>
        </div>

        <div>
          <label className="block text-xs text-muted-foreground mb-1">Overflow</label>
          <select value={style.overflow || ''} onChange={(e) => updateStyle('overflow', e.target.value)} className={selectClass}>
            <option value="">Visible</option><option value="hidden">Hidden</option><option value="scroll">Scroll</option><option value="auto">Auto</option>
          </select>
        </div>

        {/* Position */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Position</label>
          <select value={style.position || ''} onChange={(e) => updateStyle('position', e.target.value)} className={selectClass}>
            <option value="">Static</option><option value="relative">Relative</option><option value="absolute">Absolute</option>
            <option value="fixed">Fixed</option><option value="sticky">Sticky</option>
          </select>
        </div>
        {style.position && style.position !== 'static' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs text-muted-foreground mb-1">Top</label><input type="text" value={style.top || ''} onChange={(e) => updateStyle('top', e.target.value)} placeholder="auto" className={inputClass} /></div>
              <div><label className="block text-xs text-muted-foreground mb-1">Right</label><input type="text" value={style.right || ''} onChange={(e) => updateStyle('right', e.target.value)} placeholder="auto" className={inputClass} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="block text-xs text-muted-foreground mb-1">Bottom</label><input type="text" value={style.bottom || ''} onChange={(e) => updateStyle('bottom', e.target.value)} placeholder="auto" className={inputClass} /></div>
              <div><label className="block text-xs text-muted-foreground mb-1">Left</label><input type="text" value={style.left || ''} onChange={(e) => updateStyle('left', e.target.value)} placeholder="auto" className={inputClass} /></div>
            </div>
            <div><label className="block text-xs text-muted-foreground mb-1">Z-Index</label><input type="text" value={style.zIndex || ''} onChange={(e) => updateStyle('zIndex', e.target.value)} placeholder="auto" className={inputClass} /></div>
          </>
        )}
      </StyleSection>

      {/* ── Margin & Padding ────────────────────────────────────── */}
      <StyleSection title="Margin & Padding">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
          <span className="material-icons text-sm">{BREAKPOINTS[currentViewport].icon}</span>
          <span>Editing for {BREAKPOINTS[currentViewport].label}</span>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Margin</label>
          <BoxModelControl
            top={responsive.marginTop?.[currentViewport] || ''} bottom={responsive.marginBottom?.[currentViewport] || ''}
            left={responsive.marginLeft?.[currentViewport] || ''} right={responsive.marginRight?.[currentViewport] || ''}
            onTopChange={(v) => updateResponsiveSetting('marginTop', currentViewport, v as SpacingValue)}
            onBottomChange={(v) => updateResponsiveSetting('marginBottom', currentViewport, v as SpacingValue)}
            onLeftChange={(v) => updateResponsiveSetting('marginLeft', currentViewport, v as SpacingValue)}
            onRightChange={(v) => updateResponsiveSetting('marginRight', currentViewport, v as SpacingValue)}
            sizes={spacingSizes} outerLabel="margin" color="blue"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Padding</label>
          <BoxModelControl
            top={responsive.paddingTop?.[currentViewport] || ''} bottom={responsive.paddingBottom?.[currentViewport] || ''}
            left={responsive.paddingLeft?.[currentViewport] || ''} right={responsive.paddingRight?.[currentViewport] || ''}
            onTopChange={(v) => updateResponsiveSetting('paddingTop', currentViewport, v as SpacingValue)}
            onBottomChange={(v) => updateResponsiveSetting('paddingBottom', currentViewport, v as SpacingValue)}
            onLeftChange={(v) => updateResponsiveSetting('paddingLeft', currentViewport, v as SpacingValue)}
            onRightChange={(v) => updateResponsiveSetting('paddingRight', currentViewport, v as SpacingValue)}
            sizes={spacingSizes} outerLabel="padding" color="green"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Static Padding</label>
          <BoxModelControl
            top={parseSide(style.padding, 'top')} right={parseSide(style.padding, 'right')}
            bottom={parseSide(style.padding, 'bottom')} left={parseSide(style.padding, 'left')}
            onTopChange={(v) => updateStyle('padding', buildShorthand(v, parseSide(style.padding, 'right'), parseSide(style.padding, 'bottom'), parseSide(style.padding, 'left')))}
            onRightChange={(v) => updateStyle('padding', buildShorthand(parseSide(style.padding, 'top'), v, parseSide(style.padding, 'bottom'), parseSide(style.padding, 'left')))}
            onBottomChange={(v) => updateStyle('padding', buildShorthand(parseSide(style.padding, 'top'), parseSide(style.padding, 'right'), v, parseSide(style.padding, 'left')))}
            onLeftChange={(v) => updateStyle('padding', buildShorthand(parseSide(style.padding, 'top'), parseSide(style.padding, 'right'), parseSide(style.padding, 'bottom'), v))}
            sizes={pxSizes} outerLabel="padding" color="green"
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Static Margin</label>
          <BoxModelControl
            top={parseSide(style.margin, 'top')} right={parseSide(style.margin, 'right')}
            bottom={parseSide(style.margin, 'bottom')} left={parseSide(style.margin, 'left')}
            onTopChange={(v) => updateStyle('margin', buildShorthand(v, parseSide(style.margin, 'right'), parseSide(style.margin, 'bottom'), parseSide(style.margin, 'left')))}
            onRightChange={(v) => updateStyle('margin', buildShorthand(parseSide(style.margin, 'top'), v, parseSide(style.margin, 'bottom'), parseSide(style.margin, 'left')))}
            onBottomChange={(v) => updateStyle('margin', buildShorthand(parseSide(style.margin, 'top'), parseSide(style.margin, 'right'), v, parseSide(style.margin, 'left')))}
            onLeftChange={(v) => updateStyle('margin', buildShorthand(parseSide(style.margin, 'top'), parseSide(style.margin, 'right'), parseSide(style.margin, 'bottom'), v))}
            sizes={pxSizes} outerLabel="margin" color="blue"
          />
        </div>
      </StyleSection>

      {/* ── Visibility ──────────────────────────────────────────── */}
      <StyleSection title="Visibility">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={responsive.visibility?.[currentViewport] !== false} onChange={(e) => updateResponsiveSetting('visibility', currentViewport, e.target.checked)} className="rounded border-border" />
          <span className="font-medium">Visible on {BREAKPOINTS[currentViewport].label}</span>
        </label>
        <p className="text-xs text-muted-foreground">Hide this block on {BREAKPOINTS[currentViewport].label.toLowerCase()} devices</p>
      </StyleSection>

      {/* ── Background ──────────────────────────────────────────── */}
      <StyleSection title="Background">
        <TokenColorPicker label="Background Color" value={style.backgroundColor || ''} onChange={(v) => updateStyle('backgroundColor', v)} placeholder="#ffffff" />

        {/* Gradient */}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Gradient</label>
          <input
            type="text"
            value={style.backgroundGradient || ''}
            onChange={(e) => updateStyle('backgroundGradient', e.target.value)}
            placeholder="linear-gradient(135deg, #667eea, #764ba2)"
            className={inputClass}
          />
          {!style.backgroundGradient && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {[
                { label: 'Sunset', value: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' },
                { label: 'Ocean', value: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' },
                { label: 'Forest', value: 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)' },
                { label: 'Dark', value: 'linear-gradient(135deg, #0c0c0c 0%, #1a1a2e 100%)' },
                { label: 'Warm', value: 'linear-gradient(135deg, #f8b500 0%, #fceabb 100%)' },
              ].map((g) => (
                <button
                  key={g.label}
                  type="button"
                  onClick={() => updateStyle('backgroundGradient', g.value)}
                  className="h-6 w-10 rounded border border-border text-[8px] text-white font-medium"
                  style={{ background: g.value }}
                  title={g.label}
                />
              ))}
            </div>
          )}
          {style.backgroundGradient && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="h-6 flex-1 rounded border border-border" style={{ background: style.backgroundGradient }} />
              <button type="button" onClick={() => updateStyle('backgroundGradient', '')} className="text-muted-foreground hover:text-destructive">
                <span className="material-icons text-sm">close</span>
              </button>
            </div>
          )}
        </div>

        {/* Image */}
        <MediaPicker value={style.backgroundImage || ''} onChange={(url) => updateStyle('backgroundImage', url)} label="Background Image" />
        {style.backgroundImage && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Size</label>
                <select value={style.backgroundSize || ''} onChange={(e) => updateStyle('backgroundSize', e.target.value)} className={selectClass}>
                  <option value="">Auto</option>
                  <option value="cover">Cover</option>
                  <option value="contain">Contain</option>
                  <option value="100% 100%">Stretch</option>
                  <option value="50%">50%</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Position</label>
                <select value={style.backgroundPosition || ''} onChange={(e) => updateStyle('backgroundPosition', e.target.value)} className={selectClass}>
                  <option value="">Center</option>
                  <option value="top">Top</option>
                  <option value="top left">Top Left</option>
                  <option value="top right">Top Right</option>
                  <option value="bottom">Bottom</option>
                  <option value="bottom left">Bottom Left</option>
                  <option value="bottom right">Bottom Right</option>
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Repeat</label>
                <select value={style.backgroundRepeat || ''} onChange={(e) => updateStyle('backgroundRepeat', e.target.value)} className={selectClass}>
                  <option value="">Default</option>
                  <option value="no-repeat">No Repeat</option>
                  <option value="repeat">Repeat</option>
                  <option value="repeat-x">Repeat X</option>
                  <option value="repeat-y">Repeat Y</option>
                  <option value="space">Space</option>
                  <option value="round">Round</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-muted-foreground mb-1">Attachment</label>
                <select value={style.backgroundAttachment || ''} onChange={(e) => updateStyle('backgroundAttachment', e.target.value)} className={selectClass}>
                  <option value="">Scroll</option>
                  <option value="fixed">Fixed (parallax)</option>
                  <option value="local">Local</option>
                </select>
              </div>
            </div>
          </>
        )}

        {/* Blend Mode */}
        {(style.backgroundImage || style.backgroundGradient) && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Blend Mode</label>
            <select value={style.backgroundBlendMode || ''} onChange={(e) => updateStyle('backgroundBlendMode', e.target.value)} className={selectClass}>
              <option value="">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
              <option value="color-dodge">Color Dodge</option>
              <option value="color-burn">Color Burn</option>
              <option value="hard-light">Hard Light</option>
              <option value="soft-light">Soft Light</option>
              <option value="difference">Difference</option>
              <option value="exclusion">Exclusion</option>
              <option value="hue">Hue</option>
              <option value="saturation">Saturation</option>
              <option value="luminosity">Luminosity</option>
            </select>
          </div>
        )}
      </StyleSection>

      {/* ── Typography ──────────────────────────────────────────── */}
      <StyleSection title="Typography">
        <TokenColorPicker label="Text Color" value={style.color || ''} onChange={(v) => updateStyle('color', v)} placeholder="#000000" />

        {hasTextContent && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Font Size</label>
              <select value={style.fontSize || ''} onChange={(e) => updateStyle('fontSize', e.target.value)} className={selectClass}>
                <option value="">Default</option>
                <option value="0.75rem">XS (12px)</option><option value="0.875rem">SM (14px)</option>
                <option value="1rem">Base (16px)</option><option value="1.125rem">LG (18px)</option>
                <option value="1.25rem">XL (20px)</option><option value="1.5rem">2XL (24px)</option>
                <option value="1.875rem">3XL (30px)</option><option value="2.25rem">4XL (36px)</option>
                <option value="3rem">5XL (48px)</option><option value="3.75rem">6XL (60px)</option>
                <option value="4.5rem">7XL (72px)</option><option value="6rem">8XL (96px)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Responsive Font Size</label>
              <select value={responsive.fontSize?.[currentViewport] || ''} onChange={(e) => updateResponsiveSetting('fontSize', currentViewport, e.target.value)} className={selectClass}>
                <option value="">Default</option>
                {fontSizes.map((size) => <option key={size} value={size}>{size}</option>)}
              </select>
              <p className="text-[10px] text-muted-foreground mt-1">Per-breakpoint override for {BREAKPOINTS[currentViewport].label}</p>
            </div>
          </>
        )}

        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Font Family</label>
          <GoogleFontPicker
            value={style.fontFamily || ''}
            onChange={(v) => updateStyle('fontFamily', v)}
          />
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Font Weight</label>
          <select value={style.fontWeight || ''} onChange={(e) => updateStyle('fontWeight', e.target.value)} className={selectClass}>
            <option value="">Default</option><option value="300">Light</option><option value="400">Normal</option>
            <option value="500">Medium</option><option value="600">Semibold</option><option value="700">Bold</option>
            <option value="800">Extra Bold</option><option value="900">Black</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Line Height</label>
          <select value={style.lineHeight || ''} onChange={(e) => updateStyle('lineHeight', e.target.value)} className={selectClass}>
            <option value="">Default</option><option value="1">None</option><option value="1.25">Tight</option>
            <option value="1.375">Snug</option><option value="1.5">Normal</option><option value="1.625">Relaxed</option><option value="2">Loose</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Letter Spacing</label>
          <select value={style.letterSpacing || ''} onChange={(e) => updateStyle('letterSpacing', e.target.value)} className={selectClass}>
            <option value="">Default</option><option value="-0.05em">Tighter</option><option value="-0.025em">Tight</option>
            <option value="0">Normal</option><option value="0.025em">Wide</option><option value="0.05em">Wider</option><option value="0.1em">Widest</option>
          </select>
        </div>

        {hasTextContent && (
          <>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Text Align</label>
              <div className="grid grid-cols-4 gap-1">
                {([{ v: '', l: 'Auto', i: 'format_align_left' }, { v: 'left', l: 'Left', i: 'format_align_left' }, { v: 'center', l: 'Center', i: 'format_align_center' }, { v: 'right', l: 'Right', i: 'format_align_right' }] as const).map(({ v, l, i }) => (
                  <button key={l} type="button" onClick={() => updateStyle('textAlign', v)} className={toggleBtn((style.textAlign || '') === v)} title={l}>
                    <span className="material-icons text-sm">{i}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Transform</label>
              <div className="grid grid-cols-4 gap-1">
                {([{ v: '', l: 'None' }, { v: 'uppercase', l: 'ABC' }, { v: 'lowercase', l: 'abc' }, { v: 'capitalize', l: 'Abc' }] as const).map(({ v, l }) => (
                  <button key={l} type="button" onClick={() => updateStyle('textTransform', v)} className={toggleBtn((style.textTransform || '') === v)}>{l}</button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Decoration</label>
              <div className="grid grid-cols-3 gap-1">
                {([{ v: '', l: 'None' }, { v: 'underline', l: 'Underline' }, { v: 'line-through', l: 'Strike' }] as const).map(({ v, l }) => (
                  <button key={l} type="button" onClick={() => updateStyle('textDecoration', v)} className={toggleBtn((style.textDecoration || '') === v)}>{l}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </StyleSection>

      {/* ── Border ──────────────────────────────────────────────── */}
      <StyleSection title="Border">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Border Width</label>
          <select value={style.borderWidth || ''} onChange={(e) => updateStyle('borderWidth', e.target.value)} className={selectClass}>
            <option value="">None</option><option value="1px">1px</option><option value="2px">2px</option><option value="4px">4px</option><option value="8px">8px</option>
          </select>
        </div>
        {style.borderWidth && (
          <>
            <TokenColorPicker label="Border Color" value={style.borderColor || ''} onChange={(v) => updateStyle('borderColor', v)} placeholder="#e5e7eb" />
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Style</label>
              <select value={style.borderStyle || 'solid'} onChange={(e) => updateStyle('borderStyle', e.target.value)} className={selectClass}>
                <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option><option value="double">Double</option>
              </select>
            </div>
          </>
        )}
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Border Radius</label>
          <select value={style.borderRadius || ''} onChange={(e) => updateStyle('borderRadius', e.target.value)} className={selectClass}>
            <option value="">None</option><option value="0.25rem">SM (4px)</option><option value="0.375rem">MD (6px)</option>
            <option value="0.5rem">LG (8px)</option><option value="0.75rem">XL (12px)</option>
            <option value="1rem">2XL (16px)</option><option value="1.5rem">3XL (24px)</option><option value="9999px">Full (Pill)</option>
          </select>
        </div>
      </StyleSection>

      {/* ── Shadows & Effects ───────────────────────────────────── */}
      <StyleSection title="Shadows & Effects">
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Box Shadow</label>
          <select value={style.boxShadow || ''} onChange={(e) => updateStyle('boxShadow', e.target.value)} className={selectClass}>
            <option value="">None</option>
            <option value="0 1px 2px 0 rgb(0 0 0 / 0.05)">Small</option>
            <option value="0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)">Medium</option>
            <option value="0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)">Large</option>
            <option value="0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)">XL</option>
            <option value="0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)">2XL</option>
            <option value="0 25px 50px -12px rgb(0 0 0 / 0.25)">Inner</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Opacity</label>
          <div className="flex items-center gap-3">
            <input type="range" min="0" max="100" value={style.opacity ? parseFloat(style.opacity) * 100 : 100} onChange={(e) => updateStyle('opacity', (parseInt(e.target.value) / 100).toString())} className="flex-1" />
            <span className="text-xs text-muted-foreground w-8 text-right">{style.opacity ? Math.round(parseFloat(style.opacity) * 100) : 100}%</span>
          </div>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1.5">Transition</label>
          <select value={style.transition || ''} onChange={(e) => updateStyle('transition', e.target.value)} className={selectClass}>
            <option value="">None</option><option value="all 0.15s ease">Fast (150ms)</option>
            <option value="all 0.3s ease">Normal (300ms)</option><option value="all 0.5s ease">Slow (500ms)</option>
            <option value="all 0.3s ease-in-out">Smooth</option><option value="transform 0.3s ease, opacity 0.3s ease">Transform + Opacity</option>
          </select>
        </div>
      </StyleSection>

      {/* ── CSS Properties ──────────────────────────────────────── */}
      <StyleSection title="CSS Properties">
        <textarea
          value={style.customCSS || ''}
          onChange={(e) => updateStyle('customCSS', e.target.value)}
          placeholder="property: value; property: value;"
          rows={3}
          className="w-full text-xs rounded border border-border bg-background px-3 py-2 text-foreground font-mono resize-y"
        />
        <p className="text-[10px] text-muted-foreground">
          Raw CSS rules. Example: <code>filter: blur(2px); mix-blend-mode: multiply</code>
        </p>
      </StyleSection>
    </div>
  );
}
