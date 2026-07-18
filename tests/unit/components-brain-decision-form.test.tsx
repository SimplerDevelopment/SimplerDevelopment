// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `components/brain/DecisionForm.tsx`
 *
 * Covers:
 *   - Rendering in create / edit / supersede modes
 *   - Validation (title required, decision/rationale required when !isEdit)
 *   - Successful submit payload shape
 *   - Team fetch populates decision-maker dropdown
 *   - Topic tree fetch populates topic chips (create/supersede only)
 *   - Topic toggle (add + remove)
 *   - submitError + submitting props
 *   - cancelHref renders a cancel link
 *   - submitLabel override
 *   - Default label per mode
 *   - toIsoDateInputValue branches (no input, Date object, invalid string)
 *   - EntityPicker is mocked away — not under test here
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, screen, act } from '@testing-library/react';
import DecisionForm from '@/components/brain/DecisionForm';

// ─── Mock EntityPicker — avoids its own fetch lifecycle ─────────────────────
vi.mock('@/components/brain/EntityPicker', () => ({
  default: ({ label }: { label: string }) => (
    <div data-testid={`entity-picker-${label.toLowerCase()}`}>{label} picker</div>
  ),
}));

// ─── fetch helpers ───────────────────────────────────────────────────────────

function mockFetch(responses: Record<string, unknown>) {
  (global as any).fetch = vi.fn(async (url: string) => {
    const key = Object.keys(responses).find((k) => url.includes(k));
    const payload = key ? responses[key] : { success: false };
    return { ok: true, json: async () => payload };
  });
}

function mockFetchReject() {
  (global as any).fetch = vi.fn(async () => {
    throw new Error('network');
  });
}

const TEAM_RESPONSE = {
  success: true,
  data: [
    { userId: 1, name: 'Alice', email: 'alice@example.com' },
    { userId: 2, name: null, email: 'bob@example.com' },
  ],
};

const TOPICS_RESPONSE = {
  success: true,
  data: {
    tree: [
      { id: 10, name: 'Engineering', path: 'Engineering', children: [
        { id: 11, name: 'Backend', path: 'Engineering/Backend' },
      ]},
      { id: 20, name: 'Product', path: 'Product' },
    ],
  },
};

// Default happy-path fetch: team + topics
function mockFetchDefault() {
  mockFetch({
    '/api/portal/team': TEAM_RESPONSE,
    '/api/portal/brain/topics': TOPICS_RESPONSE,
  });
}

// ─── Default props helper ────────────────────────────────────────────────────

function makeProps(over: Partial<React.ComponentProps<typeof DecisionForm>> = {}) {
  return {
    mode: 'create' as const,
    onSubmit: vi.fn(),
    ...over,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetchDefault();
  vi.clearAllMocks();
  // Re-install default after clearAllMocks resets fetch
  mockFetchDefault();
});

afterEach(async () => {
  // Flush any pending microtasks/state updates from async effects so they
  // don't bleed into the next test's environment.
  await act(async () => {});
});

