// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy / framer-motion / 3D / next deps
// ---------------------------------------------------------------------------

// Mock framer-motion so we don't pull in animation runtime / IntersectionObserver.
// Each motion.<tag> returns a plain element that forwards children + className + style.
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style, onClick, onMouseMove, onMouseEnter, onMouseLeave, ...rest }: any) {
      // Strip framer-motion-only props that React will warn about
      const cleanRest: Record<string, any> = {};
      for (const [k, v] of Object.entries(rest)) {
        if (
          k === 'initial' ||
          k === 'animate' ||
          k === 'exit' ||
          k === 'transition' ||
          k === 'whileHover' ||
          k === 'whileTap' ||
          k === 'whileInView' ||
          k === 'viewport' ||
          k === 'variants' ||
          k === 'suppressHydrationWarning'
        ) {
          continue;
        }
        cleanRest[k] = v;
      }
      return React.createElement(
        tag,
        {
          className,
          style,
          onClick,
          onMouseMove,
          onMouseEnter,
          onMouseLeave,
          'data-motion': tag,
          ...cleanRest,
        },
        children,
      );
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  const fakeMV = () => {
    const handlers: Array<(v: number) => void> = [];
    return {
      get: () => 0,
      set: (_v: number) => {
        handlers.forEach((h) => h(_v));
      },
      on: (_evt: string, cb: (v: number) => void) => {
        handlers.push(cb);
        return () => {};
      },
    };
  };
  return {
    motion,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
    useMotionValue: () => fakeMV(),
    useTransform: () => '0%',
    useSpring: (v: any) => v,
  };
});

// Mock animate.css side-effect import in SelfDestruct
vi.mock('animate.css', () => ({}));

// Mock react-three/fiber — Canvas just renders a placeholder, useFrame is a no-op.
vi.mock('@react-three/fiber', () => ({
  Canvas: ({ children, className, style }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'three-canvas', className, style },
      children,
    ),
  useFrame: () => undefined,
}));

// Mock react-three/drei — bits used by CMSCarouselSection's LaptopCanvas.
vi.mock('@react-three/drei', () => ({
  Environment: () => null,
  PerspectiveCamera: () => null,
}));

// Mock the Laptop3D component that CMSCarouselSection pulls in.
vi.mock('@/components/three/Laptop3D', () => ({
  Laptop3D: () => null,
}));

// Mock three — only the constructors actually invoked by InteractiveFeatureCard's
// memoized work. We expose enough surface that `new THREE.X(...)` returns a
// truthy object and chained calls don't blow up.
vi.mock('three', () => {
  class Vector3 {
    x: number;
    y: number;
    z: number;
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
  }
  class BufferAttribute {
    array: any;
    itemSize: number;
    constructor(array: any, itemSize: number) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }
  class BufferGeometry {
    attributes: Record<string, any> = {};
    setAttribute(name: string, attr: any) {
      this.attributes[name] = attr;
      return this;
    }
    setFromPoints(_pts: any[]) {
      return this;
    }
  }
  class LineBasicMaterial {
    color: any;
    transparent: boolean;
    opacity: number;
    constructor(opts: any = {}) {
      this.color = opts.color;
      this.transparent = !!opts.transparent;
      this.opacity = opts.opacity ?? 1;
    }
  }
  class Line {
    geometry: any;
    material: any;
    constructor(geometry: any, material: any) {
      this.geometry = geometry;
      this.material = material;
    }
  }
  class MeshBasicMaterial {
    opacity = 1;
  }
  // Placeholder for THREE.Mesh / Points / Group references — the tests don't
  // exercise their behavior, but TS imports `type` references at compile.
  class Mesh {}
  class Points {}
  class Group {}
  return {
    Vector3,
    BufferAttribute,
    BufferGeometry,
    LineBasicMaterial,
    Line,
    MeshBasicMaterial,
    Mesh,
    Points,
    Group,
    default: {
      Vector3,
      BufferAttribute,
      BufferGeometry,
      LineBasicMaterial,
      Line,
      MeshBasicMaterial,
      Mesh,
      Points,
      Group,
    },
  };
});

// ---------------------------------------------------------------------------
// Imports under test (AFTER mocks)
// ---------------------------------------------------------------------------

import { CMSCarouselSection } from '@/components/sections/CMSCarouselSection';
import { HeroVisual } from '@/components/sections/HeroVisual';
import { InteractiveFeatureCard } from '@/components/sections/InteractiveFeatureCard';
import SelfDestruct from '@/components/easter-eggs/SelfDestruct';

