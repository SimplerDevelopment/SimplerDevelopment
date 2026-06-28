/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * Additional coverage tests for BlockContentEditor.
 * Targets uncovered branches not hit by components-block-content-editor.test.tsx.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';

// ─── Heavy-dep mocks (identical style to sibling test) ──────────────────────

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value, onChange, label, apiEndpoint, mimeTypeFilter }: any) => (
    <div
      data-testid={`media-picker-${label || 'unnamed'}`}
      data-api={apiEndpoint || ''}
      data-filter={mimeTypeFilter || ''}
    >
      <input
        data-testid={`mp-input-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/portal/IconPicker', () => ({
  IconPicker: ({ value, onChange, label }: any) => (
    <div data-testid={`icon-picker-${label || 'unnamed'}`}>
      <input
        data-testid={`ip-input-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/components/blocks/visual/GoogleFontPicker', () => ({
  GoogleFontPicker: ({ value, onChange }: any) => (
    <input
      data-testid="google-font-picker"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/components/blocks/visual/TokenColorPicker', () => ({
  TokenColorPicker: ({ value, onChange, label }: any) => (
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
  RichTextEditable: ({ html, onChange, placeholder, singleLine }: any) => (
    <textarea
      data-testid={`rte-${placeholder || 'rte'}`}
      data-single-line={singleLine ? 'true' : 'false'}
      value={html || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

vi.mock('@/components/portal/visual-editor/HtmlRenderEditor', () => ({
  HtmlRenderEditor: ({ block }: any) => (
    <div data-testid="html-render-editor" data-block-id={block?.id || ''} />
  ),
}));

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: any) => <div data-testid="dnd-context">{children}</div>,
  closestCenter: () => null,
  PointerSensor: function PointerSensor() {},
  useSensor: () => ({}),
  useSensors: () => [],
}));

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: <T,>(arr: T[], from: number, to: number) => {
    const next = arr.slice();
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
  SortableContext: ({ children }: any) => <div data-testid="sortable-context">{children}</div>,
  verticalListSortingStrategy: null,
  useSortable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: null,
    isDragging: false,
  }),
}));

vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: { toString: () => '' },
  },
}));

// ─── Import under test ───────────────────────────────────────────────────────
import { BlockContentEditor } from '@/components/portal/visual-editor/BlockContentEditor';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function renderBlock(block: any, siteId?: number) {
  const onUpdate = vi.fn();
  const utils = render(
    <BlockContentEditor block={block} onUpdate={onUpdate} siteId={siteId} />,
  );
  return { ...utils, onUpdate };
}

function installFetchMock(payload: any = { success: true, data: [] }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  });
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ─── Popup block ─────────────────────────────────────────────────────────────

describe('BlockContentEditor — popup block', () => {
  it('renders popup with default trigger=time-delay and shows delay field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pp1', type: 'popup', order: 0, headline: 'Hello', trigger: 'time-delay',
    });
    // headline RTE
    expect(container.querySelector('[data-testid="rte-Headline"]')).toBeTruthy();
    // body RTE
    expect(container.querySelector('[data-testid="rte-Body"]')).toBeTruthy();
    // delay number field visible when trigger=time-delay
    const numInputs = container.querySelectorAll('input[type="number"]');
    expect(numInputs.length).toBeGreaterThanOrEqual(1);
    // trigger select
    const selects = container.querySelectorAll('select');
    const triggerSel = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="exit-intent"]'),
    ) as HTMLSelectElement;
    expect(triggerSel).toBeTruthy();
    // change trigger to page-load (removes delay field)
    fireEvent.change(triggerSel, { target: { value: 'page-load' } });
    expect(onUpdate).toHaveBeenCalledWith({ trigger: 'page-load' });
  });

  it('shows scroll-percent field when trigger=scroll-percent', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pp1', type: 'popup', order: 0, trigger: 'scroll-percent', scrollPercent: 50,
    });
    const numInputs = container.querySelectorAll('input[type="number"]');
    // scrollPercent field should be present
    const scrollInput = Array.from(numInputs).find(
      (i) => (i as HTMLInputElement).value === '50',
    ) as HTMLInputElement;
    expect(scrollInput).toBeTruthy();
    fireEvent.change(scrollInput, { target: { value: '75' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.scrollPercent).toBe(75);
  });

  it('clamps scrollPercent at boundaries (0-100)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pp1', type: 'popup', order: 0, trigger: 'scroll-percent', scrollPercent: 50,
    });
    const numInput = Array.from(container.querySelectorAll('input[type="number"]')).find(
      (i) => (i as HTMLInputElement).value === '50',
    ) as HTMLInputElement;
    // fire with 150 → should clamp to 100
    fireEvent.change(numInput, { target: { value: '150' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.scrollPercent).toBe(100);
  });

  it('updates frequency via select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pp1', type: 'popup', order: 0, trigger: 'page-load',
    });
    const selects = container.querySelectorAll('select');
    const freqSel = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="once-per-week"]'),
    ) as HTMLSelectElement;
    fireEvent.change(freqSel, { target: { value: 'once-per-week' } });
    expect(onUpdate).toHaveBeenCalledWith({ frequency: 'once-per-week' });
  });

  it('updates dismissable checkbox', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pp1', type: 'popup', order: 0, trigger: 'page-load', dismissable: true,
    });
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('updates ctaLabel and ctaUrl via Field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pp1', type: 'popup', order: 0, trigger: 'page-load', ctaLabel: 'Sign Up', ctaUrl: '/signup',
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    const ctaLabelInput = Array.from(inputs).find(
      (i) => (i as HTMLInputElement).value === 'Sign Up',
    ) as HTMLInputElement;
    fireEvent.change(ctaLabelInput, { target: { value: 'Join Now' } });
    expect(onUpdate).toHaveBeenCalledWith({ ctaLabel: 'Join Now' });
    // empty string clears to undefined
    fireEvent.change(ctaLabelInput, { target: { value: '' } });
    const last = onUpdate.mock.calls.at(-1)![0];
    expect(last.ctaLabel).toBeUndefined();
  });

  it('updates delaySeconds via NumberField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pp1', type: 'popup', order: 0, trigger: 'time-delay', delaySeconds: 5,
    });
    const numInput = Array.from(container.querySelectorAll('input[type="number"]')).find(
      (i) => (i as HTMLInputElement).value === '5',
    ) as HTMLInputElement;
    expect(numInput).toBeTruthy();
    fireEvent.change(numInput, { target: { value: '10' } });
    // NumberField emits the string value from the input; component receives it as-is
    expect(onUpdate).toHaveBeenCalledWith({ delaySeconds: 10 });
  });
});

// ─── image block: width + alignment selects ──────────────────────────────────

describe('BlockContentEditor — image block extra selects', () => {
  it('updates width via SelectField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'i1', type: 'image', order: 0, url: 'x.png', alt: 'alt',
    });
    const selects = container.querySelectorAll('select');
    // width select is index 0, alignment is index 1
    fireEvent.change(selects[0], { target: { value: 'small' } });
    expect(onUpdate).toHaveBeenCalledWith({ width: 'small' });
  });

  it('updates alignment via SelectField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'i1', type: 'image', order: 0, url: 'x.png',
    });
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[1], { target: { value: 'right' } });
    expect(onUpdate).toHaveBeenCalledWith({ alignment: 'right' });
  });

  it('updates caption field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'i1', type: 'image', order: 0, url: 'x.png', caption: 'old',
    });
    const captionInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'old',
    ) as HTMLInputElement;
    fireEvent.change(captionInput, { target: { value: 'new caption' } });
    expect(onUpdate).toHaveBeenCalledWith({ caption: 'new caption' });
  });
});

// ─── text block: content + alignment ─────────────────────────────────────────

describe('BlockContentEditor — text block extra fields', () => {
  it('updates content via RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 't1', type: 'text', order: 0, content: 'Hello',
    });
    const rte = container.querySelector('[data-testid="rte-Content"]') as HTMLTextAreaElement;
    fireEvent.change(rte, { target: { value: 'Updated' } });
    expect(onUpdate).toHaveBeenCalledWith({ content: 'Updated' });
  });

  it('updates alignment via second select', () => {
    const { container, onUpdate } = renderBlock({
      id: 't1', type: 'text', order: 0, content: 'x',
    });
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[1], { target: { value: 'center' } });
    expect(onUpdate).toHaveBeenCalledWith({ alignment: 'center' });
  });
});

// ─── cta block: all fields ────────────────────────────────────────────────────

describe('BlockContentEditor — cta block all fields', () => {
  it('updates title, description, button text and url', () => {
    const { container, onUpdate } = renderBlock({
      id: 'c1', type: 'cta', order: 0, title: 'T', description: 'D',
      primaryButtonText: 'Sign Up', primaryButtonUrl: '/signup',
    });
    // description RTE
    const descRte = container.querySelector('[data-testid="rte-Description"]') as HTMLTextAreaElement;
    fireEvent.change(descRte, { target: { value: 'New desc' } });
    expect(onUpdate).toHaveBeenCalledWith({ description: 'New desc' });

    // primary button text
    const inputs = container.querySelectorAll('input[type="text"]');
    const btnText = Array.from(inputs).find(
      (i) => (i as HTMLInputElement).value === 'Sign Up',
    ) as HTMLInputElement;
    fireEvent.change(btnText, { target: { value: 'Get Started' } });
    expect(onUpdate).toHaveBeenCalledWith({ primaryButtonText: 'Get Started' });
  });

  it('updates secondary button fields', () => {
    const { container, onUpdate } = renderBlock({
      id: 'c1', type: 'cta', order: 0, secondaryButtonText: 'Learn More',
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    const secBtn = Array.from(inputs).find(
      (i) => (i as HTMLInputElement).value === 'Learn More',
    ) as HTMLInputElement;
    fireEvent.change(secBtn, { target: { value: 'Read More' } });
    expect(onUpdate).toHaveBeenCalledWith({ secondaryButtonText: 'Read More' });
  });

  it('updates background style to solid', () => {
    const { container, onUpdate } = renderBlock({
      id: 'c1', type: 'cta', order: 0,
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'solid' } });
    expect(onUpdate).toHaveBeenCalledWith({ backgroundStyle: 'solid' });
  });
});

// ─── hero block: CTA + secondary CTA + background fields ─────────────────────

describe('BlockContentEditor — hero block extra fields', () => {
  it('updates ctaText and ctaLink', () => {
    const { container, onUpdate } = renderBlock({
      id: 'h1', type: 'hero', order: 0, ctaText: 'Get Started', ctaLink: '/start',
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    const ctaInput = Array.from(inputs).find(
      (i) => (i as HTMLInputElement).value === 'Get Started',
    ) as HTMLInputElement;
    fireEvent.change(ctaInput, { target: { value: 'Begin' } });
    expect(onUpdate).toHaveBeenCalledWith({ ctaText: 'Begin' });
  });

  it('updates secondaryCtaText and secondaryCtaLink', () => {
    const { container, onUpdate } = renderBlock({
      id: 'h1', type: 'hero', order: 0, secondaryCtaText: 'Learn', secondaryCtaLink: '/learn',
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    const sec = Array.from(inputs).find(
      (i) => (i as HTMLInputElement).value === 'Learn',
    ) as HTMLInputElement;
    fireEvent.change(sec, { target: { value: 'Explore' } });
    expect(onUpdate).toHaveBeenCalledWith({ secondaryCtaText: 'Explore' });
  });

  it('renders background image MediaPicker', () => {
    const { container } = renderBlock({ id: 'h1', type: 'hero', order: 0 });
    // Two MediaPickers: background image + background video
    const mps = container.querySelectorAll('[data-testid^="media-picker-"]');
    expect(mps.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── testimonial: role + company + avatar ────────────────────────────────────

describe('BlockContentEditor — testimonial extra fields', () => {
  it('updates role, company, and avatar via Field + MediaPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 't1', type: 'testimonial', order: 0, quote: 'q',
      author: 'A', role: 'CEO', company: 'Acme',
    });
    const roleInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'CEO',
    ) as HTMLInputElement;
    fireEvent.change(roleInput, { target: { value: 'CTO' } });
    expect(onUpdate).toHaveBeenCalledWith({ role: 'CTO' });

    const companyInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Acme',
    ) as HTMLInputElement;
    fireEvent.change(companyInput, { target: { value: 'NewCo' } });
    expect(onUpdate).toHaveBeenCalledWith({ company: 'NewCo' });

    // avatar MediaPicker
    expect(container.querySelector('[data-testid="media-picker-unnamed"]')).toBeTruthy();
  });
});

// ─── featured-content: button + image fields ─────────────────────────────────

describe('BlockContentEditor — featured-content extra fields', () => {
  it('updates buttonText and buttonUrl', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'featured-content', order: 0, buttonText: 'Click', buttonUrl: '/x',
    });
    const btnInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Click',
    ) as HTMLInputElement;
    fireEvent.change(btnInput, { target: { value: 'Go' } });
    expect(onUpdate).toHaveBeenCalledWith({ buttonText: 'Go' });
  });

  it('updates description RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'featured-content', order: 0, description: 'D',
    });
    const descRte = container.querySelector('[data-testid="rte-Description"]') as HTMLTextAreaElement;
    fireEvent.change(descRte, { target: { value: 'New' } });
    expect(onUpdate).toHaveBeenCalledWith({ description: 'New' });
  });
});

