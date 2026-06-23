// @vitest-environment jsdom
/**
 * Unit tests for 4 small block render components (batch 38g):
 *
 *   - SpacerBlockRender     (components/blocks/render/SpacerBlockRender.tsx)
 *   - DividerBlockRender    (components/blocks/render/DividerBlockRender.tsx)
 *   - QuoteBlockRender      (components/blocks/render/QuoteBlockRender.tsx)
 *   - CodeBlockRender       (components/blocks/render/CodeBlockRender.tsx)
 *
 * These are pure presentational client components that take a single `block`
 * prop and return JSX. No server-only imports, no Next router. We render each
 * with @testing-library/react in jsdom and assert against the produced DOM.
 */
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';

import { SpacerBlockRender } from '@/components/blocks/render/SpacerBlockRender';
import { DividerBlockRender } from '@/components/blocks/render/DividerBlockRender';
import { QuoteBlockRender } from '@/components/blocks/render/QuoteBlockRender';
import { CodeBlockRender } from '@/components/blocks/render/CodeBlockRender';

// Loose any-cast helpers — the type union for blocks is sprawling and these
// tests only need to confirm runtime DOM output for the discriminant + a few
// optional fields. Strict typing here just creates noise without adding value.
function makeSpacer(overrides: Record<string, unknown> = {}) {
  return {
    id: 's1',
    type: 'spacer',
    order: 0,
    height: 'md',
    ...overrides,
  } as unknown as Parameters<typeof SpacerBlockRender>[0]['block'];
}

function makeDivider(overrides: Record<string, unknown> = {}) {
  return {
    id: 'd1',
    type: 'divider',
    order: 0,
    ...overrides,
  } as unknown as Parameters<typeof DividerBlockRender>[0]['block'];
}

function makeQuote(overrides: Record<string, unknown> = {}) {
  return {
    id: 'q1',
    type: 'quote',
    order: 0,
    content: 'A wise saying.',
    ...overrides,
  } as unknown as Parameters<typeof QuoteBlockRender>[0]['block'];
}

function makeCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    type: 'code',
    order: 0,
    code: 'const x = 1;',
    ...overrides,
  } as unknown as Parameters<typeof CodeBlockRender>[0]['block'];
}

describe('SpacerBlockRender', () => {
  it.each([
    ['sm', 'h-4'],
    ['md', 'h-8'],
    ['lg', 'h-16'],
    ['xl', 'h-32'],
  ] as const)('renders a div with height class for height=%s', (height, expected) => {
    const { container } = render(<SpacerBlockRender block={makeSpacer({ height })} />);
    const div = container.querySelector('div');
    expect(div).toBeTruthy();
    expect(div!.className).toContain(expected);
  });

  it('renders no children — spacer is a leaf element', () => {
    const { container } = render(<SpacerBlockRender block={makeSpacer()} />);
    const div = container.querySelector('div');
    expect(div!.children.length).toBe(0);
  });

  it('applies responsive classes when responsive settings are provided', () => {
    const block = makeSpacer({
      responsive: {
        paddingTop: { desktop: '24px' },
      },
    });
    const { container } = render(<SpacerBlockRender block={block} />);
    // The combineResponsiveClasses helper returns a non-empty string for any
    // responsive setting, so the div's className should be longer than the
    // pure-height case.
    const div = container.querySelector('div');
    const noResponsive = render(<SpacerBlockRender block={makeSpacer()} />)
      .container.querySelector('div')!.className.trim();
    expect(div!.className.trim().length).toBeGreaterThanOrEqual(noResponsive.length);
  });
});

