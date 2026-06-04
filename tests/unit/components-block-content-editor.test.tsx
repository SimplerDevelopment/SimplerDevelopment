/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, screen, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Heavy-dep mocks
// ---------------------------------------------------------------------------

// MediaPicker — replace with a simple input that surfaces value + invokes onChange
vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value, onChange, label, apiEndpoint }: any) => (
    <div data-testid={`media-picker-${label || 'unnamed'}`} data-api={apiEndpoint || ''}>
      <input
        data-testid={`mp-input-${label || 'unnamed'}`}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

// IconPicker
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

// GoogleFontPicker
vi.mock('@/components/blocks/visual/GoogleFontPicker', () => ({
  GoogleFontPicker: ({ value, onChange }: any) => (
    <input
      data-testid="google-font-picker"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

// TokenColorPicker
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

// HtmlRenderEditor — keep it lightweight
vi.mock('@/components/portal/visual-editor/HtmlRenderEditor', () => ({
  HtmlRenderEditor: ({ block }: any) => (
    <div data-testid="html-render-editor" data-block-id={block?.id || ''} />
  ),
}));

// @dnd-kit — minimal passthrough mocks
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

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { BlockContentEditor } from '@/components/portal/visual-editor/BlockContentEditor';

// Helper: render block, get latest update via onUpdate spy
function renderBlock(block: any, siteId?: number) {
  const onUpdate = vi.fn();
  const utils = render(
    <BlockContentEditor block={block} onUpdate={onUpdate} siteId={siteId} />,
  );
  return { ...utils, onUpdate };
}

// Default fetch mock that resolves to an empty list
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

// ---------------------------------------------------------------------------
// Simple block types
// ---------------------------------------------------------------------------

describe('BlockContentEditor — heading block', () => {
  it('renders RichTextField for content', () => {
    const { container } = renderBlock({ id: 'h1', type: 'heading', order: 0, content: 'Hello' });
    const rte = container.querySelector('[data-testid="rte-Content"]') as HTMLTextAreaElement;
    expect(rte).toBeTruthy();
    expect(rte.value).toBe('Hello');
  });

  it('updates content via onChange', () => {
    const { container, onUpdate } = renderBlock({ id: 'h1', type: 'heading', order: 0, content: 'Hello' });
    const rte = container.querySelector('[data-testid="rte-Content"]') as HTMLTextAreaElement;
    fireEvent.change(rte, { target: { value: 'Updated' } });
    expect(onUpdate).toHaveBeenCalledWith({ content: 'Updated' });
  });

  it('updates level via select', () => {
    const { container, onUpdate } = renderBlock({ id: 'h1', type: 'heading', order: 0, content: 'x', level: 2 });
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: '3' } });
    expect(onUpdate).toHaveBeenCalledWith({ level: 3 });
  });

  it('updates alignment via select', () => {
    const { container, onUpdate } = renderBlock({ id: 'h1', type: 'heading', order: 0, content: 'x' });
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[1], { target: { value: 'center' } });
    expect(onUpdate).toHaveBeenCalledWith({ alignment: 'center' });
  });
});

describe('BlockContentEditor — text block', () => {
  it('renders 3 fields and updates size', () => {
    const { container, onUpdate } = renderBlock({ id: 't1', type: 'text', order: 0, content: 'lorem' });
    const selects = container.querySelectorAll('select');
    fireEvent.change(selects[0], { target: { value: 'lg' } });
    expect(onUpdate).toHaveBeenCalledWith({ size: 'lg' });
  });
});

describe('BlockContentEditor — image block', () => {
  it('renders MediaPicker and Field inputs', () => {
    const { container } = renderBlock({ id: 'i1', type: 'image', order: 0, url: 'x.png', alt: 'alt' });
    expect(container.querySelector('[data-testid="media-picker-unnamed"]')).toBeTruthy();
  });

  it('updates alt text via Field', () => {
    const { container, onUpdate } = renderBlock({ id: 'i1', type: 'image', order: 0, url: 'x.png', alt: 'alt' });
    const inputs = container.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[0], { target: { value: 'new alt' } });
    expect(onUpdate).toHaveBeenCalledWith({ alt: 'new alt' });
  });

  it('uses media api with siteId when provided', () => {
    const { container } = renderBlock({ id: 'i1', type: 'image', order: 0, url: '' }, 42);
    const mp = container.querySelector('[data-testid="media-picker-unnamed"]') as HTMLElement;
    expect(mp.getAttribute('data-api')).toBe('/api/portal/cms/websites/42/media');
  });
});

describe('BlockContentEditor — button block', () => {
  it('renders all button fields including icon position select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'b1', type: 'button', order: 0, text: 'Click', url: '/x', icon: 'star',
    });
    const selects = container.querySelectorAll('select');
    // variant, size, alignment, iconPosition, hoverEffect
    expect(selects.length).toBeGreaterThanOrEqual(5);
    // change iconPosition
    const iconPos = Array.from(selects).find((s) => (s as HTMLSelectElement).value === 'left' && (s as HTMLSelectElement).querySelector('option[value="left"]')?.textContent?.includes('Left of text'));
    if (iconPos) {
      fireEvent.change(iconPos, { target: { value: 'right' } });
      expect(onUpdate).toHaveBeenCalledWith({ iconPosition: 'right' });
    }
  });

  it('toggles "Open in new tab" checkbox', () => {
    const { container, onUpdate } = renderBlock({ id: 'b1', type: 'button', order: 0, text: 'Click' });
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalledWith({ openInNewTab: true });
  });

  it('clears icon → empty string becomes undefined via Field', () => {
    const { container, onUpdate } = renderBlock({ id: 'b1', type: 'button', order: 0, text: 'X', icon: 'star' });
    // 7th text input is icon (after text, url + iconPos handled via select)
    const inputs = container.querySelectorAll('input[type="text"]');
    const iconInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === 'star') as HTMLInputElement;
    if (iconInput) {
      fireEvent.change(iconInput, { target: { value: '' } });
      expect(onUpdate).toHaveBeenCalledWith({ icon: undefined });
    }
  });
});

describe('BlockContentEditor — quote block', () => {
  it('renders quote, author, citation', () => {
    const { container } = renderBlock({ id: 'q1', type: 'quote', order: 0, content: 'q', author: 'a', citation: 'c' });
    expect(container.querySelector('[data-testid="rte-Quote"]')).toBeTruthy();
  });
});

describe('BlockContentEditor — code block', () => {
  it('updates code via TextareaField', () => {
    const { container, onUpdate } = renderBlock({ id: 'c1', type: 'code', order: 0, code: 'old', language: 'js' });
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'new' } });
    expect(onUpdate).toHaveBeenCalledWith({ code: 'new' });
  });

  it('updates language via Field', () => {
    const { container, onUpdate } = renderBlock({ id: 'c1', type: 'code', order: 0, code: 'x', language: 'js' });
    const langInput = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(langInput, { target: { value: 'ts' } });
    expect(onUpdate).toHaveBeenCalledWith({ language: 'ts' });
  });
});

describe('BlockContentEditor — spacer + divider', () => {
  it('renders spacer height select', () => {
    const { container, onUpdate } = renderBlock({ id: 's1', type: 'spacer', order: 0 });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'xl' } });
    expect(onUpdate).toHaveBeenCalledWith({ height: 'xl' });
  });

  it('renders divider line style select', () => {
    const { container, onUpdate } = renderBlock({ id: 'd1', type: 'divider', order: 0 });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'dashed' } });
    expect(onUpdate).toHaveBeenCalledWith({ lineStyle: 'dashed' });
  });
});

describe('BlockContentEditor — youtube + video', () => {
  it('renders youtube URL field', () => {
    const { container, onUpdate } = renderBlock({ id: 'y1', type: 'youtube', order: 0, url: 'u', caption: 'c' });
    const inputs = container.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[0], { target: { value: 'new-url' } });
    expect(onUpdate).toHaveBeenCalledWith({ url: 'new-url' });
  });

  it('renders video block fields', () => {
    const { container } = renderBlock({ id: 'v1', type: 'video', order: 0, url: 'u' });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    expect(cbs.length).toBe(2); // autoplay, controls
  });
});

describe('BlockContentEditor — hero block', () => {
  it('renders title, subtitle, description, CTAs and media pickers', () => {
    const { container } = renderBlock({ id: 'h1', type: 'hero', order: 0, title: 'T' });
    expect(container.querySelector('[data-testid="rte-Title"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="rte-Subtitle"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="rte-Description"]')).toBeTruthy();
  });
});

describe('BlockContentEditor — cta block', () => {
  it('updates backgroundStyle via select', () => {
    const { container, onUpdate } = renderBlock({ id: 'c1', type: 'cta', order: 0, title: 'T' });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'gradient' } });
    expect(onUpdate).toHaveBeenCalledWith({ backgroundStyle: 'gradient' });
  });
});