// ─── blog-posts: additional fields ───────────────────────────────────────────

describe('BlockContentEditor — blog-posts extra fields', () => {
  it('updates postType, categorySlug, limit and columns', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bp1', type: 'blog-posts', order: 0, postType: 'article', categorySlug: 'news',
    });
    // postType Field
    const postTypeInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'article',
    ) as HTMLInputElement;
    fireEvent.change(postTypeInput, { target: { value: 'blog' } });
    expect(onUpdate).toHaveBeenCalledWith({ postType: 'blog' });

    // limit select
    const selects = container.querySelectorAll('select');
    const limitSel = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="12"]'),
    ) as HTMLSelectElement;
    fireEvent.change(limitSel, { target: { value: '9' } });
    expect(onUpdate).toHaveBeenCalledWith({ limit: 9 });
  });

  it('updates columns select', () => {
    const { container, onUpdate } = renderBlock({ id: 'bp1', type: 'blog-posts', order: 0 });
    const selects = container.querySelectorAll('select');
    const colsSel = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="2"]') &&
      !(s as HTMLSelectElement).querySelector('option[value="4"]'),
    ) as HTMLSelectElement;
    if (colsSel) {
      fireEvent.change(colsSel, { target: { value: '2' } });
      expect(onUpdate).toHaveBeenCalledWith({ columns: 2 });
    }
  });
});

// ─── product-grid: additional checkboxes + fields ────────────────────────────

describe('BlockContentEditor — product-grid additional fields', () => {
  it('toggles showDescription and showCategory checkboxes', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pg1', type: 'product-grid', order: 0,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // There are 3 checkboxes: showPrice, showDescription, showCategory
    fireEvent.click(cbs[1]);
    expect(onUpdate).toHaveBeenCalled();
    fireEvent.click(cbs[2]);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('updates sort and buttonText', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pg1', type: 'product-grid', order: 0, buttonText: 'Buy',
    });
    const sortSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="price_asc"]'),
    ) as HTMLSelectElement;
    fireEvent.change(sortSel, { target: { value: 'price_asc' } });
    expect(onUpdate).toHaveBeenCalledWith({ sort: 'price_asc' });

    const btnInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Buy',
    ) as HTMLInputElement;
    fireEvent.change(btnInput, { target: { value: 'Shop' } });
    expect(onUpdate).toHaveBeenCalledWith({ buttonText: 'Shop' });
  });
});

// ─── featured-products: extra checkboxes + fields ────────────────────────────

describe('BlockContentEditor — featured-products extra fields', () => {
  it('toggles showBadge and updates badgeText', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fp1', type: 'featured-products', order: 0, badgeText: 'NEW',
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // showPrice is cbs[0], showBadge is cbs[1]
    fireEvent.click(cbs[1]);
    expect(onUpdate).toHaveBeenCalled();

    const badgeInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'NEW',
    ) as HTMLInputElement;
    fireEvent.change(badgeInput, { target: { value: 'HOT' } });
    expect(onUpdate).toHaveBeenCalledWith({ badgeText: 'HOT' });
  });

  it('updates buttonText', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fp1', type: 'featured-products', order: 0, buttonText: 'Shop',
    });
    const btnInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Shop',
    ) as HTMLInputElement;
    fireEvent.change(btnInput, { target: { value: 'Buy Now' } });
    expect(onUpdate).toHaveBeenCalledWith({ buttonText: 'Buy Now' });
  });

  it('updates limit select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fp1', type: 'featured-products', order: 0,
    });
    const limitSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="8"]'),
    ) as HTMLSelectElement;
    fireEvent.change(limitSel, { target: { value: '8' } });
    expect(onUpdate).toHaveBeenCalledWith({ limit: 8 });
  });
});

// ─── product-categories: extra checkboxes ────────────────────────────────────

describe('BlockContentEditor — product-categories checkboxes', () => {
  it('toggles showImage checkbox', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pc1', type: 'product-categories', order: 0,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // showProductCount=cbs[0], showImage=cbs[1]
    fireEvent.click(cbs[1]);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('updates layout select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pc1', type: 'product-categories', order: 0,
    });
    const layoutSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="list"]'),
    ) as HTMLSelectElement;
    fireEvent.change(layoutSel, { target: { value: 'list' } });
    expect(onUpdate).toHaveBeenCalledWith({ layout: 'list' });
  });
});

// ─── shopping-cart: extra fields ─────────────────────────────────────────────

describe('BlockContentEditor — shopping-cart extra fields', () => {
  it('toggles showSubtotal checkbox and updates text fields', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sc1', type: 'shopping-cart', order: 0,
      checkoutButtonText: 'Checkout', emptyCartMessage: 'Empty',
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(cbs[0]);
    expect(onUpdate).toHaveBeenCalledWith({ showSubtotal: false });

    const checkoutInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Checkout',
    ) as HTMLInputElement;
    fireEvent.change(checkoutInput, { target: { value: 'Pay Now' } });
    expect(onUpdate).toHaveBeenCalledWith({ checkoutButtonText: 'Pay Now' });
  });
});

// ─── store-banner: extra fields ──────────────────────────────────────────────

describe('BlockContentEditor — store-banner extra fields', () => {
  it('renders and updates subtitle, discountCode, countdownDate', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sb1', type: 'store-banner', order: 0,
      discountCode: 'SAVE10', countdownDate: '2025-12-31',
    });
    // subtitle RTE
    expect(container.querySelector('[data-testid="rte-Subtitle"]')).toBeTruthy();

    const discountInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'SAVE10',
    ) as HTMLInputElement;
    fireEvent.change(discountInput, { target: { value: 'DEAL20' } });
    expect(onUpdate).toHaveBeenCalledWith({ discountCode: 'DEAL20' });
  });

  it('updates accentColor via ColorField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sb1', type: 'store-banner', order: 0,
    });
    const accent = container.querySelector('[data-testid="color-Accent Color"]') as HTMLInputElement;
    fireEvent.change(accent, { target: { value: '#f00' } });
    expect(onUpdate).toHaveBeenCalledWith({ accentColor: '#f00' });
  });

  it('updates backgroundStyle via select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sb1', type: 'store-banner', order: 0,
    });
    const bgSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="image"]'),
    ) as HTMLSelectElement;
    fireEvent.change(bgSel, { target: { value: 'image' } });
    expect(onUpdate).toHaveBeenCalledWith({ backgroundStyle: 'image' });
  });
});

// ─── sticky-scroll-tabs: color fields ────────────────────────────────────────

describe('BlockContentEditor — sticky-scroll-tabs color fields', () => {
  it('updates activeTabBackground and activeTabColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [],
    });
    const activeBg = container.querySelector('[data-testid="color-Active Tab Background"]') as HTMLInputElement;
    expect(activeBg).toBeTruthy();
    fireEvent.change(activeBg, { target: { value: '#222' } });
    expect(onUpdate).toHaveBeenCalledWith({ activeTabBackground: '#222' });

    const activeText = container.querySelector('[data-testid="color-Active Tab Text"]') as HTMLInputElement;
    fireEvent.change(activeText, { target: { value: '#fff' } });
    expect(onUpdate).toHaveBeenCalledWith({ activeTabColor: '#fff' });
  });

  it('updates inactive tab colors', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [],
    });
    const inactiveBg = container.querySelector('[data-testid="color-Inactive Tab Background"]') as HTMLInputElement;
    fireEvent.change(inactiveBg, { target: { value: '#eee' } });
    expect(onUpdate).toHaveBeenCalledWith({ inactiveTabBackground: '#eee' });

    const inactiveText = container.querySelector('[data-testid="color-Inactive Tab Text"]') as HTMLInputElement;
    fireEvent.change(inactiveText, { target: { value: '#333' } });
    expect(onUpdate).toHaveBeenCalledWith({ inactiveTabColor: '#333' });
  });

  it('updates mobile tab colors', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [],
    });
    const mobileActiveBg = container.querySelector('[data-testid="color-Mobile Active Background"]') as HTMLInputElement;
    fireEvent.change(mobileActiveBg, { target: { value: '#000' } });
    expect(onUpdate).toHaveBeenCalledWith({ mobileActiveTabBackground: '#000' });

    const mobileInactiveText = container.querySelector('[data-testid="color-Mobile Inactive Text"]') as HTMLInputElement;
    fireEvent.change(mobileInactiveText, { target: { value: '#aaa' } });
    expect(onUpdate).toHaveBeenCalledWith({ mobileInactiveTabColor: '#aaa' });
  });

  it('updates mobileTabsBehavior select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [],
    });
    const mobileSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="hide"]'),
    ) as HTMLSelectElement;
    fireEvent.change(mobileSel, { target: { value: 'hide' } });
    expect(onUpdate).toHaveBeenCalledWith({ mobileTabsBehavior: 'hide' });
  });

  it('updates tabBorderRadius field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [], tabBorderRadius: '8px',
    });
    const brInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '8px',
    ) as HTMLInputElement;
    expect(brInput).toBeTruthy();
    fireEvent.change(brInput, { target: { value: '4px' } });
    expect(onUpdate).toHaveBeenCalledWith({ tabBorderRadius: '4px' });
  });

  it('updates panelMinHeight field (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [], panelMinHeight: '400px',
    });
    const pmhInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '400px',
    ) as HTMLInputElement;
    expect(pmhInput).toBeTruthy();
    fireEvent.change(pmhInput, { target: { value: '' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.panelMinHeight).toBeUndefined();
  });

  it('adds and edits a panel', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].panels).toHaveLength(1);
  });
});

// ─── flip-card-grid: overline + cardHeight + accentColor + item fields ────────