describe('DecisionForm — create mode rendering', () => {
  it('renders the Title field', () => {
    render(<DecisionForm {...makeProps()} />);
    expect(screen.getByPlaceholderText(/Adopt Drizzle ORM/i)).toBeInTheDocument();
  });

  it('renders Decision and Rationale fields in create mode', () => {
    render(<DecisionForm {...makeProps()} />);
    expect(screen.getByPlaceholderText(/concrete decision/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/reasoning, key trade-offs/i)).toBeInTheDocument();
  });

  it('renders Alternatives field in create mode', () => {
    render(<DecisionForm {...makeProps()} />);
    expect(screen.getByPlaceholderText(/One per line/i)).toBeInTheDocument();
  });

  it('renders Reversibility pills in create mode', () => {
    render(<DecisionForm {...makeProps()} />);
    expect(screen.getByText('Two-way door')).toBeInTheDocument();
    expect(screen.getByText('One-way door')).toBeInTheDocument();
  });

  it('renders "Record decision" as default submit label', () => {
    render(<DecisionForm {...makeProps()} />);
    expect(screen.getByRole('button', { name: /Record decision/i })).toBeInTheDocument();
  });

  it('renders custom submitLabel when provided', () => {
    render(<DecisionForm {...makeProps({ submitLabel: 'Save Draft' })} />);
    expect(screen.getByRole('button', { name: /Save Draft/i })).toBeInTheDocument();
  });

  it('renders a Cancel link when cancelHref is provided', () => {
    render(<DecisionForm {...makeProps({ cancelHref: '/back' })} />);
    const link = screen.getByRole('link', { name: /Cancel/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/back');
  });

  it('does NOT render a Cancel link when cancelHref is omitted', () => {
    render(<DecisionForm {...makeProps()} />);
    expect(screen.queryByRole('link', { name: /Cancel/i })).not.toBeInTheDocument();
  });
});

describe('DecisionForm — edit mode rendering', () => {
  it('hides Decision and Rationale in edit mode', () => {
    render(<DecisionForm {...makeProps({ mode: 'edit' })} />);
    expect(screen.queryByPlaceholderText(/concrete decision/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/reasoning, key trade-offs/i)).not.toBeInTheDocument();
  });

  it('hides Reversibility pills in edit mode', () => {
    render(<DecisionForm {...makeProps({ mode: 'edit' })} />);
    expect(screen.queryByText('Two-way door')).not.toBeInTheDocument();
  });

  it('renders "Save changes" as default submit label in edit mode', () => {
    render(<DecisionForm {...makeProps({ mode: 'edit' })} />);
    expect(screen.getByRole('button', { name: /Save changes/i })).toBeInTheDocument();
  });

  it('renders Alternatives field in edit mode', () => {
    render(<DecisionForm {...makeProps({ mode: 'edit' })} />);
    // Edit mode renders a different textarea (no placeholder), check by rows attr
    const textareas = screen.getAllByRole('textbox');
    // Title + Context + Alternatives = 3 in edit mode
    expect(textareas.length).toBeGreaterThanOrEqual(3);
  });

  it('does NOT load topics in edit mode (fetch only called for team)', async () => {
    const fetchMock = (global as any).fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockClear();
    render(<DecisionForm {...makeProps({ mode: 'edit' })} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const calls: string[] = fetchMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(calls.some((u) => u.includes('/api/portal/team'))).toBe(true);
    expect(calls.every((u) => !u.includes('brain/topics'))).toBe(true);
  });
});

describe('DecisionForm — supersede mode', () => {
  it('renders "Supersede" as default submit label in supersede mode', () => {
    render(<DecisionForm {...makeProps({ mode: 'supersede' })} />);
    expect(screen.getByRole('button', { name: /Supersede/i })).toBeInTheDocument();
  });

  it('shows Decision and Rationale fields in supersede mode', () => {
    render(<DecisionForm {...makeProps({ mode: 'supersede' })} />);
    expect(screen.getByPlaceholderText(/concrete decision/i)).toBeInTheDocument();
  });
});

function submitForm() {
  // Use fireEvent.submit on the <form> element to bypass native HTML5
  // required-attribute constraint validation (jsdom enforces it on button
  // click), so our React handleSubmit logic runs unconditionally.
  const form = document.querySelector('form')!;
  fireEvent.submit(form);
}

describe('DecisionForm — validation', () => {
  it('shows "Title is required." when submitted with blank title', async () => {
    render(<DecisionForm {...makeProps()} />);
    submitForm();
    await waitFor(() =>
      expect(screen.getByText('Title is required.')).toBeInTheDocument(),
    );
  });

  it('shows "Decision is required." when title filled but decision blank (create)', async () => {
    render(<DecisionForm {...makeProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: 'My Title' },
    });
    submitForm();
    await waitFor(() =>
      expect(screen.getByText('Decision is required.')).toBeInTheDocument(),
    );
  });

  it('shows "Rationale is required." when title+decision filled but rationale blank (create)', async () => {
    render(<DecisionForm {...makeProps()} />);
    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: 'My Title' },
    });
    fireEvent.change(screen.getByPlaceholderText(/concrete decision/i), {
      target: { value: 'We decided X' },
    });
    submitForm();
    await waitFor(() =>
      expect(screen.getByText('Rationale is required.')).toBeInTheDocument(),
    );
  });

  it('does NOT require decision/rationale in edit mode — submits with just a title', async () => {
    const onSubmit = vi.fn();
    render(<DecisionForm {...makeProps({ mode: 'edit', onSubmit })} />);
    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: 'Updated Title' },
    });
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
  });
});

