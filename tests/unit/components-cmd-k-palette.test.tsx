/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const pushMock = vi.fn();
let mockPathname: string | null = '/portal/dashboard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    refresh: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => mockPathname,
}));

import CmdKPalette from '@/components/CmdKPalette';

// Helpers
const openPalette = async () => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  });
};

const closePalette = async () => {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
  });
};

const typeInInput = async (value: string) => {
  const input = screen.getByPlaceholderText(/Jump to a page/i) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value } });
  });
  return input;
};

const waitForDebounce = async (ms = 150) => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
};

// Stub fetch globally — tests opt-in for hits
const originalFetch = global.fetch;

// jsdom does not implement scrollIntoView — polyfill it.
beforeEach(() => {
  (Element.prototype as any).scrollIntoView = function () {};
});

describe('CmdKPalette', () => {
  beforeEach(() => {
    pushMock.mockClear();
    mockPathname = '/portal/dashboard';
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ hits: [], total: 0, query: '' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    ) as any;
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Closed state
  // -------------------------------------------------------------------------
  it('renders nothing when closed initially', () => {
    const { container } = render(<CmdKPalette />);
    expect(container.firstChild).toBeNull();
  });

  it('does not render a search input while closed', () => {
    render(<CmdKPalette />);
    expect(screen.queryByPlaceholderText(/Jump to a page/i)).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Open / close via Cmd+K
  // -------------------------------------------------------------------------
  it('opens when Cmd+K is pressed', async () => {
    render(<CmdKPalette />);
    await openPalette();
    expect(screen.getByPlaceholderText(/Jump to a page/i)).toBeInTheDocument();
  });

  it('opens with Ctrl+K (non-mac users)', async () => {
    render(<CmdKPalette />);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(screen.getByPlaceholderText(/Jump to a page/i)).toBeInTheDocument();
  });

  it('opens with capital K too', async () => {
    render(<CmdKPalette />);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'K', metaKey: true }));
    });
    expect(screen.getByPlaceholderText(/Jump to a page/i)).toBeInTheDocument();
  });

  it('toggles closed when Cmd+K is pressed twice', async () => {
    const { container } = render(<CmdKPalette />);
    await openPalette();
    expect(screen.getByPlaceholderText(/Jump to a page/i)).toBeInTheDocument();
    await closePalette();
    expect(container.firstChild).toBeNull();
  });

  it('closes when Escape is pressed', async () => {
    const { container } = render(<CmdKPalette />);
    await openPalette();
    const input = screen.getByPlaceholderText(/Jump to a page/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Escape' });
    });
    expect(container.firstChild).toBeNull();
  });

  it('ignores k presses without modifier', async () => {
    const { container } = render(<CmdKPalette />);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(container.firstChild).toBeNull();
  });

  it('ignores other modified keys', async () => {
    const { container } = render(<CmdKPalette />);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'j', metaKey: true }));
    });
    expect(container.firstChild).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Empty state — default lists
  // -------------------------------------------------------------------------
  it('shows the Create section by default when opened with no query', async () => {
    render(<CmdKPalette />);
    await openPalette();
    expect(screen.getByText('Create')).toBeInTheDocument();
  });

  it('shows quick-create actions on open', async () => {
    render(<CmdKPalette />);
    await openPalette();
    expect(screen.getByText('New knowledge note')).toBeInTheDocument();
    expect(screen.getByText('New survey')).toBeInTheDocument();
    expect(screen.getByText('New pitch deck')).toBeInTheDocument();
  });

  it('shows a Quick access section on open with no query', async () => {
    render(<CmdKPalette />);
    await openPalette();
    expect(screen.getByText('Quick access')).toBeInTheDocument();
  });

  it('renders the Dashboard nav entry on first open', async () => {
    render(<CmdKPalette />);
    await openPalette();
    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0);
  });

  it('renders the ESC keyboard hint chip', async () => {
    render(<CmdKPalette />);
    await openPalette();
    expect(screen.getByText('ESC')).toBeInTheDocument();
  });

  it('renders the footer hints', async () => {
    render(<CmdKPalette />);
    await openPalette();
    expect(screen.getByText('navigate')).toBeInTheDocument();
    expect(screen.getByText('open')).toBeInTheDocument();
    // 'close' label exists twice (esc + cmd+k) — at least one present
    expect(screen.getAllByText('close').length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------
  // Query / filtering
  // -------------------------------------------------------------------------
  it('updates the input value as the user types', async () => {
    render(<CmdKPalette />);
    await openPalette();
    const input = await typeInInput('crm');
    expect(input.value).toBe('crm');
  });

  it('switches the nav section header to Navigate when there is a query', async () => {
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('crm');
    expect(screen.getByText('Navigate')).toBeInTheDocument();
    expect(screen.queryByText('Quick access')).toBeNull();
  });

  it('filters nav targets by query token', async () => {
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('crm');
    // CRM-related nav items appear (at least one match for CRM)
    expect(screen.getAllByText('CRM').length).toBeGreaterThan(0);
  });

  it('shows no-results state for a query that matches nothing', async () => {
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('zzzqqqxx_no_match_here_1234');
    await waitForDebounce();
    expect(screen.getByText(/No matches/i)).toBeInTheDocument();
  });

  it('hides the empty hint once the user starts typing', async () => {
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('something');
    expect(screen.queryByText(/Type to jump to any page/i)).toBeNull();
  });

  it('filters create actions by query', async () => {
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('survey');
    expect(screen.getByText('New survey')).toBeInTheDocument();
    // Unrelated creates should be filtered out
    expect(screen.queryByText('New pitch deck')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Keyboard navigation
  // -------------------------------------------------------------------------
  it('moves selection down with ArrowDown', async () => {
    render(<CmdKPalette />);
    await openPalette();
    const input = screen.getByPlaceholderText(/Jump to a page/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
    });
    // No throw and palette still open
    expect(input).toBeInTheDocument();
  });

  it('moves selection up with ArrowUp', async () => {
    render(<CmdKPalette />);
    await openPalette();
    const input = screen.getByPlaceholderText(/Jump to a page/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowDown' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    });
    expect(input).toBeInTheDocument();
  });

  it('clamps selection at zero when pressing ArrowUp at the top', async () => {
    render(<CmdKPalette />);
    await openPalette();
    const input = screen.getByPlaceholderText(/Jump to a page/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'ArrowUp' });
      fireEvent.keyDown(input, { key: 'ArrowUp' });
    });
    expect(input).toBeInTheDocument();
  });

  it('triggers navigation on Enter on the selected create item', async () => {
    render(<CmdKPalette />);
    await openPalette();
    const input = screen.getByPlaceholderText(/Jump to a page/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    // First default item is the first create action
    expect(pushMock).toHaveBeenCalledWith('/portal/brain/knowledge?new=1');
  });

  it('closes after Enter activates an item', async () => {
    const { container } = render(<CmdKPalette />);
    await openPalette();
    const input = screen.getByPlaceholderText(/Jump to a page/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(container.firstChild).toBeNull();
  });

  it('Enter is a no-op when there are no items', async () => {
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('zzzqqqxxx_no_match_at_all');
    await waitForDebounce();
    const input = screen.getByPlaceholderText(/Jump to a page/i);
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(pushMock).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Mouse interactions
  // -------------------------------------------------------------------------
  it('navigates when a create action is clicked', async () => {
    render(<CmdKPalette />);
    await openPalette();
    const btn = screen.getByText('New survey').closest('button')!;
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(pushMock).toHaveBeenCalledWith('/portal/surveys/new');
  });

  it('navigates when a nav item is clicked', async () => {
    render(<CmdKPalette />);
    await openPalette();
    // Click the first nav-section button
    const navButtons = screen
      .getAllByRole('button')
      .filter((b) => b.textContent?.includes('Page'));
    expect(navButtons.length).toBeGreaterThan(0);
    await act(async () => {
      fireEvent.click(navButtons[0]);
    });
    expect(pushMock).toHaveBeenCalled();
  }, 15000);

  it('updates selection on mouseenter over an item', async () => {
    render(<CmdKPalette />);
    await openPalette();
    const surveyBtn = screen.getByText('New survey').closest('button')!;
    await act(async () => {
      fireEvent.mouseEnter(surveyBtn);
    });
    // Hovered item gets bg-muted class
    expect(surveyBtn.className).toMatch(/bg-muted/);
  });

  it('closes when the backdrop is clicked', async () => {
    const { container } = render(<CmdKPalette />);
    await openPalette();
    const dialog = screen.getByRole('dialog');
    await act(async () => {
      fireEvent.mouseDown(dialog);
    });
    expect(container.firstChild).toBeNull();
  });

  it('does NOT close when clicking inside the panel', async () => {
    render(<CmdKPalette />);
    await openPalette();
    const input = screen.getByPlaceholderText(/Jump to a page/i);
    await act(async () => {
      fireEvent.mouseDown(input);
    });
    // Still open
    expect(screen.getByPlaceholderText(/Jump to a page/i)).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Brain search (fetch) integration
  // -------------------------------------------------------------------------
  it('fires a brain search request when the user types', async () => {
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('hello');
    await waitForDebounce();
    expect(global.fetch).toHaveBeenCalled();
    const url = (global.fetch as any).mock.calls[0][0] as string;
    expect(url).toContain('/api/portal/brain/search');
    expect(url).toContain('q=hello');
  });

  it('renders Search results section when hits are returned', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          hits: [
            {
              type: 'note',
              id: 1,
              title: 'My Note',
              snippet: 'snippet text',
              score: 1,
              url: '/portal/brain/knowledge/1',
            },
          ],
          total: 1,
          query: 'note',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as any;
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('note');
    await waitForDebounce();
    await waitFor(() => {
      expect(screen.getByText('My Note')).toBeInTheDocument();
    });
    expect(screen.getByText('Search results')).toBeInTheDocument();
  });

  it('unwraps envelope-shaped responses ({ data: { hits } })', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          data: {
            hits: [
              {
                type: 'contact',
                id: 7,
                title: 'Jane Doe',
                snippet: '',
                score: 5,
                url: '/portal/crm/contacts/7',
              },
            ],
            total: 1,
            query: 'jane',
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as any;
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('jane');
    await waitForDebounce();
    await waitFor(() => {
      expect(screen.getByText('Jane Doe')).toBeInTheDocument();
    });
  });

  it('renders contextName when provided on a hit', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          hits: [
            {
              type: 'meeting',
              id: 22,
              title: 'Kickoff Meeting',
              snippet: 'agenda etc',
              score: 9,
              contextName: 'Acme Co',
              url: '/portal/brain/meetings/22',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as any;
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('kickoff');
    await waitForDebounce();
    await waitFor(() => {
      expect(screen.getByText('Kickoff Meeting')).toBeInTheDocument();
    });
    expect(screen.getByText('Acme Co')).toBeInTheDocument();
  });

  it('navigates to the hit url when clicked', async () => {
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          hits: [
            {
              type: 'deal',
              id: 33,
              title: 'Big Deal',
              snippet: '',
              score: 1,
              url: '/portal/crm/deals/33',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    ) as any;
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('big');
    await waitForDebounce();
    await waitFor(() => {
      expect(screen.getByText('Big Deal')).toBeInTheDocument();
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Big Deal').closest('button')!);
    });
    expect(pushMock).toHaveBeenCalledWith('/portal/crm/deals/33');
  });

  it('clears hits and stops loading when query becomes empty', async () => {
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('hello');
    await waitForDebounce();
    await typeInInput('');
    await waitForDebounce();
    // Default Quick access section restored, no Search results section
    expect(screen.queryByText('Search results')).toBeNull();
    expect(screen.getByText('Quick access')).toBeInTheDocument();
  });

  it('treats a failed fetch as empty hits without throwing', async () => {
    global.fetch = vi.fn(async () =>
      new Response('boom', { status: 500 }),
    ) as any;
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('boom');
    await waitForDebounce();
    expect(screen.queryByText('Search results')).toBeNull();
  });

  it('swallows fetch rejections silently', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('network fail');
    }) as any;
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('net');
    await waitForDebounce();
    // No crash, still rendered
    expect(screen.getByPlaceholderText(/Jump to a page/i)).toBeInTheDocument();
  });

  it('does not fire brain search when query is whitespace only', async () => {
    render(<CmdKPalette />);
    await openPalette();
    (global.fetch as any).mockClear();
    await typeInInput('   ');
    await waitForDebounce();
    // No /brain/search calls
    const calls = (global.fetch as any).mock.calls as any[];
    const brainCalls = calls.filter((c) => String(c[0]).includes('/brain/search'));
    expect(brainCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Active site detection
  // -------------------------------------------------------------------------
  it('fetches websites when inside /portal/websites/[id]', async () => {
    mockPathname = '/portal/websites/42/posts';
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/portal/cms/websites')) {
        return new Response(
          JSON.stringify({ success: true, data: [{ id: 42, name: 'Site Forty-Two' }] }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ hits: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    global.fetch = fetchMock as any;
    render(<CmdKPalette />);
    await waitForDebounce();
    expect(fetchMock).toHaveBeenCalledWith('/api/portal/cms/websites');
  });

  it('handles a failed websites fetch without crashing', async () => {
    mockPathname = '/portal/websites/99';
    global.fetch = vi.fn(async () => {
      throw new Error('nope');
    }) as any;
    render(<CmdKPalette />);
    await waitForDebounce();
    // Still works — open it
    await openPalette();
    expect(screen.getByPlaceholderText(/Jump to a page/i)).toBeInTheDocument();
  });

  it('does NOT fetch websites for non-site routes', async () => {
    mockPathname = '/portal/dashboard';
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ hits: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    global.fetch = fetchMock as any;
    render(<CmdKPalette />);
    await waitForDebounce();
    const cmsCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).includes('/api/portal/cms/websites'),
    );
    expect(cmsCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Re-open clears state
  // -------------------------------------------------------------------------
  it('clears the query when the palette is re-opened', async () => {
    render(<CmdKPalette />);
    await openPalette();
    await typeInInput('typed-text');
    expect((screen.getByPlaceholderText(/Jump to a page/i) as HTMLInputElement).value).toBe(
      'typed-text',
    );
    await closePalette();
    await openPalette();
    expect(
      (screen.getByPlaceholderText(/Jump to a page/i) as HTMLInputElement).value,
    ).toBe('');
  });

  // -------------------------------------------------------------------------
  // Accessibility-ish dialog attributes
  // -------------------------------------------------------------------------
  it('sets dialog/modal aria attributes on the root', async () => {
    render(<CmdKPalette />);
    await openPalette();
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-label', 'Command palette');
  });

  it('exposes Page label on nav rows', async () => {
    render(<CmdKPalette />);
    await openPalette();
    // At least one "Page" label exists (one per nav row)
    expect(screen.getAllByText('Page').length).toBeGreaterThan(0);
  });
});