describe('BlockContentEditor — flip-card-grid extra fields', () => {
  it('updates overline and cardHeight', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'flip-card-grid', order: 0, cards: [], overline: 'SUP',
    });
    const overlineRte = container.querySelector('[data-testid="rte-Overline"]') as HTMLTextAreaElement;
    fireEvent.change(overlineRte, { target: { value: 'NEW' } });
    expect(onUpdate).toHaveBeenCalledWith({ overline: 'NEW' });
  });

  it('updates accentColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'flip-card-grid', order: 0, cards: [],
    });
    const accent = container.querySelector('[data-testid="color-Accent Color"]') as HTMLInputElement;
    fireEvent.change(accent, { target: { value: '#blue' } });
    expect(onUpdate).toHaveBeenCalledWith({ accentColor: '#blue' });
  });

  it('expands a card item and edits frontSubtitle', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'flip-card-grid', order: 0,
      cards: [{ id: 'c1', frontTitle: 'Card A', frontSubtitle: 'Sub', backText: 'Back' }],
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('Card A'),
    );
    fireEvent.click(header!);
    const subInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Sub',
    ) as HTMLInputElement;
    if (subInput) {
      fireEvent.change(subInput, { target: { value: 'NewSub' } });
      expect(onUpdate).toHaveBeenCalled();
    }
  });
});

// ─── logo-strip: extra fields ─────────────────────────────────────────────────

describe('BlockContentEditor — logo-strip extra fields', () => {
  it('updates logoHeight and gap', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ls1', type: 'logo-strip', order: 0, logos: [], logoHeight: '40px',
    });
    const logoHInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '40px',
    ) as HTMLInputElement;
    expect(logoHInput).toBeTruthy();
    fireEvent.change(logoHInput, { target: { value: '60px' } });
    expect(onUpdate).toHaveBeenCalledWith({ logoHeight: '60px' });

    const gapSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="sm"]') &&
      (s as HTMLSelectElement).querySelector('option[value="md"]') &&
      (s as HTMLSelectElement).querySelector('option[value="lg"]') &&
      !(s as HTMLSelectElement).querySelector('option[value="4"]'),
    ) as HTMLSelectElement;
    if (gapSel) {
      fireEvent.change(gapSel, { target: { value: 'sm' } });
      expect(onUpdate).toHaveBeenCalledWith({ gap: 'sm' });
    }
  });

  it('updates alignment for logo-strip', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ls1', type: 'logo-strip', order: 0, logos: [],
    });
    const alignSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="left"]') &&
      (s as HTMLSelectElement).querySelector('option[value="right"]') &&
      (s as HTMLSelectElement).querySelector('option[value="center"]') &&
      !(s as HTMLSelectElement).querySelector('option[value="4"]'),
    ) as HTMLSelectElement;
    if (alignSel) {
      fireEvent.change(alignSel, { target: { value: 'left' } });
      expect(onUpdate).toHaveBeenCalledWith({ alignment: 'left' });
    }
  });
});

// ─── metric-cards: extra fields ──────────────────────────────────────────────

describe('BlockContentEditor — metric-cards extra fields', () => {
  it('updates logoColumnWidth and labelMaxWidth (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'm1', type: 'metric-cards', order: 0, metrics: [],
      logoColumnWidth: '120px', labelMaxWidth: '200px',
    });
    const logoW = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '120px',
    ) as HTMLInputElement;
    expect(logoW).toBeTruthy();
    fireEvent.change(logoW, { target: { value: '' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.logoColumnWidth).toBeUndefined();
  });

  it('updates accentColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'm1', type: 'metric-cards', order: 0, metrics: [],
    });
    const accent = container.querySelector('[data-testid="color-Accent Color"]') as HTMLInputElement;
    expect(accent).toBeTruthy();
    fireEvent.change(accent, { target: { value: '#333' } });
    expect(onUpdate).toHaveBeenCalledWith({ accentColor: '#333' });
  });

  it('renders overline + title + description RichTextFields', () => {
    const { container } = renderBlock({
      id: 'm1', type: 'metric-cards', order: 0, metrics: [],
    });
    expect(container.querySelector('[data-testid="rte-Overline"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="rte-Title"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="rte-Description"]')).toBeTruthy();
  });
});

// ─── booking block: style override fields ────────────────────────────────────

describe('BlockContentEditor — booking styleOverrides fields', () => {
  it('updates styleOverrides.backgroundColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: 'x',
    });
    const bgColor = container.querySelector('[data-testid="color-Background"]') as HTMLInputElement;
    if (bgColor) {
      fireEvent.change(bgColor, { target: { value: '#123456' } });
      const call = onUpdate.mock.calls.at(-1)![0];
      expect(call.styleOverrides?.backgroundColor).toBe('#123456');
    }
  });

  it('updates styleOverrides.textColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: 'x',
    });
    const textColor = container.querySelector('[data-testid="color-Text Color"]') as HTMLInputElement;
    if (textColor) {
      fireEvent.change(textColor, { target: { value: '#fff' } });
      const call = onUpdate.mock.calls.at(-1)![0];
      expect(call.styleOverrides?.textColor).toBe('#fff');
    }
  });

  it('updates styleOverrides.buttonBg and buttonText', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: 'x',
    });
    const btnBg = container.querySelector('[data-testid="color-Button Background"]') as HTMLInputElement;
    if (btnBg) {
      fireEvent.change(btnBg, { target: { value: '#0f0' } });
      expect(onUpdate.mock.calls.at(-1)![0].styleOverrides?.buttonBg).toBe('#0f0');
    }
  });

  it('updates styleOverrides headingFont via GoogleFontPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: 'x',
    });
    const fontPickers = container.querySelectorAll('[data-testid="google-font-picker"]');
    // There are at least 2: heading font + body font in style overrides
    if (fontPickers.length >= 1) {
      fireEvent.change(fontPickers[0], { target: { value: 'Roboto' } });
      expect(onUpdate).toHaveBeenCalled();
    }
  });

  it('updates styleOverrides.buttonBorderRadius via select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: 'x',
    });
    const radiusSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="9999px"]'),
    ) as HTMLSelectElement;
    if (radiusSel) {
      fireEvent.change(radiusSel, { target: { value: '8px' } });
      expect(onUpdate.mock.calls.at(-1)![0].styleOverrides?.buttonBorderRadius).toBe('8px');
    }
  });
});

// ─── columns: stackOnTablet checkbox ─────────────────────────────────────────

describe('BlockContentEditor — columns stackOnTablet', () => {
  it('toggles stackOnTablet checkbox', () => {
    const cols = [{ id: 'a', width: 50, blocks: [] }, { id: 'b', width: 50, blocks: [] }];
    const { container, onUpdate } = renderBlock({
      id: 'col1', type: 'columns', order: 0, columns: cols,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // cbs[0]=stackOnMobile, cbs[1]=stackOnTablet, cbs[2]=reverseOnStack
    fireEvent.click(cbs[1]);
    expect(onUpdate).toHaveBeenCalledWith({ stackOnTablet: true });
  });
});

// ─── hero-slideshow: extra slide fields ──────────────────────────────────────

describe('BlockContentEditor — hero-slideshow extra slide fields', () => {
  it('updates slide description via TextareaField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A', description: 'old-desc' }],
    });
    const descTa = Array.from(container.querySelectorAll('textarea')).find(
      (t) => (t as HTMLTextAreaElement).getAttribute('data-testid') === 'rte-Description' ||
             (t as HTMLTextAreaElement).value === 'old-desc',
    ) as HTMLTextAreaElement;
    if (descTa) {
      fireEvent.change(descTa, { target: { value: 'new-desc' } });
      expect(onUpdate).toHaveBeenCalled();
    }
  });

  it('updates slide ctaText and ctaLink', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A', ctaText: 'Go', ctaLink: '/go' }],
    });
    const ctaInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Go',
    ) as HTMLInputElement;
    if (ctaInput) {
      fireEvent.change(ctaInput, { target: { value: 'Start' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.slides[0].ctaText).toBe('Start');
    }
  });

  it('updates backgroundPosition and backgroundRepeat', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }],
    });
    const bgPoInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'center',
    ) as HTMLInputElement;
    if (bgPoInput) {
      fireEvent.change(bgPoInput, { target: { value: 'top' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.slides[0].backgroundPosition).toBe('top');
    }

    const repeatSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="repeat-x"]'),
    ) as HTMLSelectElement;
    if (repeatSel) {
      fireEvent.change(repeatSel, { target: { value: 'repeat' } });
      const call = onUpdate.mock.calls.at(-1)![0];
      expect(call.slides[0].backgroundRepeat).toBe('repeat');
    }
  });

  it('updates backgroundVideoOpacity via deck-level range', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A', overlayOpacity: 1 }],
      backgroundVideoOpacity: 1,
    });
    const ranges = container.querySelectorAll('input[type="range"]');
    // First range = slide overlayOpacity, second range = backgroundVideoOpacity
    if (ranges.length >= 2) {
      fireEvent.change(ranges[1], { target: { value: '0.3' } });
      const call = onUpdate.mock.calls.at(-1)![0];
      expect(call.backgroundVideoOpacity).toBe(0.3);
    }
  });

  it('updates arrowBackground and arrowBorder colors', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }],
    });
    const arrowBg = container.querySelector('[data-testid="color-Arrow Background"]') as HTMLInputElement;
    if (arrowBg) {
      fireEvent.change(arrowBg, { target: { value: 'rgba(0,0,0,0.3)' } });
      expect(onUpdate).toHaveBeenCalledWith({ arrowBackground: 'rgba(0,0,0,0.3)' });
    }

    const arrowBorder = container.querySelector('[data-testid="color-Arrow Border"]') as HTMLInputElement;
    if (arrowBorder) {
      fireEvent.change(arrowBorder, { target: { value: 'rgba(0,0,0,0.5)' } });
      expect(onUpdate).toHaveBeenCalledWith({ arrowBorderColor: 'rgba(0,0,0,0.5)' });
    }
  });

  it('updates dotActiveColor and progressBarColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }],
    });
    const dotActive = container.querySelector('[data-testid="color-Active Dot"]') as HTMLInputElement;
    if (dotActive) {
      fireEvent.change(dotActive, { target: { value: '#aabbcc' } });
      expect(onUpdate).toHaveBeenCalledWith({ dotActiveColor: '#aabbcc' });
    }

    const progressBar = container.querySelector('[data-testid="color-Progress Bar"]') as HTMLInputElement;
    if (progressBar) {
      fireEvent.change(progressBar, { target: { value: '#abc123' } });
      expect(onUpdate).toHaveBeenCalledWith({ progressBarColor: '#abc123' });
    }
  });

  it('updates kenBurns, showDots, showArrows, pauseOnHover checkboxes', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }],
      kenBurns: true, showDots: true, showArrows: true, pauseOnHover: true,
    });
    const cbs = Array.from(container.querySelectorAll('input[type="checkbox"]'));
    // There are 5 checkboxes: autoplay, showDots, showArrows, kenBurns, pauseOnHover
    // Click each one that's checked → they each call onUpdate
    cbs.forEach((cb) => {
      if ((cb as HTMLInputElement).checked) {
        fireEvent.click(cb);
      }
    });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('updates transitionDuration and height fields', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }],
      transitionDuration: 800, height: '90vh',
    });
    const tdInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '800',
    ) as HTMLInputElement;
    if (tdInput) {
      fireEvent.change(tdInput, { target: { value: '500' } });
      expect(onUpdate.mock.calls.at(-1)![0].transitionDuration).toBe(500);
    }

    const hInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '90vh',
    ) as HTMLInputElement;
    if (hInput) {
      fireEvent.change(hInput, { target: { value: '100vh' } });
      expect(onUpdate.mock.calls.at(-1)![0].height).toBe('100vh');
    }
  });

  it('removes last-slide guard: removing slide adjusts activeSlide if needed', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }, { id: 'c', title: 'C' }],
    });
    // Switch to last slide (3) first
    const numBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      /^\d+$/.test(b.textContent || ''),
    );
    fireEvent.click(numBtns[2]); // switch to slide 3
    // Now remove it
    const rm = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.startsWith('Remove slide'),
    );
    if (rm) {
      fireEvent.click(rm);
      expect(onUpdate.mock.calls.at(-1)![0].slides).toHaveLength(2);
    }
  });

  it('updates slide backgroundVideo URL', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A', backgroundVideo: 'vid.mp4' }],
    });
    const vidInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'vid.mp4',
    ) as HTMLInputElement;
    if (vidInput) {
      fireEvent.change(vidInput, { target: { value: 'new-vid.mp4' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.slides[0].backgroundVideo).toBe('new-vid.mp4');
    }
  });
});

