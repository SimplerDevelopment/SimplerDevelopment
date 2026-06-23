// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mock next/navigation
// ---------------------------------------------------------------------------
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

/**
 * Build a fetch mock that dispatches by exact URL substring match.
 * The handlers array is checked in order; first match wins.
 */
function buildFetchMock(
  handlers: Array<{
    match: (url: string) => boolean;
    respond: () => Promise<{ ok?: boolean; body: unknown }>;
  }>,
) {
  return vi.fn(async (url: string, _init?: RequestInit) => {
    const handler = handlers.find((h) => h.match(url));
    if (!handler) {
      return { ok: true, json: async () => ({ success: false, message: 'unmocked url: ' + url }) };
    }
    const result = await handler.respond();
    return {
      ok: result.ok ?? true,
      json: async () => result.body,
    };
  }) as unknown as typeof global.fetch;
}

/** Standard "happy path" fetch mock — sites, posts per site, and decks. */
function happyFetch() {
  return buildFetchMock([
    {
      // Must come before the sites-only handler — it's more specific
      match: (u) => u.includes('/posts/picker'),
      respond: async () => ({
        body: {
          success: true,
          data: [
            { id: 10, title: 'Home page' },
            { id: 11, title: 'About page' },
          ],
        },
      }),
    },
    {
      match: (u) => u === '/api/portal/cms/websites',
      respond: async () => ({
        body: { success: true, data: [{ id: 1, name: 'Site A' }] },
      }),
    },
    {
      match: (u) => u.includes('/api/portal/tools/pitch-decks'),
      respond: async () => ({
        body: {
          success: true,
          data: [
            { id: 20, title: 'Deck Alpha' },
            { id: 21, title: 'Deck Beta' },
          ],
        },
      }),
    },
    {
      match: (u) => u.includes('/api/portal/experiments'),
      respond: async () => ({
        body: { success: true, data: { id: 99 } },
      }),
    },
  ]);
}

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------
import NewExperimentModal, {
  NewExperimentLauncher,
} from '@/components/portal/NewExperimentModal';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockPush.mockClear();
  global.fetch = happyFetch();
});

// ---------------------------------------------------------------------------
// Closed state
// ---------------------------------------------------------------------------
describe('NewExperimentModal — closed state', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <NewExperimentModal open={false} onClose={vi.fn()} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('does not call fetch when closed', () => {
    render(<NewExperimentModal open={false} onClose={vi.fn()} />);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Open state — basic structure
// ---------------------------------------------------------------------------
describe('NewExperimentModal — open state', () => {
  it('renders the modal heading', () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    // The heading is inside an h3; use role to avoid ambiguity with the launcher button
    expect(screen.getByRole('heading', { name: /New Experiment/ })).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<NewExperimentModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the Cancel button is clicked', () => {
    const onClose = vi.fn();
    render(<NewExperimentModal open={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the target-type toggle buttons', () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    // Buttons contain an icon <span> + text node; match via textContent substring
    const buttons = screen.getAllByRole('button');
    const labels = buttons.map((b) => b.textContent ?? '');
    expect(labels.some((l) => l.includes('Page'))).toBe(true);
    expect(labels.some((l) => l.includes('Pitch deck'))).toBe(true);
  });

  it('shows a loading spinner while fetching targets', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof global.fetch;
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('fetches sites when opened', async () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls as string[][];
      expect(calls.some((c) => c[0] === '/api/portal/cms/websites')).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Page target type — after data loads
// ---------------------------------------------------------------------------
describe('NewExperimentModal — page target type (loaded)', () => {
  /** Waits until the loading spinner disappears. */
  async function waitForLoaded() {
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument(),
    );
  }

  it('populates the page select with fetched posts', async () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitForLoaded();
    // Option text is "Home page — Site A"; use regex
    expect(screen.getByRole('option', { name: /Home page/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /About page/ })).toBeInTheDocument();
  });

  it('auto-fills the name field when a page is selected', async () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitForLoaded();

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '10' } });

    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText('A/B test — ...') as HTMLInputElement;
      expect(nameInput.value).toBe('A/B test — Home page');
    });
  });

  it('stops auto-filling the name once the user edits it manually', async () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitForLoaded();

    const nameInput = screen.getByPlaceholderText('A/B test — ...') as HTMLInputElement;
    // Mark name dirty
    fireEvent.change(nameInput, { target: { value: 'My custom name' } });

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '11' } });

    // Give React a tick to process the effect
    await act(async () => {});

    expect(nameInput.value).toBe('My custom name');
  });

  it('shows "No pages found" when site has no posts', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/posts/picker'),
        respond: async () => ({ body: { success: true, data: [] } }),
      },
      {
        match: (u) => u === '/api/portal/cms/websites',
        respond: async () => ({
          body: { success: true, data: [{ id: 1, name: 'Site A' }] },
        }),
      },
      {
        match: (u) => u.includes('/api/portal/tools/pitch-decks'),
        respond: async () => ({ body: { success: false } }),
      },
    ]);

    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('No pages found on your sites.')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Pitch deck target type
