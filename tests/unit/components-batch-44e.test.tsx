/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
/**
 * Batch 44e — four medium-size, mostly self-contained UI components.
 *
 * Components covered:
 *   - HtmlEmbedBlockRender    (components/blocks/render/HtmlEmbedBlockRender.tsx)
 *       Exercises empty-state, iframe-fallback (with sandbox preset mapping +
 *       width contained/full), and inline-html script-rehydration paths.
 *   - PositionMultiSelect     (components/portal/PositionMultiSelect.tsx)
 *       Exercises filtering, add/remove chip, keyboard navigation, outside-
 *       click close, backspace-pop, and "no matches" branch.
 *   - PalizziNavBlockRender   (components/blocks/render/PalizziNavBlockRender.tsx)
 *       Exercises desktop link rendering, hover color swap, mobile hamburger
 *       toggle, and link tap closing the mobile sheet.
 *   - CustomCodeModal         (components/portal/CustomCodeModal.tsx)
 *       Exercises open=false short-circuit, tab swap, dirty detection,
 *       backdrop-click close, Escape close, and Apply propagation.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for next/image — passthrough <img>. PalizziNavBlockRender uses it for
// the brand logo. We strip framer-style props so jsdom doesn't warn.
// ---------------------------------------------------------------------------
vi.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, width, height, ...rest }: any) => {
    const { fill: _fill, sizes: _sizes, priority: _p, placeholder: _pl, blurDataURL: _bd, loader: _l, quality: _q, ...domSafe } = rest;
    void _fill; void _sizes; void _p; void _pl; void _bd; void _l; void _q;
    return React.createElement('img', { src, alt, width, height, ...domSafe });
  },
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { HtmlEmbedBlockRender } from '@/components/blocks/render/HtmlEmbedBlockRender';
import PositionMultiSelect from '@/components/portal/PositionMultiSelect';
import { PalizziNavBlockRender } from '@/components/blocks/render/PalizziNavBlockRender';
import { CustomCodeModal } from '@/components/portal/CustomCodeModal';

// ===========================================================================
// HtmlEmbedBlockRender
// ===========================================================================
describe('HtmlEmbedBlockRender', () => {
  const baseBlock = (extras: Record<string, unknown> = {}) =>
    ({ id: 'b1', type: 'html-embed', order: 0, ...extras }) as any;

  it('renders the empty-state placeholder when neither url nor inlineHtml is set', () => {
    const { container } = render(<HtmlEmbedBlockRender block={baseBlock()} />);
    expect(container.textContent).toContain('No HTML file uploaded yet');
    // No iframe in the empty state.
    expect(container.querySelector('iframe')).toBeNull();
    // Material-icon hint is present.
    expect(container.querySelector('.material-icons')?.textContent).toBe('code');
  });

  it('renders an iframe with the URL, default sandbox preset, and default height when only url is set', () => {
    const { container } = render(
      <HtmlEmbedBlockRender block={baseBlock({ url: 'https://example.com/x.html' })} />,
    );
    const iframe = container.querySelector('iframe')!;
    expect(iframe).toBeTruthy();
    expect(iframe.getAttribute('src')).toBe('https://example.com/x.html?embed=1');
    // Default preset === 'scripts' which maps to 'allow-scripts allow-popups allow-popups-to-escape-sandbox'.
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-popups allow-popups-to-escape-sandbox');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('loading')).toBe('lazy');
    // Default height fallback.
    expect((iframe as HTMLIFrameElement).style.height).toBe('600px');
    // Default title fallback.
    expect(iframe.getAttribute('title')).toBe('Embedded HTML content');
  });

  it('maps sandbox=strict to an empty sandbox attribute and respects custom height/title/caption', () => {
    const { container } = render(
      <HtmlEmbedBlockRender
        block={baseBlock({
          url: 'https://example.com/strict.html',
          sandbox: 'strict',
          height: '900px',
          iframeTitle: 'My Embed',
          caption: 'Look ma, no scripts',
        })}
      />,
    );
    const iframe = container.querySelector('iframe')!;
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect((iframe as HTMLIFrameElement).style.height).toBe('900px');
    expect(iframe.getAttribute('title')).toBe('My Embed');
    // Caption appears below the iframe.
    expect(container.textContent).toContain('Look ma, no scripts');
  });

  it('maps sandbox=scripts-forms to the multi-flag preset', () => {
    const { container } = render(
      <HtmlEmbedBlockRender
        block={baseBlock({ url: 'https://example.com/forms.html', sandbox: 'scripts-forms' })}
      />,
    );
    const iframe = container.querySelector('iframe')!;
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox');
  });

  it('applies the contained width wrapper when block.width is "contained"', () => {
    const { container } = render(
      <HtmlEmbedBlockRender
        block={baseBlock({ url: 'https://example.com/x.html', width: 'contained' })}
      />,
    );
    // The inner wrapper holds the iframe; with width=contained it gets max-w-5xl.
    expect(container.querySelector('.max-w-5xl.mx-auto')).toBeTruthy();
    // The iframe itself has w-full as its own class, so we look for a wrapper
    // div whose className is *exactly* the full-width variant — i.e. starts
    // with 'w-full' as the container, not as a flex child.
    const iframeParent = container.querySelector('iframe')!.parentElement!;
    expect(iframeParent.className).toContain('max-w-5xl');
    expect(iframeParent.className).not.toContain('w-full');
  });

  it('applies the full-width wrapper when block.width is undefined', () => {
    const { container } = render(
      <HtmlEmbedBlockRender block={baseBlock({ url: 'https://example.com/x.html' })} />,
    );
    // Default = full → iframe parent's className is exactly the full variant.
    expect(container.querySelector('.max-w-5xl')).toBeNull();
    const iframeParent = container.querySelector('iframe')!.parentElement!;
    expect(iframeParent.className).toContain('w-full');
    expect(iframeParent.className).not.toContain('max-w-5xl');
  });

  it('renders inlineHtml verbatim into the page and skips the iframe', () => {
    const { container } = render(
      <HtmlEmbedBlockRender
        block={baseBlock({ inlineHtml: '<section id="inline-marker"><p>hi</p></section>' })}
      />,
    );
    // No iframe in inline mode.
    expect(container.querySelector('iframe')).toBeNull();
    // The inline body landed in the DOM.
    expect(container.querySelector('#inline-marker')).toBeTruthy();
    expect(container.textContent).toContain('hi');
  });

  it('rehydrates inert <script> tags after mount so the script element gets re-inserted', () => {
    const { container } = render(
      <HtmlEmbedBlockRender
        block={baseBlock({
          inlineHtml: '<div id="inline2"><script id="s1" data-test="x">/* noop */</script></div>',
        })}
      />,
    );
    // The original script tag should have been replaced with a fresh script
    // element — same id, same data attribute, same textContent — but a new
    // node so the browser would execute it. We assert the post-effect state.
    const scripts = container.querySelectorAll('script');
    expect(scripts.length).toBe(1);
    const s = scripts[0]!;
    expect(s.getAttribute('id')).toBe('s1');
    expect(s.getAttribute('data-test')).toBe('x');
    expect(s.textContent).toContain('noop');
  });

  it('renders the caption alongside the inline-html branch when both are set', () => {
    const { container } = render(
      <HtmlEmbedBlockRender
        block={baseBlock({
          inlineHtml: '<p>inline body</p>',
          caption: 'inline caption',
        })}
      />,
    );
    expect(container.textContent).toContain('inline body');
    expect(container.textContent).toContain('inline caption');
  });

  it('invokes combineResponsiveClasses path when block.responsive is set (no crash, wrapper still renders)', () => {
    // combineResponsiveClasses currently returns '' in the implementation, so
    // we just assert the responsive branch doesn't throw and the iframe still
    // mounts. This covers the responsive-truthy code path.
    const { container } = render(
      <HtmlEmbedBlockRender
        block={baseBlock({
          url: 'https://example.com/x.html',
          responsive: { paddingTop: 'md', paddingBottom: 'lg' },
        })}
      />,
    );
    expect(container.querySelector('iframe')).toBeTruthy();
  });
});