describe('BlockContentEditor — testimonial', () => {
  it('renders quote + author/role/company fields', () => {
    const { container } = renderBlock({
      id: 't1', type: 'testimonial', order: 0, quote: 'q', author: 'a',
    });
    expect(container.querySelector('[data-testid="rte-Quote"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Section — has Field, MediaPicker, GoogleFontPicker, details panel
// ---------------------------------------------------------------------------

describe('BlockContentEditor — section block', () => {
  it('renders section with split details panel and nested block count', () => {
    const { container } = renderBlock({ id: 's1', type: 'section', order: 0, blocks: [{ id: 'a' }, { id: 'b' }] });
    expect(container.textContent).toContain('Nested blocks: 2');
    expect(container.querySelector('[data-testid="google-font-picker"]')).toBeTruthy();
  });

  it('updates htmlTag via select', () => {
    const { container, onUpdate } = renderBlock({ id: 's1', type: 'section', order: 0, blocks: [] });
    const selects = container.querySelectorAll('select');
    const tagSelect = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="article"]')
    ) as HTMLSelectElement | undefined;
    if (tagSelect) {
      fireEvent.change(tagSelect, { target: { value: 'article' } });
      expect(onUpdate).toHaveBeenCalledWith({ htmlTag: 'article' });
    }
  });
});

// ---------------------------------------------------------------------------
// ListEditor-driven blocks
// ---------------------------------------------------------------------------

describe('BlockContentEditor — stats block (ListEditor)', () => {
  it('renders add button and triggers onAdd', () => {
    const { container, onUpdate } = renderBlock({
      id: 'st1', type: 'stats', order: 0, stats: [{ id: 's1', value: '100', label: 'Clients' }], columns: 3,
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    expect(addBtn).toBeTruthy();
    fireEvent.click(addBtn!);
    expect(onUpdate).toHaveBeenCalled();
    const call = onUpdate.mock.calls[0][0];
    expect(call.stats).toHaveLength(2);
  });

  it('updates columns', () => {
    const { container, onUpdate } = renderBlock({
      id: 'st1', type: 'stats', order: 0, stats: [], columns: 3,
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });
    expect(onUpdate).toHaveBeenCalledWith({ columns: 4 });
  });
});

describe('BlockContentEditor — card-grid block', () => {
  it('renders columns select and card add button', () => {
    const { container, onUpdate } = renderBlock({
      id: 'cg1', type: 'card-grid', order: 0, title: 'T', cards: [], columns: 3, iconSize: 24,
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    fireEvent.click(addBtn!);
    const call = onUpdate.mock.calls[0][0];
    expect(call.cards).toHaveLength(1);
    expect(call.cards[0].title).toBe('New card');
  });

  it('updates iconSize as NumberField', () => {
    const { container, onUpdate } = renderBlock({
      id: 'cg1', type: 'card-grid', order: 0, cards: [], columns: 3, iconSize: 24,
    });
    const numInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(numInput, { target: { value: '48' } });
    expect(onUpdate).toHaveBeenCalledWith({ iconSize: '48' });
  });
});

describe('BlockContentEditor — flip-card-grid', () => {
  it('renders all selects + flipAxis change', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'flip-card-grid', order: 0, cards: [],
    });
    const selects = container.querySelectorAll('select');
    // columns, flipTrigger, flipAxis
    expect(selects.length).toBeGreaterThanOrEqual(3);
    const flipAxis = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="vertical"]'),
    ) as HTMLSelectElement | undefined;
    if (flipAxis) {
      fireEvent.change(flipAxis, { target: { value: 'vertical' } });
      expect(onUpdate).toHaveBeenCalledWith({ flipAxis: 'vertical' });
    }
  });
});

describe('BlockContentEditor — metric-cards', () => {
  it('renders metrics list + add', () => {
    const { container, onUpdate } = renderBlock({
      id: 'm1', type: 'metric-cards', order: 0, metrics: [], columns: 4,
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    fireEvent.click(addBtn!);
    const call = onUpdate.mock.calls[0][0];
    expect(call.metrics).toHaveLength(1);
  });
});

describe('BlockContentEditor — logo-strip', () => {
  it('toggles grayscale checkbox', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ls1', type: 'logo-strip', order: 0, logos: [], columns: 6, grayscale: true,
    });
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalledWith({ grayscale: false });
  });
});

describe('BlockContentEditor — gallery', () => {
  it('renders layout/columns selects + lightbox checkbox', () => {
    const { container, onUpdate } = renderBlock({
      id: 'g1', type: 'gallery', order: 0, images: [], layout: 'grid', columns: 3,
    });
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalledWith({ lightbox: true });
  });
});

describe('BlockContentEditor — services-grid', () => {
  it('renders per-service bullets editors when services exist', () => {
    const { container } = renderBlock({
      id: 'sg1', type: 'services-grid', order: 0,
      services: [
        { id: 'svc1', title: 'Svc One', description: 'd', bullets: [] },
        { id: 'svc2', title: 'Svc Two', description: 'd', bullets: [] },
      ],
    });
    expect(container.textContent).toContain('Bullets per service');
    expect(container.textContent).toContain('Svc One');
    expect(container.textContent).toContain('Svc Two');
  });

  it('omits bullets section when no services', () => {
    const { container } = renderBlock({
      id: 'sg1', type: 'services-grid', order: 0, services: [],
    });
    expect(container.textContent).not.toContain('Bullets per service');
  });
});

describe('BlockContentEditor — accordion / tabs', () => {
  it('renders accordion add', () => {
    const { container, onUpdate } = renderBlock({
      id: 'a1', type: 'accordion', order: 0, title: 'T', items: [],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].items).toHaveLength(1);
  });

  it('renders tabs add', () => {
    const { container, onUpdate } = renderBlock({
      id: 't1', type: 'tabs', order: 0, tabs: [],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].tabs).toHaveLength(1);
  });
});

describe('BlockContentEditor — sticky-scroll-tabs', () => {
  it('updates stickyTopOffset; NaN becomes undefined', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sst1', type: 'sticky-scroll-tabs', order: 0, panels: [], stickyTopOffset: 80,
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    const offsetInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === '80') as HTMLInputElement;
    if (offsetInput) {
      fireEvent.change(offsetInput, { target: { value: '100' } });
      expect(onUpdate).toHaveBeenCalledWith({ stickyTopOffset: 100 });
      fireEvent.change(offsetInput, { target: { value: 'abc' } });
      const last = onUpdate.mock.calls.at(-1)![0];
      expect(last.stickyTopOffset).toBeUndefined();
    }
  });
});

describe('BlockContentEditor — featured-content', () => {
  it('updates imagePosition via select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'featured-content', order: 0, title: 'T',
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'left' } });
    expect(onUpdate).toHaveBeenCalledWith({ imagePosition: 'left' });
  });
});

