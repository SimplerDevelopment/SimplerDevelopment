/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, screen, within, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Heavy-dep mocks
// ---------------------------------------------------------------------------

// MediaPicker — minimal input that surfaces value + onChange
vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value, onChange, label }: any) => (
    <div data-testid={`media-picker-${label || 'unnamed'}`}>
      <input
        data-testid={`mp-input-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

// TokenColorPicker
vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({ value, onChange, label, placeholder }: any) => (
    <label data-testid={`color-wrap-${label || placeholder || 'unnamed'}`}>
      <span>{label}</span>
      <input
        data-testid={`color-${label || placeholder || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  ),
}));

// RichTextEditable
vi.mock('@/components/blocks/visual/RichTextEditable', () => ({
  RichTextEditable: ({ html, onChange, placeholder, singleLine }: any) => (
    <textarea
      data-testid={`rte-${placeholder || 'rte'}`}
      data-single-line={singleLine ? 'true' : 'false'}
      value={html || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// Stub the imported child settings panels — SectionsPanel just dispatches to them
vi.mock('@/components/blocks/visual/block-settings/panels/HeroSettings', () => ({
  HeroBlockSettings: ({ block, currentViewport }: any) => (
    <div data-testid="hero-settings" data-block-id={block?.id} data-viewport={currentViewport} />
  ),
}));

vi.mock('@/components/blocks/visual/block-settings/panels/HeroSlideshowSettings', () => ({
  HeroSlideshowBlockSettings: ({ block }: any) => (
    <div data-testid="hero-slideshow-settings" data-block-id={block?.id} />
  ),
}));

vi.mock('@/components/blocks/visual/block-settings/panels/SiteFooterSettings', () => ({
  SiteFooterBlockSettings: ({ block }: any) => (
    <div data-testid="site-footer-settings" data-block-id={block?.id} />
  ),
}));

// Lazy import after mocks
import { SectionsPanel } from '@/components/blocks/visual/block-settings/panels/SectionsPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOnChange<T = any>() {
  return vi.fn<(updates: Partial<T>) => void>();
}

function renderPanel(block: any, onChange = makeOnChange(), viewport: any = 'desktop') {
  const utils = render(
    <SectionsPanel block={block} onChange={onChange} currentViewport={viewport} />
  );
  return { ...utils, onChange };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SectionsPanel — dispatcher', () => {
  it('renders nothing for unknown block type', () => {
    const { container } = renderPanel({ id: 'b1', type: 'unknown-type' });
    expect(container.firstChild).toBeNull();
  });

  it('dispatches hero blocks to HeroBlockSettings stub', () => {
    renderPanel({ id: 'h1', type: 'hero', title: 'X' }, undefined, 'tablet');
    const el = screen.getByTestId('hero-settings');
    expect(el).toBeTruthy();
    expect(el.getAttribute('data-block-id')).toBe('h1');
    expect(el.getAttribute('data-viewport')).toBe('tablet');
  });

  it('dispatches hero-slideshow blocks to HeroSlideshowBlockSettings stub', () => {
    renderPanel({ id: 'hs1', type: 'hero-slideshow', slides: [] });
    expect(screen.getByTestId('hero-slideshow-settings')).toBeTruthy();
  });

  it('dispatches site-footer blocks to SiteFooterBlockSettings stub', () => {
    renderPanel({ id: 'sf1', type: 'site-footer' });
    expect(screen.getByTestId('site-footer-settings')).toBeTruthy();
  });
});

describe('SectionsPanel — CTA block', () => {
  const baseCta = {
    id: 'cta1',
    type: 'cta',
    title: 'Hello',
    description: 'Desc',
    primaryButtonText: 'Go',
    primaryButtonUrl: 'https://go',
    backgroundStyle: 'gradient',
  };

  it('renders title via RichTextEditable and forwards onChange', () => {
    const { onChange } = renderPanel(baseCta);
    const rte = screen.getByTestId('rte-CTA Title') as HTMLTextAreaElement;
    expect(rte.value).toBe('Hello');
    fireEvent.change(rte, { target: { value: 'New Title' } });
    expect(onChange).toHaveBeenCalledWith({ title: 'New Title' });
  });

  it('emits undefined for empty description (collapses to undefined)', () => {
    const { onChange } = renderPanel(baseCta);
    const descRte = screen.getByTestId('rte-Optional description') as HTMLTextAreaElement;
    fireEvent.change(descRte, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ description: undefined });
  });

  it('keeps non-empty description string in onChange', () => {
    const { onChange } = renderPanel(baseCta);
    const descRte = screen.getByTestId('rte-Optional description') as HTMLTextAreaElement;
    fireEvent.change(descRte, { target: { value: 'NEW' } });
    expect(onChange).toHaveBeenCalledWith({ description: 'NEW' });
  });

  it('changes backgroundStyle via select', () => {
    const { onChange } = renderPanel(baseCta);
    const select = screen.getByDisplayValue('Gradient') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'solid' } });
    expect(onChange).toHaveBeenCalledWith({ backgroundStyle: 'solid' });
  });

  it('updates primaryButtonText / Url and secondary button fields', () => {
    const { onChange } = renderPanel(baseCta);
    const inputs = screen.getAllByRole('textbox') as HTMLInputElement[];
    // primary text + URL + secondary text + secondary URL = 4 text-type inputs
    // (RTEs are textareas, not type=text)
    const textOnly = inputs.filter(i => i.type === 'text');
    expect(textOnly.length).toBeGreaterThanOrEqual(4);
    fireEvent.change(textOnly[0], { target: { value: 'BTN' } });
    fireEvent.change(textOnly[1], { target: { value: 'http://btn' } });
    fireEvent.change(textOnly[2], { target: { value: 'BTN2' } });
    fireEvent.change(textOnly[3], { target: { value: 'http://btn2' } });
    expect(onChange).toHaveBeenCalledWith({ primaryButtonText: 'BTN' });
    expect(onChange).toHaveBeenCalledWith({ primaryButtonUrl: 'http://btn' });
    expect(onChange).toHaveBeenCalledWith({ secondaryButtonText: 'BTN2' });
    expect(onChange).toHaveBeenCalledWith({ secondaryButtonUrl: 'http://btn2' });
  }, 15000);

  it('defaults backgroundStyle to gradient when block.backgroundStyle missing', () => {
    const noBg = { ...baseCta, backgroundStyle: undefined };
    renderPanel(noBg);
    const select = screen.getByDisplayValue('Gradient') as HTMLSelectElement;
    expect(select.value).toBe('gradient');
  });
});

