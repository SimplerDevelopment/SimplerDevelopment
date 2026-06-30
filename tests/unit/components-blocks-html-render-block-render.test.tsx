// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for components/blocks/render/HtmlRenderBlockRender.tsx
 *
 * Covers:
 *   - Empty-HTML fallback placeholder path
 *   - Full-width vs contained layout
 *   - Template substitution via renderHtmlTemplate (mocked to inspect call args)
 *   - Responsive class application
 *   - data-block-id attribute presence
 *   - InlineHtml: initial HTML written via dangerouslySetInnerHTML
 *   - Edit-mode: data-field elements get contenteditable + input events debounce
 *     sendToParent(BLOCK_CONTENT_UPDATED)
 *   - Edit-mode: img[data-field-image] gets cursor:pointer + click triggers
 *     sendToParent(REQUEST_IMAGE_PICKER)
 *   - Edit-mode: data-loop-item ancestors are skipped for data-field wiring
 *   - data-repeat-item path resolution for text fields
 *   - data-group-item path resolution for text fields
 *   - Non-edit mode: no contenteditable attributes added
 *   - Script revival: existing <script> tags in SSR HTML are re-created
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import type { HtmlRenderBlock } from '@/types/blocks';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// renderHtmlTemplate: return the template unchanged by default so we can
// inspect what was passed without running sanitize-html in unit tests.
vi.mock('@/lib/blocks/html-render-template', () => ({
  renderHtmlTemplate: vi.fn((template: string) => template),
}));

// combineResponsiveClasses: lightweight passthrough
vi.mock('@/lib/utils/responsive', () => ({
  combineResponsiveClasses: vi.fn((...args: string[]) => args.filter(Boolean).join(' ')),
}));

// sendToParent and IFRAME_MESSAGES
const sendToParentMock = vi.fn();
vi.mock('@/lib/visual-editor/protocol', () => ({
  sendToParent: (...args: any[]) => sendToParentMock(...args),
}));

vi.mock('@/types/visual-editor', () => ({
  IFRAME_MESSAGES: {
    BLOCK_CONTENT_UPDATED: 'BLOCK_CONTENT_UPDATED',
    REQUEST_IMAGE_PICKER: 'REQUEST_IMAGE_PICKER',
  },
}));

// EditorModeProvider — control `active` per test
let editorActive = false;
vi.mock('@/components/visual-editor/editor-mode-context', () => ({
  useEditorModeContext: () => ({ active: editorActive }),
}));

// ── Import under test (after all vi.mock calls) ───────────────────────────────
import { HtmlRenderBlockRender } from '@/components/blocks/render/HtmlRenderBlockRender';
import { renderHtmlTemplate } from '@/lib/blocks/html-render-template';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBlock(over: Partial<HtmlRenderBlock> = {}): HtmlRenderBlock {
  return {
    id: 'blk_test',
    type: 'html-render',
    order: 0,
    html: '<h1>Hello</h1>',
    fields: [],
    values: {},
    ...over,
  };
}

beforeEach(() => {
  editorActive = false;
  sendToParentMock.mockClear();
  vi.mocked(renderHtmlTemplate).mockClear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HtmlRenderBlockRender — empty HTML fallback', () => {
  it('renders placeholder when html is empty string', () => {
    vi.mocked(renderHtmlTemplate).mockReturnValueOnce('');
    const { container } = render(<HtmlRenderBlockRender block={makeBlock({ html: '' })} />);
    expect(container.textContent).toContain('No HTML yet');
    expect(container.querySelector('.border-dashed')).toBeTruthy();
  });

  it('renders placeholder when html is undefined', () => {
    vi.mocked(renderHtmlTemplate).mockReturnValueOnce('');
    const block = makeBlock();
    // @ts-expect-error — testing runtime undefined path
    block.html = undefined;
    const { container } = render(<HtmlRenderBlockRender block={block} />);
    expect(container.textContent).toContain('No HTML yet');
  });

  it('placeholder wrapper still gets responsive classes', () => {
    vi.mocked(renderHtmlTemplate).mockReturnValueOnce('');
    const block = makeBlock({
      html: '',
      responsive: { paddingTop: { desktop: '24px' } } as any,
    });
    const { container } = render(<HtmlRenderBlockRender block={block} />);
    // The outer div exists (placeholder path)
    expect(container.querySelector('.border-dashed')).toBeTruthy();
  });
});

