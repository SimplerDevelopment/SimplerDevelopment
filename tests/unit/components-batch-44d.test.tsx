// @vitest-environment jsdom
/**
 * Batch 44d — four medium components (100-250 LOC).
 *
 * Components covered:
 *   - CardChecklist        (components/portal/card-detail/_sections/CardChecklist.tsx)
 *   - MentionPill + parsers (components/portal/comments/MentionPill.tsx)
 *   - AnchorPinLayer       (components/portal/comments/AnchorPinLayer.tsx)
 *   - HtmlEmbedBlockRender (components/blocks/render/HtmlEmbedBlockRender.tsx)
 *
 * Each block exercises the component's branching logic (empty state vs.
 * delegate, filtering rules, conditional render paths). Heavy transitive
 * deps (AnchorPin) are mocked into deterministic stubs so the tests focus
 * on the wrapper logic.
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks for heavy transitive deps
// ---------------------------------------------------------------------------

vi.mock('@/components/portal/comments/AnchorPin', () => ({
  __esModule: true,
  AnchorPin: ({ thread }: { thread?: { threadId?: string; root?: { anchor?: { x?: number; y?: number } } } }) =>
    React.createElement('div', {
      'data-testid': 'anchor-pin',
      'data-thread-id': thread?.threadId ?? '',
      'data-x': String(thread?.root?.anchor?.x ?? ''),
      'data-y': String(thread?.root?.anchor?.y ?? ''),
    }),
  default: ({ thread }: { thread?: { threadId?: string; root?: { anchor?: { x?: number; y?: number } } } }) =>
    React.createElement('div', {
      'data-testid': 'anchor-pin',
      'data-thread-id': thread?.threadId ?? '',
    }),
}));

vi.mock('@/lib/utils/responsive', () => ({
  __esModule: true,
  combineResponsiveClasses: (...parts: unknown[]) =>
    parts.filter(Boolean).join(' '),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import { CardChecklist } from '@/components/portal/card-detail/_sections/CardChecklist';
import {
  MentionPill,
  CommentBodyRenderer,
  tokenizeCommentBody,
  stringifyCommentBody,
} from '@/components/portal/comments/MentionPill';
import { AnchorPinLayer } from '@/components/portal/comments/AnchorPinLayer';
import { HtmlEmbedBlockRender } from '@/components/blocks/render/HtmlEmbedBlockRender';
import type { HtmlEmbedBlock } from '@/types/blocks';

// ---------------------------------------------------------------------------
// CardChecklist
// ---------------------------------------------------------------------------
describe('CardChecklist', () => {
  const baseProps = {
    checklist: [] as Array<{ id: number; text: string; completed: boolean }>,
    canEdit: true,
    newChecklistText: '',
    setNewChecklistText: vi.fn(),
    addChecklist: vi.fn(),
    toggleChecklistItem: vi.fn(),
    removeChecklistItem: vi.fn(),
  };

  it('returns null when checklist is empty and canEdit is false', () => {
    const { container } = render(
      <CardChecklist {...baseProps} canEdit={false} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the header without count when checklist is empty', () => {
    const { container } = render(<CardChecklist {...baseProps} />);
    expect(container.textContent).toContain('Checklist');
    // No counter span when checklist.length === 0
    expect(container.querySelector('.h-1.bg-muted')).toBeNull();
    // No <ul> when empty
    expect(container.querySelector('ul')).toBeNull();
  });

  it('renders progress bar with 0% when no items completed', () => {
    const checklist = [
      { id: 1, text: 'A', completed: false },
      { id: 2, text: 'B', completed: false },
    ];
    const { container } = render(
      <CardChecklist {...baseProps} checklist={checklist} />,
    );
    expect(container.textContent).toContain('0/2');
    const bar = container.querySelector('.h-full.bg-green-500') as HTMLElement;
    expect(bar).toBeTruthy();
    expect(bar.style.width).toBe('0%');
  });

  it('renders progress bar with correct percentage and shows completed items struck-through', () => {
    const checklist = [
      { id: 1, text: 'Done', completed: true },
      { id: 2, text: 'Pending', completed: false },
      { id: 3, text: 'Also done', completed: true },
    ];
    const { container } = render(
      <CardChecklist {...baseProps} checklist={checklist} />,
    );
    expect(container.textContent).toContain('2/3');
    const bar = container.querySelector('.h-full.bg-green-500') as HTMLElement;
    expect(bar.style.width).toBe('67%');
    // Completed items have line-through class
    const doneSpan = Array.from(container.querySelectorAll('li span')).find(
      (s) => s.textContent === 'Done',
    ) as HTMLElement;
    expect(doneSpan.className).toContain('line-through');
    const pendingSpan = Array.from(container.querySelectorAll('li span')).find(
      (s) => s.textContent === 'Pending',
    ) as HTMLElement;
    expect(pendingSpan.className).not.toContain('line-through');
  });

  it('calls toggleChecklistItem on checkbox click when canEdit is true', () => {
    const toggle = vi.fn();
    const checklist = [{ id: 9, text: 'Tap me', completed: false }];
    const { container } = render(
      <CardChecklist
        {...baseProps}
        checklist={checklist}
        toggleChecklistItem={toggle}
      />,
    );
    const btn = container.querySelector(
      'button[aria-label="Mark complete"]',
    ) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    fireEvent.click(btn);
    expect(toggle).toHaveBeenCalledWith(checklist[0]);
  });

  it('disables the checkbox button when canEdit is false and does not toggle', () => {
    const toggle = vi.fn();
    const checklist = [{ id: 1, text: 'Read-only', completed: true }];
    const { container } = render(
      <CardChecklist
        {...baseProps}
        canEdit={false}
        checklist={checklist}
        toggleChecklistItem={toggle}
      />,
    );
    const btn = container.querySelector(
      'button[aria-label="Mark incomplete"]',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(toggle).not.toHaveBeenCalled();
    // No remove button when canEdit is false
    expect(
      container.querySelector('button[aria-label="Delete item"]'),
    ).toBeNull();
    // No add-item input row when canEdit is false
    expect(container.querySelector('input[type="text"]')).toBeNull();
  });

  it('calls removeChecklistItem with id when delete button clicked', () => {
    const remove = vi.fn();
    const checklist = [{ id: 42, text: 'X', completed: false }];
    const { container } = render(
      <CardChecklist
        {...baseProps}
        checklist={checklist}
        removeChecklistItem={remove}
      />,
    );
    const btn = container.querySelector(
      'button[aria-label="Delete item"]',
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    expect(remove).toHaveBeenCalledWith(42);
  });

  it('input typing calls setNewChecklistText and Enter calls addChecklist', () => {
    const setText = vi.fn();
    const add = vi.fn();
    const { container } = render(
      <CardChecklist
        {...baseProps}
        newChecklistText="hello"
        setNewChecklistText={setText}
        addChecklist={add}
      />,
    );
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input.value).toBe('hello');
    fireEvent.change(input, { target: { value: 'world' } });
    expect(setText).toHaveBeenCalledWith('world');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(add).toHaveBeenCalledTimes(1);
    // Non-Enter key does not trigger add
    fireEvent.keyDown(input, { key: 'a' });
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('disables the Add button when newChecklistText is empty or whitespace', () => {
    const { container, rerender } = render(
      <CardChecklist {...baseProps} newChecklistText="" />,
    );
    let btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    rerender(<CardChecklist {...baseProps} newChecklistText="   " />);
    btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    rerender(<CardChecklist {...baseProps} newChecklistText="real" />);
    btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent === 'Add',
    ) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// MentionPill — pure functions + render
// ---------------------------------------------------------------------------
describe('tokenizeCommentBody', () => {
  it('returns an empty array for empty body', () => {
    expect(tokenizeCommentBody('')).toEqual([]);
  });

  it('returns a single text token when the body has no mentions', () => {
    expect(tokenizeCommentBody('plain text only')).toEqual([
      { kind: 'text', text: 'plain text only' },
    ]);
  });

  it('parses a body with a single mention into [text, mention, text]', () => {
    const tokens = tokenizeCommentBody('Hi @[Dan](42) there');
    expect(tokens).toEqual([
      { kind: 'text', text: 'Hi ' },
      { kind: 'mention', display: 'Dan', userId: 42 },
      { kind: 'text', text: ' there' },
    ]);
  });

  it('parses multiple consecutive mentions in order', () => {
    const tokens = tokenizeCommentBody('@[A](1) @[B](2)!');
    expect(tokens).toEqual([
      { kind: 'mention', display: 'A', userId: 1 },
      { kind: 'text', text: ' ' },
      { kind: 'mention', display: 'B', userId: 2 },
      { kind: 'text', text: '!' },
    ]);
  });

  it('is safe to call repeatedly (does not leak regex state)', () => {
    const t1 = tokenizeCommentBody('@[X](1)');
    const t2 = tokenizeCommentBody('@[Y](2)');
    expect(t1).toEqual([{ kind: 'mention', display: 'X', userId: 1 }]);
    expect(t2).toEqual([{ kind: 'mention', display: 'Y', userId: 2 }]);
  });
});

describe('stringifyCommentBody', () => {
  it('serializes plain text tokens verbatim', () => {
    expect(
      stringifyCommentBody([{ kind: 'text', text: 'hello world' }]),
    ).toBe('hello world');
  });

  it('serializes mention tokens to the @[display](id) form', () => {
    expect(
      stringifyCommentBody([
        { kind: 'mention', display: 'Dan Coyle', userId: 42 },
      ]),
    ).toBe('@[Dan Coyle](42)');
  });

  it('round-trips through tokenize for a mixed body', () => {
    const body = 'Hey @[Dan Coyle](42), look at @[Tina Fey](7).';
    expect(stringifyCommentBody(tokenizeCommentBody(body))).toBe(body);
  });
});

describe('MentionPill (render)', () => {
  it('renders the display name and exposes userId as a data attribute', () => {
    const { container } = render(<MentionPill display="Ada" userId={11} />);
    const span = container.querySelector('[data-user-id="11"]') as HTMLElement;
    expect(span).toBeTruthy();
    expect(span.textContent).toContain('Ada');
    // material-icons leading "@" glyph
    expect(container.textContent).toContain('alternate_email');
  });
});

describe('CommentBodyRenderer', () => {
  it('renders plain text without any pill when body has no mentions', () => {
    const { container } = render(<CommentBodyRenderer body="hello there" />);
    expect(container.textContent).toContain('hello there');
    expect(container.querySelector('[data-user-id]')).toBeNull();
  });

  it('renders one pill per mention and preserves surrounding text', () => {
    const { container } = render(
      <CommentBodyRenderer body="@[Dan](42) and @[Tina](7)!" />,
    );
    const pills = container.querySelectorAll('[data-user-id]');
    expect(pills.length).toBe(2);
    expect(pills[0].getAttribute('data-user-id')).toBe('42');
    expect(pills[1].getAttribute('data-user-id')).toBe('7');
    expect(container.textContent).toContain('Dan');
    expect(container.textContent).toContain('Tina');
    expect(container.textContent).toContain(' and ');
    expect(container.textContent).toContain('!');
  });
});

// ---------------------------------------------------------------------------
// AnchorPinLayer
// ---------------------------------------------------------------------------
describe('AnchorPinLayer', () => {
  const noop = async () => {};

  function makeThread(
    threadId: string,
    anchor: { x?: number; y?: number; slideIndex?: number } | null,
    extras: Record<string, unknown> = {},
  ) {
    return {
      threadId,
      resolved: false,
      root: { anchor },
      ...extras,
    };
  }

  const baseProps = {
    threads: [] as Array<ReturnType<typeof makeThread>>,
    members: [] as unknown[],
    currentUserId: 1,
    onReply: noop,
    onResolve: noop,
    onUnresolve: noop,
    onDelete: noop,
  };

  it('renders the overlay div with pointer-events-none and inset-0', () => {
    const { container } = render(<AnchorPinLayer {...baseProps} />);
    const overlay = container.firstChild as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.className).toContain('pointer-events-none');
    expect(overlay.className).toContain('absolute');
    expect(overlay.className).toContain('inset-0');
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
  });

  it('applies extra className when provided', () => {
    const { container } = render(
      <AnchorPinLayer {...baseProps} className="custom-overlay" />,
    );
    expect((container.firstChild as HTMLElement).className).toContain(
      'custom-overlay',
    );
  });

  it('renders no pins when threads is empty', () => {
    const { queryAllByTestId } = render(<AnchorPinLayer {...baseProps} />);
    expect(queryAllByTestId('anchor-pin').length).toBe(0);
  });

  it('skips threads with no anchor', () => {
    const threads = [makeThread('t1', null)];
    const { queryAllByTestId } = render(
      <AnchorPinLayer {...baseProps} threads={threads} />,
    );
    expect(queryAllByTestId('anchor-pin').length).toBe(0);
  });

  it('skips threads whose anchor lacks x or y', () => {
    const threads = [
      makeThread('t1', { x: 10 }), // missing y
      makeThread('t2', { y: 5 }), // missing x
      makeThread('t3', { x: 'bad' as unknown as number, y: 5 }), // non-number
    ];
    const { queryAllByTestId } = render(
      <AnchorPinLayer {...baseProps} threads={threads} />,
    );
    expect(queryAllByTestId('anchor-pin').length).toBe(0);
  });

  it('renders one pin per pinnable thread and exposes the threadId', () => {
    const threads = [
      makeThread('alpha', { x: 1, y: 2 }),
      makeThread('beta', { x: 3, y: 4 }),
    ];
    const { queryAllByTestId } = render(
      <AnchorPinLayer {...baseProps} threads={threads} />,
    );
    const pins = queryAllByTestId('anchor-pin');
    expect(pins.length).toBe(2);
    const ids = pins.map((p) => p.getAttribute('data-thread-id')).sort();
    expect(ids).toEqual(['alpha', 'beta']);
    // The wrapping div re-enables pointer events
    pins.forEach((pin) => {
      expect((pin.parentElement as HTMLElement).className).toContain(
        'pointer-events-auto',
      );
    });
  });

  it('omits resolved threads by default and includes them when showResolved is true', () => {
    const threads = [
      makeThread('open', { x: 1, y: 2 }),
      makeThread('done', { x: 3, y: 4 }, { resolved: true }),
    ];
    const { queryAllByTestId, rerender } = render(
      <AnchorPinLayer {...baseProps} threads={threads} />,
    );
    let pins = queryAllByTestId('anchor-pin');
    expect(pins.length).toBe(1);
    expect(pins[0].getAttribute('data-thread-id')).toBe('open');

    rerender(
      <AnchorPinLayer
        {...baseProps}
        threads={threads}
        showResolved={true}
      />,
    );
    pins = queryAllByTestId('anchor-pin');
    expect(pins.length).toBe(2);
  });

  it('applies activeAnchorFilter to suppress non-matching anchors', () => {
    const threads = [
      makeThread('s1', { x: 1, y: 2, slideIndex: 0 }),
      makeThread('s2', { x: 3, y: 4, slideIndex: 1 }),
      makeThread('s3', { x: 5, y: 6, slideIndex: 1 }),
    ];
    const { queryAllByTestId } = render(
      <AnchorPinLayer
        {...baseProps}
        threads={threads}
        activeAnchorFilter={(a: { slideIndex?: number }) => a.slideIndex === 1}
      />,
    );
    const ids = queryAllByTestId('anchor-pin')
      .map((p) => p.getAttribute('data-thread-id'))
      .sort();
    expect(ids).toEqual(['s2', 's3']);
  });

  it('sets aria-hidden to false when at least one pin is visible', () => {
    const threads = [makeThread('t', { x: 1, y: 1 })];
    const { container } = render(
      <AnchorPinLayer {...baseProps} threads={threads} />,
    );
    expect((container.firstChild as HTMLElement).getAttribute('aria-hidden')).toBe(
      'false',
    );
  });
});

// ---------------------------------------------------------------------------
// HtmlEmbedBlockRender
// ---------------------------------------------------------------------------
describe('HtmlEmbedBlockRender', () => {
  it('renders the empty-state placeholder when neither inlineHtml nor url is set', () => {
    const block = { type: 'html-embed' } as unknown as HtmlEmbedBlock;
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    expect(container.textContent).toContain('No HTML file uploaded yet');
    // Material icon hint
    expect(container.querySelector('.material-icons')?.textContent).toBe(
      'code',
    );
    // No iframe should be rendered in the empty state
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('inlines server-prefetched HTML when inlineHtml is present', () => {
    const block = {
      type: 'html-embed',
      inlineHtml: '<p data-inline="yes">Inline body</p>',
    } as unknown as HtmlEmbedBlock;
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    const p = container.querySelector('p[data-inline="yes"]') as HTMLElement;
    expect(p).toBeTruthy();
    expect(p.textContent).toBe('Inline body');
    // Inline branch never renders an iframe
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('renders the caption alongside inline HTML when provided', () => {
    const block = {
      type: 'html-embed',
      inlineHtml: '<span>x</span>',
      caption: 'Figure 1',
    } as unknown as HtmlEmbedBlock;
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    expect(container.textContent).toContain('Figure 1');
  });

  it('replaces inert <script> tags inside inline HTML with fresh executable nodes after mount', () => {
    const block = {
      type: 'html-embed',
      inlineHtml:
        '<div><script id="my-inline-script" data-foo="bar">window.__hot = 1;</script></div>',
    } as unknown as HtmlEmbedBlock;
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    const script = container.querySelector(
      'script[id="my-inline-script"]',
    ) as HTMLScriptElement;
    expect(script).toBeTruthy();
    // Attributes are preserved on the freshly-created script
    expect(script.getAttribute('data-foo')).toBe('bar');
    expect(script.textContent).toBe('window.__hot = 1;');
  });

  it('renders an iframe pointing at block.url when only url is set', () => {
    const block = {
      type: 'html-embed',
      url: 'https://example.com/embed.html',
      iframeTitle: 'Demo widget',
    } as unknown as HtmlEmbedBlock;
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    // `?embed=1` is appended as a cache-key buster for the media-proxy fix.
    expect(iframe.getAttribute('src')).toBe('https://example.com/embed.html?embed=1');
    expect(iframe.getAttribute('title')).toBe('Demo widget');
    expect(iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(iframe.getAttribute('loading')).toBe('lazy');
  });

  it('uses the default sandbox preset (scripts) when block.sandbox is not provided', () => {
    const block = { type: 'html-embed', url: 'https://a.test/' } as unknown as HtmlEmbedBlock;
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-popups allow-popups-to-escape-sandbox',
    );
  });

  it('honors strict sandbox preset (empty sandbox attribute)', () => {
    const block = {
      type: 'html-embed',
      url: 'https://a.test/',
      sandbox: 'strict',
    } as unknown as HtmlEmbedBlock;
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe('');
  });

  it('honors scripts-forms sandbox preset', () => {
    const block = {
      type: 'html-embed',
      url: 'https://a.test/',
      sandbox: 'scripts-forms',
    } as unknown as HtmlEmbedBlock;
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    const iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.getAttribute('sandbox')).toBe(
      'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox',
    );
  });

  it('respects a custom height and falls back to 600px by default', () => {
    const block = {
      type: 'html-embed',
      url: 'https://a.test/',
      height: '420px',
    } as unknown as HtmlEmbedBlock;
    const { container, rerender } = render(
      <HtmlEmbedBlockRender block={block} />,
    );
    let iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.style.height).toBe('420px');

    rerender(
      <HtmlEmbedBlockRender block={{ type: 'html-embed', url: 'https://a.test/' } as unknown as HtmlEmbedBlock} />,
    );
    iframe = container.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe.style.height).toBe('600px');
  });

  it('uses the contained max-width wrapper for width="contained" and full-width otherwise', () => {
    const containedBlock = {
      type: 'html-embed',
      url: 'https://a.test/',
      width: 'contained',
    } as unknown as HtmlEmbedBlock;
    const { container: c1 } = render(
      <HtmlEmbedBlockRender block={containedBlock} />,
    );
    // The inner wrapper div around the iframe
    const containedWrap = c1.querySelector('iframe')?.parentElement as HTMLElement;
    expect(containedWrap.className).toContain('max-w-5xl');

    const fullBlock = { type: 'html-embed', url: 'https://a.test/' } as unknown as HtmlEmbedBlock;
    const { container: c2 } = render(<HtmlEmbedBlockRender block={fullBlock} />);
    const fullWrap = c2.querySelector('iframe')?.parentElement as HTMLElement;
    expect(fullWrap.className).toContain('w-full');
  });

  it('renders an iframe caption when block.caption is provided', () => {
    const block = {
      type: 'html-embed',
      url: 'https://a.test/',
      caption: 'Live preview',
    } as unknown as HtmlEmbedBlock;
    const { container } = render(<HtmlEmbedBlockRender block={block} />);
    expect(container.textContent).toContain('Live preview');
  });
});
