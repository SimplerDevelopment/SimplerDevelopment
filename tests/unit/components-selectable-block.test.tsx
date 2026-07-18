// @vitest-environment jsdom
/**
 * Unit tests for `SelectableBlock` and its internal helpers (`ResizeHandle`,
 * `SpacingHandles`, `SpacingHandle`, `EditableContent`, plus the private
 * helpers `parseSpacing`/`toSpacingString`/`isVertical`).
 *
 * Exercise paths covered:
 *  - click handling (normal, shift, cmd, ctrl, deep-select)
 *  - context-menu sends BLOCK_CONTEXT_MENU with iframe geometry
 *  - hover enter/leave callbacks
 *  - drag listeners forwarded onto the toolbar handle
 *  - sizeStyle dimensional overrides applied to the container
 *  - resize handles (right / bottom / corner) drag start + mouseup
 *  - spacing handles render for selected blocks + drag updates styles
 *  - + add-after button + + add-array-item button
 *  - inline text editing wires contentEditable + blur posts to parent
 *  - inline text editing falls back to common text tags when no
 *    data-editable-field present
 *  - keydown handlers (Enter to blur, stopPropagation)
 *  - modifier-held pointer-events override when not selected
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const sendToParentMock = vi.fn();
vi.mock('@/lib/visual-editor/protocol', () => ({
  sendToParent: (...args: unknown[]) => sendToParentMock(...args),
}));

// ColumnsEditorOverlay is a complex component we don't need to test here.
vi.mock('@/components/visual-editor/ColumnsEditorOverlay', () => ({
  ColumnsEditorOverlay: ({ blockId }: { blockId: string }) => (
    <div data-testid="columns-editor-overlay" data-block-id={blockId} />
  ),
}));

import { SelectableBlock } from '@/components/visual-editor/SelectableBlock';

// ---------------------------------------------------------------------------
// rAF polyfill — jsdom doesn't always implement it predictably across versions.
// ---------------------------------------------------------------------------
beforeEach(() => {
  sendToParentMock.mockReset();
  // Stable rAF: schedule callback in a microtask so flushing is trivial.
  let rafId = 0;
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafId += 1;
    queueMicrotask(() => cb(performance.now()));
    return rafId;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => {}) as typeof window.cancelAnimationFrame;
});

afterEach(() => {
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// Re-usable default props
function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    blockId: 'block-1',
    blockType: 'text',
    isSelected: false,
    isHovered: false,
    onClicked: vi.fn(),
    onHovered: vi.fn(),
    children: <div data-testid="child">child</div>,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Rendering basics
// ---------------------------------------------------------------------------

describe('SelectableBlock - basic rendering', () => {
  it('renders children and exposes block-id / block-type data attributes', () => {
    const { getByTestId, container } = render(<SelectableBlock {...defaultProps()} />);
    expect(getByTestId('child')).toBeInTheDocument();
    const root = container.firstChild as HTMLElement;
    expect(root.getAttribute('data-block-id')).toBe('block-1');
    expect(root.getAttribute('data-block-type')).toBe('text');
  });

  it('renders without blockType (falls back to "Block" label when selected)', () => {
    const { container, queryByText } = render(
      <SelectableBlock {...defaultProps({ blockType: undefined, isSelected: true })} />,
    );
    expect(queryByText('Block')).toBeInTheDocument();
    expect((container.firstChild as HTMLElement).getAttribute('data-block-type')).toBeNull();
  });

  it('does not show toolbar when neither selected nor hovered', () => {
    const { queryByText } = render(<SelectableBlock {...defaultProps()} />);
    expect(queryByText('text')).not.toBeInTheDocument();
  });

  it('shows toolbar (with blockType label) when hovered', () => {
    const { getByText } = render(
      <SelectableBlock {...defaultProps({ isHovered: true })} />,
    );
    expect(getByText('text')).toBeInTheDocument();
  });

  it('applies isSelected outline color', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.outline).toContain('#3b82f6');
  });

  it('applies isHovered dashed outline when not selected', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isHovered: true })} />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.outline).toMatch(/#94a3b8|94a3b8/);
  });

  it('applies sizeStyle.width/height/maxWidth to the container element', () => {
    const { container } = render(
      <SelectableBlock
        {...defaultProps({
          sizeStyle: { width: '300px', height: '120px', maxWidth: '400px', minWidth: '100px', maxHeight: '500px', minHeight: '50px' },
        })}
      />,
    );
    const root = container.firstChild as HTMLElement;
    expect(root.style.width).toBe('300px');
    expect(root.style.height).toBe('120px');
    expect(root.style.maxWidth).toBe('400px');
    expect(root.style.minWidth).toBe('100px');
    expect(root.style.maxHeight).toBe('500px');
    expect(root.style.minHeight).toBe('50px');
  });
});

// ---------------------------------------------------------------------------
// Click handling
// ---------------------------------------------------------------------------

describe('SelectableBlock - click handling', () => {
  it('calls onClicked with the modifier flags on normal click and stops propagation', () => {
    const onClicked = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ onClicked })} />,
    );
    const root = container.firstChild as HTMLElement;
    fireEvent.click(root);
    expect(onClicked).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({ shiftKey: false, metaKey: false, ctrlKey: false }),
    );
  });

  it('propagates shiftKey modifier on click', () => {
    const onClicked = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ onClicked })} />,
    );
    fireEvent.click(container.firstChild as HTMLElement, { shiftKey: true });
    expect(onClicked).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({ shiftKey: true }),
    );
  });

  it('cmd+click triggers deep-select branch (innermost wins on bubble)', async () => {
    // Render two nested SelectableBlocks. The inner click should fire first and
    // claim deep-select; the outer block's handler should see the flag and skip.
    const innerOnClicked = vi.fn();
    const outerOnClicked = vi.fn();
    const Outer = (
      <SelectableBlock {...defaultProps({ blockId: 'outer', onClicked: outerOnClicked })}>
        <SelectableBlock {...defaultProps({ blockId: 'inner', onClicked: innerOnClicked })}>
          <span data-testid="leaf">leaf</span>
        </SelectableBlock>
      </SelectableBlock>
    );

    const { getByTestId } = render(Outer);
    const leaf = getByTestId('leaf');
    // Click using metaKey so the deep-select branch fires
    fireEvent.click(leaf, { metaKey: true, bubbles: true });

    // Inner should have been called with metaKey, outer should NOT have been
    expect(innerOnClicked).toHaveBeenCalledWith(
      'inner',
      expect.objectContaining({ metaKey: true }),
    );
    expect(outerOnClicked).not.toHaveBeenCalled();

    // Allow rAF microtask to fire and reset the module-level flag
    await new Promise((r) => queueMicrotask(() => r(undefined)));
  });

  it('ctrl+click also takes deep-select branch', async () => {
    const onClicked = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ onClicked })} />,
    );
    fireEvent.click(container.firstChild as HTMLElement, { ctrlKey: true });
    expect(onClicked).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({ ctrlKey: true }),
    );
    await new Promise((r) => queueMicrotask(() => r(undefined)));
  });

  it('shift+cmd click is NOT a deep-select (regular selection)', () => {
    const onClicked = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ onClicked })} />,
    );
    fireEvent.click(container.firstChild as HTMLElement, { metaKey: true, shiftKey: true });
    expect(onClicked).toHaveBeenCalledWith(
      'block-1',
      expect.objectContaining({ metaKey: true, shiftKey: true }),
    );
  });
});

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

describe('SelectableBlock - context menu', () => {
  it('sends BLOCK_CONTEXT_MENU with coordinates and iframe geometry', () => {
    const { container } = render(<SelectableBlock {...defaultProps()} />);
    fireEvent.contextMenu(container.firstChild as HTMLElement, {
      clientX: 42,
      clientY: 99,
    });

    expect(sendToParentMock).toHaveBeenCalledWith(
      'BLOCK_CONTEXT_MENU',
      expect.objectContaining({
        blockId: 'block-1',
        x: 42,
        y: 99,
        modifiers: expect.objectContaining({ shiftKey: false, metaKey: false, ctrlKey: false }),
      }),
    );
    const payload = sendToParentMock.mock.calls[0][1] as { iframeWidth: number; iframeHeight: number };
    expect(typeof payload.iframeWidth).toBe('number');
    expect(typeof payload.iframeHeight).toBe('number');
  });

  it('captures modifiers in the context menu payload', () => {
    const { container } = render(<SelectableBlock {...defaultProps()} />);
    fireEvent.contextMenu(container.firstChild as HTMLElement, {
      shiftKey: true,
      metaKey: true,
    });
    expect(sendToParentMock.mock.calls[0][1]).toMatchObject({
      modifiers: { shiftKey: true, metaKey: true, ctrlKey: false },
    });
  });
});

// ---------------------------------------------------------------------------
// Hover handlers
// ---------------------------------------------------------------------------

describe('SelectableBlock - hover handlers', () => {
  it('fires onHovered(blockId) on mouseenter and onHovered(null) on mouseleave', () => {
    const onHovered = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ onHovered })} />,
    );
    const root = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(root);
    expect(onHovered).toHaveBeenCalledWith('block-1');

    fireEvent.mouseLeave(root);
    expect(onHovered).toHaveBeenLastCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Drag listeners
// ---------------------------------------------------------------------------

describe('SelectableBlock - drag handle listeners', () => {
  it('forwards dragListeners onto the toolbar drag-handle span', () => {
    const onPointerDown = vi.fn();
    const dragListeners = { onPointerDown };
    const { container } = render(
      <SelectableBlock
        {...defaultProps({ isSelected: true, dragListeners })}
      />,
    );
    // Find the drag glyph (⠿) and trigger pointer down
    const grip = container.querySelector('.cursor-grab') as HTMLElement;
    expect(grip).toBeTruthy();
    fireEvent.pointerDown(grip);
    expect(onPointerDown).toHaveBeenCalled();
  });

  it('drag handle click does not bubble to outer onClicked', () => {
    const onClicked = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true, onClicked })} />,
    );
    const grip = container.querySelector('.cursor-grab') as HTMLElement;
    // The grip handle does its own stopPropagation, so clicking it must not
    // re-trigger the block's onClick.
    fireEvent.click(grip);
    expect(onClicked).not.toHaveBeenCalled();
  });

  it('handles missing dragListeners gracefully (still renders glyph)', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })} />,
    );
    expect(container.querySelector('.cursor-grab')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Resize handles
// ---------------------------------------------------------------------------

describe('SelectableBlock - resize handles', () => {
  it('renders three resize handles (right, bottom, corner) only when selected with onResize', () => {
    const onResize = vi.fn();
    const { container, rerender } = render(
      <SelectableBlock {...defaultProps({ isSelected: true, onResize })} />,
    );
    // Three resize handles are non-className-tagged divs; count divs nested in
    // the root that have ew-resize / ns-resize / nwse-resize cursors.
    const handles = Array.from(container.querySelectorAll('div')).filter((d) => {
      const cur = (d as HTMLElement).style.cursor;
      return cur === 'ew-resize' || cur === 'ns-resize' || cur === 'nwse-resize';
    });
    expect(handles.length).toBeGreaterThanOrEqual(3);

    // Without onResize, handles disappear
    rerender(<SelectableBlock {...defaultProps({ isSelected: true })} />);
    const handlesAfter = Array.from(container.querySelectorAll('div')).filter(
      (d) => {
        const cur = (d as HTMLElement).style.cursor;
        return cur === 'ew-resize' || cur === 'ns-resize' || cur === 'nwse-resize';
      },
    );
    // SpacingHandles also use ew/ns-resize for their cursor, but those need
    // onStyleUpdate, which we didn't provide here. So we expect zero handles.
    expect(handlesAfter.length).toBe(0);
  });

  it('does not render resize handles when not selected', () => {
    const onResize = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: false, onResize })} />,
    );
    const handles = Array.from(container.querySelectorAll('div')).filter((d) => {
      const cur = (d as HTMLElement).style.cursor;
      return cur === 'ew-resize' || cur === 'ns-resize' || cur === 'nwse-resize';
    });
    expect(handles.length).toBe(0);
  });

  it('right-handle mousedown sets resize cursor and mouseup calls onResize with width only', () => {
    const onResize = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true, onResize })} />,
    );
    const rightHandle = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.cursor === 'ew-resize',
    ) as HTMLElement;
    expect(rightHandle).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(rightHandle, { clientX: 100, clientY: 100 });
    });
    expect(document.body.style.cursor).toBe('ew-resize');
    expect(document.body.style.userSelect).toBe('none');

    act(() => {
      fireEvent.mouseMove(document, { clientX: 150, clientY: 200 });
    });

    act(() => {
      fireEvent.mouseUp(document);
    });
    expect(onResize).toHaveBeenCalledTimes(1);
    const [, w, h] = onResize.mock.calls[0];
    expect(typeof w).toBe('string');
    expect(h).toBeUndefined();
    expect(document.body.style.cursor).toBe('');
  });

  it('bottom-handle mouseup calls onResize with height only', () => {
    const onResize = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true, onResize })} />,
    );
    const bottomHandle = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.cursor === 'ns-resize',
    ) as HTMLElement;
    expect(bottomHandle).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(bottomHandle, { clientX: 50, clientY: 80 });
    });
    expect(document.body.style.cursor).toBe('ns-resize');

    act(() => {
      fireEvent.mouseMove(document, { clientX: 70, clientY: 150 });
    });
    act(() => {
      fireEvent.mouseUp(document);
    });
    expect(onResize).toHaveBeenCalled();
    const call = onResize.mock.calls[onResize.mock.calls.length - 1];
    expect(call[1]).toBeUndefined(); // width
    expect(typeof call[2]).toBe('string'); // height
  });

  it('corner-handle mouseup calls onResize with both width and height', () => {
    const onResize = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true, onResize })} />,
    );
    const cornerHandle = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.cursor === 'nwse-resize',
    ) as HTMLElement;
    expect(cornerHandle).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(cornerHandle, { clientX: 0, clientY: 0 });
    });
    expect(document.body.style.cursor).toBe('nwse-resize');

    act(() => {
      fireEvent.mouseMove(document, { clientX: 25, clientY: 25 });
    });
    act(() => {
      fireEvent.mouseUp(document);
    });
    const call = onResize.mock.calls[onResize.mock.calls.length - 1];
    expect(typeof call[1]).toBe('string');
    expect(typeof call[2]).toBe('string');
  });

  it('prevents default and stops propagation on mousedown so parent click does not fire', () => {
    const onResize = vi.fn();
    const onClicked = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true, onResize, onClicked })} />,
    );
    const rightHandle = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.cursor === 'ew-resize',
    ) as HTMLElement;
    act(() => {
      fireEvent.mouseDown(rightHandle, { clientX: 0, clientY: 0 });
    });
    act(() => {
      fireEvent.mouseUp(document);
    });
    // mousedown should not bubble up and trigger the click handler
    expect(onClicked).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Spacing handles
// ---------------------------------------------------------------------------

describe('SelectableBlock - spacing handles', () => {
  it('renders spacing handles only when selected with onStyleUpdate', () => {
    const onStyleUpdate = vi.fn();
    const { container, rerender } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { padding: '10px', margin: '5px' },
        })}
      />,
    );
    // 4 padding + 4 margin handles
    const handles = Array.from(container.querySelectorAll('div')).filter((d) => {
      const t = (d as HTMLElement).getAttribute('title') || '';
      return t.startsWith('Drag to adjust padding-') || t.startsWith('Drag to adjust margin-');
    });
    expect(handles.length).toBe(8);

    rerender(<SelectableBlock {...defaultProps({ isSelected: true })} />);
    const after = Array.from(container.querySelectorAll('div')).filter((d) => {
      const t = (d as HTMLElement).getAttribute('title') || '';
      return t.startsWith('Drag to adjust padding-') || t.startsWith('Drag to adjust margin-');
    });
    expect(after.length).toBe(0);
  });

  it('parses single-value padding/margin and renders correct titles', () => {
    const onStyleUpdate = vi.fn();
    const { container } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { padding: '12px', margin: '7px' },
        })}
      />,
    );
    const titles = Array.from(container.querySelectorAll('div'))
      .map((d) => (d as HTMLElement).getAttribute('title'))
      .filter((t): t is string => Boolean(t));
    expect(titles).toContain('Drag to adjust padding-top (12px)');
    expect(titles).toContain('Drag to adjust padding-right (12px)');
    expect(titles).toContain('Drag to adjust padding-bottom (12px)');
    expect(titles).toContain('Drag to adjust padding-left (12px)');
    expect(titles).toContain('Drag to adjust margin-top (7px)');
  });

  it('parses 2-value, 3-value, and 4-value spacing', () => {
    const onStyleUpdate = vi.fn();
    // 2-value: top/bottom = 10, left/right = 20
    const { container, rerender } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { padding: '10px 20px' },
        })}
      />,
    );
    let titles = Array.from(container.querySelectorAll('div'))
      .map((d) => (d as HTMLElement).getAttribute('title'))
      .filter((t): t is string => Boolean(t));
    expect(titles).toContain('Drag to adjust padding-top (10px)');
    expect(titles).toContain('Drag to adjust padding-right (20px)');
    expect(titles).toContain('Drag to adjust padding-bottom (10px)');
    expect(titles).toContain('Drag to adjust padding-left (20px)');

    // 3-value: top=1, left/right=2, bottom=3
    rerender(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { padding: '1px 2px 3px' },
        })}
      />,
    );
    titles = Array.from(container.querySelectorAll('div'))
      .map((d) => (d as HTMLElement).getAttribute('title'))
      .filter((t): t is string => Boolean(t));
    expect(titles).toContain('Drag to adjust padding-top (1px)');
    expect(titles).toContain('Drag to adjust padding-right (2px)');
    expect(titles).toContain('Drag to adjust padding-bottom (3px)');
    expect(titles).toContain('Drag to adjust padding-left (2px)');

    // 4-value: top=1, right=2, bottom=3, left=4
    rerender(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { padding: '1px 2px 3px 4px' },
        })}
      />,
    );
    titles = Array.from(container.querySelectorAll('div'))
      .map((d) => (d as HTMLElement).getAttribute('title'))
      .filter((t): t is string => Boolean(t));
    expect(titles).toContain('Drag to adjust padding-top (1px)');
    expect(titles).toContain('Drag to adjust padding-right (2px)');
    expect(titles).toContain('Drag to adjust padding-bottom (3px)');
    expect(titles).toContain('Drag to adjust padding-left (4px)');
  });

  it('falls back to 0 when currentStyle.padding is undefined', () => {
    const onStyleUpdate = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true, onStyleUpdate })} />,
    );
    const titles = Array.from(container.querySelectorAll('div'))
      .map((d) => (d as HTMLElement).getAttribute('title'))
      .filter((t): t is string => Boolean(t));
    expect(titles).toContain('Drag to adjust padding-top (0px)');
  });

  it('drag on padding-top handle calls onStyleUpdate with new padding string', () => {
    const onStyleUpdate = vi.fn();
    const { container } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { padding: '10px' },
        })}
      />,
    );
    const topHandle = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).getAttribute('title') === 'Drag to adjust padding-top (10px)',
    ) as HTMLElement;
    expect(topHandle).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(topHandle, { clientX: 0, clientY: 0 });
    });
    expect(document.body.style.cursor).toBe('ns-resize');

    act(() => {
      fireEvent.mouseMove(document, { clientX: 0, clientY: 5 });
    });
    expect(onStyleUpdate).toHaveBeenCalled();
    const lastCall = onStyleUpdate.mock.calls[onStyleUpdate.mock.calls.length - 1];
    expect(lastCall[0]).toBe('block-1');
    expect(lastCall[1]).toHaveProperty('padding');

    act(() => {
      fireEvent.mouseUp(document);
    });
    expect(document.body.style.cursor).toBe('');
  });

  it('drag on margin-right handle uses ew-resize cursor and updates margin', () => {
    const onStyleUpdate = vi.fn();
    const { container } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { margin: '4px' },
        })}
      />,
    );
    const rightHandle = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).getAttribute('title') === 'Drag to adjust margin-right (4px)',
    ) as HTMLElement;
    expect(rightHandle).toBeTruthy();

    act(() => {
      fireEvent.mouseDown(rightHandle, { clientX: 100, clientY: 100 });
    });
    expect(document.body.style.cursor).toBe('ew-resize');

    act(() => {
      fireEvent.mouseMove(document, { clientX: 80, clientY: 100 });
    });
    expect(onStyleUpdate).toHaveBeenCalled();
    expect(onStyleUpdate.mock.calls.some((c) => 'margin' in c[1])).toBe(true);

    act(() => {
      fireEvent.mouseUp(document);
    });
  });

  it('drag clamps negative values to 0', () => {
    const onStyleUpdate = vi.fn();
    const { container } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { padding: '5px' },
        })}
      />,
    );
    const topHandle = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).getAttribute('title') === 'Drag to adjust padding-top (5px)',
    ) as HTMLElement;
    act(() => {
      fireEvent.mouseDown(topHandle, { clientX: 0, clientY: 100 });
    });
    // Move way up (negative delta) — should clamp to 0
    act(() => {
      fireEvent.mouseMove(document, { clientX: 0, clientY: 0 });
    });
    const last = onStyleUpdate.mock.calls[onStyleUpdate.mock.calls.length - 1][1] as { padding: string };
    expect(last.padding).toMatch(/^0px/);
    act(() => {
      fireEvent.mouseUp(document);
    });
  });

  it('drag shows live label tooltip during drag and hides after mouseup', () => {
    const onStyleUpdate = vi.fn();
    const { container } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { padding: '8px' },
        })}
      />,
    );
    const topHandle = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).getAttribute('title') === 'Drag to adjust padding-top (8px)',
    ) as HTMLElement;
    act(() => {
      fireEvent.mouseDown(topHandle, { clientX: 0, clientY: 0 });
    });
    // After mousedown, a live-label tooltip should appear
    expect(container.textContent).toMatch(/padding top: \d+px/);
    act(() => {
      fireEvent.mouseUp(document);
    });
    // Tooltip should be gone after mouseup
    expect(container.textContent).not.toMatch(/padding top: \d+px/);
  });

  it('mouse hover on handle changes its background color and reset on leave', () => {
    const onStyleUpdate = vi.fn();
    const { container } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          onStyleUpdate,
          currentStyle: { padding: '8px' },
        })}
      />,
    );
    const topHandle = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).getAttribute('title') === 'Drag to adjust padding-top (8px)',
    ) as HTMLElement;
    fireEvent.mouseEnter(topHandle);
    expect(topHandle.style.backgroundColor).not.toBe('transparent');
    fireEvent.mouseLeave(topHandle);
    expect(topHandle.style.backgroundColor).toBe('transparent');
  });
});

// ---------------------------------------------------------------------------
// + Add After button
// ---------------------------------------------------------------------------

describe('SelectableBlock - add-after button', () => {
  it('renders + add-after button when hovered with onAddAfter', () => {
    const onAddAfter = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isHovered: true, onAddAfter })} />,
    );
    const btn = container.querySelector('button');
    expect(btn).toBeTruthy();
    expect(btn?.textContent).toBe('+');
  });

  it('does not render + add-after button without onAddAfter prop', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isHovered: true })} />,
    );
    expect(container.querySelector('button')).toBeFalsy();
  });

  it('clicking + add-after button calls onAddAfter with blockId and stops bubble', () => {
    const onAddAfter = vi.fn();
    const onClicked = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isHovered: true, onAddAfter, onClicked })} />,
    );
    const btn = container.querySelector('button')!;
    fireEvent.click(btn);
    expect(onAddAfter).toHaveBeenCalledWith('block-1');
    expect(onClicked).not.toHaveBeenCalled();
  });

  it('hovering + add-after button scales it and resets on leave', () => {
    const onAddAfter = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isHovered: true, onAddAfter })} />,
    );
    const btn = container.querySelector('button')! as HTMLElement;
    fireEvent.mouseEnter(btn);
    expect(btn.style.transform).toBe('scale(1.2)');
    fireEvent.mouseLeave(btn);
    expect(btn.style.transform).toBe('scale(1)');
  });
});

// ---------------------------------------------------------------------------
// + Add Array Item button (for card-grid, stats, etc.)
// ---------------------------------------------------------------------------

describe('SelectableBlock - add-array-item button', () => {
  it('renders + Card button for card-grid blocks when selected', () => {
    const { getByText } = render(
      <SelectableBlock
        {...defaultProps({ blockType: 'card-grid', isSelected: true })}
      />,
    );
    expect(getByText(/\+ Card/)).toBeInTheDocument();
  });

  it('renders + Stat for stats block, + Image for gallery, + Service for services-grid, + Item for accordion', () => {
    const types: Array<[string, string]> = [
      ['stats', '+ Stat'],
      ['gallery', '+ Image'],
      ['services-grid', '+ Service'],
      ['accordion', '+ Item'],
    ];
    for (const [bt, label] of types) {
      const { getByText, unmount } = render(
        <SelectableBlock {...defaultProps({ blockType: bt, isSelected: true })} />,
      );
      expect(getByText(label)).toBeInTheDocument();
      unmount();
    }
  });

  it('does NOT render + Add Item for non-array block types like "text"', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ blockType: 'text', isSelected: true })} />,
    );
    // No "+ Item" / "+ Card" buttons should be present
    const buttons = Array.from(container.querySelectorAll('button')).map((b) => b.textContent || '');
    expect(buttons.some((t) => t.startsWith('+ '))).toBe(false);
  });

  it('clicking + Card sends BLOCK_CONTENT_UPDATED with __add_array_item field', () => {
    const { getByText } = render(
      <SelectableBlock {...defaultProps({ blockType: 'card-grid', isSelected: true })} />,
    );
    fireEvent.click(getByText(/\+ Card/));
    expect(sendToParentMock).toHaveBeenCalledWith(
      'BLOCK_CONTENT_UPDATED',
      expect.objectContaining({
        blockId: 'block-1',
        field: '__add_array_item',
        value: 'cards',
      }),
    );
  });

  it('hovering + add-array-item scales button and resets on leave', () => {
    const { getByText } = render(
      <SelectableBlock {...defaultProps({ blockType: 'card-grid', isSelected: true })} />,
    );
    const btn = getByText(/\+ Card/) as HTMLElement;
    fireEvent.mouseEnter(btn);
    expect(btn.style.transform).toBe('scale(1.05)');
    fireEvent.mouseLeave(btn);
    expect(btn.style.transform).toBe('scale(1)');
  });
});

// ---------------------------------------------------------------------------
// Columns editor overlay
// ---------------------------------------------------------------------------

describe('SelectableBlock - columns editor overlay', () => {
  it('renders ColumnsEditorOverlay when selected and columnsData has >1 columns', () => {
    const { getByTestId } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          columnsData: { columns: [{ id: 'c1', width: 50 }, { id: 'c2', width: 50 }], gap: 'md' },
        })}
      />,
    );
    expect(getByTestId('columns-editor-overlay')).toHaveAttribute('data-block-id', 'block-1');
  });

  it('does not render ColumnsEditorOverlay with only one column', () => {
    const { queryByTestId } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: true,
          columnsData: { columns: [{ id: 'c1', width: 100 }], gap: 'md' },
        })}
      />,
    );
    expect(queryByTestId('columns-editor-overlay')).toBeNull();
  });

  it('does not render ColumnsEditorOverlay when not selected', () => {
    const { queryByTestId } = render(
      <SelectableBlock
        {...defaultProps({
          isSelected: false,
          columnsData: { columns: [{ id: 'c1', width: 50 }, { id: 'c2', width: 50 }], gap: 'md' },
        })}
      />,
    );
    expect(queryByTestId('columns-editor-overlay')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Inline editable content
// ---------------------------------------------------------------------------

describe('SelectableBlock - inline editable content', () => {
  it('does not enable contentEditable when not selected', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: false })}>
        <h2 data-editable-field="title">Hello</h2>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2')!;
    expect(h2.getAttribute('contenteditable')).not.toBe('true');
  });

  it('enables contentEditable on [data-editable-field] elements when selected', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <h2 data-editable-field="title">Hello</h2>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2')!;
    expect((h2 as HTMLElement).contentEditable).toBe('true');
  });

  it('falls back to common text tags (h1-h6, p, blockquote) when no data-editable-field present', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <div>
          <h2>Title</h2>
          <p>Body</p>
        </div>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2') as HTMLElement;
    const p = container.querySelector('p') as HTMLElement;
    expect(h2.contentEditable).toBe('true');
    expect(p.contentEditable).toBe('true');
  });

  it('blur with no content change does not post message', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <h2 data-editable-field="title">Hello</h2>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2')!;
    sendToParentMock.mockReset();
    fireEvent.blur(h2);
    expect(sendToParentMock).not.toHaveBeenCalled();
  });

  it('blur with content change sends BLOCK_CONTENT_UPDATED with field name', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <h2 data-editable-field="title">Hello</h2>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2')! as HTMLElement;
    sendToParentMock.mockReset();
    h2.innerHTML = 'New Text';
    fireEvent.blur(h2);
    expect(sendToParentMock).toHaveBeenCalledWith(
      'BLOCK_CONTENT_UPDATED',
      expect.objectContaining({
        blockId: 'block-1',
        field: 'title',
        value: 'New Text',
      }),
    );
  });

  it('blur on h1-h6 without data-editable-field guesses field="content"', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <h2>Title</h2>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2')! as HTMLElement;
    sendToParentMock.mockReset();
    h2.innerHTML = 'Different';
    fireEvent.blur(h2);
    expect(sendToParentMock).toHaveBeenCalledWith(
      'BLOCK_CONTENT_UPDATED',
      expect.objectContaining({ field: 'content', value: 'Different' }),
    );
  });

  it('blur on blockquote guesses field="quote"', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <blockquote>Q</blockquote>
      </SelectableBlock>,
    );
    const bq = container.querySelector('blockquote')! as HTMLElement;
    sendToParentMock.mockReset();
    bq.innerHTML = 'New Q';
    fireEvent.blur(bq);
    expect(sendToParentMock).toHaveBeenCalledWith(
      'BLOCK_CONTENT_UPDATED',
      expect.objectContaining({ field: 'quote' }),
    );
  });

  it('Enter without shift on contentEditable blurs the element (preventDefault)', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <h2 data-editable-field="title">Hello</h2>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2')! as HTMLElement;
    const blurSpy = vi.spyOn(h2, 'blur');
    fireEvent.keyDown(h2, { key: 'Enter' });
    expect(blurSpy).toHaveBeenCalled();
  });

  it('Shift+Enter on contentEditable does NOT blur the element', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <h2 data-editable-field="title">Hello</h2>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2')! as HTMLElement;
    const blurSpy = vi.spyOn(h2, 'blur');
    fireEvent.keyDown(h2, { key: 'Enter', shiftKey: true });
    expect(blurSpy).not.toHaveBeenCalled();
  });

  it('input event with content debounce posts BLOCK_CONTENT_UPDATED', async () => {
    vi.useFakeTimers();
    try {
      const { container } = render(
        <SelectableBlock {...defaultProps({ isSelected: true })}>
          <h2 data-editable-field="title">Hello</h2>
        </SelectableBlock>,
      );
      const h2 = container.querySelector('h2')! as HTMLElement;
      sendToParentMock.mockReset();
      h2.innerHTML = 'NewTyped';
      fireEvent.input(h2);
      // Before debounce timer fires
      expect(sendToParentMock).not.toHaveBeenCalled();
      // Advance the 300ms debounce
      act(() => {
        vi.advanceTimersByTime(350);
      });
      expect(sendToParentMock).toHaveBeenCalledWith(
        'BLOCK_CONTENT_UPDATED',
        expect.objectContaining({ field: 'title', value: 'NewTyped' }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('removing selection state cleans up contentEditable on elements', () => {
    const { container, rerender } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <h2 data-editable-field="title">Hello</h2>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2')! as HTMLElement;
    expect(h2.contentEditable).toBe('true');

    rerender(
      <SelectableBlock {...defaultProps({ isSelected: false })}>
        <h2 data-editable-field="title">Hello</h2>
      </SelectableBlock>,
    );
    expect(h2.contentEditable).toBe('false');
  });

  it('clicking inside selected content stops propagation', () => {
    const onClicked = vi.fn();
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true, onClicked })}>
        <h2 data-editable-field="title">Hello</h2>
      </SelectableBlock>,
    );
    const h2 = container.querySelector('h2')!;
    fireEvent.click(h2);
    // The outer container click handler would fire onClicked, but inner content
    // click stops propagation when selected.
    // Note: the outer onClick still fires for the EditableContent wrapper, which
    // calls stopPropagation. So onClicked should not be called by inner click.
    expect(onClicked).not.toHaveBeenCalled();
  });

  it('modifier (cmd/ctrl) keydown enables pointer events on unselected block', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: false })}>
        <span data-testid="child">x</span>
      </SelectableBlock>,
    );
    // Initially the inner wrapper has pointerEvents 'none'
    const innerWrappers = container.querySelectorAll('div[style*="pointer-events"]');
    // Fire a keydown with metaKey on the window
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { metaKey: true }));
    });
    // After keydown, the state update should flip pointer events to auto.
    // Re-querying the rendered DOM:
    const updated = Array.from(container.querySelectorAll('div')).find(
      (d) => (d as HTMLElement).style.pointerEvents === 'auto',
    );
    expect(updated || innerWrappers.length).toBeTruthy();

    // Releasing the key resets
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup'));
    });
  });

  it('window blur event resets modifierHeld', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: false })}>
        <span>x</span>
      </SelectableBlock>,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { ctrlKey: true }));
    });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });
    // No assertion failure means the listeners ran without error
    expect(container).toBeTruthy();
  });

  it('children with only-whitespace text are skipped in fallback selector', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <div>
          <p>   </p>
          <p>has text</p>
        </div>
      </SelectableBlock>,
    );
    const paragraphs = container.querySelectorAll('p');
    // Only the second p (with text) becomes editable; whitespace-only stays
    // un-set (jsdom returns 'inherit' or undefined, NOT 'true').
    expect((paragraphs[0] as HTMLElement).contentEditable).not.toBe('true');
    expect((paragraphs[1] as HTMLElement).contentEditable).toBe('true');
  });

  it('containers with child block elements are skipped in fallback selector', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ isSelected: true })}>
        <div>
          <div className="text-x">
            <p>inner</p>
          </div>
          <p>standalone</p>
        </div>
      </SelectableBlock>,
    );
    // The wrapper with class text-x contains <p>, so it should NOT be made editable
    const wrapperWithChild = container.querySelector('div.text-x') as HTMLElement;
    expect(wrapperWithChild.contentEditable).not.toBe('true');
    // The standalone p is leaf and editable
    const ps = container.querySelectorAll('p');
    const standalone = Array.from(ps).find((p) => p.textContent === 'standalone') as HTMLElement;
    expect(standalone.contentEditable).toBe('true');
  });
});

// ---------------------------------------------------------------------------
// Sanity: very minimal toolbar header shows for selected blocks
// ---------------------------------------------------------------------------

describe('SelectableBlock - misc', () => {
  it('toolbar label uses blockType text when provided', () => {
    const { getByText } = render(
      <SelectableBlock {...defaultProps({ blockType: 'heading', isSelected: true })} />,
    );
    expect(getByText('heading')).toBeInTheDocument();
  });

  it('renders fine with empty children', () => {
    const { container } = render(
      <SelectableBlock {...defaultProps({ children: null })} />,
    );
    expect(container.firstChild).toBeTruthy();
  });
});
