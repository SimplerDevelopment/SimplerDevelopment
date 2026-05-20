'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { ColumnsEditorOverlay } from './ColumnsEditorOverlay';
import { sendToParent } from '@/lib/visual-editor/protocol';
import { IFRAME_MESSAGES } from '@/types/visual-editor';

/**
 * Module-level flag for Cmd/Ctrl+click deep-select.
 * When Cmd/Ctrl is held, the innermost SelectableBlock's onClick fires first
 * (event bubbling goes inner -> outer) and sets this flag. Outer handlers
 * then see the flag and skip their own onClicked call, so the deepest block wins.
 */
let deepSelectClaimed = false;

interface ColumnData {
  id: string;
  // Authored widths can be `number` (50) or `string` ("55%") — see
  // ColumnsEditorOverlay's parseColWidth for normalization.
  width: number | string;
}

// Block types that have add/remove array items
const ARRAY_BLOCK_TYPES: Record<string, { field: string; label: string }> = {
  'card-grid': { field: 'cards', label: 'Card' },
  'stats': { field: 'stats', label: 'Stat' },
  'gallery': { field: 'images', label: 'Image' },
  'services-grid': { field: 'services', label: 'Service' },
  'accordion': { field: 'items', label: 'Item' },
};

interface SelectableBlockProps {
  blockId: string;
  blockType?: string;
  isSelected: boolean;
  isHovered: boolean;
  onClicked: (blockId: string, modifiers?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean }) => void;
  onHovered: (blockId: string | null) => void;
  onAddAfter?: (blockId: string) => void;
  onResize?: (blockId: string, width: string | undefined, height: string | undefined) => void;
  onStyleUpdate?: (blockId: string, style: Record<string, string>) => void;
  currentStyle?: { padding?: string; margin?: string };
  sizeStyle?: { width?: string; height?: string; maxWidth?: string; minWidth?: string; maxHeight?: string; minHeight?: string };
  dragListeners?: SyntheticListenerMap;
  columnsData?: { columns: ColumnData[]; gap?: 'sm' | 'md' | 'lg' };
  children: React.ReactNode;
}

