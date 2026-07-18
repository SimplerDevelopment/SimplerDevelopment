'use client';

import React, { useCallback, useState } from 'react';

// ─── Spacing Handles (Padding + Margin drag controls) ────────────────────────

type SpacingSide = 'top' | 'right' | 'bottom' | 'left';

function parseSpacing(value?: string): { top: number; right: number; bottom: number; left: number } {
  if (!value) return { top: 0, right: 0, bottom: 0, left: 0 };
  const parts = value.replace(/px/g, '').trim().split(/\s+/).map(Number);
  if (parts.length === 1) return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
  if (parts.length === 2) return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
  if (parts.length === 3) return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
  return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
}

function toSpacingString(s: { top: number; right: number; bottom: number; left: number }): string {
  if (s.top === s.right && s.right === s.bottom && s.bottom === s.left) return `${s.top}px`;
  if (s.top === s.bottom && s.left === s.right) return `${s.top}px ${s.right}px`;
  return `${s.top}px ${s.right}px ${s.bottom}px ${s.left}px`;
}

export function SpacingHandles({
  blockId,
  currentStyle,
  onStyleUpdate,
}: {
  blockId: string;
  currentStyle?: { padding?: string; margin?: string };
  onStyleUpdate: (blockId: string, style: Record<string, string>) => void;
}) {
  const [activeHandle, setActiveHandle] = useState<{ type: 'padding' | 'margin'; side: SpacingSide } | null>(null);
  const [liveLabel, setLiveLabel] = useState<string | null>(null);

  const handleMouseDown = useCallback(
    (type: 'padding' | 'margin', side: SpacingSide, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;
      const current = parseSpacing(type === 'padding' ? currentStyle?.padding : currentStyle?.margin);
      const startVal = current[side];

      setActiveHandle({ type, side });
      setLiveLabel(`${type} ${side}: ${startVal}px`);

      const handleMove = (me: MouseEvent) => {
        const isVertical = side === 'top' || side === 'bottom';
        const delta = isVertical
          ? me.clientY - startY
          : startX - me.clientX;
        const newVal = Math.max(0, Math.round(startVal + delta));
        const updated = { ...current, [side]: newVal };
        setLiveLabel(`${type} ${side}: ${newVal}px`);
        onStyleUpdate(blockId, { [type]: toSpacingString(updated) });
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setActiveHandle(null);
        setLiveLabel(null);
      };

      document.body.style.cursor = isVertical(side) ? 'ns-resize' : 'ew-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [blockId, currentStyle, onStyleUpdate],
  );

  const padding = parseSpacing(currentStyle?.padding);
  const margin = parseSpacing(currentStyle?.margin);

  const sides: SpacingSide[] = ['top', 'right', 'bottom', 'left'];

  return (
    <>
      {/* Live value tooltip */}
      {liveLabel && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            background: '#1e293b',
            color: '#fff',
            padding: '4px 10px',
            borderRadius: '4px',
            fontSize: '11px',
            fontWeight: 600,
            zIndex: 60,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          {liveLabel}
        </div>
      )}

      {/* Padding handles (inner edges) */}
      {sides.map((side) => (
        <SpacingHandle
          key={`padding-${side}`}
          type="padding"
          side={side}
          value={padding[side]}
          isActive={activeHandle?.type === 'padding' && activeHandle?.side === side}
          onMouseDown={(e) => handleMouseDown('padding', side, e)}
        />
      ))}

      {/* Margin handles (outer edges) */}
      {sides.map((side) => (
        <SpacingHandle
          key={`margin-${side}`}
          type="margin"
          side={side}
          value={margin[side]}
          isActive={activeHandle?.type === 'margin' && activeHandle?.side === side}
          onMouseDown={(e) => handleMouseDown('margin', side, e)}
        />
      ))}
    </>
  );
}

function isVertical(side: SpacingSide): boolean {
  return side === 'top' || side === 'bottom';
}

function SpacingHandle({
  type,
  side,
  value,
  isActive,
  onMouseDown,
}: {
  type: 'padding' | 'margin';
  side: SpacingSide;
  value: number;
  isActive: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}) {
  const isPadding = type === 'padding';
  const color = isPadding ? 'rgba(34,197,94,0.6)' : 'rgba(249,115,22,0.6)';
  const activeColor = isPadding ? 'rgba(34,197,94,0.9)' : 'rgba(249,115,22,0.9)';
  const offset = isPadding ? 0 : -8;
  const vertical = isVertical(side);
  const cursor = vertical ? 'ns-resize' : 'ew-resize';

  const positionStyle: React.CSSProperties = {
    position: 'absolute',
    zIndex: isPadding ? 52 : 53,
    cursor,
    backgroundColor: isActive ? activeColor : 'transparent',
    transition: 'background-color 0.15s',
  };

  // Size and position depend on side
  if (vertical) {
    Object.assign(positionStyle, {
      left: '10%',
      width: '80%',
      height: '6px',
      ...(side === 'top'
        ? { top: `${offset}px` }
        : { bottom: `${offset}px` }),
    });
  } else {
    Object.assign(positionStyle, {
      top: '10%',
      height: '80%',
      width: '6px',
      ...(side === 'left'
        ? { left: `${offset}px` }
        : { right: `${offset}px` }),
    });
  }

  return (
    <div
      onMouseDown={onMouseDown}
      onMouseEnter={(e) => { (e.target as HTMLElement).style.backgroundColor = color; }}
      onMouseLeave={(e) => { if (!isActive) (e.target as HTMLElement).style.backgroundColor = 'transparent'; }}
      style={positionStyle}
      title={`Drag to adjust ${type}-${side} (${value}px)`}
    />
  );
}
