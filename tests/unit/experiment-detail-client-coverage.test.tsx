// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/ExperimentDetailClient.tsx`.
 *
 * Three-pane experiment detail UI:
 *  1. Header — name editing, status transitions, delete flow
 *  2. Hypothesis textarea + Goal section
 *  3. Traffic split editor + rebalance
 *  4. Variants — JSON editor, seed, save, add/remove, label edit
 *  5. Results — stats table + significance comparisons
 *
 * next/navigation and fetch are mocked. next/link renders plain anchors.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (before component import) ────────────────────────────────────────

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function jsonOk(body: unknown) {
  return Promise.resolve({ ok: true, json: async () => body });
}

function jsonFail(msg = 'server_error') {
  return Promise.resolve({ ok: true, json: async () => ({ success: false, error: msg }) });
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeExperiment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    targetType: 'post' as const,
    targetId: 10,
    postId: 10,
    name: 'My Experiment',
    hypothesis: 'This will increase clicks',
    status: 'draft',
    variantSplit: { a: 50, b: 50 },
    goalMetric: 'page_view',
    goalSelector: null,
    startedAt: null,
    endedAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeVariants() {
  return [
    { id: 1, experimentId: 1, key: 'a', label: 'Control', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
    { id: 2, experimentId: 1, key: 'b', label: 'Challenger', blockTreeOverride: { blocks: [], version: '1.0' }, createdAt: '2026-01-01T00:00:00Z' },
  ];
}

function makeTarget() {
  return {
    id: 10,
    title: 'Home Page',
    content: JSON.stringify({ blocks: [{ id: 'b1', type: 'text', values: {} }], version: '1.0' }),
    siteId: 1,
    editHref: '/portal/websites/1/posts/10/edit',
    kindLabel: 'Page',
  };
}

function defaultResultsData() {
  return {
    success: true,
    data: {
      experiment: makeExperiment(),
      stats: [
        { key: 'a', label: 'Control', views: 200, goals: 20, conversionRate: 0.1 },
        { key: 'b', label: 'Challenger', views: 210, goals: 30, conversionRate: 0.143 },
      ],
      comparisons: [
        { variantKey: 'b', controlKey: 'a', z: 2.1, p: 0.035, lift: 0.43, significant: true },
      ],
    },
  };
}

function defaultFetch(url: string): ReturnType<typeof jsonOk> {
  if (url.includes('/results')) return jsonOk(defaultResultsData());
  if (url.includes('/experiments/1') && !url.includes('/variants')) {
    return jsonOk({
      success: true,
      data: {
        experiment: makeExperiment(),
        variants: makeVariants(),
      },
    });
  }
  if (url.includes('/variants')) return jsonOk({ success: true, data: {} });
  return jsonOk({ success: true, data: makeExperiment() });
}

// ─── Component under test ─────────────────────────────────────────────────────

import ExperimentDetailClient from '@/components/portal/ExperimentDetailClient';

function renderComponent(
  expOverrides: Partial<Record<string, unknown>> = {},
  siteNameArg: string | null = 'Acme Inc',
) {
  const experiment = makeExperiment(expOverrides);
  const variants = makeVariants();
  const target = makeTarget();
  return render(
    <ExperimentDetailClient
      experiment={experiment}
      variants={variants}
      target={target}
      siteName={siteNameArg}
    />,
  );
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn((url: string) => defaultFetch(url)) as typeof global.fetch;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Initial render ───────────────────────────────────────────────────────────

describe('ExperimentDetailClient — initial render', () => {
  it('renders the experiment name in the breadcrumb and header', () => {
    const { container } = renderComponent();
    expect(container.textContent).toContain('My Experiment');
  });

  it('renders a link back to /portal/experiments in the breadcrumb', () => {
    const { container } = renderComponent();
    const link = container.querySelector('a[href="/portal/experiments"]');
    expect(link).toBeTruthy();
  });

  it('renders the target title as a link', () => {
    const { container } = renderComponent();
    const link = container.querySelector('a[href="/portal/websites/1/posts/10/edit"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain('Home Page');
  });

  it('renders the site name when provided', () => {
    const { container } = renderComponent({}, 'Acme Inc');
    expect(container.textContent).toContain('Acme Inc');
  });

  it('omits the site name when null', () => {
    const { container } = renderComponent({}, null);
    expect(container.textContent).not.toContain('Acme Inc');
  });

  it('renders the current status badge', () => {
    const { container } = renderComponent({ status: 'draft' });
    expect(container.textContent).toContain('draft');
  });

  it('renders the hypothesis section', () => {
    const { container } = renderComponent();
    expect(container.textContent).toContain('Hypothesis');
  });

  it('renders the hypothesis text in the textarea', () => {
    const { container } = renderComponent({ hypothesis: 'CTA reframing' });
    const ta = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(ta?.defaultValue).toContain('CTA reframing');
  });

  it('pre-fills the goal metric select', () => {
    const { container } = renderComponent({ goalMetric: 'cta_click' });
    const sel = container.querySelector('select') as HTMLSelectElement;
    expect(sel?.value).toBe('cta_click');
  });

  it('renders the traffic split section', () => {
    const { container } = renderComponent();
    expect(container.textContent).toContain('Traffic split');
  });

  it('renders number inputs for each variant split key', () => {
    const { container } = renderComponent();
    const inputs = container.querySelectorAll('input[type="number"]');
    expect(inputs.length).toBe(2);
  });

  it('shows the variants section with Control and Challenger', () => {
    const { container } = renderComponent();
    expect(container.textContent).toContain('Control');
    expect(container.textContent).toContain('Challenger');
  });

  it('prefills variant b JSON from blockTreeOverride', () => {
    const { container } = renderComponent();
    const textareas = container.querySelectorAll('textarea');
    // Second textarea is the variants section (first is hypothesis)
    const variantTextareas = Array.from(textareas).slice(1);
    const bTextarea = variantTextareas.find(t => t.value.includes('"blocks"'));
    expect(bTextarea).toBeTruthy();
  });

  it('renders a Delete button', () => {
    const { container } = renderComponent();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Delete'),
    );
    expect(deleteBtn).toBeTruthy();
  });

  it('renders the Results section heading', () => {
    const { container } = renderComponent();
    expect(container.textContent).toContain('Results');
  });

  it('fetches results on mount', async () => {
    renderComponent();
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.some(([url]: [string]) => url.includes('/results'))).toBe(true);
    });
  });

  it('shows siteName dot separator', () => {
    const { container } = renderComponent({}, 'Test Corp');
    expect(container.textContent).toContain('·');
    expect(container.textContent).toContain('Test Corp');
  });
});