export function SelectableBlock({
  blockId,
  blockType,
  isSelected,
  isHovered,
  onClicked,
  onHovered,
  onAddAfter,
  onResize,
  onStyleUpdate,
  currentStyle,
  sizeStyle,
  dragListeners,
  columnsData,
  children,
}: SelectableBlockProps) {
  const showControls = isSelected || isHovered;
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      data-block-id={blockId}
      data-block-type={blockType}
      onClick={(e) => {
        // If the click landed inside a contenteditable element (e.g. an
        // html-render block's `[data-field]`), let the browser place the
        // caret normally. preventDefault would cancel caret placement, and
        // firing onClicked() would trigger a BLOCKS_UPDATE round-trip that
        // re-renders the html via dangerouslySetInnerHTML, detaching the
        // very node the user just clicked — focus would be lost.
        // Block selection still happens on a click outside the editable
        // text (e.g. block padding / nav handles).
        const target = e.target as HTMLElement | null;
        if (target?.isContentEditable || target?.closest('[contenteditable="true"]')) {
          return;
        }
        e.preventDefault();
        const modifiers = { shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey };
        const isDeepSelect = (e.metaKey || e.ctrlKey) && !e.shiftKey;
        if (isDeepSelect) {
          // Cmd/Ctrl+click (without Shift): select the innermost (deepest) block under the cursor.
          // Don't stopPropagation so the event reaches all nested SelectableBlocks.
          // The innermost fires first; once it claims the click, outer handlers skip.
          if (deepSelectClaimed) return;
          deepSelectClaimed = true;
          onClicked(blockId, modifiers);
          // Reset the flag asynchronously so it's clean for the next click
          requestAnimationFrame(() => { deepSelectClaimed = false; });
        } else {
          e.stopPropagation();
          onClicked(blockId, modifiers);
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).ownerDocument.documentElement.getBoundingClientRect();
        sendToParent(IFRAME_MESSAGES.BLOCK_CONTEXT_MENU, {
          blockId,
          x: e.clientX,
          y: e.clientY,
          iframeWidth: rect.width,
          iframeHeight: rect.height,
          modifiers: { shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey },
        });
      }}
      onMouseEnter={() => onHovered(blockId)}
      onMouseLeave={() => onHovered(null)}
      className="relative"
      style={{
        pointerEvents: 'auto',
        outline: isSelected
          ? '2px solid #3b82f6'
          : isHovered
            ? '1px dashed #94a3b8'
            : 'none',
        outlineOffset: '2px',
        borderRadius: '4px',
        transition: 'outline 0.15s ease',
        ...(sizeStyle?.width ? { width: sizeStyle.width } : {}),
        ...(sizeStyle?.height ? { height: sizeStyle.height } : {}),
        ...(sizeStyle?.maxWidth ? { maxWidth: sizeStyle.maxWidth } : {}),
        ...(sizeStyle?.minWidth ? { minWidth: sizeStyle.minWidth } : {}),
        ...(sizeStyle?.maxHeight ? { maxHeight: sizeStyle.maxHeight } : {}),
        ...(sizeStyle?.minHeight ? { minHeight: sizeStyle.minHeight } : {}),
      }}
    >
      {/* Top toolbar on hover/select — drag handle lives here */}
      {showControls && (
        <div
          className="absolute -top-6 left-1 flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-t z-50"
          style={{
            backgroundColor: isSelected ? '#3b82f6' : '#64748b',
            color: 'white',
            pointerEvents: 'auto',
          }}
        >
          <span
            {...(dragListeners || {})}
            className="cursor-grab active:cursor-grabbing"
            style={{ lineHeight: 1, fontSize: '12px' }}
            onClick={(e) => e.stopPropagation()}
          >
            ⠿
          </span>
          <span>{blockType || 'Block'}</span>
        </div>
      )}

      {/* Content — editable text when selected */}
      <EditableContent
        blockId={blockId}
        isSelected={isSelected}
        containerRef={containerRef}
      >
        {children}
      </EditableContent>

      {/* Resize handles (selected only) */}
      {isSelected && onResize && (
        <>
          <ResizeHandle
            direction="right"
            containerRef={containerRef}
            onResizeEnd={(w, h) => onResize(blockId, w, h)}
          />
          <ResizeHandle
            direction="bottom"
            containerRef={containerRef}
            onResizeEnd={(w, h) => onResize(blockId, w, h)}
          />
          <ResizeHandle
            direction="corner"
            containerRef={containerRef}
            onResizeEnd={(w, h) => onResize(blockId, w, h)}
          />
        </>
      )}

      {/* Spacing drag handles (padding/margin) */}
      {isSelected && onStyleUpdate && (
        <SpacingHandles
          blockId={blockId}
          currentStyle={currentStyle}
          onStyleUpdate={onStyleUpdate}
        />
      )}

      {/* Column resize + gap drag controls */}
      {isSelected && columnsData && columnsData.columns.length > 1 && (
        <ColumnsEditorOverlay
          blockId={blockId}
          columns={columnsData.columns}
          gap={columnsData.gap}
          containerRef={containerRef}
        />
      )}

      {/* "+ Add Item" for array-type blocks (cards, stats, etc.) */}
      {isSelected && blockType && ARRAY_BLOCK_TYPES[blockType] && (
        <div className="absolute -top-6 right-1 z-50">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const config = ARRAY_BLOCK_TYPES[blockType];
              sendToParent(IFRAME_MESSAGES.BLOCK_CONTENT_UPDATED, {
                blockId,
                field: '__add_array_item',
                value: config.field,
              });
            }}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: '#10b981',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              fontSize: '10px',
              fontWeight: 600,
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transition: 'transform 0.15s ease',
              whiteSpace: 'nowrap',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = 'scale(1.05)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = 'scale(1)'; }}
          >
            + {ARRAY_BLOCK_TYPES[blockType].label}
          </button>
        </div>
      )}

      {/* "+" add block button at bottom */}
      {showControls && onAddAfter && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 z-50">
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddAfter(blockId);
            }}
            style={{
              width: '24px',
              height: '24px',
              borderRadius: '50%',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: '2px solid white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
              lineHeight: 1,
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              transition: 'transform 0.15s ease',
            }}
            onMouseEnter={(e) => { (e.target as HTMLElement).style.transform = 'scale(1.2)'; }}
            onMouseLeave={(e) => { (e.target as HTMLElement).style.transform = 'scale(1)'; }}
          >
            +
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Resize Handle ───────────────────────────────────────────────────────────

