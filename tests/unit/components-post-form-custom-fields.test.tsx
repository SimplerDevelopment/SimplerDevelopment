// @vitest-environment jsdom
/**
 * Unit tests for CustomFieldsSection (components/portal/post-form/sections/CustomFieldsSection.tsx).
 *
 * Covers:
 *   - Empty-state rendering.
 *   - The "Manage Fields" trigger button + modal mount/unmount.
 *   - Regular field rendering for every supported field type
 *     (text, textarea, number, date, select, checkbox, url, email, image).
 *   - Group rendering: header, child count pluralization, collapse/expand,
 *     child rendering, empty-group message, help text.
 *   - Repeater rendering: header, row count pluralization, collapse/expand,
 *     add row, remove row, sub-field updates (debounced save), empty
 *     repeater message, parsing of preexisting JSON values (and graceful
 *     fallback on invalid JSON / non-array JSON).
 *   - ManageCustomFieldsModal: loading spinner, post-type-not-found,
 *     successful fetch & list render, add-field form open/cancel, slug
 *     auto-derivation from name, field-type select gating for sub-fields,
 *     options textarea visibility, submit (POST), submit error path,
 *     network-error path, edit field (populates form), delete with confirm
 *     accept + reject, sub-field add via expand/add button, expanded
 *     sub-field list rendering, modal close via backdrop and Done button.
 *
 * fetch is fully mocked; MediaPicker is stubbed to a simple <input>.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor, cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void; label?: string; apiEndpoint?: string }) => (
    <input
      data-testid="media-picker"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

import { CustomFieldsSection } from '@/components/portal/post-form/sections/CustomFieldsSection';
import type { CustomFieldDef, ManagedField } from '@/components/portal/post-form/_lib/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDef(overrides: Partial<CustomFieldDef> & { id: number; name: string; slug: string; fieldType: string }): CustomFieldDef {
  return {
    parentId: null,
    options: null,
    required: false,
    defaultValue: null,
    helpText: null,
    ...overrides,
  };
}

function makeManagedField(overrides: Partial<ManagedField> & { id: number; name: string; slug: string; fieldType: string }): ManagedField {
  return {
    postTypeId: 1,
    parentId: null,
    options: null,
    required: false,
    defaultValue: null,
    helpText: null,
    order: 0,
    ...overrides,
  };
}

function renderSection(opts: {
  customFieldDefs?: CustomFieldDef[];
  customFieldValues?: Record<number, string>;
  updateCustomFieldValue?: (id: number, v: string) => void;
  showManageFieldsModal?: boolean;
  setShowManageFieldsModal?: (v: boolean) => void;
  setCustomFieldsLoaded?: (v: boolean) => void;
} = {}) {
  const updateCustomFieldValue = opts.updateCustomFieldValue ?? vi.fn();
  const setShowManageFieldsModal = opts.setShowManageFieldsModal ?? vi.fn();
  const setCustomFieldsLoaded = opts.setCustomFieldsLoaded ?? vi.fn();
  const utils = render(
    <CustomFieldsSection
      customFieldDefs={opts.customFieldDefs ?? []}
      customFieldValues={opts.customFieldValues ?? {}}
      updateCustomFieldValue={updateCustomFieldValue}
      siteId={42}
      postType="post"
      showManageFieldsModal={opts.showManageFieldsModal ?? false}
      setShowManageFieldsModal={setShowManageFieldsModal}
      setCustomFieldsLoaded={setCustomFieldsLoaded}
    />,
  );
  return { ...utils, updateCustomFieldValue, setShowManageFieldsModal, setCustomFieldsLoaded };
}

beforeEach(() => {
  // Default fetch stub — individual tests override via mockImplementation.
  global.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({ success: true, data: [] }),
  })) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// CustomFieldsSection - empty state + manage button
// ---------------------------------------------------------------------------

describe('CustomFieldsSection: top-level chrome', () => {
  it('renders empty state when no top-level defs are present', () => {
    renderSection({ customFieldDefs: [] });
    expect(screen.getByText('No custom fields defined yet.')).toBeTruthy();
    expect(screen.getByText(/Click .Manage Fields. above/)).toBeTruthy();
  });

  it('renders the Manage Fields trigger button', () => {
    renderSection();
    expect(screen.getByRole('button', { name: /Manage Fields/ })).toBeTruthy();
  });

  it('invokes setShowManageFieldsModal(true) when Manage Fields is clicked', () => {
    const setShow = vi.fn();
    renderSection({ setShowManageFieldsModal: setShow });
    fireEvent.click(screen.getByRole('button', { name: /Manage Fields/ }));
    expect(setShow).toHaveBeenCalledWith(true);
  });

  it('hides empty state when at least one top-level def exists', () => {
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Author', slug: 'author', fieldType: 'text' })],
    });
    expect(screen.queryByText('No custom fields defined yet.')).toBeNull();
    expect(screen.getByText('Author')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// renderFieldInput - every field type
// ---------------------------------------------------------------------------

describe('CustomFieldsSection: field type rendering', () => {
  it('renders a text input for fieldType=text and propagates onChange', () => {
    const update = vi.fn();
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Author', slug: 'author', fieldType: 'text', defaultValue: 'default-text' })],
      updateCustomFieldValue: update,
    });
    const input = screen.getByPlaceholderText('default-text') as HTMLInputElement;
    expect(input.type).toBe('text');
    fireEvent.change(input, { target: { value: 'Jane' } });
    expect(update).toHaveBeenCalledWith(1, 'Jane');
  });

  it('renders a textarea for fieldType=textarea', () => {
    const update = vi.fn();
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Bio', slug: 'bio', fieldType: 'textarea' })],
      customFieldValues: { 1: 'existing' },
      updateCustomFieldValue: update,
    });
    const ta = screen.getByDisplayValue('existing') as HTMLTextAreaElement;
    expect(ta.tagName).toBe('TEXTAREA');
    fireEvent.change(ta, { target: { value: 'updated' } });
    expect(update).toHaveBeenCalledWith(1, 'updated');
  });

  it('renders a number input for fieldType=number', () => {
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Count', slug: 'count', fieldType: 'number' })],
    });
    const input = screen.getByRole('spinbutton') as HTMLInputElement;
    expect(input.type).toBe('number');
  });

  it('renders a date input for fieldType=date', () => {
    const { container } = renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Pub', slug: 'pub', fieldType: 'date' })],
    });
    const input = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('renders a select with options for fieldType=select', () => {
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Tier', slug: 'tier', fieldType: 'select', options: ['a', 'b', 'c'] })],
    });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.querySelectorAll('option').length).toBe(4); // includes "Select..."
    expect(screen.getByText('a')).toBeTruthy();
    expect(screen.getByText('b')).toBeTruthy();
  });

  it('renders a select with no extra options when options is null', () => {
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Tier', slug: 'tier', fieldType: 'select' })],
    });
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.querySelectorAll('option').length).toBe(1);
  });

  it('renders a checkbox for fieldType=checkbox and toggles boolean string', () => {
    const update = vi.fn();
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Featured', slug: 'featured', fieldType: 'checkbox', helpText: 'Mark as featured' })],
      updateCustomFieldValue: update,
    });
    const cb = screen.getByRole('checkbox') as HTMLInputElement;
    expect(cb.checked).toBe(false);
    fireEvent.click(cb);
    expect(update).toHaveBeenCalledWith(1, 'true');
  });

  it('renders a checkbox checked when value is "true"', () => {
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Featured', slug: 'featured', fieldType: 'checkbox' })],
      customFieldValues: { 1: 'true' },
    });
    const cb = screen.getByRole('checkbox') as HTMLInputElement;
    expect(cb.checked).toBe(true);
  });

  it('renders an email input for fieldType=email', () => {
    const { container } = renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Contact', slug: 'contact', fieldType: 'email' })],
    });
    expect(container.querySelector('input[type="email"]')).toBeTruthy();
  });

  it('renders a url input for fieldType=url', () => {
    const { container } = renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Link', slug: 'link', fieldType: 'url' })],
    });
    expect(container.querySelector('input[type="url"]')).toBeTruthy();
  });

  it('renders MediaPicker for fieldType=image', () => {
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Cover', slug: 'cover', fieldType: 'image' })],
    });
    expect(screen.getByTestId('media-picker')).toBeTruthy();
  });

  it('renders a required marker when field.required is true', () => {
    const { container } = renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Title', slug: 'title', fieldType: 'text', required: true })],
    });
    expect(container.textContent).toContain('*');
  });

  it('renders helpText for non-checkbox fields', () => {
    renderSection({
      customFieldDefs: [makeDef({ id: 1, name: 'Name', slug: 'name', fieldType: 'text', helpText: 'Enter your full name' })],
    });
    expect(screen.getByText('Enter your full name')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Group rendering
// ---------------------------------------------------------------------------

describe('CustomFieldsSection: group fields', () => {
  it('renders a group header with the field count (singular)', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 10, name: 'SEO', slug: 'seo', fieldType: 'group' }),
        makeDef({ id: 11, name: 'Title', slug: 'title', fieldType: 'text', parentId: 10 }),
      ],
    });
    expect(screen.getByText('SEO')).toBeTruthy();
    expect(screen.getByText('1 field')).toBeTruthy();
  });

  it('uses pluralized "fields" label when zero or more than one child', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 10, name: 'Empty', slug: 'empty', fieldType: 'group' }),
      ],
    });
    expect(screen.getByText('0 fields')).toBeTruthy();
  });

  it('shows the empty-group message when group has no children', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 10, name: 'Empty', slug: 'empty', fieldType: 'group' }),
      ],
    });
    expect(screen.getByText('No sub-fields in this group yet.')).toBeTruthy();
  });

  it('renders child fields by default (expanded) and collapses on click', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 10, name: 'SEO', slug: 'seo', fieldType: 'group' }),
        makeDef({ id: 11, name: 'Meta Title', slug: 'meta_title', fieldType: 'text', parentId: 10 }),
      ],
    });
    expect(screen.getByText('Meta Title')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /SEO/ }));
    // Collapsed - child label is no longer rendered
    expect(screen.queryByText('Meta Title')).toBeNull();
    // Toggle back
    fireEvent.click(screen.getByRole('button', { name: /SEO/ }));
    expect(screen.getByText('Meta Title')).toBeTruthy();
  });

  it('renders helpText for non-checkbox child fields', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 10, name: 'SEO', slug: 'seo', fieldType: 'group' }),
        makeDef({ id: 11, name: 'Meta Title', slug: 'meta_title', fieldType: 'text', parentId: 10, helpText: 'shown in tab' }),
      ],
    });
    expect(screen.getByText('shown in tab')).toBeTruthy();
  });

  it('propagates child onChange to updateCustomFieldValue with child id', () => {
    const update = vi.fn();
    renderSection({
      customFieldDefs: [
        makeDef({ id: 10, name: 'SEO', slug: 'seo', fieldType: 'group' }),
        makeDef({ id: 11, name: 'Meta Title', slug: 'meta_title', fieldType: 'text', parentId: 10 }),
      ],
      updateCustomFieldValue: update,
    });
    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'hello' } });
    expect(update).toHaveBeenCalledWith(11, 'hello');
  });
});

// ---------------------------------------------------------------------------
// Repeater rendering
// ---------------------------------------------------------------------------

describe('CustomFieldsSection: repeater fields', () => {
  it('parses preexisting JSON array values into rows on mount', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 20, name: 'Items', slug: 'items', fieldType: 'repeater' }),
        makeDef({ id: 21, name: 'Label', slug: 'label', fieldType: 'text', parentId: 20 }),
      ],
      customFieldValues: { 20: JSON.stringify([{ label: 'a' }, { label: 'b' }]) },
    });
    expect(screen.getByText('2 rows')).toBeTruthy();
    expect(screen.getByDisplayValue('a')).toBeTruthy();
    expect(screen.getByDisplayValue('b')).toBeTruthy();
  });

  it('falls back to empty rows when stored value is invalid JSON', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 20, name: 'Items', slug: 'items', fieldType: 'repeater' }),
        makeDef({ id: 21, name: 'Label', slug: 'label', fieldType: 'text', parentId: 20 }),
      ],
      customFieldValues: { 20: '{not json' },
    });
    expect(screen.getByText('0 rows')).toBeTruthy();
  });

  it('falls back to empty rows when JSON parses but is not an array', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 20, name: 'Items', slug: 'items', fieldType: 'repeater' }),
        makeDef({ id: 21, name: 'Label', slug: 'label', fieldType: 'text', parentId: 20 }),
      ],
      customFieldValues: { 20: '{"foo":"bar"}' },
    });
    expect(screen.getByText('0 rows')).toBeTruthy();
  });

  it('renders empty-repeater message when no sub-fields are defined', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 20, name: 'Items', slug: 'items', fieldType: 'repeater' }),
      ],
    });
    expect(screen.getByText('No sub-fields defined for this repeater yet.')).toBeTruthy();
  });

  it('uses singular "row" label when exactly one row', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 20, name: 'Items', slug: 'items', fieldType: 'repeater' }),
        makeDef({ id: 21, name: 'Label', slug: 'label', fieldType: 'text', parentId: 20 }),
      ],
      customFieldValues: { 20: JSON.stringify([{ label: 'a' }]) },
    });
    expect(screen.getByText('1 row')).toBeTruthy();
  });

  it('collapses and re-expands the repeater on header click', () => {
    renderSection({
      customFieldDefs: [
        makeDef({ id: 20, name: 'Items', slug: 'items', fieldType: 'repeater' }),
        makeDef({ id: 21, name: 'Label', slug: 'label', fieldType: 'text', parentId: 20 }),
      ],
      customFieldValues: { 20: JSON.stringify([{ label: 'a' }]) },
    });
    fireEvent.click(screen.getByRole('button', { name: /Items/ }));
    expect(screen.queryByDisplayValue('a')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Items/ }));
    expect(screen.getByDisplayValue('a')).toBeTruthy();
  });

  it('adds a row when "Add Row" is clicked and saves immediately', () => {
    const update = vi.fn();
    renderSection({
      customFieldDefs: [
        makeDef({ id: 20, name: 'Items', slug: 'items', fieldType: 'repeater' }),
        makeDef({ id: 21, name: 'Label', slug: 'label', fieldType: 'text', parentId: 20 }),
      ],
      updateCustomFieldValue: update,
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Row/ }));
    expect(update).toHaveBeenCalledWith(20, JSON.stringify([{}]));
  });

  it('removes a row when delete is clicked and saves immediately', () => {
    const update = vi.fn();
    renderSection({
      customFieldDefs: [
        makeDef({ id: 20, name: 'Items', slug: 'items', fieldType: 'repeater' }),
        makeDef({ id: 21, name: 'Label', slug: 'label', fieldType: 'text', parentId: 20 }),
      ],
      customFieldValues: { 20: JSON.stringify([{ label: 'a' }, { label: 'b' }]) },
      updateCustomFieldValue: update,
    });
    const removeButtons = screen.getAllByTitle('Remove row');
    fireEvent.click(removeButtons[0]);
    expect(update).toHaveBeenCalledWith(20, JSON.stringify([{ label: 'b' }]));
  });

  it('debounces sub-field updates and emits one save after 300ms', () => {
    vi.useFakeTimers();
    try {
      const update = vi.fn();
      renderSection({
        customFieldDefs: [
          makeDef({ id: 20, name: 'Items', slug: 'items', fieldType: 'repeater' }),
          makeDef({ id: 21, name: 'Label', slug: 'label', fieldType: 'text', parentId: 20 }),
        ],
        customFieldValues: { 20: JSON.stringify([{ label: 'a' }]) },
        updateCustomFieldValue: update,
      });
      const input = screen.getByDisplayValue('a') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'aa' } });
      fireEvent.change(input, { target: { value: 'aab' } });
      // Not yet flushed
      expect(update).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(300);
      });
      expect(update).toHaveBeenCalledTimes(1);
      expect(update).toHaveBeenCalledWith(20, JSON.stringify([{ label: 'aab' }]));
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// ManageCustomFieldsModal
// ---------------------------------------------------------------------------

/**
 * The modal does an async post-types fetch on mount. To keep tests
 * deterministic with fake timers, we build a fetch mock that resolves
 * promises synchronously via Promise.resolve and pump the microtask queue
 * with vi.runAllTimersAsync / vi.runAllTicks where needed.
 */