// ─── Status transitions ───────────────────────────────────────────────────────

describe('ExperimentDetailClient — status transitions', () => {
  it('shows Start button when status is draft', () => {
    const { container } = renderComponent({ status: 'draft' });
    const btn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Start',
    );
    expect(btn).toBeTruthy();
  });

  it('shows Archive button when status is draft', () => {
    const { container } = renderComponent({ status: 'draft' });
    const btn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Archive',
    );
    expect(btn).toBeTruthy();
  });

  it('shows Stop button when status is running', () => {
    const { container } = renderComponent({ status: 'running' });
    const btn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Stop',
    );
    expect(btn).toBeTruthy();
  });

  it('shows Reopen button when status is archived', () => {
    const { container } = renderComponent({ status: 'archived' });
    const btn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Reopen',
    );
    expect(btn).toBeTruthy();
  });

  it('calls PATCH on the experiment when a transition button is clicked', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonOk({ success: true, data: makeExperiment({ status: 'running' }) });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent({ status: 'draft' });
    const startBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Start',
    );
    await act(async () => {
      fireEvent.click(startBtn!);
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/experiments/1') && opts?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  it('shows an error message when transition PATCH fails', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonFail('transition_error');
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent({ status: 'draft' });
    const startBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Start',
    );
    await act(async () => {
      fireEvent.click(startBtn!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('transition_error');
    });
  });
});

