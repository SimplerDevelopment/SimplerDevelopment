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
// Mock next/link — renders a plain <a> so we can query by href
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

type FetchHandler = {
  match: (url: string, method?: string) => boolean;
  respond: () => Promise<{ ok?: boolean; body: unknown }>;
};

function buildFetchMock(handlers: FetchHandler[]) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const handler = handlers.find((h) => h.match(url, method));
    if (!handler) {
      return { ok: true, json: async () => ({ success: false, message: 'unmocked: ' + method + ' ' + url }) };
    }
    const result = await handler.respond();
    return {
      ok: result.ok ?? true,
      json: async () => result.body,
    };
  }) as unknown as typeof global.fetch;
}

function successResultsFetch(experimentId = 7) {
  return buildFetchMock([
    {
      match: (u) => u.includes(`/experiments/${experimentId}/results`),
      respond: async () => ({
        body: {
          success: true,
          data: {
            experiment: makeExperiment({ id: experimentId }),
            stats: [
              { key: 'a', label: 'Control', views: 200, goals: 20, conversionRate: 0.1 },
              { key: 'b', label: 'Challenger', views: 210, goals: 30, conversionRate: 0.1429 },
            ],
            comparisons: [
              { variantKey: 'b', controlKey: 'a', z: 2.1, p: 0.035, lift: 0.429, significant: true },
            ],
          },
        },
      }),
    },
  ]);
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeExperiment(overrides: Partial<{
  id: number;
  status: string;
  name: string;
  hypothesis: string | null;
  goalMetric: string;
  goalSelector: string | null;
  variantSplit: Record<string, number>;
  targetType: 'post' | 'deck' | 'survey' | 'email';
  targetId: number;
  postId: number | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  updatedAt: string;
}> = {}) {
  return {
    id: 7,
    targetType: 'post' as const,
    targetId: 1,
    postId: 1,
    name: 'My Experiment',
    hypothesis: 'We expect a lift.',
    status: 'draft',
    variantSplit: { a: 50, b: 50 },
    goalMetric: 'page_view',
    goalSelector: null,
    startedAt: null,
    endedAt: null,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeVariants(keys = ['a', 'b']) {
  return keys.map((key, i) => ({
    id: i + 1,
    experimentId: 7,
    key,
    label: key === 'a' ? 'Control' : `Variant ${key.toUpperCase()}`,
    blockTreeOverride: null as unknown,
    createdAt: '2024-01-01T00:00:00Z',
  }));
}

const defaultTarget = {
  id: 1,
  title: 'Home Page',
  content: JSON.stringify({ blocks: [], version: '1.0' }),
  siteId: 1,
  editHref: '/portal/cms/1/posts/1/edit',
  kindLabel: 'Page',
};

// ---------------------------------------------------------------------------
// Import component
// ---------------------------------------------------------------------------
import ExperimentDetailClient from '@/components/portal/ExperimentDetailClient';

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------
beforeEach(() => {
  mockPush.mockClear();
  // Default: results fetch returns loading state (never resolves) unless overridden
  global.fetch = buildFetchMock([
    {
      match: (u) => u.includes('/results'),
      respond: async () => ({
        body: {
          success: true,
          data: {
            experiment: makeExperiment(),
            stats: [],
            comparisons: [],
          },
        },
      }),
    },
  ]);
});

// ---------------------------------------------------------------------------
// Rendering — basic structure
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — basic rendering', () => {
  it('renders the experiment name in the breadcrumb', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName="Test Site"
      />,
    );
    expect(screen.getAllByText('My Experiment').length).toBeGreaterThanOrEqual(1);
  });

  it('renders a link back to /portal/experiments', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    const link = screen.getByRole('link', { name: 'Experiments' });
    expect(link).toHaveAttribute('href', '/portal/experiments');
  });

  it('renders target title as a link with the correct href', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    const link = screen.getByRole('link', { name: 'Home Page' });
    expect(link).toHaveAttribute('href', '/portal/cms/1/posts/1/edit');
  });

  it('shows the site name when provided', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName="Acme Corp"
      />,
    );
    expect(screen.getByText(/Acme Corp/)).toBeInTheDocument();
  });

  it('omits site name when null', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.queryByText(/Acme Corp/)).not.toBeInTheDocument();
  });

  it('renders the status badge with the current status text', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ status: 'running' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByText('running')).toBeInTheDocument();
  });

  it('renders the Hypothesis section heading', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByText('Hypothesis')).toBeInTheDocument();
  });

  it('shows the hypothesis text in the textarea', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ hypothesis: 'Lifts signups by 10%' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    const textarea = screen.getByPlaceholderText(/What do you expect/);
    expect((textarea as HTMLTextAreaElement).defaultValue).toBe('Lifts signups by 10%');
  });

  it('renders the Goal section heading', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByText('Goal')).toBeInTheDocument();
  });

  it('renders the goalMetric select with correct initial value', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ goalMetric: 'cta_click' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('cta_click');
  });

  it('renders the Traffic split section heading', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByText('Traffic split')).toBeInTheDocument();
  });

  it('renders each variant split key as a label', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit: { a: 50, b: 50 } })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    // Keys 'a' and 'b' appear as monospaced labels in the split section
    const monoEls = document.querySelectorAll('.font-mono');
    const texts = Array.from(monoEls).map((el) => el.textContent);
    expect(texts).toContain('a');
    expect(texts).toContain('b');
  });

  it('renders the Variants section heading', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByText('Variants')).toBeInTheDocument();
  });

  it('renders a card for each variant', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants(['a', 'b', 'c'])}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByText('Control')).toBeInTheDocument();
    expect(screen.getByText('Variant B')).toBeInTheDocument();
    expect(screen.getByText('Variant C')).toBeInTheDocument();
  });

  it('marks variant "a" as (control)', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByText('(control)')).toBeInTheDocument();
  });

  it('renders "Add variant" button', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByRole('button', { name: /Add variant/ })).toBeInTheDocument();
  });

  it('shows the Results section heading', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByText('Results')).toBeInTheDocument();
  });

  it('renders kindLabel in target info line', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={{ ...defaultTarget, kindLabel: 'Pitch deck' }}
        siteName={null}
      />,
    );
    expect(screen.getByText(/Pitch deck/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — status transitions', () => {
  it('shows "Start" button for draft experiments', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ status: 'draft' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('shows "Archive" button for draft experiments', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ status: 'draft' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('shows "Stop" and "Archive" buttons for running experiments', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ status: 'running' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
  });

  it('shows "Reopen" button for archived experiments', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ status: 'archived' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Reopen' })).toBeInTheDocument();
  });

  it('calls PATCH with status=running when Start is clicked', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'PATCH',
        respond: async () => ({
          body: {
            success: true,
            data: makeExperiment({ status: 'running' }),
          },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ status: 'draft' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const patchCall = calls.find(([u, init]) => u.includes('/experiments/7') && init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body).toEqual({ status: 'running' });
    });
  });

  it('shows error message when PATCH fails', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'PATCH',
        respond: async () => ({
          body: { success: false, error: 'Cannot start: missing variants' },
        }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ status: 'draft' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Cannot start: missing variants')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Name editing
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — name editing', () => {
  it('switches to text input when name is clicked', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    const nameSpan = screen.getByTitle('Click to edit name');
    fireEvent.click(nameSpan);
    // The name editor is an input with the border-blue-500 class (distinct from textareas)
    const nameInput = document.querySelector('input.border-blue-500') as HTMLInputElement | null;
    expect(nameInput).not.toBeNull();
    expect(nameInput?.value).toBe('My Experiment');
  });

  it('cancels editing on Escape and restores original name', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ name: 'Original Name' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    fireEvent.click(screen.getByTitle('Click to edit name'));
    const input = document.querySelector('input.border-blue-500') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: 'Changed Name' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.querySelector('input.border-blue-500')).toBeNull();
    expect(screen.getByTitle('Click to edit name').textContent).toBe('Original Name');
  });

  it('PATCHes the new name on Enter', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'PATCH',
        respond: async () => ({
          body: { success: true, data: makeExperiment({ name: 'New Name' }) },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ name: 'Old Name' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    fireEvent.click(screen.getByTitle('Click to edit name'));
    const input = document.querySelector('input.border-blue-500') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: 'New Name' } });

    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const patchCall = calls.find(([u, init]) => u.includes('/experiments/7') && init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body).toEqual({ name: 'New Name' });
    });
  });

  it('shows error and does not PATCH when name is cleared', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    fireEvent.click(screen.getByTitle('Click to edit name'));
    const input = document.querySelector('input.border-blue-500') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: '' } });

    await act(async () => {
      fireEvent.blur(input);
    });

    await waitFor(() => {
      expect(screen.getByText('Name cannot be empty')).toBeInTheDocument();
    });
  });

  it('shows error when name exceeds 255 characters', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    fireEvent.click(screen.getByTitle('Click to edit name'));
    const input = document.querySelector('input.border-blue-500') as HTMLInputElement;
    expect(input).not.toBeNull();
    fireEvent.change(input, { target: { value: 'x'.repeat(256) } });

    await act(async () => {
      fireEvent.blur(input);
    });

    await waitFor(() => {
      expect(screen.getByText('Name must be 255 characters or fewer')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Traffic split
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — traffic split', () => {
  it('shows a warning when draft split does not total 100', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit: { a: 50, b: 50 } })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    // Change 'a' to 60 — total becomes 110
    const numberInputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[0], { target: { value: '60' } });
    expect(screen.getByText(/Total must equal 100%/)).toBeInTheDocument();
  });

  it('does not show warning when draft split totals 100', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit: { a: 50, b: 50 } })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.queryByText(/Total must equal 100%/)).not.toBeInTheDocument();
  });

  it('shows "Save split" button', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByRole('button', { name: 'Save split' })).toBeInTheDocument();
  });

  it('calls PATCH with variantSplit when Save split is clicked', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'PATCH',
        respond: async () => ({
          body: { success: true, data: makeExperiment() },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit: { a: 50, b: 50 } })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save split' }));
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const patchCall = calls.find(([u, init]) => u.includes('/experiments/7') && init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body).toHaveProperty('variantSplit');
    });
  });

  it('shows error when all split values are zero', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit: { a: 50, b: 50 } })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    // Set both to 0
    const numberInputs = document.querySelectorAll('input[type="number"]');
    fireEvent.change(numberInputs[0], { target: { value: '0' } });
    fireEvent.change(numberInputs[1], { target: { value: '0' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save split' }));
    });

    await waitFor(() => {
      expect(screen.getByText('Split must include at least one positive weight')).toBeInTheDocument();
    });
  });

  it('rebalances to even split when "Rebalance to even" is clicked', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit: { a: 70, b: 30 } })}
        variants={makeVariants(['a', 'b'])}
        target={defaultTarget}
        siteName={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Rebalance to even' }));

    // After rebalance with 2 variants: a=50, b=50
    const numberInputs = document.querySelectorAll('input[type="number"]');
    expect((numberInputs[0] as HTMLInputElement).value).toBe('50');
    expect((numberInputs[1] as HTMLInputElement).value).toBe('50');
  });

  it('shows saved total percentage', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit: { a: 50, b: 50 } })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    expect(screen.getByText('saved total: 100%')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Variant management
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — variant management', () => {
  it('renders "Seed from page" button for each variant', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    const seedBtns = screen.getAllByRole('button', { name: /Seed from page/ });
    expect(seedBtns).toHaveLength(2);
  });

  it('seeds variant JSON from target content when Seed is clicked', () => {
    const content = JSON.stringify({ blocks: [{ type: 'hero' }], version: '1.0' });
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={{ ...defaultTarget, content }}
        siteName={null}
      />,
    );

    const seedBtns = screen.getAllByRole('button', { name: /Seed from page/ });
    fireEvent.click(seedBtns[0]);

    // The first textarea should now have the seeded content
    const textareas = document.querySelectorAll('textarea.font-mono');
    expect((textareas[0] as HTMLTextAreaElement).value).toContain('"hero"');
  });

  it('renders "Save" button for each variant', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    const saveBtns = screen.getAllByRole('button', { name: 'Save' });
    expect(saveBtns).toHaveLength(2);
  });

  it('calls variant PATCH when Save is clicked with valid JSON', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/variants') && m === 'PATCH',
        respond: async () => ({
          body: { success: true, data: {} },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const textareas = document.querySelectorAll('textarea.font-mono');
    fireEvent.change(textareas[0], { target: { value: '{"blocks":[]}' } });

    const saveBtns = screen.getAllByRole('button', { name: 'Save' });
    await act(async () => {
      fireEvent.click(saveBtns[0]);
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const patchCall = calls.find(([u, init]) => u.includes('/variants') && init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
    });
  });

  it('shows error when variant JSON is invalid', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const textareas = document.querySelectorAll('textarea.font-mono');
    fireEvent.change(textareas[0], { target: { value: '{not valid json}' } });

    const saveBtns = screen.getAllByRole('button', { name: 'Save' });
    await act(async () => {
      fireEvent.click(saveBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText(/Invalid JSON in variant/)).toBeInTheDocument();
    });
  });

  it('calls POST /variants when Add variant is clicked', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/variants') && m === 'POST',
        respond: async () => ({
          body: { success: true, data: { key: 'c' } },
        }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'GET',
        respond: async () => ({
          body: {
            success: true,
            data: {
              experiment: makeExperiment({ variantSplit: { a: 34, b: 33, c: 33 } }),
              variants: makeVariants(['a', 'b', 'c']),
            },
          },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add variant/ }));
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const postCall = calls.find(([u, init]) => u.includes('/variants') && init?.method === 'POST');
      expect(postCall).toBeDefined();
    });
  });

  it('shows friendly error when addVariant returns no_keys_available', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/variants') && m === 'POST',
        respond: async () => ({
          body: { success: false, error: 'no_keys_available' },
        }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Add variant/ }));
    });

    await waitFor(() => {
      expect(screen.getByText('Maximum 26 variants reached.')).toBeInTheDocument();
    });
  });

  it('disables Add variant button when 26 variants exist', () => {
    const manyVariants = makeVariants(
      'abcdefghijklmnopqrstuvwxyz'.split(''),
    );
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={manyVariants}
        target={defaultTarget}
        siteName={null}
      />,
    );
    const btn = screen.getByRole('button', { name: /Add variant/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText('Maximum 26 variants reached.')).toBeInTheDocument();
  });

  it('disables control variant remove button', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );
    // The control variant 'a' remove button should be disabled
    const removeBtns = screen.getAllByTitle(/The control variant cannot be removed/);
    expect(removeBtns[0]).toBeDisabled();
  });

  it('calls DELETE /variants/:key when non-control remove is clicked', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/variants/b') && m === 'DELETE',
        respond: async () => ({
          body: { success: true },
        }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'GET',
        respond: async () => ({
          body: {
            success: true,
            data: {
              experiment: makeExperiment({ variantSplit: { a: 100 } }),
              variants: makeVariants(['a']),
            },
          },
        }),
      },
    ]);
    global.fetch = fetchMock;

    // Need 3 variants so that removing 'b' doesn't violate min-2 rule in UI
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants(['a', 'b', 'c'])}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const removeBtns = screen.getAllByLabelText(/Remove variant/);
    // Find the 'b' remove button (not the disabled control)
    const enabledRemoveBtns = removeBtns.filter((btn) => !btn.hasAttribute('disabled') || btn.getAttribute('disabled') === null);

    await act(async () => {
      fireEvent.click(enabledRemoveBtns[0]);
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const deleteCall = calls.find(([u, init]) => u.includes('/variants/') && init?.method === 'DELETE');
      expect(deleteCall).toBeDefined();
    });
  });

  it('shows friendly error for control_protected on remove', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/variants/') && m === 'DELETE',
        respond: async () => ({
          body: { success: false, error: 'control_protected' },
        }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants(['a', 'b', 'c'])}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const removeBtns = screen.getAllByLabelText(/Remove variant/);
    const enabledRemoveBtns = removeBtns.filter((btn) => !btn.hasAttribute('disabled') || btn.getAttribute('disabled') === null);

    await act(async () => {
      fireEvent.click(enabledRemoveBtns[0]);
    });

    await waitFor(() => {
      expect(screen.getByText('The control variant cannot be removed.')).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Variant label editing
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — variant label editing', () => {
  it('switches to label input when label button is clicked', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const labelBtn = screen.getByRole('button', { name: /Variant B/ });
    fireEvent.click(labelBtn);

    // An input should appear for editing
    const labelInput = document.querySelector('input[type="text"].text-sm.border') as HTMLInputElement | null;
    expect(labelInput).not.toBeNull();
    expect(labelInput?.value).toBe('Variant B');
  });

  it('cancels label editing on Escape', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const labelBtn = screen.getByRole('button', { name: /Variant B/ });
    fireEvent.click(labelBtn);

    const labelInput = document.querySelector('input[type="text"].text-sm.border') as HTMLInputElement;
    fireEvent.keyDown(labelInput, { key: 'Escape' });

    expect(document.querySelector('input[type="text"].text-sm.border')).toBeNull();
  });

  it('shows error when label is saved empty', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const labelBtn = screen.getByRole('button', { name: /Variant B/ });
    fireEvent.click(labelBtn);

    const labelInput = document.querySelector('input[type="text"].text-sm.border') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: '' } });
    fireEvent.keyDown(labelInput, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByText('Variant label cannot be empty.')).toBeInTheDocument();
    });
  });

  it('PATCHes the label on Enter with non-empty value', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/variants') && m === 'PATCH',
        respond: async () => ({
          body: { success: true, data: {} },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const labelBtn = screen.getByRole('button', { name: /Variant B/ });
    fireEvent.click(labelBtn);

    const labelInput = document.querySelector('input[type="text"].text-sm.border') as HTMLInputElement;
    fireEvent.change(labelInput, { target: { value: 'New Label' } });

    await act(async () => {
      fireEvent.keyDown(labelInput, { key: 'Enter' });
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const patchCall = calls.find(([u, init]) => u.includes('/variants') && init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body.label).toBe('New Label');
    });
  });
});

