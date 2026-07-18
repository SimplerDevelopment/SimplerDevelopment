'use client';

import { useState, useEffect } from 'react';

// Collapsible section — defined outside component to keep stable reference across renders
export function StyleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
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

export const pxSizes = ['', '0', '0.25rem', '0.5rem', '0.75rem', '1rem', '1.5rem', '2rem', '3rem', '4rem'];
const pxLabels: Record<string, string> = {
  '': '-', '0': '0', '0.25rem': '4', '0.5rem': '8', '0.75rem': '12',
  '1rem': '16', '1.5rem': '24', '2rem': '32', '3rem': '48', '4rem': '64',
};

export function parseSide(shorthand: string | undefined, side: 'top' | 'right' | 'bottom' | 'left'): string {
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

export function buildShorthand(top: string, right: string, bottom: string, left: string): string {
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

  // Sync custom fields when value changes externally (e.g. switching breakpoints)
  useEffect(() => {
    if (isCustomValue(value, sizes)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCustomMode(true);
      const match = value.match(/^(-?[\d.]+)/);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (match) setCustomNum(match[1]);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (value?.includes('%')) setCustomUnit('%');
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

export function BoxModelControl({ top, right, bottom, left, onTopChange, onRightChange, onBottomChange, onLeftChange, sizes, outerLabel, color }: BoxModelControlProps) {
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

// VEQA-034: combined static-padding + static-margin control — a single nested
// DevTools-style box-model diagram (outer Margin ring wraps inner Padding
// ring) instead of two separate BoxModelControl instances. Writes
// block.style.padding / block.style.margin as SEPARATE shorthand strings.
interface StaticBoxModelProps {
  padding: string | undefined;
  margin: string | undefined;
  onPaddingChange: (v: string) => void;
  onMarginChange: (v: string) => void;
  sizes: string[];
}

type Side = 'top' | 'right' | 'bottom' | 'left';

export function StaticBoxModel({ padding, margin, onPaddingChange, onMarginChange, sizes }: StaticBoxModelProps) {
  const p = { top: parseSide(padding, 'top'), right: parseSide(padding, 'right'), bottom: parseSide(padding, 'bottom'), left: parseSide(padding, 'left') };
  const m = { top: parseSide(margin, 'top'), right: parseSide(margin, 'right'), bottom: parseSide(margin, 'bottom'), left: parseSide(margin, 'left') };

  const setPadding = (side: Side, v: string) => onPaddingChange(buildShorthand(
    side === 'top' ? v : p.top, side === 'right' ? v : p.right, side === 'bottom' ? v : p.bottom, side === 'left' ? v : p.left,
  ));
  const setMargin = (side: Side, v: string) => onMarginChange(buildShorthand(
    side === 'top' ? v : m.top, side === 'right' ? v : m.right, side === 'bottom' ? v : m.bottom, side === 'left' ? v : m.left,
  ));

  return (
    <div className="relative border border-blue-400/50 bg-blue-500/5 rounded-md p-1">
      <span className="absolute top-1 left-2 text-[9px] uppercase tracking-wider text-blue-400/60">margin</span>
      <div className="flex justify-center pt-3 pb-1">
        <SpacingInput value={m.top} onChange={(v) => setMargin('top', v)} position="top" label="margin" sizes={sizes} />
      </div>
      <div className="flex items-center justify-between px-1">
        <SpacingInput value={m.left} onChange={(v) => setMargin('left', v)} position="left" label="margin" sizes={sizes} />

        {/* Inner padding ring */}
        <div className="relative flex-1 mx-2 border border-green-400/50 bg-green-500/5 rounded-md p-1">
          <span className="absolute top-1 left-2 text-[9px] uppercase tracking-wider text-green-400/60">padding</span>
          <div className="flex justify-center pt-3 pb-1">
            <SpacingInput value={p.top} onChange={(v) => setPadding('top', v)} position="top" label="padding" sizes={sizes} />
          </div>
          <div className="flex items-center justify-between px-1">
            <SpacingInput value={p.left} onChange={(v) => setPadding('left', v)} position="left" label="padding" sizes={sizes} />
            <div className="flex-1 mx-2 h-8 border border-border/50 rounded bg-background/50 flex items-center justify-center">
              <span className="text-[9px] text-muted-foreground/50">content</span>
            </div>
            <SpacingInput value={p.right} onChange={(v) => setPadding('right', v)} position="right" label="padding" sizes={sizes} />
          </div>
          <div className="flex justify-center pt-1 pb-1">
            <SpacingInput value={p.bottom} onChange={(v) => setPadding('bottom', v)} position="bottom" label="padding" sizes={sizes} />
          </div>
        </div>

        <SpacingInput value={m.right} onChange={(v) => setMargin('right', v)} position="right" label="margin" sizes={sizes} />
      </div>
      <div className="flex justify-center pt-1 pb-1">
        <SpacingInput value={m.bottom} onChange={(v) => setMargin('bottom', v)} position="bottom" label="margin" sizes={sizes} />
      </div>
    </div>
  );
}