function mockFetchSequence(handlers: Array<(url: string, init?: RequestInit) => { ok: boolean; body: unknown }>) {
  let i = 0;
  global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const handler = handlers[Math.min(i, handlers.length - 1)];
    i += 1;
    const out = handler(url, init);
    return {
      ok: out.ok,
      json: async () => out.body,
    };
  }) as unknown as typeof fetch;
}

describe('ManageCustomFieldsModal: lifecycle', () => {
  it('shows a loading spinner before the post-type fetch resolves', async () => {
    // Never-resolving fetch
    global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof fetch;
    const setShow = vi.fn();
    renderSection({ showManageFieldsModal: true, setShowManageFieldsModal: setShow });
    expect(screen.getByText('Manage Custom Fields')).toBeTruthy();
    expect(document.querySelector('.animate-spin')).toBeTruthy();
  });

  it('shows post-type-not-found when slug has no match', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 1, slug: 'page' }] } }),
    ]);
    renderSection({ showManageFieldsModal: true });
    await waitFor(() => {
      expect(screen.getByText(/not found/)).toBeTruthy();
    });
  });

  it('renders an empty fields list once the post-type is resolved', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 7, slug: 'post' }] } }),
      () => ({ ok: true, body: { success: true, data: [] } }),
    ]);
    renderSection({ showManageFieldsModal: true });
    await waitFor(() => {
      expect(screen.getByText('No fields defined for this post type yet.')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: /Add Field/ })).toBeTruthy();
  });

  it('falls through to the not-found state when the post-types lookup returns success:false', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: false } }),
    ]);
    renderSection({ showManageFieldsModal: true });
    // finally{} still flips loading -> false, and postTypeId stays null,
    // so we land on the "post type not found" branch.
    await waitFor(() => {
      expect(screen.getByText(/not found/)).toBeTruthy();
    });
  });

  it('lists existing top-level fields including pluralized sub-field count', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 7, slug: 'post' }] } }),
      () => ({
        ok: true,
        body: {
          success: true,
          data: [
            makeManagedField({ id: 1, name: 'Tags Group', slug: 'tags_group', fieldType: 'group' }),
            makeManagedField({ id: 2, name: 'Tag', slug: 'tag', fieldType: 'text', parentId: 1 }),
            makeManagedField({ id: 3, name: 'Author', slug: 'author', fieldType: 'text' }),
          ],
        },
      }),
    ]);
    renderSection({ showManageFieldsModal: true });
    await waitFor(() => {
      expect(screen.getByText('Tags Group')).toBeTruthy();
    });
    expect(screen.getByText('Author')).toBeTruthy();
    expect(screen.getByText('1 sub-field')).toBeTruthy();
  });
});