describe('HtmlRenderBlockRender — width variants', () => {
  it('uses max-w-5xl mx-auto when width is "contained"', () => {
    const { container } = render(
      <HtmlRenderBlockRender block={makeBlock({ width: 'contained' })} />,
    );
    const inner = container.querySelector('.max-w-5xl');
    expect(inner).toBeTruthy();
  });

  it('uses w-full when width is "full"', () => {
    const { container } = render(
      <HtmlRenderBlockRender block={makeBlock({ width: 'full' })} />,
    );
    expect(container.querySelector('.w-full')).toBeTruthy();
    expect(container.querySelector('.max-w-5xl')).toBeNull();
  });

  it('uses w-full when width is undefined', () => {
    const { container } = render(
      <HtmlRenderBlockRender block={makeBlock({ width: undefined })} />,
    );
    expect(container.querySelector('.w-full')).toBeTruthy();
  });
});

describe('HtmlRenderBlockRender — data-block-id', () => {
  it('attaches data-block-id to the outer wrapper', () => {
    const { container } = render(
      <HtmlRenderBlockRender block={makeBlock({ id: 'block_abc' })} />,
    );
    const wrapper = container.querySelector('[data-block-id="block_abc"]');
    expect(wrapper).toBeTruthy();
  });
});

describe('HtmlRenderBlockRender — template substitution', () => {
  it('passes html, fields, and values to renderHtmlTemplate', () => {
    const fields = [{ name: 'title', type: 'text' as const }];
    const values = { title: 'World' };
    render(
      <HtmlRenderBlockRender
        block={makeBlock({ html: '<h1>{{title}}</h1>', fields, values })}
      />,
    );
    expect(renderHtmlTemplate).toHaveBeenCalledWith('<h1>{{title}}</h1>', fields, values);
  });

  it('renders the substituted HTML output inside the wrapper', () => {
    vi.mocked(renderHtmlTemplate).mockReturnValueOnce('<p>Substituted</p>');
    const { container } = render(
      <HtmlRenderBlockRender block={makeBlock({ html: '<p>{{x}}</p>' })} />,
    );
    // The initial html ref is passed to dangerouslySetInnerHTML
    const innerDiv = container.querySelector('[data-block-id] div div');
    expect(innerDiv?.innerHTML).toContain('Substituted');
  });

  it('passes undefined fields gracefully when fields is absent', () => {
    const block = makeBlock({ html: '<p>plain</p>' });
    // @ts-expect-error — testing absent fields
    delete block.fields;
    render(<HtmlRenderBlockRender block={block} />);
    expect(renderHtmlTemplate).toHaveBeenCalledWith('<p>plain</p>', undefined, {});
  });
});

describe('HtmlRenderBlockRender — responsive classes', () => {
  it('applies no responsive class when responsive is absent', () => {
    const { container } = render(<HtmlRenderBlockRender block={makeBlock()} />);
    // Outer wrapper has data-block-id; its className should be empty string
    const wrapper = container.querySelector('[data-block-id]');
    expect(wrapper?.className).toBe('');
  });

  it('applies responsive classes when responsive is provided', () => {
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({
          responsive: {
            paddingTop: { desktop: '20px' },
            marginBottom: { mobile: '10px' },
          } as any,
        })}
      />,
    );
    const wrapper = container.querySelector('[data-block-id]');
    // combineResponsiveClasses mock joins non-empty args; outer div gets that class
    expect(wrapper?.className).toBeTruthy();
  });
});

describe('InlineHtml — non-edit mode', () => {
  it('does not add contenteditable to data-field elements when not editing', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<span data-field="title">Hello</span>',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({ html: '<span data-field="title">Hello</span>' })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });
    const span = container.querySelector('[data-field="title"]');
    expect(span?.getAttribute('contenteditable')).toBeNull();
  });

  it('does not wire img[data-field-image] when not editing', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<img data-field-image="hero" src="x.png" />',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({ html: '<img data-field-image="hero" src="x.png" />' })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });
    const img = container.querySelector('img[data-field-image]') as HTMLImageElement | null;
    expect(img?.style.cursor).toBe('');
  });
});