// ─── Name editing ─────────────────────────────────────────────────────────────

describe('ExperimentDetailClient — name editing', () => {
  it('shows an input when the name span is clicked', () => {
    const { container } = renderComponent();
    const nameSpan = container.querySelector('span[title="Click to edit name"]');
    expect(nameSpan).toBeTruthy();
    fireEvent.click(nameSpan!);
    const input = container.querySelector('input[maxlength="255"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('My Experiment');
  });

  it('saves the name on Enter key', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonOk({ success: true, data: makeExperiment({ name: 'Renamed' }) });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const nameSpan = container.querySelector('span[title="Click to edit name"]');
    fireEvent.click(nameSpan!);
    const input = container.querySelector('input[maxlength="255"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/experiments/1') && opts?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  it('cancels editing on Escape key and restores original name', () => {
    const { container } = renderComponent();
    const nameSpan = container.querySelector('span[title="Click to edit name"]');
    fireEvent.click(nameSpan!);
    const input = container.querySelector('input[maxlength="255"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Discarded' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    // After escape, the input is gone and original name is displayed
    expect(container.querySelector('input[maxlength="255"]')).toBeNull();
    expect(container.textContent).toContain('My Experiment');
  });

  it('shows error when empty name is saved on blur', async () => {
    const { container } = renderComponent();
    const nameSpan = container.querySelector('span[title="Click to edit name"]');
    fireEvent.click(nameSpan!);
    const input = container.querySelector('input[maxlength="255"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => {
      fireEvent.blur(input);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Name cannot be empty');
    });
  });

  it('shows error when name exceeds 255 chars', async () => {
    const { container } = renderComponent();
    const nameSpan = container.querySelector('span[title="Click to edit name"]');
    fireEvent.click(nameSpan!);
    const input = container.querySelector('input[maxlength="255"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'x'.repeat(256) } });
    await act(async () => {
      fireEvent.blur(input);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('255 characters or fewer');
    });
  });

  it('does not call PATCH when name is unchanged', async () => {
    const { container } = renderComponent();
    const nameSpan = container.querySelector('span[title="Click to edit name"]');
    fireEvent.click(nameSpan!);
    const input = container.querySelector('input[maxlength="255"]') as HTMLInputElement;
    // Value is already 'My Experiment', no change
    await act(async () => {
      fireEvent.blur(input);
    });
    // Only the initial results fetch should have been called, no PATCH
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const patches = calls.filter(([url, opts]: [string, RequestInit]) =>
      url.includes('/experiments/1') && opts?.method === 'PATCH',
    );
    expect(patches.length).toBe(0);
  });
});

// ─── Delete flow ──────────────────────────────────────────────────────────────

describe('ExperimentDetailClient — delete flow', () => {
  it('opens the confirmation dialog when Delete button is clicked', () => {
    const { container } = renderComponent();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Delete') && b.className.includes('red'),
    );
    fireEvent.click(deleteBtn!);
    expect(container.textContent).toContain('Delete Experiment');
    expect(container.textContent).toContain('Are you sure');
  });

  it('closes the dialog when Cancel is clicked', () => {
    const { container } = renderComponent();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Delete') && b.className.includes('red'),
    );
    fireEvent.click(deleteBtn!);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Cancel',
    );
    expect(cancelBtn).toBeTruthy();
    fireEvent.click(cancelBtn!);
    expect(container.textContent).not.toContain('Are you sure');
  });

  it('calls DELETE and redirects on confirm', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonOk({ success: true });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Delete') && b.className.includes('red'),
    );
    fireEvent.click(deleteBtn!);
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Delete') && !b.className.includes('red'),
    );
    await act(async () => {
      fireEvent.click(confirmBtn!);
    });
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith('/portal/experiments');
    });
  });

  it('shows a delete error when DELETE fails', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonFail('not_allowed');
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Delete') && b.className.includes('red'),
    );
    fireEvent.click(deleteBtn!);
    const confirmBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Delete') && !b.className.includes('red'),
    );
    await act(async () => {
      fireEvent.click(confirmBtn!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('not_allowed');
    });
  });

  it('shows experiment name in the confirm dialog', () => {
    const { container } = renderComponent({ name: 'Special Test' });
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Delete') && b.className.includes('red'),
    );
    fireEvent.click(deleteBtn!);
    expect(container.textContent).toContain('Special Test');
  });
});