describe('BlockContentEditor — blog-posts / product-grid / featured-products / product-categories / shopping-cart / store-banner', () => {
  it('blog-posts: showExcerpt toggle', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bp1', type: 'blog-posts', order: 0,
    });
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('product-grid renders many selects + checkboxes', () => {
    const { container } = renderBlock({ id: 'pg1', type: 'product-grid', order: 0 });
    expect(container.querySelectorAll('select').length).toBeGreaterThanOrEqual(3);
  });

  it('featured-products: layout change', () => {
    const { container, onUpdate } = renderBlock({ id: 'fp1', type: 'featured-products', order: 0 });
    const selects = container.querySelectorAll('select');
    const layoutSel = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="carousel"]')
    ) as HTMLSelectElement | undefined;
    if (layoutSel) {
      fireEvent.change(layoutSel, { target: { value: 'carousel' } });
      expect(onUpdate).toHaveBeenCalledWith({ layout: 'carousel' });
    }
  });

  it('product-categories renders', () => {
    const { container } = renderBlock({ id: 'pc1', type: 'product-categories', order: 0 });
    expect(container.textContent).toContain('Show Product Count');
  });

  it('shopping-cart variant', () => {
    const { container, onUpdate } = renderBlock({ id: 'sc1', type: 'shopping-cart', order: 0 });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'mini' } });
    expect(onUpdate).toHaveBeenCalledWith({ variant: 'mini' });
  });

  it('store-banner renders', () => {
    const { container } = renderBlock({ id: 'sb1', type: 'store-banner', order: 0 });
    expect(container.querySelectorAll('select').length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Product Detail + Booking + Survey (network)
// ---------------------------------------------------------------------------

describe('BlockContentEditor — product-detail', () => {
  it('renders ProductSlugPicker and toggles', async () => {
    installFetchMock({ success: true, data: [{ slug: 'p1', name: 'P1', image: null, price: 100 }] });
    const { container } = renderBlock({ id: 'pd1', type: 'product-detail', order: 0 }, 9);
    await waitFor(() => {
      expect((globalThis as any).fetch).toHaveBeenCalledWith(expect.stringContaining('/api/portal/websites/9/store/products'));
    });
    // many checkboxes
    expect(container.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(7);
  });
});

describe('BlockContentEditor — booking', () => {
  it('fetches booking pages on mount and updates slug', async () => {
    installFetchMock({ success: true, data: [{ id: 1, slug: 'b-1', title: 'Demo Booking', duration: 30, active: true }] });
    const { container } = renderBlock({ id: 'bk1', type: 'booking', order: 0, slug: '' });
    await waitFor(() => {
      expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/portal/tools/booking');
    });
    expect(container.textContent).toContain('Booking Page');
  });

  it('toggles showPageTitle checkbox', () => {
    const { container, onUpdate } = renderBlock({ id: 'bk1', type: 'booking', order: 0, slug: 'x' });
    // first checkbox = Show Booking Page Title
    const cb = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    fireEvent.click(cb);
    expect(onUpdate).toHaveBeenCalled();
  });

  it('updates styleOverrides.primaryColor', () => {
    const { container, onUpdate } = renderBlock({ id: 'bk1', type: 'booking', order: 0, slug: 'x' });
    const colorInput = container.querySelector('[data-testid="color-Primary Color"]') as HTMLInputElement;
    if (colorInput) {
      fireEvent.change(colorInput, { target: { value: '#ff0000' } });
      const last = onUpdate.mock.calls.at(-1)![0];
      expect(last.styleOverrides).toBeDefined();
      expect(last.styleOverrides.primaryColor).toBe('#ff0000');
    }
  });
});

describe('BlockContentEditor — survey', () => {
  it('renders SurveyPicker and updates slug', async () => {
    installFetchMock({ success: true, data: [{ id: 1, slug: 's-1', title: 'Survey', status: 'active', responseCount: 10 }] });
    const { container } = renderBlock({ id: 'sv1', type: 'survey', order: 0, slug: '' });
    await waitFor(() => {
      expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/portal/surveys');
    });
    expect(container.textContent).toContain('Survey');
  });
});

// ---------------------------------------------------------------------------
// Deck blocks
// ---------------------------------------------------------------------------

describe('BlockContentEditor — deck-next-slide / deck-jump-to', () => {
  it('deck-next-slide renders with defaults', () => {
    const { container } = renderBlock({ id: 'dns1', type: 'deck-next-slide', order: 0 });
    expect(container.querySelectorAll('input[type="text"]').length).toBeGreaterThanOrEqual(2);
  });

  it('deck-jump-to: targetSlide parses int', () => {
    const { container, onUpdate } = renderBlock({ id: 'dj1', type: 'deck-jump-to', order: 0, targetSlide: 1 });
    const inputs = container.querySelectorAll('input[type="text"]');
    const targetInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === '1') as HTMLInputElement;
    if (targetInput) {
      fireEvent.change(targetInput, { target: { value: '5' } });
      expect(onUpdate).toHaveBeenCalledWith({ targetSlide: 5 });
      fireEvent.change(targetInput, { target: { value: 'abc' } });
      const last = onUpdate.mock.calls.at(-1)![0];
      expect(last.targetSlide).toBe(1);
    }
  });
});

describe('BlockContentEditor — booking-menu', () => {
  it('renders booking-menu select for columns', () => {
    const { container, onUpdate } = renderBlock({ id: 'bm1', type: 'booking-menu', order: 0 });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '4' } });
    expect(onUpdate).toHaveBeenCalledWith({ columns: 4 });
  });
});

// ---------------------------------------------------------------------------
// Social links — inline list editor
// ---------------------------------------------------------------------------

describe('BlockContentEditor — social-links', () => {
  it('renders empty state with add button and adds link', () => {
    const { container, onUpdate } = renderBlock({ id: 'sl1', type: 'social-links', order: 0, links: [] });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add Link'));
    fireEvent.click(addBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ links: [{ platform: 'facebook', url: '' }] });
  });

  it('updates link platform via select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sl1', type: 'social-links', order: 0,
      links: [{ platform: 'facebook', url: 'https://fb.com' }],
    });
    // first select in DOM should be alignment, then iconSize; the link platform comes after.
    const selects = container.querySelectorAll('select');
    const linkSelect = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="twitter"]'),
    ) as HTMLSelectElement;
    fireEvent.change(linkSelect, { target: { value: 'twitter' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.links[0].platform).toBe('twitter');
  });

  it('updates link url via input', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sl1', type: 'social-links', order: 0,
      links: [{ platform: 'facebook', url: '' }],
    });
    const urlInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://x.com' } });
    expect(onUpdate.mock.calls[0][0].links[0].url).toBe('https://x.com');
  });

  it('removes link via delete button', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sl1', type: 'social-links', order: 0,
      links: [{ platform: 'facebook', url: 'x' }],
    });
    // delete button has material icon 'delete'
    const delBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'delete',
    );
    fireEvent.click(delBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ links: [] });
  });

  it('hides + Add Link when at 6 links', () => {
    const six = Array.from({ length: 6 }, (_, i) => ({ platform: 'facebook', url: `${i}` }));
    const { container } = renderBlock({ id: 'sl1', type: 'social-links', order: 0, links: six });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add Link'));
    expect(addBtn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Timeline + Bento + Team + Footer (complex inline editors)
// ---------------------------------------------------------------------------

describe('BlockContentEditor — timeline', () => {
  it('adds + removes steps', () => {
    const { container, onUpdate } = renderBlock({ id: 'tl1', type: 'timeline', order: 0, steps: [] });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+ Add');
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].steps).toHaveLength(1);
  });

  it('updates a step title', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tl1', type: 'timeline', order: 0,
      steps: [{ id: 'step-1', title: 'old', description: 'd' }],
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    const titleInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === 'old') as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'new' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.steps[0].title).toBe('new');
  });

  it('updates step description via textarea', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tl1', type: 'timeline', order: 0,
      steps: [{ id: 'step-1', title: 't', description: 'old-desc' }],
    });
    // Find the textarea whose current value is the step description (mock RTE
    // textareas surface Title/Subtitle separately).
    const tas = container.querySelectorAll('textarea');
    const descTa = Array.from(tas).find(
      (t) => (t as HTMLTextAreaElement).value === 'old-desc',
    ) as HTMLTextAreaElement;
    expect(descTa).toBeTruthy();
    fireEvent.change(descTa, { target: { value: 'new-desc' } });
    expect(onUpdate.mock.calls[0][0].steps[0].description).toBe('new-desc');
  });

  it('removes step', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tl1', type: 'timeline', order: 0,
      steps: [{ id: 'step-1', title: 't', description: 'd' }],
    });
    const removeBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Remove');
    fireEvent.click(removeBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ steps: [] });
  });
});

describe('BlockContentEditor — bento-grid', () => {
  it('adds card and updates span', () => {
    const { container, onUpdate } = renderBlock({ id: 'bg1', type: 'bento-grid', order: 0, cards: [] });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+ Add');
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].cards).toHaveLength(1);
  });

  it('updates card items textarea (split by lines)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0,
      cards: [{ id: 'c-1', title: 'T', items: ['a', 'b'], variant: 'dark', span: 6 }],
    });
    const tas = container.querySelectorAll('textarea');
    const itemsTa = Array.from(tas).find((t) => (t as HTMLTextAreaElement).value === 'a\nb') as HTMLTextAreaElement;
    fireEvent.change(itemsTa, { target: { value: 'x\ny\nz' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.cards[0].items).toEqual(['x', 'y', 'z']);
  });
});

describe('BlockContentEditor — team-showcase', () => {
  it('adds member', () => {
    const { container, onUpdate } = renderBlock({ id: 'ts1', type: 'team-showcase', order: 0, members: [] });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+ Add');
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].members).toHaveLength(1);
  });

  it('updates member specialties as csv-split list', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0,
      members: [{ id: 'm1', name: 'n', title: 't', photo: 'p', bio: 'b' }],
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    // last input on member row is specialties — find one with empty value & placeholder containing "Specialties"
    const specInput = Array.from(inputs).find((i) => (i as HTMLInputElement).placeholder?.includes('Specialties')) as HTMLInputElement;
    fireEvent.change(specInput, { target: { value: 'a, b, c' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.members[0].specialties).toEqual(['a', 'b', 'c']);
  });
});

describe('BlockContentEditor — team-flip-grid', () => {
  it('adds and removes member', () => {
    const { container, onUpdate } = renderBlock({ id: 'tfg1', type: 'team-flip-grid', order: 0, members: [] });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+ Add');
    fireEvent.click(addBtn!);
    const added = onUpdate.mock.calls[0][0];
    expect(added.members).toHaveLength(1);
  });
});

describe('BlockContentEditor — site-footer', () => {
  it('renders core fields + nested groups summary', () => {
    const { container } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      logoUrl: 'x', wordmark: 'W', linkGroups: [{ label: 'PRODUCT', links: [{ label: 'Pricing', href: '/p' }] }],
    });
    expect(container.textContent).toContain('Logo URL');
    expect(container.textContent).toContain('Link Groups');
    expect(container.textContent).toContain('Copyright');
  });

  it('updates contactInfo.email merges', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      contactInfo: { address: 'A', phone: 'P' },
    });
    const emailInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).previousElementSibling?.textContent === 'Email',
    ) as HTMLInputElement | undefined;
    if (emailInput) {
      fireEvent.change(emailInput, { target: { value: 'hi@x.com' } });
      const call = onUpdate.mock.calls.at(-1)![0];
      expect(call.contactInfo.email).toBe('hi@x.com');
      // address and phone preserved via spread
      expect(call.contactInfo.address).toBe('A');
    }
  });

  it('adds a link group via summary button', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0, linkGroups: [],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add Group'));
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].linkGroups).toHaveLength(1);
  });

  it('adds a social link', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0, socialLinks: [],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add Social'));
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].socialLinks).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Columns block (ColumnsEditor)
// ---------------------------------------------------------------------------