describe('ManageCustomFieldsModal: add-field form', () => {
  async function openModalWithEmptyFields() {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 7, slug: 'post' }] } }),
      () => ({ ok: true, body: { success: true, data: [] } }),
    ]);
    const setCustomFieldsLoaded = vi.fn();
    renderSection({ showManageFieldsModal: true, setCustomFieldsLoaded });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Add Field/ })).toBeTruthy();
    });
    return { setCustomFieldsLoaded };
  }

  it('opens the form when Add Field is clicked', async () => {
    await openModalWithEmptyFields();
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    expect(screen.getByText('New Field')).toBeTruthy();
    expect(screen.getByPlaceholderText('e.g. Author Name')).toBeTruthy();
  });

  it('auto-derives slug from name when creating', async () => {
    await openModalWithEmptyFields();
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    const name = screen.getByPlaceholderText('e.g. Author Name') as HTMLInputElement;
    fireEvent.change(name, { target: { value: 'Hello World!' } });
    const slug = screen.getByPlaceholderText('author_name') as HTMLInputElement;
    expect(slug.value).toBe('hello_world');
  });

  it('allows manually editing the slug', async () => {
    await openModalWithEmptyFields();
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    const slug = screen.getByPlaceholderText('author_name') as HTMLInputElement;
    fireEvent.change(slug, { target: { value: 'custom_slug' } });
    expect(slug.value).toBe('custom_slug');
  });

  it('shows the options textarea only for fieldType=select', async () => {
    await openModalWithEmptyFields();
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    expect(screen.queryByPlaceholderText(/Option 1/)).toBeNull();
    const selects = screen.getAllByRole('combobox');
    const typeSelect = selects[0] as HTMLSelectElement;
    fireEvent.change(typeSelect, { target: { value: 'select' } });
    expect(screen.getByPlaceholderText(/Option 1/)).toBeTruthy();
  });

  it('closes the form when Cancel is clicked', async () => {
    await openModalWithEmptyFields();
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(screen.queryByText('New Field')).toBeNull();
  });

  it('toggles the required checkbox', async () => {
    await openModalWithEmptyFields();
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    const required = screen.getByLabelText('Required') as HTMLInputElement;
    expect(required.checked).toBe(false);
    fireEvent.click(required);
    expect(required.checked).toBe(true);
  });

  it('parses the order input into an integer (defaulting to 0 on NaN)', async () => {
    await openModalWithEmptyFields();
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    const orderInputs = screen.getAllByRole('spinbutton');
    const order = orderInputs[0] as HTMLInputElement;
    fireEvent.change(order, { target: { value: '5' } });
    expect(order.value).toBe('5');
    // Blanking the field hits the `parseInt(...) || 0` fallback — state
    // becomes 0 and the controlled input re-renders with "0".
    fireEvent.change(order, { target: { value: '' } });
    expect(order.value).toBe('0');
  });
});