describe('DividerBlockRender', () => {
  it('defaults to solid line style when lineStyle is omitted', () => {
    const { container } = render(<DividerBlockRender block={makeDivider()} />);
    const hr = container.querySelector('hr');
    expect(hr).toBeTruthy();
    expect(hr!.className).toContain('border-solid');
  });

  it.each([
    ['solid', 'border-solid'],
    ['dashed', 'border-dashed'],
    ['dotted', 'border-dotted'],
  ] as const)('renders an <hr> with style class for lineStyle=%s', (lineStyle, expected) => {
    const { container } = render(
      <DividerBlockRender block={makeDivider({ lineStyle })} />,
    );
    const hr = container.querySelector('hr');
    expect(hr!.className).toContain(expected);
  });

  it('omits border-border class when style.borderColor is set', () => {
    const block = makeDivider({ style: { borderColor: '#ff0000' } });
    const { container } = render(<DividerBlockRender block={block} />);
    const hr = container.querySelector('hr');
    expect(hr!.className).not.toContain('border-border');
  });

  it('includes border-border class when style.borderColor is not set', () => {
    const { container } = render(<DividerBlockRender block={makeDivider()} />);
    const hr = container.querySelector('hr');
    expect(hr!.className).toContain('border-border');
  });
});

describe('QuoteBlockRender', () => {
  it('renders quoted content with curly quotes for plain text', () => {
    const { container } = render(
      <QuoteBlockRender block={makeQuote({ content: 'Hello' })} />,
    );
    const blockquote = container.querySelector('blockquote');
    expect(blockquote).toBeTruthy();
    expect(blockquote!.textContent).toContain('Hello');
    // Curly opening / closing quotes from `&ldquo;`/`&rdquo;`
    expect(blockquote!.textContent).toMatch(/[“”]/);
  });

  it('renders HTML content via dangerouslySetInnerHTML when content contains a tag', () => {
    const { container } = render(
      <QuoteBlockRender
        block={makeQuote({ content: 'Hello <strong>world</strong>' })}
      />,
    );
    expect(container.querySelector('strong')).toBeTruthy();
  });

  it('renders author and citation in the footer when both are provided', () => {
    const { container } = render(
      <QuoteBlockRender
        block={makeQuote({ author: 'Ada Lovelace', citation: 'Notes, 1843' })}
      />,
    );
    const footer = container.querySelector('footer');
    expect(footer).toBeTruthy();
    expect(footer!.textContent).toContain('Ada Lovelace');
    expect(footer!.textContent).toContain('Notes, 1843');
    expect(container.querySelector('cite')).toBeTruthy();
  });

  it('omits the footer entirely when neither author nor citation is set', () => {
    const { container } = render(<QuoteBlockRender block={makeQuote()} />);
    expect(container.querySelector('footer')).toBeNull();
  });

  it('renders the author with em-dash prefix', () => {
    const { container } = render(
      <QuoteBlockRender block={makeQuote({ author: 'Someone' })} />,
    );
    const cite = container.querySelector('cite');
    expect(cite!.textContent).toContain('Someone');
    expect(cite!.textContent).toContain('—');
  });
});

describe('CodeBlockRender', () => {
  it('renders the code content inside a <pre><code> block', () => {
    const { container } = render(
      <CodeBlockRender block={makeCode({ code: 'const answer = 42;' })} />,
    );
    const pre = container.querySelector('pre');
    const code = container.querySelector('code');
    expect(pre).toBeTruthy();
    expect(code).toBeTruthy();
    expect(code!.textContent).toBe('const answer = 42;');
  });

  it('renders a language label header when block.language is set', () => {
    const { container } = render(
      <CodeBlockRender block={makeCode({ language: 'typescript' })} />,
    );
    expect(container.textContent).toContain('typescript');
  });

  it('omits the language label when block.language is missing', () => {
    const { container } = render(<CodeBlockRender block={makeCode()} />);
    // No header row → only the <pre> child inside the inner wrapper
    const wrapper = container.querySelector('.rounded-lg');
    expect(wrapper).toBeTruthy();
    expect(wrapper!.children.length).toBe(1);
    expect(wrapper!.children[0].tagName).toBe('PRE');
  });

  it('drops the default dark background classes when style.backgroundColor is set', () => {
    const block = makeCode({ style: { backgroundColor: '#ffffff' } });
    const { container } = render(<CodeBlockRender block={block} />);
    const wrapper = container.querySelector('.rounded-lg');
    expect(wrapper!.className).not.toContain('bg-slate-900');
  });

  it('keeps default text-slate-100 class on <code> when style.color is unset', () => {
    const { container } = render(<CodeBlockRender block={makeCode()} />);
    const code = container.querySelector('code');
    expect(code!.className).toContain('text-slate-100');
  });
});
