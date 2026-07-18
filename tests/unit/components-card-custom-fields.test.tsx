// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/card-detail/_sections/CardCustomFields.tsx`
 *
 * Covers:
 *  - Returns null when loading (no initialFields)
 *  - Returns null when fields is empty
 *  - Renders "Custom fields" heading when fields present
 *  - Shows "Saving…" indicator while flush is in flight
 *  - text field: renders value, onChange, onBlur flush
 *  - number field: renders value, onChange (number), empty → null
 *  - date field: renders value, onChange
 *  - url field: renders value, onChange, placeholder
 *  - checkbox field: checked/unchecked state, toggle triggers flush
 *  - select field: renders options, onChange triggers flush
 *  - multi_select field: toggle on/off, disabled state
 *  - required indicator (*) rendered when required=true
 *  - canEdit=false disables all inputs
 *  - standalone fetch path (no initialFields): calls correct endpoint
 *  - PUT is called on flush with correct payload
 *  - fetch failure in load() doesn't crash
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must precede component import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/portal/cards/1',
}));

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { CardCustomFields } from '@/components/portal/card-detail/_sections/CardCustomFields';
import type { CustomFieldValue } from '@/components/portal/card-detail/_lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Kind = 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'url' | 'checkbox';

function makeField(overrides: Partial<CustomFieldValue> & { kind: Kind }): CustomFieldValue {
  return {
    id: 1,
    key: 'field_key',
    name: 'Field Name',
    required: false,
    options: [],
    value: null,
    ...overrides,
  };
}

type FetchResponder = (url: string, init?: RequestInit) => unknown;

function installFetchMock(responder: FetchResponder) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = responder(url, init);
    return {
      json: async () => body,
    } as unknown as Response;
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).fetch = fetchMock;
  return fetchMock;
}