function ResizeHandle({
  direction,
  containerRef,
  onResizeEnd,
}: {
  direction: 'right' | 'bottom' | 'corner';
  containerRef: React.RefObject<HTMLDivElement | null>;
  onResizeEnd: (width: string | undefined, height: string | undefined) => void;
}) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const container = containerRef.current;
      if (!container) return;

      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = container.offsetWidth;
      const startHeight = container.offsetHeight;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;

        if (direction === 'right' || direction === 'corner') {
          container.style.width = `${startWidth + dx}px`;
        }
        if (direction === 'bottom' || direction === 'corner') {
          container.style.height = `${startHeight + dy}px`;
        }
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        const w = direction === 'right' || direction === 'corner'
          ? `${container.offsetWidth}px`
          : undefined;
        const h = direction === 'bottom' || direction === 'corner'
          ? `${container.offsetHeight}px`
          : undefined;

        onResizeEnd(w, h);
      };

      document.body.style.cursor =
        direction === 'corner' ? 'nwse-resize' :
        direction === 'right' ? 'ew-resize' : 'ns-resize';
      document.body.style.userSelect = 'none';

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [direction, containerRef, onResizeEnd],
  );

  const styles: React.CSSProperties = {
    position: 'absolute',
    zIndex: 51,
    backgroundColor: '#3b82f6',
    border: '1.5px solid white',
    borderRadius: direction === 'corner' ? '2px' : '1px',
  };

  if (direction === 'right') {
    return (
      <div
        onMouseDown={handleMouseDown}
        style={{
          ...styles,
          right: '-5px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '6px',
          height: '24px',
          cursor: 'ew-resize',
        }}
      />
    );
  }

  if (direction === 'bottom') {
    return (
      <div
        onMouseDown={handleMouseDown}
        style={{
          ...styles,
          bottom: '-5px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '24px',
          height: '6px',
          cursor: 'ns-resize',
        }}
      />
    );
  }

  // corner
  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        ...styles,
        right: '-5px',
        bottom: '-5px',
        width: '8px',
        height: '8px',
        cursor: 'nwse-resize',
      }}
    />
  );
}

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

