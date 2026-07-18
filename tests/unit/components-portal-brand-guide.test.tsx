// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/BrandGuide.tsx`.
 * Covers: toolbar render, copy-link interaction, cover section (logo/tagline/date),
 * logo section (variants, wordmark, empty state), colors section, typography section,
 * buttons section, voice section (no-messaging empty, full messaging with axes/samples),
 * application section, guide footer.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { BrandGuide } from '@/components/portal/BrandGuide';
import type { ResolvedBranding } from '@/lib/branding';
import type { BrandMessagingContext } from '@/lib/branding/block-defaults';
import type { Block } from '@/types/blocks';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({
    children,
    href,
    ...rest
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => React.createElement('a', { href, ...rest }, children),
}));

// BlockRenderer renders example blocks — stub to a simple div to avoid
// pulling in the entire block render tree.
vi.mock('@/components/blocks/render/BlockRenderer', () => ({
  BlockRenderer: ({ content }: { content: string }) =>
    React.createElement('div', { 'data-testid': 'block-renderer' }, content),
}));

// BrandingContext wraps children with CSS vars — stub to passthrough.
vi.mock('@/contexts/BrandingContext', () => ({
  BrandingProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

// lib/branding/css-vars and typography-css are only used inside BrandingProvider
// which is mocked above, so they don't need individual mocks.

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    size,
    variant,
  }: {
    children: React.ReactNode;
    size?: string;
    variant?: string;
  }) =>
    React.createElement(
      'button',
      { 'data-size': size, 'data-variant': variant },
      children,
    ),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseBranding: ResolvedBranding = {
  primaryColor: '#3b82f6',
  secondaryColor: '#6366f1',
  accentColor: '#f59e0b',
  backgroundColor: '#ffffff',
  textColor: '#111827',
  headingFont: 'Inter',
  bodyFont: 'Source Sans Pro',
  logoUrl: 'https://example.com/logo.png',
  logoSquareUrl: 'https://example.com/logo-sq.png',
  logoRectUrl: 'https://example.com/logo-rect.png',
  logoIconUrl: 'https://example.com/logo-icon.png',
  logoText: 'Acme',
  logoAlt: 'Acme logo',
  navTemplate: 'default',
  navPosition: 'top',
  navBackground: '#1e293b',
  navTextColor: '#f8fafc',
  linkColor: '#2563eb',
  linkHoverColor: '#1d4ed8',
};

const baseProps = {
  profileId: 42,
  profileName: 'Acme Brand',
  updatedAt: '2025-06-01T12:00:00Z',
  clientName: 'Acme Corp',
  branding: baseBranding,
  exampleBlocks: [] as Block[],
};

// ─── Clipboard / print stubs ──────────────────────────────────────────────────

const writeTextMock = vi.fn().mockResolvedValue(undefined);
const printMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: writeTextMock },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'print', {
    value: printMock,
    configurable: true,
    writable: true,
  });
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('BrandGuide', () => {
  describe('toolbar', () => {
    it('renders back link pointing to the correct profile URL', () => {
      render(<BrandGuide {...baseProps} />);
      const link = screen.getByRole('link', { name: /back to editor/i });
      expect(link).toHaveAttribute('href', '/portal/branding/profiles/42');
    });

    it('renders profile name and brand guide label', () => {
      render(<BrandGuide {...baseProps} />);
      // profileName appears in both toolbar and cover dl — use getAllByText
      expect(screen.getAllByText('Acme Brand').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('brand guide')).toBeInTheDocument();
    });

    it('renders copy link button initially showing "Copy link"', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    });

    it('calls clipboard.writeText on copy-link click and shows "Copied"', async () => {
      render(<BrandGuide {...baseProps} />);
      const btn = screen.getByRole('button', { name: /copy link/i });
      await act(async () => {
        fireEvent.click(btn);
      });
      expect(writeTextMock).toHaveBeenCalledWith(window.location.href);
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /copied/i })).toBeInTheDocument();
      });
    });

    it('calls window.print on print button click', () => {
      render(<BrandGuide {...baseProps} />);
      const btn = screen.getByRole('button', { name: /print/i });
      fireEvent.click(btn);
      expect(printMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('CoverSection', () => {
    it('renders company name from clientName', () => {
      render(<BrandGuide {...baseProps} />);
      // Typography section also renders h1 via TypeSample — use getAllByRole
      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s.some((el) => el.textContent === 'Acme Corp')).toBe(true);
    });

    it('prefers messaging.companyName over clientName', () => {
      const messaging: BrandMessagingContext = { companyName: 'Messaging Co' };
      render(<BrandGuide {...baseProps} messaging={messaging} />);
      const h1s = screen.getAllByRole('heading', { level: 1 });
      expect(h1s.some((el) => el.textContent === 'Messaging Co')).toBe(true);
    });

    it('shows tagline from messaging', () => {
      const messaging: BrandMessagingContext = { tagline: 'Build fast, ship more' };
      render(<BrandGuide {...baseProps} messaging={messaging} />);
      // tagline appears in cover <p> and also as the type-scale sample rows
      const matches = screen.getAllByText('Build fast, ship more');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });

    it('renders logo image when logoRectUrl is set', () => {
      render(<BrandGuide {...baseProps} />);
      // The cover section img uses the company name as alt text
      const imgs = screen.getAllByRole('img');
      const logoImg = imgs.find(
        (img) => img.getAttribute('alt') === 'Acme Corp',
      );
      expect(logoImg).toBeDefined();
    });

    it('renders formatted date when updatedAt is provided', () => {
      render(<BrandGuide {...baseProps} />);
      // "Last updated" label exists
      expect(screen.getByText('Last updated')).toBeInTheDocument();
    });

    it('does not render Last updated when updatedAt is absent', () => {
      render(<BrandGuide {...baseProps} updatedAt={undefined} />);
      expect(screen.queryByText('Last updated')).not.toBeInTheDocument();
    });

    it('renders profile name in cover section dl', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });
  });

  describe('LogoSection', () => {
    it('renders Primary, Square, Icon logo variants when all URLs set', () => {
      render(<BrandGuide {...baseProps} />);
      // "Primary" appears in logo section, color swatch, and buttons section
      const allPrimary = screen.getAllByText('Primary');
      expect(allPrimary.length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Square')).toBeInTheDocument();
      expect(screen.getByText('Icon')).toBeInTheDocument();
    });

    it('renders wordmark when logoText is set', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByText('Wordmark')).toBeInTheDocument();
      expect(screen.getByText('Acme')).toBeInTheDocument();
    });

    it('renders empty-state message when no logo URLs or logoText', () => {
      const brandingNoLogo: ResolvedBranding = {
        ...baseBranding,
        logoUrl: '',
        logoSquareUrl: '',
        logoRectUrl: '',
        logoIconUrl: '',
        logoText: '',
      };
      render(<BrandGuide {...baseProps} branding={brandingNoLogo} />);
      expect(
        screen.getByText(/No logo assets uploaded yet/i),
      ).toBeInTheDocument();
    });

    it('renders On light / On dark / On primary background swatches when logo URL present', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByText('On light')).toBeInTheDocument();
      expect(screen.getByText('On dark')).toBeInTheDocument();
      expect(screen.getByText('On primary')).toBeInTheDocument();
    });

    it('omits Square variant when logoSquareUrl is empty', () => {
      const noSquare: ResolvedBranding = { ...baseBranding, logoSquareUrl: '' };
      render(<BrandGuide {...baseProps} branding={noSquare} />);
      expect(screen.queryByText('Square')).not.toBeInTheDocument();
    });
  });

  describe('ColorsSection', () => {
    it('renders Palette section header', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByText('Colors')).toBeInTheDocument();
    });

    it('renders all color swatches that have hex values', () => {
      render(<BrandGuide {...baseProps} />);
      // Role descriptions are unique — check a couple
      expect(screen.getByText('Actions, links, emphasis')).toBeInTheDocument();
      expect(screen.getByText('Body copy')).toBeInTheDocument();
    });

    it('does not render swatches for missing optional colors', () => {
      const noLink: ResolvedBranding = { ...baseBranding, linkColor: undefined };
      render(<BrandGuide {...baseProps} branding={noLink} />);
      expect(screen.queryByText('Inline hyperlinks')).not.toBeInTheDocument();
    });

    it('renders hex values in uppercase', () => {
      render(<BrandGuide {...baseProps} />);
      // Primary hex #3B82F6 — use getAllByText to be safe
      expect(screen.getByText('#3B82F6')).toBeInTheDocument();
    });
  });

  describe('TypographySection', () => {
    it('renders type system section header', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByText('Type system')).toBeInTheDocument();
    });

    it('renders heading and body font cards', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByText('Heading font')).toBeInTheDocument();
      expect(screen.getByText('Body font')).toBeInTheDocument();
      expect(screen.getByText('Inter')).toBeInTheDocument();
      expect(screen.getByText('Source Sans Pro')).toBeInTheDocument();
    });

    it('shows "System default" when fonts are absent', () => {
      const noFont: ResolvedBranding = { ...baseBranding, headingFont: '', bodyFont: '' };
      render(<BrandGuide {...baseProps} branding={noFont} />);
      expect(screen.getAllByText('System default')).toHaveLength(2);
    });

    it('renders all type scale rows (H1–H6, Body, Quote, Small)', () => {
      render(<BrandGuide {...baseProps} />);
      ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'Body', 'Quote', 'Small'].forEach((label) => {
        expect(screen.getByText(label)).toBeInTheDocument();
      });
    });

    it('uses tagline as sample text when messaging has a tagline', () => {
      const messaging: BrandMessagingContext = { tagline: 'UniqueSampleXYZ' };
      render(<BrandGuide {...baseProps} messaging={messaging} />);
      // sample appears once per type scale row (9 rows) plus potentially the cover tagline
      const samples = screen.getAllByText('UniqueSampleXYZ');
      // At minimum appears in the type scale rows
      expect(samples.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe('ButtonsSection', () => {
    it('renders buttons section with Primary and Outline groups', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByText('Buttons')).toBeInTheDocument();
      // "Primary" appears in both colors (swatch label) and buttons section label
      const primaryLabels = screen.getAllByText('Primary');
      expect(primaryLabels.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText('Outline')).toBeInTheDocument();
    });

    it('renders sm, md, lg button variants in each group', () => {
      render(<BrandGuide {...baseProps} />);
      const smBtns = screen.getAllByText('Small button');
      expect(smBtns.length).toBeGreaterThanOrEqual(2); // one primary, one outline
      const mdBtns = screen.getAllByText('Medium button');
      expect(mdBtns.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('VoiceSection — no messaging', () => {
    it('renders empty voice section with add-messaging prompt', () => {
      render(<BrandGuide {...baseProps} messaging={undefined} />);
      expect(screen.getByText(/No messaging defined/i)).toBeInTheDocument();
    });
  });

  describe('VoiceSection — full messaging', () => {
    const fullMessaging: BrandMessagingContext = {
      companyName: 'Acme',
      tagline: 'Build fast',
      valueProposition: 'We save you time',
      elevatorPitch: '30-second pitch here',
      missionStatement: 'Empower builders',
      visionStatement: 'A world with less complexity',
      targetAudience: 'Startup founders',
      boilerplate: 'Acme Inc. is a leading platform.',
      brandPersonality: 'Bold and energetic',
      toneOfVoice: 'Direct',
      writingStyle: 'Conversational',
      keyDifferentiators: ['Fast', 'Reliable'],
      toneAxes: { formal: 0.5, playful: -0.3, traditional: 0, authoritative: 0.8 },
      voiceSamples: [
        { context: 'Homepage hero', text: 'Build faster today.' },
        { context: 'Email subject', text: 'Your trial is ready.' },
      ],
    };

    it('renders tagline blockquote', () => {
      render(<BrandGuide {...baseProps} messaging={fullMessaging} />);
      // tagline appears in blockquote (cover) + type scale rows — check the blockquote
      const blockquote = document.querySelector(
        'blockquote.border-l-4',
      ) as HTMLElement;
      expect(blockquote).toBeTruthy();
      expect(blockquote.textContent).toContain('Build fast');
    });

    it('renders copy cards for value prop, elevator pitch, mission, vision', () => {
      render(<BrandGuide {...baseProps} messaging={fullMessaging} />);
      expect(screen.getByText('Value proposition')).toBeInTheDocument();
      expect(screen.getByText('We save you time')).toBeInTheDocument();
      expect(screen.getByText('Elevator pitch')).toBeInTheDocument();
      expect(screen.getByText('Empower builders')).toBeInTheDocument();
    });

    it('renders personality, tone, writing style pill cards', () => {
      render(<BrandGuide {...baseProps} messaging={fullMessaging} />);
      expect(screen.getByText('Personality')).toBeInTheDocument();
      expect(screen.getByText('Bold and energetic')).toBeInTheDocument();
      expect(screen.getByText('Tone')).toBeInTheDocument();
      expect(screen.getByText('Direct')).toBeInTheDocument();
    });

    it('renders tone axes section', () => {
      render(<BrandGuide {...baseProps} messaging={fullMessaging} />);
      expect(screen.getByText('Tone axes')).toBeInTheDocument();
      expect(screen.getByText('Casual')).toBeInTheDocument();
      expect(screen.getByText('Formal')).toBeInTheDocument();
    });

    it('renders key differentiators list', () => {
      render(<BrandGuide {...baseProps} messaging={fullMessaging} />);
      expect(screen.getByText('Key differentiators')).toBeInTheDocument();
      expect(screen.getByText('Fast')).toBeInTheDocument();
      expect(screen.getByText('Reliable')).toBeInTheDocument();
    });

    it('renders voice samples', () => {
      render(<BrandGuide {...baseProps} messaging={fullMessaging} />);
      expect(screen.getByText('Voice samples')).toBeInTheDocument();
      expect(screen.getByText('Homepage hero')).toBeInTheDocument();
      expect(screen.getByText('Build faster today.')).toBeInTheDocument();
      expect(screen.getByText('Email subject')).toBeInTheDocument();
    });

    it('omits tone axes section when no axes have numeric values', () => {
      const noAxes: BrandMessagingContext = { ...fullMessaging, toneAxes: {} };
      render(<BrandGuide {...baseProps} messaging={noAxes} />);
      expect(screen.queryByText('Tone axes')).not.toBeInTheDocument();
    });

    it('omits differentiators section when array is empty', () => {
      const noDiff: BrandMessagingContext = { ...fullMessaging, keyDifferentiators: [] };
      render(<BrandGuide {...baseProps} messaging={noDiff} />);
      expect(screen.queryByText('Key differentiators')).not.toBeInTheDocument();
    });

    it('omits voice samples section when array is empty', () => {
      const noSamples: BrandMessagingContext = { ...fullMessaging, voiceSamples: [] };
      render(<BrandGuide {...baseProps} messaging={noSamples} />);
      expect(screen.queryByText('Voice samples')).not.toBeInTheDocument();
    });

    it('omits personality pills when all three fields are absent', () => {
      const noPills: BrandMessagingContext = {
        ...fullMessaging,
        brandPersonality: undefined,
        toneOfVoice: undefined,
        writingStyle: undefined,
      };
      render(<BrandGuide {...baseProps} messaging={noPills} />);
      expect(screen.queryByText('Personality')).not.toBeInTheDocument();
    });
  });

  describe('ApplicationSection', () => {
    it('renders Example application section and BlockRenderer stub', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByText('Example application')).toBeInTheDocument();
      expect(screen.getByTestId('block-renderer')).toBeInTheDocument();
    });

    it('passes serialized exampleBlocks JSON to BlockRenderer', () => {
      const blocks = [{ type: 'text', id: '1', content: {} }] as Block[];
      render(<BrandGuide {...baseProps} exampleBlocks={blocks} />);
      const renderer = screen.getByTestId('block-renderer');
      expect(renderer.textContent).toContain('"type":"text"');
    });
  });

  describe('GuideFooter', () => {
    it('renders footer with client name', () => {
      render(<BrandGuide {...baseProps} />);
      // "Acme Corp" appears in cover h1 and footer — use getAllByText
      expect(screen.getAllByText('Acme Corp').length).toBeGreaterThanOrEqual(1);
      // footer text pattern
      expect(screen.getByText(/Brand guide for/)).toBeInTheDocument();
    });

    it('shows "this account" when clientName is absent', () => {
      render(<BrandGuide {...baseProps} clientName={undefined} />);
      expect(screen.getByText('this account')).toBeInTheDocument();
    });

    it('renders profile name in footer', () => {
      render(<BrandGuide {...baseProps} />);
      // Multiple elements contain "Acme Brand" (toolbar + footer)
      expect(screen.getAllByText(/Acme Brand/).length).toBeGreaterThanOrEqual(1);
    });

    it('renders generated date in footer', () => {
      render(<BrandGuide {...baseProps} />);
      expect(screen.getByText(/Generated/)).toBeInTheDocument();
    });
  });
});