async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CardCustomFields', () => {
  beforeEach(() => {
    installFetchMock(() => ({ success: true, data: [] }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Loading / empty states
  // -------------------------------------------------------------------------

  it('renders nothing when initialFields is null (loading state)', () => {
    // initialFields=null triggers fetch; component returns null while loading
    const { container } = render(
      <CardCustomFields cardId={1} canEdit={true} initialFields={null} />,
    );
    // While loading is true, component returns null
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when initialFields is an empty array', () => {
    const { container } = render(
      <CardCustomFields cardId={1} canEdit={true} initialFields={[]} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the "Custom fields" heading when fields are provided', () => {
    const fields = [makeField({ id: 1, kind: 'text', name: 'Title', value: 'hello' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    expect(screen.getByText('Custom fields')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // text field
  // -------------------------------------------------------------------------

  it('renders text field with string value', () => {
    const fields = [makeField({ id: 1, kind: 'text', name: 'Note', value: 'initial value' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByDisplayValue('initial value') as HTMLInputElement;
    expect(input.type).toBe('text');
  });

  it('renders text field with empty string when value is not a string', () => {
    const fields = [makeField({ id: 1, kind: 'text', name: 'Note', value: null })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('text field onChange updates the local value', () => {
    const fields = [makeField({ id: 1, kind: 'text', name: 'Note', value: '' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new text' } });
    expect(input.value).toBe('new text');
  });

  it('text field onBlur triggers PUT flush', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({ id: 5, kind: 'text', name: 'Note', value: '' })];
    render(<CardCustomFields cardId={42} canEdit={true} initialFields={fields} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'typed' } });
    fireEvent.blur(input);
    await flush();
    const putCalls = fetchMock.mock.calls.filter(([url, init]) =>
      String(url).includes('/api/portal/cards/42/custom-fields') && (init as RequestInit)?.method === 'PUT',
    );
    expect(putCalls.length).toBeGreaterThan(0);
    const body = JSON.parse(putCalls[0][1]?.body as string);
    expect(body.values[0].fieldId).toBe(5);
    expect(body.values[0].value).toBe('typed');
  });

  it('text field is disabled when canEdit=false', () => {
    const fields = [makeField({ id: 1, kind: 'text', name: 'Note', value: 'x' })];
    render(<CardCustomFields cardId={1} canEdit={false} initialFields={fields} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // number field
  // -------------------------------------------------------------------------

  it('renders number field with numeric value', () => {
    const fields = [makeField({ id: 2, kind: 'number', name: 'Score', value: 42 })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByDisplayValue('42') as HTMLInputElement;
    expect(input.type).toBe('number');
  });

  it('renders number field with empty string when value is not a number', () => {
    const fields = [makeField({ id: 2, kind: 'number', name: 'Score', value: null })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.value).toBe('');
  });

  it('number field onChange converts string to number', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({ id: 3, kind: 'number', name: 'Score', value: 0 })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.blur(input);
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toBe(99);
  });

  it('number field onChange sends null when cleared', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({ id: 3, kind: 'number', name: 'Score', value: 10 })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toBeNull();
  });

  // -------------------------------------------------------------------------
  // date field
  // -------------------------------------------------------------------------

  it('renders date field with string value', () => {
    const fields = [makeField({ id: 4, kind: 'date', name: 'Due', value: '2026-05-15' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByDisplayValue('2026-05-15') as HTMLInputElement;
    expect(input.type).toBe('date');
  });

  it('date field onChange updates value', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({ id: 4, kind: 'date', name: 'Due', value: '2026-01-01' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByDisplayValue('2026-01-01') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '2026-06-01' } });
    fireEvent.blur(input);
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toBe('2026-06-01');
  });

  it('date field sends null when cleared', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({ id: 4, kind: 'date', name: 'Due', value: '2026-01-01' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByDisplayValue('2026-01-01') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.blur(input);
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toBeNull();
  });

  // -------------------------------------------------------------------------
  // url field
  // -------------------------------------------------------------------------

  it('renders url field with placeholder', () => {
    const fields = [makeField({ id: 5, kind: 'url', name: 'Website', value: '' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    expect(screen.getByPlaceholderText(/https:\/\//)).toBeTruthy();
  });

  it('url field shows string value', () => {
    const fields = [makeField({ id: 5, kind: 'url', name: 'Website', value: 'https://example.com' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    expect(screen.getByDisplayValue('https://example.com')).toBeTruthy();
  });

  it('url field onChange updates value and flush is called on blur', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({ id: 5, kind: 'url', name: 'Website', value: '' })];
    render(<CardCustomFields cardId={42} canEdit={true} initialFields={fields} />);
    const input = screen.getByPlaceholderText(/https:\/\//) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'https://test.com' } });
    fireEvent.blur(input);
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toBe('https://test.com');
  });

  // -------------------------------------------------------------------------
  // checkbox field
  // -------------------------------------------------------------------------

  it('renders checkbox field as unchecked when value is false', () => {
    const fields = [makeField({ id: 6, kind: 'checkbox', name: 'Active', value: false })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(screen.getByText('No')).toBeTruthy();
  });

  it('renders checkbox field as checked when value is true', () => {
    const fields = [makeField({ id: 6, kind: 'checkbox', name: 'Active', value: true })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    expect(screen.getByText('Yes')).toBeTruthy();
  });

  it('checkbox onChange toggles value and triggers flush', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({ id: 7, kind: 'checkbox', name: 'Active', value: false })];
    render(<CardCustomFields cardId={10} canEdit={true} initialFields={fields} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    await act(async () => {
      fireEvent.click(checkbox);
    });
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toBe(true);
  });

  it('checkbox is disabled when canEdit=false', () => {
    const fields = [makeField({ id: 6, kind: 'checkbox', name: 'Active', value: false })];
    render(<CardCustomFields cardId={1} canEdit={false} initialFields={fields} />);
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // select field
  // -------------------------------------------------------------------------

  it('renders select field with options', () => {
    const fields = [makeField({
      id: 8, kind: 'select', name: 'Priority', value: 'high',
      options: ['low', 'medium', 'high'],
    })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('high');
    // Options: blank + 3 values
    expect(select.options.length).toBe(4);
  });

  it('select field onChange sends null when blank option chosen and triggers flush', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({
      id: 9, kind: 'select', name: 'Status', value: 'active',
      options: ['active', 'inactive'],
    })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: '' } });
    });
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toBeNull();
  });

  it('select field onChange with non-blank value sends string', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({
      id: 9, kind: 'select', name: 'Status', value: '',
      options: ['active', 'inactive'],
    })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(select, { target: { value: 'active' } });
    });
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toBe('active');
  });

  it('select field is disabled when canEdit=false', () => {
    const fields = [makeField({ id: 8, kind: 'select', name: 'Priority', value: '', options: ['low'] })];
    render(<CardCustomFields cardId={1} canEdit={false} initialFields={fields} />);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.disabled).toBe(true);
  });

  // -------------------------------------------------------------------------
  // multi_select field
  // -------------------------------------------------------------------------

  it('renders multi_select field with option buttons', () => {
    const fields = [makeField({
      id: 10, kind: 'multi_select', name: 'Tags', value: ['alpha'],
      options: ['alpha', 'beta', 'gamma'],
    })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    expect(screen.getByText('alpha')).toBeTruthy();
    expect(screen.getByText('beta')).toBeTruthy();
    expect(screen.getByText('gamma')).toBeTruthy();
  });

  it('multi_select toggles on: clicking unselected option adds it', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({
      id: 11, kind: 'multi_select', name: 'Tags', value: ['alpha'],
      options: ['alpha', 'beta'],
    })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const betaBtn = screen.getByText('beta');
    await act(async () => {
      fireEvent.click(betaBtn);
    });
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toEqual(['alpha', 'beta']);
  });

  it('multi_select toggles off: clicking selected option removes it', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({
      id: 12, kind: 'multi_select', name: 'Tags', value: ['alpha', 'beta'],
      options: ['alpha', 'beta'],
    })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const alphaBtn = screen.getByText('alpha');
    await act(async () => {
      fireEvent.click(alphaBtn);
    });
    await flush();
    const putCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1]?.body as string);
    expect(body.values[0].value).toEqual(['beta']);
  });

  it('multi_select buttons are disabled when canEdit=false', () => {
    const fields = [makeField({
      id: 10, kind: 'multi_select', name: 'Tags', value: [],
      options: ['alpha', 'beta'],
    })];
    render(<CardCustomFields cardId={1} canEdit={false} initialFields={fields} />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Required indicator
  // -------------------------------------------------------------------------

  it('shows * required indicator when required=true', () => {
    const fields = [makeField({ id: 1, kind: 'text', name: 'Required Field', required: true, value: '' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    expect(screen.getByText('*')).toBeTruthy();
  });

  it('does not show * when required=false', () => {
    const fields = [makeField({ id: 1, kind: 'text', name: 'Optional', required: false, value: '' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    expect(screen.queryByText('*')).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Multiple fields rendered
  // -------------------------------------------------------------------------

  it('renders multiple fields of mixed types', () => {
    const fields: CustomFieldValue[] = [
      makeField({ id: 1, kind: 'text', name: 'Title', value: 'hello' }),
      makeField({ id: 2, kind: 'number', name: 'Score', value: 10 }),
      makeField({ id: 3, kind: 'checkbox', name: 'Done', value: false }),
    ];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    expect(screen.getByText('Title')).toBeTruthy();
    expect(screen.getByText('Score')).toBeTruthy();
    expect(screen.getByText('Done')).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Standalone fetch path (initialFields=null)
  // -------------------------------------------------------------------------

  it('calls the fetch endpoint when initialFields is null', async () => {
    const fields = [makeField({ id: 1, kind: 'text', name: 'Fetched', value: 'from api' })];
    const fetchMock = installFetchMock(() => ({ success: true, data: fields }));
    await act(async () => {
      render(<CardCustomFields cardId={99} canEdit={true} initialFields={null} />);
    });
    await flush();
    const getCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url) === '/api/portal/cards/99/custom-fields',
    );
    expect(getCalls.length).toBeGreaterThan(0);
  });

  it('stays empty when fetch returns success=false (no data field)', async () => {
    // Fetch succeeds at the HTTP level but returns success:false with no data
    installFetchMock(() => ({ success: false, message: 'Not found' }));
    const { container } = await act(async () =>
      render(<CardCustomFields cardId={1} canEdit={true} initialFields={null} />),
    );
    await flush();
    // success=false means setFields is never called; fields stays [], so returns null
    expect(container.firstChild).toBeNull();
  });

  it('does not call flush when dirtyRef is empty', async () => {
    const fetchMock = installFetchMock(() => ({ success: true }));
    const fields = [makeField({ id: 1, kind: 'text', name: 'Note', value: 'x' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    // Blur without changing — dirtyRef should be empty, no PUT issued
    fireEvent.blur(input);
    await flush();
    const putCalls = fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'PUT');
    expect(putCalls.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Saving indicator
  // -------------------------------------------------------------------------

  it('shows "Saving…" while PUT is in flight', async () => {
    let resolvePut: (v: unknown) => void;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = vi.fn((url: string, init?: RequestInit) => {
      if ((init as RequestInit | undefined)?.method === 'PUT') {
        return new Promise((r) => { resolvePut = r; });
      }
      return Promise.resolve({ json: async () => ({ success: true }) });
    });

    const fields = [makeField({ id: 1, kind: 'text', name: 'Note', value: '' })];
    render(<CardCustomFields cardId={1} canEdit={true} initialFields={fields} />);
    const input = screen.getByRole('textbox') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'new' } });

    act(() => {
      fireEvent.blur(input);
    });

    await waitFor(() => {
      expect(screen.queryByText('Saving…')).toBeTruthy();
    });

    // Resolve the PUT to clean up
    act(() => {
      resolvePut!({ json: async () => ({ success: true }) });
    });
    await flush();
  });
});
