// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock useEditorMode so EditorModeProvider can render without the full editor
// machinery (hooks that internally reach for various stores etc.)
vi.mock('@/lib/visual-editor/useEditorMode', () => ({
  useEditorMode: () => ({
    active: true,
    blocks: [],
    selectedBlockId: 'b1',
    selectedBlockIds: ['b1'],
    hoveredBlockId: null,
    externalDrag: { active: false, blockType: null, x: 0, y: 0 },
    typeTemplate: null,
    onBlockClicked: vi.fn(),
    onBlockHovered: vi.fn(),
    onBlocksReordered: vi.fn(),
    onAddBlockAfter: vi.fn(),
    onBlockResized: vi.fn(),
    onBlockStyleUpdated: vi.fn(),
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: true,
    canRedo: false,
  }),
}));

// Mock the BlockEditorContext so ViewportSelector can fall back to props
// when used outside of a provider. The component catches the throw and uses
// props — we exercise both branches by passing useContext=false (force props)
// and the default (which throws inside the catch).
vi.mock('@/contexts/BlockEditorContext', () => ({
  useBlockEditor: () => {
    throw new Error('useBlockEditor must be used within a BlockEditorProvider');
  },
}));

// ---------------------------------------------------------------------------
// Components under test
// ---------------------------------------------------------------------------

import {
  EditorModeProvider,
  useEditorModeContext,
} from '@/components/visual-editor/EditorModeProvider';
import { ResponsiveIndicator } from '@/components/blocks/ResponsiveIndicator';
import { ViewportSelector } from '@/components/blocks/ViewportSelector';
import { AbGoalTracker } from '@/components/blocks/AbGoalTracker';

// ---------------------------------------------------------------------------
// EditorModeProvider
// ---------------------------------------------------------------------------

describe('EditorModeProvider', () => {
  it('renders children and exposes the editor mode context value', () => {
    function Probe() {
      const ctx = useEditorModeContext();
      return (
        <div>
          <span data-testid="active">{String(ctx.active)}</span>
          <span data-testid="selected">{ctx.selectedBlockId ?? ''}</span>
          <span data-testid="canUndo">{String(ctx.canUndo)}</span>
          <span data-testid="canRedo">{String(ctx.canRedo)}</span>
        </div>
      );
    }

    render(
      <EditorModeProvider>
        <Probe />
      </EditorModeProvider>,
    );

    expect(screen.getByTestId('active').textContent).toBe('true');
    expect(screen.getByTestId('selected').textContent).toBe('b1');
    expect(screen.getByTestId('canUndo').textContent).toBe('true');
    expect(screen.getByTestId('canRedo').textContent).toBe('false');
  });

});

// ---------------------------------------------------------------------------
// EditorModeProvider — default context value (no provider wrapper)
// ---------------------------------------------------------------------------