describe('SectionsPanel — ServicesGrid block', () => {
  const baseServices = {
    id: 'sg1',
    type: 'services-grid',
    title: 'T',
    description: 'D',
    overline: 'O',
    columns: 3,
    accentColor: '',
  };

  it('renders overline / title / description RTEs with starting values', () => {
    renderPanel(baseServices);
    expect((screen.getByTestId('rte-OUR SERVICES') as HTMLTextAreaElement).value).toBe('O');
    expect((screen.getByTestId('rte-Section title...') as HTMLTextAreaElement).value).toBe('T');
    expect((screen.getByTestId('rte-Section description...') as HTMLTextAreaElement).value).toBe('D');
  });

  it('updates columns via select (parses to number)', () => {
    const { onChange } = renderPanel(baseServices);
    const select = screen.getByDisplayValue('3 Columns') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 4 });
  });

  it('forwards accentColor changes via TokenColorPicker', () => {
    const { onChange } = renderPanel(baseServices);
    const colorInput = screen.getByTestId('color-Accent Color') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: 'token.brand' } });
    expect(onChange).toHaveBeenCalledWith({ accentColor: 'token.brand' });
  });

  it('emits undefined when clearing accent color', () => {
    const { onChange } = renderPanel({ ...baseServices, accentColor: 'foo' });
    const colorInput = screen.getByTestId('color-Accent Color') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ accentColor: undefined });
  });
});

describe('SectionsPanel — Stats block', () => {
  it('updates columns', () => {
    const { onChange } = renderPanel({ id: 's1', type: 'stats', title: '', columns: 3 });
    const select = screen.getByDisplayValue('3 Columns') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 2 });
  });

  it('falls back to default columns=3 when not set', () => {
    renderPanel({ id: 's1', type: 'stats', title: '' });
    const select = screen.getByDisplayValue('3 Columns') as HTMLSelectElement;
    expect(select.value).toBe('3');
  });
});

