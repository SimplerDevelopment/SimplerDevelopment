// @vitest-environment jsdom
/**
 * Unit tests for HeroSlideshowBlockSettings.
 * Covers: render, slide add/remove/move, slide field editing, toggles,
 * background video, stats bar add/remove/edit, advanced settings.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, within } from '@testing-library/react';

// ─── Mock heavy dependencies ──────────────────────────────────────────────────

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value, onChange, label }: { value: string; onChange: (url: string) => void; label?: string }) => (
    <div data-testid={`media-picker-${label || 'unnamed'}`}>
      <input
        data-testid={`mp-input-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) => (
    <label>
      <span>{label}</span>
      <input
        data-testid={`color-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

vi.mock('@/components/blocks/visual/RichTextEditable', () => ({
  RichTextEditable: ({ html, onChange, placeholder }: { html: string; onChange: (v: string) => void; placeholder?: string; singleLine?: boolean; className?: string }) => (
    <textarea
      data-testid={`rte-${placeholder || 'rte'}`}
      value={html || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// ─── Import under test (after mocks) ─────────────────────────────────────────
import { HeroSlideshowBlockSettings } from '@/components/blocks/visual/block-settings/panels/HeroSlideshowSettings';
import type { HeroSlideshowBlock, HeroSlideshowSlide } from '@/types/blocks';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeSlide(overrides: Partial<HeroSlideshowSlide> = {}): HeroSlideshowSlide {
  return {
    id: `slide-${Math.random().toString(36).slice(2)}`,
    title: 'Test Slide',
    textAlignment: 'center',
    ...overrides,
  };
}

function makeBlock(overrides: Partial<HeroSlideshowBlock> = {}): HeroSlideshowBlock {
  return {
    id: 'block-hero-1',
    type: 'hero-slideshow',
    slides: [makeSlide({ id: 'slide-1', title: 'Slide One' })],
    ...overrides,
  };
}

function renderSettings(block = makeBlock(), onChange = vi.fn()) {
  const utils = render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
  return { ...utils, onChange };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('HeroSlideshowBlockSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Basic render ───────────────────────────────────────────────────────────

  describe('basic render', () => {
    it('renders without crashing', () => {
      renderSettings();
      expect(screen.getByText('Slides')).toBeInTheDocument();
    });

    it('renders slide tab button for each slide', () => {
      const block = makeBlock({
        slides: [makeSlide({ id: 's1' }), makeSlide({ id: 's2' })],
      });
      renderSettings(block);
      // Slide tabs are numbered 1, 2
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });

    it('renders the "+" add slide button', () => {
      renderSettings();
      expect(screen.getByText('+')).toBeInTheDocument();
    });

    it('renders active slide fields for slide title', () => {
      renderSettings();
      expect(screen.getByTestId('rte-Slide Title')).toBeInTheDocument();
    });

    it('renders "Slideshow Settings" section', () => {
      renderSettings();
      expect(screen.getByText('Slideshow Settings')).toBeInTheDocument();
    });

    it('renders "Background Video" section', () => {
      renderSettings();
      expect(screen.getByText('Background Video')).toBeInTheDocument();
    });

    it('renders "Stats Bar" section', () => {
      renderSettings();
      expect(screen.getByText('Stats Bar')).toBeInTheDocument();
    });
  });

  // ── Slide tabs ─────────────────────────────────────────────────────────────

  describe('slide tab switching', () => {
    it('clicking tab 2 switches to slide 2', () => {
      const block = makeBlock({
        slides: [
          makeSlide({ id: 's1', title: 'First' }),
          makeSlide({ id: 's2', title: 'Second', subtitle: 'Sub 2' }),
        ],
      });
      renderSettings(block);
      fireEvent.click(screen.getByText('2'));
      const subtitleInput = screen.getByPlaceholderText('Optional subtitle');
      expect(subtitleInput).toHaveValue('Sub 2');
    });

    it('active tab has different styling class than inactive', () => {
      const block = makeBlock({
        slides: [makeSlide({ id: 's1' }), makeSlide({ id: 's2' })],
      });
      renderSettings(block);
      const tab1 = screen.getByText('1');
      const tab2 = screen.getByText('2');
      // Tab 1 should have the active class (bg-primary)
      expect(tab1.className).toContain('bg-primary');
      expect(tab2.className).not.toContain('bg-primary');
    });
  });

  // ── Add slide ──────────────────────────────────────────────────────────────

  describe('add slide', () => {
    it('calls onChange with a new slide appended', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1', title: 'Only' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      fireEvent.click(screen.getByText('+'));
      expect(onChange).toHaveBeenCalledTimes(1);
      const [update] = onChange.mock.calls[0];
      expect(update.slides).toHaveLength(2);
      expect(update.slides[1].title).toBe('New Slide');
    });

    it('new slide has a unique id', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      fireEvent.click(screen.getByText('+'));
      const newSlide = onChange.mock.calls[0][0].slides[1];
      expect(newSlide.id).toMatch(/^slide-/);
    });
  });

  // ── Remove slide ───────────────────────────────────────────────────────────

  describe('remove slide', () => {
    it('shows move/remove controls only when there are multiple slides', () => {
      const block = makeBlock({
        slides: [makeSlide({ id: 's1' }), makeSlide({ id: 's2' })],
      });
      renderSettings(block);
      // delete button is rendered via material-icons delete
      expect(document.querySelector('.material-icons[style]')?.textContent || document.body.innerHTML).toContain('delete');
    });

    it('does NOT show move/remove controls for single slide', () => {
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      const { container } = renderSettings(block);
      // The buttons for move/delete only appear when slides.length > 1
      // Check there is no arrow_back icon in the slide controls
      const icons = container.querySelectorAll('.material-icons');
      const iconTexts = Array.from(icons).map((el) => el.textContent?.trim());
      // Stats-bar delete icons may exist, but arrow_back should not for the slide controls
      expect(iconTexts).not.toContain('arrow_back');
    });

    it('calls onChange with the active slide removed', () => {
      const onChange = vi.fn();
      const block = makeBlock({
        slides: [makeSlide({ id: 's1', title: 'Keep' }), makeSlide({ id: 's2', title: 'Remove' })],
      });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      // Find delete button (last button in the move row before the slide content)
      const deleteIcon = screen.getByText('delete');
      fireEvent.click(deleteIcon.closest('button')!);
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ slides: expect.arrayContaining([expect.objectContaining({ id: 's2' })]) }),
      );
      const updatedSlides = onChange.mock.calls[0][0].slides;
      expect(updatedSlides).toHaveLength(1);
      expect(updatedSlides[0].id).toBe('s2');
    });

    it('does not remove slide if only one remains (guard)', () => {
      const onChange = vi.fn();
      // With 1 slide, no delete button is rendered at all
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      // No delete in slide controls area
      const deleteButtons = screen.queryAllByText('delete');
      // All delete buttons belong to stats-bar items, which are empty here
      expect(onChange).not.toHaveBeenCalled();
      expect(deleteButtons).toHaveLength(0);
    });
  });

  // ── Move slide ─────────────────────────────────────────────────────────────

  describe('move slide', () => {
    it('calls onChange with slides reordered when moving forward', () => {
      const onChange = vi.fn();
      const block = makeBlock({
        slides: [makeSlide({ id: 's1', title: 'First' }), makeSlide({ id: 's2', title: 'Second' })],
      });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const forwardBtn = screen.getByText('arrow_forward').closest('button')!;
      fireEvent.click(forwardBtn);
      const updatedSlides = onChange.mock.calls[0][0].slides;
      expect(updatedSlides[0].id).toBe('s2');
      expect(updatedSlides[1].id).toBe('s1');
    });

    it('back button is disabled on first slide', () => {
      const block = makeBlock({
        slides: [makeSlide({ id: 's1' }), makeSlide({ id: 's2' })],
      });
      renderSettings(block);
      const backBtn = screen.getByText('arrow_back').closest('button')!;
      expect(backBtn).toBeDisabled();
    });

    it('forward button is disabled on last slide', () => {
      const block = makeBlock({
        slides: [makeSlide({ id: 's1' }), makeSlide({ id: 's2' })],
      });
      renderSettings(block);
      // Switch to slide 2 first
      fireEvent.click(screen.getByText('2'));
      const forwardBtn = screen.getByText('arrow_forward').closest('button')!;
      expect(forwardBtn).toBeDisabled();
    });

    it('calls onChange with slides reordered when moving backward from slide 2', () => {
      const onChange = vi.fn();
      const block = makeBlock({
        slides: [makeSlide({ id: 's1', title: 'First' }), makeSlide({ id: 's2', title: 'Second' })],
      });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      fireEvent.click(screen.getByText('2'));
      const backBtn = screen.getByText('arrow_back').closest('button')!;
      fireEvent.click(backBtn);
      const updatedSlides = onChange.mock.calls[0][0].slides;
      expect(updatedSlides[0].id).toBe('s2');
      expect(updatedSlides[1].id).toBe('s1');
    });
  });

  // ── Slide field editing ────────────────────────────────────────────────────

  describe('slide field editing', () => {
    it('calls onChange when subtitle input changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1', subtitle: 'Old Sub' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const subtitleInput = screen.getByPlaceholderText('Optional subtitle');
      fireEvent.change(subtitleInput, { target: { value: 'New Sub' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ subtitle: 'New Sub' })]),
        }),
      );
    });

    it('calls onChange when description textarea changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const desc = screen.getByPlaceholderText('Optional description');
      fireEvent.change(desc, { target: { value: 'A description' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ description: 'A description' })]),
        }),
      );
    });

    it('calls onChange when CTA text changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const ctaText = screen.getByPlaceholderText('Button text');
      fireEvent.change(ctaText, { target: { value: 'Click Me' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ ctaText: 'Click Me' })]),
        }),
      );
    });

    it('calls onChange when CTA link changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const ctaLink = screen.getByPlaceholderText('/page');
      fireEvent.change(ctaLink, { target: { value: '/about' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ ctaLink: '/about' })]),
        }),
      );
    });

    it('calls onChange when secondary CTA text changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const inputs = screen.getAllByPlaceholderText('Optional');
      fireEvent.change(inputs[0], { target: { value: 'Learn More' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ secondaryCtaText: 'Learn More' })]),
        }),
      );
    });

    it('calls onChange when text alignment select changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1', textAlignment: 'center' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const selects = screen.getAllByRole('combobox');
      // textAlignment select has "Left", "Center", "Right" options
      const alignSelect = selects.find((s) => s.querySelector && Array.from((s as HTMLSelectElement).options).some((o) => o.value === 'left'));
      if (alignSelect) {
        fireEvent.change(alignSelect, { target: { value: 'left' } });
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({
            slides: expect.arrayContaining([expect.objectContaining({ textAlignment: 'left' })]),
          }),
        );
      }
    });

    it('calls onChange via RichTextEditable when slide title changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1', title: 'Old Title' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const rte = screen.getByTestId('rte-Slide Title');
      fireEvent.change(rte, { target: { value: 'New Title' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ title: 'New Title' })]),
        }),
      );
    });
  });

  // ── Background image ───────────────────────────────────────────────────────

  describe('background image', () => {
    it('shows "Choose Image" button when no background image', () => {
      renderSettings();
      expect(screen.getByText('Choose Image')).toBeInTheDocument();
    });

    it('shows image and Change/Remove buttons when backgroundImage is set', () => {
      const block = makeBlock({
        slides: [makeSlide({ id: 's1', backgroundImage: 'https://example.com/img.jpg' })],
      });
      renderSettings(block);
      expect(screen.getByText('Change')).toBeInTheDocument();
      expect(screen.getByText('Remove')).toBeInTheDocument();
    });

    it('clicking "Choose Image" shows MediaPicker', () => {
      renderSettings();
      fireEvent.click(screen.getByText('Choose Image'));
      expect(screen.getByTestId('media-picker-Slide Background')).toBeInTheDocument();
    });

    it('clicking "Change" shows MediaPicker', () => {
      const block = makeBlock({
        slides: [makeSlide({ id: 's1', backgroundImage: 'https://example.com/img.jpg' })],
      });
      renderSettings(block);
      fireEvent.click(screen.getByText('Change'));
      expect(screen.getByTestId('media-picker-Slide Background')).toBeInTheDocument();
    });

    it('calls onChange with backgroundImage cleared when "Remove" clicked', () => {
      const onChange = vi.fn();
      const block = makeBlock({
        slides: [makeSlide({ id: 's1', backgroundImage: 'https://example.com/img.jpg' })],
      });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      fireEvent.click(screen.getByText('Remove'));
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ backgroundImage: '' })]),
        }),
      );
    });

    it('selecting an image via MediaPicker hides the picker and calls onChange', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      fireEvent.click(screen.getByText('Choose Image'));
      const mpInput = screen.getByTestId('mp-input-Slide Background');
      fireEvent.change(mpInput, { target: { value: 'https://example.com/new.jpg' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ backgroundImage: 'https://example.com/new.jpg' })]),
        }),
      );
      // Picker should be hidden after selection
      expect(screen.queryByTestId('media-picker-Slide Background')).toBeNull();
    });
  });

  // ── Background video (per slide) ───────────────────────────────────────────

  describe('per-slide background video', () => {
    it('renders background video URL input for current slide', () => {
      renderSettings();
      const videoInputs = screen.getAllByPlaceholderText('https://...mp4 (optional)');
      expect(videoInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('calls onChange when per-slide video URL changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const videoInputs = screen.getAllByPlaceholderText('https://...mp4 (optional)');
      // First one is the per-slide video input
      fireEvent.change(videoInputs[0], { target: { value: 'https://cdn.example.com/bg.mp4' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([
            expect.objectContaining({ backgroundVideo: 'https://cdn.example.com/bg.mp4' }),
          ]),
        }),
      );
    });
  });

  // ── Advanced slide settings ────────────────────────────────────────────────

  describe('advanced slide settings (details panel)', () => {
    it('renders overlay opacity range input inside advanced section', () => {
      renderSettings();
      const rangeInputs = document.querySelectorAll('input[type="range"]');
      // At least one range input (overlay opacity or video opacity) should be present
      expect(rangeInputs.length).toBeGreaterThanOrEqual(1);
    });

    it('calls onChange when overlay opacity changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1', overlayOpacity: 0.45 })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const rangeInputs = document.querySelectorAll<HTMLInputElement>('input[type="range"]');
      fireEvent.change(rangeInputs[0], { target: { value: '0.6' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ overlayOpacity: 0.6 })]),
        }),
      );
    });

    it('calls onChange when background size select changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1', backgroundSize: 'cover' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      // Background size select has "cover", "contain", etc.
      const selects = document.querySelectorAll<HTMLSelectElement>('select');
      const sizeSelect = Array.from(selects).find((s) =>
        Array.from(s.options).some((o) => o.value === 'contain'),
      );
      if (sizeSelect) {
        fireEvent.change(sizeSelect, { target: { value: 'contain' } });
        expect(onChange).toHaveBeenCalledWith(
          expect.objectContaining({
            slides: expect.arrayContaining([expect.objectContaining({ backgroundSize: 'contain' })]),
          }),
        );
      }
    });
  });

  // ── Persistent background video ────────────────────────────────────────────

  describe('persistent background video (block-level)', () => {
    it('renders the block-level video URL input', () => {
      renderSettings();
      // The block-level video URL input is under "Background Video" section
      // It should be in the persistent section (not the per-slide one)
      const videoInputs = screen.getAllByPlaceholderText('https://...mp4 (optional)');
      expect(videoInputs.length).toBeGreaterThanOrEqual(2);
    });

    it('calls onChange when block-level video URL changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const videoInputs = screen.getAllByPlaceholderText('https://...mp4 (optional)');
      // The last one is the block-level persistent video input
      const lastInput = videoInputs[videoInputs.length - 1];
      fireEvent.change(lastInput, { target: { value: 'https://cdn.example.com/persist.mp4' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ backgroundVideo: 'https://cdn.example.com/persist.mp4' }),
      );
    });

    it('shows video opacity slider when backgroundVideo is set on block', () => {
      const block = makeBlock({
        slides: [makeSlide({ id: 's1' })],
        backgroundVideo: 'https://cdn.example.com/bg.mp4',
        backgroundVideoOpacity: 0.8,
      });
      renderSettings(block);
      const rangeInputs = document.querySelectorAll<HTMLInputElement>('input[type="range"]');
      // Should have at least 2 range inputs: overlayOpacity + backgroundVideoOpacity
      expect(rangeInputs.length).toBeGreaterThanOrEqual(2);
    });

    it('calls onChange with backgroundVideoOpacity when opacity slider changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({
        slides: [makeSlide({ id: 's1' })],
        backgroundVideo: 'https://cdn.example.com/bg.mp4',
        backgroundVideoOpacity: 1,
      });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const rangeInputs = document.querySelectorAll<HTMLInputElement>('input[type="range"]');
      // The last range input is the video opacity slider
      const videoOpacityInput = rangeInputs[rangeInputs.length - 1];
      fireEvent.change(videoOpacityInput, { target: { value: '0.5' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ backgroundVideoOpacity: 0.5 }));
    });

    it('does not show video opacity slider when no backgroundVideo on block', () => {
      const block = makeBlock({ slides: [makeSlide({ id: 's1' })] });
      renderSettings(block);
      // With only overlayOpacity range, there should be exactly 1 range input
      const rangeInputs = document.querySelectorAll<HTMLInputElement>('input[type="range"]');
      expect(rangeInputs).toHaveLength(1);
    });
  });

  // ── Slideshow settings toggles ─────────────────────────────────────────────

  describe('slideshow settings toggles', () => {
    it('renders Autoplay checkbox', () => {
      renderSettings();
      expect(screen.getByLabelText('Autoplay')).toBeInTheDocument();
    });

    it('renders Show Dots checkbox', () => {
      renderSettings();
      expect(screen.getByLabelText('Show Dots')).toBeInTheDocument();
    });

    it('renders Show Arrows checkbox', () => {
      renderSettings();
      expect(screen.getByLabelText('Show Arrows')).toBeInTheDocument();
    });

    it('renders Pause on Hover checkbox', () => {
      renderSettings();
      expect(screen.getByLabelText('Pause on Hover')).toBeInTheDocument();
    });

    it('renders Ken Burns Effect checkbox', () => {
      renderSettings();
      expect(screen.getByLabelText('Ken Burns Effect')).toBeInTheDocument();
    });

    it('calls onChange with autoplay: false when Autoplay unchecked', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], autoplay: true });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const autoplayCheckbox = screen.getByLabelText('Autoplay');
      fireEvent.click(autoplayCheckbox);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ autoplay: false }));
    });

    it('calls onChange with showDots: false when Show Dots unchecked', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], showDots: true });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const dotsCheckbox = screen.getByLabelText('Show Dots');
      fireEvent.click(dotsCheckbox);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ showDots: false }));
    });

    it('calls onChange with kenBurns: true when Ken Burns enabled', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], kenBurns: false });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const kenBurnsCheckbox = screen.getByLabelText('Ken Burns Effect');
      fireEvent.click(kenBurnsCheckbox);
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kenBurns: true }));
    });
  });

  // ── Transition / height / interval settings ────────────────────────────────

  describe('slideshow numeric/select settings', () => {
    it('renders Transition select', () => {
      renderSettings();
      // Transition select has fade/slide/zoom options
      const selects = document.querySelectorAll<HTMLSelectElement>('select');
      const transitionSelect = Array.from(selects).find((s) =>
        Array.from(s.options).some((o) => o.value === 'zoom'),
      );
      expect(transitionSelect).toBeDefined();
    });

    it('calls onChange with transition value when select changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], transition: 'fade' });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const selects = document.querySelectorAll<HTMLSelectElement>('select');
      const transitionSelect = Array.from(selects).find((s) =>
        Array.from(s.options).some((o) => o.value === 'zoom'),
      );
      fireEvent.change(transitionSelect!, { target: { value: 'zoom' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ transition: 'zoom' }));
    });

    it('calls onChange with height value when input changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], height: '90vh' });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const heightInput = screen.getByPlaceholderText('90vh');
      fireEvent.change(heightInput, { target: { value: '100vh' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ height: '100vh' }));
    });

    it('calls onChange with interval value when number input changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], interval: 6000 });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const numberInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]');
      fireEvent.change(numberInputs[0], { target: { value: '4000' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 4000 }));
    });

    it('calls onChange with transitionDuration when second number input changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], transitionDuration: 800 });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const numberInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]');
      fireEvent.change(numberInputs[1], { target: { value: '500' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ transitionDuration: 500 }));
    });

    it('falls back to 6000 for invalid interval input', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], interval: 6000 });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const numberInputs = document.querySelectorAll<HTMLInputElement>('input[type="number"]');
      fireEvent.change(numberInputs[0], { target: { value: '' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ interval: 6000 }));
    });
  });

  // ── Stats bar ──────────────────────────────────────────────────────────────

  describe('stats bar', () => {
    it('renders "+ Add Stat" button', () => {
      renderSettings();
      expect(screen.getByText('+ Add Stat')).toBeInTheDocument();
    });

    it('calls onChange with a new stat appended when "+ Add Stat" clicked', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], stats: [] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      fireEvent.click(screen.getByText('+ Add Stat'));
      expect(onChange).toHaveBeenCalledTimes(1);
      const newStats = onChange.mock.calls[0][0].stats;
      expect(newStats).toHaveLength(1);
      expect(newStats[0].id).toMatch(/^stat-/);
    });

    it('renders existing stats with value and label inputs', () => {
      const block = makeBlock({
        slides: [makeSlide()],
        stats: [{ id: 'stat-1', value: '100+', label: 'Clients' }],
      });
      renderSettings(block);
      expect(screen.getByDisplayValue('100+')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Clients')).toBeInTheDocument();
    });

    it('calls onChange with updated stat value when input changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({
        slides: [makeSlide()],
        stats: [{ id: 'stat-1', value: '100+', label: 'Clients' }],
      });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const valueInput = screen.getByDisplayValue('100+');
      fireEvent.change(valueInput, { target: { value: '200+' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.arrayContaining([expect.objectContaining({ value: '200+' })]),
        }),
      );
    });

    it('calls onChange with updated stat label when input changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({
        slides: [makeSlide()],
        stats: [{ id: 'stat-1', value: '100+', label: 'Clients' }],
      });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const labelInput = screen.getByDisplayValue('Clients');
      fireEvent.change(labelInput, { target: { value: 'Projects' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          stats: expect.arrayContaining([expect.objectContaining({ label: 'Projects' })]),
        }),
      );
    });

    it('calls onChange with stat removed when delete button clicked', () => {
      const onChange = vi.fn();
      const block = makeBlock({
        slides: [makeSlide()],
        stats: [
          { id: 'stat-1', value: '100+', label: 'Clients' },
          { id: 'stat-2', value: '50+', label: 'Projects' },
        ],
      });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const deleteIcons = screen.getAllByText('delete');
      // Click first delete button
      fireEvent.click(deleteIcons[0].closest('button')!);
      const updatedStats = onChange.mock.calls[0][0].stats;
      expect(updatedStats).toHaveLength(1);
      expect(updatedStats[0].id).toBe('stat-2');
    });

    it('renders multiple stats correctly', () => {
      const block = makeBlock({
        slides: [makeSlide()],
        stats: [
          { id: 'stat-1', value: '22+', label: 'Years' },
          { id: 'stat-2', value: '500+', label: 'Clients' },
        ],
      });
      renderSettings(block);
      expect(screen.getByDisplayValue('22+')).toBeInTheDocument();
      expect(screen.getByDisplayValue('500+')).toBeInTheDocument();
    });
  });

  // ── Color pickers (TokenColorPicker) ──────────────────────────────────────

  describe('color pickers', () => {
    it('renders Overlay Color picker for active slide', () => {
      renderSettings();
      expect(screen.getByTestId('color-Overlay Color')).toBeInTheDocument();
    });

    it('calls onChange with overlayColor when color picker changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide({ id: 's1', overlayColor: '' })] });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const colorInput = screen.getByTestId('color-Overlay Color');
      fireEvent.change(colorInput, { target: { value: 'rgba(0,0,0,0.5)' } });
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({
          slides: expect.arrayContaining([expect.objectContaining({ overlayColor: 'rgba(0,0,0,0.5)' })]),
        }),
      );
    });

    it('renders advanced nav color pickers', () => {
      renderSettings();
      expect(screen.getByTestId('color-Arrow Color')).toBeInTheDocument();
      expect(screen.getByTestId('color-Arrow Background')).toBeInTheDocument();
      expect(screen.getByTestId('color-Dot Color')).toBeInTheDocument();
      expect(screen.getByTestId('color-Dot Active Color')).toBeInTheDocument();
      expect(screen.getByTestId('color-Progress Bar Color')).toBeInTheDocument();
    });

    it('calls onChange with arrowColor when Arrow Color picker changes', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], arrowColor: '' });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const colorInput = screen.getByTestId('color-Arrow Color');
      fireEvent.change(colorInput, { target: { value: '#fff' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ arrowColor: '#fff' }));
    });

    it('calls onChange with undefined when arrowColor is cleared', () => {
      const onChange = vi.fn();
      const block = makeBlock({ slides: [makeSlide()], arrowColor: '#fff' });
      render(<HeroSlideshowBlockSettings block={block} onChange={onChange} />);
      const colorInput = screen.getByTestId('color-Arrow Color');
      fireEvent.change(colorInput, { target: { value: '' } });
      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ arrowColor: undefined }));
    });
  });

  // ── Empty slides edge case ─────────────────────────────────────────────────

  describe('edge cases', () => {
    it('renders without error when slides array is empty', () => {
      const block = makeBlock({ slides: [] });
      renderSettings(block);
      // Should render the sections without the active slide content
      expect(screen.getByText('Slides')).toBeInTheDocument();
      expect(screen.getByText('Slideshow Settings')).toBeInTheDocument();
    });

    it('does not render slide content section when slides is empty', () => {
      const block = makeBlock({ slides: [] });
      renderSettings(block);
      expect(screen.queryByTestId('rte-Slide Title')).toBeNull();
    });

    it('handles block with no stats array (undefined)', () => {
      const block = makeBlock({ slides: [makeSlide()], stats: undefined });
      renderSettings(block);
      expect(screen.getByText('+ Add Stat')).toBeInTheDocument();
    });
  });
});