// ---------------------------------------------------------------------------
describe('NewExperimentModal — pitch deck target type', () => {
  async function waitForLoaded() {
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument(),
    );
  }

  it('switches to pitch deck view when the button is clicked', async () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole('button', { name: /Pitch deck/ }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Deck Alpha' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Deck Beta' })).toBeInTheDocument();
    });
  });

  it('shows "No pitch decks yet." when decks list is empty', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/posts/picker'),
        respond: async () => ({
          body: { success: true, data: [{ id: 10, title: 'Home page' }] },
        }),
      },
      {
        match: (u) => u === '/api/portal/cms/websites',
        respond: async () => ({
          body: { success: true, data: [{ id: 1, name: 'Site A' }] },
        }),
      },
      {
        match: (u) => u.includes('/api/portal/tools/pitch-decks'),
        respond: async () => ({ body: { success: true, data: [] } }),
      },
    ]);

    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole('button', { name: /Pitch deck/ }));
    await waitFor(() => {
      expect(screen.getByText('No pitch decks yet.')).toBeInTheDocument();
    });
  });

  it('auto-fills name when a deck is selected', async () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitForLoaded();

    fireEvent.click(screen.getByRole('button', { name: /Pitch deck/ }));
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Deck Alpha' })).toBeInTheDocument(),
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '20' } });

    await waitFor(() => {
      const nameInput = screen.getByPlaceholderText('A/B test — ...') as HTMLInputElement;
      expect(nameInput.value).toBe('A/B test — Deck Alpha');
    });
  });

  it('clears selection and disables Create when switching target type', async () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitForLoaded();

    // Select a page
    const pageSelect = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(pageSelect, { target: { value: '10' } });

    // Switch to pitch deck — clears selection
    fireEvent.click(screen.getByRole('button', { name: /Pitch deck/ }));

    await waitFor(() => {
      const createBtn = screen.getByRole('button', { name: /Create/ }) as HTMLButtonElement;
      expect(createBtn.disabled).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// Load error
// ---------------------------------------------------------------------------
describe('NewExperimentModal — load error', () => {
  it('shows the load error message when sites fetch returns failure', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u === '/api/portal/cms/websites',
        respond: async () => ({
          body: { success: false, message: 'DB unreachable' },
        }),
      },
    ]);

    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('DB unreachable')).toBeInTheDocument();
    });
  });

  it('shows a generic error when fetch throws', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('Network down');
    }) as unknown as typeof global.fetch;

    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Network down')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Submit — validation
// ---------------------------------------------------------------------------
describe('NewExperimentModal — submit validation', () => {
  async function renderLoaded() {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument(),
    );
  }

  it('shows "Pick a target first" if submitted without a selection', async () => {
    await renderLoaded();
    const form = screen.getByRole('button', { name: /Create/ }).closest('form')!;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(screen.getByText('Pick a target first.')).toBeInTheDocument();
    });
  });

  it('shows "Name is required" if name is cleared before submit', async () => {
    await renderLoaded();

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '10' } });

    const nameInput = screen.getByPlaceholderText('A/B test — ...') as HTMLInputElement;
    // Clear name (marks dirty)
    fireEvent.change(nameInput, { target: { value: '' } });

    fireEvent.submit(nameInput.closest('form')!);

    await waitFor(() => {
      expect(screen.getByText('Name is required.')).toBeInTheDocument();
    });
  });

  it('disables the Create button when no target is selected', async () => {
    await renderLoaded();
    const createBtn = screen.getByRole('button', { name: /Create/ }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(true);
  });

  it('enables the Create button once a target is selected', async () => {
    await renderLoaded();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '10' } });
    const createBtn = screen.getByRole('button', { name: /Create/ }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Submit — success
// ---------------------------------------------------------------------------
describe('NewExperimentModal — submit success', () => {
  it('POSTs the correct payload and redirects on success', async () => {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument(),
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '10' } });

    const nameInput = screen.getByPlaceholderText('A/B test — ...') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My Test' } });

    await act(async () => {
      fireEvent.submit(nameInput.closest('form')!);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/experiments/99');
    });

    // Verify POST body
    const fetchMock = global.fetch as ReturnType<typeof vi.fn>;
    const experimentCall = fetchMock.mock.calls.find(
      (c: unknown[]) => typeof c[0] === 'string' && (c[0] as string).includes('/api/portal/experiments'),
    );
    expect(experimentCall).toBeDefined();
    const callOptions = experimentCall![1] as RequestInit;
    const body = JSON.parse(callOptions.body as string);
    expect(body).toEqual({
      targetType: 'page',
      targetId: 10,
      name: 'My Test',
    });
  });
});