// ─── Traffic split ────────────────────────────────────────────────────────────

describe('ExperimentDetailClient — traffic split', () => {
  it('renders saved split total', () => {
    const { container } = renderComponent({ variantSplit: { a: 50, b: 50 } });
    expect(container.textContent).toContain('saved total: 100%');
  });

  it('shows a warning when draft total is not 100', () => {
    const { container } = renderComponent({ variantSplit: { a: 70, b: 20 } });
    const inputs = container.querySelectorAll('input[type="number"]');
    // Change variant b to 10, making total 80
    fireEvent.change(inputs[1], { target: { value: '10' } });
    expect(container.textContent).toContain('Total must equal 100%');
  });

  it('does not show the warning when total equals 100', () => {
    const { container } = renderComponent({ variantSplit: { a: 50, b: 50 } });
    // Already 50+50=100
    expect(container.textContent).not.toContain('Total must equal 100%');
  });

  it('calls PATCH with numeric split on Save split click', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonOk({ success: true, data: makeExperiment() });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const saveSplitBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Save split',
    );
    await act(async () => {
      fireEvent.click(saveSplitBtn!);
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/experiments/1') && opts?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  it('shows an error when split weights are all zero', async () => {
    const { container } = renderComponent({ variantSplit: { a: 0, b: 0 } });
    const inputs = container.querySelectorAll('input[type="number"]');
    fireEvent.change(inputs[0], { target: { value: '0' } });
    fireEvent.change(inputs[1], { target: { value: '0' } });
    const saveSplitBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.trim() === 'Save split',
    );
    await act(async () => {
      fireEvent.click(saveSplitBtn!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('at least one positive weight');
    });
  });

  it('rebalance button distributes weights evenly', () => {
    const { container } = renderComponent({ variantSplit: { a: 80, b: 20 } });
    const rebalanceBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Rebalance'),
    );
    fireEvent.click(rebalanceBtn!);
    const inputs = container.querySelectorAll('input[type="number"]') as NodeListOf<HTMLInputElement>;
    const total = Array.from(inputs).reduce((s, inp) => s + Number(inp.value), 0);
    expect(total).toBe(100);
  });
});

// ─── Variant operations ───────────────────────────────────────────────────────