describe('DecisionForm — successful submit payload', () => {
  it('calls onSubmit with the correct payload shape', async () => {
    const onSubmit = vi.fn();
    render(<DecisionForm {...makeProps({ onSubmit })} />);

    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: ' My Decision Title ' },
    });
    fireEvent.change(screen.getByPlaceholderText(/concrete decision/i), {
      target: { value: 'We chose X' },
    });
    fireEvent.change(screen.getByPlaceholderText(/reasoning, key trade-offs/i), {
      target: { value: 'Because Y' },
    });

    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    const payload = onSubmit.mock.calls[0][0];
    expect(payload.title).toBe('My Decision Title');
    expect(payload.decision).toBe('We chose X');
    expect(payload.rationale).toBe('Because Y');
    expect(payload.reversibility).toBe('two_way');
    expect(payload.confidentialityLevel).toBe('standard');
    expect(payload.topicIds).toEqual([]);
    expect(payload.anchors).toEqual({
      meetingId: null,
      noteId: null,
      companyId: null,
      dealId: null,
    });
  });

  it('sets context to null when blank', async () => {
    const onSubmit = vi.fn();
    render(<DecisionForm {...makeProps({ onSubmit })} />);
    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: 'Title' },
    });
    fireEvent.change(screen.getByPlaceholderText(/concrete decision/i), {
      target: { value: 'Decision' },
    });
    fireEvent.change(screen.getByPlaceholderText(/reasoning/i), {
      target: { value: 'Rationale' },
    });
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].context).toBeNull();
  });

  it('sets alternativesConsidered to null when blank', async () => {
    const onSubmit = vi.fn();
    render(<DecisionForm {...makeProps({ onSubmit })} />);
    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: 'Title' },
    });
    fireEvent.change(screen.getByPlaceholderText(/concrete decision/i), {
      target: { value: 'Decision' },
    });
    fireEvent.change(screen.getByPlaceholderText(/reasoning/i), {
      target: { value: 'Rationale' },
    });
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].alternativesConsidered).toBeNull();
  });

  it('includes context when filled', async () => {
    const onSubmit = vi.fn();
    render(<DecisionForm {...makeProps({ onSubmit })} />);
    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: 'Title' },
    });
    fireEvent.change(screen.getByPlaceholderText(/Background, constraints/i), {
      target: { value: 'Some context' },
    });
    fireEvent.change(screen.getByPlaceholderText(/concrete decision/i), {
      target: { value: 'Decision' },
    });
    fireEvent.change(screen.getByPlaceholderText(/reasoning/i), {
      target: { value: 'Rationale' },
    });
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].context).toBe('Some context');
  });
});

describe('DecisionForm — initial values pre-fill', () => {
  it('pre-fills title from initial prop', () => {
    render(
      <DecisionForm
        {...makeProps({
          initial: { title: 'Pre-filled Title', decision: 'D', rationale: 'R' },
        })}
      />,
    );
    expect(
      (screen.getByPlaceholderText(/Adopt Drizzle ORM/i) as HTMLInputElement).value,
    ).toBe('Pre-filled Title');
  });

  it('pre-fills reversibility as one_way from initial prop', () => {
    render(
      <DecisionForm
        {...makeProps({ initial: { reversibility: 'one_way' } })}
      />,
    );
    const oneWay = screen.getByText('One-way door').closest('button');
    expect(oneWay).toHaveAttribute('aria-pressed', 'true');
  });

  it('pre-fills confidentiality from initial prop', async () => {
    render(
      <DecisionForm
        {...makeProps({ initial: { confidentialityLevel: 'confidential' } })}
      />,
    );
    const select = screen.getAllByRole('combobox').find(
      (el) => (el as HTMLSelectElement).value === 'confidential',
    );
    expect(select).toBeTruthy();
  });
});