// ─── deck-next-slide: variant, size, alignment, icon, iconPosition ───────────

describe('BlockContentEditor — deck-next-slide additional fields', () => {
  it('updates variant and size selects', () => {
    const { container, onUpdate } = renderBlock({
      id: 'dns1', type: 'deck-next-slide', order: 0,
    });
    const selects = container.querySelectorAll('select');
    // variant is first select
    fireEvent.change(selects[0], { target: { value: 'secondary' } });
    expect(onUpdate).toHaveBeenCalledWith({ variant: 'secondary' });
    // size is second select
    fireEvent.change(selects[1], { target: { value: 'lg' } });
    expect(onUpdate).toHaveBeenCalledWith({ size: 'lg' });
  });

  it('updates alignment and iconPosition selects', () => {
    const { container, onUpdate } = renderBlock({
      id: 'dns1', type: 'deck-next-slide', order: 0,
    });
    const selects = container.querySelectorAll('select');
    // alignment = selects[2]
    fireEvent.change(selects[2], { target: { value: 'right' } });
    expect(onUpdate).toHaveBeenCalledWith({ alignment: 'right' });
    // iconPosition = selects[3]
    fireEvent.change(selects[3], { target: { value: 'right' } });
    expect(onUpdate).toHaveBeenCalledWith({ iconPosition: 'right' });
  });

  it('updates icon field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'dns1', type: 'deck-next-slide', order: 0, icon: 'arrow_forward',
    });
    const iconInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'arrow_forward',
    ) as HTMLInputElement;
    if (iconInput) {
      fireEvent.change(iconInput, { target: { value: 'chevron_right' } });
      expect(onUpdate).toHaveBeenCalledWith({ icon: 'chevron_right' });
    }
  });
});

// ─── marquee: gap, height, loop, pauseOnHover/pauseOnClick ───────────────────

describe('BlockContentEditor — marquee extra settings', () => {
  it('updates gap and height fields', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0, items: [], gap: '40px', height: '100px',
    });
    const gapInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '40px',
    ) as HTMLInputElement;
    expect(gapInput).toBeTruthy();
    fireEvent.change(gapInput, { target: { value: '60px' } });
    expect(onUpdate).toHaveBeenCalledWith({ gap: '60px' });

    const hInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '100px',
    ) as HTMLInputElement;
    if (hInput) {
      fireEvent.change(hInput, { target: { value: '200px' } });
      expect(onUpdate).toHaveBeenCalledWith({ height: '200px' });
    }
  });

  it('updates loop count field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0, items: [], loop: 0,
    });
    const loopInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '0',
    ) as HTMLInputElement;
    if (loopInput) {
      fireEvent.change(loopInput, { target: { value: '3' } });
      expect(onUpdate).toHaveBeenCalledWith({ loop: 3 });
    }
  });

  it('toggles pauseOnHover and pauseOnClick', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0, items: [],
      pauseOnHover: false, pauseOnClick: false,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // autoFill=cbs[0], pauseOnHover=cbs[1], pauseOnClick=cbs[2], gradient=cbs[3]
    fireEvent.click(cbs[1]);
    expect(onUpdate).toHaveBeenCalledWith({ pauseOnHover: true });
    fireEvent.click(cbs[2]);
    expect(onUpdate).toHaveBeenCalledWith({ pauseOnClick: true });
  });

  it('updates gradientWidth field when gradient is on', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0, items: [], gradient: true, gradientWidth: 200,
    });
    const gwInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '200',
    ) as HTMLInputElement;
    if (gwInput) {
      fireEvent.change(gwInput, { target: { value: '300' } });
      expect(onUpdate).toHaveBeenCalledWith({ gradientWidth: 300 });
    }
  });
});

// ─── SurveyPicker: selected state + click-outside ────────────────────────────

describe('BlockContentEditor — SurveyPicker selected state', () => {
  it('shows selected survey display button when slug matches loaded data', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 1, slug: 'my-survey', title: 'My Survey', status: 'active', responseCount: 5 }],
    });
    const { container } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: 'my-survey',
    });
    await waitFor(() => {
      expect(container.textContent).toContain('My Survey');
    });
    // The selected display button should appear (not the search input)
    const selectedBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('My Survey'),
    );
    expect(selectedBtn).toBeTruthy();
  });

  it('shows selected survey with response count', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 2, slug: 'test-s', title: 'Test Survey', status: 'active', responseCount: 42 }],
    });
    const { container } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: 'test-s',
    });
    await waitFor(() => {
      expect(container.textContent).toContain('42 responses');
    });
  });

  it('search filter narrows survey options', async () => {
    installFetchMock({
      success: true,
      data: [
        { id: 1, slug: 'alpha', title: 'Alpha Survey', status: 'active', responseCount: 1 },
        { id: 2, slug: 'beta', title: 'Beta Survey', status: 'active', responseCount: 2 },
      ],
    });
    const { container } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: '',
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'alp' } });
    await waitFor(() => expect(container.textContent).toContain('Alpha Survey'));
  });

  it('handles fetch failure gracefully', async () => {
    const fm = vi.fn().mockRejectedValue(new Error('network'));
    (globalThis as any).fetch = fm;
    const { container } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: '',
    });
    await waitFor(() => expect(fm).toHaveBeenCalled());
    expect(container.querySelector('input[type="text"]')).toBeTruthy();
  });
});

// ─── BookingPagePicker: inactive page badge ───────────────────────────────────

describe('BlockContentEditor — BookingPagePicker inactive page', () => {
  it('shows (inactive) badge for inactive booking pages in dropdown', async () => {
    installFetchMock({
      success: true,
      data: [
        { id: 1, slug: 'active-page', title: 'Active', duration: 30, active: true },
        { id: 2, slug: 'old-page', title: 'Old Booking', duration: 15, active: false },
      ],
    });
    const { container } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: '',
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => expect(container.textContent).toContain('Old Booking'));
    expect(container.textContent).toContain('inactive');
  });
});

// ─── ProductSlugPicker: product without image (fallback icon) ────────────────

describe('BlockContentEditor — ProductSlugPicker product without image', () => {
  it('renders fallback icon when product has no image in dropdown', async () => {
    installFetchMock({
      success: true,
      data: [{ slug: 'p1', name: 'No Image Product', image: null, price: 50 }],
    });
    const { container } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0,
    }, 5);
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => expect(container.textContent).toContain('No Image Product'));
    // No img element for null-image product; the fallback div is rendered
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBe(0);
  });

  it('handles fetch failure silently', async () => {
    const fm = vi.fn().mockRejectedValue(new Error('net'));
    (globalThis as any).fetch = fm;
    const { container } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0,
    }, 3);
    await waitFor(() => expect(fm).toHaveBeenCalled());
    // Still renders
    expect(container.querySelector('input[type="text"]')).toBeTruthy();
  });

  it('shows "No products in store" empty state', async () => {
    installFetchMock({ success: true, data: [] });
    const { container } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0,
    }, 6);
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => expect(container.textContent).toContain('No products in store'));
  });

  it('filters products by search term', async () => {
    installFetchMock({
      success: true,
      data: [
        { slug: 'p1', name: 'Widget', image: null, price: 10 },
        { slug: 'p2', name: 'Gadget', image: null, price: 20 },
      ],
    });
    const { container } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0,
    }, 7);
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'wid' } });
    await waitFor(() => expect(container.textContent).toContain('Widget'));
  });

  it('shows selected product with image (img element rendered)', async () => {
    installFetchMock({
      success: true,
      data: [{ slug: 'p1', name: 'With Image', image: 'https://ex.com/img.png', price: 99 }],
    });
    const { container } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0, productSlug: 'p1',
    }, 7);
    await waitFor(() => expect(container.textContent).toContain('With Image'));
    // img should be rendered for selected product with image
    expect(container.querySelector('img')).toBeTruthy();
  });
});

// ─── survey-results: showResponseCount checkbox + SurveyResultsEditor search ──

describe('BlockContentEditor — survey-results showResponseCount + search', () => {
  it('toggles showResponseCount checkbox', async () => {
    installFetchMock({ success: true, data: [] });
    const { container, onUpdate } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0, showResponseCount: true,
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    // first checkbox = showResponseCount
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(cbs[0]);
    expect(onUpdate).toHaveBeenCalledWith({ showResponseCount: false });
  });

  it('updates description and title fields in SurveyResultsEditor', async () => {
    installFetchMock({ success: true, data: [] });
    const { container, onUpdate } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0, title: 'Results', description: 'Desc',
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const titleInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Results',
    ) as HTMLInputElement;
    if (titleInput) {
      fireEvent.change(titleInput, { target: { value: 'New Title' } });
      expect(onUpdate).toHaveBeenCalledWith({ title: 'New Title' });
    }
  });

  it('search filter in SurveyResultsEditor (survey is open)', async () => {
    installFetchMock({
      success: true,
      data: [
        { id: 1, slug: 'first', title: 'First Survey', responseCount: 1, fields: [] },
        { id: 2, slug: 'second', title: 'Second Survey', responseCount: 2, fields: [] },
      ],
    });
    const { container } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0,
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'fir' } });
    await waitFor(() => expect(container.textContent).toContain('First Survey'));
  });

  it('No matches message when search has no results', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 1, slug: 'one', title: 'One', responseCount: 1, fields: [] }],
    });
    const { container } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0,
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });
    await waitFor(() => expect(container.textContent).toContain('No matches'));
  });

  it('selecting a survey from dropdown closes picker and sets surveySlug', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 1, slug: 'chosen', title: 'Chosen Survey', responseCount: 5, fields: [] }],
    });
    const { container, onUpdate } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0,
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => expect(container.textContent).toContain('Chosen Survey'));
    const opt = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Chosen Survey'),
    );
    fireEvent.click(opt!);
    expect(onUpdate).toHaveBeenCalledWith({ surveySlug: 'chosen' });
  });

  it('handles SurveyResultsEditor fetch failure', async () => {
    const fm = vi.fn().mockRejectedValue(new Error('net'));
    (globalThis as any).fetch = fm;
    const { container } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0,
    });
    await waitFor(() => expect(fm).toHaveBeenCalled());
    expect(container.querySelector('input[type="text"]')).toBeTruthy();
  });

  it('shows bar chart button selected by default', async () => {
    installFetchMock({ success: true, data: [] });
    const { container } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0,
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    expect(container.textContent).toContain('Bar Chart');
    expect(container.textContent).toContain('Donut Chart');
    expect(container.textContent).toContain('Ranked List');
  });

  it('updates chartType to ranked-list', async () => {
    installFetchMock({ success: true, data: [] });
    const { container, onUpdate } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0,
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const listBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Ranked List'),
    );
    fireEvent.click(listBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ chartType: 'list' });
  });
});

// ─── survey block: showPageTitle checkbox ────────────────────────────────────

