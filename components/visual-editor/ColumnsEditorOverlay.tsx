'use client';

import React, { useCallback, useRef, useState } from 'react';
import { sendToParent } from '@/lib/visual-editor/protocol';
import { IFRAME_MESSAGES } from '@/types/visual-editor';

interface Column {
  id: string;
  // Authored widths can be `number` (50) or `string` ("55%") — LLM-generated
  // and migrated decks store the latter. Always normalize before doing math.
  width: number | string;
}

interface ColumnsEditorOverlayProps {
  blockId: string;
  columns: Column[];
  gap: 'sm' | 'md' | 'lg' | undefined;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const parseColWidth = (w: number | string | undefined): number =>
  typeof w === 'string' ? parseFloat(w) || 50 : (typeof w === 'number' ? w : 50);

const GAP_PX: Record<string, number> = { sm: 16, md: 24, lg: 32 };

/**
 * Overlay controls for a selected columns block in the iframe editor:
 * - Drag handles between columns to resize column widths
 * - Gap drag handle to adjust spacing between columns
 */
export function ColumnsEditorOverlay({
  blockId,
  columns,
  gap,
  containerRef,
}: ColumnsEditorOverlayProps) {
  const [resizingIndex, setResizingIndex] = useState<number | null>(null);
  const [gapDragging, setGapDragging] = useState(false);
  const [liveLabel, setLiveLabel] = useState<string | null>(null);

  // ─── Column Separator Resize ─────────────────────────────────────────────

  const handleSeparatorMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      const containerWidth = container.offsetWidth;
      const startX = e.clientX;
      const startWidths = columns.map(c => parseColWidth(c.width));

      setResizingIndex(index);
      setLiveLabel(`${Math.round(startWidths[index])}% | ${Math.round(startWidths[index + 1])}%`);

      const handleMove = (me: MouseEvent) => {
        const deltaX = me.clientX - startX;
        const deltaPercent = (deltaX / containerWidth) * 100;

        const leftWidth = Math.max(10, Math.min(90, startWidths[index] + deltaPercent));
        const rightWidth = Math.max(10, Math.min(90, startWidths[index + 1] - deltaPercent));

        // Maintain the combined width
        const total = startWidths[index] + startWidths[index + 1];
        const clampedLeft = Math.min(leftWidth, total - 10);
        const clampedRight = total - clampedLeft;

        setLiveLabel(`${Math.round(clampedLeft)}% | ${Math.round(clampedRight)}%`);

        // Send live update to parent
        const newWidths = [...startWidths];
        newWidths[index] = clampedLeft;
        newWidths[index + 1] = clampedRight;

        sendToParent(IFRAME_MESSAGES.COLUMN_RESIZED, {
          blockId,
          columnWidths: newWidths,
        });
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setResizingIndex(null);
        setLiveLabel(null);
      };

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [blockId, columns, containerRef],
  );

  // ─── Gap Drag ────────────────────────────────────────────────────────────

  const handleGapMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const startY = e.clientY;
      const currentGapPx = GAP_PX[gap || 'md'];

      setGapDragging(true);
      setLiveLabel(`gap: ${currentGapPx}px`);

      const handleMove = (me: MouseEvent) => {
        const delta = me.clientY - startY;
        const newGapPx = Math.max(0, currentGapPx + delta);

        // Map to closest preset
        let newGap: 'sm' | 'md' | 'lg';
        if (newGapPx < 20) newGap = 'sm';
        else if (newGapPx < 28) newGap = 'md';
        else newGap = 'lg';

        setLiveLabel(`gap: ${GAP_PX[newGap]}px (${newGap})`);

        sendToParent(IFRAME_MESSAGES.GAP_CHANGED, {
          blockId,
          gap: newGap,
        });
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        setGapDragging(false);
        setLiveLabel(null);
      };

      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [blockId, gap],
  );

  // Calculate separator positions from column widths.
  // Always parse first — `accumulated += "55%"` would coerce to a string and
  // emit "055%%" in the inline `left` style, breaking the divider position.
  const separatorPositions: number[] = [];
  let accumulated = 0;
  for (let i = 0; i < columns.length - 1; i++) {
    accumulated += parseColWidth(columns[i].width);
    separatorPositions.push(accumulated);
  }

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
            padding: '4px 12px',
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

      {/* Column separator drag handles */}
      {separatorPositions.map((pos, i) => (
        <div
          key={`sep-${i}`}
          onMouseDown={(e) => handleSeparatorMouseDown(i, e)}
          style={{
            position: 'absolute',
            top: 0,
            left: `${pos}%`,
            transform: 'translateX(-50%)',
            width: '16px',
            height: '100%',
            cursor: 'col-resize',
            zIndex: 55,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Visual indicator */}
          <div
            style={{
              width: resizingIndex === i ? '4px' : '2px',
              height: '100%',
              maxHeight: '80%',
              backgroundColor: resizingIndex === i ? '#3b82f6' : 'transparent',
              borderRadius: '2px',
              transition: 'background-color 0.15s, width 0.15s',
            }}
            onMouseEnter={(e) => {
              if (resizingIndex === null) (e.target as HTMLElement).style.backgroundColor = '#3b82f6';
            }}
            onMouseLeave={(e) => {
              if (resizingIndex === null) (e.target as HTMLElement).style.backgroundColor = 'transparent';
            }}
          />
          {/* Grip dots */}
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              display: 'flex',
              flexDirection: 'column',
              gap: '3px',
              pointerEvents: 'none',
            }}
          >
            {[0, 1, 2].map((dot) => (
              <div
                key={dot}
                style={{
                  width: '4px',
                  height: '4px',
                  borderRadius: '50%',
                  backgroundColor: resizingIndex === i ? '#fff' : '#94a3b8',
                  transition: 'background-color 0.15s',
                }}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Gap drag handle — small pill at bottom center */}
      {columns.length > 1 && (
        <div
          onMouseDown={handleGapMouseDown}
          style={{
            position: 'absolute',
            bottom: '-12px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '2px 8px',
            backgroundColor: gapDragging ? '#8b5cf6' : '#6366f1',
            color: 'white',
            borderRadius: '10px',
            fontSize: '9px',
            fontWeight: 600,
            cursor: 'ns-resize',
            zIndex: 55,
            border: '1.5px solid white',
            boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            transition: 'background-color 0.15s',
            whiteSpace: 'nowrap',
          }}
          title="Drag to adjust gap between columns"
        >
          <span style={{ fontSize: '10px', lineHeight: 1 }}>↕</span>
          gap: {gap || 'md'}
        </div>
      )}
    </>
  );
}
