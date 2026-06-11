// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

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
  // FadeIn — wraps children in a plain div, forwards className
  // Pure CSS component — no framer-motion.
  // Default (non-immediate): <div className="sd-reveal {className}">
  // immediate=true:           <div className={className}>
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

    it('forwards className to the wrapper div', () => {
      const { container } = render(
        <FadeIn className="my-custom-fade">
          <span>x</span>
        </FadeIn>,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.tagName).toBe('DIV');
      expect(wrapper.className).toContain('my-custom-fade');
    });

    it('adds sd-reveal class by default (non-immediate mode)', () => {
      const { container } = render(
        <FadeIn>
          <span>y</span>
        </FadeIn>,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.className).toContain('sd-reveal');
    });

    it('omits sd-reveal and uses only className when immediate=true', () => {
      const { container } = render(
        <FadeIn immediate className="above-fold">
          <span>z</span>
        </FadeIn>,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toBe('above-fold');
      expect(wrapper.className).not.toContain('sd-reveal');
    });

    it('sets animationDelay style when delay is provided', () => {
      const { container } = render(
        <FadeIn delay={0.5}>
          <span>delayed</span>
        </FadeIn>,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.animationDelay).toBe('0.5s');
    });

    it('sets animationDuration style when duration differs from default 0.6', () => {
      const { container } = render(
        <FadeIn duration={1.2}>
          <span>long</span>
        </FadeIn>,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.animationDuration).toBe('1.2s');
    });
  });

  // -------------------------------------------------------------------------
  // SlideIn — pure CSS, plain div with sd-slide / sd-slide--x|y classes
  // left|right → sd-slide--x ; up|down → sd-slide--y
  // CSS custom property --sd-slide-translate carries the travel distance.
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

    it('applies sd-slide base class', () => {
      const { container } = render(
        <SlideIn>
          <span>base</span>
        </SlideIn>,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.className).toContain('sd-slide');
    });

    it.each(['left', 'right', 'up', 'down'] as const)(
      'renders without throwing and forwards className for direction=%s',
      (direction) => {
        const { container } = render(
          <SlideIn direction={direction} className={`slide-${direction}`}>
            <span>{direction}</span>
          </SlideIn>,
        );
        const wrapper = container.firstChild as HTMLElement;
        expect(wrapper).not.toBeNull();
        expect(wrapper.tagName).toBe('DIV');
        expect(wrapper.className).toContain(`slide-${direction}`);
        expect(screen.getByText(direction)).toBeInTheDocument();
      },
    );

    it('applies sd-slide--x class for left and right directions', () => {
      const { container: cl } = render(<SlideIn direction="left"><span>L</span></SlideIn>);
      expect((cl.firstChild as HTMLElement).className).toContain('sd-slide--x');
      const { container: cr } = render(<SlideIn direction="right"><span>R</span></SlideIn>);
      expect((cr.firstChild as HTMLElement).className).toContain('sd-slide--x');
    });

    it('applies sd-slide--y class for up and down directions', () => {
      const { container: cu } = render(<SlideIn direction="up"><span>U</span></SlideIn>);
      expect((cu.firstChild as HTMLElement).className).toContain('sd-slide--y');
      const { container: cd } = render(<SlideIn direction="down"><span>D</span></SlideIn>);
      expect((cd.firstChild as HTMLElement).className).toContain('sd-slide--y');
    });

    it('honors custom distance / delay / duration without errors', () => {
      const { container } = render(
        <SlideIn direction="left" distance={120} delay={0.3} duration={1.2}>
          <span>tuned</span>
        </SlideIn>,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.style.animationDelay).toBe('0.3s');
      expect(wrapper.style.animationDuration).toBe('1.2s');
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