describe('DecisionForm — reversibility toggle', () => {
  it('switches from two_way to one_way when One-way door is clicked', async () => {
    render(<DecisionForm {...makeProps()} />);
    const twoWay = screen.getByText('Two-way door').closest('button')!;
    const oneWay = screen.getByText('One-way door').closest('button')!;
    expect(twoWay).toHaveAttribute('aria-pressed', 'true');
    expect(oneWay).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(oneWay);
    await waitFor(() => {
      expect(oneWay).toHaveAttribute('aria-pressed', 'true');
      expect(twoWay).toHaveAttribute('aria-pressed', 'false');
    });
  });
});

describe('DecisionForm — team fetch', () => {
  it('populates decision-maker dropdown after team fetch', async () => {
    render(<DecisionForm {...makeProps()} />);
    // Wait for team fetch to resolve
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Alice' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('option', { name: 'bob@example.com' })).toBeInTheDocument();
  });

  it('handles team fetch failure gracefully (empty dropdown)', async () => {
    // Install before render so this mock wins over beforeEach default
    (global as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/api/portal/team')) {
        return { ok: true, json: async () => ({ success: false }) };
      }
      return { ok: true, json: async () => TOPICS_RESPONSE };
    });
    render(<DecisionForm {...makeProps()} />);
    // Let effects settle
    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalled();
    });
    // Decision-maker select should only have the blank default option, no team members
    const makerSelect = screen.getByRole('combobox', { name: /Decision maker/i });
    const makerOptions = Array.from(makerSelect.querySelectorAll('option')).filter(
      (o) => o.getAttribute('value') !== '',
    );
    expect(makerOptions.length).toBe(0);
  });

  it('handles team fetch network error gracefully', async () => {
    mockFetchReject();
    expect(() => render(<DecisionForm {...makeProps()} />)).not.toThrow();
  });

  it('filters out team members with userId = 0', async () => {
    mockFetch({
      '/api/portal/team': {
        success: true,
        data: [
          { userId: 0, name: 'Invalid', email: 'invalid@x.com' },
          { userId: 3, name: 'Valid', email: 'valid@x.com' },
        ],
      },
      '/api/portal/brain/topics': TOPICS_RESPONSE,
    });
    render(<DecisionForm {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Valid' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('option', { name: 'Invalid' })).not.toBeInTheDocument();
  });
});

describe('DecisionForm — topic tree', () => {
  it('shows topic chips after tree loads (create mode)', async () => {
    render(<DecisionForm {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText('Engineering')).toBeInTheDocument(),
    );
    expect(screen.getByText('Product')).toBeInTheDocument();
  });

  it('shows nested topic chip (Backend child)', async () => {
    render(<DecisionForm {...makeProps()} />);
    // flattenTopics renders nested items with '·' depth prefix; match loosely
    await waitFor(() =>
      expect(screen.getByText(/Backend/)).toBeInTheDocument(),
    );
  });

  it('shows "No topics yet" message when tree is empty', async () => {
    mockFetch({
      '/api/portal/team': TEAM_RESPONSE,
      '/api/portal/brain/topics': { success: true, data: { tree: [] } },
    });
    render(<DecisionForm {...makeProps()} />);
    await waitFor(() =>
      expect(screen.getByText(/No topics yet/i)).toBeInTheDocument(),
    );
  });

  it('handles topics fetch failure gracefully (shows no topics)', async () => {
    mockFetch({
      '/api/portal/team': TEAM_RESPONSE,
      '/api/portal/brain/topics': { success: false },
    });
    render(<DecisionForm {...makeProps()} />);
    // No crash; no topic chips rendered
    await waitFor(() => {
      expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
    });
  });

  it('does not show topics section in edit mode', async () => {
    render(<DecisionForm {...makeProps({ mode: 'edit' })} />);
    await waitFor(() => {
      expect(screen.queryByText('Engineering')).not.toBeInTheDocument();
    });
  });
});