describe('ExperimentDetailClient — variant JSON save', () => {
  it('renders Save button per variant', () => {
    const { container } = renderComponent();
    const saveBtns = Array.from(container.querySelectorAll('button')).filter(
      b => b.textContent?.trim() === 'Save',
    );
    expect(saveBtns.length).toBeGreaterThanOrEqual(2);
  });

  it('calls PATCH variants when Save button is clicked', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/variants') && !url.includes('DELETE')) {
        return jsonOk({ success: true, data: {} });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const saveBtns = Array.from(container.querySelectorAll('button')).filter(
      b => b.textContent?.trim() === 'Save',
    );
    await act(async () => {
      fireEvent.click(saveBtns[0]);
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/variants') && opts?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  it('shows error for invalid JSON in variant textarea', async () => {
    const { container } = renderComponent();
    const variantTextareas = Array.from(container.querySelectorAll('textarea')).slice(1);
    // Edit the first variant textarea to have bad JSON
    fireEvent.change(variantTextareas[0], { target: { value: '{ invalid json' } });
    const saveBtns = Array.from(container.querySelectorAll('button')).filter(
      b => b.textContent?.trim() === 'Save',
    );
    await act(async () => {
      fireEvent.click(saveBtns[0]);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Invalid JSON');
    });
  });

  it('shows error when variant save PATCH fails', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/variants') && !url.includes('DELETE')) {
        return jsonFail('save_error');
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const saveBtns = Array.from(container.querySelectorAll('button')).filter(
      b => b.textContent?.trim() === 'Save',
    );
    await act(async () => {
      fireEvent.click(saveBtns[0]);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('save_error');
    });
  });

  it('Seed from page button populates textarea with target content', () => {
    const { container } = renderComponent();
    const seedBtns = Array.from(container.querySelectorAll('button')).filter(
      b => b.textContent?.includes('Seed from'),
    );
    expect(seedBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(seedBtns[0]);
    const variantTextareas = Array.from(container.querySelectorAll('textarea')).slice(1);
    expect(variantTextareas[0].value).toContain('"blocks"');
  });
});

describe('ExperimentDetailClient — add/remove variant', () => {
  it('renders Add variant button', () => {
    const { container } = renderComponent();
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Add variant'),
    );
    expect(addBtn).toBeTruthy();
  });

  it('calls POST variants when Add variant is clicked', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/variants') && !url.includes('DELETE')) {
        return jsonOk({ success: true, data: {} });
      }
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonOk({
          success: true,
          data: {
            experiment: makeExperiment({ variantSplit: { a: 33, b: 33, c: 34 } }),
            variants: [
              ...makeVariants(),
              { id: 3, experimentId: 1, key: 'c', label: 'C', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
            ],
          },
        });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Add variant'),
    );
    await act(async () => {
      fireEvent.click(addBtn!);
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/variants') && opts?.method === 'POST',
        ),
      ).toBe(true);
    });
  });

  it('shows friendly error for no_keys_available', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/variants') && !url.includes('DELETE')) {
        return jsonFail('no_keys_available');
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Add variant'),
    );
    await act(async () => {
      fireEvent.click(addBtn!);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Maximum 26 variants');
    });
  });

  it('disables remove for control variant (key=a)', () => {
    const { container } = renderComponent();
    // The remove button for variant 'a' should be disabled
    const removeButtons = Array.from(container.querySelectorAll('button[aria-label]')).filter(
      b => b.getAttribute('aria-label')?.includes('cannot be removed'),
    );
    expect(removeButtons.length).toBeGreaterThanOrEqual(1);
    expect((removeButtons[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables remove when only 2 variants remain', () => {
    const { container } = renderComponent();
    // With exactly 2 variants, remove should be disabled for both
    const removeButtons = Array.from(container.querySelectorAll('button')).filter(
      b => b.getAttribute('aria-label')?.includes('cannot be removed') ||
        b.getAttribute('aria-label')?.includes('at least 2'),
    );
    expect(removeButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('disables all remove buttons when experiment is running', () => {
    // With 2 variants and running, both are disabled:
    // 'a' because it's the control, 'b' because min-two-variants takes priority.
    const { container } = renderComponent({ status: 'running' });
    const removeButtons = Array.from(container.querySelectorAll('button')).filter(
      b => {
        const lbl = b.getAttribute('aria-label') ?? '';
        return lbl.includes('cannot be removed') || lbl.includes('at least 2') || lbl.includes('Stop the experiment');
      },
    );
    // Both variants should have a disabled remove
    for (const btn of removeButtons) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    }
    // With 3 variants and running, the 'b' remove gets the "stop first" title
    const threeVariants = [
      { id: 1, experimentId: 1, key: 'a', label: 'Control', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, experimentId: 1, key: 'b', label: 'B', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 3, experimentId: 1, key: 'c', label: 'C', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
    ];
    const { container: container2 } = render(
      <ExperimentDetailClient
        experiment={makeExperiment({ status: 'running', variantSplit: { a: 34, b: 33, c: 33 } })}
        variants={threeVariants}
        target={makeTarget()}
        siteName={null}
      />,
    );
    const runningRemoveBtn = Array.from(container2.querySelectorAll('button')).find(
      b => b.getAttribute('aria-label')?.includes('Stop the experiment'),
    );
    expect(runningRemoveBtn).toBeTruthy();
    expect((runningRemoveBtn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls DELETE variant on remove click', async () => {
    // Render with 3 variants so the non-control ones are removable
    const threeVariants = [
      { id: 1, experimentId: 1, key: 'a', label: 'Control', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, experimentId: 1, key: 'b', label: 'Challenger', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 3, experimentId: 1, key: 'c', label: 'C', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
    ];
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/variants/') && url.endsWith('/c')) {
        return jsonOk({ success: true });
      }
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonOk({
          success: true,
          data: {
            experiment: makeExperiment({ variantSplit: { a: 50, b: 50 } }),
            variants: makeVariants(),
          },
        });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit: { a: 34, b: 33, c: 33 } })}
        variants={threeVariants}
        target={makeTarget()}
        siteName={null}
      />,
    );
    // Find enabled remove button
    const removeButtons = Array.from(container.querySelectorAll('button')).filter(
      b => b.getAttribute('aria-label')?.includes('Remove variant') && !(b as HTMLButtonElement).disabled,
    );
    expect(removeButtons.length).toBeGreaterThanOrEqual(1);
    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/variants/') && opts?.method === 'DELETE',
        ),
      ).toBe(true);
    });
  });

  it('shows friendly error for control_protected on remove', async () => {
    const threeVariants = [
      { id: 1, experimentId: 1, key: 'a', label: 'Control', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 2, experimentId: 1, key: 'b', label: 'B', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
      { id: 3, experimentId: 1, key: 'c', label: 'C', blockTreeOverride: null, createdAt: '2026-01-01T00:00:00Z' },
    ];
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/variants/')) {
        return jsonFail('control_protected');
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit: { a: 34, b: 33, c: 33 } })}
        variants={threeVariants}
        target={makeTarget()}
        siteName={null}
      />,
    );
    const removeButtons = Array.from(container.querySelectorAll('button')).filter(
      b => b.getAttribute('aria-label')?.includes('Remove variant') && !(b as HTMLButtonElement).disabled,
    );
    await act(async () => {
      fireEvent.click(removeButtons[0]);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('control variant cannot be removed');
    });
  });
});