function SpacingHandles({
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

// ─── Inline Text Editing ────────────────────────────────────────────────────

/**
 * When selected, finds text elements with [data-editable-field] and makes them
 * contentEditable. On blur, sends the new text to the parent editor.
 * If no data-editable-field attributes exist, falls back to making common text
 * elements (h1-h6, p, span with text) editable.
 */
function EditableContent({
  blockId,
  isSelected,
  containerRef,
  children,
}: {
  blockId: string;
  isSelected: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [modifierHeld, setModifierHeld] = useState(false);

  // Track Cmd/Ctrl key state so we can temporarily allow pointer events through
  // to nested blocks for deep-select. Uses keydown/keyup on the window.
  useEffect(() => {
    if (isSelected) {
      // When already selected, no need to override pointer events
      setModifierHeld(false);
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) setModifierHeld(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) setModifierHeld(false);
    };
    // Also reset when the window loses focus
    const onBlur = () => setModifierHeld(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [isSelected]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el || !isSelected) return;

    // Find all elements with data-editable-field attribute
    let editables = Array.from(el.querySelectorAll<HTMLElement>('[data-editable-field]'));

    // Fallback: if no data-editable-field found, make common text elements editable
    if (editables.length === 0) {
      const textEls = Array.from(el.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6, p, blockquote, [class*="text-"], li'));
      // Filter to leaf text elements (no child block elements)
      editables = textEls.filter(te => {
        const text = te.textContent?.trim();
        if (!text || text.length === 0) return false;
        // Skip elements that are just containers for other text elements
        const childBlocks = te.querySelectorAll('h1, h2, h3, h4, h5, h6, p, blockquote');
        return childBlocks.length === 0;
      });
    }

    const cleanups: (() => void)[] = [];

    for (const editable of editables) {
      editable.contentEditable = 'true';
      editable.style.outline = 'none';
      editable.style.cursor = 'text';

      const fieldName = editable.getAttribute('data-editable-field');
      const originalHtml = editable.innerHTML || '';

      const handleBlur = () => {
        const newHtml = editable.innerHTML || '';
        if (newHtml === originalHtml) return;

        if (fieldName) {
          // Specific field update — send HTML to preserve formatting
          sendToParent(IFRAME_MESSAGES.BLOCK_CONTENT_UPDATED, {
            blockId,
            field: fieldName,
            value: newHtml,
          });
        } else {
          // Heuristic: guess the field from the element tag
          const tag = editable.tagName.toLowerCase();
          let guessedField: string | null = null;
          if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tag)) guessedField = 'content';
          else if (tag === 'p') guessedField = 'content';
          else if (tag === 'blockquote') guessedField = 'quote';

          if (guessedField) {
            sendToParent(IFRAME_MESSAGES.BLOCK_CONTENT_UPDATED, {
              blockId,
              field: guessedField,
              value: newHtml,
            });
          }
        }
      };

      // Live sync on input so the sidebar panel updates as you type
      let inputTimer: ReturnType<typeof setTimeout> | null = null;
      const handleInput = () => {
        if (inputTimer) clearTimeout(inputTimer);
        inputTimer = setTimeout(() => {
          const html = editable.innerHTML || '';
          const field = fieldName || (() => {
            const tag = editable.tagName.toLowerCase();
            if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p'].includes(tag)) return 'content';
            if (tag === 'blockquote') return 'quote';
            return null;
          })();
          if (field) {
            sendToParent(IFRAME_MESSAGES.BLOCK_CONTENT_UPDATED, { blockId, field, value: html });
          }
        }, 300);
      };

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          editable.blur();
        }
        // Don't propagate to prevent block shortcuts from firing
        e.stopPropagation();
      };

      editable.addEventListener('blur', handleBlur);
      editable.addEventListener('input', handleInput);
      editable.addEventListener('keydown', handleKeyDown);
      cleanups.push(() => {
        if (inputTimer) clearTimeout(inputTimer);
        editable.contentEditable = 'false';
        editable.style.cursor = '';
        editable.removeEventListener('blur', handleBlur);
        editable.removeEventListener('input', handleInput);
        editable.removeEventListener('keydown', handleKeyDown);
      });
    }

    return () => cleanups.forEach(fn => fn());
  }, [isSelected, blockId]);

  return (
    <div
      ref={contentRef}
      style={{ pointerEvents: isSelected || modifierHeld ? 'auto' : 'none' }}
      onClick={(e) => {
        // If the click landed inside a contenteditable element, never
        // preventDefault — the browser's default caret placement is what
        // makes click-to-edit feel natural. Both layers (this and the outer
        // SelectableBlock wrapper) need the same bail-out.
        const target = e.target as HTMLElement | null;
        if (target?.isContentEditable || target?.closest('[contenteditable="true"]')) {
          if (isSelected) e.stopPropagation();
          return;
        }
        if (isSelected) {
          // Allow clicking into text when selected, but stop propagation
          // so the block doesn't re-trigger selection
          e.stopPropagation();
        } else {
          e.preventDefault();
        }
      }}
    >
      <div style={{ pointerEvents: isSelected || modifierHeld ? 'auto' : 'none' }} className="[&_iframe]:pointer-events-none">
        {children}
      </div>
    </div>
  );
}
