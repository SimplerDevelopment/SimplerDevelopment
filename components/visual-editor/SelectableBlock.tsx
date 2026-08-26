'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { ColumnsEditorOverlay } from './ColumnsEditorOverlay';
import { SpacingHandles } from './SelectableBlock.SpacingHandles';
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
  /** VEQA-041 — adds `.force-hover` so render components can preview `:hover` CSS without a real mouse-over. */
  isForceHover?: boolean;
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
  isForceHover,
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
      className={`relative${isForceHover ? ' force-hover' : ''}`}
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

  // The visible dot (what earlier shipped as the whole handle) vs. the
  // invisible hit zone it now sits inside. Both boxes live INSIDE the
  // iframe's own document, but the canvas that hosts the iframe is scaled
  // with CSS `transform: scale(zoomLevel / 100)` by the PARENT
  // (IframePreview.tsx) — a transform on an ancestor shrinks a descendant's
  // ON-SCREEN rendered (and therefore hit-tested) size right along with its
  // visual size. At the editor's default 55% zoom the old 8px corner dot
  // hit-tested at ~4.4px on screen, well under any usable pointer target.
  // The iframe has no channel telling it the current zoom level (and adding
  // one to counter-scale exactly would be the "always correct at every
  // zoom" fix, but it's a bigger, cross-frame change for a narrow bug) — so
  // instead the DOT stays the same small visible size (unchanged look at
  // 100%) while the clickable/hoverable box around it grows well past the
  // dot. Sized so the default 55% zoom clears a WCAG-ish ~24px on-screen
  // target (44 * 0.55 ≈ 24px along the generous axis); it's smaller again
  // at the 30% zoom floor, but still several times better than before.
  const hitZoneStyles: React.CSSProperties = {
    position: 'absolute',
    zIndex: 51,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
  };

  const dotStyles: React.CSSProperties = {
    backgroundColor: '#3b82f6',
    border: '1.5px solid white',
    borderRadius: direction === 'corner' ? '2px' : '1px',
    pointerEvents: 'none',
  };

  if (direction === 'right') {
    // Hit zone is centered ON the edge (12px in, 12px out) rather than
    // pushed outward, so it doesn't reach further into a tightly-packed
    // neighboring block than it does into this one.
    return (
      <div
        onMouseDown={handleMouseDown}
        style={{
          ...hitZoneStyles,
          right: '-12px',
          top: '50%',
          transform: 'translateY(-50%)',
          width: '24px',
          height: '44px',
          cursor: 'ew-resize',
        }}
      >
        <div style={{ ...dotStyles, width: '6px', height: '24px' }} />
      </div>
    );
  }

  if (direction === 'bottom') {
    return (
      <div
        onMouseDown={handleMouseDown}
        style={{
          ...hitZoneStyles,
          bottom: '-12px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '44px',
          height: '24px',
          cursor: 'ns-resize',
        }}
      >
        <div style={{ ...dotStyles, width: '24px', height: '6px' }} />
      </div>
    );
  }

  // corner
  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        ...hitZoneStyles,
        right: '-17px',
        bottom: '-17px',
        width: '34px',
        height: '34px',
        cursor: 'nwse-resize',
      }}
    >
      <div style={{ ...dotStyles, width: '8px', height: '8px' }} />
    </div>
  );
}

// ─── Inline Text Editing ────────────────────────────────────────────────────

/**
 * When selected, finds text elements with [data-editable-field] and makes them
 * contentEditable. On blur, sends the new text to the parent editor.
 * If no data-editable-field attributes exist, falls back to making common text
 * elements (h1-h6, p, span with text) editable.
 *
 * QAD-031: this effect's deps are `[isSelected, blockId]` — it does NOT
 * re-run when `children` changes, and it doesn't need to. It only owns the
 * imperative contentEditable attribute + blur/input/keydown listeners; it
 * never gates whether React writes new content into the DOM. A parent-panel
 * edit that re-renders `children` with new block.content (a BLOCKS_UPDATE
 * round trip, not local typing) still lands via React's own text/
 * dangerouslySetInnerHTML reconciliation of the same node, same as it would
 * with contentEditable unset. Verified with the real component in
 * tests/unit/components-selectable-block.test.tsx (search QAD-031) for both
 * the plain-text-child and dangerouslySetInnerHTML render shapes.
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
      queueMicrotask(() => setModifierHeld(false));
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
        // Stop propagation so block shortcuts (Backspace/Delete deleting the
        // block, etc.) don't fire while the caret is in editable text — EXCEPT
        // the duplicate shortcut (Cmd/Ctrl+D), which has no text-editing meaning
        // and must reach the editor's window handler to duplicate the block.
        const isDuplicate = (e.metaKey || e.ctrlKey) && (e.key === 'd' || e.key === 'D');
        if (!isDuplicate) e.stopPropagation();
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