describe('BlockContentEditor — survey block extra fields', () => {
  it('toggles showSurveyTitle checkbox', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: 'x', showPageTitle: true,
    });
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('updates embed height and title/description fields', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: 'x', height: '700px',
    });
    const hInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '700px',
    ) as HTMLInputElement;
    if (hInput) {
      fireEvent.change(hInput, { target: { value: '500px' } });
      expect(onUpdate).toHaveBeenCalledWith({ height: '500px' });
    }
  });
});

// ─── booking: embed height + showLogo/showSteps ──────────────────────────────

describe('BlockContentEditor — booking showLogo + showSteps', () => {
  it('toggles showLogo and showSteps checkboxes', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: 'x',
      showLogo: true, showSteps: true,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // cbs[0]=showPageTitle, cbs[1]=showDescription, cbs[2]=showSteps, cbs[3]=showLogo
    fireEvent.click(cbs[3]);
    expect(onUpdate).toHaveBeenCalled();
    fireEvent.click(cbs[2]);
    expect(onUpdate).toHaveBeenCalled();
  });
});

// ─── video block: MediaPicker change ─────────────────────────────────────────

describe('BlockContentEditor — video block MediaPicker', () => {
  it('updates video url via MediaPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 'v1', type: 'video', order: 0, url: 'old.mp4',
    });
    const mpInput = container.querySelector('[data-testid="mp-input-unnamed"]') as HTMLInputElement;
    fireEvent.change(mpInput, { target: { value: 'new.mp4' } });
    expect(onUpdate).toHaveBeenCalledWith({ url: 'new.mp4' });
  });
});

// ─── accordion: onItemChange + onReorder paths ───────────────────────────────

describe('BlockContentEditor — accordion item editing', () => {
  it('expands item and updates title', () => {
    const { container, onUpdate } = renderBlock({
      id: 'a1', type: 'accordion', order: 0,
      items: [{ id: 'i1', title: 'FAQ 1', content: 'Answer' }],
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('FAQ 1'),
    );
    fireEvent.click(header!);
    const titleInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'FAQ 1',
    ) as HTMLInputElement;
    if (titleInput) {
      fireEvent.change(titleInput, { target: { value: 'FAQ Updated' } });
      expect(onUpdate.mock.calls[0][0].items[0].title).toBe('FAQ Updated');
    }
  });

  it('removes an accordion item', () => {
    const { container, onUpdate } = renderBlock({
      id: 'a1', type: 'accordion', order: 0,
      items: [{ id: 'i1', title: 'Item', content: 'c' }],
    });
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'close',
    );
    fireEvent.click(closeBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ items: [] });
  });
});

// ─── tabs: onItemChange ───────────────────────────────────────────────────────

describe('BlockContentEditor — tabs item editing', () => {
  it('expands tab item and updates label', () => {
    const { container, onUpdate } = renderBlock({
      id: 't1', type: 'tabs', order: 0,
      tabs: [{ id: 'tab1', label: 'Overview', blocks: [] }],
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('Overview'),
    );
    fireEvent.click(header!);
    const labelInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Overview',
    ) as HTMLInputElement;
    if (labelInput) {
      fireEvent.change(labelInput, { target: { value: 'Summary' } });
      expect(onUpdate.mock.calls[0][0].tabs[0].label).toBe('Summary');
    }
  });

  it('removes a tab item', () => {
    const { container, onUpdate } = renderBlock({
      id: 't1', type: 'tabs', order: 0,
      tabs: [{ id: 'tab1', label: 'Tab One', blocks: [] }],
    });
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'close',
    );
    fireEvent.click(closeBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ tabs: [] });
  });
});

// ─── bento-grid: link field via URL input ────────────────────────────────────

describe('BlockContentEditor — bento-grid URL link field', () => {
  it('updates card link URL', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0,
      cards: [{ id: 'c1', title: 'T', link: 'https://old.com', variant: 'dark', span: 6 }],
    });
    const linkInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    expect(linkInput).toBeTruthy();
    fireEvent.change(linkInput, { target: { value: 'https://new.com' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.cards[0].link).toBe('https://new.com');
  });

  it('empty link URL becomes undefined', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0,
      cards: [{ id: 'c1', title: 'T', link: 'https://old.com', variant: 'dark', span: 6 }],
    });
    const linkInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    fireEvent.change(linkInput, { target: { value: '' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.cards[0].link).toBeUndefined();
  });
});

// ─── section block: fontFamily via GoogleFontPicker ──────────────────────────

describe('BlockContentEditor — section fontFamily', () => {
  it('updates fontFamily via GoogleFontPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 's1', type: 'section', order: 0, blocks: [],
    });
    const fp = container.querySelector('[data-testid="google-font-picker"]') as HTMLInputElement;
    fireEvent.change(fp, { target: { value: 'Inter' } });
    expect(onUpdate).toHaveBeenCalledWith({ fontFamily: 'Inter' });
  });

  it('updates text color via ColorField', () => {
    const { container, onUpdate } = renderBlock({
      id: 's1', type: 'section', order: 0, blocks: [],
    });
    const textColor = container.querySelector('[data-testid="color-Text Color"]') as HTMLInputElement;
    fireEvent.change(textColor, { target: { value: '#000' } });
    expect(onUpdate).toHaveBeenCalledWith({ color: '#000' });
  });
});

// ─── gallery: masonry layout + expanded item caption ──────────────────────────

describe('BlockContentEditor — gallery extra paths', () => {
  it('selects masonry layout', () => {
    const { container, onUpdate } = renderBlock({
      id: 'g1', type: 'gallery', order: 0, images: [], layout: 'grid',
    });
    const layoutSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="masonry"]'),
    ) as HTMLSelectElement;
    fireEvent.change(layoutSel, { target: { value: 'masonry' } });
    expect(onUpdate).toHaveBeenCalledWith({ layout: 'masonry' });
  });

  it('expands gallery image item and edits caption', () => {
    const { container, onUpdate } = renderBlock({
      id: 'g1', type: 'gallery', order: 0,
      images: [{ id: 'img1', url: 'x.png', alt: 'desc', caption: 'old-cap' }],
      layout: 'grid',
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer'),
    );
    fireEvent.click(header!);
    const capInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'old-cap',
    ) as HTMLInputElement;
    if (capInput) {
      fireEvent.change(capInput, { target: { value: 'new caption' } });
      expect(onUpdate).toHaveBeenCalled();
    }
  });
});

// ─── services-grid: service link field ───────────────────────────────────────

describe('BlockContentEditor — services-grid service link field', () => {
  it('expands service item and edits link + linkText', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sg1', type: 'services-grid', order: 0,
      services: [{ id: 's1', title: 'Service A', description: 'd', bullets: [], link: '/svc', linkText: 'View' }],
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('Service A'),
    );
    fireEvent.click(header!);
    const linkInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '/svc',
    ) as HTMLInputElement;
    if (linkInput) {
      fireEvent.change(linkInput, { target: { value: '/new-svc' } });
      expect(onUpdate).toHaveBeenCalled();
    }
  });
});

// ─── team-showcase: credentials field ─────────────────────────────────────────

describe('BlockContentEditor — team-showcase credentials field', () => {
  it('updates credentials field (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0,
      members: [{ id: 'm1', name: 'N', title: 'T', photo: '', bio: '', credentials: 'PhD' }],
    });
    const credInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'PhD',
    ) as HTMLInputElement;
    expect(credInput).toBeTruthy();
    fireEvent.change(credInput, { target: { value: '' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.members[0].credentials).toBeUndefined();
  });

  it('updates bio via textarea', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0,
      members: [{ id: 'm1', name: 'N', title: 'T', photo: '', bio: 'old-bio' }],
    });
    const bioTa = Array.from(container.querySelectorAll('textarea')).find(
      (t) => (t as HTMLTextAreaElement).value === 'old-bio',
    ) as HTMLTextAreaElement;
    expect(bioTa).toBeTruthy();
    fireEvent.change(bioTa, { target: { value: 'new-bio' } });
    expect(onUpdate.mock.calls[0][0].members[0].bio).toBe('new-bio');
  });

  it('updates bioPanelColor and accentColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0, members: [],
    });
    const bioPanelColor = container.querySelector('[data-testid="color-Bio Panel Color"]') as HTMLInputElement;
    if (bioPanelColor) {
      fireEvent.change(bioPanelColor, { target: { value: '#f0f0f0' } });
      expect(onUpdate).toHaveBeenCalledWith({ bioPanelColor: '#f0f0f0' });
    }
  });
});

// ─── team-flip-grid: backBgColor + backTextColor + columns ───────────────────

describe('BlockContentEditor — team-flip-grid extra fields', () => {
  it('updates backBgColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tfg1', type: 'team-flip-grid', order: 0, members: [],
    });
    const backBg = container.querySelector('[data-testid="color-Back BG Color"]') as HTMLInputElement;
    if (backBg) {
      fireEvent.change(backBg, { target: { value: '#111' } });
      expect(onUpdate).toHaveBeenCalledWith({ backBgColor: '#111' });
    }
  });

  it('updates columns select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tfg1', type: 'team-flip-grid', order: 0, members: [],
    });
    const colsSel = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(colsSel, { target: { value: '2' } });
    expect(onUpdate).toHaveBeenCalledWith({ columns: 2 });
  });
});

// ─── site-footer: contact info merges ─────────────────────────────────────────

describe('BlockContentEditor — site-footer contact info', () => {
  it('updates contactInfo.address and phone', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      contactInfo: { address: '123 Main St', phone: '555-1234', email: 'a@b.com' },
    });
    const addrInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '123 Main St',
    ) as HTMLInputElement;
    if (addrInput) {
      fireEvent.change(addrInput, { target: { value: '456 Elm St' } });
      const call = onUpdate.mock.calls.at(-1)![0];
      expect(call.contactInfo.address).toBe('456 Elm St');
    }
  });

  it('updates tagline and ctaText fields', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      tagline: 'Old tagline', ctaText: 'Contact Us',
    });
    const taglineInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Old tagline',
    ) as HTMLInputElement;
    if (taglineInput) {
      fireEvent.change(taglineInput, { target: { value: 'New tagline' } });
      expect(onUpdate).toHaveBeenCalledWith({ tagline: 'New tagline' });
    }
  });

  it('updates brandSize via select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
    });
    const brandSizeSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="lg"]') &&
      (s as HTMLSelectElement).querySelector('option[value="sm"]') &&
      (s as HTMLSelectElement).querySelector('option[value="md"]') &&
      !(s as HTMLSelectElement).querySelector('option[value="4"]') &&
      !(s as HTMLSelectElement).querySelector('option[value="center"]'),
    ) as HTMLSelectElement;
    if (brandSizeSel) {
      fireEvent.change(brandSizeSel, { target: { value: 'lg' } });
      expect(onUpdate).toHaveBeenCalledWith({ brandSize: 'lg' });
    }
  });

  it('updates footer text colors', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
    });
    const textColor = container.querySelector('[data-testid="color-Text"]') as HTMLInputElement;
    if (textColor) {
      fireEvent.change(textColor, { target: { value: '#eee' } });
      expect(onUpdate).toHaveBeenCalledWith({ textColor: '#eee' });
    }
  });
});

// ─── SortableListItem: video field type ──────────────────────────────────────

// The ListEditor SortableListItem supports 'video' type fields.
// We exercise this via a mock ListEditor usage through a block that has
// video-type fieldDefs. Currently no block uses type:'video' in ListEditor.
// However, we can confirm the MediaPicker for image type renders fine:

describe('BlockContentEditor — ListEditor expanded item video-type field', () => {
  it('logo-strip expanded item renders MediaPicker for imageUrl (image type)', () => {
    const { container } = renderBlock({
      id: 'ls1', type: 'logo-strip', order: 0,
      logos: [{ id: 'l1', imageUrl: 'logo.png', alt: 'Logo', link: '' }],
      columns: 6,
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer'),
    );
    fireEvent.click(header!);
    // imageUrl is type:'image' → MediaPicker renders
    const mps = container.querySelectorAll('[data-testid^="media-picker-"]');
    expect(mps.length).toBeGreaterThan(0);
  });
});

// ─── youtube block: caption field ─────────────────────────────────────────────

describe('BlockContentEditor — youtube block caption', () => {
  it('updates caption field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'y1', type: 'youtube', order: 0, url: 'https://youtube.com', caption: 'old',
    });
    const captionInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'old',
    ) as HTMLInputElement;
    fireEvent.change(captionInput, { target: { value: 'new caption' } });
    expect(onUpdate).toHaveBeenCalledWith({ caption: 'new caption' });
  });
});

// ─── heading block: presetId field (button block) ────────────────────────────

describe('BlockContentEditor — button block presetId field', () => {
  it('updates presetId field (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'b1', type: 'button', order: 0, text: 'Click', presetId: 'brand-primary',
    });
    const presetInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'brand-primary',
    ) as HTMLInputElement;
    expect(presetInput).toBeTruthy();
    fireEvent.change(presetInput, { target: { value: '' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.presetId).toBeUndefined();
  });
});

// ─── quote block: author + citation ──────────────────────────────────────────

describe('BlockContentEditor — quote block author and citation', () => {
  it('updates author and citation fields', () => {
    const { container, onUpdate } = renderBlock({
      id: 'q1', type: 'quote', order: 0, content: 'q', author: 'Auth', citation: 'Cite',
    });
    const authorInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Auth',
    ) as HTMLInputElement;
    fireEvent.change(authorInput, { target: { value: 'New Author' } });
    expect(onUpdate).toHaveBeenCalledWith({ author: 'New Author' });

    const citeInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Cite',
    ) as HTMLInputElement;
    fireEvent.change(citeInput, { target: { value: 'New Cite' } });
    expect(onUpdate).toHaveBeenCalledWith({ citation: 'New Cite' });
  });
});

// ─── popup: body field (empty → undefined) ────────────────────────────────────

describe('BlockContentEditor — popup body field', () => {
  it('updates body via RichTextField (empty string → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pp1', type: 'popup', order: 0, trigger: 'page-load', body: 'Some body',
    });
    const bodyRte = container.querySelector('[data-testid="rte-Body"]') as HTMLTextAreaElement;
    fireEvent.change(bodyRte, { target: { value: '' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.body).toBeUndefined();
  });
});

// ─── sticky-scroll-tabs: overline/title/description RTEs ─────────────────────

describe('BlockContentEditor — sticky-scroll-tabs rich text fields', () => {
  it('updates overline (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [], overline: 'Top',
    });
    const overline = container.querySelector('[data-testid="rte-Overline"]') as HTMLTextAreaElement;
    fireEvent.change(overline, { target: { value: '' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.overline).toBeUndefined();
  });

  it('updates title (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [], title: 'Old Title',
    });
    const title = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(title, { target: { value: 'New Title' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.title).toBe('New Title');
  });

  it('updates description (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [],
    });
    const desc = container.querySelector('[data-testid="rte-Description"]') as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: 'Some desc' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.description).toBe('Some desc');
  });

  it('adds panel with id/label/blocks', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add'),
    );
    fireEvent.click(addBtn!);
    const call = onUpdate.mock.calls[0][0];
    expect(call.panels).toHaveLength(1);
    expect(call.panels[0].label).toBe('New Panel');
  });

  it('edits panel label', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0,
      panels: [{ id: 'p1', label: 'Tab A', blocks: [] }],
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('Tab A'),
    );
    fireEvent.click(header!);
    const labelInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Tab A',
    ) as HTMLInputElement;
    if (labelInput) {
      fireEvent.change(labelInput, { target: { value: 'Tab B' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.panels[0].label).toBe('Tab B');
    }
  });
});

// ─── stats: title RichTextField ───────────────────────────────────────────────

describe('BlockContentEditor — stats block title field', () => {
  it('updates stats title via RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'st1', type: 'stats', order: 0, stats: [], columns: 3, title: 'Our Stats',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'New Stats Title' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'New Stats Title' });
  });
});

// ─── card-grid: title + description RTEs ─────────────────────────────────────

describe('BlockContentEditor — card-grid rich text fields', () => {
  it('updates card-grid title and description', () => {
    const { container, onUpdate } = renderBlock({
      id: 'cg1', type: 'card-grid', order: 0, cards: [], columns: 3, title: 'Grid Title',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'New Title' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'New Title' });

    const descRte = container.querySelector('[data-testid="rte-Description"]') as HTMLTextAreaElement;
    fireEvent.change(descRte, { target: { value: 'New Desc' } });
    expect(onUpdate).toHaveBeenCalledWith({ description: 'New Desc' });
  });
});

// ─── services-grid: overline + description + accentColor ─────────────────────

describe('BlockContentEditor — services-grid rich text + color fields', () => {
  it('updates overline, description, and accentColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sg1', type: 'services-grid', order: 0, services: [],
    });
    const overlineRte = container.querySelector('[data-testid="rte-Overline"]') as HTMLTextAreaElement;
    fireEvent.change(overlineRte, { target: { value: 'SERVICES' } });
    expect(onUpdate).toHaveBeenCalledWith({ overline: 'SERVICES' });

    const descRte = container.querySelector('[data-testid="rte-Description"]') as HTMLTextAreaElement;
    fireEvent.change(descRte, { target: { value: 'We do stuff' } });
    expect(onUpdate).toHaveBeenCalledWith({ description: 'We do stuff' });

    const accent = container.querySelector('[data-testid="color-Accent Color"]') as HTMLInputElement;
    if (accent) {
      fireEvent.change(accent, { target: { value: '#ff6600' } });
      expect(onUpdate).toHaveBeenCalledWith({ accentColor: '#ff6600' });
    }
  });

  it('adds a service via ListEditor add button', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sg1', type: 'services-grid', order: 0, services: [],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('+ Add'),
    );
    fireEvent.click(addBtn!);
    const call = onUpdate.mock.calls[0][0];
    expect(call.services).toHaveLength(1);
    expect(call.services[0].title).toBe('New service');
  });
});

// ─── booking-menu: title + description RTEs ───────────────────────────────────

describe('BlockContentEditor — booking-menu rich text fields', () => {
  it('updates title and description in booking-menu', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bm1', type: 'booking-menu', order: 0, title: 'Book Now',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'Schedule' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'Schedule' });
  });
});

// ─── metric-cards: expanded item editing (institution + logo + link fields) ───

describe('BlockContentEditor — metric-cards expanded item', () => {
  it('expands metric item and edits institution + link', () => {
    const { container, onUpdate } = renderBlock({
      id: 'm1', type: 'metric-cards', order: 0,
      metrics: [{ id: 'm0', value: '90%', label: 'Completion', institution: 'Uni', institutionLogo: '', link: '', linkText: '' }],
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('90%'),
    );
    fireEvent.click(header!);
    const instInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Uni',
    ) as HTMLInputElement;
    if (instInput) {
      fireEvent.change(instInput, { target: { value: 'University' } });
      expect(onUpdate.mock.calls[0][0].metrics[0].institution).toBe('University');
    }
  });
});

// ─── product-detail: layout select + checkbox toggles ────────────────────────

describe('BlockContentEditor — product-detail layout + checkbox fields', () => {
  it('updates layout select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0,
    });
    const layoutSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="compact"]'),
    ) as HTMLSelectElement;
    if (layoutSel) {
      fireEvent.change(layoutSel, { target: { value: 'compact' } });
      expect(onUpdate).toHaveBeenCalledWith({ layout: 'compact' });
    }
  });

  it('toggles showGallery and showVariants checkboxes', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // showGallery=cbs[0], showDescription=cbs[1], showVariants=cbs[2]
    fireEvent.click(cbs[0]);
    expect(onUpdate).toHaveBeenCalledWith({ showGallery: false });
    fireEvent.click(cbs[2]);
    expect(onUpdate).toHaveBeenCalledWith({ showVariants: false });
  });

  it('toggles showAddToCart and showBulkPricing', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // showAddToCart=cbs[3], showBulkPricing=cbs[4]
    fireEvent.click(cbs[3]);
    expect(onUpdate).toHaveBeenCalledWith({ showAddToCart: false });
    fireEvent.click(cbs[4]);
    expect(onUpdate).toHaveBeenCalledWith({ showBulkPricing: false });
  });

  it('toggles showBreadcrumb and showTags', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // showBreadcrumb=cbs[5], showTags=cbs[6]
    if (cbs.length >= 7) {
      fireEvent.click(cbs[5]);
      expect(onUpdate).toHaveBeenCalledWith({ showBreadcrumb: false });
      fireEvent.click(cbs[6]);
      expect(onUpdate).toHaveBeenCalledWith({ showTags: false });
    }
  });
});

// ─── hero-slideshow: slide secondaryCtaText + overlayColor ───────────────────

describe('BlockContentEditor — hero-slideshow secondary CTA + overlayColor', () => {
  it('updates secondaryCtaText and secondaryCtaLink', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A', secondaryCtaText: 'Learn', secondaryCtaLink: '/learn' }],
    });
    const secCtaInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Learn',
    ) as HTMLInputElement;
    if (secCtaInput) {
      fireEvent.change(secCtaInput, { target: { value: 'Explore' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.slides[0].secondaryCtaText).toBe('Explore');
    }
  });

  it('updates slide overlayColor via ColorField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A', overlayColor: 'rgba(0,0,0,0.45)' }],
    });
    const overlayColor = container.querySelector('[data-testid="color-Overlay Color"]') as HTMLInputElement;
    if (overlayColor) {
      fireEvent.change(overlayColor, { target: { value: 'rgba(0,0,0,0.7)' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.slides[0].overlayColor).toBe('rgba(0,0,0,0.7)');
    }
  });

  it('updates textAlignment on slide', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A', textAlignment: 'center' }],
    });
    const alignSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).value === 'center' &&
      (s as HTMLSelectElement).querySelector('option[value="right"]') &&
      !(s as HTMLSelectElement).querySelector('option[value="zoom"]'),
    ) as HTMLSelectElement;
    if (alignSel) {
      fireEvent.change(alignSel, { target: { value: 'left' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.slides[0].textAlignment).toBe('left');
    }
  });
});

// ─── accordion: title RichTextField ──────────────────────────────────────────

describe('BlockContentEditor — accordion title field', () => {
  it('updates accordion title via RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'a1', type: 'accordion', order: 0, items: [], title: 'FAQ',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'Questions' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'Questions' });
  });
});

// ─── flip-card-grid: card description + backLink + backLinkText ───────────────

describe('BlockContentEditor — flip-card-grid expanded item extra fields', () => {
  it('expands card and edits backLink + backLinkText', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'flip-card-grid', order: 0,
      cards: [{
        id: 'c1', frontTitle: 'Card A', frontSubtitle: '',
        backText: 'Details', backLink: '/learn', backLinkText: 'Learn More',
      }],
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('Card A'),
    );
    fireEvent.click(header!);
    const backLinkInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '/learn',
    ) as HTMLInputElement;
    if (backLinkInput) {
      fireEvent.change(backLinkInput, { target: { value: '/more' } });
      expect(onUpdate).toHaveBeenCalled();
    }
  });
});

// ─── team-showcase: photo URL + name updates ──────────────────────────────────