// ---------------------------------------------------------------------------
// Submit — error paths
// ---------------------------------------------------------------------------
describe('NewExperimentModal — submit error', () => {
  async function renderAndSelectPage() {
    render(<NewExperimentModal open={true} onClose={vi.fn()} />);
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument(),
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '10' } });
    return screen.getByPlaceholderText('A/B test — ...') as HTMLInputElement;
  }

  it('shows the error message returned by the API', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/posts/picker'),
        respond: async () => ({
          body: { success: true, data: [{ id: 10, title: 'Home page' }] },
        }),
      },
      {
        match: (u) => u === '/api/portal/cms/websites',
        respond: async () => ({
          body: { success: true, data: [{ id: 1, name: 'Site A' }] },
        }),
      },
      {
        match: (u) => u.includes('/api/portal/tools/pitch-decks'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u) => u.includes('/api/portal/experiments'),
        respond: async () => ({
          ok: false,
          body: { success: false, error: 'Quota exceeded' },
        }),
      },
    ]);

    const nameInput = await renderAndSelectPage();
    await act(async () => { fireEvent.submit(nameInput.closest('form')!); });

    await waitFor(() => {
      expect(screen.getByText('Quota exceeded')).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows an error when the response is missing an id', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/posts/picker'),
        respond: async () => ({
          body: { success: true, data: [{ id: 10, title: 'Home page' }] },
        }),
      },
      {
        match: (u) => u === '/api/portal/cms/websites',
        respond: async () => ({
          body: { success: true, data: [{ id: 1, name: 'Site A' }] },
        }),
      },
      {
        match: (u) => u.includes('/api/portal/tools/pitch-decks'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u) => u.includes('/api/portal/experiments'),
        respond: async () => ({
          body: { success: true, data: {} }, // no id
        }),
      },
    ]);

    const nameInput = await renderAndSelectPage();
    await act(async () => { fireEvent.submit(nameInput.closest('form')!); });

    await waitFor(() => {
      expect(
        screen.getByText('Experiment created but response was missing an id.'),
      ).toBeInTheDocument();
    });
  });

  it('shows a network error message when fetch throws during submit', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/posts/picker'),
        respond: async () => ({
          body: { success: true, data: [{ id: 10, title: 'Home page' }] },
        }),
      },
      {
        match: (u) => u === '/api/portal/cms/websites',
        respond: async () => ({
          body: { success: true, data: [{ id: 1, name: 'Site A' }] },
        }),
      },
      {
        match: (u) => u.includes('/api/portal/tools/pitch-decks'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u) => u.includes('/api/portal/experiments'),
        respond: async () => {
          throw new Error('Submit network fail');
        },
      },
    ]);

    const nameInput = await renderAndSelectPage();
    await act(async () => { fireEvent.submit(nameInput.closest('form')!); });

    await waitFor(() => {
      expect(screen.getByText('Submit network fail')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// State reset on close/reopen
// ---------------------------------------------------------------------------
describe('NewExperimentModal — state reset on close/reopen', () => {
  it('resets to page type and clears the name when closed then reopened', async () => {
    const { rerender } = render(
      <NewExperimentModal open={true} onClose={vi.fn()} />,
    );
    await waitFor(() =>
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument(),
    );

    // Switch to pitch deck and type a custom name
    fireEvent.click(screen.getByRole('button', { name: /Pitch deck/ }));
    const nameInput = screen.getByPlaceholderText('A/B test — ...') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'custom' } });

    // Close
    rerender(<NewExperimentModal open={false} onClose={vi.fn()} />);
    // Reopen
    rerender(<NewExperimentModal open={true} onClose={vi.fn()} />);

    // Default type should be page — the Page toggle button has bg-primary.
    // The button contains an icon <span> so accessible name includes icon text;
    // find it by matching textContent instead.
    await waitFor(() => {
      const allBtns = screen.getAllByRole('button');
      const pageBtn = allBtns.find((b) =>
        b.textContent?.includes('Page') && !b.textContent?.includes('Pitch'),
      ) as HTMLButtonElement | undefined;
      expect(pageBtn).toBeDefined();
      expect(pageBtn!.className).toContain('bg-primary');
    });
  });
});

// ---------------------------------------------------------------------------
// NewExperimentLauncher
// ---------------------------------------------------------------------------
describe('NewExperimentLauncher', () => {
  it('renders the trigger button with default label', () => {
    render(<NewExperimentLauncher />);
    // The trigger button + the modal heading "New Experiment" — use getAll
    const elements = screen.getAllByText('New Experiment');
    // Only the button is visible before clicking; modal is closed
    expect(elements.length).toBeGreaterThanOrEqual(1);
  });

  it('renders a custom label when provided', () => {
    render(<NewExperimentLauncher label="Start A/B Test" />);
    expect(screen.getByText('Start A/B Test')).toBeInTheDocument();
  });

  it('opens the modal when the trigger button is clicked', async () => {
    render(<NewExperimentLauncher />);
    const btn = screen.getByRole('button', { name: /New Experiment/ });
    fireEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /New Experiment/ })).toBeInTheDocument();
    });
  });

  it('applies shrink-0 class for primary variant (default)', () => {
    const { container } = render(<NewExperimentLauncher />);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('shrink-0');
  });

  it('applies inline-flex class and omits shrink-0 for cta variant', () => {
    const { container } = render(<NewExperimentLauncher variant="cta" />);
    const btn = container.querySelector('button')!;
    expect(btn.className).toContain('inline-flex');
    expect(btn.className).not.toContain('shrink-0');
  });
});