// ─── Variant label editing ────────────────────────────────────────────────────

describe('ExperimentDetailClient — variant label editing', () => {
  /** Helper: find the variant label edit input (has max-w-xs class, not the goal selector). */
  function getLabelInput(container: HTMLElement): HTMLInputElement {
    return container.querySelector('input.max-w-xs') as HTMLInputElement;
  }

  it('clicking label button shows an input for editing', () => {
    const { container } = renderComponent();
    const labelBtns = Array.from(container.querySelectorAll('button[title="Click to edit label"]'));
    expect(labelBtns.length).toBeGreaterThanOrEqual(1);
    fireEvent.click(labelBtns[0]);
    const input = getLabelInput(container);
    expect(input).toBeTruthy();
  });

  it('Escape key in label input cancels editing', () => {
    const { container } = renderComponent();
    const labelBtns = Array.from(container.querySelectorAll('button[title="Click to edit label"]'));
    fireEvent.click(labelBtns[0]);
    const input = getLabelInput(container);
    expect(input).toBeTruthy();
    fireEvent.keyDown(input, { key: 'Escape' });
    // Label edit input should be gone (class max-w-xs)
    expect(container.querySelector('input.max-w-xs')).toBeNull();
  });

  it('Enter key in label input triggers save', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/variants') && !url.includes('DELETE')) {
        return jsonOk({ success: true, data: {} });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const labelBtns = Array.from(container.querySelectorAll('button[title="Click to edit label"]'));
    fireEvent.click(labelBtns[0]);
    const input = getLabelInput(container);
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'New Label' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/variants') && opts?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  it('empty label shows an error and cancels edit', async () => {
    const { container } = renderComponent();
    const labelBtns = Array.from(container.querySelectorAll('button[title="Click to edit label"]'));
    fireEvent.click(labelBtns[0]);
    const input = getLabelInput(container);
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => {
      fireEvent.blur(input);
    });
    await waitFor(() => {
      expect(container.textContent).toContain('label cannot be empty');
    });
  });

  it('unchanged label cancels edit silently without PATCH', async () => {
    const { container } = renderComponent();
    const labelBtns = Array.from(container.querySelectorAll('button[title="Click to edit label"]'));
    fireEvent.click(labelBtns[0]);
    const input = getLabelInput(container);
    expect(input).toBeTruthy();
    // value starts as 'Control', don't change it
    await act(async () => {
      fireEvent.blur(input);
    });
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const patches = calls.filter(([url, opts]: [string, RequestInit]) =>
      url.includes('/variants') && opts?.method === 'PATCH',
    );
    expect(patches.length).toBe(0);
  });
});

