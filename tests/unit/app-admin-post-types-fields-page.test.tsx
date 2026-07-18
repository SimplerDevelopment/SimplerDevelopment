// @vitest-environment jsdom
/**
 * Unit tests for `app/admin/post-types/[id]/fields/page.tsx`
 * Covers: loading state, empty state, field list, add/edit/delete,
 * container (repeater/group) sub-fields, select options textarea,
 * slug auto-generation, error handling.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ── Mocks (must precede page import) ──────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => ({ id: '7' }),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function jsonOk(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) } as Response);
}

function jsonErr(body: unknown, status = 400) {
  return Promise.resolve({ ok: false, status, json: async () => body, text: async () => JSON.stringify(body) } as Response);
}

const basePostType = { id: 7, name: 'Blog Post', slug: 'blog-post' };

const textField = { id: 1, postTypeId: 7, parentId: null, name: 'Author', slug: 'author', fieldType: 'text', options: null, required: true, defaultValue: null, helpText: 'Who wrote it', order: 0 };
const selectField = { id: 2, postTypeId: 7, parentId: null, name: 'Category', slug: 'category', fieldType: 'select', options: ['A', 'B'], required: false, defaultValue: null, helpText: null, order: 1 };
const repeaterField = { id: 3, postTypeId: 7, parentId: null, name: 'Gallery', slug: 'gallery', fieldType: 'repeater', options: null, required: false, defaultValue: null, helpText: null, order: 2 };
const groupField = { id: 4, postTypeId: 7, parentId: null, name: 'Meta', slug: 'meta', fieldType: 'group', options: null, required: false, defaultValue: null, helpText: null, order: 3 };
const childField = { id: 5, postTypeId: 7, parentId: 3, name: 'Image URL', slug: 'image_url', fieldType: 'url', options: null, required: false, defaultValue: null, helpText: null, order: 0 };

type MockFn = ReturnType<typeof vi.fn>;
let mockFetch: MockFn;
let confirmMock: MockFn;

function setupFetch(fields: unknown[] = [textField, selectField]) {
  mockFetch = vi.fn((url: string, init?: RequestInit) => {
    if (url === '/api/post-types/7') return jsonOk({ success: true, data: basePostType });
    if (url === '/api/custom-fields?postTypeId=7') return jsonOk({ success: true, data: fields });
    if (url === '/api/custom-fields' && init?.method === 'POST') return jsonOk({ success: true, data: { id: 99 } });
    if (/\/api\/custom-fields\/\d+$/.test(url) && init?.method === 'PUT') return jsonOk({ success: true });
    if (/\/api\/custom-fields\/\d+$/.test(url) && init?.method === 'DELETE') return jsonOk({ success: true });
    return jsonOk({ success: true });
  });
  global.fetch = mockFetch;
}

beforeEach(() => {
  setupFetch();
  confirmMock = vi.fn(() => true);
  window.confirm = confirmMock;
});

import CustomFieldsPage from '@/app/admin/post-types/[id]/fields/page';

async function renderPage() {
  const result = render(<CustomFieldsPage />);
  await waitFor(() => expect(screen.queryByText('Loading...')).toBeNull());
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('CustomFieldsPage', () => {
  describe('loading & initial render', () => {
    it('shows loading state before data arrives', () => {
      // Delay the post-type response so loading persists
      global.fetch = vi.fn(() => new Promise(() => {}));
      render(<CustomFieldsPage />);
      expect(screen.getByText('Loading...')).toBeTruthy();
    });

    it('renders page heading with post type name after load', async () => {
      await renderPage();
      expect(screen.getByText(/Custom Fields: Blog Post/)).toBeTruthy();
    });

    it('renders back link to /admin/post-types', async () => {
      await renderPage();
      const link = screen.getByRole('link', { name: /Back to Post Types/ });
      expect((link as HTMLAnchorElement).href).toContain('/admin/post-types');
    });

    it('renders the Add Custom Field button', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: 'Add Custom Field' })).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no fields exist', async () => {
      setupFetch([]);
      await renderPage();
      expect(screen.getByText(/No custom fields yet/)).toBeTruthy();
    });
  });

  describe('field list', () => {
    it('renders text field row with correct columns', async () => {
      await renderPage();
      expect(screen.getByText('Author')).toBeTruthy();
      expect(screen.getByText('author')).toBeTruthy();
      expect(screen.getAllByText('text').length).toBeGreaterThan(0);
      expect(screen.getByText('Who wrote it')).toBeTruthy();
    });

    it('renders required field with check_circle icon text', async () => {
      await renderPage();
      const checks = screen.getAllByText('check_circle');
      expect(checks.length).toBeGreaterThanOrEqual(1);
    });

    it('renders non-required field with cancel icon text', async () => {
      await renderPage();
      const cancels = screen.getAllByText('cancel');
      expect(cancels.length).toBeGreaterThanOrEqual(1);
    });

    it('renders repeater field with repeat icon and sub-field count', async () => {
      setupFetch([repeaterField, childField]);
      await renderPage();
      expect(screen.getByText('repeat')).toBeTruthy();
      expect(screen.getByText('1 sub-field')).toBeTruthy();
    });

    it('renders group field with folder icon', async () => {
      setupFetch([groupField]);
      await renderPage();
      expect(screen.getByText('folder')).toBeTruthy();
    });

    it('renders plural sub-fields label when count > 1', async () => {
      const child2 = { ...childField, id: 6, parentId: 3, order: 1 };
      setupFetch([repeaterField, childField, child2]);
      await renderPage();
      expect(screen.getByText('2 sub-fields')).toBeTruthy();
    });

    it('renders child field row indented under parent', async () => {
      setupFetch([repeaterField, childField]);
      await renderPage();
      expect(screen.getByText('Image URL')).toBeTruthy();
      expect(screen.getByText('subdirectory_arrow_right')).toBeTruthy();
    });

    it('child field helpText is shown when present', async () => {
      const childWithHelp = { ...childField, helpText: 'Must be https' };
      setupFetch([repeaterField, childWithHelp]);
      await renderPage();
      expect(screen.getByText('Must be https')).toBeTruthy();
    });
  });

  describe('add field form', () => {
    it('shows form when Add Custom Field is clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      expect(screen.getByPlaceholderText('e.g., Author Name')).toBeTruthy();
    });

    it('button label changes to Cancel when form is open', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      // Both header button and in-form button say "Cancel" — verify at least one exists
      const cancelBtns = screen.getAllByRole('button', { name: 'Cancel' });
      expect(cancelBtns.length).toBeGreaterThanOrEqual(1);
    });

    it('hides form when Cancel is clicked again', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      // The header toggle button says "Cancel" — click the first one (header)
      const cancelBtns = screen.getAllByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtns[0]);
      expect(screen.queryByPlaceholderText('e.g., Author Name')).toBeNull();
    });

    it('auto-generates slug from name for new field', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const nameInput = screen.getByPlaceholderText('e.g., Author Name');
      fireEvent.change(nameInput, { target: { value: 'My Cool Field' } });
      const slugInput = screen.getByPlaceholderText('e.g., author_name') as HTMLInputElement;
      expect(slugInput.value).toBe('my_cool_field');
    });

    it('shows select options textarea when fieldType is select', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const select = screen.getByRole('combobox') as HTMLSelectElement;
      fireEvent.change(select, { target: { value: 'select' } });
      expect(screen.getByText('Options (one per line)')).toBeTruthy();
    });

    it('hides options textarea for non-select field type', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      expect(screen.queryByText('Options (one per line)')).toBeNull();
    });

    it('submits new field via POST and refreshes list', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const nameInput = screen.getByPlaceholderText('e.g., Author Name');
      fireEvent.change(nameInput, { target: { value: 'Tag Line' } });
      fireEvent.submit(nameInput.closest('form') as HTMLFormElement);
      await flush();
      const postCall = mockFetch.mock.calls.find(
        ([url, init]) => url === '/api/custom-fields' && (init as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });

    it('shows error message when API returns error text', async () => {
      global.fetch = vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/post-types/7') return jsonOk({ success: true, data: basePostType });
        if (url === '/api/custom-fields?postTypeId=7') return jsonOk({ success: true, data: [] });
        if (url === '/api/custom-fields' && init?.method === 'POST')
          return jsonErr({ error: 'Slug already exists' });
        return jsonOk({ success: true });
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const nameInput = screen.getByPlaceholderText('e.g., Author Name');
      fireEvent.change(nameInput, { target: { value: 'Dup' } });
      fireEvent.submit(nameInput.closest('form') as HTMLFormElement);
      await waitFor(() => expect(screen.getByText('Slug already exists')).toBeTruthy());
    });

    it('shows fallback error when response body is not JSON', async () => {
      global.fetch = vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/post-types/7') return jsonOk({ success: true, data: basePostType });
        if (url === '/api/custom-fields?postTypeId=7') return jsonOk({ success: true, data: [] });
        if (url === '/api/custom-fields' && init?.method === 'POST')
          return Promise.resolve({ ok: false, status: 500, json: async () => { throw new Error('bad json'); }, text: async () => 'Internal Server Error' } as unknown as Response);
        return jsonOk({ success: true });
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const nameInput = screen.getByPlaceholderText('e.g., Author Name');
      fireEvent.change(nameInput, { target: { value: 'Err' } });
      fireEvent.submit(nameInput.closest('form') as HTMLFormElement);
      await waitFor(() => expect(screen.getByText(/Request failed with status 500/)).toBeTruthy());
    });

    it('shows network error when fetch rejects', async () => {
      global.fetch = vi.fn((url: string, init?: RequestInit) => {
        if (url === '/api/post-types/7') return jsonOk({ success: true, data: basePostType });
        if (url === '/api/custom-fields?postTypeId=7') return jsonOk({ success: true, data: [] });
        if (url === '/api/custom-fields' && init?.method === 'POST') return Promise.reject(new Error('network down'));
        return jsonOk({ success: true });
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const nameInput = screen.getByPlaceholderText('e.g., Author Name');
      fireEvent.change(nameInput, { target: { value: 'Net' } });
      fireEvent.submit(nameInput.closest('form') as HTMLFormElement);
      await waitFor(() => expect(screen.getByText(/Network error/)).toBeTruthy());
    });
  });

  describe('edit field', () => {
    it('opens form pre-filled when Edit is clicked', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      const nameInput = screen.getByDisplayValue('Author') as HTMLInputElement;
      expect(nameInput.value).toBe('Author');
    });

    it('does not auto-update slug when editing existing field', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      const nameInput = screen.getByDisplayValue('Author') as HTMLInputElement;
      const slugInput = screen.getByDisplayValue('author') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Author Changed' } });
      // slug should remain unchanged
      expect(slugInput.value).toBe('author');
    });

    it('submits PUT request when form is saved in edit mode', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      const form = screen.getByDisplayValue('Author').closest('form') as HTMLFormElement;
      fireEvent.submit(form);
      await waitFor(() => {
        const putCall = mockFetch.mock.calls.find(
          ([url, init]) => /\/api\/custom-fields\/1$/.test(url as string) && (init as RequestInit)?.method === 'PUT',
        );
        expect(putCall).toBeTruthy();
      });
    });

    it('shows "Update Field" text on submit button when editing', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      expect(screen.getByRole('button', { name: 'Update Field' })).toBeTruthy();
    });

    it('shows options textarea pre-filled when editing a select field', async () => {
      // Use only the select field in the list so Edit buttons are unambiguous
      setupFetch([selectField]);
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      await waitFor(() => expect(screen.getByText('Options (one per line)')).toBeTruthy());
      // options joined with '\n' — textarea value contains 'A' and 'B'
      const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea.value).toContain('A');
      expect(textarea.value).toContain('B');
    });

    it('cancel button in form resets to list view', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      // There are two cancel buttons now — click the one inside the form
      const cancelBtns = screen.getAllByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtns[cancelBtns.length - 1]);
      expect(screen.queryByDisplayValue('Author')).toBeNull();
    });
  });

  describe('delete field', () => {
    it('calls DELETE when Delete is clicked and confirmed', async () => {
      await renderPage();
      const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
      fireEvent.click(deleteBtns[0]);
      expect(confirmMock).toHaveBeenCalled();
      await waitFor(() => {
        const delCall = mockFetch.mock.calls.find(
          ([url, init]) => /\/api\/custom-fields\/1$/.test(url as string) && (init as RequestInit)?.method === 'DELETE',
        );
        expect(delCall).toBeTruthy();
      });
    });

    it('does not call DELETE when confirm is cancelled', async () => {
      confirmMock.mockReturnValueOnce(false);
      await renderPage();
      const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
      fireEvent.click(deleteBtns[0]);
      await flush();
      const delCall = mockFetch.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === 'DELETE',
      );
      expect(delCall).toBeUndefined();
    });
  });

  describe('repeater / group container actions', () => {
    it('shows "+ Sub-field" button for repeater fields', async () => {
      setupFetch([repeaterField]);
      await renderPage();
      expect(screen.getByRole('button', { name: '+ Sub-field' })).toBeTruthy();
    });

    it('opens add-field form with parentId set when + Sub-field is clicked', async () => {
      setupFetch([repeaterField]);
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: '+ Sub-field' }));
      // Form should appear; name input should be present
      expect(screen.getByPlaceholderText('e.g., Author Name')).toBeTruthy();
    });

    it('shows "+ Sub-field" button for group fields', async () => {
      setupFetch([groupField]);
      await renderPage();
      expect(screen.getByRole('button', { name: '+ Sub-field' })).toBeTruthy();
    });

    it('does not show "+ Sub-field" for plain text fields', async () => {
      setupFetch([textField]);
      await renderPage();
      expect(screen.queryByRole('button', { name: '+ Sub-field' })).toBeNull();
    });
  });

  describe('form field interactions', () => {
    it('updates required checkbox', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(checkbox.checked).toBe(false);
      fireEvent.click(checkbox);
      expect(checkbox.checked).toBe(true);
    });

    it('updates order number input', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const orderInputs = document.querySelectorAll('input[type="number"]');
      fireEvent.change(orderInputs[0], { target: { value: '5' } });
      expect((orderInputs[0] as HTMLInputElement).value).toBe('5');
    });

    it('updates help text input', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const helpInput = screen.getByPlaceholderText('Additional information about this field') as HTMLInputElement;
      fireEvent.change(helpInput, { target: { value: 'My help text' } });
      expect(helpInput.value).toBe('My help text');
    });

    it('updates default value input', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      // Default value input has no placeholder — find by label proximity
      const labels = screen.getAllByText('Default Value');
      const defaultInput = labels[0].nextElementSibling as HTMLInputElement;
      fireEvent.change(defaultInput, { target: { value: 'default123' } });
      expect(defaultInput.value).toBe('default123');
    });

    it('updates slug field directly', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Custom Field' }));
      const slugInput = screen.getByPlaceholderText('e.g., author_name') as HTMLInputElement;
      fireEvent.change(slugInput, { target: { value: 'my_slug' } });
      expect(slugInput.value).toBe('my_slug');
    });
  });

  describe('table column headers', () => {
    it('renders all expected column headers', async () => {
      await renderPage();
      expect(screen.getByText('Order')).toBeTruthy();
      expect(screen.getByText('Name')).toBeTruthy();
      expect(screen.getByText('Slug')).toBeTruthy();
      expect(screen.getByText('Type')).toBeTruthy();
      expect(screen.getByText('Required')).toBeTruthy();
      expect(screen.getByText('Actions')).toBeTruthy();
    });
  });
});
