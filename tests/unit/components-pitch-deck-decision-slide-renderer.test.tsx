// @vitest-environment jsdom
/**
 * Unit tests for `components/pitch-deck/DecisionSlideRenderer.tsx`
 * Covers: SimpleLayout (2/3/4 options, icon, eyebrow, description, onChoose,
 * hover styles), CenteredCover (all optional fields, logo variants — URL vs
 * inline SVG, RouteButton primary/secondary hover), TwoColumnCover (wordmark,
 * eyebrow, punchline, about paragraphs, image, CoverOptionPill with icon),
 * hasCoverContent guard (empty cover → SimpleLayout), onChoose callback.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must precede component import
// ---------------------------------------------------------------------------

vi.mock('@/lib/db/schema', () => ({
  // Types only — no runtime values needed.
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------

import { DecisionSlideRenderer } from '@/components/pitch-deck/DecisionSlideRenderer';
import type {
  PitchDeckTheme,
  PitchDeckDecisionOption,
  PitchDeckDecisionCover,
} from '@/lib/db/schema';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const theme: PitchDeckTheme = {
  primaryColor: '#005652',
  accentColor: '#c0392b',
  backgroundColor: '#fafaf8',
  textColor: '#1a1a1a',
  headingFont: 'Georgia, serif',
  bodyFont: 'Inter, sans-serif',
};

function makeOption(overrides: Partial<PitchDeckDecisionOption> = {}): PitchDeckDecisionOption {
  return {
    id: 'opt-1',
    label: 'Option One',
    pathGroup: 'group-a',
    ...overrides,
  };
}

const opt1 = makeOption({ id: 'opt-1', label: 'Path Alpha', pathGroup: 'alpha' });
const opt2 = makeOption({ id: 'opt-2', label: 'Path Beta', pathGroup: 'beta' });
const opt3 = makeOption({ id: 'opt-3', label: 'Path Gamma', pathGroup: 'gamma' });
const opt4 = makeOption({ id: 'opt-4', label: 'Path Delta', pathGroup: 'delta' });

// ---------------------------------------------------------------------------
// SimpleLayout
// ---------------------------------------------------------------------------

describe('DecisionSlideRenderer — SimpleLayout (no cover)', () => {
  it('renders the title in the heading', () => {
    render(
      <DecisionSlideRenderer
        title="Choose your path"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Choose your path' })).toBeInTheDocument();
  });

  it('renders a button for each option', () => {
    render(
      <DecisionSlideRenderer
        title="Pick one"
        options={[opt1, opt2, opt3]}
        theme={theme}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /Path Alpha/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Path Beta/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Path Gamma/ })).toBeInTheDocument();
  });

  it('calls onChoose with the correct pathGroup when a button is clicked', () => {
    const onChoose = vi.fn();
    render(
      <DecisionSlideRenderer
        title="Pick one"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={onChoose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Path Beta/ }));
    expect(onChoose).toHaveBeenCalledOnce();
    expect(onChoose).toHaveBeenCalledWith('beta');
  });

  it('renders optional icon when set', () => {
    const optWithIcon = makeOption({ id: 'i1', label: 'Icon Option', pathGroup: 'x', icon: 'star' });
    render(
      <DecisionSlideRenderer
        title="Pick"
        options={[optWithIcon]}
        theme={theme}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByText('star')).toBeInTheDocument();
  });

  it('does not render icon wrapper when icon is absent', () => {
    render(
      <DecisionSlideRenderer
        title="Pick"
        options={[opt1]}
        theme={theme}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.queryByText('star')).not.toBeInTheDocument();
  });

  it('renders optional eyebrow when set', () => {
    const optWithEyebrow = makeOption({ id: 'e1', label: 'Eyebrow Option', pathGroup: 'y', eyebrow: 'RECOMMENDED' });
    render(
      <DecisionSlideRenderer
        title="Pick"
        options={[optWithEyebrow]}
        theme={theme}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByText('RECOMMENDED')).toBeInTheDocument();
  });

  it('renders optional description when set', () => {
    const optWithDesc = makeOption({ id: 'd1', label: 'Desc Option', pathGroup: 'z', description: 'A detailed description here.' });
    render(
      <DecisionSlideRenderer
        title="Pick"
        options={[optWithDesc]}
        theme={theme}
        onChoose={vi.fn()}
      />,
    );
    expect(screen.getByText('A detailed description here.')).toBeInTheDocument();
  });

  it('handles 4 options without throwing', () => {
    render(
      <DecisionSlideRenderer
        title="Four options"
        options={[opt1, opt2, opt3, opt4]}
        theme={theme}
        onChoose={vi.fn()}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(4);
  });

  it('applies hover border color change on mouseEnter / mouseLeave', () => {
    render(
      <DecisionSlideRenderer
        title="Hover test"
        options={[opt1]}
        theme={theme}
        onChoose={vi.fn()}
      />,
    );
    const btn = screen.getByRole('button', { name: /Path Alpha/ });
    // jsdom converts hex colors to rgb() in computed styles
    const initialBorder = btn.style.borderColor;
    fireEvent.mouseEnter(btn);
    // accentColor #c0392b → rgb(192, 57, 43)
    expect(btn.style.borderColor).toBe('rgb(192, 57, 43)');
    fireEvent.mouseLeave(btn);
    expect(btn.style.borderColor).toBe(initialBorder);
  });
});

// ---------------------------------------------------------------------------
// hasCoverContent guard — empty cover → SimpleLayout
// ---------------------------------------------------------------------------

describe('DecisionSlideRenderer — empty cover falls back to SimpleLayout', () => {
  it('renders SimpleLayout when cover has no content fields', () => {
    const emptyCover: PitchDeckDecisionCover = {};
    render(
      <DecisionSlideRenderer
        title="Fallback title"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={vi.fn()}
        cover={emptyCover}
      />,
    );
    // SimpleLayout renders an h2; CenteredCover/TwoColumnCover render h1
    expect(screen.getByRole('heading', { level: 2, name: 'Fallback title' })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// CenteredCover
// ---------------------------------------------------------------------------

describe('DecisionSlideRenderer — CenteredCover (cover without image)', () => {
  const centeredCover: PitchDeckDecisionCover = {
    headline: 'Welcome to the Decision',
    body: 'Please choose a path below.',
  };

  it('renders CenteredCover when cover has content but no image', () => {
    render(
      <DecisionSlideRenderer
        title="Ignored in centered"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={vi.fn()}
        cover={centeredCover}
      />,
    );
    expect(screen.getByText('Welcome to the Decision')).toBeInTheDocument();
    expect(screen.getByText('Please choose a path below.')).toBeInTheDocument();
  });

  it('renders route buttons for each option in CenteredCover', () => {
    render(
      <DecisionSlideRenderer
        title="T"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={vi.fn()}
        cover={centeredCover}
      />,
    );
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(2);
  });

  it('calls onChoose with correct pathGroup from CenteredCover RouteButton', () => {
    const onChoose = vi.fn();
    render(
      <DecisionSlideRenderer
        title="T"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={onChoose}
        cover={centeredCover}
      />,
    );
    // The first option button is primary; second is secondary
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[1]);
    expect(onChoose).toHaveBeenCalledWith('beta');
  });

  it('renders option description as eyebrow in RouteButton when present', () => {
    const optWithDesc = makeOption({ id: 'x1', label: 'Route A', pathGroup: 'ra', description: 'SNAPSHOT' });
    render(
      <DecisionSlideRenderer
        title="T"
        options={[optWithDesc]}
        theme={theme}
        onChoose={vi.fn()}
        cover={centeredCover}
      />,
    );
    expect(screen.getByText('SNAPSHOT')).toBeInTheDocument();
  });

  it('renders URL logo as <img>', () => {
    const coverWithLogo: PitchDeckDecisionCover = {
      headline: 'H',
      logo: 'https://example.com/logo.png',
    };
    const { container } = render(
      <DecisionSlideRenderer
        title="T"
        options={[opt1]}
        theme={theme}
        onChoose={vi.fn()}
        cover={coverWithLogo}
      />,
    );
    // alt="" means role="presentation" — use querySelector instead of getByRole
    const img = container.querySelector('img');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', 'https://example.com/logo.png');
  });

  it('renders inline SVG logo via dangerouslySetInnerHTML', () => {
    const coverWithSvg: PitchDeckDecisionCover = {
      headline: 'H',
      logo: '<svg viewBox="0 0 100 50"><rect x="0" y="0" width="100" height="50"/></svg>',
    };
    const { container } = render(
      <DecisionSlideRenderer
        title="T"
        options={[opt1]}
        theme={theme}
        onChoose={vi.fn()}
        cover={coverWithSvg}
      />,
    );
    expect(container.querySelector('svg')).toBeInTheDocument();
    // No <img> for inline SVG
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('RouteButton primary applies opacity on mouseEnter and resets on mouseLeave', () => {
    render(
      <DecisionSlideRenderer
        title="T"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={vi.fn()}
        cover={centeredCover}
      />,
    );
    const primaryBtn = screen.getAllByRole('button')[0];
    fireEvent.mouseEnter(primaryBtn);
    expect(primaryBtn.style.opacity).toBe('0.88');
    fireEvent.mouseLeave(primaryBtn);
    expect(primaryBtn.style.opacity).toBe('1');
  });

  it('RouteButton secondary changes borderColor on mouseEnter / mouseLeave', () => {
    render(
      <DecisionSlideRenderer
        title="T"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={vi.fn()}
        cover={centeredCover}
      />,
    );
    const secondaryBtn = screen.getAllByRole('button')[1];
    fireEvent.mouseEnter(secondaryBtn);
    // primaryColor #005652 → rgb(0, 86, 82)
    expect(secondaryBtn.style.borderColor).toBe('rgb(0, 86, 82)');
    fireEvent.mouseLeave(secondaryBtn);
    // baseBorder is primaryColor + '26' — jsdom normalises this, just verify non-empty
    expect(secondaryBtn.style.borderColor).toBeTruthy();
  });

  it('renders cover body text', () => {
    const coverWithBody: PitchDeckDecisionCover = { body: 'Body copy here.', headline: 'H' };
    render(
      <DecisionSlideRenderer title="T" options={[opt1]} theme={theme} onChoose={vi.fn()} cover={coverWithBody} />,
    );
    expect(screen.getByText('Body copy here.')).toBeInTheDocument();
  });

  it('uses cover.backgroundColor when provided', () => {
    const coverWithBg: PitchDeckDecisionCover = { headline: 'H', backgroundColor: '#ff0000' };
    const { container } = render(
      <DecisionSlideRenderer title="T" options={[opt1]} theme={theme} onChoose={vi.fn()} cover={coverWithBg} />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.style.backgroundColor).toBe('rgb(255, 0, 0)');
  });

  it('renders with empty options list (no buttons)', () => {
    render(
      <DecisionSlideRenderer title="T" options={[]} theme={theme} onChoose={vi.fn()} cover={centeredCover} />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// TwoColumnCover
// ---------------------------------------------------------------------------

describe('DecisionSlideRenderer — TwoColumnCover (cover with image)', () => {
  const twoColCover: PitchDeckDecisionCover = {
    headline: 'Two Column Headline',
    image: 'https://example.com/headshot.jpg',
    imageAlt: 'Headshot',
  };

  it('renders TwoColumnCover when cover has an image', () => {
    render(
      <DecisionSlideRenderer
        title="T"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={vi.fn()}
        cover={twoColCover}
      />,
    );
    expect(screen.getByText('Two Column Headline')).toBeInTheDocument();
    const img = screen.getByRole('img', { name: 'Headshot' });
    expect(img).toHaveAttribute('src', 'https://example.com/headshot.jpg');
  });

  it('renders wordmark when provided', () => {
    const cover: PitchDeckDecisionCover = { image: 'x.jpg', wordmark: 'CY STRATEGIES' };
    render(
      <DecisionSlideRenderer title="T" options={[opt1]} theme={theme} onChoose={vi.fn()} cover={cover} />,
    );
    expect(screen.getByText('CY STRATEGIES')).toBeInTheDocument();
  });

  it('renders eyebrow when provided', () => {
    const cover: PitchDeckDecisionCover = { image: 'x.jpg', eyebrow: 'MARKETING CONSULTANT' };
    render(
      <DecisionSlideRenderer title="T" options={[opt1]} theme={theme} onChoose={vi.fn()} cover={cover} />,
    );
    expect(screen.getByText('MARKETING CONSULTANT')).toBeInTheDocument();
  });

  it('renders punchline when provided', () => {
    const cover: PitchDeckDecisionCover = { image: 'x.jpg', headline: 'H', punchline: 'Light punchline' };
    render(
      <DecisionSlideRenderer title="T" options={[opt1]} theme={theme} onChoose={vi.fn()} cover={cover} />,
    );
    expect(screen.getByText('Light punchline')).toBeInTheDocument();
  });

  it('renders intro when provided', () => {
    const cover: PitchDeckDecisionCover = { image: 'x.jpg', intro: "Hi, I'm Cody." };
    render(
      <DecisionSlideRenderer title="T" options={[opt1]} theme={theme} onChoose={vi.fn()} cover={cover} />,
    );
    expect(screen.getByText("Hi, I'm Cody.")).toBeInTheDocument();
  });

  it('renders body when provided', () => {
    const cover: PitchDeckDecisionCover = { image: 'x.jpg', body: 'Body paragraph text.' };
    render(
      <DecisionSlideRenderer title="T" options={[opt1]} theme={theme} onChoose={vi.fn()} cover={cover} />,
    );
    expect(screen.getByText('Body paragraph text.')).toBeInTheDocument();
  });

  it('splits about into paragraphs on double newline', () => {
    const cover: PitchDeckDecisionCover = {
      image: 'x.jpg',
      about: 'First paragraph.\n\nSecond paragraph.',
    };
    render(
      <DecisionSlideRenderer title="T" options={[opt1]} theme={theme} onChoose={vi.fn()} cover={cover} />,
    );
    expect(screen.getByText('First paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
  });

  it('renders CoverOptionPill for each option and calls onChoose', () => {
    const onChoose = vi.fn();
    render(
      <DecisionSlideRenderer
        title="T"
        options={[opt1, opt2]}
        theme={theme}
        onChoose={onChoose}
        cover={twoColCover}
      />,
    );
    const pills = screen.getAllByRole('button');
    expect(pills.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(pills[0]);
    expect(onChoose).toHaveBeenCalledWith('alpha');
  });

  it('renders icon in CoverOptionPill when option has icon', () => {
    const optWithIcon = makeOption({ id: 'ic2', label: 'Icon Pill', pathGroup: 'ip', icon: 'rocket' });
    render(
      <DecisionSlideRenderer
        title="T"
        options={[optWithIcon]}
        theme={theme}
        onChoose={vi.fn()}
        cover={twoColCover}
      />,
    );
    expect(screen.getByText('rocket')).toBeInTheDocument();
  });

  it('applies description as title attribute on CoverOptionPill', () => {
    const optWithDesc = makeOption({ id: 'dp1', label: 'Pill', pathGroup: 'pp', description: 'Tooltip text' });
    render(
      <DecisionSlideRenderer
        title="T"
        options={[optWithDesc]}
        theme={theme}
        onChoose={vi.fn()}
        cover={twoColCover}
      />,
    );
    const pill = screen.getByTitle('Tooltip text');
    expect(pill).toBeInTheDocument();
  });

  it('CoverOptionPill hover changes opacity / transform on mouseEnter then resets on mouseLeave', () => {
    render(
      <DecisionSlideRenderer
        title="T"
        options={[opt1]}
        theme={theme}
        onChoose={vi.fn()}
        cover={twoColCover}
      />,
    );
    const pill = screen.getAllByRole('button')[0];
    fireEvent.mouseEnter(pill);
    expect(pill.style.opacity).toBe('0.9');
    expect(pill.style.transform).toBe('translateY(-1px)');
    fireEvent.mouseLeave(pill);
    expect(pill.style.opacity).toBe('1');
    expect(pill.style.transform).toBe('translateY(0)');
  });

  it('renders URL logo as <img> inside TwoColumnCover', () => {
    const cover: PitchDeckDecisionCover = { image: 'headshot.jpg', logo: 'logo.png' };
    const { container } = render(
      <DecisionSlideRenderer title="T" options={[opt1]} theme={theme} onChoose={vi.fn()} cover={cover} />,
    );
    // alt="" images have role="presentation" — use querySelector to find all imgs
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThanOrEqual(2);
  });
});