describe('ManageCustomFieldsModal: submit / edit / delete', () => {
  it('POSTs the form on submit and refreshes the list', async () => {
    let createdCalled = false;
    let i = 0;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      i += 1;
      if (i === 1) return { ok: true, json: async () => ({ success: true, data: [{ id: 7, slug: 'post' }] }) };
      if (i === 2) return { ok: true, json: async () => ({ success: true, data: [] }) };
      if (i === 3) {
        createdCalled = true;
        expect(url).toBe('/api/custom-fields');
        expect(init?.method).toBe('POST');
        const body = JSON.parse(init!.body as string);
        expect(body.name).toBe('Author');
        expect(body.slug).toBe('author');
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => ({ success: true, data: [makeManagedField({ id: 1, name: 'Author', slug: 'author', fieldType: 'text' })] }) };
    }) as unknown as typeof fetch;

    const setCustomFieldsLoaded = vi.fn();
    renderSection({ showManageFieldsModal: true, setCustomFieldsLoaded });
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Field/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Author Name'), { target: { value: 'Author' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Field$/ }));
    await waitFor(() => expect(createdCalled).toBe(true));
    await waitFor(() => expect(setCustomFieldsLoaded).toHaveBeenCalledWith(false));
  });

  it('serializes select options from textarea into an array on submit', async () => {
    let body: Record<string, unknown> | null = null;
    let i = 0;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      i += 1;
      if (i === 1) return { ok: true, json: async () => ({ success: true, data: [{ id: 7, slug: 'post' }] }) };
      if (i === 2) return { ok: true, json: async () => ({ success: true, data: [] }) };
      if (i === 3) {
        body = JSON.parse(init!.body as string);
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    }) as unknown as typeof fetch;

    renderSection({ showManageFieldsModal: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Field/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Author Name'), { target: { value: 'Tier' } });
    const typeSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(typeSelect, { target: { value: 'select' } });
    fireEvent.change(screen.getByPlaceholderText(/Option 1/), { target: { value: 'a\nb\n  c  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Field$/ }));
    await waitFor(() => expect(body).not.toBeNull());
    expect((body as { options: unknown }).options).toEqual(['a', 'b', 'c']);
  });

  it('shows the server error message when the POST fails with a JSON body', async () => {
    let i = 0;
    global.fetch = vi.fn(async () => {
      i += 1;
      if (i === 1) return { ok: true, json: async () => ({ success: true, data: [{ id: 7, slug: 'post' }] }) };
      if (i === 2) return { ok: true, json: async () => ({ success: true, data: [] }) };
      return { ok: false, json: async () => ({ error: 'Slug taken' }) };
    }) as unknown as typeof fetch;

    renderSection({ showManageFieldsModal: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Field/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Author Name'), { target: { value: 'Author' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Field$/ }));
    await waitFor(() => expect(screen.getByText('Slug taken')).toBeTruthy());
  });

  it('shows a fallback error when the POST fails without a parseable body', async () => {
    let i = 0;
    global.fetch = vi.fn(async () => {
      i += 1;
      if (i === 1) return { ok: true, json: async () => ({ success: true, data: [{ id: 7, slug: 'post' }] }) };
      if (i === 2) return { ok: true, json: async () => ({ success: true, data: [] }) };
      return {
        ok: false,
        json: async () => {
          throw new Error('bad json');
        },
      };
    }) as unknown as typeof fetch;

    renderSection({ showManageFieldsModal: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Field/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Author Name'), { target: { value: 'Author' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Field$/ }));
    await waitFor(() => expect(screen.getByText('Failed to save')).toBeTruthy());
  });

  it('shows a network-error message when fetch throws', async () => {
    let i = 0;
    global.fetch = vi.fn(async () => {
      i += 1;
      if (i === 1) return { ok: true, json: async () => ({ success: true, data: [{ id: 7, slug: 'post' }] }) };
      if (i === 2) return { ok: true, json: async () => ({ success: true, data: [] }) };
      throw new Error('boom');
    }) as unknown as typeof fetch;

    renderSection({ showManageFieldsModal: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /Add Field/ })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Add Field/ }));
    fireEvent.change(screen.getByPlaceholderText('e.g. Author Name'), { target: { value: 'Author' } });
    fireEvent.click(screen.getByRole('button', { name: /Add Field$/ }));
    await waitFor(() => expect(screen.getByText('Network error')).toBeTruthy());
  });

  it('populates the form when editing an existing field', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 7, slug: 'post' }] } }),
      () => ({
        ok: true,
        body: {
          success: true,
          data: [
            makeManagedField({
              id: 1,
              name: 'Author',
              slug: 'author',
              fieldType: 'select',
              options: ['a', 'b'],
              defaultValue: 'a',
              helpText: 'pick one',
              required: true,
              order: 3,
            }),
          ],
        },
      }),
    ]);
    renderSection({ showManageFieldsModal: true });
    await waitFor(() => expect(screen.getByText('Author')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Edit'));
    expect(screen.getByText('Edit Field')).toBeTruthy();
    expect((screen.getByPlaceholderText('e.g. Author Name') as HTMLInputElement).value).toBe('Author');
    expect((screen.getByPlaceholderText('author_name') as HTMLInputElement).value).toBe('author');
    expect((screen.getByPlaceholderText(/Option 1/) as HTMLTextAreaElement).value).toBe('a\nb');
    expect((screen.getByLabelText('Required') as HTMLInputElement).checked).toBe(true);
  });

  it('sends PUT to /api/custom-fields/:id when submitting an edit', async () => {
    let putCalled = false;
    let i = 0;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      i += 1;
      if (i === 1) return { ok: true, json: async () => ({ success: true, data: [{ id: 7, slug: 'post' }] }) };
      if (i === 2) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [makeManagedField({ id: 99, name: 'Author', slug: 'author', fieldType: 'text' })],
          }),
        };
      }
      if (i === 3) {
        putCalled = true;
        expect(url).toBe('/api/custom-fields/99');
        expect(init?.method).toBe('PUT');
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    }) as unknown as typeof fetch;

    renderSection({ showManageFieldsModal: true });
    await waitFor(() => expect(screen.getByText('Author')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Edit'));
    fireEvent.click(screen.getByRole('button', { name: /Update Field/ }));
    await waitFor(() => expect(putCalled).toBe(true));
  });

  it('deletes a field after confirmation', async () => {
    let deleteCalled = false;
    let i = 0;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      i += 1;
      if (i === 1) return { ok: true, json: async () => ({ success: true, data: [{ id: 7, slug: 'post' }] }) };
      if (i === 2) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [makeManagedField({ id: 99, name: 'Author', slug: 'author', fieldType: 'text' })],
          }),
        };
      }
      if (i === 3) {
        deleteCalled = true;
        expect(url).toBe('/api/custom-fields/99');
        expect(init?.method).toBe('DELETE');
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    }) as unknown as typeof fetch;

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const setCustomFieldsLoaded = vi.fn();
    renderSection({ showManageFieldsModal: true, setCustomFieldsLoaded });
    await waitFor(() => expect(screen.getByText('Author')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Delete'));
    await waitFor(() => expect(deleteCalled).toBe(true));
    await waitFor(() => expect(setCustomFieldsLoaded).toHaveBeenCalledWith(false));
  });

  it('does NOT call DELETE when the confirm dialog is dismissed', async () => {
    let i = 0;
    let deleteAttempted = false;
    global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
      i += 1;
      if (i === 1) return { ok: true, json: async () => ({ success: true, data: [{ id: 7, slug: 'post' }] }) };
      if (i === 2) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [makeManagedField({ id: 99, name: 'Author', slug: 'author', fieldType: 'text' })],
          }),
        };
      }
      if (init?.method === 'DELETE') deleteAttempted = true;
      return { ok: true, json: async () => ({ success: true }) };
    }) as unknown as typeof fetch;

    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderSection({ showManageFieldsModal: true });
    await waitFor(() => expect(screen.getByText('Author')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Delete'));
    // Allow any microtasks to flush
    await Promise.resolve();
    expect(deleteAttempted).toBe(false);
  });
});