describe('SectionsPanel — Testimonial block', () => {
  const baseTestimonial = {
    id: 't1',
    type: 'testimonial',
    quote: 'Q',
    author: 'A',
    role: 'R',
    company: 'C',
  };

  it('updates role and company via input', () => {
    const { onChange } = renderPanel(baseTestimonial);
    const role = screen.getByPlaceholderText('Role...') as HTMLInputElement;
    const company = screen.getByPlaceholderText('Company...') as HTMLInputElement;
    fireEvent.change(role, { target: { value: 'CEO' } });
    fireEvent.change(company, { target: { value: 'Acme' } });
    expect(onChange).toHaveBeenCalledWith({ role: 'CEO' });
    expect(onChange).toHaveBeenCalledWith({ company: 'Acme' });
  });

  it('shows avatar selector button when no avatar set', () => {
    renderPanel(baseTestimonial);
    expect(screen.getByText('Click to select avatar')).toBeTruthy();
  });

  it('shows Change + Remove buttons when avatar present', () => {
    const { onChange } = renderPanel({ ...baseTestimonial, avatar: 'https://av/i.png' });
    expect(screen.getByText('Change Avatar')).toBeTruthy();
    const remove = screen.getByText('Remove');
    fireEvent.click(remove);
    expect(onChange).toHaveBeenCalledWith({ avatar: '' });
  });

  it('opens MediaPicker modal when select-avatar button clicked', () => {
    renderPanel(baseTestimonial);
    // initially closed — no picker rendered
    expect(screen.queryByTestId('media-picker-Select Avatar')).toBeNull();
    fireEvent.click(screen.getByText('Click to select avatar'));
    expect(screen.getByTestId('media-picker-Select Avatar')).toBeTruthy();
  });

  it('selecting media closes picker and emits avatar URL', () => {
    const { onChange } = renderPanel(baseTestimonial);
    fireEvent.click(screen.getByText('Click to select avatar'));
    const mpInput = screen.getByTestId('mp-input-Select Avatar') as HTMLInputElement;
    fireEvent.change(mpInput, { target: { value: 'https://uploaded.png' } });
    expect(onChange).toHaveBeenCalledWith({ avatar: 'https://uploaded.png' });
    // modal closes
    expect(screen.queryByTestId('media-picker-Select Avatar')).toBeNull();
  });

  it('clicking modal backdrop closes picker', () => {
    renderPanel(baseTestimonial);
    fireEvent.click(screen.getByText('Click to select avatar'));
    expect(screen.getByTestId('media-picker-Select Avatar')).toBeTruthy();
    // backdrop is the overlay div; find it via the modal's parent
    const backdrop = screen.getByTestId('media-picker-Select Avatar')
      .closest('.fixed') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(screen.queryByTestId('media-picker-Select Avatar')).toBeNull();
  });
});

describe('SectionsPanel — SocialLinks block', () => {
  const baseSocial = {
    id: 'sl1',
    type: 'social-links',
    iconSize: 32,
    alignment: 'center',
    links: [{ platform: 'facebook', url: 'https://fb' }],
  };

  it('updates iconSize and alignment', () => {
    const { onChange } = renderPanel(baseSocial);
    const sizeSelect = screen.getByDisplayValue('32') as HTMLSelectElement;
    fireEvent.change(sizeSelect, { target: { value: '40' } });
    expect(onChange).toHaveBeenCalledWith({ iconSize: 40 });

    const alignSelect = screen.getByDisplayValue('Center') as HTMLSelectElement;
    fireEvent.change(alignSelect, { target: { value: 'right' } });
    expect(onChange).toHaveBeenCalledWith({ alignment: 'right' });
  });

  it('updates an existing link URL', () => {
    const { onChange } = renderPanel(baseSocial);
    const url = screen.getByPlaceholderText('https://') as HTMLInputElement;
    fireEvent.change(url, { target: { value: 'https://changed' } });
    expect(onChange).toHaveBeenCalledWith({
      links: [{ platform: 'facebook', url: 'https://changed' }],
    });
  });

  it('changes the platform of an existing link', () => {
    const { onChange } = renderPanel(baseSocial);
    // The platform select holds the platform value
    const platformSelect = screen.getByDisplayValue('facebook') as HTMLSelectElement;
    fireEvent.change(platformSelect, { target: { value: 'twitter' } });
    expect(onChange).toHaveBeenCalledWith({
      links: [{ platform: 'twitter', url: 'https://fb' }],
    });
  });

  it('removes a link', () => {
    const { onChange } = renderPanel(baseSocial);
    const removeBtn = screen.getByTitle('Remove link');
    fireEvent.click(removeBtn);
    expect(onChange).toHaveBeenCalledWith({ links: [] });
  });

  it('adds a new link', () => {
    const { onChange } = renderPanel({ ...baseSocial, links: [] });
    fireEvent.click(screen.getByText('+ Add Link'));
    expect(onChange).toHaveBeenCalledWith({
      links: [{ platform: 'facebook', url: '' }],
    });
  });

  it('defaults iconSize to 32 when not set', () => {
    renderPanel({ ...baseSocial, iconSize: undefined });
    expect((screen.getByDisplayValue('32') as HTMLSelectElement).value).toBe('32');
  });
});