// ---------------------------------------------------------------------------
// Goal metric
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — goal configuration', () => {
  it('calls PATCH with new goalMetric when select changes', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'PATCH',
        respond: async () => ({
          body: { success: true, data: makeExperiment({ goalMetric: 'cta_click' }) },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ goalMetric: 'page_view' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'cta_click' } });
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const patchCall = calls.find(([u, init]) => u.includes('/experiments/7') && init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body.goalMetric).toBe('cta_click');
    });
  });

  it('PATCHes goalSelector on blur when value changes', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'PATCH',
        respond: async () => ({
          body: { success: true, data: makeExperiment({ goalSelector: '.cta' }) },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ goalSelector: null })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const selectorInput = screen.getByPlaceholderText(/\.cta-primary/);
    fireEvent.change(selectorInput, { target: { value: '.cta' } });

    await act(async () => {
      fireEvent.blur(selectorInput);
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const patchCall = calls.find(([u, init]) => u.includes('/experiments/7') && init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Results display
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — results display', () => {
  it('shows "Loading…" initially before results arrive', () => {
    // Hang the results fetch so it never resolves
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof global.fetch;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('shows stats table when results load', async () => {
    global.fetch = successResultsFetch();

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('columnheader', { name: 'Views' })).toBeInTheDocument();
    });
  });

  it('renders variant rows with views, goals and conversion rate', async () => {
    global.fetch = successResultsFetch();

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await waitFor(() => {
      // Control row: 200 views, 20 goals, 10.00%
      expect(screen.getByText('200')).toBeInTheDocument();
      expect(screen.getByText('20')).toBeInTheDocument();
      expect(screen.getByText('10.00%')).toBeInTheDocument();
    });
  });

  it('renders comparisons table with lift, z, p columns', async () => {
    global.fetch = successResultsFetch();

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Significance vs control')).toBeInTheDocument();
      expect(screen.getByRole('columnheader', { name: 'Lift' })).toBeInTheDocument();
    });
  });

  it('shows check_circle icon for significant comparison with enough data', async () => {
    // Both arms have 200+ views — passes MIN_SAMPLE_PER_ARM (100)
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({
          body: {
            success: true,
            data: {
              experiment: makeExperiment(),
              stats: [
                { key: 'a', label: 'Control', views: 200, goals: 20, conversionRate: 0.1 },
                { key: 'b', label: 'Challenger', views: 210, goals: 35, conversionRate: 0.1667 },
              ],
              comparisons: [
                { variantKey: 'b', controlKey: 'a', z: 2.5, p: 0.01, lift: 0.667, significant: true },
              ],
            },
          },
        }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await waitFor(() => {
      const icons = document.querySelectorAll('.material-icons');
      const iconTexts = Array.from(icons).map((i) => i.textContent);
      expect(iconTexts).toContain('check_circle');
    });
  });

  it('shows hourglass_top icon when significant but not enough data', async () => {
    // Both arms have < 100 views — fails MIN_SAMPLE_PER_ARM
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({
          body: {
            success: true,
            data: {
              experiment: makeExperiment(),
              stats: [
                { key: 'a', label: 'Control', views: 50, goals: 5, conversionRate: 0.1 },
                { key: 'b', label: 'Challenger', views: 60, goals: 15, conversionRate: 0.25 },
              ],
              comparisons: [
                { variantKey: 'b', controlKey: 'a', z: 2.1, p: 0.03, lift: 1.5, significant: true },
              ],
            },
          },
        }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await waitFor(() => {
      const icons = document.querySelectorAll('.material-icons');
      const iconTexts = Array.from(icons).map((i) => i.textContent);
      expect(iconTexts).toContain('hourglass_top');
    });
  });

  it('shows remove_circle_outline when not significant', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({
          body: {
            success: true,
            data: {
              experiment: makeExperiment(),
              stats: [
                { key: 'a', label: 'Control', views: 200, goals: 20, conversionRate: 0.1 },
                { key: 'b', label: 'Challenger', views: 200, goals: 22, conversionRate: 0.11 },
              ],
              comparisons: [
                { variantKey: 'b', controlKey: 'a', z: 0.5, p: 0.6, lift: 0.1, significant: false },
              ],
            },
          },
        }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await waitFor(() => {
      const icons = document.querySelectorAll('.material-icons');
      const iconTexts = Array.from(icons).map((i) => i.textContent);
      expect(iconTexts).toContain('remove_circle_outline');
    });
  });

  it('fetches results on mount', async () => {
    const fetchMock = successResultsFetch();
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string]>;
      expect(calls.some(([u]) => u.includes('/results'))).toBe(true);
    });
  });

  it('re-fetches results when Refresh is clicked', async () => {
    const fetchMock = successResultsFetch();
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string]>;
      expect(calls.some(([u]) => u.includes('/results'))).toBe(true);
    });

    const callsBefore = (fetchMock as ReturnType<typeof vi.fn>).mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    });

    await waitFor(() => {
      expect((fetchMock as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

// ---------------------------------------------------------------------------
// Delete experiment
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — delete experiment', () => {
  it('shows delete confirmation modal when Delete is clicked', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    expect(screen.getByText('Delete Experiment')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to delete/)).toBeInTheDocument();
  });

  it('cancels the modal when Cancel is clicked', () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Delete Experiment')).not.toBeInTheDocument();
  });

  it('calls DELETE /experiments/:id and redirects on success', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'DELETE',
        respond: async () => ({
          body: { success: true },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    // Open modal — click the header Delete button (has delete icon + text)
    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    // Wait for modal to appear then click the confirm button inside the modal
    await waitFor(() => {
      expect(screen.getByText('Delete Experiment')).toBeInTheDocument();
    });
    // The confirm button is inside the modal (fixed overlay), find it by its destructive styling
    const confirmBtn = document.querySelector('button.bg-destructive') as HTMLButtonElement | null;
    expect(confirmBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(confirmBtn!);
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/experiments');
    });
  });

  it('shows deleteError message when DELETE fails', async () => {
    global.fetch = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'DELETE',
        respond: async () => ({
          body: { success: false, error: 'Cannot delete running experiment' },
        }),
      },
    ]);

    render(
      <ExperimentDetailClient
        experiment={makeExperiment()}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    await waitFor(() => {
      expect(screen.getByText('Delete Experiment')).toBeInTheDocument();
    });
    const confirmBtn = document.querySelector('button.bg-destructive') as HTMLButtonElement | null;
    expect(confirmBtn).not.toBeNull();

    await act(async () => {
      fireEvent.click(confirmBtn!);
    });

    await waitFor(() => {
      expect(screen.getByText('Cannot delete running experiment')).toBeInTheDocument();
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('shows experiment name in the confirmation dialog', async () => {
    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ name: 'Test Experiment Alpha' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Delete/ }));
    await waitFor(() => {
      expect(screen.getByText('Delete Experiment')).toBeInTheDocument();
    });
    // The experiment name appears in the confirmation text inside a <strong>
    const strongEl = document.querySelector('.bg-card strong');
    expect(strongEl?.textContent).toBe('Test Experiment Alpha');
  });
});