describe('ManageCustomFieldsModal: sub-field flows + close', () => {
  it('expands a group/repeater container and renders its sub-fields', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 7, slug: 'post' }] } }),
      () => ({
        ok: true,
        body: {
          success: true,
          data: [
            makeManagedField({ id: 1, name: 'Group A', slug: 'group_a', fieldType: 'group' }),
            makeManagedField({ id: 2, name: 'Child', slug: 'child', fieldType: 'text', parentId: 1, order: 2 }),
          ],
        },
      }),
    ]);
    renderSection({ showManageFieldsModal: true });
    await waitFor(() => expect(screen.getByText('Group A')).toBeTruthy());
    // Child is hidden by default
    expect(screen.queryByText('Child')).toBeNull();
    // Click the container's expand toggle (chevron icon button)
    const buttons = screen.getAllByRole('button');
    const expandBtn = buttons.find((b) => b.querySelector('.material-icons')?.textContent === 'chevron_right');
    if (!expandBtn) throw new Error('expand button not found');
    fireEvent.click(expandBtn);
    expect(screen.getByText('Child')).toBeTruthy();
  });

  it('opens the new-sub-field form when "Add sub-field" is clicked on a container', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 7, slug: 'post' }] } }),
      () => ({
        ok: true,
        body: {
          success: true,
          data: [
            makeManagedField({ id: 1, name: 'Group A', slug: 'group_a', fieldType: 'group' }),
          ],
        },
      }),
    ]);
    renderSection({ showManageFieldsModal: true });
    await waitFor(() => expect(screen.getByText('Group A')).toBeTruthy());
    fireEvent.click(screen.getByTitle('Add sub-field'));
    expect(screen.getByText('New Sub-field')).toBeTruthy();
    // Sub-field type select must not include repeater/group
    const optValues = Array.from(screen.getAllByRole('combobox')[0].querySelectorAll('option')).map((o) => (o as HTMLOptionElement).value);
    expect(optValues).not.toContain('repeater');
    expect(optValues).not.toContain('group');
  });

  it('closes the modal when the backdrop is clicked', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 7, slug: 'post' }] } }),
      () => ({ ok: true, body: { success: true, data: [] } }),
    ]);
    const setShow = vi.fn();
    renderSection({ showManageFieldsModal: true, setShowManageFieldsModal: setShow });
    await waitFor(() => expect(screen.getByText('Manage Custom Fields')).toBeTruthy());
    const backdrop = document.querySelector('.bg-black\\/40') as HTMLElement;
    expect(backdrop).toBeTruthy();
    fireEvent.click(backdrop);
    expect(setShow).toHaveBeenCalledWith(false);
  });

  it('closes the modal when the Done button is clicked', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 7, slug: 'post' }] } }),
      () => ({ ok: true, body: { success: true, data: [] } }),
    ]);
    const setShow = vi.fn();
    renderSection({ showManageFieldsModal: true, setShowManageFieldsModal: setShow });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Done' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(setShow).toHaveBeenCalledWith(false);
  });

  it('closes the modal when the header X button is clicked', async () => {
    mockFetchSequence([
      () => ({ ok: true, body: { success: true, data: [{ id: 7, slug: 'post' }] } }),
      () => ({ ok: true, body: { success: true, data: [] } }),
    ]);
    const setShow = vi.fn();
    renderSection({ showManageFieldsModal: true, setShowManageFieldsModal: setShow });
    await waitFor(() => expect(screen.getByText('Manage Custom Fields')).toBeTruthy());
    // The header close button contains the 'close' material icon
    const buttons = screen.getAllByRole('button');
    const closeBtn = buttons.find((b) => b.querySelector('.material-icons')?.textContent === 'close');
    if (!closeBtn) throw new Error('close button not found');
    fireEvent.click(closeBtn);
    expect(setShow).toHaveBeenCalledWith(false);
  });
});
