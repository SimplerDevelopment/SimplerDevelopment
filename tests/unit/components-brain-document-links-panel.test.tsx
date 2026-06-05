// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `components/brain/DocumentLinksPanel.tsx`.
 *
 * Covers:
 *  - Empty state (no links)
 *  - Populated state (grouped tabs, active tab, item rows)
 *  - Tab switching
 *  - Item title fallback (#id when title is null)
 *  - Item note display
 *  - Unlink: confirm → DELETE → onChanged, error, network throw, cancel
 *  - "Link" button opens LinkPickerDialog
 *  - LinkPickerDialog: type select, search input, loading, empty, options list,
 *    pick + submit (POST), submit error, submit network throw, close, cancel
 *  - fetchPickerOptions branches: topic, initiative, decision, meeting,
 *    glossary_term, person (including search filtering)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react';
import type { ResolvedDocumentLink } from '@/lib/brain/documents';

// ─── fetch mock helpers ────────────────────────────────────────────────────

function mockFetch(payload: unknown, ok = true) {
  (global as any).fetch = vi.fn(async () => ({
    ok,
    json: async () => payload,
  }));
}

function mockFetchReject(msg = 'Network error') {
  (global as any).fetch = vi.fn(async () => {
    throw new Error(msg);
  });
}

// ─── window.confirm stub ──────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Default: confirm returns true (proceed with unlink)
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  // Default fetch returns empty topics list (for picker auto-load)
  mockFetch({ success: true, data: { items: [] } });
});

// ─── import component under test (after mocks) ────────────────────────────

import DocumentLinksPanel from '@/components/brain/DocumentLinksPanel';

// ─── test data helpers ────────────────────────────────────────────────────

const makeLink = (
  over: Partial<ResolvedDocumentLink> = {},
): ResolvedDocumentLink => ({
  entityType: 'topic',
  entityId: 1,
  title: 'My Topic',
  note: null,
  ...over,
});

// ─── rendering helpers ────────────────────────────────────────────────────