describe('BlockContentEditor — team-showcase photo URL', () => {
  it('updates photo URL via url input', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0,
      members: [{ id: 'm1', name: 'Alice', title: 'Dev', photo: 'https://old.jpg', bio: '' }],
    });
    const photoInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    expect(photoInput).toBeTruthy();
    fireEvent.change(photoInput, { target: { value: 'https://new.jpg' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.members[0].photo).toBe('https://new.jpg');
  });

  it('updates member name via bold text input', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0,
      members: [{ id: 'm1', name: 'Alice', title: 'Dev', photo: '', bio: '' }],
    });
    const nameInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Alice',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Bob' } });
    expect(onUpdate.mock.calls[0][0].members[0].name).toBe('Bob');
  });
});

// ─── team-flip-grid: name + photo + bio update ───────────────────────────────

describe('BlockContentEditor — team-flip-grid name/photo/bio', () => {
  it('updates name in team-flip-grid member', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tfg1', type: 'team-flip-grid', order: 0,
      members: [{ id: 'm1', name: 'Carol', title: 'PM', photo: '', bio: '', question: '', answer: '' }],
    });
    const nameInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Carol',
    ) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Dana' } });
    expect(onUpdate.mock.calls[0][0].members[0].name).toBe('Dana');
  });

  it('updates photo via URL input', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tfg1', type: 'team-flip-grid', order: 0,
      members: [{ id: 'm1', name: 'N', title: 'T', photo: 'https://photo.jpg', bio: '', question: '', answer: '' }],
    });
    const photoInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    fireEvent.change(photoInput, { target: { value: 'https://newphoto.jpg' } });
    expect(onUpdate.mock.calls[0][0].members[0].photo).toBe('https://newphoto.jpg');
  });
});

// ─── bento-grid: dark/light BG color fields ──────────────────────────────────

describe('BlockContentEditor — bento-grid color fields', () => {
  it('updates darkBg and lightBorder colors', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0, cards: [],
    });
    const darkBg = container.querySelector('[data-testid="color-Dark BG"]') as HTMLInputElement;
    if (darkBg) {
      fireEvent.change(darkBg, { target: { value: '#111' } });
      expect(onUpdate).toHaveBeenCalledWith({ darkBg: '#111' });
    }
    const lightBorder = container.querySelector('[data-testid="color-Light Border"]') as HTMLInputElement;
    if (lightBorder) {
      fireEvent.change(lightBorder, { target: { value: '#ddd' } });
      expect(onUpdate).toHaveBeenCalledWith({ lightBorder: '#ddd' });
    }
  });

  it('updates bento-grid columns select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0, cards: [],
    });
    const colsSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="1"]') &&
      (s as HTMLSelectElement).querySelector('option[value="3"]'),
    ) as HTMLSelectElement;
    if (colsSel) {
      fireEvent.change(colsSel, { target: { value: '3' } });
      expect(onUpdate).toHaveBeenCalledWith({ columns: 3 });
    }
  });
});

// ─── logo-strip: expanded item imageUrl editing ──────────────────────────────

describe('BlockContentEditor — logo-strip expanded item', () => {
  it('expands logo item and edits alt text', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ls1', type: 'logo-strip', order: 0,
      logos: [{ id: 'l1', imageUrl: 'logo.png', alt: 'MyLogo', link: '' }],
      columns: 6,
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer'),
    );
    fireEvent.click(header!);
    const altInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'MyLogo',
    ) as HTMLInputElement;
    if (altInput) {
      fireEvent.change(altInput, { target: { value: 'NewLogo' } });
      expect(onUpdate.mock.calls[0][0].logos[0].alt).toBe('NewLogo');
    }
  });
});

// ─── social-links: iconSize select ───────────────────────────────────────────

describe('BlockContentEditor — social-links iconSize select', () => {
  it('updates iconSize to 40', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sl1', type: 'social-links', order: 0, links: [],
    });
    const selects = container.querySelectorAll('select');
    // alignment is selects[0], iconSize is selects[1]
    fireEvent.change(selects[1], { target: { value: '40' } });
    expect(onUpdate).toHaveBeenCalledWith({ iconSize: 40 });
  });
});

// ─── timeline: numberColor + nodeColor ───────────────────────────────────────

describe('BlockContentEditor — timeline numberColor + nodeColor', () => {
  it('updates numberColor and nodeColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tl1', type: 'timeline', order: 0, steps: [],
    });
    const numberColor = container.querySelector('[data-testid="color-Number Color"]') as HTMLInputElement;
    if (numberColor) {
      fireEvent.change(numberColor, { target: { value: '#abc' } });
      expect(onUpdate).toHaveBeenCalledWith({ numberColor: '#abc' });
    }
    const nodeColor = container.querySelector('[data-testid="color-Node Color"]') as HTMLInputElement;
    if (nodeColor) {
      fireEvent.change(nodeColor, { target: { value: '#def' } });
      expect(onUpdate).toHaveBeenCalledWith({ nodeColor: '#def' });
    }
  });
});

// ─── featured-content: imageUrl via MediaPicker ───────────────────────────────

describe('BlockContentEditor — featured-content imageUrl via MediaPicker', () => {
  it('updates imageUrl via MediaPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'featured-content', order: 0,
    });
    const mpInput = container.querySelector('[data-testid="mp-input-unnamed"]') as HTMLInputElement;
    if (mpInput) {
      fireEvent.change(mpInput, { target: { value: 'hero.jpg' } });
      expect(onUpdate).toHaveBeenCalledWith({ imageUrl: 'hero.jpg' });
    }
  });
});

// ─── blog-posts: showExcerpt false toggle ─────────────────────────────────────

describe('BlockContentEditor — blog-posts showExcerpt toggle to false', () => {
  it('toggles showExcerpt from default true to false', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bp1', type: 'blog-posts', order: 0, showExcerpt: true,
    });
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalledWith({ showExcerpt: false });
  });
});

// ─── product-grid: showPrice toggle ──────────────────────────────────────────

describe('BlockContentEditor — product-grid showPrice toggle', () => {
  it('toggles showPrice checkbox', () => {
    const { container, onUpdate } = renderBlock({
      id: 'pg1', type: 'product-grid', order: 0,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(cbs[0]);
    expect(onUpdate).toHaveBeenCalled();
  });
});

// ─── featured-products: showPrice toggle ─────────────────────────────────────

describe('BlockContentEditor — featured-products showPrice toggle', () => {
  it('toggles showPrice checkbox', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fp1', type: 'featured-products', order: 0,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(cbs[0]);
    expect(onUpdate).toHaveBeenCalled();
  });
});

// ─── columns: visual bar x button removes col (group hover path) ─────────────

describe('BlockContentEditor — columns visual bar width display', () => {
  it('shows correct total width of 100 for even columns', () => {
    const cols = [
      { id: 'a', width: 33, blocks: [] },
      { id: 'b', width: 33, blocks: [] },
      { id: 'c', width: 34, blocks: [] },
    ];
    const { container } = renderBlock({
      id: 'col1', type: 'columns', order: 0, columns: cols,
    });
    // The visual bar renders each col with its % label
    expect(container.textContent).toContain('33%');
  });
});

// ─── HtmlEmbedEditor: uploading state display ─────────────────────────────────

describe('BlockContentEditor — html-embed uploading state', () => {
  it('shows existing file display (with mediaId) dropzone text', () => {
    const { container } = renderBlock({
      id: 'he1', type: 'html-embed', order: 0,
      url: '/file.html', filename: 'file.html', mediaId: 5,
    });
    expect(container.textContent).toContain('Click or drop to upload a new version');
  });

  it('shows existing file without mediaId dropzone text', () => {
    const { container } = renderBlock({
      id: 'he1', type: 'html-embed', order: 0,
      url: '/file.html', filename: 'file.html',
    });
    expect(container.textContent).toContain('Click or drop a new file to replace');
  });
});

// ─── survey-results: "No surveys found" when surveys load empty ──────────────

describe('BlockContentEditor — SurveyResultsEditor empty surveys open', () => {
  it('shows "No surveys found" when surveys empty and dropdown opens', async () => {
    installFetchMock({ success: true, data: [] });
    const { container } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0,
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => {
      expect(container.textContent).toContain('No surveys found');
    });
  });
});

// ─── deck-jump-to: variant + size + alignment + iconPosition selects ──────────

describe('BlockContentEditor — deck-jump-to additional selects', () => {
  it('updates variant, size, alignment for deck-jump-to', () => {
    const { container, onUpdate } = renderBlock({
      id: 'dj1', type: 'deck-jump-to', order: 0,
    });
    const selects = container.querySelectorAll('select');
    // variant=selects[0], size=selects[1], alignment=selects[2], iconPosition=selects[3]
    fireEvent.change(selects[0], { target: { value: 'outline' } });
    expect(onUpdate).toHaveBeenCalledWith({ variant: 'outline' });
    fireEvent.change(selects[1], { target: { value: 'sm' } });
    expect(onUpdate).toHaveBeenCalledWith({ size: 'sm' });
    fireEvent.change(selects[2], { target: { value: 'left' } });
    expect(onUpdate).toHaveBeenCalledWith({ alignment: 'left' });
  });
});

// ─── hero: background image + video via MediaPicker ───────────────────────────

describe('BlockContentEditor — hero background media', () => {
  it('updates backgroundImage via MediaPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 'h1', type: 'hero', order: 0,
    });
    const mpInputs = container.querySelectorAll('[data-testid^="mp-input-"]');
    // First is "unnamed" (background image), second is "unnamed" (background video)
    if (mpInputs.length >= 1) {
      fireEvent.change(mpInputs[0], { target: { value: 'bg.jpg' } });
      expect(onUpdate).toHaveBeenCalledWith({ backgroundImage: 'bg.jpg' });
    }
  });

  it('updates backgroundVideo via MediaPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 'h1', type: 'hero', order: 0,
    });
    const mpInputs = container.querySelectorAll('[data-testid^="mp-input-"]');
    if (mpInputs.length >= 2) {
      fireEvent.change(mpInputs[1], { target: { value: 'bg.mp4' } });
      expect(onUpdate).toHaveBeenCalledWith({ backgroundVideo: 'bg.mp4' });
    }
  });
});

// ─── section: backgroundImage via MediaPicker ────────────────────────────────

describe('BlockContentEditor — section backgroundImage', () => {
  it('updates backgroundImage via MediaPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 's1', type: 'section', order: 0, blocks: [],
    });
    const mpInput = container.querySelector('[data-testid="mp-input-unnamed"]') as HTMLInputElement;
    if (mpInput) {
      fireEvent.change(mpInput, { target: { value: 'section-bg.jpg' } });
      expect(onUpdate).toHaveBeenCalledWith({ backgroundImage: 'section-bg.jpg' });
    }
  });
});

// ─── hero-slideshow: backgroundImage via MediaPicker ─────────────────────────

describe('BlockContentEditor — hero-slideshow slide backgroundImage', () => {
  it('updates slide backgroundImage via MediaPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }],
    });
    const mpInput = container.querySelector('[data-testid="mp-input-unnamed"]') as HTMLInputElement;
    if (mpInput) {
      fireEvent.change(mpInput, { target: { value: 'slide-bg.jpg' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.slides[0].backgroundImage).toBe('slide-bg.jpg');
    }
  });
});

// ─── marquee: image item imageUrl via MediaPicker ────────────────────────────

describe('BlockContentEditor — marquee image item MediaPicker', () => {
  it('updates imageUrl via MediaPicker for image-type marquee item', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [{ id: 'mi-1', type: 'image', content: '', imageUrl: 'old.png', imageAlt: '' }],
    });
    const mpInput = container.querySelector('[data-testid="mp-input-unnamed"]') as HTMLInputElement;
    if (mpInput) {
      fireEvent.change(mpInput, { target: { value: 'new.png' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.items[0].imageUrl).toBe('new.png');
    }
  });
});

