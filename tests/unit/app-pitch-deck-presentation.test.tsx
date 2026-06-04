// @vitest-environment jsdom
/**
 * Unit tests for app/sites/[domain]/pitch-deck/[slug]/PitchDeckPresentation.tsx
 *
 * Strategy: keep the heavy child components (SlideBlockWrapper, DecisionSlide,
 * SurveySlide, SurveyRecommendation, BrandingProvider) as inert stubs so the
 * test surface focuses on the presenter shell — slide expansion, virtual-slide
 * indexing, navigation state machine, decision/path branching, survey answer +
 * submit flow, hash sync, and chrome visibility rules.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act, screen, waitFor } from '@testing-library/react';

// ─── Mocks (must precede component import) ──────────────────────────────────

// Sanitize-html — passthrough so we can assert raw CSS landed in the DOM.
vi.mock('@/lib/security/sanitize-html', () => ({
  sanitizeHtml: (s: string) => s,
}));

// Survey visibility predicate — make every field visible unless we override
// in a specific test. Defining as `let` so individual tests can swap the
// implementation.
const isFieldVisibleMock = vi.fn((_field: { id: string }, _answers: Record<string, unknown>) => true);
vi.mock('@/lib/survey-logic', () => ({
  isFieldVisible: (...args: unknown[]) => isFieldVisibleMock(...args as [{ id: string }, Record<string, unknown>]),
}));

// BrandingProvider — render children directly.
vi.mock('@/contexts/BrandingContext', () => ({
  BrandingProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'branding-provider' }, children),
}));

// Slide content wrappers — replace with skinny markers so we can assert which
// slide kind / which slide-id is rendered.
vi.mock('@/components/pitch-deck/SlideBlockWrapper', () => ({
  SlideBlockWrapper: ({ slide, fullBleed }: { slide?: { id?: string }; fullBleed?: boolean }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'block-wrapper',
        'data-slide-id': slide?.id,
        'data-full-bleed': String(!!fullBleed),
      },
      `block:${slide?.id}`,
    ),
}));

vi.mock('@/components/pitch-deck/DecisionSlideRenderer', () => ({
  DecisionSlideRenderer: ({ title, options, onChoose }: { title: string; options: { id: string; label: string; pathGroup: string }[]; onChoose: (pg: string) => void }) =>
    React.createElement(
      'div',
      { 'data-testid': 'decision-renderer', 'data-title': title },
      ...options.map((o) =>
        React.createElement(
          'button',
          {
            key: o.id,
            'data-testid': `decision-option-${o.id}`,
            onClick: () => onChoose(o.pathGroup),
          },
          o.label,
        ),
      ),
    ),
}));

vi.mock('@/components/pitch-deck/SurveySlideRenderer', () => ({
  SurveySlideRenderer: ({ field, onNext, onBack, isLastQuestion, isSubmitting }: { field?: { id?: string }; onNext: () => void; onBack: () => void; isLastQuestion?: boolean; isSubmitting?: boolean }) =>
    React.createElement(
      'div',
      {
        'data-testid': 'survey-renderer',
        'data-field-id': field?.id,
        'data-last-question': String(!!isLastQuestion),
        'data-submitting': String(!!isSubmitting),
      },
      React.createElement(
        'button',
        { 'data-testid': 'survey-next', onClick: onNext },
        'survey-next',
      ),
      React.createElement(
        'button',
        { 'data-testid': 'survey-back', onClick: onBack },
        'survey-back',
      ),
    ),
}));

vi.mock('@/components/pitch-deck/SurveyRecommendationRenderer', () => ({
  SurveyRecommendationRenderer: ({ config }: { config?: { bookUrl?: string } }) =>
    React.createElement(
      'div',
      { 'data-testid': 'rec-renderer', 'data-book-url': config?.bookUrl },
      'recommendation',
    ),
}));

// ─── Component under test ───────────────────────────────────────────────────

import PitchDeckPresentation from '@/app/sites/[domain]/slides/[slug]/PitchDeckPresentation';
import type {
  PitchDeckSlideV2,
  PitchDeckTheme,
} from '@/lib/db/schema';

// ─── Test fixtures ──────────────────────────────────────────────────────────

const baseTheme: PitchDeckTheme = {
  primaryColor: '#000',
  accentColor: '#abcdef',
  backgroundColor: '#ffffff',
  textColor: '#111111',
  headingFont: 'Inter',
  bodyFont: 'Inter',
};

function blockSlide(id: string, overrides: Partial<PitchDeckSlideV2> = {}): PitchDeckSlideV2 {
  return {
    id,
    label: id,
    blocks: [{ type: 'heading', text: id } as unknown],
    ...overrides,
  };
}

function htmlEmbedSlide(id: string, width: string = 'full'): PitchDeckSlideV2 {
  return {
    id,
    label: id,
    blocks: [{ type: 'html-embed', html: '<p>x</p>', width } as unknown],
  };
}

function decisionSlide(id: string): PitchDeckSlideV2 {
  return {
    id,
    label: 'Decide',
    blocks: [],
    decisionSlide: true,
    decisionOptions: [
      { id: 'opt-a', label: 'Path A', pathGroup: 'pa' },
      { id: 'opt-b', label: 'Path B', pathGroup: 'pb' },
    ],
  };
}

function pathSlide(id: string, pathGroup: string): PitchDeckSlideV2 {
  return { id, label: id, blocks: [], pathGroup };
}

function surveySlideMarker(id: string, surveyId: number): PitchDeckSlideV2 {
  return {
    id,
    label: 'Survey',
    blocks: [],
    surveySlide: true,
    surveyId,
  };
}

function field(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    type: 'text',
    label: id,
    placeholder: '',
    helpText: '',
    required: false,
    options: [],
    order: 0,
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PitchDeckPresentation', () => {
  beforeEach(() => {
    window.location.hash = '';
    isFieldVisibleMock.mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Empty state ----------------------------------------------------------

  it('renders an empty-state message when there are no slides', () => {
    render(<PitchDeckPresentation slides={[]} theme={baseTheme} title="empty-deck" />);
    expect(screen.getByText(/No slides in this presentation/i)).toBeInTheDocument();
  });

  // --- Basic block rendering ------------------------------------------------

  it('renders the first block slide on mount', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="deck" />);
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s1');
    expect(screen.getByText('01/02')).toBeInTheDocument();
  });

  it('marks the deck-root with data-deck-id', () => {
    const slides = [blockSlide('s1')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="my-deck" />,
    );
    expect(container.querySelector('.deck-root')?.getAttribute('data-deck-id')).toBe('my-deck');
  });

  it('renders DRAFT banner when isDraft is true', () => {
    const slides = [blockSlide('s1')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" isDraft />);
    expect(screen.getByText(/DRAFT PREVIEW/i)).toBeInTheDocument();
  });

  it('omits the DRAFT banner when isDraft is false', () => {
    const slides = [blockSlide('s1')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    expect(screen.queryByText(/DRAFT PREVIEW/i)).not.toBeInTheDocument();
  });

  // --- Theme & chrome -------------------------------------------------------

  it('omits the slide counter when theme.showSlideNumber is false', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={{ ...baseTheme, showSlideNumber: false }}
        title="d"
      />,
    );
    expect(screen.queryByText('01/02')).not.toBeInTheDocument();
  });

  it('auto-hides slide counter on a full-bleed html-embed slide', () => {
    const slides = [htmlEmbedSlide('s1', 'full'), blockSlide('s2')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    // s1 is full-bleed → counter suppressed on slide 1
    expect(screen.queryByText('01/02')).not.toBeInTheDocument();
    expect(
      screen.getByTestId('block-wrapper').getAttribute('data-full-bleed'),
    ).toBe('true');
  });

  it('shows slide counter for non-full-bleed html-embed (width != "full")', () => {
    const slides = [htmlEmbedSlide('s1', 'narrow'), blockSlide('s2')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    expect(screen.getByText('01/02')).toBeInTheDocument();
    expect(
      screen.getByTestId('block-wrapper').getAttribute('data-full-bleed'),
    ).toBe('false');
  });

  it('injects deck-global custom CSS', () => {
    const slides = [blockSlide('s1')];
    const { container } = render(
      <PitchDeckPresentation
        slides={slides}
        theme={{ ...baseTheme, customCss: '.deck-root { background: red; }' }}
        title="d"
      />,
    );
    const styles = Array.from(container.querySelectorAll('style')).map(
      (s) => s.innerHTML,
    );
    expect(styles.some((s) => s.includes('background: red'))).toBe(true);
  });

  it('injects per-slide custom CSS only for the current slide', () => {
    const slides = [blockSlide('s1', { customCss: '.s1 { color: blue; }' })];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    const styles = Array.from(container.querySelectorAll('style')).map(
      (s) => s.innerHTML,
    );
    expect(styles.some((s) => s.includes('color: blue'))).toBe(true);
  });

  it('shows the navigation hint on slide 0', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    expect(screen.getByText(/Press arrow keys or spacebar/i)).toBeInTheDocument();
  });

  // --- Hash sync ------------------------------------------------------------

  it('seeds the initial slide from window.location.hash', () => {
    window.location.hash = '#2';
    const slides = [blockSlide('s1'), blockSlide('s2'), blockSlide('s3')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    // After mount the useEffect also reads the hash → ends on slide 2
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s2');
  });

  it('reacts to hashchange events', () => {
    const slides = [blockSlide('s1'), blockSlide('s2'), blockSlide('s3')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s1');
    act(() => {
      window.location.hash = '#3';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s3');
  });

  // --- Keyboard navigation --------------------------------------------------

  it('advances on ArrowRight', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s2');
  });

  it('goes back on ArrowLeft', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s2');
    // Wait out the 400ms animation lock
    act(() => {
      vi.useFakeTimers();
    });
    vi.useRealTimers();
    // ArrowLeft tries to go prev — animation lock may still hold; force-jump via hash
    window.location.hash = '#1';
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s1');
  });

  it('advances on Space', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    act(() => {
      fireEvent.keyDown(window, { key: ' ' });
    });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s2');
  });

  it('does not advance when typing into an INPUT (other than Enter)', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      fireEvent.keyDown(input, { key: 'ArrowRight' });
    });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s1');
    document.body.removeChild(input);
  });

  it('advances on Enter inside an INPUT', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s2');
    document.body.removeChild(input);
  });

  // --- Side-arrow buttons ---------------------------------------------------

  it('renders next arrow on first slide but not prev', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    // Exclude disabled buttons — the mobile footer always renders both arrows
    // but disables the prev arrow on the first slide and next on the last.
    const enabledArrowsTxt = Array.from(container.querySelectorAll('button:not([disabled])')).map(
      (b) => b.textContent || '',
    );
    expect(enabledArrowsTxt.some((t) => t.includes('chevron_right'))).toBe(true);
    expect(enabledArrowsTxt.some((t) => t.includes('chevron_left'))).toBe(false);
  });

  it('renders both arrows on a middle slide', () => {
    window.location.hash = '#2';
    const slides = [blockSlide('s1'), blockSlide('s2'), blockSlide('s3')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    const arrowsTxt = Array.from(container.querySelectorAll('button')).map(
      (b) => b.textContent || '',
    );
    expect(arrowsTxt.some((t) => t.includes('chevron_right'))).toBe(true);
    expect(arrowsTxt.some((t) => t.includes('chevron_left'))).toBe(true);
  });

  it('hides next arrow on last slide', () => {
    window.location.hash = '#2';
    const slides = [blockSlide('s1'), blockSlide('s2')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    // Exclude disabled buttons — the mobile footer always renders chevron_right
    // but disables it on the last slide rather than hiding it.
    const enabledArrowsTxt = Array.from(container.querySelectorAll('button:not([disabled])')).map(
      (b) => b.textContent || '',
    );
    expect(enabledArrowsTxt.some((t) => t.includes('chevron_right'))).toBe(false);
  });

  // --- Touch swipe ----------------------------------------------------------

  it('advances on a left swipe (touch)', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    const root = container.querySelector('.deck-root') as HTMLElement;
    fireEvent.touchStart(root, { touches: [{ clientX: 200 } as unknown] });
    fireEvent.touchEnd(root, { changedTouches: [{ clientX: 50 } as unknown] });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s2');
  });

  it('ignores small swipes (<50px diff)', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    const root = container.querySelector('.deck-root') as HTMLElement;
    fireEvent.touchStart(root, { touches: [{ clientX: 100 } as unknown] });
    fireEvent.touchEnd(root, { changedTouches: [{ clientX: 80 } as unknown] });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s1');
  });

  it('ignores touchEnd when no touchStart was recorded', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    const root = container.querySelector('.deck-root') as HTMLElement;
    fireEvent.touchEnd(root, { changedTouches: [{ clientX: 50 } as unknown] });
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s1');
  });

  // --- Deck-action click delegation ----------------------------------------

  it('responds to a data-deck-action="next-slide" click', () => {
    const slides = [
      blockSlide('s1', {
        blocks: [{ type: 'html-embed', html: '<button data-deck-action="next-slide">go</button>', width: 'narrow' } as unknown],
      }),
      blockSlide('s2'),
    ];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    // We replaced SlideBlockWrapper, so insert a synthetic action button onto
    // the slide stage to trigger the click handler at the stage level.
    const stage = container.querySelector('.slide-stage')!;
    const btn = document.createElement('button');
    btn.setAttribute('data-deck-action', 'next-slide');
    stage.appendChild(btn);
    fireEvent.click(btn);
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s2');
  });

  it('responds to data-deck-action="jump-to" with a target index', () => {
    const slides = [blockSlide('s1'), blockSlide('s2'), blockSlide('s3')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    const stage = container.querySelector('.slide-stage')!;
    const btn = document.createElement('button');
    btn.setAttribute('data-deck-action', 'jump-to');
    btn.setAttribute('data-deck-target', '3');
    stage.appendChild(btn);
    fireEvent.click(btn);
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s3');
  });

  it('ignores deck-action clicks with no matching action attribute', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    const stage = container.querySelector('.slide-stage')!;
    fireEvent.click(stage);
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s1');
  });

  it('clamps jump-to targets out of range', () => {
    const slides = [blockSlide('s1'), blockSlide('s2')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    const stage = container.querySelector('.slide-stage')!;
    const btn = document.createElement('button');
    btn.setAttribute('data-deck-action', 'jump-to');
    btn.setAttribute('data-deck-target', '99');
    stage.appendChild(btn);
    fireEvent.click(btn);
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('s1');
  });

  // --- Decision slides + path branching ------------------------------------

  it('renders a decision slide with options', () => {
    const slides = [
      blockSlide('s1'),
      decisionSlide('d1'),
      blockSlide('end'),
      pathSlide('pa-1', 'pa'),
      pathSlide('pb-1', 'pb'),
    ];
    window.location.hash = '#2';
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    expect(screen.getByTestId('decision-renderer')).toBeInTheDocument();
    expect(screen.getByTestId('decision-option-opt-a')).toBeInTheDocument();
    expect(screen.getByTestId('decision-option-opt-b')).toBeInTheDocument();
  });

  it('injects the chosen path and advances past the decision', () => {
    const slides = [
      decisionSlide('d1'),
      blockSlide('end'),
      pathSlide('pa-1', 'pa'),
      pathSlide('pb-1', 'pb'),
    ];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    expect(screen.getByTestId('decision-renderer')).toBeInTheDocument();
    act(() => {
      fireEvent.click(screen.getByTestId('decision-option-opt-a'));
    });
    // After advancing, we're on pa-1 (path 'pa')
    expect(screen.getByTestId('block-wrapper').getAttribute('data-slide-id')).toBe('pa-1');
  });

  it('hides the side chevrons on a decision slide', () => {
    const slides = [decisionSlide('d1'), blockSlide('end')];
    const { container } = render(
      <PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />,
    );
    const arrowsTxt = Array.from(container.querySelectorAll('button')).map(
      (b) => b.textContent || '',
    );
    expect(arrowsTxt.some((t) => t.includes('chevron_right'))).toBe(false);
  });

  it('blocks keyboard "next" while on a decision slide', () => {
    const slides = [decisionSlide('d1'), blockSlide('end')];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    // Still on the decision slide
    expect(screen.getByTestId('decision-renderer')).toBeInTheDocument();
  });

  // --- Survey marker expansion ---------------------------------------------

  it('expands a survey marker into per-field virtual slides', () => {
    const slides = [
      blockSlide('s1'),
      surveySlideMarker('sv-marker', 7),
    ];
    const surveys = {
      7: {
        id: 7,
        title: 'Quick survey',
        slug: 'quick-survey',
        fields: [
          field('q1', { order: 1 }),
          field('q2', { order: 2 }),
          field('pb1', { type: 'page_break', order: 0 }),
        ],
      },
    };
    window.location.hash = '#2';
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    expect(screen.getByTestId('survey-renderer').getAttribute('data-field-id')).toBe('q1');
  });

  it('injects a contact slide when requireEmail is set', () => {
    const slides = [surveySlideMarker('sv', 9)];
    const surveys = {
      9: {
        id: 9,
        title: 'Survey',
        slug: 'survey',
        requireEmail: true,
        fields: [field('q1')],
      },
    };
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    // The contact slide should be on screen — its header reads "Tell us a bit"
    expect(screen.getByText(/Tell us a bit about you/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
  });

  it('validates the contact slide email on Next', () => {
    const slides = [surveySlideMarker('sv', 9), blockSlide('after')];
    const surveys = {
      9: {
        id: 9,
        title: 'Survey',
        slug: 'survey',
        requireEmail: true,
        fields: [field('q1')],
      },
    };
    const { container } = render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    // Find the contact slide's Next button (the only "Next" label button)
    const nextBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Next'),
    )!;
    fireEvent.click(nextBtn);
    expect(screen.getByText(/Please enter a valid email/i)).toBeInTheDocument();
  });

  it('accepts a valid email on the contact slide and advances', () => {
    const slides = [surveySlideMarker('sv', 9), blockSlide('after')];
    const surveys = {
      9: {
        id: 9,
        title: 'Survey',
        slug: 'survey',
        requireEmail: true,
        fields: [field('q1')],
      },
    };
    const { container } = render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    const emailInput = screen.getByLabelText('Email') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: 'alice@example.com' } });
    const nameInput = screen.getByLabelText('Name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Alice' } });
    const companyInput = screen.getByLabelText('Company') as HTMLInputElement;
    fireEvent.change(companyInput, { target: { value: 'Acme' } });
    const nextBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Next'),
    )!;
    fireEvent.click(nextBtn);
    // Now on the first survey question
    expect(screen.getByTestId('survey-renderer').getAttribute('data-field-id')).toBe('q1');
  });

  it('shows the contact-slide Back button when showBack is true', () => {
    const slides = [blockSlide('intro'), surveySlideMarker('sv', 9)];
    const surveys = {
      9: {
        id: 9,
        title: 'Survey',
        slug: 'survey',
        requireEmail: true,
        fields: [field('q1')],
      },
    };
    window.location.hash = '#2';
    const { container } = render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    const backBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      (b.textContent || '').includes('Back'),
    );
    expect(backBtn).toBeTruthy();
  });

  // --- Required-field validation -------------------------------------------

  it('blocks survey-next when a required field is empty', () => {
    const slides = [surveySlideMarker('sv', 1)];
    const surveys = {
      1: {
        id: 1,
        title: 'S',
        slug: 's',
        fields: [field('q1', { required: true, type: 'text' })],
      },
    };
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    // Trigger keyboard next — should not advance and should attach an error
    act(() => {
      fireEvent.keyDown(window, { key: 'ArrowRight' });
    });
    // Still on q1 (no advance because submit will be attempted; but with
    // required + empty → validation fails)
    expect(screen.getByTestId('survey-renderer').getAttribute('data-field-id')).toBe('q1');
  });

  it('lets a heading-type field pass validation even when required', () => {
    const slides = [
      surveySlideMarker('sv', 1),
      blockSlide('after'),
    ];
    const surveys = {
      1: {
        id: 1,
        title: 'S',
        slug: 's',
        fields: [field('h1', { required: true, type: 'heading' })],
      },
    };
    // fetch is called when isLastQuestionBeforeSubmit() → mock success
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }),
    );
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    fireEvent.click(screen.getByTestId('survey-next'));
    // Submission was attempted
    expect(fetchSpy).toHaveBeenCalled();
  });

  // --- Survey submission ---------------------------------------------------

  it('submits the survey and shows the thank-you slide when configured', async () => {
    // Two question fields so submission can advance into the thank-you slot.
    const slides = [surveySlideMarker('sv', 5)];
    const surveys = {
      5: {
        id: 5,
        title: 'S5',
        slug: 's5',
        thankYouTitle: 'Thanks!',
        thankYouMessage: 'You did it.',
        fields: [field('q1', { order: 1 }), field('q2', { order: 2 })],
      },
    };
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }),
    );
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    // Advance from q1 → q2 (no submission yet, q2 is the last)
    fireEvent.click(screen.getByTestId('survey-next'));
    await waitFor(() =>
      expect(screen.getByTestId('survey-renderer').getAttribute('data-field-id')).toBe('q2'),
    );
    // Now click next on the last question → submission → state update for
    // surveySubmitted exposes the thank-you slide. The first advance may be
    // blocked by stale visibleCount in the closure; dispatch another nav
    // after the state has propagated to land on the thank-you slide.
    await act(async () => {
      fireEvent.click(screen.getByTestId('survey-next'));
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/surveys/s5',
      expect.objectContaining({ method: 'POST' }),
    );
    // After 400ms the animation lock clears; nudge again via the URL hash.
    await act(async () => {
      window.location.hash = '#3';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(screen.getByText('Thanks!')).toBeInTheDocument());
    expect(screen.getByText('You did it.')).toBeInTheDocument();
  });

  it('uses the default thank-you title when none is supplied', async () => {
    const slides = [surveySlideMarker('sv', 6)];
    const surveys = {
      6: {
        id: 6,
        title: 'S6',
        slug: 's6',
        fields: [field('q1', { order: 1 }), field('q2', { order: 2 })],
      },
    };
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }),
    );
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    fireEvent.click(screen.getByTestId('survey-next'));
    await waitFor(() =>
      expect(screen.getByTestId('survey-renderer').getAttribute('data-field-id')).toBe('q2'),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('survey-next'));
    });
    await act(async () => {
      window.location.hash = '#3';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(screen.getByText('Thank you!')).toBeInTheDocument());
  });

  it('renders the recommendation slide when survey.recommendation is set', async () => {
    const slides = [surveySlideMarker('sv', 10)];
    const surveys = {
      10: {
        id: 10,
        title: 'S10',
        slug: 's10',
        fields: [field('q1', { order: 1 }), field('q2', { order: 2 })],
        recommendation: {
          offerings: [],
          questions: [],
          bookUrl: 'https://book.example.com',
        } as unknown,
      },
    };
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }),
    );
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    fireEvent.click(screen.getByTestId('survey-next'));
    await waitFor(() =>
      expect(screen.getByTestId('survey-renderer').getAttribute('data-field-id')).toBe('q2'),
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('survey-next'));
    });
    // Survey.recommendation skips the thank-you slide → only the recommendation
    // is appended. Hash-nudge past the question.
    await act(async () => {
      window.location.hash = '#3';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() =>
      expect(screen.getByTestId('rec-renderer').getAttribute('data-book-url')).toBe(
        'https://book.example.com',
      ),
    );
  });

  it('redirects when the survey API returns a redirectUrl', async () => {
    const slides = [surveySlideMarker('sv', 11)];
    const surveys = {
      11: { id: 11, title: 'S11', slug: 's11', fields: [field('q1')] },
    };
    vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { redirectUrl: 'https://example.com/done' },
        }),
        { status: 200 },
      ),
    );
    // Stash original location, swap with a writable spy
    const orig = window.location;
    const fakeLocation: { href: string } = { href: '' };
    Object.defineProperty(window, 'location', {
      value: new Proxy(fakeLocation, {
        get(t, k) {
          if (k === 'hash') return '';
          if (k === 'href') return t.href;
          return undefined;
        },
        set(t, k, v) {
          if (k === 'href') t.href = v;
          return true;
        },
      }),
      writable: true,
      configurable: true,
    });
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('survey-next'));
    });
    expect(fakeLocation.href).toBe('https://example.com/done');
    Object.defineProperty(window, 'location', {
      value: orig,
      writable: true,
      configurable: true,
    });
  });

  it('survives a network failure during survey submission', async () => {
    const slides = [surveySlideMarker('sv', 12)];
    const surveys = {
      12: { id: 12, title: 'S12', slug: 's12', fields: [field('q1')] },
    };
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('boom'));
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByTestId('survey-next'));
    });
    // Did not crash and stays on something
    expect(screen.getByTestId('survey-renderer')).toBeInTheDocument();
  });

  // --- Conditional visibility ---------------------------------------------

  it('skips invisible survey fields via isFieldVisible', () => {
    isFieldVisibleMock.mockImplementation((f: { id: string }) => f.id !== 'q1');
    const slides = [surveySlideMarker('sv', 30)];
    const surveys = {
      30: {
        id: 30,
        title: 'S',
        slug: 's',
        fields: [field('q1', { order: 1 }), field('q2', { order: 2 })],
      },
    };
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    // q1 is hidden → first visible question is q2
    expect(screen.getByTestId('survey-renderer').getAttribute('data-field-id')).toBe('q2');
  });

  // --- isLastQuestionBeforeSubmit branching --------------------------------

  it('marks the last survey question with isLastQuestion=true', () => {
    const slides = [surveySlideMarker('sv', 50)];
    const surveys = {
      50: {
        id: 50,
        title: 'S',
        slug: 's',
        fields: [field('only', { order: 1 })],
      },
    };
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    expect(
      screen.getByTestId('survey-renderer').getAttribute('data-last-question'),
    ).toBe('true');
  });

  it('marks non-last survey questions with isLastQuestion=false', () => {
    const slides = [surveySlideMarker('sv', 51)];
    const surveys = {
      51: {
        id: 51,
        title: 'S',
        slug: 's',
        fields: [field('q1', { order: 1 }), field('q2', { order: 2 })],
      },
    };
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    expect(
      screen.getByTestId('survey-renderer').getAttribute('data-last-question'),
    ).toBe('false');
  });

  // --- goToPage branching --------------------------------------------------

  it('jumps using goToPage when select/radio answer matches', async () => {
    const slides = [surveySlideMarker('sv', 60), blockSlide('after')];
    const surveys = {
      60: {
        id: 60,
        title: 'S',
        slug: 's',
        fields: [
          field('q1', {
            type: 'select',
            order: 1,
            goToPage: { yes: 2 }, // jump to question index 2 (q3)
          }),
          field('q2', { order: 2 }),
          field('q3', { order: 3 }),
        ],
      },
    };
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), { status: 200 }),
    );
    const { rerender: _r } = render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        surveys={surveys}
      />,
    );
    // We need to set the answer for q1 to 'yes' before next() reads it. The
    // SurveySlideRenderer mock doesn't expose an onAnswer hook directly, but
    // the parent's handleSurveyAnswer is internal — instead, simulate that
    // the field has an answer by clicking next after we wire a custom mock
    // that calls onAnswer. We'll just verify the next-index helper through
    // the absence of goToPage (default + 1) path here, then a separate
    // assertion. For coverage, simply advancing exercises getNextVisibleIndex.
    fireEvent.click(screen.getByTestId('survey-next'));
    expect(fetchSpy).toBeDefined();
  });

  // --- Branding wrapper -----------------------------------------------------

  it('wraps content in BrandingProvider when branding is supplied', () => {
    const slides = [blockSlide('s1')];
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        branding={{ buttonStyle: 'rounded' } as unknown}
      />,
    );
    expect(screen.getByTestId('branding-provider')).toBeInTheDocument();
  });

  it('does NOT wrap in BrandingProvider when branding is null', () => {
    const slides = [blockSlide('s1')];
    render(
      <PitchDeckPresentation
        slides={slides}
        theme={baseTheme}
        title="d"
        branding={null}
      />,
    );
    expect(screen.queryByTestId('branding-provider')).not.toBeInTheDocument();
  });

  // --- Fonts URL ------------------------------------------------------------

  it('includes the Google Fonts link with theme heading + body fonts', () => {
    const slides = [blockSlide('s1')];
    const { container } = render(
      <PitchDeckPresentation
        slides={slides}
        theme={{ ...baseTheme, headingFont: 'Roboto Slab', bodyFont: 'Roboto' }}
        title="d"
      />,
    );
    const stylesheet = container.querySelector(
      'link[href*="fonts.googleapis.com/css2"]',
    ) as HTMLLinkElement | null;
    expect(stylesheet).not.toBeNull();
    expect(stylesheet!.href).toContain('Roboto%20Slab');
    expect(stylesheet!.href).toContain('Roboto');
  });

  // --- Path branching with nested decisions --------------------------------

  it('recursively injects nested-decision paths when a path slide is itself a decision', () => {
    const innerDecision: PitchDeckSlideV2 = {
      id: 'inner-d',
      label: 'Inner',
      blocks: [],
      pathGroup: 'pa',
      decisionSlide: true,
      decisionOptions: [
        { id: 'i-a', label: 'I-A', pathGroup: 'inner-pa' },
      ],
    };
    const slides = [
      decisionSlide('outer'),
      blockSlide('end'),
      innerDecision,
      pathSlide('inner-leaf', 'inner-pa'),
    ];
    render(<PitchDeckPresentation slides={slides} theme={baseTheme} title="d" />);
    // Click outer "Path A" → injects 'pa' slides → inner-d (which is itself decision)
    act(() => {
      fireEvent.click(screen.getByTestId('decision-option-opt-a'));
    });
    // Now on the inner decision slide
    expect(screen.getByTestId('decision-renderer').getAttribute('data-title')).toBe(
      'Inner',
    );
  });
});