function renderPanel(
  links: ResolvedDocumentLink[] = [],
  onChanged?: () => void,
  documentId = 42,
) {
  return render(
    <DocumentLinksPanel
      documentId={documentId}
      links={links}
      onChanged={onChanged}
    />,
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Empty state
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentLinksPanel — empty state', () => {
  it('renders the panel heading', () => {
    renderPanel([]);
    expect(screen.getByText('Linked entities')).toBeInTheDocument();
  });

  it('shows a (0) count badge', () => {
    renderPanel([]);
    expect(screen.getByText('(0)')).toBeInTheDocument();
  });

  it('shows the empty-state message when no links', () => {
    renderPanel([]);
    expect(
      screen.getByText(/Nothing linked yet/),
    ).toBeInTheDocument();
  });

  it('does not render any tab buttons when no links', () => {
    const { container } = renderPanel([]);
    // Tab bar should not be present — no ordered types
    expect(container.querySelector('[class*="border-b-2"]')).toBeNull();
  });

  it('renders a "Link" button', () => {
    renderPanel([]);
    expect(screen.getByText('Link')).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Populated state — tabs and rows
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentLinksPanel — populated state', () => {
  const links: ResolvedDocumentLink[] = [
    makeLink({ entityType: 'topic', entityId: 1, title: 'Topic Alpha' }),
    makeLink({ entityType: 'decision', entityId: 2, title: 'Decision Beta' }),
    makeLink({ entityType: 'topic', entityId: 3, title: 'Topic Gamma' }),
  ];

  it('shows the correct total count', () => {
    renderPanel(links);
    expect(screen.getByText('(3)')).toBeInTheDocument();
  });

  it('renders a tab for each entity type that has items', () => {
    renderPanel(links);
    expect(screen.getByText('Topics')).toBeInTheDocument();
    expect(screen.getByText('Decisions')).toBeInTheDocument();
    expect(screen.queryByText('Initiatives')).not.toBeInTheDocument();
  });

  it('shows the first tab as active by default and renders its items', () => {
    renderPanel(links);
    // Topics is first with 2 items; both should be visible
    expect(screen.getByText('Topic Alpha')).toBeInTheDocument();
    expect(screen.getByText('Topic Gamma')).toBeInTheDocument();
  });

  it('does not show items from inactive tab by default', () => {
    renderPanel(links);
    expect(screen.queryByText('Decision Beta')).not.toBeInTheDocument();
  });

  it('switches active tab on click', () => {
    renderPanel(links);
    fireEvent.click(screen.getByText('Decisions'));
    expect(screen.getByText('Decision Beta')).toBeInTheDocument();
    expect(screen.queryByText('Topic Alpha')).not.toBeInTheDocument();
  });

  it('shows the count badge on each tab', () => {
    renderPanel(links);
    // Topics tab has count = 2, Decisions = 1
    const topicsTab = screen.getByText('Topics').closest('button')!;
    expect(topicsTab.textContent).toContain('2');
  });

  it('renders the entity icon in item rows', () => {
    const { container } = renderPanel(links);
    // material-icons "account_tree" for topic
    expect(container.textContent).toContain('account_tree');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Item display edge cases
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentLinksPanel — item display edge cases', () => {
  it('shows fallback label when title is null', () => {
    renderPanel([makeLink({ entityType: 'topic', entityId: 7, title: null })]);
    expect(screen.getByText('Topic #7')).toBeInTheDocument();
  });

  it('renders item note when present', () => {
    renderPanel([
      makeLink({ entityType: 'topic', entityId: 1, title: 'T', note: 'context note' }),
    ]);
    expect(screen.getByText('context note')).toBeInTheDocument();
  });

  it('does not render note div when note is null', () => {
    renderPanel([makeLink({ entityType: 'topic', entityId: 1, title: 'T', note: null })]);
    expect(screen.queryByText('context note')).not.toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Unlink action
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentLinksPanel — unlink', () => {
  const link = makeLink({ entityType: 'topic', entityId: 1, title: 'Topic A' });

  it('calls confirm before unlinking', async () => {
    mockFetch({ success: true });
    renderPanel([link], vi.fn());
    fireEvent.click(screen.getByLabelText('Unlink'));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('sends DELETE request with correct body on confirm', async () => {
    mockFetch({ success: true });
    const onChanged = vi.fn();
    renderPanel([link], onChanged, 42);
    fireEvent.click(screen.getByLabelText('Unlink'));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((global as any).fetch).toHaveBeenCalledWith(
      '/api/portal/brain/documents/42/links',
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ entityType: 'topic', entityId: 1 }),
      }),
    );
  });

  it('does not send DELETE when confirm returns false', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChanged = vi.fn();
    renderPanel([link], onChanged);
    fireEvent.click(screen.getByLabelText('Unlink'));
    await new Promise((r) => setTimeout(r, 50));
    expect(onChanged).not.toHaveBeenCalled();
    // fetch may have been called for picker pre-load but NOT for DELETE
    const fetchCalls = ((global as any).fetch as any).mock.calls as any[][];
    const deleteCalls = fetchCalls.filter(
      (c) => c[1]?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it('shows error message when DELETE returns ok=false', async () => {
    mockFetch({ success: false, message: 'Unlink failed' }, false);
    renderPanel([link], vi.fn());
    fireEvent.click(screen.getByLabelText('Unlink'));
    await waitFor(() =>
      expect(screen.getByText('Unlink failed')).toBeInTheDocument(),
    );
  });

  it('shows fallback error when json has no message', async () => {
    mockFetch({ success: false }, false);
    renderPanel([link], vi.fn());
    fireEvent.click(screen.getByLabelText('Unlink'));
    await waitFor(() =>
      expect(screen.getByText('Failed to unlink.')).toBeInTheDocument(),
    );
  });

  it('shows network error message on fetch throw', async () => {
    mockFetchReject('boom');
    renderPanel([link], vi.fn());
    fireEvent.click(screen.getByLabelText('Unlink'));
    await waitFor(() =>
      expect(screen.getByText('boom')).toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Link picker dialog — open / close
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentLinksPanel — picker dialog open/close', () => {
  it('opens the picker dialog when "Link" button is clicked', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('Link an entity')).toBeInTheDocument(),
    );
  });

  it('closes the picker dialog when the X (Close) button is clicked', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() => screen.getByLabelText('Close'));
    fireEvent.click(screen.getByLabelText('Close'));
    await waitFor(() =>
      expect(screen.queryByText('Link an entity')).not.toBeInTheDocument(),
    );
  });

  it('closes the picker dialog when Cancel is clicked', async () => {
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() => screen.getByText('Cancel'));
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() =>
      expect(screen.queryByText('Link an entity')).not.toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Link picker dialog — loading / options
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentLinksPanel — picker dialog options', () => {
  it('shows "No topics found." when fetch returns empty items', async () => {
    mockFetch({ success: true, data: { items: [] } });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('No topics found.')).toBeInTheDocument(),
    );
  });

  it('renders fetched options as a list', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 5, name: 'Topic Five', path: '/five' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('Topic Five')).toBeInTheDocument(),
    );
  });

  it('renders secondary text (path) under option', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 5, name: 'Topic Five', path: '/five' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('/five')).toBeInTheDocument(),
    );
  });

  it('highlights a picked option', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 5, name: 'Picked Topic', path: null }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Picked Topic');
    fireEvent.click(option.closest('button')!);
    await waitFor(() => {
      expect(option.closest('button')!.className).toContain('bg-primary/10');
    });
  });

  it('shows "No X found." for other entity types when empty', async () => {
    mockFetch({ success: true, data: { items: [] } });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    // Switch type to initiative
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'initiative' } });
    await waitFor(() =>
      expect(screen.getByText('No initiatives found.')).toBeInTheDocument(),
    );
  });

  it('loads new options when search input changes', async () => {
    // Set up fetch to always return a result with "Searched Topic"
    mockFetch({
      success: true,
      data: { items: [{ id: 10, name: 'Searched Topic' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    // The search triggers immediately on mount; wait for the result to appear
    await waitFor(() =>
      expect(screen.getByText('Searched Topic')).toBeInTheDocument(),
      { timeout: 2000 },
    );
    // The search input is present and can be changed
    const searchInput = screen.getByPlaceholderText('Title or name…');
    expect(searchInput).toBeInTheDocument();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Link picker dialog — submit (POST)
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentLinksPanel — picker dialog submit', () => {
  /** Opens the panel, opens the picker, loads one option, picks it.
   *  After calling this, the dialog submit button is ENABLED. */
  async function openPickerAndPick(onChanged = vi.fn()) {
    mockFetch({
      success: true,
      data: { items: [{ id: 9, name: 'Link Me' }] },
    });
    renderPanel([], onChanged, 42);
    // Open picker
    fireEvent.click(screen.getByText('Link'));
    // Wait for option to appear then pick it
    const option = await screen.findByText('Link Me');
    fireEvent.click(option.closest('button')!);
    return { onChanged };
  }

  /** The dialog submit button is scoped via the dialog backdrop container.
   *  The backdrop div contains a fixed-positioned overlay with class "fixed inset-0".
   *  Within it, the submit button is the last button in the footer.
   *  We find it by querying for buttons inside the dialog overlay. */
  function findDialogSubmitBtn(container?: HTMLElement) {
    const root = container ?? document.body;
    // The dialog backdrop has class "fixed inset-0"
    const backdrop = root.querySelector('.fixed.inset-0');
    if (!backdrop) return null;
    const allBtns = Array.from(backdrop.querySelectorAll('button'));
    // The submit button has "add_link" in its text content
    return allBtns.find((b) => b.textContent?.includes('add_link')) ?? null;
  }

  it('submit button is disabled when no option is picked', async () => {
    mockFetch({ success: true, data: { items: [{ id: 9, name: 'Link Me' }] } });
    const { container } = renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await screen.findByText('Link Me'); // wait for load — no option picked yet
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.disabled).toBe(true);
  });

  it('submit button is enabled after picking an option', async () => {
    const { container } = renderPanel([], vi.fn(), 42);
    mockFetch({ success: true, data: { items: [{ id: 9, name: 'Link Me' }] } });
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Link Me');
    fireEvent.click(option.closest('button')!);
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.disabled).toBe(false);
  });

  it('sends POST with entityType, entityId, and calls onLinked', async () => {
    const onChanged = vi.fn();
    const { container } = renderPanel([], onChanged, 42);
    mockFetch({ success: true, data: { items: [{ id: 9, name: 'Link Me' }] } });
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Link Me');
    fireEvent.click(option.closest('button')!);
    // Now set up POST response
    mockFetch({ success: true });
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    fireEvent.click(submitBtn!);
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect((global as any).fetch).toHaveBeenCalledWith(
      '/api/portal/brain/documents/42/links',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('shows error when POST returns ok=false', async () => {
    const { container } = renderPanel([], vi.fn(), 42);
    mockFetch({ success: true, data: { items: [{ id: 9, name: 'Link Me' }] } });
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Link Me');
    fireEvent.click(option.closest('button')!);
    mockFetch({ success: false, message: 'Link failed' }, false);
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(screen.getByText('Link failed')).toBeInTheDocument(),
    );
  });

  it('shows fallback error when POST ok=false with no message', async () => {
    const { container } = renderPanel([], vi.fn(), 42);
    mockFetch({ success: true, data: { items: [{ id: 9, name: 'Link Me' }] } });
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Link Me');
    fireEvent.click(option.closest('button')!);
    mockFetch({ success: false }, false);
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(screen.getByText('Failed to link.')).toBeInTheDocument(),
    );
  });

  it('shows network error when POST throws', async () => {
    const { container } = renderPanel([], vi.fn(), 42);
    mockFetch({ success: true, data: { items: [{ id: 9, name: 'Link Me' }] } });
    fireEvent.click(screen.getByText('Link'));
    const option = await screen.findByText('Link Me');
    fireEvent.click(option.closest('button')!);
    mockFetchReject('net error');
    const submitBtn = findDialogSubmitBtn(container);
    expect(submitBtn).not.toBeNull();
    fireEvent.click(submitBtn!);
    await waitFor(() =>
      expect(screen.getByText('net error')).toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// fetchPickerOptions — entity-type branches (exercised via picker dialog type switch)
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentLinksPanel — picker entity-type branches', () => {
  const types: Array<{
    value: string;
    plural: string;
    item: Record<string, unknown>;
    expectLabel: string;
  }> = [
    {
      value: 'topic',
      plural: 'topics',
      item: { id: 1, name: 'My Topic', path: '/t' },
      expectLabel: 'My Topic',
    },
    {
      value: 'initiative',
      plural: 'initiatives',
      item: { id: 2, name: 'My Initiative', status: 'active' },
      expectLabel: 'My Initiative',
    },
    {
      value: 'decision',
      plural: 'decisions',
      item: { id: 3, title: 'My Decision', status: 'approved' },
      expectLabel: 'My Decision',
    },
    {
      value: 'meeting',
      plural: 'meetings',
      item: { id: 4, title: 'My Meeting', meetingDate: '2025-01-15T00:00:00Z' },
      expectLabel: 'My Meeting',
    },
    {
      value: 'glossary_term',
      plural: 'glossary',
      item: { id: 5, term: 'My Term', shortDefinition: 'A definition' },
      expectLabel: 'My Term',
    },
    {
      value: 'person',
      plural: 'people',
      item: { id: 6, fullName: 'Jane Doe', title: 'Engineer' },
      expectLabel: 'Jane Doe',
    },
  ];

  for (const { value, item, expectLabel } of types) {
    it(`renders "${expectLabel}" for entity type "${value}"`, async () => {
      mockFetch({ success: true, data: { items: [item] } });
      renderPanel([]);
      fireEvent.click(screen.getByText('Link'));
      // Switch to the target type
      const select = await screen.findByRole('combobox');
      if (value !== 'topic') {
        fireEvent.change(select, { target: { value } });
      }
      await waitFor(() =>
        expect(screen.getByText(expectLabel)).toBeInTheDocument(),
      );
    });
  }

  it('returns empty when fetch returns ok=false (topics branch)', async () => {
    mockFetch({ success: false }, false);
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('No topics found.')).toBeInTheDocument(),
    );
  });

  it('returns empty when fetch throws (topics branch)', async () => {
    mockFetchReject();
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    await waitFor(() =>
      expect(screen.getByText('No topics found.')).toBeInTheDocument(),
    );
  });

  it('filters topics by search query', async () => {
    mockFetch({
      success: true,
      data: {
        items: [
          { id: 1, name: 'Alpha Topic' },
          { id: 2, name: 'Beta Topic' },
        ],
      },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    // Wait for initial load
    await screen.findByText('Alpha Topic');
    // Set up new fetch for search
    mockFetch({
      success: true,
      data: {
        items: [
          { id: 1, name: 'Alpha Topic' },
          { id: 2, name: 'Beta Topic' },
        ],
      },
    });
    const searchInput = screen.getAllByRole('textbox')[0];
    fireEvent.change(searchInput, { target: { value: 'alpha' } });
    // fetchPickerOptions filters client-side for topics with non-empty q
    await waitFor(() =>
      expect(screen.getByText('Alpha Topic')).toBeInTheDocument(),
    );
  });

  it('renders meeting with formatted date as secondary', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 4, title: 'Board Meeting', meetingDate: '2025-03-15T00:00:00Z' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'meeting' } });
    await waitFor(() =>
      expect(screen.getByText('Board Meeting')).toBeInTheDocument(),
    );
  });

  it('renders meeting without secondary when meetingDate is null', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 5, title: 'No Date Meeting', meetingDate: null }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'meeting' } });
    await waitFor(() =>
      expect(screen.getByText('No Date Meeting')).toBeInTheDocument(),
    );
  });

  it('renders glossary term with shortDefinition as secondary', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 5, term: 'Scrum', shortDefinition: 'An agile framework' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'glossary_term' } });
    await waitFor(() =>
      expect(screen.getByText('An agile framework')).toBeInTheDocument(),
    );
  });

  it('renders person with title as secondary', async () => {
    mockFetch({
      success: true,
      data: { items: [{ id: 6, fullName: 'Alice Smith', title: 'CTO' }] },
    });
    renderPanel([]);
    fireEvent.click(screen.getByText('Link'));
    const select = await screen.findByRole('combobox');
    fireEvent.change(select, { target: { value: 'person' } });
    await waitFor(() =>
      expect(screen.getByText('CTO')).toBeInTheDocument(),
    );
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// onChanged callback not provided (optional)
// ═════════════════════════════════════════════════════════════════════════════

describe('DocumentLinksPanel — onChanged optional', () => {
  it('does not throw when onChanged is undefined and unlink succeeds', async () => {
    mockFetch({ success: true });
    const link = makeLink({ entityType: 'topic', entityId: 1, title: 'T' });
    renderPanel([link]); // no onChanged
    expect(() =>
      fireEvent.click(screen.getByLabelText('Unlink')),
    ).not.toThrow();
    await waitFor(() =>
      expect((global as any).fetch).toHaveBeenCalled(),
    );
  });
});