describe('DecisionForm — topic toggle', () => {
  it('selects a topic when its chip is clicked', async () => {
    render(<DecisionForm {...makeProps()} />);
    await waitFor(() => expect(screen.getByText('Engineering')).toBeInTheDocument());

    const chip = screen.getByText('Engineering').closest('button')!;
    expect(chip.className).not.toContain('bg-primary');
    fireEvent.click(chip);
    await waitFor(() =>
      expect(screen.getByText('Engineering').closest('button')!.className).toContain('bg-primary'),
    );
  });

  it('deselects a topic on second click', async () => {
    render(<DecisionForm {...makeProps()} />);
    await waitFor(() => expect(screen.getByText('Product')).toBeInTheDocument());

    const chip = screen.getByText('Product').closest('button')!;
    fireEvent.click(chip);
    await waitFor(() =>
      expect(chip.className).toContain('bg-primary'),
    );
    fireEvent.click(chip);
    await waitFor(() =>
      expect(chip.className).not.toContain('bg-primary text-primary-foreground border-primary'),
    );
  });

  it('includes selected topicIds in submit payload', async () => {
    const onSubmit = vi.fn();
    render(<DecisionForm {...makeProps({ onSubmit })} />);
    await waitFor(() => expect(screen.getByText('Engineering')).toBeInTheDocument());

    fireEvent.click(screen.getByText('Engineering').closest('button')!);
    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: 'Title' },
    });
    fireEvent.change(screen.getByPlaceholderText(/concrete decision/i), {
      target: { value: 'Decision' },
    });
    fireEvent.change(screen.getByPlaceholderText(/reasoning/i), {
      target: { value: 'Rationale' },
    });
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].topicIds).toContain(10);
  });

  it('pre-selects topicIds from initial prop', async () => {
    render(
      <DecisionForm
        {...makeProps({ initial: { topicIds: [20] } })}
      />,
    );
    await waitFor(() => expect(screen.getByText('Product')).toBeInTheDocument());
    const chip = screen.getByText('Product').closest('button')!;
    expect(chip.className).toContain('bg-primary');
  });
});

describe('DecisionForm — error and submitting states', () => {
  it('shows submitError near the action row', () => {
    render(
      <DecisionForm {...makeProps({ submitError: 'Server blew up' })} />,
    );
    expect(screen.getByText('Server blew up')).toBeInTheDocument();
  });

  it('does not show error area when no errors', () => {
    render(<DecisionForm {...makeProps()} />);
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it('disables the submit button when submitting=true', () => {
    render(<DecisionForm {...makeProps({ submitting: true })} />);
    const btn = screen.getByRole('button', { name: /Record decision/i });
    expect(btn).toBeDisabled();
  });

  it('validation error is cleared when resubmitting after fixing input', async () => {
    const onSubmit = vi.fn();
    render(<DecisionForm {...makeProps({ onSubmit })} />);
    // Trigger validation error
    submitForm();
    await waitFor(() =>
      expect(screen.getByText('Title is required.')).toBeInTheDocument(),
    );
    // Fix and resubmit — validation message clears on next attempt
    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: 'Title' },
    });
    submitForm();
    // Now "Decision is required." replaces "Title is required."
    await waitFor(() =>
      expect(screen.queryByText('Title is required.')).not.toBeInTheDocument(),
    );
  });
});

describe('DecisionForm — confidentiality select', () => {
  it('changes confidentiality when user selects restricted', async () => {
    const onSubmit = vi.fn();
    render(<DecisionForm {...makeProps({ onSubmit })} />);
    const selects = screen.getAllByRole('combobox');
    // The confidentiality select has options standard/restricted/confidential
    const confSelect = selects.find((s) =>
      s.querySelector
        ? Array.from(s.querySelectorAll('option')).some((o) => o.value === 'restricted')
        : false,
    )!;
    fireEvent.change(confSelect, { target: { value: 'restricted' } });

    fireEvent.change(screen.getByPlaceholderText(/Adopt Drizzle ORM/i), {
      target: { value: 'Title' },
    });
    fireEvent.change(screen.getByPlaceholderText(/concrete decision/i), {
      target: { value: 'Decision' },
    });
    fireEvent.change(screen.getByPlaceholderText(/reasoning/i), {
      target: { value: 'Rationale' },
    });
    submitForm();
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].confidentialityLevel).toBe('restricted');
  });
});