describe('SectionsPanel — LogoStrip block', () => {
  const baseLogoStrip = {
    id: 'ls1',
    type: 'logo-strip',
    overline: 'TRUSTED',
    columns: 6,
    gap: 'lg',
    alignment: 'center',
    logoHeight: '40px',
    grayscale: true,
    logos: [{ id: 'l1', imageUrl: 'http://i.png', alt: 'Acme', link: 'http://a' }],
  };

  it('updates overline (collapses empty to undefined)', () => {
    const { onChange } = renderPanel(baseLogoStrip);
    const overline = screen.getByPlaceholderText('e.g. TRUSTED BY 100+ TEAMS') as HTMLInputElement;
    fireEvent.change(overline, { target: { value: 'NEW' } });
    expect(onChange).toHaveBeenCalledWith({ overline: 'NEW' });
    fireEvent.change(overline, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ overline: undefined });
  });

  it('updates columns/gap/alignment/logoHeight', () => {
    const { onChange } = renderPanel(baseLogoStrip);
    const cols = screen.getByDisplayValue('6') as HTMLSelectElement;
    fireEvent.change(cols, { target: { value: '8' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 8 });

    const gap = screen.getByDisplayValue('Large') as HTMLSelectElement;
    fireEvent.change(gap, { target: { value: 'sm' } });
    expect(onChange).toHaveBeenCalledWith({ gap: 'sm' });

    const align = screen.getByDisplayValue('Center') as HTMLSelectElement;
    fireEvent.change(align, { target: { value: 'left' } });
    expect(onChange).toHaveBeenCalledWith({ alignment: 'left' });

    const height = screen.getByPlaceholderText('40px') as HTMLInputElement;
    fireEvent.change(height, { target: { value: '60px' } });
    expect(onChange).toHaveBeenCalledWith({ logoHeight: '60px' });
  });

  it('toggles grayscale', () => {
    const { onChange } = renderPanel(baseLogoStrip);
    const cb = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onChange).toHaveBeenCalledWith({ grayscale: false });
  });

  it('updates a logo entry (imageUrl, alt, link)', () => {
    const { onChange } = renderPanel(baseLogoStrip);
    const img = screen.getByPlaceholderText('Image URL') as HTMLInputElement;
    const alt = screen.getByPlaceholderText('Alt text') as HTMLInputElement;
    const link = screen.getByPlaceholderText('Link URL (optional)') as HTMLInputElement;
    fireEvent.change(img, { target: { value: 'http://new.png' } });
    fireEvent.change(alt, { target: { value: 'NewCo' } });
    fireEvent.change(link, { target: { value: 'http://new' } });
    expect(onChange).toHaveBeenCalledWith({
      logos: [{ id: 'l1', imageUrl: 'http://new.png', alt: 'Acme', link: 'http://a' }],
    });
    expect(onChange).toHaveBeenCalledWith({
      logos: [{ id: 'l1', imageUrl: 'http://i.png', alt: 'NewCo', link: 'http://a' }],
    });
    expect(onChange).toHaveBeenCalledWith({
      logos: [{ id: 'l1', imageUrl: 'http://i.png', alt: 'Acme', link: 'http://new' }],
    });
  });

  it('clearing logo link emits undefined', () => {
    const { onChange } = renderPanel(baseLogoStrip);
    const link = screen.getByPlaceholderText('Link URL (optional)') as HTMLInputElement;
    fireEvent.change(link, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({
      logos: [{ id: 'l1', imageUrl: 'http://i.png', alt: 'Acme', link: undefined }],
    });
  });

  it('removes a logo', () => {
    const { onChange } = renderPanel(baseLogoStrip);
    fireEvent.click(screen.getByText('Remove'));
    expect(onChange).toHaveBeenCalledWith({ logos: [] });
  });

  it('adds a new logo', () => {
    const { onChange } = renderPanel({ ...baseLogoStrip, logos: [] });
    fireEvent.click(screen.getByText('+ Add Logo'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const arg = (onChange as any).mock.calls[0][0];
    expect(arg.logos).toHaveLength(1);
    expect(arg.logos[0]).toMatchObject({ imageUrl: '', alt: '' });
    expect(typeof arg.logos[0].id).toBe('string');
  });
});

describe('SectionsPanel — MetricCards block', () => {
  const baseMetricCards = {
    id: 'mc1',
    type: 'metric-cards',
    overline: 'PROOF',
    title: 'T',
    description: 'D',
    columns: 4,
    accentColor: '',
    metrics: [{ id: 'm1', value: '99%', label: 'Up' }],
  };

  it('updates columns, logoColumnWidth, labelMaxWidth', () => {
    const { onChange } = renderPanel(baseMetricCards);
    const cols = screen.getByDisplayValue('4') as HTMLSelectElement;
    fireEvent.change(cols, { target: { value: '3' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 3 });

    const lcw = screen.getByPlaceholderText('auto, 240px, 16rem…') as HTMLInputElement;
    fireEvent.change(lcw, { target: { value: '200px' } });
    expect(onChange).toHaveBeenCalledWith({ logoColumnWidth: '200px' });

    const lmw = screen.getByPlaceholderText('32rem, 480px…') as HTMLInputElement;
    fireEvent.change(lmw, { target: { value: '400px' } });
    expect(onChange).toHaveBeenCalledWith({ labelMaxWidth: '400px' });
  });

  it('emits undefined when clearing logoColumnWidth', () => {
    const { onChange } = renderPanel({ ...baseMetricCards, logoColumnWidth: '200px' });
    const lcw = screen.getByPlaceholderText('auto, 240px, 16rem…') as HTMLInputElement;
    fireEvent.change(lcw, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ logoColumnWidth: undefined });
  });

  it('updates a metric value/label/institution/logo/link/linkText', () => {
    const { onChange } = renderPanel(baseMetricCards);
    fireEvent.change(screen.getByPlaceholderText('Big value e.g. "83%"'), { target: { value: '88%' } });
    fireEvent.change(screen.getByPlaceholderText('Small label'), { target: { value: 'Better' } });
    fireEvent.change(screen.getByPlaceholderText('Institution (optional)'), { target: { value: 'UCLA' } });
    fireEvent.change(screen.getByPlaceholderText('Institution logo URL (optional)'), { target: { value: 'http://ucla.png' } });
    fireEvent.change(screen.getByPlaceholderText('Link URL (optional)'), { target: { value: 'http://case' } });
    fireEvent.change(screen.getByPlaceholderText('CTA text (default "Case Study")'), { target: { value: 'Read more' } });

    const calls = (onChange as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContainEqual({ metrics: [{ id: 'm1', value: '88%', label: 'Up' }] });
    expect(calls).toContainEqual({ metrics: [{ id: 'm1', value: '99%', label: 'Better' }] });
    expect(calls).toContainEqual({ metrics: [{ id: 'm1', value: '99%', label: 'Up', institution: 'UCLA' }] });
  });

  it('removes a metric and adds a new metric', () => {
    const { onChange } = renderPanel(baseMetricCards);
    fireEvent.click(screen.getByText('Remove'));
    expect(onChange).toHaveBeenCalledWith({ metrics: [] });

    fireEvent.click(screen.getByText('+ Add Metric'));
    const last = (onChange as any).mock.calls.pop()[0];
    expect(last.metrics).toHaveLength(2);
    expect(last.metrics[1]).toMatchObject({ value: '', label: '' });
  });
});

describe('SectionsPanel — FlipCardGrid block', () => {
  const baseFlipCardGrid = {
    id: 'fc1',
    type: 'flip-card-grid',
    overline: 'WHY',
    title: 'T',
    description: 'D',
    columns: 3,
    cardHeight: '280px',
    flipTrigger: 'hover',
    flipAxis: 'horizontal',
    accentColor: '',
    cards: [{ id: 'c1', frontTitle: 'Front', backText: 'Back' }],
  };

  it('updates columns, cardHeight, flipTrigger, flipAxis', () => {
    const { onChange } = renderPanel(baseFlipCardGrid);
    const cols = screen.getByDisplayValue('3') as HTMLSelectElement;
    fireEvent.change(cols, { target: { value: '4' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 4 });

    fireEvent.change(screen.getByPlaceholderText('280px'), { target: { value: '320px' } });
    expect(onChange).toHaveBeenCalledWith({ cardHeight: '320px' });

    fireEvent.change(screen.getByDisplayValue('Hover'), { target: { value: 'click' } });
    expect(onChange).toHaveBeenCalledWith({ flipTrigger: 'click' });

    fireEvent.change(screen.getByDisplayValue('Horizontal (Y-axis)'), { target: { value: 'vertical' } });
    expect(onChange).toHaveBeenCalledWith({ flipAxis: 'vertical' });
  });

  it('updates frontTitle, backText, and back link fields of a card', () => {
    const { onChange } = renderPanel(baseFlipCardGrid);
    fireEvent.change(screen.getByPlaceholderText('Front title'), { target: { value: 'NewFront' } });
    fireEvent.change(screen.getByPlaceholderText('Back text'), { target: { value: 'NewBack' } });
    fireEvent.change(screen.getByPlaceholderText('Front subtitle (optional)'), { target: { value: 'sub' } });
    fireEvent.change(screen.getByPlaceholderText('Material Icon name (e.g. trending_up)'), { target: { value: 'star' } });
    fireEvent.change(screen.getByPlaceholderText('Front image URL (optional)'), { target: { value: 'http://f.png' } });
    fireEvent.change(screen.getByPlaceholderText('Back link URL (optional)'), { target: { value: 'http://b' } });
    fireEvent.change(screen.getByPlaceholderText('Back link text (optional)'), { target: { value: 'Learn' } });

    const calls = (onChange as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContainEqual({
      cards: [{ id: 'c1', frontTitle: 'NewFront', backText: 'Back' }],
    });
    expect(calls).toContainEqual({
      cards: [{ id: 'c1', frontTitle: 'Front', backText: 'NewBack' }],
    });
    // Optional fields collapse correctly when set
    expect(calls).toContainEqual({
      cards: [{ id: 'c1', frontTitle: 'Front', backText: 'Back', frontSubtitle: 'sub' }],
    });
  });

  it('removes a card and adds a new card', () => {
    const { onChange } = renderPanel(baseFlipCardGrid);
    fireEvent.click(screen.getByText('Remove'));
    expect(onChange).toHaveBeenCalledWith({ cards: [] });

    fireEvent.click(screen.getByText('+ Add Card'));
    const last = (onChange as any).mock.calls.pop()[0];
    expect(last.cards).toHaveLength(2);
    expect(last.cards[1]).toMatchObject({ frontTitle: '', backText: '' });
  });
});

describe('SectionsPanel — Timeline block', () => {
  const baseTimeline = {
    id: 'tl1',
    type: 'timeline',
    overline: 'PROCESS',
    title: 'T',
    subtitle: 'S',
    layout: 'alternating',
    steps: [{ id: 's1', title: 'Step', description: 'Desc', number: '01' }],
  };

  it('changes layout selector', () => {
    const { onChange } = renderPanel(baseTimeline);
    const layout = screen.getByDisplayValue('Alternating (zigzag)') as HTMLSelectElement;
    fireEvent.change(layout, { target: { value: 'left' } });
    expect(onChange).toHaveBeenCalledWith({ layout: 'left' });
  });

  it('updates step number / icon / title / description', () => {
    const { onChange } = renderPanel(baseTimeline);
    fireEvent.change(screen.getByPlaceholderText('Number (e.g. 01) — optional'), { target: { value: '02' } });
    fireEvent.change(screen.getByPlaceholderText('Material Icon name (optional, alt to number)'), { target: { value: 'rocket' } });
    fireEvent.change(screen.getByPlaceholderText('Step title'), { target: { value: 'New' } });
    fireEvent.change(screen.getByPlaceholderText('Step description'), { target: { value: 'New desc' } });

    const calls = (onChange as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls).toContainEqual({ steps: [{ id: 's1', title: 'Step', description: 'Desc', number: '02' }] });
    expect(calls).toContainEqual({ steps: [{ id: 's1', title: 'New', description: 'Desc', number: '01' }] });
    expect(calls).toContainEqual({ steps: [{ id: 's1', title: 'Step', description: 'New desc', number: '01' }] });
  });

  it('removes a step and adds a new step', () => {
    const { onChange } = renderPanel(baseTimeline);
    fireEvent.click(screen.getByText('Remove'));
    expect(onChange).toHaveBeenCalledWith({ steps: [] });

    fireEvent.click(screen.getByText('+ Add Step'));
    const last = (onChange as any).mock.calls.pop()[0];
    expect(last.steps).toHaveLength(2);
    expect(last.steps[1]).toMatchObject({ title: '', description: '' });
  });

  it('emits undefined when number is cleared', () => {
    const { onChange } = renderPanel(baseTimeline);
    fireEvent.change(screen.getByPlaceholderText('Number (e.g. 01) — optional'), { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({
      steps: [{ id: 's1', title: 'Step', description: 'Desc', number: undefined }],
    });
  });
});

describe('SectionsPanel — TeamShowcase block', () => {
  const baseTeamShowcase = {
    id: 'ts1',
    type: 'team-showcase',
    overline: 'TEAM',
    title: 'T',
    subtitle: 'S',
    photoFilter: '',
    members: [{ id: 'p1', name: 'Alice', title: 'CEO', photo: 'http://a.png', bio: 'Bio' }],
  };

  it('updates photoFilter via input', () => {
    const { onChange } = renderPanel(baseTeamShowcase);
    const filter = screen.getByPlaceholderText('e.g. sepia(0.08)') as HTMLInputElement;
    fireEvent.change(filter, { target: { value: 'sepia(0.2)' } });
    expect(onChange).toHaveBeenCalledWith({ photoFilter: 'sepia(0.2)' });
  });

  it('emits undefined when photoFilter is cleared', () => {
    const { onChange } = renderPanel({ ...baseTeamShowcase, photoFilter: 'sepia(0.2)' });
    const filter = screen.getByPlaceholderText('e.g. sepia(0.08)') as HTMLInputElement;
    fireEvent.change(filter, { target: { value: '' } });
    expect(onChange).toHaveBeenCalledWith({ photoFilter: undefined });
  });

  it('updates member name/title/credentials/photo/bio', () => {
    const { onChange } = renderPanel(baseTeamShowcase);
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'CTO' } });
    fireEvent.change(screen.getByPlaceholderText('Credentials (optional)'), { target: { value: 'PhD' } });
    fireEvent.change(screen.getByPlaceholderText('Photo URL'), { target: { value: 'http://b.png' } });
    fireEvent.change(screen.getByPlaceholderText('Bio'), { target: { value: 'newbio' } });

    const calls = (onChange as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.find((c: any) => c.members?.[0]?.name === 'Bob')).toBeTruthy();
    expect(calls.find((c: any) => c.members?.[0]?.title === 'CTO')).toBeTruthy();
    expect(calls.find((c: any) => c.members?.[0]?.credentials === 'PhD')).toBeTruthy();
    expect(calls.find((c: any) => c.members?.[0]?.photo === 'http://b.png')).toBeTruthy();
    expect(calls.find((c: any) => c.members?.[0]?.bio === 'newbio')).toBeTruthy();
  });

  it('parses comma-separated specialties into array', () => {
    const { onChange } = renderPanel(baseTeamShowcase);
    fireEvent.change(screen.getByPlaceholderText('Specialties (comma-separated, optional)'), {
      target: { value: 'react, vite, ts' },
    });
    const last = (onChange as any).mock.calls.pop()[0];
    expect(last.members[0].specialties).toEqual(['react', 'vite', 'ts']);
  });

  it('emits specialties undefined when input is empty', () => {
    const { onChange } = renderPanel({
      ...baseTeamShowcase,
      members: [{ ...baseTeamShowcase.members[0], specialties: ['x'] }],
    });
    fireEvent.change(screen.getByPlaceholderText('Specialties (comma-separated, optional)'), {
      target: { value: '' },
    });
    const last = (onChange as any).mock.calls.pop()[0];
    expect(last.members[0].specialties).toBeUndefined();
  });

  it('removes a member and adds a new one', () => {
    const { onChange } = renderPanel(baseTeamShowcase);
    fireEvent.click(screen.getByText('Remove'));
    expect(onChange).toHaveBeenCalledWith({ members: [] });

    fireEvent.click(screen.getByText('+ Add Member'));
    const last = (onChange as any).mock.calls.pop()[0];
    expect(last.members).toHaveLength(2);
    expect(last.members[1]).toMatchObject({ name: '', title: '', photo: '', bio: '' });
  });
});

describe('SectionsPanel — TeamFlipGrid block', () => {
  const baseTeamFlip = {
    id: 'tf1',
    type: 'team-flip-grid',
    overline: 'MEET',
    title: 'T',
    subtitle: 'S',
    columns: 4,
    members: [
      { id: 'm1', name: 'A', title: 'T', photo: 'http://a.png', bio: 'b', question: 'Q', answer: 'A!' },
    ],
  };

  it('updates columns', () => {
    const { onChange } = renderPanel(baseTeamFlip);
    fireEvent.change(screen.getByDisplayValue('4'), { target: { value: '3' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 3 });
  });

  it('updates member name / title / photo / bio / question / answer', () => {
    const { onChange } = renderPanel(baseTeamFlip);
    fireEvent.change(screen.getByPlaceholderText('Name'), { target: { value: 'A2' } });
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'T2' } });
    fireEvent.change(screen.getByPlaceholderText('Photo URL'), { target: { value: 'http://x' } });
    fireEvent.change(screen.getByPlaceholderText('Bio (front)'), { target: { value: 'NB' } });
    fireEvent.change(screen.getByPlaceholderText('Question (back)'), { target: { value: 'Q2' } });
    fireEvent.change(screen.getByPlaceholderText('Answer (back)'), { target: { value: 'A2!' } });

    const calls = (onChange as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.find((c: any) => c.members?.[0]?.name === 'A2')).toBeTruthy();
    expect(calls.find((c: any) => c.members?.[0]?.question === 'Q2')).toBeTruthy();
    expect(calls.find((c: any) => c.members?.[0]?.answer === 'A2!')).toBeTruthy();
  });

  it('removes / adds a member', () => {
    const { onChange } = renderPanel(baseTeamFlip);
    fireEvent.click(screen.getByText('Remove'));
    expect(onChange).toHaveBeenCalledWith({ members: [] });

    fireEvent.click(screen.getByText('+ Add Member'));
    const last = (onChange as any).mock.calls.pop()[0];
    expect(last.members).toHaveLength(2);
    expect(last.members[1]).toMatchObject({ name: '', title: '', bio: '', photo: '', question: '', answer: '' });
  });
});

describe('SectionsPanel — BentoGrid block', () => {
  const baseBento = {
    id: 'bg1',
    type: 'bento-grid',
    overline: 'CAPS',
    title: 'T',
    subtitle: 'S',
    columns: 2,
    cards: [
      { id: 'cd1', title: 'C', lead: 'L', items: ['a', 'b'], variant: 'dark', span: 6 },
    ],
  };

  it('updates columns', () => {
    const { onChange } = renderPanel(baseBento);
    fireEvent.change(screen.getByDisplayValue('2'), { target: { value: '3' } });
    expect(onChange).toHaveBeenCalledWith({ columns: 3 });
  });

  it('updates card title and lead', () => {
    const { onChange } = renderPanel(baseBento);
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Title2' } });
    fireEvent.change(screen.getByPlaceholderText('Lead/question (optional)'), { target: { value: 'L2' } });

    const calls = (onChange as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.find((c: any) => c.cards?.[0]?.title === 'Title2')).toBeTruthy();
    expect(calls.find((c: any) => c.cards?.[0]?.lead === 'L2')).toBeTruthy();
  });

  it('parses items textarea (newline-separated) into array', () => {
    const { onChange } = renderPanel(baseBento);
    fireEvent.change(screen.getByPlaceholderText('Bullet items (one per line)'), {
      target: { value: 'one\ntwo\nthree' },
    });
    const last = (onChange as any).mock.calls.pop()[0];
    expect(last.cards[0].items).toEqual(['one', 'two', 'three']);
  });

  it('updates card link/linkText and clearing emits undefined', () => {
    const { onChange } = renderPanel(baseBento);
    fireEvent.change(screen.getByPlaceholderText('Link URL (optional)'), { target: { value: 'http://x' } });
    fireEvent.change(screen.getByPlaceholderText('Link text (optional)'), { target: { value: 'Go' } });
    fireEvent.change(screen.getByPlaceholderText('Link URL (optional)'), { target: { value: '' } });

    const calls = (onChange as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.find((c: any) => c.cards?.[0]?.link === 'http://x')).toBeTruthy();
    expect(calls.find((c: any) => c.cards?.[0]?.linkText === 'Go')).toBeTruthy();
    expect(calls.find((c: any) => c.cards?.[0]?.link === undefined)).toBeTruthy();
  });

  it('changes card variant and span', () => {
    const { onChange } = renderPanel(baseBento);
    fireEvent.change(screen.getByDisplayValue('Dark'), { target: { value: 'light' } });
    fireEvent.change(screen.getByPlaceholderText('Span'), { target: { value: '4' } });

    const calls = (onChange as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls.find((c: any) => c.cards?.[0]?.variant === 'light')).toBeTruthy();
    expect(calls.find((c: any) => c.cards?.[0]?.span === 4)).toBeTruthy();
  });

  it('removes / adds a card', () => {
    const { onChange } = renderPanel(baseBento);
    fireEvent.click(screen.getByText('Remove'));
    expect(onChange).toHaveBeenCalledWith({ cards: [] });

    fireEvent.click(screen.getByText('+ Add Card'));
    const last = (onChange as any).mock.calls.pop()[0];
    expect(last.cards).toHaveLength(2);
    expect(last.cards[1]).toMatchObject({ title: '', items: [], variant: 'dark', span: 6 });
  });
});