// ---------------------------------------------------------------------------
// CMSCarouselSection
// ---------------------------------------------------------------------------

describe('CMSCarouselSection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the title heading', () => {
    render(<CMSCarouselSection title="Powerful CMS" />);
    const heading = screen.getByRole('heading', { level: 2 });
    expect(heading.textContent).toBe('Powerful CMS');
  });

  it('renders default feature title and description for the first slide', () => {
    render(<CMSCarouselSection title="CMS" />);
    // First default feature is "Content Management"
    expect(screen.getByText('Content Management')).toBeTruthy();
    expect(
      screen.getByText('Manage your content with an intuitive interface'),
    ).toBeTruthy();
  });

  it('renders one indicator button per feature', () => {
    render(<CMSCarouselSection title="CMS" />);
    // 4 default features → 4 indicator buttons + 2 prev/next buttons = 6 buttons total
    const buttons = screen.getAllByRole('button');
    // 4 indicators + Previous slide + Next slide
    expect(buttons.length).toBe(6);
  });

  it('advances the active slide when next is clicked', () => {
    render(<CMSCarouselSection title="CMS" />);
    expect(screen.getByText('Content Management')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Next slide'));
    // Second default feature is "Multi-channel Publishing"
    expect(screen.getByText('Multi-channel Publishing')).toBeTruthy();
  });

  it('wraps to last slide when prev is clicked from first', () => {
    render(<CMSCarouselSection title="CMS" />);
    fireEvent.click(screen.getByLabelText('Previous slide'));
    // Last default feature is "Advanced Analytics"
    expect(screen.getByText('Advanced Analytics')).toBeTruthy();
  });

  it('jumps to a specific slide via indicator click', () => {
    render(<CMSCarouselSection title="CMS" />);
    const indicators = screen.getAllByRole('button', { name: /Go to slide / });
    fireEvent.click(indicators[2]); // index 2 → "Real-time Collaboration"
    expect(screen.getByText('Real-time Collaboration')).toBeTruthy();
  });

  it('auto-advances after 5 seconds while autoplay is enabled', () => {
    render(<CMSCarouselSection title="CMS" />);
    expect(screen.getByText('Content Management')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText('Multi-channel Publishing')).toBeTruthy();
  });

  it('renders custom feature data when features prop is supplied', () => {
    const features = [
      { id: 'a', title: 'A title', description: 'A desc', image: 'a.jpg' },
      { id: 'b', title: 'B title', description: 'B desc', image: 'b.jpg' },
      { id: 'c', title: 'C title', description: 'C desc', image: 'c.jpg' },
      { id: 'd', title: 'D title', description: 'D desc', image: 'd.jpg' },
    ];
    render(<CMSCarouselSection title="X" features={features} />);
    expect(screen.getByText('A title')).toBeTruthy();
    expect(screen.getByText('A desc')).toBeTruthy();
  });

  it('renders the Canvas placeholder for the 3D laptop', () => {
    render(<CMSCarouselSection title="CMS" />);
    // The 3D laptop canvas should be present (mocked as data-testid="three-canvas")
    const canvases = screen.getAllByTestId('three-canvas');
    expect(canvases.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// HeroVisual
// ---------------------------------------------------------------------------

describe('HeroVisual', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a browser-chrome label of yourapp.com', () => {
    render(<HeroVisual />);
    expect(screen.getByText('yourapp.com')).toBeTruthy();
  });

  it('renders the app.tsx label in the code snippet', () => {
    render(<HeroVisual />);
    // The code panel header says "app.tsx"
    expect(screen.getByText(/app\.tsx/)).toBeTruthy();
  });

  it('attaches a mousemove listener to the window for parallax', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(<HeroVisual />);
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events.filter((e) => e === 'mousemove').length).toBeGreaterThan(0);
    addSpy.mockRestore();
  });

  it('renders the notification block after enough time passes', () => {
    render(<HeroVisual />);
    // The looping notifications start with the first ("Deployed to production")
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(screen.getByText('Deployed to production')).toBeTruthy();
  });

  it('progresses TypedCode lines as the typing timer fires', () => {
    const { container } = render(<HeroVisual />);
    // Initially no typed text spans are visible (opacity 0). After the
    // initial 1500ms delay + several 400ms intervals, the const keyword
    // line should render.
    act(() => {
      vi.advanceTimersByTime(1500 + 400 * 3);
    });
    expect(container.textContent).toContain('const');
  });
});