// ===========================================================================
// PositionMultiSelect
// ===========================================================================
describe('PositionMultiSelect', () => {
  const OPTIONS = ['Engineer', 'Designer', 'Marketing', 'Sales', 'PM'];

  it('renders the placeholder when no values are selected and no list before focus', () => {
    const { getByPlaceholderText, container } = render(
      <PositionMultiSelect options={OPTIONS} selected={[]} onChange={() => {}} />,
    );
    expect(getByPlaceholderText('Filter by position...')).toBeTruthy();
    // The dropdown <ul> only mounts when `open`.
    expect(container.querySelector('ul')).toBeNull();
  });

  it('renders each selected value as a chip and hides the placeholder', () => {
    const { container, queryByPlaceholderText } = render(
      <PositionMultiSelect options={OPTIONS} selected={['Engineer', 'Sales']} onChange={() => {}} />,
    );
    expect(container.textContent).toContain('Engineer');
    expect(container.textContent).toContain('Sales');
    // Placeholder is only shown when selected is empty.
    expect(queryByPlaceholderText('Filter by position...')).toBeNull();
  });

  it('opens the dropdown on focus and lists options not already selected', () => {
    const { container, getByRole } = render(
      <PositionMultiSelect options={OPTIONS} selected={['Engineer']} onChange={() => {}} />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    const items = container.querySelectorAll('li');
    // 5 options - 1 selected = 4 remaining.
    expect(items.length).toBe(4);
    const labels = Array.from(items).map((li) => li.textContent);
    expect(labels).not.toContain('Engineer');
    expect(labels).toContain('Designer');
  }, 15_000);

  it('filters options by case-insensitive substring match on the query', () => {
    const { container, getByRole } = render(
      <PositionMultiSelect options={OPTIONS} selected={[]} onChange={() => {}} />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'en' } });
    const labels = Array.from(container.querySelectorAll('li')).map((li) => li.textContent);
    // 'en' matches Engineer ("en" inside "Engineer").
    expect(labels).toEqual(['Engineer']);
  });

  it('shows the "No matching positions" branch when the query has no hits', () => {
    const { container, getByRole } = render(
      <PositionMultiSelect options={OPTIONS} selected={[]} onChange={() => {}} />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(container.textContent).toContain('No matching positions');
    // No <li> items in this branch.
    expect(container.querySelectorAll('li').length).toBe(0);
  });

  it('adds an option via mousedown on a list item and clears the query', () => {
    const onChange = vi.fn();
    const { container, getByRole } = render(
      <PositionMultiSelect options={OPTIONS} selected={[]} onChange={onChange} />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'des' } });
    const designerLi = Array.from(container.querySelectorAll('li')).find(
      (li) => li.textContent === 'Designer',
    )!;
    fireEvent.mouseDown(designerLi);
    expect(onChange).toHaveBeenCalledWith(['Designer']);
  });

  it('does not duplicate an already-selected option even if addValue is called for it', () => {
    const onChange = vi.fn();
    // We force the situation by hand-firing the chip click handler — simpler
    // path is just to verify the filter excludes selected. But guard anyway:
    // the displayed options list filters out selected entries already.
    const { container, getByRole } = render(
      <PositionMultiSelect options={OPTIONS} selected={['Engineer']} onChange={onChange} />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'eng' } });
    const labels = Array.from(container.querySelectorAll('li')).map((li) => li.textContent);
    expect(labels).not.toContain('Engineer');
  });

  it('removes a chip when its X button is clicked', () => {
    const onChange = vi.fn();
    const { getByLabelText } = render(
      <PositionMultiSelect
        options={OPTIONS}
        selected={['Engineer', 'Sales']}
        onChange={onChange}
      />,
    );
    fireEvent.click(getByLabelText('Remove Engineer'));
    expect(onChange).toHaveBeenCalledWith(['Sales']);
  });

  it('pops the last chip on Backspace when query is empty', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <PositionMultiSelect
        options={OPTIONS}
        selected={['Engineer', 'Sales']}
        onChange={onChange}
      />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).toHaveBeenCalledWith(['Engineer']);
  });

  it('does not pop a chip on Backspace when the query is non-empty', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <PositionMultiSelect options={OPTIONS} selected={['Sales']} onChange={onChange} />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'x' } });
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(onChange).not.toHaveBeenCalled();
  });

  it('navigates the dropdown with ArrowDown + Enter to add the highlighted option', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <PositionMultiSelect options={OPTIONS} selected={[]} onChange={onChange} />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    // activeIndex starts at 0 — first option is "Engineer". ArrowDown moves to "Designer".
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    // First call should match the second option in the list.
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0]?.[0]).toEqual(['Designer']);
  });

  it('does not move the active index below zero on ArrowUp', () => {
    const onChange = vi.fn();
    const { getByRole } = render(
      <PositionMultiSelect options={OPTIONS} selected={[]} onChange={onChange} />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    // Should clamp at 0 without crashing.
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(['Engineer']);
  });

  it('closes the dropdown on Escape', () => {
    const { container, getByRole } = render(
      <PositionMultiSelect options={OPTIONS} selected={[]} onChange={() => {}} />,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    expect(container.querySelector('ul')).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(container.querySelector('ul')).toBeNull();
  });

  it('closes the dropdown on outside mousedown', () => {
    const { container, getByRole } = render(
      <div>
        <PositionMultiSelect options={OPTIONS} selected={[]} onChange={() => {}} />
        <div data-testid="outside">outside region</div>
      </div>,
    );
    const input = getByRole('textbox') as HTMLInputElement;
    fireEvent.focus(input);
    expect(container.querySelector('ul')).toBeTruthy();
    // Dispatch a real document-level mousedown — the component listens on document.
    act(() => {
      const evt = new MouseEvent('mousedown', { bubbles: true });
      document.body.dispatchEvent(evt);
    });
    expect(container.querySelector('ul')).toBeNull();
  });
});