// ---------------------------------------------------------------------------
// Hypothesis textarea
// ---------------------------------------------------------------------------
describe('ExperimentDetailClient — hypothesis textarea', () => {
  it('calls PATCH with hypothesis on blur when value changes', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
      {
        match: (u, m) => u.includes('/experiments/7') && m === 'PATCH',
        respond: async () => ({
          body: { success: true, data: makeExperiment({ hypothesis: 'New hypothesis' }) },
        }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ hypothesis: 'Old hypothesis' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const hypothesisTextarea = screen.getByPlaceholderText(/What do you expect/);
    fireEvent.change(hypothesisTextarea, { target: { value: 'New hypothesis' } });

    await act(async () => {
      fireEvent.blur(hypothesisTextarea);
    });

    await waitFor(() => {
      const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
      const patchCall = calls.find(([u, init]) => u.includes('/experiments/7') && init?.method === 'PATCH');
      expect(patchCall).toBeDefined();
      const body = JSON.parse(patchCall![1]!.body as string);
      expect(body.hypothesis).toBe('New hypothesis');
    });
  });

  it('does not PATCH hypothesis when value is unchanged on blur', async () => {
    const fetchMock = buildFetchMock([
      {
        match: (u) => u.includes('/results'),
        respond: async () => ({ body: { success: false } }),
      },
    ]);
    global.fetch = fetchMock;

    render(
      <ExperimentDetailClient
        experiment={makeExperiment({ hypothesis: 'Same value' })}
        variants={makeVariants()}
        target={defaultTarget}
        siteName={null}
      />,
    );

    const hypothesisTextarea = screen.getByPlaceholderText(/What do you expect/);

    await act(async () => {
      fireEvent.blur(hypothesisTextarea);
    });

    // Only the /results fetch should have been called, not PATCH
    const calls = (fetchMock as ReturnType<typeof vi.fn>).mock.calls as Array<[string, RequestInit?]>;
    const patchCalls = calls.filter(([u, init]) => u.includes('/experiments/7') && init?.method === 'PATCH');
    expect(patchCalls).toHaveLength(0);
  });
});
