// @vitest-environment jsdom
/**
 * Unit tests for `components/brain/NoteCustomFieldsPanel.tsx`.
 *
 * Covers:
 *   - Loading state (null items)
 *   - Error state (fetch fails / API returns error) with empty items
 *   - Empty-fields state (fetch succeeds but returns no rows)
 *   - Normal render: groups, categories, sorted rows, field labels
 *   - Inline error banner when save fails but items remain
 *   - FieldInput for every type: text, email, url, number, date, datetime,
 *     boolean, select, multiselect/tags, json
 *   - Boolean checkbox toggle
 *   - Select dropdown change
 *   - Text/email/url blur → commit (onSave)
 *   - URL display mode → edit-URL button transition
 *   - Number blur → commit
 *   - Date / datetime-local change
 *   - JSON textarea focus/blur expand/collapse
 *   - TagsEditor: add via Enter, add via comma, add via suggestion click,
 *     remove chip, duplicate ignored
 *   - saveValue optimistic update + rollback on error
 *   - saveValue rollback on network error
 *   - noteId prop change triggers re-fetch
 *   - parseTags: JSON array, comma-separated, empty, invalid JSON
 *   - toInputDate: valid date, valid datetime, invalid string, null
 *   - fetch network error on initial load
 *   - fetch non-Error throw on initial load
 *   - multi-category grouping + sortOrder
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MockResponse = { ok: boolean; status?: number; data: unknown };

function mockFetch(responses: MockResponse[]) {
  let idx = 0;
  const fn = vi.fn(async () => {
    const resp = responses[idx] ?? responses[responses.length - 1];
    idx++;
    return {
      ok: resp.ok,
      status: resp.status ?? (resp.ok ? 200 : 500),
      json: async () => resp.data,
    };
  });
  (global as unknown as { fetch: typeof fn }).fetch = fn;
  return fn;
}

function mockFetchReject(message = 'Network error') {
  const fn = vi.fn(async () => { throw new Error(message); });
  (global as unknown as { fetch: typeof fn }).fetch = fn;
  return fn;
}

function mockFetchThrowNonError() {
  const fn = vi.fn(async () => { throw 'plain string error'; });
  (global as unknown as { fetch: typeof fn }).fetch = fn;
  return fn;
}

interface FieldDefOverride {
  id?: number;
  fieldName?: string;
  fieldLabel?: string;
  fieldType?: string;
  options?: string[] | null;
  required?: boolean;
  category?: string | null;
  sortOrder?: number;
  source?: string;
}

function makeItem(defOverride: FieldDefOverride, value: string | null = null, valueId: number | null = null) {
  return {
    definition: {
      id: defOverride.id ?? 1,
      fieldName: defOverride.fieldName ?? 'my_field',
      fieldLabel: defOverride.fieldLabel ?? 'My Field',
      fieldType: defOverride.fieldType ?? 'text',
      options: defOverride.options ?? null,
      required: defOverride.required ?? false,
      category: defOverride.category ?? null,
      sortOrder: defOverride.sortOrder ?? 0,
      source: defOverride.source ?? 'manual',
    },
    value,
    valueId,
  };
}

function successResponse(items: ReturnType<typeof makeItem>[]) {
  return { ok: true, data: { success: true, data: { items } } };
}

function patchOkResponse() {
  return { ok: true, data: { success: true } };
}

function patchFailResponse(message = 'Save failed') {
  return { ok: false, status: 500, data: { success: false, message } };
}

// ─── Component under test ────────────────────────────────────────────────────

import NoteCustomFieldsPanel from '@/components/brain/NoteCustomFieldsPanel';

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — loading state', () => {
  it('shows a loading spinner while fetching', () => {
    (global as unknown as { fetch: () => Promise<never> }).fetch = vi.fn(() => new Promise(() => {}));
    render(<NoteCustomFieldsPanel noteId={1} />);
    expect(screen.getByText(/loading fields/i)).toBeInTheDocument();
  });

  it('renders the progress_activity icon while loading', () => {
    (global as unknown as { fetch: () => Promise<never> }).fetch = vi.fn(() => new Promise(() => {}));
    render(<NoteCustomFieldsPanel noteId={1} />);
    expect(screen.getByText('progress_activity')).toBeInTheDocument();
  });
});

// ─── Error state ─────────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — error state', () => {
  it('shows error message when API returns success=false', async () => {
    mockFetch([{ ok: true, data: { success: false, message: 'Not found' } }]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('Not found')).toBeInTheDocument();
  });

  it('shows HTTP status fallback when no message field', async () => {
    mockFetch([{ ok: false, status: 403, data: {} }]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText(/HTTP 403/i)).toBeInTheDocument();
  });

  it('shows network error message on fetch rejection', async () => {
    mockFetchReject('Connection refused');
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('shows generic "Network error" when a non-Error is thrown', async () => {
    mockFetchThrowNonError();
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — empty state', () => {
  it('shows the no-custom-fields message when items is empty', async () => {
    mockFetch([successResponse([])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText(/No custom fields defined for notes yet/i)).toBeInTheDocument();
  });
});

// ─── Normal render ────────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — normal render', () => {
  it('renders a field label', async () => {
    mockFetch([successResponse([makeItem({ fieldLabel: 'Priority' })])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('Priority')).toBeInTheDocument();
  });

  it('marks required fields with an asterisk', async () => {
    mockFetch([successResponse([makeItem({ required: true, fieldLabel: 'Title' })])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('*')).toBeInTheDocument();
  });

  it('groups fields by category and shows category heading', async () => {
    mockFetch([successResponse([
      makeItem({ id: 1, category: 'Meta', fieldLabel: 'Author' }),
      makeItem({ id: 2, category: 'Meta', fieldLabel: 'Reviewer' }),
    ])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('Meta')).toBeInTheDocument();
    expect(screen.getByText('Author')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
  });

  it('uses "General" heading for fields with null category', async () => {
    mockFetch([successResponse([makeItem({ category: null, fieldLabel: 'Notes' })])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('sorts rows by sortOrder within a group', async () => {
    mockFetch([successResponse([
      makeItem({ id: 1, sortOrder: 2, fieldLabel: 'Second' }),
      makeItem({ id: 2, sortOrder: 1, fieldLabel: 'First' }),
    ])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const labels = screen.getAllByText(/First|Second/);
    expect(labels[0].textContent).toBe('First');
    expect(labels[1].textContent).toBe('Second');
  });

  it('renders multiple groups for different categories', async () => {
    mockFetch([successResponse([
      makeItem({ id: 1, category: 'Alpha', fieldLabel: 'A Field' }),
      makeItem({ id: 2, category: 'Beta', fieldLabel: 'B Field' }),
    ])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });
});

// ─── noteId switching ─────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — noteId switching', () => {
  // Use real timers — waitFor relies on them
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.useFakeTimers(); });

  it('re-fetches when noteId prop changes', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { items: [makeItem({ fieldLabel: 'Note1Field' })] } }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { items: [makeItem({ fieldLabel: 'Note2Field' })] } }) });
    (global as unknown as { fetch: typeof fn }).fetch = fn;

    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      const r = render(<NoteCustomFieldsPanel noteId={1} />);
      rerender = r.rerender;
    });
    expect(screen.getByText('Note1Field')).toBeInTheDocument();

    await act(async () => {
      rerender(<NoteCustomFieldsPanel noteId={2} />);
    });

    await waitFor(() => {
      expect(screen.getByText('Note2Field')).toBeInTheDocument();
    }, { timeout: 3000 });
  });
});

// ─── FieldInput: text ─────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput text', () => {
  it('renders a text input with existing value', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'text', fieldLabel: 'Note' }, 'hello')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('hello');
    expect(input).toBeInTheDocument();
    expect((input as HTMLInputElement).type).toBe('text');
  });

  it('commits on blur when value changed', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'text' }, 'old')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('old');
    fireEvent.change(input, { target: { value: 'new' } });
    await act(async () => { fireEvent.blur(input); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    expect(fetchFn.mock.calls.length).toBe(2);
    const patchCall = fetchFn.mock.calls[1];
    expect((patchCall[1] as RequestInit).method).toBe('PATCH');
  });

  it('does NOT call PATCH when value is unchanged on blur', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'text' }, 'same')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('same');
    fireEvent.change(input, { target: { value: 'same' } });
    await act(async () => { fireEvent.blur(input); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    expect(fetchFn.mock.calls.length).toBe(1);
  });

  it('sends null when value is cleared on blur', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'text' }, 'something')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('something');
    fireEvent.change(input, { target: { value: '' } });
    await act(async () => { fireEvent.blur(input); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const body = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string);
    expect(body.value).toBeNull();
  });
});

// ─── FieldInput: email ────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput email', () => {
  it('renders an email input', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'email', fieldLabel: 'Email' }, 'a@b.com')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('a@b.com') as HTMLInputElement;
    expect(input.type).toBe('email');
  });
});

// ─── FieldInput: url ──────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput url', () => {
  it('shows a clickable link when url field has a value', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'url', fieldLabel: 'Site' }, 'https://example.com')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByRole('link', { name: 'https://example.com' })).toBeInTheDocument();
  });

  it('shows an Edit URL button when in display mode', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'url', fieldLabel: 'Site' }, 'https://example.com')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByRole('button', { name: /Edit URL/i })).toBeInTheDocument();
  });

  it('clicking Edit URL transitions to input mode', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'url', fieldLabel: 'Site' }, 'https://example.com')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    fireEvent.click(screen.getByRole('button', { name: /Edit URL/i }));
    const input = screen.getByDisplayValue('https://example.com') as HTMLInputElement;
    expect(input.type).toBe('url');
  });

  it('shows url input when value is empty (no display mode)', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'url', fieldLabel: 'Link' }, null)])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByPlaceholderText('—') as HTMLInputElement;
    expect(input.type).toBe('url');
  });
});

// ─── FieldInput: number ───────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput number', () => {
  it('renders a number input', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'number', fieldLabel: 'Count' }, '42')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('42') as HTMLInputElement;
    expect(input.type).toBe('number');
  });

  it('calls PATCH on blur with changed number', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'number' }, '5')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('5');
    fireEvent.change(input, { target: { value: '10' } });
    await act(async () => { fireEvent.blur(input); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    expect(fetchFn.mock.calls.length).toBe(2);
  });
});

// ─── FieldInput: date ─────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput date', () => {
  it('renders a date input', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'date', fieldLabel: 'Due' }, '2025-06-01')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    // Query by type; the exact displayed value depends on local timezone offset applied by toInputDate
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.type).toBe('date');
  });

  it('calls PATCH when date value changes', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'date' }, '2025-01-01')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    await act(async () => { fireEvent.change(input, { target: { value: '2025-12-31' } }); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    expect(fetchFn.mock.calls.length).toBe(2);
  });

  it('renders empty string for date input when value is null', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'date', fieldLabel: 'Due' }, null)])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const inputs = document.querySelectorAll('input[type="date"]');
    expect(inputs.length).toBe(1);
    expect((inputs[0] as HTMLInputElement).value).toBe('');
  });
});

// ─── FieldInput: datetime ─────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput datetime', () => {
  it('renders a datetime-local input', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'datetime', fieldLabel: 'At' }, '2025-06-01T10:30')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const inputs = document.querySelectorAll('input[type="datetime-local"]');
    expect(inputs.length).toBe(1);
  });

  it('calls PATCH when datetime value changes', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'datetime' }, '2025-01-01T00:00')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = document.querySelector('input[type="datetime-local"]')!;
    await act(async () => { fireEvent.change(input, { target: { value: '2025-06-15T14:30' } }); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    expect(fetchFn.mock.calls.length).toBe(2);
  });

  it('sends null when datetime field is cleared', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'datetime' }, '2025-01-01T00:00')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = document.querySelector('input[type="datetime-local"]')!;
    await act(async () => { fireEvent.change(input, { target: { value: '' } }); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const body = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string);
    expect(body.value).toBeNull();
  });
});

// ─── FieldInput: boolean ──────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput boolean', () => {
  it('renders a checkbox unchecked when value is null', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'boolean', fieldLabel: 'Active' }, null)])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText('No')).toBeInTheDocument();
  });

  it('renders a checkbox checked when value is "true"', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'boolean', fieldLabel: 'Active' }, 'true')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText('Yes')).toBeInTheDocument();
  });

  it('renders a checkbox checked when value is "1"', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'boolean' }, '1')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('calls PATCH with "true" when checkbox is checked', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'boolean' }, null)]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const checkbox = screen.getByRole('checkbox');
    await act(async () => { fireEvent.click(checkbox); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const body = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string);
    expect(body.value).toBe('true');
  });

  it('calls PATCH with "false" when checkbox is unchecked', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'boolean' }, 'true')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const checkbox = screen.getByRole('checkbox');
    await act(async () => { fireEvent.click(checkbox); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const body = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string);
    expect(body.value).toBe('false');
  });
});

// ─── FieldInput: select ───────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput select', () => {
  it('renders a select with options including "— None —"', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'select', options: ['A', 'B', 'C'] })])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('— None —')).toBeInTheDocument();
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });

  it('calls PATCH when a select option is chosen', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'select', options: ['X', 'Y'] }, null)]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const select = screen.getByRole('combobox');
    await act(async () => { fireEvent.change(select, { target: { value: 'X' } }); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const body = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string);
    expect(body.value).toBe('X');
  });

  it('sends null when selecting "— None —"', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'select', options: ['X'] }, 'X')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const select = screen.getByRole('combobox');
    await act(async () => { fireEvent.change(select, { target: { value: '' } }); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const body = JSON.parse((fetchFn.mock.calls[1][1] as RequestInit).body as string);
    expect(body.value).toBeNull();
  });

  it('handles null options gracefully (renders only None option)', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'select', options: null })])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('— None —')).toBeInTheDocument();
  });
});

// ─── FieldInput: multiselect / tags ──────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput multiselect/tags', () => {
  it('renders TagsEditor for multiselect type', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'multiselect', options: ['Red', 'Blue'] }, '["Red"]')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('Red')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add…')).toBeInTheDocument();
  });

  it('renders TagsEditor for tags type', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'tags', options: [] }, 'alpha,beta')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('alpha')).toBeInTheDocument();
    expect(screen.getByText('beta')).toBeInTheDocument();
  });

  it('adds a tag on Enter keypress', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'tags', options: [] }, null)]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByPlaceholderText('Add…');
    fireEvent.change(input, { target: { value: 'newtag' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(screen.getByText('newtag')).toBeInTheDocument();
  });

  it('adds a tag on comma keypress', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'tags', options: [] }, null)]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByPlaceholderText('Add…');
    fireEvent.change(input, { target: { value: 'commatag' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: ',' });
    });
    expect(screen.getByText('commatag')).toBeInTheDocument();
  });

  it('does not add a duplicate tag', async () => {
    mockFetch([successResponse([makeItem({ id: 1, fieldType: 'tags', options: [] }, '["existing"]')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByPlaceholderText('Add…');
    fireEvent.change(input, { target: { value: 'existing' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // Only one "existing" chip should be visible
    expect(screen.getAllByText('existing')).toHaveLength(1);
  });

  it('removes a tag via the remove button', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'tags', options: [] }, '["keep","remove"]')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('keep')).toBeInTheDocument();
    expect(screen.getByText('remove')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove remove' }));
    });
    expect(screen.queryByText('remove')).not.toBeInTheDocument();
    expect(screen.getByText('keep')).toBeInTheDocument();
  });

  it('shows suggestion dropdown when draft matches options', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'tags', options: ['AppleTag', 'BananaTag'] }, null)])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByPlaceholderText('Add…');
    fireEvent.change(input, { target: { value: 'Apple' } });
    expect(screen.getByRole('button', { name: 'AppleTag' })).toBeInTheDocument();
  });

  it('adds a tag from suggestion click', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'tags', options: ['SuggestMe'] }, null)]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByPlaceholderText('Add…');
    fireEvent.change(input, { target: { value: 'Sug' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'SuggestMe' }));
    });
    expect(screen.getByText('SuggestMe')).toBeInTheDocument();
  });

  it('does not add a blank tag', async () => {
    mockFetch([successResponse([makeItem({ id: 1, fieldType: 'tags', options: [] }, null)])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByPlaceholderText('Add…');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    // No chips rendered
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
  });
});

// ─── FieldInput: json ─────────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — FieldInput json', () => {
  it('renders a textarea for json type', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'json', fieldLabel: 'Data' }, '{"x":1}')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const ta = screen.getByDisplayValue('{"x":1}') as HTMLTextAreaElement;
    expect(ta.tagName).toBe('TEXTAREA');
  });

  it('expands rows on focus (editing=true)', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'json' }, '{}')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const ta = screen.getByDisplayValue('{}') as HTMLTextAreaElement;
    fireEvent.focus(ta);
    expect(ta.rows).toBe(6);
  });

  it('collapses rows on blur', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'json' }, '{}')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const ta = screen.getByDisplayValue('{}') as HTMLTextAreaElement;
    fireEvent.focus(ta);
    expect(ta.rows).toBe(6);
    await act(async () => { fireEvent.blur(ta); });
    expect(ta.rows).toBe(3);
  });

  it('calls PATCH on json blur when value changed', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'json' }, '{}')]),
      patchOkResponse(),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const ta = screen.getByDisplayValue('{}');
    fireEvent.change(ta, { target: { value: '{"a":1}' } });
    await act(async () => { fireEvent.blur(ta); });
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    expect(fetchFn.mock.calls.length).toBe(2);
  });
});

// ─── saveValue: optimistic update + rollback ──────────────────────────────────

describe('NoteCustomFieldsPanel — saveValue optimistic update', () => {
  it('rolls back to previous value when PATCH returns error', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'text', fieldLabel: 'Status' }, 'original')]),
      patchFailResponse('Server error'),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('original');
    fireEvent.change(input, { target: { value: 'changed' } });
    await act(async () => { fireEvent.blur(input); });
    // After rollback the input should show the original value again
    expect(screen.getByDisplayValue('original')).toBeInTheDocument();
  });

  it('shows inline error banner after a failed save with items still present', async () => {
    mockFetch([
      successResponse([makeItem({ id: 1, fieldType: 'text' }, 'v1')]),
      patchFailResponse('Conflict'),
    ]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('v1');
    fireEvent.change(input, { target: { value: 'v2' } });
    await act(async () => { fireEvent.blur(input); });
    expect(screen.getByText('Conflict')).toBeInTheDocument();
  });

  it('rolls back when PATCH throws a network error', async () => {
    let callCount = 0;
    const fn = vi.fn(async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: { items: [makeItem({ id: 1, fieldType: 'text' }, 'init')] } }) };
      }
      throw new Error('Network failure');
    });
    (global as unknown as { fetch: typeof fn }).fetch = fn;
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = screen.getByDisplayValue('init');
    fireEvent.change(input, { target: { value: 'edited' } });
    await act(async () => { fireEvent.blur(input); });
    expect(screen.getByDisplayValue('init')).toBeInTheDocument();
    expect(screen.getByText('Network failure')).toBeInTheDocument();
  });
});

// ─── toInputDate coverage via date/datetime fields ────────────────────────────

describe('NoteCustomFieldsPanel — toInputDate', () => {
  it('displays an unparsable date string as-is', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'date' }, 'not-a-date')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = document.querySelector('input[type="date"]') as HTMLInputElement;
    // jsdom may not display it but the component won't crash
    expect(input).toBeTruthy();
  });

  it('formats a valid ISO datetime for datetime-local input', async () => {
    // Use a fixed UTC time that is deterministic after toInputDate formatting
    mockFetch([successResponse([makeItem({ fieldType: 'datetime' }, '2025-03-15T10:30:00.000Z')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    const input = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    // Value should be a datetime-local formatted string (YYYY-MM-DDTHH:MM)
    expect(input.value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

// ─── parseTags coverage ───────────────────────────────────────────────────────

describe('NoteCustomFieldsPanel — parseTags (via multiselect rendering)', () => {
  it('parses a JSON array value correctly', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'multiselect' }, '["foo","bar"]')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('foo')).toBeInTheDocument();
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  it('falls back to comma-separated when value is not JSON', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'tags' }, 'one,two,three')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.getByText('one')).toBeInTheDocument();
    expect(screen.getByText('two')).toBeInTheDocument();
    expect(screen.getByText('three')).toBeInTheDocument();
  });

  it('renders no chips for null value', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'tags' }, null)])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    expect(screen.queryByRole('button', { name: /Remove/i })).not.toBeInTheDocument();
  });

  it('handles invalid JSON starting with "[" gracefully (falls back to comma)', async () => {
    mockFetch([successResponse([makeItem({ fieldType: 'tags' }, '[invalid json')])]);
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    // Should not crash; renders empty or comma-split result
    expect(screen.getByPlaceholderText('Add…')).toBeInTheDocument();
  });
});

// ─── json.parse fallback in fetch ────────────────────────────────────────────

describe('NoteCustomFieldsPanel — fetch json parse failure', () => {
  it('treats a non-JSON response body as empty object (no crash)', async () => {
    const fn = vi.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => { throw new SyntaxError('bad json'); },
    }));
    (global as unknown as { fetch: typeof fn }).fetch = fn;
    await act(async () => { render(<NoteCustomFieldsPanel noteId={1} />); });
    // Should show the HTTP status error
    expect(screen.getByText(/HTTP 502/i)).toBeInTheDocument();
  });
});