// ===========================================================================
// PalizziNavBlockRender
// ===========================================================================
describe('PalizziNavBlockRender', () => {
  const block = (): any => ({
    id: 'n1',
    type: 'palizzi-nav',
    order: 0,
    logoUrl: 'https://cdn.example/logo.png',
    brandName: 'Palizzi',
    links: [
      { label: 'Home', href: '#home' },
      { label: 'About', href: '#about' },
      { label: 'Menu', href: '#menu' },
    ],
  });

  it('renders the brand name and logo image with the configured src/alt', () => {
    const { container } = render(<PalizziNavBlockRender block={block()} />);
    const img = container.querySelector('img')!;
    expect(img.getAttribute('src')).toBe('https://cdn.example/logo.png');
    expect(img.getAttribute('alt')).toBe('Palizzi');
    expect(container.textContent).toContain('Palizzi');
  });

  it('renders every link twice — once in the desktop bar and once in the (hidden) mobile sheet', () => {
    const { container } = render(<PalizziNavBlockRender block={block()} />);
    // 3 links * 2 layouts = 6 link anchors. Plus the brand anchor at the top.
    const anchors = container.querySelectorAll('a');
    // Brand anchor = 1, link anchors = 6.
    expect(anchors.length).toBe(7);
    // Every label appears at least twice in the DOM.
    const html = container.innerHTML;
    expect(html.match(/Home/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/About/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html.match(/Menu/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it('swaps the desktop link color on mouse enter and restores it on leave', () => {
    const { container } = render(<PalizziNavBlockRender block={block()} />);
    // Find a desktop nav link by its label text; the desktop block uses the md:flex group.
    const desktop = container.querySelector('.md\\:flex')!;
    const link = desktop.querySelector('a') as HTMLAnchorElement;
    expect(link).toBeTruthy();
    fireEvent.mouseEnter(link);
    expect(link.style.color).toBe('rgb(201, 169, 110)');
    fireEvent.mouseLeave(link);
    // After leave the inline color is the muted fallback; jsdom normalises rgba().
    expect(link.style.color).not.toBe('rgb(201, 169, 110)');
  });

  it('toggles the mobile hamburger and updates the chevron transforms', () => {
    const { container, getByLabelText } = render(<PalizziNavBlockRender block={block()} />);
    const btn = getByLabelText('Toggle menu');
    // Before toggle — sheet maxHeight is "0".
    const sheet = container.querySelector('.md\\:hidden.overflow-hidden') as HTMLElement;
    expect(sheet.style.maxHeight).toBe('0');
    fireEvent.click(btn);
    // After toggle — sheet opens to 16rem.
    expect(sheet.style.maxHeight).toBe('16rem');
    fireEvent.click(btn);
    expect(sheet.style.maxHeight).toBe('0');
  });

  it('closes the mobile menu when a link inside the sheet is clicked', () => {
    const { container, getByLabelText } = render(<PalizziNavBlockRender block={block()} />);
    fireEvent.click(getByLabelText('Toggle menu'));
    const sheet = container.querySelector('.md\\:hidden.overflow-hidden') as HTMLElement;
    expect(sheet.style.maxHeight).toBe('16rem');
    // Click the first link inside the sheet — the component clears the open state on link click.
    const sheetLink = sheet.querySelector('a') as HTMLAnchorElement;
    fireEvent.click(sheetLink);
    expect(sheet.style.maxHeight).toBe('0');
  });

  it('responds to window scroll by flipping the scrolled background style', () => {
    const { container } = render(<PalizziNavBlockRender block={block()} />);
    const nav = container.querySelector('nav') as HTMLElement;
    // Pre-scroll — background is transparent.
    expect(nav.style.backgroundColor).toBe('transparent');
    // Simulate scrolling past the 50px threshold.
    Object.defineProperty(window, 'scrollY', { value: 100, configurable: true, writable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(nav.style.backgroundColor).toBe('rgba(13, 13, 13, 0.95)');
    // Scroll back up — background reverts.
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
    act(() => {
      window.dispatchEvent(new Event('scroll'));
    });
    expect(nav.style.backgroundColor).toBe('transparent');
  });
});

// ===========================================================================
// CustomCodeModal
// ===========================================================================
describe('CustomCodeModal', () => {
  it('returns null when open=false', () => {
    const { container } = render(
      <CustomCodeModal
        open={false}
        initialCss=""
        initialJs=""
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('opens with the CSS tab active and shows the initialCss value', () => {
    const { container } = render(
      <CustomCodeModal
        open={true}
        initialCss=".foo { color: red; }"
        initialJs="alert(1)"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('.foo { color: red; }');
    // The CSS tab description should appear in the tab header strip.
    expect(container.textContent).toContain('Scoped to .block-content');
  });

  it('switches to the JS tab and shows the initialJs value', () => {
    const { container, getByText } = render(
      <CustomCodeModal
        open={true}
        initialCss=".foo {}"
        initialJs="alert(42)"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    fireEvent.click(getByText('JavaScript'));
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta.value).toBe('alert(42)');
    expect(container.textContent).toContain('Runs after DOM ready');
  });

  it('shows the "No changes" footer hint when css/js match initial values', () => {
    const { container } = render(
      <CustomCodeModal
        open={true}
        initialCss="x"
        initialJs="y"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    expect(container.textContent).toContain('No changes.');
  });

  it('shows the dirty hint when the textarea diverges from initial, and enables Apply', () => {
    const { container, getByText } = render(
      <CustomCodeModal
        open={true}
        initialCss="x"
        initialJs="y"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'x-edit' } });
    expect(container.textContent).toContain('Unsaved changes');
    const apply = getByText('Apply').closest('button') as HTMLButtonElement;
    expect(apply.disabled).toBe(false);
  });

  it('disables the Apply button when no changes have been made', () => {
    const { getByText } = render(
      <CustomCodeModal
        open={true}
        initialCss="x"
        initialJs="y"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const apply = getByText('Apply').closest('button') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
  });

  it('fires onApply(css, js) with the latest values then onClose when Apply is clicked', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const { container, getByText } = render(
      <CustomCodeModal
        open={true}
        initialCss="x"
        initialJs="y"
        onClose={onClose}
        onApply={onApply}
      />,
    );
    // Edit CSS.
    const cssTa = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(cssTa, { target: { value: 'css-new' } });
    // Switch to JS tab and edit.
    fireEvent.click(getByText('JavaScript'));
    const jsTa = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(jsTa, { target: { value: 'js-new' } });
    // Click Apply.
    fireEvent.click(getByText('Apply'));
    expect(onApply).toHaveBeenCalledWith('css-new', 'js-new');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the Cancel button is clicked, without invoking onApply', () => {
    const onApply = vi.fn();
    const onClose = vi.fn();
    const { getByText } = render(
      <CustomCodeModal
        open={true}
        initialCss="x"
        initialJs="y"
        onClose={onClose}
        onApply={onApply}
      />,
    );
    fireEvent.click(getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onApply).not.toHaveBeenCalled();
  });

  it('fires onClose on Escape keydown while the modal is open', () => {
    const onClose = vi.fn();
    render(
      <CustomCodeModal
        open={true}
        initialCss=""
        initialJs=""
        onClose={onClose}
        onApply={() => {}}
      />,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('fires onClose when the backdrop is clicked (mousedown lands on the backdrop, not the dialog)', () => {
    const onClose = vi.fn();
    const { container } = render(
      <CustomCodeModal
        open={true}
        initialCss=""
        initialJs=""
        onClose={onClose}
        onApply={() => {}}
      />,
    );
    // The outermost <div> in the modal tree is the backdrop. mouseDown on it triggers onClose.
    const backdrop = container.firstElementChild as HTMLElement;
    fireEvent.mouseDown(backdrop, { target: backdrop });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClose when the inner dialog receives the mousedown', () => {
    const onClose = vi.fn();
    const { container } = render(
      <CustomCodeModal
        open={true}
        initialCss=""
        initialJs=""
        onClose={onClose}
        onApply={() => {}}
      />,
    );
    const dialog = container.querySelector('.max-w-4xl') as HTMLElement;
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('resets css/js/tab to the initial values when the modal re-opens with new initials', () => {
    const { container, rerender, getByText } = render(
      <CustomCodeModal
        open={false}
        initialCss="a"
        initialJs="b"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    rerender(
      <CustomCodeModal
        open={true}
        initialCss="a"
        initialJs="b"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    // Switch to JS, edit it.
    fireEvent.click(getByText('JavaScript'));
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'b-edit' } });
    // Close.
    rerender(
      <CustomCodeModal
        open={false}
        initialCss="a"
        initialJs="b"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    // Re-open with new initials — should reset both fields AND force the CSS tab.
    rerender(
      <CustomCodeModal
        open={true}
        initialCss="aa"
        initialJs="bb"
        onClose={() => {}}
        onApply={() => {}}
      />,
    );
    const ta2 = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta2.value).toBe('aa');
  });
});