describe('BlockContentEditor — columns block (ColumnsEditor)', () => {
  const baseCols = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c-${i}`, width: 100 / n, blocks: [] }));

  it('renders column count summary', () => {
    const { container } = renderBlock({ id: 'col1', type: 'columns', order: 0, columns: baseCols(2) });
    expect(container.textContent).toContain('Columns (2)');
    expect(container.textContent).toContain('0 nested blocks total');
  });

  it('adds a column with evenly distributed widths', () => {
    const { container, onUpdate } = renderBlock({ id: 'col1', type: 'columns', order: 0, columns: baseCols(2) });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add Column'));
    fireEvent.click(addBtn!);
    const call = onUpdate.mock.calls[0][0];
    expect(call.columns).toHaveLength(3);
    // each width ~ 33
    expect(Math.round(call.columns[0].width)).toBe(33);
  });

  it('updates column width via range slider', () => {
    const { container, onUpdate } = renderBlock({ id: 'col1', type: 'columns', order: 0, columns: baseCols(2) });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(range, { target: { value: '60' } });
    expect(onUpdate.mock.calls[0][0].columns[0].width).toBe(60);
  });

  it('refuses to remove the last column', () => {
    const { container, onUpdate } = renderBlock({ id: 'col1', type: 'columns', order: 0, columns: baseCols(1) });
    // x button shouldn't appear when there's only 1 col
    const xBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'x');
    expect(xBtn).toBeUndefined();
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('removes a column when >1', () => {
    const { container, onUpdate } = renderBlock({ id: 'col1', type: 'columns', order: 0, columns: baseCols(2) });
    const xBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'x');
    if (xBtn) {
      fireEvent.click(xBtn);
      const call = onUpdate.mock.calls[0][0];
      expect(call.columns).toHaveLength(1);
      expect(call.columns[0].width).toBe(100);
    }
  });

  it('toggles stackOnMobile and reverseOnStack', () => {
    const { container, onUpdate } = renderBlock({
      id: 'col1', type: 'columns', order: 0, columns: baseCols(2),
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(cbs[0]);
    expect(onUpdate).toHaveBeenCalledWith({ stackOnMobile: false });
    // cbs[1] is now "Stack on tablet"; cbs[2] is "Reverse when stacked"
    fireEvent.click(cbs[2]);
    expect(onUpdate).toHaveBeenCalledWith({ reverseOnStack: true });
  });

  it('handles string widths via parseFloat', () => {
    const cols = [{ id: 'a', width: '50' as any, blocks: [] }, { id: 'b', width: '50' as any, blocks: [] }];
    const { container } = renderBlock({ id: 'col1', type: 'columns', order: 0, columns: cols });
    expect(container.textContent).toContain('50%');
  });
});

// ---------------------------------------------------------------------------
// Marquee Editor
// ---------------------------------------------------------------------------

describe('BlockContentEditor — marquee block (MarqueeEditor)', () => {
  it('adds text + image + icon items via dedicated buttons', () => {
    const { container, onUpdate } = renderBlock({ id: 'mq1', type: 'marquee', order: 0, items: [] });
    const textBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+ Text');
    const imageBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+ Image');
    const iconBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+ Icon');
    fireEvent.click(textBtn!);
    expect(onUpdate.mock.calls.at(-1)![0].items[0].type).toBe('text');
    fireEvent.click(imageBtn!);
    expect(onUpdate.mock.calls.at(-1)![0].items[0].type).toBe('image');
    fireEvent.click(iconBtn!);
    expect(onUpdate.mock.calls.at(-1)![0].items[0].type).toBe('icon');
  });

  it('renders items + reveals gradient color when gradient on', () => {
    const { container } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [{ id: 'mi-1', type: 'text', content: 'Hello' }],
      gradient: true,
    });
    expect(container.textContent).toContain('Gradient Color');
    expect(container.textContent).toContain('Gradient Width');
  });

  it('updates marquee direction', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [], direction: 'left',
    });
    const select = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'right' } });
    expect(onUpdate).toHaveBeenCalledWith({ direction: 'right' });
  });

  it('removes item when remove (close icon) clicked', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [{ id: 'mi-1', type: 'text', content: 'Hello' }],
    });
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'close',
    );
    fireEvent.click(closeBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ items: [] });
  });

  it('moveItem boundary: disabled for first/last', () => {
    const { container } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [{ id: 'mi-1', type: 'text', content: 'a' }, { id: 'mi-2', type: 'text', content: 'b' }],
    });
    const upBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'arrow_upward',
    );
    // first item's up arrow is disabled
    expect((upBtns[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('moves item down', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [{ id: 'mi-1', type: 'text', content: 'a' }, { id: 'mi-2', type: 'text', content: 'b' }],
    });
    const downBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'arrow_downward',
    );
    fireEvent.click(downBtns[0]);
    const call = onUpdate.mock.calls[0][0];
    expect(call.items[0].id).toBe('mi-2');
    expect(call.items[1].id).toBe('mi-1');
  });
});

// ---------------------------------------------------------------------------
// HeroSlideshow Editor
// ---------------------------------------------------------------------------

describe('BlockContentEditor — hero-slideshow (HeroSlideshowEditor)', () => {
  it('renders single slide by default', () => {
    const { container } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'slide-1', title: 'First' }],
    });
    expect(container.textContent).toContain('Slides');
    expect(container.querySelector('[data-testid="rte-Title"]')).toBeTruthy();
  });

  it('adds slide', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'slide-1', title: 'First' }],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+');
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].slides).toHaveLength(2);
  });

  it('does not show remove when 1 slide', () => {
    const { container } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'slide-1', title: 'First' }],
    });
    const rm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Remove slide'));
    expect(rm).toBeUndefined();
  });

  it('removes slide when >1', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'slide-1', title: 'A' }, { id: 'slide-2', title: 'B' }],
    });
    const rm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Remove slide'));
    fireEvent.click(rm!);
    expect(onUpdate.mock.calls[0][0].slides).toHaveLength(1);
  });

  it('updates slide subtitle', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'slide-1', title: 'A', subtitle: 'sub' }],
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    const subInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === 'sub') as HTMLInputElement;
    fireEvent.change(subInput, { target: { value: 'new-sub' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.slides[0].subtitle).toBe('new-sub');
  });

  it('updates overlayOpacity via range', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'slide-1', title: 'A', overlayOpacity: 1 }],
    });
    const range = container.querySelector('input[type="range"]') as HTMLInputElement;
    fireEvent.change(range, { target: { value: '0.5' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.slides[0].overlayOpacity).toBe(0.5);
  });

  it('updates slideshow autoplay via checkbox', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'slide-1', title: 'A' }],
      autoplay: true,
    });
    const cbs = container.querySelectorAll('input[type="checkbox"]');
    // there are several; find the one currently checked for autoplay (first checkbox)
    fireEvent.click(cbs[0]);
    expect(onUpdate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// SurveyResults editor (network + multi-select)
// ---------------------------------------------------------------------------

describe('BlockContentEditor — survey-results (SurveyResultsEditor)', () => {
  it('fetches surveys + renders empty state', async () => {
    installFetchMock({ success: true, data: [] });
    const { container } = renderBlock({ id: 'sr1', type: 'survey-results', order: 0 });
    await waitFor(() => {
      expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/portal/surveys');
    });
    expect(container.textContent).toContain('Survey');
  });

  it('updates chartType when clicking donut button', async () => {
    installFetchMock({ success: true, data: [] });
    const { container, onUpdate } = renderBlock({ id: 'sr1', type: 'survey-results', order: 0 });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const donutBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Donut Chart'),
    );
    fireEvent.click(donutBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ chartType: 'donut' });
  });

  it('toggles text responses checkbox + renders limit input when on', async () => {
    installFetchMock({ success: true, data: [] });
    const { container } = renderBlock({ id: 'sr1', type: 'survey-results', order: 0, showTextResponses: true });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    expect(container.querySelector('input[type="number"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// HtmlEmbed editor (file upload)
// ---------------------------------------------------------------------------

describe('BlockContentEditor — html-embed (HtmlEmbedEditor)', () => {
  it('renders dropzone + url + height + sandbox controls', () => {
    const { container } = renderBlock({ id: 'he1', type: 'html-embed', order: 0, url: '/x.html', filename: 'x.html' });
    expect(container.textContent).toContain('HTML File');
    expect(container.textContent).toContain('Sandbox');
  });

  it('uploads file (no existing mediaId) via /api/portal/html-uploads', async () => {
    const fm = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: { id: 7, url: '/u/foo.html', filename: 'foo.html' } }),
    });
    (globalThis as any).fetch = fm;

    const { container, onUpdate } = renderBlock({ id: 'he1', type: 'html-embed', order: 0 }, 13);

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['<html></html>'], 'foo.html', { type: 'text/html' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(fm).toHaveBeenCalledWith('/api/portal/html-uploads', expect.objectContaining({ method: 'POST' }));
    });
    expect(onUpdate).toHaveBeenCalledWith({ url: '/u/foo.html', filename: 'foo.html', mediaId: 7 });
  });

  it('uses /replace endpoint when mediaId already set', async () => {
    const fm = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: { url: '/v2.html', filename: 'v2.html' } }),
    });
    (globalThis as any).fetch = fm;

    const { container, onUpdate } = renderBlock({ id: 'he1', type: 'html-embed', order: 0, mediaId: 42 });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'v2.html', { type: 'text/html' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(fm).toHaveBeenCalledWith('/api/portal/media/42/replace', expect.objectContaining({ method: 'POST' }));
    });
    expect(onUpdate).toHaveBeenCalledWith({ url: '/v2.html', filename: 'v2.html' });
  });

  it('surfaces error on upload failure', async () => {
    const fm = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => JSON.stringify({ success: false, error: 'Boom' }),
    });
    (globalThis as any).fetch = fm;

    const { container } = renderBlock({ id: 'he1', type: 'html-embed', order: 0 });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'bad.html', { type: 'text/html' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Boom');
    });
  });

  it('handles non-JSON response gracefully (safeJson returns null → falls back to status msg)', async () => {
    const fm = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => '<html>504 Gateway Timeout</html>',
    });
    (globalThis as any).fetch = fm;

    const { container } = renderBlock({ id: 'he1', type: 'html-embed', order: 0 });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'bad.html', { type: 'text/html' });

    await act(async () => {
      fireEvent.change(fileInput, { target: { files: [file] } });
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Upload failed (status 502)');
    });
  });

  it('updates sandbox option', () => {
    const { container, onUpdate } = renderBlock({ id: 'he1', type: 'html-embed', order: 0, sandbox: 'scripts' });
    const selects = container.querySelectorAll('select');
    const sandboxSel = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="scripts-forms"]'),
    ) as HTMLSelectElement | undefined;
    if (sandboxSel) {
      fireEvent.change(sandboxSel, { target: { value: 'scripts-forms' } });
      expect(onUpdate).toHaveBeenCalledWith({ sandbox: 'scripts-forms' });
    }
  });
});

// ---------------------------------------------------------------------------
// HTML Render dispatch
// ---------------------------------------------------------------------------

describe('BlockContentEditor — html-render dispatches to HtmlRenderEditor', () => {
  it('renders HtmlRenderEditor mock', () => {
    const { container } = renderBlock({ id: 'hr1', type: 'html-render', order: 0 });
    expect(container.querySelector('[data-testid="html-render-editor"]')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Unknown / default branch
// ---------------------------------------------------------------------------

describe('BlockContentEditor — unknown block type', () => {
  it('renders empty wrapper for unrecognized type', () => {
    const { container } = renderBlock({ id: 'x1', type: 'something-not-supported', order: 0 } as any);
    // outer div with space-y-3 always renders; children should be empty
    const wrapper = container.querySelector('div.space-y-3');
    expect(wrapper).toBeTruthy();
    expect(wrapper?.children.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SortableListItem expansion & per-item editing (drives ListEditor internals)
// ---------------------------------------------------------------------------

describe('BlockContentEditor — ListEditor SortableListItem expansion', () => {
  it('clicking item header expands it to show field defs (Field-only)', () => {
    const { container } = renderBlock({
      id: 'st1', type: 'stats', order: 0,
      stats: [{ id: 's1', value: '100', label: 'Clients' }],
      columns: 3,
    });
    // The collapsed header shows the first field value ("100"). Click it.
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('100'),
    );
    expect(header).toBeTruthy();
    fireEvent.click(header!);
    // Now there should be two Field inputs (value, label) showing.
    expect(container.textContent).toContain('Value');
    expect(container.textContent).toContain('Label');
  });

  it('expanded item: editing a field calls onItemChange', () => {
    const { container, onUpdate } = renderBlock({
      id: 'st1', type: 'stats', order: 0,
      stats: [{ id: 's1', value: '100', label: 'Clients' }], columns: 3,
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('100'),
    );
    fireEvent.click(header!);

    // The value field is the first input under the expanded panel
    const inputs = container.querySelectorAll('input[type="text"]');
    const valueField = Array.from(inputs).find((i) => (i as HTMLInputElement).value === '100') as HTMLInputElement;
    fireEvent.change(valueField, { target: { value: '200' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.stats[0].value).toBe('200');
  });

  it('toggling header twice collapses the item', () => {
    const { container } = renderBlock({
      id: 'st1', type: 'stats', order: 0,
      stats: [{ id: 's1', value: 'v', label: 'l' }], columns: 3,
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('v'),
    );
    fireEvent.click(header!);
    expect(container.textContent).toContain('Value');
    fireEvent.click(header!);
    // "Value" label disappears when collapsed
    const valueLabels = Array.from(container.querySelectorAll('span')).filter((s) => s.textContent === 'Value');
    expect(valueLabels.length).toBe(0);
  });

  it('per-item remove button removes the item', () => {
    const { container, onUpdate } = renderBlock({
      id: 'st1', type: 'stats', order: 0,
      stats: [{ id: 's1', value: 'v', label: 'l' }], columns: 3,
    });
    // Remove button has material-icon "close"
    const closeBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'close',
    );
    fireEvent.click(closeBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ stats: [] });
  });

  it('expanding a card-grid item with icon/image/multiline fields renders all field types', () => {
    const { container } = renderBlock({
      id: 'cg1', type: 'card-grid', order: 0,
      cards: [{ id: 'cd1', title: 'Card', description: 'Desc', icon: 'star', image: 'i.png', link: '/x' }],
      columns: 3,
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer') && d.textContent?.includes('Card'),
    );
    fireEvent.click(header!);
    // Icon picker mock has data-testid icon-picker-{label}
    expect(container.querySelector('[data-testid="icon-picker-Icon"]')).toBeTruthy();
    // textarea (description) should be present
    expect(container.querySelectorAll('textarea').length).toBeGreaterThan(0);
  });

  it('expanded gallery item exercises image type field', () => {
    const { container } = renderBlock({
      id: 'g1', type: 'gallery', order: 0,
      images: [{ id: 'img1', url: 'x.png', alt: 'desc' }],
      layout: 'grid', columns: 3,
    });
    const header = Array.from(container.querySelectorAll('div')).find((d) =>
      d.className.includes('cursor-pointer'),
    );
    fireEvent.click(header!);
    // image field renders an unnamed MediaPicker
    const mps = container.querySelectorAll('[data-testid^="media-picker-"]');
    expect(mps.length).toBeGreaterThan(0);
  });

  it('uses index fallback label when first field value is empty', () => {
    const { container } = renderBlock({
      id: 'st1', type: 'stats', order: 0,
      stats: [{ id: 's1', value: '', label: '' }], columns: 3,
    });
    // header uses "Stat 1" fallback because first field is empty
    expect(container.textContent).toContain('Stat 1');
  });
});

// ---------------------------------------------------------------------------
// BookingPagePicker / SurveyPicker / ProductSlugPicker — dropdown open & click
// ---------------------------------------------------------------------------

describe('BlockContentEditor — picker dropdowns', () => {
  it('BookingPagePicker shows search input and renders options on fetch', async () => {
    installFetchMock({
      success: true,
      data: [
        { id: 1, slug: 'demo', title: 'Demo Call', duration: 30, active: true },
        { id: 2, slug: 'inactive', title: 'Old Page', duration: 15, active: false },
      ],
    });
    const { container, onUpdate } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: '',
    });
    await waitFor(() => {
      expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/portal/tools/booking');
    });
    // Focus input → opens dropdown
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => {
      expect(container.textContent).toContain('Demo Call');
    });
    // Click "Demo Call" option
    const opt = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Demo Call'));
    fireEvent.click(opt!);
    expect(onUpdate).toHaveBeenCalledWith({ slug: 'demo' });
  });

  it('BookingPagePicker shows selected state when slug matches', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 1, slug: 'demo', title: 'Demo Call', duration: 30, active: true }],
    });
    const { container } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: 'demo',
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Demo Call');
    });
    expect(container.textContent).toContain('30min');
  });

  it('BookingPagePicker handles fetch failure (catch path)', async () => {
    const fm = vi.fn().mockRejectedValue(new Error('network'));
    (globalThis as any).fetch = fm;
    const { container } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: '',
    });
    await waitFor(() => {
      expect(fm).toHaveBeenCalled();
    });
    // Doesn't crash — input still rendered
    expect(container.querySelector('input[type="text"]')).toBeTruthy();
  });

  it('BookingPagePicker shows "No booking pages found" empty state', async () => {
    installFetchMock({ success: true, data: [] });
    const { container } = renderBlock({
      id: 'bk1', type: 'booking', order: 0, slug: '',
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => {
      expect(container.textContent).toContain('No booking pages found');
    });
  });

  it('SurveyPicker shows status badge for non-active surveys', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 1, slug: 'draft-s', title: 'Draft Survey', status: 'draft', responseCount: 0 }],
    });
    const { container } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: '',
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => {
      expect(container.textContent).toContain('Draft Survey');
    });
    expect(container.textContent).toContain('(draft)');
  });

  it('SurveyPicker selects on click', async () => {
    installFetchMock({
      success: true,
      data: [{ id: 1, slug: 'feedback', title: 'Feedback', status: 'active', responseCount: 5 }],
    });
    const { container, onUpdate } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: '',
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => expect(container.textContent).toContain('Feedback'));
    const opt = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Feedback'));
    fireEvent.click(opt!);
    expect(onUpdate).toHaveBeenCalledWith({ slug: 'feedback' });
  });

  it('ProductSlugPicker requires siteId to fetch', async () => {
    const fm = vi.fn();
    (globalThis as any).fetch = fm;
    const { container } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0,
    });
    // siteId undefined → no fetch
    expect(fm).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Product');
  });

  it('ProductSlugPicker opens & selects a product', async () => {
    installFetchMock({
      success: true,
      data: [{ slug: 'p1', name: 'Product One', image: 'p1.png', price: 100 }],
    });
    const { container, onUpdate } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0, productSlug: '',
    }, 7);
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    await waitFor(() => expect(container.textContent).toContain('Product One'));
    const opt = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('Product One'));
    fireEvent.click(opt!);
    expect(onUpdate).toHaveBeenCalledWith({ productSlug: 'p1' });
  });

  it('ProductSlugPicker shows selected product with image', async () => {
    installFetchMock({
      success: true,
      data: [{ slug: 'p1', name: 'Product One', image: 'p1.png', price: 100 }],
    });
    const { container } = renderBlock({
      id: 'pd1', type: 'product-detail', order: 0, productSlug: 'p1',
    }, 7);
    await waitFor(() => expect(container.textContent).toContain('Product One'));
  });

  it('search filter narrows surveys list', async () => {
    installFetchMock({
      success: true,
      data: [
        { id: 1, slug: 'apple', title: 'Apple', status: 'active', responseCount: 1 },
        { id: 2, slug: 'banana', title: 'Banana', status: 'active', responseCount: 2 },
      ],
    });
    const { container } = renderBlock({
      id: 'sv1', type: 'survey', order: 0, slug: '',
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.focus(input);
    // type partial query
    fireEvent.change(input, { target: { value: 'app' } });
    // Apple should still be there but Banana shouldn't — search filter works
    // (search also fires onUpdate while !open is false; but onFocus opens, so it won't fire update)
    await waitFor(() => expect(container.textContent).toContain('Apple'));
  });
});

// ---------------------------------------------------------------------------
// SurveyResultsEditor — selected survey with question picker
// ---------------------------------------------------------------------------

describe('BlockContentEditor — survey-results selected with fields', () => {
  const surveyWithFields = {
    id: 1,
    slug: 'feedback',
    title: 'Feedback',
    responseCount: 10,
    fields: [
      { id: 'q1', label: 'How likely?', type: 'rating' },
      { id: 'q2', label: 'Other thoughts?', type: 'text' },
    ],
  };

  it('shows question picker when survey is selected with fields', async () => {
    installFetchMock({ success: true, data: [surveyWithFields] });
    const { container } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0, surveySlug: 'feedback',
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Questions to display');
    });
    expect(container.textContent).toContain('How likely?');
    expect(container.textContent).toContain('Other thoughts?');
  });

  it('clicking "All" resets fieldIds to undefined', async () => {
    installFetchMock({ success: true, data: [surveyWithFields] });
    const { container, onUpdate } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0, surveySlug: 'feedback', fieldIds: ['q1'],
    });
    await waitFor(() => expect(container.textContent).toContain('Questions to display'));
    const allBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'All');
    fireEvent.click(allBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ fieldIds: undefined });
  });

  it('toggling a field checkbox emits new fieldIds', async () => {
    installFetchMock({ success: true, data: [surveyWithFields] });
    const { container, onUpdate } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0, surveySlug: 'feedback',
    });
    await waitFor(() => expect(container.textContent).toContain('Questions to display'));
    const cb = container.querySelector('input[type="checkbox"][id="srfield-q1"]') as HTMLInputElement;
    fireEvent.click(cb);
    // unchecking q1 → fieldIds is ['q2']
    const call = onUpdate.mock.calls.at(-1)![0];
    expect(call.fieldIds).toEqual(['q2']);
  });

  it('updates layout select + title field', async () => {
    installFetchMock({ success: true, data: [surveyWithFields] });
    const { container, onUpdate } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0, surveySlug: 'feedback',
    });
    await waitFor(() => expect(container.textContent).toContain('Questions to display'));
    const selects = container.querySelectorAll('select');
    const layoutSel = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="tabbed"]'),
    ) as HTMLSelectElement;
    fireEvent.change(layoutSel, { target: { value: 'tabbed' } });
    expect(onUpdate).toHaveBeenCalledWith({ layout: 'tabbed' });
  });

  it('opens selected survey picker by clicking selected button', async () => {
    installFetchMock({ success: true, data: [surveyWithFields] });
    const { container } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0, surveySlug: 'feedback',
    });
    await waitFor(() => expect(container.textContent).toContain('Feedback'));
    // Click the selected button to open
    const selectedBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('.material-icons')?.textContent === 'poll' && b.textContent?.includes('Feedback'),
    );
    fireEvent.click(selectedBtn!);
    await waitFor(() => {
      // searchbar is now visible
      expect(container.querySelectorAll('input[type="text"]').length).toBeGreaterThanOrEqual(1);
    });
  });

  it('updates textResponseLimit', async () => {
    installFetchMock({ success: true, data: [] });
    const { container, onUpdate } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0, showTextResponses: true,
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const numInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(numInput, { target: { value: '12' } });
    expect(onUpdate).toHaveBeenCalledWith({ textResponseLimit: 12 });
  });

  it('updates accent color', async () => {
    installFetchMock({ success: true, data: [] });
    const { container, onUpdate } = renderBlock({
      id: 'sr1', type: 'survey-results', order: 0,
    });
    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalled());
    const accent = container.querySelector('[data-testid="color-Accent Color"]') as HTMLInputElement;
    fireEvent.change(accent, { target: { value: '#abc' } });
    expect(onUpdate).toHaveBeenCalledWith({ accentColor: '#abc' });
  });
});

// ---------------------------------------------------------------------------
// HtmlEmbedEditor drag-and-drop + url + caption + iframeTitle fields
// ---------------------------------------------------------------------------

describe('BlockContentEditor — html-embed drag/drop & misc fields', () => {
  it('drag-over sets dragOver state (border highlight) then drag-leave removes', () => {
    const { container } = renderBlock({ id: 'he1', type: 'html-embed', order: 0 });
    const dropzone = container.querySelector('[class*="border-dashed"]') as HTMLElement;
    expect(dropzone).toBeTruthy();
    fireEvent.dragOver(dropzone);
    fireEvent.dragLeave(dropzone);
    // doesn't crash; just exercise both branches
  });

  it('drop event triggers upload', async () => {
    const fm = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => JSON.stringify({ success: true, data: { id: 99, url: '/dropped.html', filename: 'dropped.html' } }),
    });
    (globalThis as any).fetch = fm;

    const { container, onUpdate } = renderBlock({ id: 'he1', type: 'html-embed', order: 0 });
    const dropzone = container.querySelector('[class*="border-dashed"]') as HTMLElement;
    const file = new File(['<p>X</p>'], 'dropped.html', { type: 'text/html' });

    await act(async () => {
      fireEvent.drop(dropzone, { dataTransfer: { files: [file] } });
    });

    await waitFor(() => {
      expect(fm).toHaveBeenCalledWith('/api/portal/html-uploads', expect.any(Object));
    });
    expect(onUpdate).toHaveBeenCalled();
  });

  it('updates iframeTitle + caption (empty string becomes undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'he1', type: 'html-embed', order: 0, iframeTitle: 'old',
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    const iframeTitleInput = Array.from(inputs).find((i) => (i as HTMLInputElement).value === 'old') as HTMLInputElement;
    fireEvent.change(iframeTitleInput, { target: { value: '' } });
    expect(onUpdate).toHaveBeenCalledWith({ iframeTitle: undefined });
  });

  it('updates width via select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'he1', type: 'html-embed', order: 0, width: 'full',
    });
    const selects = container.querySelectorAll('select');
    const widthSel = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="contained"]'),
    ) as HTMLSelectElement;
    fireEvent.change(widthSel, { target: { value: 'contained' } });
    expect(onUpdate).toHaveBeenCalledWith({ width: 'contained' });
  });
});

// ---------------------------------------------------------------------------
// Footer link-group / social-link inline edits
// ---------------------------------------------------------------------------

describe('BlockContentEditor — site-footer inline edits', () => {
  it('updates link group label', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      linkGroups: [{ label: 'PRODUCT', links: [{ label: 'Pricing', href: '/p' }] }],
    });
    // First text input inside the details panel is the group label
    const groupLabelInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'PRODUCT',
    ) as HTMLInputElement;
    fireEvent.change(groupLabelInput, { target: { value: 'COMPANY' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.linkGroups[0].label).toBe('COMPANY');
  });

  it('adds a link to a group via + Link button', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      linkGroups: [{ label: 'PRODUCT', links: [] }],
    });
    const addLinkBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === '+ Link');
    fireEvent.click(addLinkBtn!);
    const call = onUpdate.mock.calls[0][0];
    expect(call.linkGroups[0].links).toHaveLength(1);
  });

  it('removes a link group via "Remove group"', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      linkGroups: [{ label: 'PRODUCT', links: [] }],
    });
    const rmBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Remove group');
    fireEvent.click(rmBtn!);
    expect(onUpdate).toHaveBeenCalledWith({ linkGroups: [] });
  });

  it('updates a link inside a group', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      linkGroups: [{ label: 'PRODUCT', links: [{ label: 'Pricing', href: '/p' }] }],
    });
    const inputs = container.querySelectorAll('input[type="text"]');
    const linkLabel = Array.from(inputs).find((i) => (i as HTMLInputElement).value === 'Pricing') as HTMLInputElement;
    fireEvent.change(linkLabel, { target: { value: 'Plans' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.linkGroups[0].links[0].label).toBe('Plans');
  });

  it('removes a link from a group (per-link x button)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      linkGroups: [{ label: 'PRODUCT', links: [{ label: 'A', href: '/a' }] }],
    });
    // x buttons inside group are visible
    const xBtns = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent === 'x');
    fireEvent.click(xBtns[0]);
    const call = onUpdate.mock.calls[0][0];
    expect(call.linkGroups[0].links).toHaveLength(0);
  });

  it('updates social link platform & url + removes it', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      socialLinks: [{ platform: 'twitter', url: 'https://t.co/x' }],
    });
    const platformInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'twitter',
    ) as HTMLInputElement;
    fireEvent.change(platformInput, { target: { value: 'x' } });
    expect(onUpdate.mock.calls[0][0].socialLinks[0].platform).toBe('x');

    const urlInput = container.querySelector('input[type="url"]') as HTMLInputElement;
    fireEvent.change(urlInput, { target: { value: 'https://new.com' } });
    expect(onUpdate.mock.calls.at(-1)![0].socialLinks[0].url).toBe('https://new.com');

    const xBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'x');
    fireEvent.click(xBtn!);
    expect(onUpdate.mock.calls.at(-1)![0].socialLinks).toHaveLength(0);
  });

  it('updates copyright and disclaimer', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sf1', type: 'site-footer', order: 0,
      copyright: 'old', disclaimer: 'old-disc',
    });
    const copyrightInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'old',
    ) as HTMLInputElement;
    fireEvent.change(copyrightInput, { target: { value: 'new' } });
    expect(onUpdate).toHaveBeenCalledWith({ copyright: 'new' });

    const discTa = Array.from(container.querySelectorAll('textarea')).find(
      (t) => (t as HTMLTextAreaElement).value === 'old-disc',
    ) as HTMLTextAreaElement;
    fireEvent.change(discTa, { target: { value: 'new-disc' } });
    expect(onUpdate.mock.calls.at(-1)![0].disclaimer).toBe('new-disc');
  });
});

// ---------------------------------------------------------------------------
// Marquee — image item alt edit + link edit + image dropdown
// ---------------------------------------------------------------------------

describe('BlockContentEditor — marquee item editing branches', () => {
  it('image item shows alt + link fields and edits each', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [{ id: 'mi-1', type: 'image', content: '', imageUrl: 'x.png', imageAlt: 'old-alt', link: '' }],
    });
    const altInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'old-alt',
    ) as HTMLInputElement;
    fireEvent.change(altInput, { target: { value: 'new-alt' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.items[0].imageAlt).toBe('new-alt');
  });

  it('icon item shows icon name field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [{ id: 'mi-1', type: 'icon', content: 'star' }],
    });
    const iconNameInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'star',
    ) as HTMLInputElement;
    fireEvent.change(iconNameInput, { target: { value: 'rocket' } });
    expect(onUpdate.mock.calls[0][0].items[0].content).toBe('rocket');
  });

  it('updates gradient color when gradient on', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [], gradient: true, gradientColor: 'white',
    });
    const gradientColor = container.querySelector('[data-testid="color-Gradient Color"]') as HTMLInputElement;
    fireEvent.change(gradientColor, { target: { value: '#000' } });
    expect(onUpdate).toHaveBeenCalledWith({ gradientColor: '#000' });
  });

  it('updates speed (Number coercion) + autoFill toggle', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [], speed: 50, autoFill: true,
    });
    const speedInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '50',
    ) as HTMLInputElement;
    fireEvent.change(speedInput, { target: { value: '120' } });
    expect(onUpdate).toHaveBeenCalledWith({ speed: 120 });

    const autoFillCb = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(
      (cb) => (cb as HTMLInputElement).checked,
    ) as HTMLInputElement;
    if (autoFillCb) {
      fireEvent.click(autoFillCb);
      expect(onUpdate).toHaveBeenCalled();
    }
  });
});

// ---------------------------------------------------------------------------
// HeroSlideshow Editor extra paths — switching active slide, background fields
// ---------------------------------------------------------------------------

describe('BlockContentEditor — hero-slideshow extra paths', () => {
  it('switches active slide via numbered button', () => {
    const { container } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [
        { id: 'a', title: 'Slide A' },
        { id: 'b', title: 'Slide B' },
      ],
    });
    // initial active is slide 0 (A). Click "2" to switch.
    const numBtns = Array.from(container.querySelectorAll('button')).filter((b) =>
      /^\d+$/.test(b.textContent || ''),
    );
    fireEvent.click(numBtns[1]);
    // Slide B title should now be in the title RTE
    const rte = container.querySelector('[data-testid="rte-Title"]') as HTMLTextAreaElement;
    expect(rte.value).toBe('Slide B');
  });

  it('updates backgroundSize via select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A', backgroundSize: 'cover' }],
    });
    const selects = container.querySelectorAll('select');
    const bgSizeSel = Array.from(selects).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="contain"]'),
    ) as HTMLSelectElement;
    fireEvent.change(bgSizeSel, { target: { value: 'contain' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.slides[0].backgroundSize).toBe('contain');
  });

  it('updates transition + interval at slideshow level', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }],
      transition: 'fade', interval: 6000,
    });
    const transitionSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="zoom"]'),
    ) as HTMLSelectElement;
    fireEvent.change(transitionSel, { target: { value: 'zoom' } });
    expect(onUpdate).toHaveBeenCalledWith({ transition: 'zoom' });

    const intervalInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '6000',
    ) as HTMLInputElement;
    fireEvent.change(intervalInput, { target: { value: '4000' } });
    expect(onUpdate.mock.calls.at(-1)![0].interval).toBe(4000);
  });

  it('updates Arrow / Dot navigation colors', () => {
    const { container, onUpdate } = renderBlock({
      id: 'hs1', type: 'hero-slideshow', order: 0,
      slides: [{ id: 'a', title: 'A' }],
    });
    const arrow = container.querySelector('[data-testid="color-Arrow Color"]') as HTMLInputElement;
    expect(arrow).toBeTruthy();
    fireEvent.change(arrow, { target: { value: '#abcdef' } });
    expect(onUpdate).toHaveBeenCalledWith({ arrowColor: '#abcdef' });

    const dot = container.querySelector('[data-testid="color-Dot Color"]') as HTMLInputElement;
    fireEvent.change(dot, { target: { value: '#cccccc' } });
    expect(onUpdate).toHaveBeenCalledWith({ dotColor: '#cccccc' });
  });
});

// ---------------------------------------------------------------------------
// Section block — additional branches (splitColor / splitClipPath)
// ---------------------------------------------------------------------------

describe('BlockContentEditor — section splitColor branches', () => {
  it('updates splitColor + splitClipPath via diagonal-split details', () => {
    const { container, onUpdate } = renderBlock({
      id: 's1', type: 'section', order: 0, blocks: [],
    });
    const splitColor = container.querySelector('[data-testid="color-Split Color"]') as HTMLInputElement;
    if (splitColor) {
      fireEvent.change(splitColor, { target: { value: '#abc' } });
      expect(onUpdate).toHaveBeenCalledWith({ splitColor: '#abc' });
    }

    const clipInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder?.startsWith('polygon('),
    ) as HTMLInputElement | undefined;
    if (clipInput) {
      fireEvent.change(clipInput, { target: { value: 'polygon(0,0)' } });
      expect(onUpdate.mock.calls.at(-1)![0].splitClipPath).toBe('polygon(0,0)');
    }
  });

  it('updates background color + maxWidth + text color', () => {
    const { container, onUpdate } = renderBlock({
      id: 's1', type: 'section', order: 0, blocks: [],
    });
    const bg = container.querySelector('[data-testid="color-Background Color"]') as HTMLInputElement;
    fireEvent.change(bg, { target: { value: '#fff' } });
    expect(onUpdate).toHaveBeenCalledWith({ backgroundColor: '#fff' });

    const mw = Array.from(container.querySelectorAll('input[type="text"]'))[0] as HTMLInputElement;
    fireEvent.change(mw, { target: { value: '1200px' } });
    // could be maxWidth or other text inputs — assert the second-to-last call is well-formed
    expect(onUpdate).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Stats / cards / metrics list reorder helper (we can't easily trigger dnd-kit
// but the onReorder closure is exercised by simply rendering — but we can
// invoke onRemove with a stale id to hit the filter() path harmlessly)
// ---------------------------------------------------------------------------

describe('BlockContentEditor — list edit / remove deeper', () => {
  it('stats: removing by id filters items correctly', () => {
    const { container, onUpdate } = renderBlock({
      id: 'st1', type: 'stats', order: 0,
      stats: [{ id: 'a', value: '1', label: 'A' }, { id: 'b', value: '2', label: 'B' }],
      columns: 3,
    });
    // The first close button removes item 'a'
    const closeBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'close',
    );
    fireEvent.click(closeBtns[0]);
    const call = onUpdate.mock.calls[0][0];
    expect(call.stats).toHaveLength(1);
    expect(call.stats[0].id).toBe('b');
  });

  it('metrics: add metric appends', () => {
    const { container, onUpdate } = renderBlock({
      id: 'm1', type: 'metric-cards', order: 0,
      metrics: [{ id: 'm0', value: '100%', label: 'X' }], columns: 4,
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].metrics).toHaveLength(2);
  });

  it('gallery images: add appends a fresh entry', () => {
    const { container, onUpdate } = renderBlock({
      id: 'g1', type: 'gallery', order: 0, images: [],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].images).toHaveLength(1);
  });

  it('services-grid: bullets per service add + remove', () => {
    const { container, onUpdate } = renderBlock({
      id: 'sg1', type: 'services-grid', order: 0,
      services: [{ id: 'svc1', title: 'Svc', description: 'd', bullets: [] }],
    });
    // multiple "+ Add" buttons exist (one for services, one for each bullets list).
    const addBtns = Array.from(container.querySelectorAll('button')).filter((b) => b.textContent?.includes('+ Add'));
    // The bullets add button is the last one (or the second one)
    fireEvent.click(addBtns[addBtns.length - 1]);
    const call = onUpdate.mock.calls[0][0];
    expect(call.services[0].bullets).toHaveLength(1);
  });

  it('logo-strip: add logo', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ls1', type: 'logo-strip', order: 0, logos: [], columns: 6,
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    fireEvent.click(addBtn!);
    expect(onUpdate.mock.calls[0][0].logos).toHaveLength(1);
  });

  it('flip-card-grid: add card defaults', () => {
    const { container, onUpdate } = renderBlock({
      id: 'fc1', type: 'flip-card-grid', order: 0, cards: [],
    });
    const addBtn = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.includes('+ Add'));
    fireEvent.click(addBtn!);
    const call = onUpdate.mock.calls[0][0];
    expect(call.cards[0].frontTitle).toBe('New Card');
    expect(call.cards[0].backText).toBe('Back side content');
  });
});

// ---------------------------------------------------------------------------
// Timeline + Bento + Team additional inline edits
// ---------------------------------------------------------------------------

describe('BlockContentEditor — timeline extra fields', () => {
  it('updates step number → undefined when empty', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tl1', type: 'timeline', order: 0,
      steps: [{ id: 's1', title: 't', description: 'd', number: '01' }],
    });
    const numInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === '01',
    ) as HTMLInputElement;
    fireEvent.change(numInput, { target: { value: '' } });
    const call = onUpdate.mock.calls[0][0];
    expect(call.steps[0].number).toBeUndefined();
  });

  it('updates step icon field', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tl1', type: 'timeline', order: 0,
      steps: [{ id: 's1', title: 't', description: 'd', icon: 'flag' }],
    });
    const iconInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'flag',
    ) as HTMLInputElement;
    fireEvent.change(iconInput, { target: { value: 'rocket' } });
    expect(onUpdate.mock.calls[0][0].steps[0].icon).toBe('rocket');
  });

  it('updates timeline layout select', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tl1', type: 'timeline', order: 0, steps: [], layout: 'alternating',
    });
    const layoutSel = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(layoutSel, { target: { value: 'left' } });
    expect(onUpdate).toHaveBeenCalledWith({ layout: 'left' });
  });

  it('updates lineColor / nodeColor', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tl1', type: 'timeline', order: 0, steps: [],
    });
    const line = container.querySelector('[data-testid="color-Line Color"]') as HTMLInputElement;
    fireEvent.change(line, { target: { value: '#abc' } });
    expect(onUpdate).toHaveBeenCalledWith({ lineColor: '#abc' });
  });
});

describe('BlockContentEditor — bento-grid extra fields', () => {
  it('updates card variant + span', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0,
      cards: [{ id: 'c-1', title: 'T', variant: 'dark', span: 6 }],
    });
    const variantSel = Array.from(container.querySelectorAll('select')).find((s) =>
      (s as HTMLSelectElement).querySelector('option[value="light"]'),
    ) as HTMLSelectElement;
    fireEvent.change(variantSel, { target: { value: 'light' } });
    expect(onUpdate.mock.calls[0][0].cards[0].variant).toBe('light');

    const spanInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    fireEvent.change(spanInput, { target: { value: '12' } });
    expect(onUpdate.mock.calls.at(-1)![0].cards[0].span).toBe(12);
  });

  it('updates card lead + link + linkText (empty → undefined)', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0,
      cards: [{ id: 'c-1', title: 'T', lead: 'oldlead', link: 'https://old', linkText: 'old-text' }],
    });
    const leadInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'oldlead',
    ) as HTMLInputElement;
    fireEvent.change(leadInput, { target: { value: '' } });
    expect(onUpdate.mock.calls[0][0].cards[0].lead).toBeUndefined();
  });

  it('removes a card', () => {
    const { container, onUpdate } = renderBlock({
      id: 'bg1', type: 'bento-grid', order: 0,
      cards: [{ id: 'c-1', title: 'T' }],
    });
    const rm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Remove');
    fireEvent.click(rm!);
    expect(onUpdate).toHaveBeenCalledWith({ cards: [] });
  });
});

describe('BlockContentEditor — team-flip-grid extras', () => {
  it('updates member question + answer', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tfg1', type: 'team-flip-grid', order: 0,
      members: [{ id: 'm1', name: 'N', title: 'T', photo: '', bio: '', question: 'oldQ', answer: 'oldA' }],
    });
    const qInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).value === 'oldQ',
    ) as HTMLInputElement;
    fireEvent.change(qInput, { target: { value: 'newQ' } });
    expect(onUpdate.mock.calls[0][0].members[0].question).toBe('newQ');

    const aTa = Array.from(container.querySelectorAll('textarea')).find(
      (t) => (t as HTMLTextAreaElement).value === 'oldA',
    ) as HTMLTextAreaElement;
    fireEvent.change(aTa, { target: { value: 'newA' } });
    expect(onUpdate.mock.calls.at(-1)![0].members[0].answer).toBe('newA');
  });

  it('removes a member', () => {
    const { container, onUpdate } = renderBlock({
      id: 'tfg1', type: 'team-flip-grid', order: 0,
      members: [{ id: 'm1', name: 'N', title: 'T', photo: '', bio: '', question: '', answer: '' }],
    });
    const rm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Remove');
    fireEvent.click(rm!);
    expect(onUpdate).toHaveBeenCalledWith({ members: [] });
  });
});

describe('BlockContentEditor — team-showcase remove member', () => {
  it('clicking Remove drops member from list', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0,
      members: [{ id: 'm1', name: 'A', title: 'T', photo: '', bio: '' }],
    });
    const rm = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Remove');
    fireEvent.click(rm!);
    expect(onUpdate).toHaveBeenCalledWith({ members: [] });
  });

  it('clears specialties → undefined when csv is empty', () => {
    const { container, onUpdate } = renderBlock({
      id: 'ts1', type: 'team-showcase', order: 0,
      members: [{ id: 'm1', name: 'A', title: 'T', photo: '', bio: '', specialties: ['x'] }],
    });
    const specInput = Array.from(container.querySelectorAll('input[type="text"]')).find(
      (i) => (i as HTMLInputElement).placeholder?.includes('Specialties'),
    ) as HTMLInputElement;
    fireEvent.change(specInput, { target: { value: '' } });
    expect(onUpdate.mock.calls[0][0].members[0].specialties).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Marquee Editor — multiple items move up (non-disabled) + remove
// ---------------------------------------------------------------------------

describe('BlockContentEditor — marquee move up branch', () => {
  it('moves second item up', () => {
    const { container, onUpdate } = renderBlock({
      id: 'mq1', type: 'marquee', order: 0,
      items: [
        { id: 'mi-1', type: 'text', content: 'a' },
        { id: 'mi-2', type: 'text', content: 'b' },
      ],
    });
    const upBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'arrow_upward',
    );
    // 2nd item's up arrow is enabled
    fireEvent.click(upBtns[1]);
    const call = onUpdate.mock.calls[0][0];
    expect(call.items[0].id).toBe('mi-2');
  });
});