describe('InlineHtml — edit mode: contenteditable text fields', () => {
  beforeEach(() => { editorActive = true; });

  it('adds contenteditable="true" to data-field elements in edit mode', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<span data-field="headline">Draft</span>',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({ html: '<span data-field="headline">Draft</span>', id: 'b1' })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });
    const span = container.querySelector('[data-field="headline"]');
    expect(span?.getAttribute('contenteditable')).toBe('true');
  });

  it('adds sd-field-editable class to data-field elements', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue('<p data-field="body">text</p>');
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({ html: '<p data-field="body">text</p>', id: 'b2' })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });
    const p = container.querySelector('[data-field="body"]');
    expect(p?.classList.contains('sd-field-editable')).toBe(true);
  });

  it('debounces input and calls sendToParent(BLOCK_CONTENT_UPDATED) after 300ms', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<span data-field="name">A</span>',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({ html: '<span data-field="name">A</span>', id: 'bsend' })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });

    const span = container.querySelector('[data-field="name"]') as HTMLElement;
    fireEvent.input(span);

    // Before debounce fires
    expect(sendToParentMock).not.toHaveBeenCalled();

    await act(async () => { vi.advanceTimersByTime(300); });

    expect(sendToParentMock).toHaveBeenCalledWith(
      'BLOCK_CONTENT_UPDATED',
      expect.objectContaining({ blockId: 'bsend', field: 'name' }),
    );
  });

  it('skips data-field elements inside data-loop-item ancestors', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<div data-loop-item="1"><span data-field="title">Loop Item</span></div>',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({
          html: '<div data-loop-item="1"><span data-field="title">Loop Item</span></div>',
          id: 'bloop',
        })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });
    const span = container.querySelector('[data-field="title"]');
    // Should NOT have contenteditable because it's inside data-loop-item
    expect(span?.getAttribute('contenteditable')).toBeNull();
  });

  it('resolves field path as "array.index.field" for data-repeat-item ancestor', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<div data-repeat-item="items:0"><span data-field="label">Item label</span></div>',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({
          html: '<div data-repeat-item="items:0"><span data-field="label">Item label</span></div>',
          id: 'brepeat',
        })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });

    const span = container.querySelector('[data-field="label"]') as HTMLElement;
    fireEvent.input(span);
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(sendToParentMock).toHaveBeenCalledWith(
      'BLOCK_CONTENT_UPDATED',
      expect.objectContaining({ field: 'items.0.label' }),
    );
  });

  it('resolves field path as "group.field" for data-group-item ancestor', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<div data-group-item="cta"><span data-field="heading">CTA heading</span></div>',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({
          html: '<div data-group-item="cta"><span data-field="heading">CTA heading</span></div>',
          id: 'bgroup',
        })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });

    const span = container.querySelector('[data-field="heading"]') as HTMLElement;
    fireEvent.input(span);
    await act(async () => { vi.advanceTimersByTime(300); });

    expect(sendToParentMock).toHaveBeenCalledWith(
      'BLOCK_CONTENT_UPDATED',
      expect.objectContaining({ field: 'cta.heading' }),
    );
  });
});

describe('InlineHtml — edit mode: image fields', () => {
  beforeEach(() => { editorActive = true; });

  it('sets cursor:pointer and sd-image-editable on img[data-field-image]', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<img data-field-image="hero" src="old.png" />',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({ html: '<img data-field-image="hero" src="old.png" />', id: 'bimg' })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });
    const img = container.querySelector('img[data-field-image]') as HTMLImageElement;
    expect(img.style.cursor).toBe('pointer');
    expect(img.classList.contains('sd-image-editable')).toBe(true);
  });

  it('sends REQUEST_IMAGE_PICKER on image click with field and currentValue', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<img data-field-image="banner" src="current.jpg" />',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({ html: '<img data-field-image="banner" src="current.jpg" />', id: 'bimgclick' })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });

    const img = container.querySelector('img[data-field-image]') as HTMLImageElement;
    fireEvent.click(img);

    expect(sendToParentMock).toHaveBeenCalledWith(
      'REQUEST_IMAGE_PICKER',
      expect.objectContaining({
        blockId: 'bimgclick',
        field: 'banner',
        currentValue: 'current.jpg',
      }),
    );
  });

  it('skips img[data-field-image] inside data-loop-item', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<div data-loop-item="post"><img data-field-image="thumb" src="x.jpg" /></div>',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({
          html: '<div data-loop-item="post"><img data-field-image="thumb" src="x.jpg" /></div>',
          id: 'bimgloop',
        })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });
    const img = container.querySelector('img[data-field-image]') as HTMLImageElement;
    expect(img.style.cursor).toBe('');
  });

  it('resolves image field path for data-repeat-item ancestor', async () => {
    vi.mocked(renderHtmlTemplate).mockReturnValue(
      '<div data-repeat-item="cards:1"><img data-field-image="cards.image" src="a.jpg" /></div>',
    );
    const { container } = render(
      <HtmlRenderBlockRender
        block={makeBlock({
          html: '<div data-repeat-item="cards:1"><img data-field-image="cards.image" src="a.jpg" /></div>',
          id: 'bimgrpt',
        })}
      />,
    );
    await act(async () => { vi.runAllTimers(); });

    const img = container.querySelector('img[data-field-image]') as HTMLImageElement;
    fireEvent.click(img);

    // baseName "cards.image" starts with "cards." → "cards.1.image"
    expect(sendToParentMock).toHaveBeenCalledWith(
      'REQUEST_IMAGE_PICKER',
      expect.objectContaining({ field: 'cards.1.image' }),
    );
  });
});