// ---------------------------------------------------------------------------
// InteractiveFeatureCard
// ---------------------------------------------------------------------------

describe('InteractiveFeatureCard', () => {
  it('renders the title as an h3', () => {
    render(
      <InteractiveFeatureCard
        icon="🌐"
        title="Global Reach"
        description="Worldwide network"
        type="globe"
      />,
    );
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading.textContent).toBe('Global Reach');
  });

  it('renders the description', () => {
    render(
      <InteractiveFeatureCard
        icon="🎯"
        title="Target"
        description="Pinpoint accuracy"
        type="target"
      />,
    );
    expect(screen.getByText('Pinpoint accuracy')).toBeTruthy();
  });

  it('renders the icon string in the card', () => {
    render(
      <InteractiveFeatureCard
        icon="⚡"
        title="Lightning"
        description="Fast as bolts"
        type="lightning"
      />,
    );
    expect(screen.getByText('⚡')).toBeTruthy();
  });

  it('renders a 3D Canvas for any supported type', () => {
    render(
      <InteractiveFeatureCard
        icon="x"
        title="t"
        description="d"
        type="globe"
      />,
    );
    expect(screen.getByTestId('three-canvas')).toBeTruthy();
  });

  it('renders without spotlight when not hovered', () => {
    const { container } = render(
      <InteractiveFeatureCard
        icon="x"
        title="t"
        description="d"
        type="globe"
      />,
    );
    // The radial spotlight is only rendered when isHovered === true.
    // Initially no such div should exist. We check by searching for the
    // specific inline-style snippet.
    const html = container.innerHTML;
    expect(html.includes('rgba(59, 130, 246, 0.3) 0%')).toBe(false);
  });

  it('handles mouse enter / leave without throwing', () => {
    const { container } = render(
      <InteractiveFeatureCard
        icon="x"
        title="t"
        description="d"
        type="target"
      />,
    );
    const card = container.firstChild as HTMLElement;
    expect(() => {
      fireEvent.mouseEnter(card);
      fireEvent.mouseLeave(card);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// SelfDestruct
// ---------------------------------------------------------------------------

describe('SelfDestruct', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders nothing while in idle state', () => {
    const { container } = render(<SelfDestruct />);
    expect(container.firstChild).toBeNull();
  });

  it('attaches a keydown listener to the window', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    render(<SelfDestruct />);
    const events = addSpy.mock.calls.map((c) => c[0]);
    expect(events.includes('keydown')).toBe(true);
    addSpy.mockRestore();
  });

  it('removes the keydown listener on unmount', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<SelfDestruct />);
    unmount();
    const events = removeSpy.mock.calls.map((c) => c[0]);
    expect(events.includes('keydown')).toBe(true);
    removeSpy.mockRestore();
  });

  it('does not activate when a non-konami key is pressed', () => {
    const { container } = render(<SelfDestruct />);
    fireEvent.keyDown(window, { code: 'KeyZ' });
    // Still nothing rendered
    expect(container.firstChild).toBeNull();
  });

  it('activates the countdown when the konami sequence is entered', () => {
    render(<SelfDestruct />);
    const sequence = [
      'ArrowUp',
      'ArrowUp',
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'KeyB',
      'KeyA',
    ];
    for (const code of sequence) {
      fireEvent.keyDown(window, { code });
    }
    // After konami, the overlay's warning text should be in the DOM
    expect(
      screen.getByText(/WARNING: SELF-DESTRUCT SEQUENCE INITIATED/),
    ).toBeTruthy();
  });

  it('resets the konami progress when a wrong key is hit mid-sequence', () => {
    const { container } = render(<SelfDestruct />);
    // Start the sequence but then break it
    fireEvent.keyDown(window, { code: 'ArrowUp' });
    fireEvent.keyDown(window, { code: 'ArrowUp' });
    fireEvent.keyDown(window, { code: 'KeyZ' }); // wrong → reset
    // Finish original sequence — should NOT activate because state was reset
    const rest = [
      'ArrowDown',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'ArrowLeft',
      'ArrowRight',
      'KeyB',
      'KeyA',
    ];
    for (const code of rest) {
      fireEvent.keyDown(window, { code });
    }
    expect(container.firstChild).toBeNull();
  });
});