// ─── Goal section ─────────────────────────────────────────────────────────────

describe('ExperimentDetailClient — goal section', () => {
  it('renders metric select with page_view, cta_click, form_submit options', () => {
    const { container } = renderComponent();
    const sel = container.querySelector('select') as HTMLSelectElement;
    const optionValues = Array.from(sel.options).map(o => o.value);
    expect(optionValues).toContain('page_view');
    expect(optionValues).toContain('cta_click');
    expect(optionValues).toContain('form_submit');
  });

  it('calls PATCH when goal metric is changed', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonOk({ success: true, data: makeExperiment({ goalMetric: 'cta_click' }) });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    const sel = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(sel, { target: { value: 'cta_click' } });
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/experiments/1') && opts?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  it('renders a Selector input for CSS selector', () => {
    const { container } = renderComponent({ goalSelector: '.cta-btn' });
    const inputs = container.querySelectorAll('input[type="text"]');
    const selectorInput = Array.from(inputs).find(
      i => (i as HTMLInputElement).defaultValue === '.cta-btn',
    );
    expect(selectorInput).toBeTruthy();
  });

  it('calls PATCH when selector input changes on blur', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonOk({ success: true, data: makeExperiment({ goalSelector: '.new-btn' }) });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent({ goalSelector: '' });
    const inputs = container.querySelectorAll('input[type="text"]');
    const selectorInput = inputs[0] as HTMLInputElement;
    fireEvent.change(selectorInput, { target: { value: '.new-btn' } });
    await act(async () => {
      fireEvent.blur(selectorInput);
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/experiments/1') && opts?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });
});

// ─── Hypothesis section ───────────────────────────────────────────────────────

describe('ExperimentDetailClient — hypothesis section', () => {
  it('calls PATCH when hypothesis textarea loses focus with changed value', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/experiments/1') && !url.includes('/results') && !url.includes('/variants')) {
        return jsonOk({ success: true, data: makeExperiment({ hypothesis: 'New hypothesis' }) });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent({ hypothesis: 'Old hypothesis' });
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New hypothesis' } });
    await act(async () => {
      fireEvent.blur(textarea);
    });
    await waitFor(() => {
      const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
      expect(
        calls.some(([url, opts]: [string, RequestInit]) =>
          url.includes('/experiments/1') && opts?.method === 'PATCH',
        ),
      ).toBe(true);
    });
  });

  it('does not call PATCH when hypothesis is unchanged on blur', async () => {
    const { container } = renderComponent({ hypothesis: 'Same' });
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    // No change; blur should not fire PATCH
    await act(async () => {
      fireEvent.blur(textarea);
    });
    const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls;
    const patches = calls.filter(([url, opts]: [string, RequestInit]) =>
      url.includes('/experiments/1') && opts?.method === 'PATCH',
    );
    expect(patches.length).toBe(0);
  });
});

// ─── Results display ──────────────────────────────────────────────────────────

describe('ExperimentDetailClient — results display', () => {
  it('shows Loading… initially while results are null', () => {
    global.fetch = vi.fn(() => new Promise(() => {})) as typeof global.fetch;
    const { container } = renderComponent();
    expect(container.textContent).toContain('Loading…');
  });

  it('renders stats table after results load', async () => {
    const { container } = renderComponent();
    await waitFor(() => {
      expect(container.textContent).toContain('10.00%');
    });
  });

  it('renders comparison table with lift and z/p values', async () => {
    const { container } = renderComponent();
    await waitFor(() => {
      expect(container.textContent).toContain('43.00%');
      expect(container.textContent).toContain('2.100');
    });
  });

  it('shows Refresh button to refetch results', async () => {
    const { container } = renderComponent();
    const refreshBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Refresh'),
    );
    expect(refreshBtn).toBeTruthy();
    const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => {
      fireEvent.click(refreshBtn!);
    });
    await waitFor(() => {
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });

  it('uses hourglass icon when significant but not enough data', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/results')) {
        return jsonOk({
          success: true,
          data: {
            experiment: makeExperiment(),
            stats: [
              { key: 'a', label: 'Control', views: 50, goals: 5, conversionRate: 0.1 },
              { key: 'b', label: 'Challenger', views: 50, goals: 10, conversionRate: 0.2 },
            ],
            comparisons: [
              { variantKey: 'b', controlKey: 'a', z: 2.1, p: 0.035, lift: 1.0, significant: true },
            ],
          },
        });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    await waitFor(() => {
      expect(container.textContent).toContain('hourglass_top');
    });
  });

  it('uses check_circle icon when significant and enough data', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/results')) {
        return jsonOk({
          success: true,
          data: {
            experiment: makeExperiment(),
            stats: [
              { key: 'a', label: 'Control', views: 150, goals: 15, conversionRate: 0.1 },
              { key: 'b', label: 'Challenger', views: 150, goals: 25, conversionRate: 0.167 },
            ],
            comparisons: [
              { variantKey: 'b', controlKey: 'a', z: 2.1, p: 0.035, lift: 0.67, significant: true },
            ],
          },
        });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    await waitFor(() => {
      expect(container.textContent).toContain('check_circle');
    });
  });

  it('uses remove_circle_outline when not significant', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/results')) {
        return jsonOk({
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
        });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    await waitFor(() => {
      expect(container.textContent).toContain('remove_circle_outline');
    });
  });

  it('hides the comparisons table when comparisons array is empty', async () => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes('/results')) {
        return jsonOk({
          success: true,
          data: {
            experiment: makeExperiment(),
            stats: [{ key: 'a', label: 'Control', views: 50, goals: 5, conversionRate: 0.1 }],
            comparisons: [],
          },
        });
      }
      return defaultFetch(url);
    }) as typeof global.fetch;

    const { container } = renderComponent();
    await waitFor(() => {
      expect(container.textContent).not.toContain('Significance vs control');
    });
  });
});

// ─── Add variant limit ────────────────────────────────────────────────────────

describe('ExperimentDetailClient — add variant at limit', () => {
  it('disables Add variant button when 26 variants exist', () => {
    const maxVariants = Array.from({ length: 26 }, (_, i) => ({
      id: i + 1,
      experimentId: 1,
      key: String.fromCharCode(97 + i),
      label: `Variant ${i}`,
      blockTreeOverride: null,
      createdAt: '2026-01-01T00:00:00Z',
    }));
    const variantSplit: Record<string, number> = {};
    for (const v of maxVariants) variantSplit[v.key] = Math.floor(100 / 26);

    const { container } = render(
      <ExperimentDetailClient
        experiment={makeExperiment({ variantSplit })}
        variants={maxVariants}
        target={makeTarget()}
        siteName={null}
      />,
    );
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Add variant'),
    ) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
    expect(container.textContent).toContain('Maximum 26 variants reached');
  });
});
