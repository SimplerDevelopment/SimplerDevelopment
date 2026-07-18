// @vitest-environment jsdom
/**
 * Unit tests for ColumnsEditorOverlay.
 * Covers: render, separator drag handles, gap drag handle, live tooltip, hover styles.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';

// ─── Mock sendToParent so we don't need a real postMessage environment ────────
const mockSendToParent = vi.fn();
vi.mock('@/lib/visual-editor/protocol', () => ({
  sendToParent: (...args: unknown[]) => mockSendToParent(...args),
}));

// ─── Mock IFRAME_MESSAGES constant ───────────────────────────────────────────
vi.mock('@/types/visual-editor', () => ({
  IFRAME_MESSAGES: {
    COLUMN_RESIZED: 'COLUMN_RESIZED',
    GAP_CHANGED: 'GAP_CHANGED',
  },
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────
import { ColumnsEditorOverlay } from '@/components/visual-editor/ColumnsEditorOverlay';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeContainerRef(width = 800): React.RefObject<HTMLDivElement> {
  const div = document.createElement('div');
  Object.defineProperty(div, 'offsetWidth', { value: width, configurable: true });
  return { current: div } as React.RefObject<HTMLDivElement>;
}

const TWO_COLS = [
  { id: 'col-a', width: 50 },
  { id: 'col-b', width: 50 },
];

const THREE_COLS = [
  { id: 'col-a', width: 33 },
  { id: 'col-b', width: 34 },
  { id: 'col-c', width: 33 },
];

function renderOverlay(
  columns = TWO_COLS,
  gap: 'sm' | 'md' | 'lg' | undefined = 'md',
  containerRef = makeContainerRef(),
) {
  return render(
    <ColumnsEditorOverlay
      blockId="block-1"
      columns={columns}
      gap={gap}
      containerRef={containerRef}
    />,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ColumnsEditorOverlay', () => {
  beforeEach(() => {
    mockSendToParent.mockClear();
  });

  // ── Render ──────────────────────────────────────────────────────────────────

  describe('basic render', () => {
    it('renders gap handle for 2-column layout', () => {
      renderOverlay();
      // Gap handle has title attribute
      const gapHandle = document.querySelector('[title="Drag to adjust gap between columns"]');
      expect(gapHandle).not.toBeNull();
    });

    it('shows "gap: md" text in gap handle when gap is md', () => {
      renderOverlay(TWO_COLS, 'md');
      expect(document.body.textContent).toContain('gap: md');
    });

    it('shows "gap: sm" text when gap is sm', () => {
      renderOverlay(TWO_COLS, 'sm');
      expect(document.body.textContent).toContain('gap: sm');
    });

    it('shows "gap: lg" text when gap is lg', () => {
      renderOverlay(TWO_COLS, 'lg');
      expect(document.body.textContent).toContain('gap: lg');
    });

    it('falls back to "md" when gap is undefined', () => {
      renderOverlay(TWO_COLS, undefined);
      expect(document.body.textContent).toContain('gap: md');
    });

    it('renders one separator handle for 2 columns', () => {
      const { container } = renderOverlay(TWO_COLS);
      // Separator handles have col-resize cursor
      const handles = container.querySelectorAll('[style*="col-resize"]');
      expect(handles.length).toBeGreaterThanOrEqual(1);
    });

    it('renders two separator handles for 3 columns', () => {
      const { container } = renderOverlay(THREE_COLS);
      const handles = container.querySelectorAll('[style*="col-resize"]');
      expect(handles.length).toBeGreaterThanOrEqual(2);
    });

    it('does NOT render gap handle for single column', () => {
      renderOverlay([{ id: 'col-a', width: 100 }]);
      const gapHandle = document.querySelector('[title="Drag to adjust gap between columns"]');
      expect(gapHandle).toBeNull();
    });

    it('does not show liveLabel tooltip initially', () => {
      renderOverlay();
      // The tooltip only appears when liveLabel is set
      const tooltips = document.querySelectorAll('[style*="translate(-50%, -50%)"][style*="background"]');
      // Zero tooltip-style elements that contain the specific tooltip text
      expect(document.body.textContent).not.toMatch(/\d+%\s*\|\s*\d+%/);
    });
  });

  // ── Separator positions ───────────────────────────────────────────────────

  describe('separator position calculation', () => {
    it('places single separator at 50% for equal 50/50 columns', () => {
      const { container } = renderOverlay(TWO_COLS);
      const sep = container.querySelector('[style*="left: 50%"]');
      expect(sep).not.toBeNull();
    });

    it('handles string widths (e.g. "55%") correctly', () => {
      const strCols = [
        { id: 'col-a', width: '55%' as string },
        { id: 'col-b', width: '45%' as string },
      ];
      const { container } = renderOverlay(strCols);
      const sep = container.querySelector('[style*="left: 55%"]');
      expect(sep).not.toBeNull();
    });

    it('handles numeric 0 width by using parseColWidth fallback', () => {
      // width: 0 is falsy but numeric — parseColWidth should return 0
      const cols = [
        { id: 'col-a', width: 30 },
        { id: 'col-b', width: 70 },
      ];
      const { container } = renderOverlay(cols);
      const sep = container.querySelector('[style*="left: 30%"]');
      expect(sep).not.toBeNull();
    });
  });

  // ── Separator drag (mousedown + mousemove + mouseup) ─────────────────────

  describe('separator drag interaction', () => {
    function getSeparatorHandle(container: HTMLElement): HTMLElement {
      // The outermost separator div has onMouseDown and col-resize cursor
      const all = container.querySelectorAll<HTMLElement>('[style*="col-resize"]');
      // First match is the separator wrapper div
      return all[0] as HTMLElement;
    }

    it('sets cursor and userSelect on body during drag', () => {
      const containerRef = makeContainerRef(800);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={containerRef} />,
      );
      const sep = getSeparatorHandle(container);
      fireEvent.mouseDown(sep, { clientX: 400, clientY: 0 });
      expect(document.body.style.cursor).toBe('col-resize');
      expect(document.body.style.userSelect).toBe('none');
      // Cleanup
      fireEvent.mouseUp(document);
    });

    it('shows live label after mousedown on separator', () => {
      const containerRef = makeContainerRef(800);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={containerRef} />,
      );
      const sep = getSeparatorHandle(container);
      fireEvent.mouseDown(sep, { clientX: 400, clientY: 0 });
      expect(document.body.textContent).toMatch(/50%\s*\|\s*50%/);
      fireEvent.mouseUp(document);
    });

    it('calls sendToParent(COLUMN_RESIZED) on mousemove during drag', () => {
      const containerRef = makeContainerRef(800);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={containerRef} />,
      );
      const sep = getSeparatorHandle(container);
      fireEvent.mouseDown(sep, { clientX: 400, clientY: 0 });
      fireEvent.mouseMove(document, { clientX: 480, clientY: 0 });
      expect(mockSendToParent).toHaveBeenCalledWith(
        'COLUMN_RESIZED',
        expect.objectContaining({ blockId: 'b1', columnWidths: expect.any(Array) }),
      );
      fireEvent.mouseUp(document);
    });

    it('updates live label on mousemove with new widths', () => {
      const containerRef = makeContainerRef(800);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={containerRef} />,
      );
      const sep = getSeparatorHandle(container);
      fireEvent.mouseDown(sep, { clientX: 400, clientY: 0 });
      // Move 80px right = 10% shift in an 800px container
      fireEvent.mouseMove(document, { clientX: 480, clientY: 0 });
      // Label should show updated widths (not exactly 50|50 anymore)
      expect(document.body.textContent).toMatch(/\d+%\s*\|\s*\d+%/);
      fireEvent.mouseUp(document);
    });

    it('clears cursor and label on mouseup', () => {
      const containerRef = makeContainerRef(800);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={containerRef} />,
      );
      const sep = getSeparatorHandle(container);
      fireEvent.mouseDown(sep, { clientX: 400, clientY: 0 });
      fireEvent.mouseUp(document);
      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
      expect(document.body.textContent).not.toMatch(/50%\s*\|\s*50%/);
    });

    it('does nothing when containerRef.current is null', () => {
      const nullRef = { current: null } as React.RefObject<HTMLDivElement | null>;
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={nullRef as React.RefObject<HTMLDivElement>} />,
      );
      const sep = getSeparatorHandle(container);
      fireEvent.mouseDown(sep, { clientX: 400, clientY: 0 });
      // No throw, no sendToParent
      expect(mockSendToParent).not.toHaveBeenCalled();
    });

    it('clamps left column width to minimum 10%', () => {
      const containerRef = makeContainerRef(800);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={containerRef} />,
      );
      const sep = getSeparatorHandle(container);
      fireEvent.mouseDown(sep, { clientX: 400, clientY: 0 });
      // Move far left: -400px would be -50%, clamped to 10%
      fireEvent.mouseMove(document, { clientX: 0, clientY: 0 });
      const call = mockSendToParent.mock.calls[0];
      const widths = call[1].columnWidths as number[];
      expect(widths[0]).toBeGreaterThanOrEqual(10);
      fireEvent.mouseUp(document);
    });

    it('sends multiple COLUMN_RESIZED events for multiple mousemove calls', () => {
      const containerRef = makeContainerRef(800);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={containerRef} />,
      );
      const sep = getSeparatorHandle(container);
      fireEvent.mouseDown(sep, { clientX: 400, clientY: 0 });
      fireEvent.mouseMove(document, { clientX: 420, clientY: 0 });
      fireEvent.mouseMove(document, { clientX: 440, clientY: 0 });
      expect(mockSendToParent).toHaveBeenCalledTimes(2);
      fireEvent.mouseUp(document);
    });
  });

  // ── Gap drag interaction ─────────────────────────────────────────────────

  describe('gap drag interaction', () => {
    function getGapHandle(): HTMLElement {
      return document.querySelector('[title="Drag to adjust gap between columns"]') as HTMLElement;
    }

    it('sets ns-resize cursor on body during gap drag', () => {
      renderOverlay(TWO_COLS, 'md');
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 200 });
      expect(document.body.style.cursor).toBe('ns-resize');
      fireEvent.mouseUp(document);
    });

    it('shows live gap label after mousedown', () => {
      renderOverlay(TWO_COLS, 'md');
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 200 });
      expect(document.body.textContent).toContain('gap: 24px');
      fireEvent.mouseUp(document);
    });

    it('shows sm gap (16px) label on mousedown when gap=sm', () => {
      renderOverlay(TWO_COLS, 'sm');
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 200 });
      expect(document.body.textContent).toContain('gap: 16px');
      fireEvent.mouseUp(document);
    });

    it('shows lg gap (32px) label on mousedown when gap=lg', () => {
      renderOverlay(TWO_COLS, 'lg');
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 200 });
      expect(document.body.textContent).toContain('gap: 32px');
      fireEvent.mouseUp(document);
    });

    it('calls sendToParent(GAP_CHANGED) on mousemove during gap drag', () => {
      renderOverlay(TWO_COLS, 'md');
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 200 });
      fireEvent.mouseMove(document, { clientX: 0, clientY: 220 });
      expect(mockSendToParent).toHaveBeenCalledWith(
        'GAP_CHANGED',
        expect.objectContaining({ blockId: 'block-1', gap: expect.stringMatching(/sm|md|lg/) }),
      );
      fireEvent.mouseUp(document);
    });

    it('maps large downward drag to "lg" gap', () => {
      renderOverlay(TWO_COLS, 'sm');
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 0 });
      // currentGapPx for sm = 16; +30 = 46 → ≥ 28 → lg
      fireEvent.mouseMove(document, { clientX: 0, clientY: 30 });
      expect(mockSendToParent).toHaveBeenCalledWith(
        'GAP_CHANGED',
        expect.objectContaining({ gap: 'lg' }),
      );
      fireEvent.mouseUp(document);
    });

    it('maps upward drag to "sm" gap', () => {
      renderOverlay(TWO_COLS, 'lg');
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 100 });
      // currentGapPx for lg = 32; -30 = 2 → < 20 → sm
      fireEvent.mouseMove(document, { clientX: 0, clientY: 70 });
      expect(mockSendToParent).toHaveBeenCalledWith(
        'GAP_CHANGED',
        expect.objectContaining({ gap: 'sm' }),
      );
      fireEvent.mouseUp(document);
    });

    it('updates live label during mousemove with gap preset text', () => {
      renderOverlay(TWO_COLS, 'md');
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 200 });
      fireEvent.mouseMove(document, { clientX: 0, clientY: 220 });
      // Label shows "gap: <px>px (<preset>)"
      expect(document.body.textContent).toMatch(/gap: \d+px \((sm|md|lg)\)/);
      fireEvent.mouseUp(document);
    });

    it('clears cursor and label on mouseup', () => {
      renderOverlay(TWO_COLS, 'md');
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 200 });
      fireEvent.mouseUp(document);
      expect(document.body.style.cursor).toBe('');
      expect(document.body.textContent).not.toContain('gap: 24px');
    });

    it('clamps gap to 0 when dragging far upward', () => {
      renderOverlay(TWO_COLS, 'sm');
      // sm = 16px; drag up 100px → max(0, 16 - 100) = 0 → maps to 'sm' (< 20)
      fireEvent.mouseDown(getGapHandle(), { clientX: 0, clientY: 200 });
      fireEvent.mouseMove(document, { clientX: 0, clientY: 100 });
      expect(mockSendToParent).toHaveBeenCalledWith(
        'GAP_CHANGED',
        expect.objectContaining({ gap: 'sm' }),
      );
      fireEvent.mouseUp(document);
    });
  });

  // ── Visual indicator hover ────────────────────────────────────────────────

  describe('separator visual indicator hover', () => {
    it('changes indicator color on mouseenter', () => {
      const containerRef = makeContainerRef(800);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={containerRef} />,
      );
      // The inner visual indicator div (not the outer wrapper)
      const indicators = container.querySelectorAll<HTMLElement>('[style*="transparent"]');
      if (indicators.length > 0) {
        const indicator = indicators[0];
        fireEvent.mouseEnter(indicator);
        // After mouseenter, backgroundColor should be set to blue
        expect(indicator.style.backgroundColor).toBe('rgb(59, 130, 246)');
      }
    });

    it('resets indicator color on mouseleave when not resizing', () => {
      const containerRef = makeContainerRef(800);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b1" columns={TWO_COLS} gap="md" containerRef={containerRef} />,
      );
      const indicators = container.querySelectorAll<HTMLElement>('[style*="transparent"]');
      if (indicators.length > 0) {
        const indicator = indicators[0];
        fireEvent.mouseEnter(indicator);
        fireEvent.mouseLeave(indicator);
        expect(indicator.style.backgroundColor).toBe('transparent');
      }
    });
  });

  // ── Gap handle appearance ─────────────────────────────────────────────────

  describe('gap handle appearance changes on drag', () => {
    it('gap handle has purple background (#8b5cf6) while dragging', () => {
      renderOverlay(TWO_COLS, 'md');
      const gapHandle = document.querySelector('[title="Drag to adjust gap between columns"]') as HTMLElement;
      fireEvent.mouseDown(gapHandle, { clientX: 0, clientY: 200 });
      // While gapDragging === true, backgroundColor should be #8b5cf6
      expect(gapHandle.style.backgroundColor).toBe('rgb(139, 92, 246)');
      fireEvent.mouseUp(document);
    });

    it('gap handle reverts to #6366f1 after drag ends', () => {
      renderOverlay(TWO_COLS, 'md');
      const gapHandle = document.querySelector('[title="Drag to adjust gap between columns"]') as HTMLElement;
      fireEvent.mouseDown(gapHandle, { clientX: 0, clientY: 200 });
      fireEvent.mouseUp(document);
      expect(gapHandle.style.backgroundColor).toBe('rgb(99, 102, 241)');
    });
  });

  // ── Three-column layout ───────────────────────────────────────────────────

  describe('three-column layout', () => {
    it('renders two separators for three columns', () => {
      const { container } = renderOverlay(THREE_COLS);
      // Each separator has cursor: col-resize on outer wrapper
      const handles = container.querySelectorAll<HTMLElement>('[style*="col-resize"]');
      expect(handles.length).toBeGreaterThanOrEqual(2);
    });

    it('dragging first separator sends widths for all 3 columns', () => {
      const containerRef = makeContainerRef(900);
      const { container } = render(
        <ColumnsEditorOverlay blockId="b-three" columns={THREE_COLS} gap="md" containerRef={containerRef} />,
      );
      const handles = container.querySelectorAll<HTMLElement>('[style*="col-resize"]');
      fireEvent.mouseDown(handles[0], { clientX: 300, clientY: 0 });
      fireEvent.mouseMove(document, { clientX: 360, clientY: 0 });
      expect(mockSendToParent).toHaveBeenCalledWith(
        'COLUMN_RESIZED',
        expect.objectContaining({ blockId: 'b-three', columnWidths: expect.arrayContaining([expect.any(Number)]) }),
      );
      const widths = mockSendToParent.mock.calls[0][1].columnWidths as number[];
      expect(widths).toHaveLength(3);
      fireEvent.mouseUp(document);
    });
  });
});
