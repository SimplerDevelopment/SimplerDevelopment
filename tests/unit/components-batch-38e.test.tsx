// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock framer-motion so we don't pull in IntersectionObserver / animation runtime.
// Each motion.<tag> returns a plain element that forwards children + className.
vi.mock('framer-motion', () => {
  const passthrough = (tag: string) =>
    function MotionMock({ children, className, style }: any) {
      return React.createElement(tag, { className, style, 'data-motion': tag }, children);
    };
  const motion: any = new Proxy(
    {},
    {
      get: (_target, prop: string) => passthrough(prop),
    },
  );
  return {
    motion,
    useScroll: () => ({ scrollYProgress: { get: () => 0, on: () => () => {} } }),
    useTransform: () => '0%',
  };
});

// next/link is fine to use directly but mock it to avoid app-router context
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

import { PetersFooterCTA } from '@/components/peters-outdoor/PetersFooterCTA';
import { FadeIn } from '@/components/animations/FadeIn';
import { SlideIn } from '@/components/animations/SlideIn';
import NoteActionButtons from '@/components/brain/NoteActionButtons';

describe('components-batch-38e', () => {
  // -------------------------------------------------------------------------
  // PetersFooterCTA — pure presentation
  // -------------------------------------------------------------------------
  describe('PetersFooterCTA', () => {
    it('renders the headline and CTA copy', () => {
      render(<PetersFooterCTA />);
      expect(screen.getByText(/Ready for Your Next Adventure/i)).toBeInTheDocument();
      expect(screen.getByText(/Book a guided kayak eco-tour/i)).toBeInTheDocument();
    });

    it('renders a CTA link pointing at /p/booking', () => {
      render(<PetersFooterCTA />);
      const link = screen.getByRole('link', { name: /Book Your Tour Today/i });
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', '/p/booking');
    });

    it('uses the Peters brand background color class', () => {
      const { container } = render(<PetersFooterCTA />);
      const section = container.querySelector('section');
      expect(section).not.toBeNull();
      expect(section?.className).toMatch(/bg-\[#3D5A3D\]/);
    });
  });

  // -------------------------------------------------------------------------
  // FadeIn — wraps children, forwards className
  // -------------------------------------------------------------------------
  describe('FadeIn', () => {
    it('renders children', () => {
      render(
        <FadeIn>
          <p>fade-in-child</p>
        </FadeIn>,
      );
      expect(screen.getByText('fade-in-child')).toBeInTheDocument();
    });

    it('forwards className to the motion wrapper', () => {
      const { container } = render(
        <FadeIn className="my-custom-fade">
          <span>x</span>
        </FadeIn>,
      );
      // mocked motion.div has data-motion="div"
      const wrapper = container.querySelector('[data-motion="div"]');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.className).toContain('my-custom-fade');
    });

    it('uses an empty className by default', () => {
      const { container } = render(
        <FadeIn>
          <span>y</span>
        </FadeIn>,
      );
      const wrapper = container.querySelector('[data-motion="div"]');
      expect(wrapper).not.toBeNull();
      expect(wrapper?.className).toBe('');
    });
  });

  // -------------------------------------------------------------------------
  // SlideIn — direction-based initial position + className
  // -------------------------------------------------------------------------
  describe('SlideIn', () => {
    it('renders children with default props', () => {
      render(
        <SlideIn>
          <p>slide-default</p>
        </SlideIn>,
      );
      expect(screen.getByText('slide-default')).toBeInTheDocument();
    });

    it.each(['left', 'right', 'up', 'down'] as const)(
      'renders without throwing for direction=%s',
      (direction) => {
        const { container } = render(
          <SlideIn direction={direction} className={`slide-${direction}`}>
            <span>{direction}</span>
          </SlideIn>,
        );
        const wrapper = container.querySelector('[data-motion="div"]');
        expect(wrapper).not.toBeNull();
        expect(wrapper?.className).toContain(`slide-${direction}`);
        expect(screen.getByText(direction)).toBeInTheDocument();
      },
    );

    it('honors custom distance / delay / duration without errors', () => {
      const { container } = render(
        <SlideIn direction="left" distance={120} delay={0.3} duration={1.2}>
          <span>tuned</span>
        </SlideIn>,
      );
      expect(container.querySelector('[data-motion="div"]')).not.toBeNull();
      expect(screen.getByText('tuned')).toBeInTheDocument();
    });
  });

  // -------------------------------------------------------------------------
  // NoteActionButtons — conditional rendering + click handlers
  // -------------------------------------------------------------------------
  describe('NoteActionButtons', () => {
    const baseNote = {
      id: 'note-1',
      title: 'hello',
      body: 'world',
      pinned: false,
    } as any;

    it('renders pin + delete + zen-link by default', () => {
      render(
        <NoteActionButtons
          note={baseNote}
          onPatch={() => {}}
          onDelete={() => {}}
        />,
      );
      // Pin (title="Pin" because not pinned)
      expect(screen.getByTitle('Pin')).toBeInTheDocument();
      expect(screen.getByTitle('Delete note')).toBeInTheDocument();
      // Zen link present
      const zen = screen.getByTitle(/Zen mode/i);
      expect(zen).toBeInTheDocument();
      expect(zen).toHaveAttribute('href', '/portal/brain/knowledge/note-1');
    });

    it('hides the zen link when showZenLink=false', () => {
      render(
        <NoteActionButtons
          note={baseNote}
          onPatch={() => {}}
          onDelete={() => {}}
          showZenLink={false}
        />,
      );
      expect(screen.queryByTitle(/Zen mode/i)).toBeNull();
    });

    it('flips pinned via onPatch when the pin button is clicked', () => {
      const onPatch = vi.fn();
      render(
        <NoteActionButtons
          note={baseNote}
          onPatch={onPatch}
          onDelete={() => {}}
        />,
      );
      fireEvent.click(screen.getByTitle('Pin'));
      expect(onPatch).toHaveBeenCalledWith({ pinned: true });
    });

    it('shows "Unpin" title and flips pinned to false for a pinned note', () => {
      const onPatch = vi.fn();
      render(
        <NoteActionButtons
          note={{ ...baseNote, pinned: true }}
          onPatch={onPatch}
          onDelete={() => {}}
        />,
      );
      const btn = screen.getByTitle('Unpin');
      expect(btn).toBeInTheDocument();
      // Pinned variant uses amber styling
      expect(btn.className).toMatch(/amber/);
      fireEvent.click(btn);
      expect(onPatch).toHaveBeenCalledWith({ pinned: false });
    });

    it('invokes onDelete when the delete button is clicked', () => {
      const onDelete = vi.fn();
      render(
        <NoteActionButtons
          note={baseNote}
          onPatch={() => {}}
          onDelete={onDelete}
        />,
      );
      fireEvent.click(screen.getByTitle('Delete note'));
      expect(onDelete).toHaveBeenCalledTimes(1);
    });
  });
});