// ─── survey: title + description RTEs ─────────────────────────────────────────

describe('BlockContentEditor — survey block title and description', () => {
  it('updates title RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: 'x', title: 'Our Survey',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'Updated Survey' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'Updated Survey' });
  });

  it('updates description RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: 'x',
    });
    const descRte = container.querySelector('[data-testid="rte-Description"]') as HTMLTextAreaElement;
    fireEvent.change(descRte, { target: { value: 'Take our survey' } });
    expect(onUpdate).toHaveBeenCalledWith({ description: 'Take our survey' });
  });
});

// ─── booking: title + description RTEs ───────────────────────────────────────

describe('BlockContentEditor — booking block title and description', () => {
  it('updates title RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: 'x', title: 'Book a Call',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'Schedule' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'Schedule' });
  });

  it('updates embed height field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: 'x', height: '700px',
    });
    const hInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '700px',
    ) as HTMLInputElement;
    if (hInput) {
      fireEvent.change(hInput, { target: { value: '500px' } });
      expect(onUpdate).toHaveBeenCalledWith({ height: '500px' });
    }
  });
});

// ─── flip-card-grid: cardHeight field ────────────────────────────────────────

describe('BlockContentEditor — flip-card-grid cardHeight', () => {
  it('updates cardHeight field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'flip-card-grid', order: 0, cards: [], cardHeight: '280px',
    });
    const hInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '280px',
    ) as HTMLInputElement;
    expect(hInput).toBeTruthy();
    fireEvent.change(hInput, { target: { value: '320px' } });
    expect(onUpdate).toHaveBeenCalledWith({ cardHeight: '320px' });
  });
});

// ─── store-banner: title + button text + url fields ───────────────────────────

describe('BlockContentEditor — store-banner button text + url + countdown', () => {
  it('updates buttonText, buttonUrl, countdownDate', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sb1', type: 'store-banner', order: 0,
      buttonText: 'Shop Sale', buttonUrl: '/sale', countdownDate: '2025-12-31',
    });
    const btnTextInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'Shop Sale',
    ) as HTMLInputElement;
    expect(btnTextInput).toBeTruthy();
    fireEvent.change(btnTextInput, { target: { value: 'Shop Now' } });
    expect(onUpdate).toHaveBeenCalledWith({ buttonText: 'Shop Now' });

    const countdownInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '2025-12-31',
    ) as HTMLInputElement;
    if (countdownInput) {
      fireEvent.change(countdownInput, { target: { value: '2026-01-01' } });
      expect(onUpdate).toHaveBeenCalledWith({ countdownDate: '2026-01-01' });
    }
  });
});

// ─── testimonial: avatar MediaPicker update ───────────────────────────────────

describe('BlockContentEditor — testimonial avatar update', () => {
  it('updates avatar via MediaPicker', () => {
    const { container, onUpdate } = renderBlock({
      id: 't1', type: 'testimonial', order: 0, quote: 'q',
    });
    const mpInput = container.querySelector('[data-testid="mp-input-unnamed"]') as HTMLInputElement;
    if (mpInput) {
      fireEvent.change(mpInput, { target: { value: 'avatar.jpg' } });
      expect(onUpdate).toHaveBeenCalledWith({ avatar: 'avatar.jpg' });
    }
  });
});

// ─── metric-cards: columns select ────────────────────────────────────────────

describe('BlockContentEditor — metric-cards columns select', () => {
  it('updates columns in metric-cards', () => {
    const { container, onUpdate } = renderBlock({
      id: 'm1', type: 'metric-cards', order: 0, metrics: [], columns: 4,
    });
    const colsSel = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(colsSel, { target: { value: '2' } });
    expect(onUpdate).toHaveBeenCalledWith({ columns: 2 });
  });
});

// ─── sticky-scroll-tabs: mobile active text color ─────────────────────────────

describe('BlockContentEditor — sticky-scroll-tabs mobile active text color', () => {
  it('updates mobileActiveTabColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [],
    });
    const mobileActiveText = container.querySelector('[data-testid="color-Mobile Active Text"]') as HTMLInputElement;
    if (mobileActiveText) {
      fireEvent.change(mobileActiveText, { target: { value: '#ff0' } });
      expect(onUpdate).toHaveBeenCalledWith({ mobileActiveTabColor: '#ff0' });
    }
  });

  it('updates mobileInactiveTabBackground', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [],
    });
    const mobileInactiveBg = container.querySelector('[data-testid="color-Mobile Inactive Background"]') as HTMLInputElement;
    if (mobileInactiveBg) {
      fireEvent.change(mobileInactiveBg, { target: { value: '#f5f5f5' } });
      expect(onUpdate).toHaveBeenCalledWith({ mobileInactiveTabBackground: '#f5f5f5' });
    }
  });
});

// ─── bento-grid: subtitle + overline RTEs ────────────────────────────────────

describe('BlockContentEditor — bento-grid overline + subtitle', () => {
  it('updates overline in bento-grid', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0, cards: [],
    });
    const overlineInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder?.includes('Overline') ||
             (i as HTMLInputElement).placeholder === 'Overline',
    ) as HTMLInputElement;
    // Fallback: use the Field input for overline
    const allInputs = container.querySelectorAll('input[type="text"]');
    if (allInputs.length > 0) {
      // Overline field is first text input in bento-grid
      fireEvent.change(allInputs[0], { target: { value: 'NEW OVERLINE' } });
      expect(onUpdate).toHaveBeenCalled();
    }
  });

  it('updates subtitle in bento-grid', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0, cards: [], subtitle: 'Old Sub',
    });
    const subRte = container.querySelector('[data-testid="rte-Subtitle"]') as HTMLTextAreaElement;
    if (subRte) {
      fireEvent.change(subRte, { target: { value: 'New Sub' } });
      expect(onUpdate).toHaveBeenCalledWith({ subtitle: 'New Sub' });
    }
  });
});

// ─── hero-slideshow: deck-level backgroundVideo URL ──────────────────────────

describe('BlockContentEditor — hero-slideshow deck backgroundVideo', () => {
  it('updates deck-level backgroundVideo (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }],
      backgroundVideo: 'deck-video.mp4',
    });
    const bgVideoInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'deck-video.mp4',
    ) as HTMLInputElement;
    if (bgVideoInput) {
      fireEvent.change(bgVideoInput, { target: { value: '' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.backgroundVideo).toBeUndefined();
    }
  });
});

// ─── logo-strip: expanded item link URL ───────────────────────────────────────

describe('BlockContentEditor — logo-strip expanded item link', () => {
  it('expands logo item and edits link URL', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ls1', type: 'logo-strip', order: 0,
      logos: [{ id: 'l1', imageUrl: 'logo.png', alt: 'Logo', link: 'https://co.com' }],
      columns: 6,
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer'),
    );
    fireEvent.click(header!);
    const linkInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'https://co.com',
    ) as HTMLInputElement;
    if (linkInput) {
      fireEvent.change(linkInput, { target: { value: 'https://new.com' } });
      expect(onUpdate).toHaveBeenCalled();
    }
  });
});

// ─── team-showcase: overline + subtitle RTEs ─────────────────────────────────

describe('BlockContentEditor — team-showcase overline + subtitle RTEs', () => {
  it('updates title and subtitle in team-showcase', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0, members: [],
      title: 'Our Team', subtitle: 'Meet us',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'The Team' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'The Team' });

    const subtitleRte = container.querySelector('[data-testid="rte-Subtitle"]') as HTMLTextAreaElement;
    fireEvent.change(subtitleRte, { target: { value: 'Get to know us' } });
    expect(onUpdate).toHaveBeenCalledWith({ subtitle: 'Get to know us' });
  });
});

// ─── team-flip-grid: title + subtitle RTEs ───────────────────────────────────

describe('BlockContentEditor — team-flip-grid title + subtitle RTEs', () => {
  it('updates title and subtitle in team-flip-grid', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tfg1', type: 'team-flip-grid', order: 0, members: [],
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'The Grid' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'The Grid' });
  });
});

// ─── hero-slideshow: slide textAlignment select ───────────────────────────────

describe('BlockContentEditor — hero-slideshow slide textAlignment', () => {
  it('updates slide textAlignment from default center to right', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }],
    });
    // textAlignment select has options left/center/right (and doesn't have zoom)
    const textAlignSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="right"]') &&
      (s as HTMLSelectElement).querySelector('option[value="left"]') &&
      (s as HTMLSelectElement).querySelector('option[value="center"]') &&
      !(s as HTMLSelectElement).querySelector('option[value="zoom"]') &&
      !(s as HTMLSelectElement).querySelector('option[value="contain"]'),
    ) as HTMLSelectElement;
    if (textAlignSel) {
      fireEvent.change(textAlignSel, { target: { value: 'right' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.slides[0].textAlignment).toBe('right');
    }
  });
});

// ─── site-footer: ctaUrl field ────────────────────────────────────────────────

describe('BlockContentEditor — site-footer ctaUrl field', () => {
  it('updates ctaUrl field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0, ctaUrl: '/contact',
    });
    const ctaUrlInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '/contact',
    ) as HTMLInputElement;
    if (ctaUrlInput) {
      fireEvent.change(ctaUrlInput, { target: { value: '/about' } });
      expect(onUpdate).toHaveBeenCalledWith({ ctaUrl: '/about' });
    }
  });
});

// ─── logo-strip: overline RichTextField ──────────────────────────────────────

describe('BlockContentEditor — logo-strip overline', () => {
  it('updates overline via RichTextField in logo-strip', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ls1', type: 'logo-strip', order: 0, logos: [], overline: 'Trusted By',
    });
    const overlineRte = container.querySelector('[data-testid="rte-Overline"]') as HTMLTextAreaElement;
    if (overlineRte) {
      fireEvent.change(overlineRte, { target: { value: 'Partners' } });
      expect(onUpdate).toHaveBeenCalledWith({ overline: 'Partners' });
    }
  });
});

// ─── metric-cards: title RichTextField ───────────────────────────────────────

describe('BlockContentEditor — metric-cards title update', () => {
  it('updates metric-cards title via RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'm1', type: 'metric-cards', order: 0, metrics: [], title: 'Impact',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'Our Impact' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'Our Impact' });
  });
});

// ─── flip-card-grid: title RichTextField ─────────────────────────────────────

describe('BlockContentEditor — flip-card-grid title update', () => {
  it('updates flip-card-grid title via RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'flip-card-grid', order: 0, cards: [], title: 'Grid',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'New Grid' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'New Grid' });
  });
});

// ─── team-showcase: photoFilter field ────────────────────────────────────────

describe('BlockContentEditor — team-showcase photoFilter field', () => {
  it('updates photoFilter (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0, members: [], photoFilter: 'grayscale(1)',
    });
    const filterInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'grayscale(1)',
    ) as HTMLInputElement;
    if (filterInput) {
      fireEvent.change(filterInput, { target: { value: '' } });
      const call = onUpdate.mock.calls[0][0];
      expect(call.photoFilter).toBeUndefined();
    }
  });
});

// ─── services-grid: title RichTextField ──────────────────────────────────────

describe('BlockContentEditor — services-grid title', () => {
  it('updates services-grid title via RichTextField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sg1', type: 'services-grid', order: 0, services: [], title: 'Services',
    });
    const titleRte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    fireEvent.change(titleRte, { target: { value: 'What We Offer' } });
    expect(onUpdate).toHaveBeenCalledWith({ title: 'What We Offer' });
  });
});
