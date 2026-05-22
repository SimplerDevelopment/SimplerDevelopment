// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, renderHook } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for transitive deps
// ---------------------------------------------------------------------------

// framer-motion — passthrough proxy. Components under test pass framer-only
// props like initial/whileInView/viewport/transition — strip these before
// reaching the DOM so React doesn't warn about unknown attributes.
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, ...rest }: any) {
      const {
        whileHover: _wh,
        whileTap: _wt,
        whileInView: _wv,
        initial: _i,
        animate: _a,
        exit: _e,
        transition: _t,
        viewport: _v,
        ...domSafe
      } = rest;
      void _wh; void _wt; void _wv; void _i; void _a; void _e; void _t; void _v;
      return React.createElement(
        tag,
        { className, style, 'data-motion': tag, ...domSafe },
        children,
      );
    };
  const motion: any = new Proxy(
    {},
    { get: (_t, prop: string) => passthrough(prop) },
  );
  return {
    motion,
    AnimatePresence: ({ children }: any) =>
      React.createElement(React.Fragment, null, children),
    useScroll: () => ({ scrollYProgress: { get: () => 0, on: () => () => {} } }),
    useTransform: () => '25%',
  };
});

// useEditorMode hook — return a deterministic shape so EditorModeProvider
// can wire it into context without touching real state machines.
vi.mock('@/lib/visual-editor/useEditorMode', () => ({
  __esModule: true,
  useEditorMode: () => ({
    active: true,
    blocks: [{ id: 'b1', type: 'text', order: 0 }],
    selectedBlockId: 'b1',
    selectedBlockIds: ['b1'],
    hoveredBlockId: null,
    pageSettings: undefined,
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

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import { ParallaxSection } from '@/components/animations/ParallaxSection';
import {
  EditorModeProvider,
  useEditorModeContext,
} from '@/components/visual-editor/EditorModeProvider';

// ---------------------------------------------------------------------------
// FadeIn
// ---------------------------------------------------------------------------

describe('FadeIn', () => {
  it('renders children inside a motion.div wrapper', () => {
    const { container, getByText } = render(
      <FadeIn>
        <span>Hello world</span>
      </FadeIn>,
    );
    expect(getByText('Hello world')).toBeTruthy();
    // motion.div is mocked to a real <div data-motion="div">
    const wrapper = container.querySelector('[data-motion="div"]');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.textContent).toBe('Hello world');
  });

  it('applies the supplied className to the wrapper', () => {
    const { container } = render(
      <FadeIn className="my-fade">
        <span>X</span>
      </FadeIn>,
    );
    const wrapper = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(wrapper.className).toContain('my-fade');
  });

  it('defaults className to empty string when not provided', () => {
    const { container } = render(
      <FadeIn>
        <span>Y</span>
      </FadeIn>,
    );
    const wrapper = container.querySelector('[data-motion="div"]') as HTMLElement;
    // No className attribute (or empty)
    expect(wrapper.getAttribute('class') ?? '').toBe('');
  });

  it('accepts delay and duration props without crashing', () => {
    const { container } = render(
      <FadeIn delay={1.5} duration={0.2}>
        <span>Z</span>
      </FadeIn>,
    );
    expect(container.querySelector('[data-motion="div"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// SlideIn
// ---------------------------------------------------------------------------

describe('SlideIn', () => {
  it('renders children inside a motion.div wrapper', () => {
    const { container, getByText } = render(
      <SlideIn>
        <p>SlideIn body</p>
      </SlideIn>,
    );
    expect(getByText('SlideIn body')).toBeTruthy();
    const wrapper = container.querySelector('[data-motion="div"]');
    expect(wrapper).toBeTruthy();
  });

  it('applies the supplied className', () => {
    const { container } = render(
      <SlideIn className="slide-x">
        <span>S</span>
      </SlideIn>,
    );
    const wrapper = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(wrapper.className).toContain('slide-x');
  });

  it.each([
    ['left' as const, 50],
    ['right' as const, 80],
    ['up' as const, 25],
    ['down' as const, 100],
  ])('renders without error for direction=%s, distance=%s', (direction, distance) => {
    const { container } = render(
      <SlideIn direction={direction} distance={distance}>
        <span>{direction}</span>
      </SlideIn>,
    );
    expect(container.querySelector('[data-motion="div"]')?.textContent).toBe(direction);
  });

  it('accepts delay + duration props and still renders children', () => {
    const { getByText } = render(
      <SlideIn delay={0.4} duration={1}>
        <span>Delayed</span>
      </SlideIn>,
    );
    expect(getByText('Delayed')).toBeTruthy();
  });

  it('exercises every Direction branch (covers getInitialPosition switch)', () => {
    // Render all four directions in a single tree; each one exercises a
    // different branch of the getInitialPosition switch statement.
    const { container } = render(
      <>
        <SlideIn direction="left"><span>L</span></SlideIn>
        <SlideIn direction="right"><span>R</span></SlideIn>
        <SlideIn direction="up"><span>U</span></SlideIn>
        <SlideIn direction="down"><span>D</span></SlideIn>
      </>,
    );
    const wrappers = container.querySelectorAll('[data-motion="div"]');
    expect(wrappers.length).toBe(4);
    expect(container.textContent).toBe('LRUD');
  });
});

// ---------------------------------------------------------------------------
// ParallaxSection
// ---------------------------------------------------------------------------

describe('ParallaxSection', () => {
  it('renders children inside a wrapper + motion.div', () => {
    const { container, getByText } = render(
      <ParallaxSection>
        <span>Parallax content</span>
      </ParallaxSection>,
    );
    expect(getByText('Parallax content')).toBeTruthy();
    // Outer wrapper is a plain <div> with the ref + optional className.
    // Inner element is the motion.div mock.
    const inner = container.querySelector('[data-motion="div"]');
    expect(inner).toBeTruthy();
    expect(inner?.textContent).toBe('Parallax content');
  });

  it('applies className to the outer wrapper, not the motion child', () => {
    const { container } = render(
      <ParallaxSection className="px-class">
        <span>X</span>
      </ParallaxSection>,
    );
    // Outer wrapper is the first child of the rendered fragment
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toBe('px-class');
    // The motion child shouldn't pick up the outer className
    const inner = container.querySelector('[data-motion="div"]') as HTMLElement;
    expect(inner.className ?? '').not.toContain('px-class');
  });

  it('renders without a className prop (defaults to empty string)', () => {
    const { container } = render(
      <ParallaxSection>
        <span>NoClass</span>
      </ParallaxSection>,
    );
    const outer = container.firstElementChild as HTMLElement;
    expect(outer.className).toBe('');
  });

  it('accepts a custom speed prop without throwing', () => {
    const { container } = render(
      <ParallaxSection speed={2}>
        <span>Fast</span>
      </ParallaxSection>,
    );
    expect(container.querySelector('[data-motion="div"]')?.textContent).toBe('Fast');
  });
});

// ---------------------------------------------------------------------------
// EditorModeProvider + useEditorModeContext
// ---------------------------------------------------------------------------

describe('EditorModeProvider', () => {
  it('renders children inside the provider', () => {
    const { getByText } = render(
      <EditorModeProvider>
        <div>child node</div>
      </EditorModeProvider>,
    );
    expect(getByText('child node')).toBeTruthy();
  });

  it('exposes the mocked useEditorMode shape via useEditorModeContext', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EditorModeProvider>{children}</EditorModeProvider>
    );
    const { result } = renderHook(() => useEditorModeContext(), { wrapper });

    expect(result.current.active).toBe(true);
    expect(result.current.blocks).toHaveLength(1);
    expect(result.current.blocks[0].id).toBe('b1');
    expect(result.current.selectedBlockId).toBe('b1');
    expect(result.current.selectedBlockIds).toEqual(['b1']);
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
    // All handlers must be callable
    expect(typeof result.current.onBlockClicked).toBe('function');
    expect(typeof result.current.onBlockHovered).toBe('function');
    expect(typeof result.current.onBlocksReordered).toBe('function');
    expect(typeof result.current.onAddBlockAfter).toBe('function');
    expect(typeof result.current.onBlockResized).toBe('function');
    expect(typeof result.current.onBlockStyleUpdated).toBe('function');
    expect(typeof result.current.undo).toBe('function');
    expect(typeof result.current.redo).toBe('function');
  });

  it('returns the safe default context shape when used outside a provider', () => {
    const { result } = renderHook(() => useEditorModeContext());
    // The module's createContext default has active=false and empty blocks
    expect(result.current.active).toBe(false);
    expect(result.current.blocks).toEqual([]);
    expect(result.current.selectedBlockId).toBeNull();
    expect(result.current.selectedBlockIds).toEqual([]);
    expect(result.current.hoveredBlockId).toBeNull();
    expect(result.current.externalDrag).toEqual({
      active: false,
      blockType: null,
      x: 0,
      y: 0,
    });
    expect(result.current.typeTemplate).toBeNull();
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
    // Default no-op handlers must still be callable
    expect(() => result.current.onBlockClicked('id')).not.toThrow();
    expect(() => result.current.onBlockHovered(null)).not.toThrow();
    expect(() => result.current.onBlocksReordered([])).not.toThrow();
    expect(() => result.current.onAddBlockAfter('id')).not.toThrow();
    expect(() => result.current.onBlockResized('id', '100px', '50px')).not.toThrow();
    expect(() => result.current.onBlockStyleUpdated('id', { color: 'red' })).not.toThrow();
    expect(() => result.current.undo()).not.toThrow();
    expect(() => result.current.redo()).not.toThrow();
  });
});