describe('useEditorModeContext default', () => {
  it('returns the inert default value when consumed outside any provider', () => {
    let captured: ReturnType<typeof useEditorModeContext> | null = null;
    function Probe() {
      captured = useEditorModeContext();
      return null;
    }
    render(<Probe />);
    expect(captured).not.toBeNull();
    expect(captured!.active).toBe(false);
    expect(captured!.blocks).toEqual([]);
    expect(captured!.selectedBlockId).toBeNull();
    expect(captured!.selectedBlockIds).toEqual([]);
    expect(captured!.canUndo).toBe(false);
    expect(captured!.canRedo).toBe(false);
    // No-op handlers should not throw
    expect(() => captured!.onBlockClicked('x', { shiftKey: true })).not.toThrow();
    expect(() => captured!.onBlockHovered(null)).not.toThrow();
    expect(() => captured!.onBlocksReordered([])).not.toThrow();
    expect(() => captured!.onAddBlockAfter('x')).not.toThrow();
    expect(() => captured!.onBlockResized('x', '100px', '50px')).not.toThrow();
    expect(() => captured!.onBlockStyleUpdated('x', { color: 'red' })).not.toThrow();
    expect(() => captured!.undo()).not.toThrow();
    expect(() => captured!.redo()).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// ResponsiveIndicator
// ---------------------------------------------------------------------------

describe('ResponsiveIndicator', () => {
  it('returns null when the block has no responsive or stacking settings', () => {
    const { container } = render(
      <ResponsiveIndicator
        block={{ id: 'b1', type: 'text', content: 'hi' } as never}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the badge when any responsive setting is configured', () => {
    render(
      <ResponsiveIndicator
        block={{
          id: 'b2',
          type: 'text',
          responsive: { paddingTop: '12px' },
        } as never}
      />,
    );
    expect(screen.getByText('Responsive')).toBeInTheDocument();
    expect(screen.getByText('Responsive').closest('div')).toHaveAttribute(
      'title',
      'This block has responsive settings configured',
    );
  });

  it('renders the badge when font size is configured', () => {
    render(
      <ResponsiveIndicator
        block={{
          id: 'b3',
          type: 'text',
          responsive: { fontSize: { mobile: '12px' } },
        } as never}
      />,
    );
    expect(screen.getByText('Responsive')).toBeInTheDocument();
  });

  it('renders the badge for columns blocks with stackOnMobile', () => {
    render(
      <ResponsiveIndicator
        block={{
          id: 'b4',
          type: 'columns',
          stackOnMobile: true,
        } as never}
      />,
    );
    expect(screen.getByText('Responsive')).toBeInTheDocument();
  });

  it('renders the badge for columns blocks with stackOnTablet', () => {
    render(
      <ResponsiveIndicator
        block={{
          id: 'b5',
          type: 'columns',
          stackOnTablet: false,
        } as never}
      />,
    );
    expect(screen.getByText('Responsive')).toBeInTheDocument();
  });

  it('does not render for non-columns blocks just because stackOnMobile is set', () => {
    const { container } = render(
      <ResponsiveIndicator
        block={{
          id: 'b6',
          type: 'text',
          stackOnMobile: true,
        } as never}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// ViewportSelector
// ---------------------------------------------------------------------------

describe('ViewportSelector', () => {
  it('renders three viewport buttons with prop-driven state', () => {
    const onChange = vi.fn();
    render(
      <ViewportSelector
        useContext={false}
        currentViewport="desktop"
        onViewportChange={onChange}
      />,
    );
    // Each button has a title with the viewport label
    const mobileBtn = screen.getByTitle(/Mobile/);
    const tabletBtn = screen.getByTitle(/Tablet/);
    const desktopBtn = screen.getByTitle(/Desktop/);
    expect(mobileBtn).toBeInTheDocument();
    expect(tabletBtn).toBeInTheDocument();
    expect(desktopBtn).toBeInTheDocument();
  });

  it('invokes onViewportChange when a non-active viewport button is clicked', () => {
    const onChange = vi.fn();
    render(
      <ViewportSelector
        useContext={false}
        currentViewport="desktop"
        onViewportChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTitle(/Mobile/));
    expect(onChange).toHaveBeenCalledWith('mobile');
    fireEvent.click(screen.getByTitle(/Tablet/));
    expect(onChange).toHaveBeenCalledWith('tablet');
  });

  it('applies active styling to the currently selected viewport', () => {
    render(
      <ViewportSelector
        useContext={false}
        currentViewport="tablet"
        onViewportChange={() => {}}
      />,
    );
    const tabletBtn = screen.getByTitle(/Tablet/);
    expect(tabletBtn.className).toContain('bg-primary');
    const mobileBtn = screen.getByTitle(/Mobile/);
    expect(mobileBtn.className).not.toContain('bg-primary text-primary-foreground');
  });

  it('falls back to the desktop default when no props or context are provided', () => {
    // useContext defaults to true, but our mocked useBlockEditor throws,
    // exercising the try/catch fallback path with desktop default.
    render(<ViewportSelector />);
    const desktopBtn = screen.getByTitle(/Desktop/);
    expect(desktopBtn.className).toContain('bg-primary');
  });

  it('clicking the active viewport still calls the handler (no-op guard)', () => {
    const onChange = vi.fn();
    render(
      <ViewportSelector
        useContext={false}
        currentViewport="mobile"
        onViewportChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTitle(/Mobile/));
    expect(onChange).toHaveBeenCalledWith('mobile');
  });

  it('renders the desktop icon when desktop is active', () => {
    render(
      <ViewportSelector
        useContext={false}
        currentViewport="desktop"
        onViewportChange={() => {}}
      />,
    );
    // The desktop icon is the laptop emoji from BREAKPOINTS config
    expect(screen.getByTitle(/Desktop/).textContent).toMatch(/[💻]/);
  });
});

// ---------------------------------------------------------------------------
// AbGoalTracker
// ---------------------------------------------------------------------------

describe('AbGoalTracker', () => {
  it('renders a script tag with the experiment + variant data attributes', () => {
    const { container } = render(
      <AbGoalTracker
        experimentId={42}
        variantKey="control"
        goalMetric="cta_click"
        goalSelector=".buy-button"
        visitorId="visitor-1"
      />,
    );
    const script = container.querySelector('script');
    expect(script).not.toBeNull();
    expect(script!.getAttribute('data-ab-experiment')).toBe('42');
    expect(script!.getAttribute('data-ab-variant')).toBe('control');
  });

  it('embeds the JSON config inside the inline script body', () => {
    const { container } = render(
      <AbGoalTracker
        experimentId={7}
        variantKey="v-b"
        goalMetric="form_submit"
        goalSelector="form.signup"
        visitorId="vid-123"
        endpoint="/api/custom"
      />,
    );
    const body = container.querySelector('script')!.innerHTML;
    // Each config field should appear inside the inlined script body
    expect(body).toContain('"experimentId":7');
    expect(body).toContain('"variantKey":"v-b"');
    expect(body).toContain('"goalMetric":"form_submit"');
    expect(body).toContain('"goalSelector":"form.signup"');
    expect(body).toContain('"visitorId":"vid-123"');
    expect(body).toContain('"endpoint":"/api/custom"');
  });

  it('defaults endpoint to /api/public/ab/event when omitted', () => {
    const { container } = render(
      <AbGoalTracker
        experimentId={1}
        variantKey="a"
        goalMetric="page_view"
        visitorId="v-pv"
      />,
    );
    const body = container.querySelector('script')!.innerHTML;
    expect(body).toContain('"endpoint":"/api/public/ab/event"');
  });

  it('normalises a missing goalSelector to null in the config', () => {
    const { container } = render(
      <AbGoalTracker
        experimentId={2}
        variantKey="b"
        goalMetric="cta_click"
        visitorId="v-1"
      />,
    );
    const body = container.querySelector('script')!.innerHTML;
    expect(body).toContain('"goalSelector":null');
  });

  it('normalises a null goalSelector to null in the config', () => {
    const { container } = render(
      <AbGoalTracker
        experimentId={3}
        variantKey="c"
        goalMetric="cta_click"
        goalSelector={null}
        visitorId="v-2"
      />,
    );
    const body = container.querySelector('script')!.innerHTML;
    expect(body).toContain('"goalSelector":null');
  });

  it('embeds untrusted selectors as JSON-encoded string content', () => {
    // The selector includes a double quote — JSON.stringify must escape it
    // so the surrounding JSON string literal stays intact.
    const evilSelector = '"); alert("xss")//';
    const { container } = render(
      <AbGoalTracker
        experimentId={9}
        variantKey="evil"
        goalMetric="cta_click"
        goalSelector={evilSelector}
        visitorId="evil-visitor"
      />,
    );
    const body = container.querySelector('script')!.innerHTML;
    // The double quote inside the selector must appear escaped as \"
    expect(body).toContain('\\"');
    // The selector still appears under the goalSelector key
    expect(body).toContain('"goalSelector":');
    // And the inline script is still wrapped in an IIFE
    expect(body).toContain('(function()');
  });

  it('uses page_view branch labelling for the experimentId attribute', () => {
    const { container } = render(
      <AbGoalTracker
        experimentId={100}
        variantKey="pv-variant"
        goalMetric="page_view"
        visitorId="pv-visitor"
      />,
    );
    const script = container.querySelector('script')!;
    expect(script.getAttribute('data-ab-experiment')).toBe('100');
    expect(script.getAttribute('data-ab-variant')).toBe('pv-variant');
    expect(script.innerHTML).toContain('"goalMetric":"page_view"');
  });
});
