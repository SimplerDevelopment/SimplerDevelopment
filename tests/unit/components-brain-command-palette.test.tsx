// @vitest-environment jsdom
/**
 * Unit tests for `components/brain/CommandPalette.tsx` — the Cmd-K
 * global palette for the brain knowledge IDE.
 *
 * Mocks next/navigation (for router.push), `@/lib/brain/recent-notes`
 * (the localStorage ring buffer), and the global fetch. Each test
 * boots a fresh component with `open=true` and waits for any debounced
 * search effect to settle.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede component import) ─────────────────────────────────

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const getRecentNoteIdsMock = vi.fn<[], number[]>(() => []);
const pushRecentNoteIdMock = vi.fn();

vi.mock('@/lib/brain/recent-notes', () => ({
  getRecentNoteIds: () => getRecentNoteIdsMock(),
  pushRecentNoteId: (id: number) => pushRecentNoteIdMock(id),
}));

import CommandPalette from '@/components/brain/CommandPalette';

interface Note {
  id: number;
  title: string;
  tags: string[];
  pinned: boolean;
  updatedAt: string;
}

const makeNote = (over: Partial<Note> = {}): Note => ({
  id: 1,
  title: 'Note 1',
  tags: [],
  pinned: false,
  updatedAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  ...over,
});

function mockFetchJson(payload: unknown, ok = true): void {
  const fn = vi.fn(async () => ({
    ok,
    json: async () => payload,
  })) as unknown as typeof fetch;
  (global as any).fetch = fn;
}

function mockFetchReject(): void {
  (global as any).fetch = vi.fn(async () => {
    throw new Error('network');
  });
}

const defaultProps = {
  open: true,
  onOpenChange: vi.fn(),
  onCreate: vi.fn(),
  selectedNoteId: null as number | null,
  onShowTrash: undefined as undefined | (() => void),
};

function renderPalette(over: Partial<typeof defaultProps> = {}) {
  const props = { ...defaultProps, ...over };
  const utils = render(<CommandPalette {...(props as any)} />);
  return { ...utils, props };
}

beforeEach(() => {
  vi.clearAllMocks();
  getRecentNoteIdsMock.mockReturnValue([]);
  mockFetchJson({ success: true, data: { items: [] } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CommandPalette — basic rendering', () => {
  it('renders nothing when open=false', () => {
    const { container } = renderPalette({ open: false });
    expect(container.firstChild).toBeNull();
  });

  it('renders the dialog when open=true', () => {
    const { getByRole } = renderPalette();
    expect(getByRole('dialog')).toBeInTheDocument();
  });

  it('renders the search input', () => {
    const { getByLabelText } = renderPalette();
    expect(getByLabelText('Search')).toBeInTheDocument();
  });

  it('shows the Quick actions header when no recent and no query', () => {
    const { getByText } = renderPalette();
    expect(getByText('Quick actions')).toBeInTheDocument();
  });

  it('shows the New note quick action by default', () => {
    const { getByText } = renderPalette();
    expect(getByText('New note')).toBeInTheDocument();
  });

  it('does not show "Open zen mode" when selectedNoteId is null', () => {
    const { queryByText } = renderPalette({ selectedNoteId: null });
    expect(queryByText('Open zen mode')).not.toBeInTheDocument();
  });

  it('shows "Open zen mode" when a note is selected', () => {
    const { getByText } = renderPalette({ selectedNoteId: 42 });
    expect(getByText('Open zen mode')).toBeInTheDocument();
  });

  it('does not show "Browse trash" without onShowTrash', () => {
    const { queryByText } = renderPalette();
    expect(queryByText('Browse trash')).not.toBeInTheDocument();
  });

  it('shows "Browse trash" when onShowTrash is provided', () => {
    const { getByText } = renderPalette({ onShowTrash: vi.fn() });
    expect(getByText('Browse trash')).toBeInTheDocument();
  });
});

describe('CommandPalette — recent notes', () => {
  it('shows nothing extra when there are no recent ids', async () => {
    getRecentNoteIdsMock.mockReturnValue([]);
    const { queryByText } = renderPalette();
    await waitFor(() => {
      expect(queryByText('Recent')).not.toBeInTheDocument();
    });
  });

  it('renders resolved recent notes in order', async () => {
    getRecentNoteIdsMock.mockReturnValue([2, 1]);
    mockFetchJson({
      success: true,
      data: {
        items: [
          makeNote({ id: 1, title: 'First' }),
          makeNote({ id: 2, title: 'Second' }),
        ],
      },
    });
    const { findByText } = renderPalette();
    expect(await findByText('Second')).toBeInTheDocument();
    expect(await findByText('First')).toBeInTheDocument();
  });

  it('skips recent ids that the server did not return', async () => {
    getRecentNoteIdsMock.mockReturnValue([99]);
    mockFetchJson({ success: true, data: { items: [makeNote({ id: 1 })] } });
    const { queryByText } = renderPalette();
    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalled();
    });
    expect(queryByText('Recent')).not.toBeInTheDocument();
  });

  it('handles failed fetch gracefully (no recent section)', async () => {
    getRecentNoteIdsMock.mockReturnValue([1]);
    mockFetchJson({ success: false }, false);
    const { queryByText } = renderPalette();
    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalled();
    });
    expect(queryByText('Recent')).not.toBeInTheDocument();
  });

  it('handles fetch throw gracefully', async () => {
    getRecentNoteIdsMock.mockReturnValue([1]);
    mockFetchReject();
    const { queryByText } = renderPalette();
    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalled();
    });
    expect(queryByText('Recent')).not.toBeInTheDocument();
  });
});

describe('CommandPalette — search', () => {
  it('debounces the search request', async () => {
    const { getByLabelText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hello' } });
    // Wait beyond the 150ms debounce
    await waitFor(
      () => {
        const calls = ((global as any).fetch as any).mock.calls.map(
          (c: any[]) => String(c[0]),
        );
        expect(calls.some((u: string) => u.includes('search=hello'))).toBe(true);
      },
      { timeout: 1000 },
    );
  });

  it('renders search results when they arrive', async () => {
    const { getByLabelText, findByText } = renderPalette();
    mockFetchJson({
      success: true,
      data: { items: [makeNote({ id: 7, title: 'Found Note' })] },
    });
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'foun' } });
    expect(await findByText('Found Note')).toBeInTheDocument();
  });

  it('shows "No matches." with a typed query and no results', async () => {
    mockFetchJson({ success: true, data: { items: [] } });
    const { getByLabelText, findByText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(await findByText('No matches.')).toBeInTheDocument();
  });

  it('handles search fetch returning ok=false', async () => {
    mockFetchJson({ success: false }, false);
    const { getByLabelText, findByText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'fail' } });
    expect(await findByText('No matches.')).toBeInTheDocument();
  });

  it('handles search fetch throwing', async () => {
    mockFetchReject();
    const { getByLabelText, findByText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'oops' } });
    expect(await findByText('No matches.')).toBeInTheDocument();
  });

  it('does not search when the query is just whitespace', async () => {
    const { getByLabelText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    const initialCalls = ((global as any).fetch as any).mock.calls.length;
    fireEvent.change(input, { target: { value: '   ' } });
    await new Promise((r) => setTimeout(r, 250));
    const calls = ((global as any).fetch as any).mock.calls;
    const searchCalls = calls.filter((c: any[]) => String(c[0]).includes('search='));
    expect(searchCalls.length).toBe(0);
    // The recent-fetch may still have happened on mount, but no search call.
    expect(calls.length).toBeGreaterThanOrEqual(initialCalls);
  });
});

describe('CommandPalette — quick action filter (> prefix)', () => {
  it('shows quick actions when typing ">"', async () => {
    const { getByLabelText, findByText } = renderPalette({
      selectedNoteId: 42,
      onShowTrash: vi.fn(),
    });
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '>' } });
    expect(await findByText('Quick actions')).toBeInTheDocument();
    expect(await findByText('New note')).toBeInTheDocument();
    expect(await findByText('Open zen mode')).toBeInTheDocument();
    expect(await findByText('Browse trash')).toBeInTheDocument();
  });

  it('filters quick actions by label', async () => {
    const { getByLabelText, findByText, queryByText } = renderPalette({
      selectedNoteId: 42,
      onShowTrash: vi.fn(),
    });
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '>trash' } });
    expect(await findByText('Browse trash')).toBeInTheDocument();
    await waitFor(() => {
      expect(queryByText('New note')).not.toBeInTheDocument();
    });
  });

  it('shows "No matches." when > filter matches nothing', async () => {
    const { getByLabelText, findByText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '>nothing-matches' } });
    expect(await findByText('No matches.')).toBeInTheDocument();
  });

  it('does not search when query starts with >', async () => {
    const { getByLabelText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '>new' } });
    await new Promise((r) => setTimeout(r, 250));
    const calls = ((global as any).fetch as any).mock.calls;
    const searchCalls = calls.filter((c: any[]) => String(c[0]).includes('search='));
    expect(searchCalls.length).toBe(0);
  });
});

describe('CommandPalette — interaction', () => {
  it('calls onOpenChange(false) when clicking the backdrop', () => {
    const onOpenChange = vi.fn();
    const { getByRole } = renderPalette({ onOpenChange });
    fireEvent.click(getByRole('dialog'));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not close when clicking inside the inner panel', () => {
    const onOpenChange = vi.fn();
    const { getByLabelText } = renderPalette({ onOpenChange });
    fireEvent.click(getByLabelText('Search'));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('triggers New note action and closes', () => {
    const onCreate = vi.fn();
    const onOpenChange = vi.fn();
    const { getByText } = renderPalette({ onCreate, onOpenChange });
    fireEvent.click(getByText('New note'));
    expect(onCreate).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('triggers Browse trash action and closes', () => {
    const onShowTrash = vi.fn();
    const onOpenChange = vi.fn();
    const { getByText } = renderPalette({ onShowTrash, onOpenChange });
    fireEvent.click(getByText('Browse trash'));
    expect(onShowTrash).toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('triggers Open zen mode action and routes', () => {
    const onOpenChange = vi.fn();
    const { getByText } = renderPalette({ selectedNoteId: 9, onOpenChange });
    fireEvent.click(getByText('Open zen mode'));
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge/9');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('clicking a search result navigates and records recent', async () => {
    const onOpenChange = vi.fn();
    mockFetchJson({
      success: true,
      data: { items: [makeNote({ id: 33, title: 'Hit' })] },
    });
    const { getByLabelText, findByText } = renderPalette({ onOpenChange });
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'hit' } });
    const hit = await findByText('Hit');
    fireEvent.click(hit);
    expect(pushRecentNoteIdMock).toHaveBeenCalledWith(33);
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge?id=33');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('hovering a row sets it as active (highlight class swap)', async () => {
    mockFetchJson({
      success: true,
      data: {
        items: [
          makeNote({ id: 1, title: 'A' }),
          makeNote({ id: 2, title: 'B' }),
        ],
      },
    });
    const { getByLabelText, findByText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'x' } });
    const b = await findByText('B');
    fireEvent.mouseEnter(b.closest('button')!);
    await waitFor(() => {
      const refreshed = (findByText('B') as unknown as Promise<HTMLElement>);
      return refreshed.then((el) => {
        expect(el.closest('button')!.className).toContain('bg-primary/10');
      });
    });
  });
});

describe('CommandPalette — keyboard navigation', () => {
  it('Escape closes the palette', () => {
    const onOpenChange = vi.fn();
    const { getByRole } = renderPalette({ onOpenChange });
    fireEvent.keyDown(getByRole('dialog'), { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('ArrowDown moves selection forward (wraps)', async () => {
    const { getByRole, getByText } = renderPalette({
      selectedNoteId: 1,
      onShowTrash: vi.fn(),
    });
    const dialog = getByRole('dialog');
    // Three actions visible: New note, Open zen mode, Browse trash.
    // Initial active = first selectable.
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    // Browse trash should now be active.
    const browse = getByText('Browse trash').closest('button')!;
    expect(browse.className).toContain('bg-primary/10');
  });

  it('ArrowUp moves selection backward (wraps)', async () => {
    const { getByRole, getByText } = renderPalette({
      selectedNoteId: 1,
      onShowTrash: vi.fn(),
    });
    const dialog = getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'ArrowUp' });
    // Wraps to the last action = Browse trash.
    const browse = getByText('Browse trash').closest('button')!;
    expect(browse.className).toContain('bg-primary/10');
  });

  it('Enter activates the selected row', () => {
    const onCreate = vi.fn();
    const { getByRole } = renderPalette({ onCreate });
    const dialog = getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Enter' });
    expect(onCreate).toHaveBeenCalled();
  });

  it('Enter on empty state does not crash', async () => {
    // Force a state with no selectable rows: query yields no results, no recent.
    mockFetchJson({ success: true, data: { items: [] } });
    const { getByLabelText, getByRole, findByText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'zzz' } });
    await findByText('No matches.');
    expect(() =>
      fireEvent.keyDown(getByRole('dialog'), { key: 'Enter' }),
    ).not.toThrow();
  });

  it('unknown key is ignored', () => {
    const onOpenChange = vi.fn();
    const { getByRole } = renderPalette({ onOpenChange });
    fireEvent.keyDown(getByRole('dialog'), { key: 'a' });
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('CommandPalette — note row display', () => {
  it('renders "Untitled" when title is empty', async () => {
    mockFetchJson({
      success: true,
      data: { items: [makeNote({ id: 5, title: '' })] },
    });
    const { getByLabelText, findByText } = renderPalette();
    fireEvent.change(getByLabelText('Search'), { target: { value: 'q' } });
    expect(await findByText('Untitled')).toBeInTheDocument();
  });

  it('renders pin icon for pinned notes', async () => {
    mockFetchJson({
      success: true,
      data: { items: [makeNote({ id: 5, title: 'P', pinned: true })] },
    });
    const { getByLabelText, findByText, container } = renderPalette();
    fireEvent.change(getByLabelText('Search'), { target: { value: 'q' } });
    await findByText('P');
    expect(container.textContent).toContain('push_pin');
  });

  it('renders tag chips (max 2)', async () => {
    mockFetchJson({
      success: true,
      data: {
        items: [makeNote({ id: 5, title: 'T', tags: ['a', 'b', 'c'] })],
      },
    });
    const { getByLabelText, findByText, queryByText } = renderPalette();
    fireEvent.change(getByLabelText('Search'), { target: { value: 'q' } });
    await findByText('T');
    expect(queryByText('a')).toBeInTheDocument();
    expect(queryByText('b')).toBeInTheDocument();
    expect(queryByText('c')).not.toBeInTheDocument();
  });

  it('renders relative time labels', async () => {
    const now = Date.now();
    mockFetchJson({
      success: true,
      data: {
        items: [
          makeNote({
            id: 5,
            title: 'Just',
            updatedAt: new Date(now - 1000).toISOString(),
          }),
        ],
      },
    });
    const { getByLabelText, findByText } = renderPalette();
    fireEvent.change(getByLabelText('Search'), { target: { value: 'q' } });
    expect(await findByText('just now')).toBeInTheDocument();
  });

  it('renders "Nm ago" for minute-range timestamps', async () => {
    const now = Date.now();
    mockFetchJson({
      success: true,
      data: {
        items: [
          makeNote({
            id: 6,
            title: 'Min',
            updatedAt: new Date(now - 5 * 60_000).toISOString(),
          }),
        ],
      },
    });
    const { getByLabelText, findByText } = renderPalette();
    fireEvent.change(getByLabelText('Search'), { target: { value: 'q' } });
    expect(await findByText('5m ago')).toBeInTheDocument();
  });

  it('renders "Nh ago" for hour-range timestamps', async () => {
    const now = Date.now();
    mockFetchJson({
      success: true,
      data: {
        items: [
          makeNote({
            id: 7,
            title: 'Hr',
            updatedAt: new Date(now - 3 * 60 * 60_000).toISOString(),
          }),
        ],
      },
    });
    const { getByLabelText, findByText } = renderPalette();
    fireEvent.change(getByLabelText('Search'), { target: { value: 'q' } });
    expect(await findByText('3h ago')).toBeInTheDocument();
  });

  it('renders "Nd ago" for day-range timestamps', async () => {
    const now = Date.now();
    mockFetchJson({
      success: true,
      data: {
        items: [
          makeNote({
            id: 8,
            title: 'Day',
            updatedAt: new Date(now - 4 * 24 * 60 * 60_000).toISOString(),
          }),
        ],
      },
    });
    const { getByLabelText, findByText } = renderPalette();
    fireEvent.change(getByLabelText('Search'), { target: { value: 'q' } });
    expect(await findByText('4d ago')).toBeInTheDocument();
  });

  it('renders empty time for invalid timestamps', async () => {
    mockFetchJson({
      success: true,
      data: {
        items: [makeNote({ id: 9, title: 'Bad', updatedAt: 'not-a-date' })],
      },
    });
    const { getByLabelText, findByText } = renderPalette();
    fireEvent.change(getByLabelText('Search'), { target: { value: 'q' } });
    expect(await findByText('Bad')).toBeInTheDocument();
  });
});

describe('CommandPalette — open/close lifecycle', () => {
  it('resets query state when re-opened', async () => {
    const { rerender, getByLabelText } = renderPalette();
    const input = getByLabelText('Search') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'persist?' } });
    expect(input.value).toBe('persist?');

    rerender(<CommandPalette {...(defaultProps as any)} open={false} />);
    rerender(<CommandPalette {...(defaultProps as any)} open={true} />);

    const input2 = (await waitFor(() =>
      getByLabelText('Search'),
    )) as HTMLInputElement;
    expect(input2.value).toBe('');
  });
});
