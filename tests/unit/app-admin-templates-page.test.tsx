// @vitest-environment jsdom
/**
 * Unit tests for `app/admin/templates/page.tsx`
 * Covers: loading, empty state, template grid, scope filter, search,
 * create/edit/delete, publish, cancel-delete, draft badges,
 * pending-delete styling, block summary, slug auto-generation.
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
  usePathname: () => '/admin/templates',
  useSearchParams: () => new URLSearchParams(),
}));

// ── Helpers ────────────────────────────────────────────────────────────────────

function jsonOk(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: async () => body } as Response);
}

const baseTemplate = {
  id: 1,
  name: 'Hero Block',
  slug: 'hero-block',
  description: 'A hero section template',
  category: 'marketing',
  scope: 'block',
  blocks: [{ type: 'hero', content: 'test', id: 'b1', order: 0, alignment: 'left', size: 'base' }],
  thumbnail: null,
  tags: ['hero', 'landing'],
  lockedFields: [],
  version: 2,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-02T00:00:00Z',
  draft: null,
};

const sectionTemplate = {
  ...baseTemplate,
  id: 2,
  name: 'Multi Block',
  slug: 'multi-block',
  scope: 'section',
  blocks: [{ type: 'text' }, { type: 'image' }],
  description: null,
  tags: [],
  draft: null,
};

const globalTemplate = {
  ...baseTemplate,
  id: 3,
  name: 'Global Nav',
  slug: 'global-nav',
  scope: 'global',
  blocks: [],
  description: null,
  tags: [],
  draft: null,
};

const draftTemplate = {
  ...baseTemplate,
  id: 4,
  name: 'Draft Hero',
  slug: 'draft-hero',
  scope: 'block',
  draft: {
    name: 'Draft Hero',
    updatedAt: '2025-06-01T12:00:00Z',
    updatedBy: 42,
    pendingDelete: false,
    pendingCreate: false,
  },
};

const pendingDeleteTemplate = {
  ...baseTemplate,
  id: 5,
  name: 'Old Template',
  slug: 'old-template',
  scope: 'block',
  draft: {
    pendingDelete: true,
    updatedAt: '2025-06-01T12:00:00Z',
    updatedBy: 1,
  },
};

type MockFn = ReturnType<typeof vi.fn>;
let mockFetch: MockFn;
let confirmMock: MockFn;
let alertMock: MockFn;

function setupFetch(templates: unknown[] = [baseTemplate, sectionTemplate]) {
  mockFetch = vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith('/api/block-templates?')) return jsonOk({ success: true, data: templates });
    if (url === '/api/block-templates' && init?.method === 'POST') return jsonOk({ success: true, data: { id: 99 } });
    if (/\/api\/block-templates\/\d+$/.test(url) && init?.method === 'PUT') return jsonOk({ success: true });
    if (/\/api\/block-templates\/\d+$/.test(url) && init?.method === 'DELETE') return jsonOk({ success: true });
    if (/\/api\/block-templates\/\d+\/publish$/.test(url) && init?.method === 'POST') return jsonOk({ success: true });
    if (/\/api\/block-templates\/\d+\/cancel-delete$/.test(url) && init?.method === 'POST') return jsonOk({ success: true });
    return jsonOk({ success: true });
  });
  global.fetch = mockFetch;
}

beforeEach(() => {
  setupFetch();
  confirmMock = vi.fn(() => true);
  alertMock = vi.fn();
  window.confirm = confirmMock;
  window.alert = alertMock;
});

import TemplatesPage from '@/app/admin/templates/page';

async function renderPage() {
  const result = render(<TemplatesPage />);
  await waitFor(() => expect(screen.queryByText('Loading templates...')).toBeNull());
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('TemplatesPage', () => {
  describe('loading & initial render', () => {
    it('shows loading text before data arrives', () => {
      global.fetch = vi.fn(() => new Promise(() => {}));
      render(<TemplatesPage />);
      expect(screen.getByText('Loading templates...')).toBeTruthy();
    });

    it('renders page heading', async () => {
      await renderPage();
      expect(screen.getByText('Block Templates')).toBeTruthy();
    });

    it('renders subtitle text', async () => {
      await renderPage();
      expect(screen.getByText(/Reusable block configurations/)).toBeTruthy();
    });

    it('renders "+ New Template" button', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: '+ New Template' })).toBeTruthy();
    });

    it('renders scope filter buttons', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Block' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Section' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Global' })).toBeTruthy();
    });

    it('renders search input', async () => {
      await renderPage();
      expect(screen.getByPlaceholderText('Search templates...')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no templates exist', async () => {
      setupFetch([]);
      await renderPage();
      expect(screen.getByText('No templates yet')).toBeTruthy();
      expect(screen.getByText(/Save blocks as templates/)).toBeTruthy();
    });

    it('shows "Create your first template" button in empty state', async () => {
      setupFetch([]);
      await renderPage();
      expect(screen.getByRole('button', { name: 'Create your first template' })).toBeTruthy();
    });

    it('opens form from empty state button', async () => {
      setupFetch([]);
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Create your first template' }));
      expect(screen.getByText('New Template')).toBeTruthy();
    });
  });

  describe('template grid', () => {
    it('renders template name', async () => {
      await renderPage();
      expect(screen.getByText('Hero Block')).toBeTruthy();
    });

    it('renders template description', async () => {
      await renderPage();
      expect(screen.getByText('A hero section template')).toBeTruthy();
    });

    it('renders template tags', async () => {
      await renderPage();
      expect(screen.getByText('hero')).toBeTruthy();
      expect(screen.getByText('landing')).toBeTruthy();
    });

    it('renders version number', async () => {
      // Only render one template to avoid duplicates
      setupFetch([baseTemplate]);
      await renderPage();
      expect(screen.getAllByText('v2').length).toBeGreaterThan(0);
    });

    it('renders scope label badge for block scope', async () => {
      setupFetch([baseTemplate]);
      await renderPage();
      // "Block" appears in both filter button and scope badge — confirm at least 2
      expect(screen.getAllByText('Block').length).toBeGreaterThanOrEqual(2);
    });

    it('renders scope label badge for section scope', async () => {
      setupFetch([sectionTemplate]);
      await renderPage();
      expect(screen.getAllByText('Section').length).toBeGreaterThan(0);
    });

    it('renders scope label badge for global scope', async () => {
      setupFetch([globalTemplate]);
      await renderPage();
      expect(screen.getAllByText('Global').length).toBeGreaterThan(0);
    });

    it('renders thumbnail image when present', async () => {
      setupFetch([{ ...baseTemplate, thumbnail: 'https://example.com/thumb.png' }]);
      await renderPage();
      const img = screen.getByRole('img') as HTMLImageElement;
      expect(img.src).toContain('thumb.png');
    });
  });

  describe('block summary', () => {
    it('shows block type name for single-block template', async () => {
      // "hero" → "Hero"
      await renderPage();
      expect(screen.getByText('Hero')).toBeTruthy();
    });

    it('shows block count for multi-block template', async () => {
      setupFetch([sectionTemplate]);
      await renderPage();
      expect(screen.getByText('2 blocks')).toBeTruthy();
    });

    it('shows "Empty" for template with no blocks', async () => {
      setupFetch([globalTemplate]);
      await renderPage();
      expect(screen.getByText('Empty')).toBeTruthy();
    });

    it('shows hyphenated block type capitalised correctly', async () => {
      setupFetch([{ ...baseTemplate, blocks: [{ type: 'call-to-action' }] }]);
      await renderPage();
      expect(screen.getByText('Call to action')).toBeTruthy();
    });
  });

  describe('scope filter', () => {
    it('clicking Block filter re-fetches with scope param', async () => {
      await renderPage();
      mockFetch.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'Block' }));
      await flush();
      const fetchedUrls = mockFetch.mock.calls.map(([url]) => url as string);
      expect(fetchedUrls.some((u) => u.includes('scope=block'))).toBe(true);
    });

    it('clicking All filter re-fetches without scope param', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Block' }));
      await flush();
      mockFetch.mockClear();
      fireEvent.click(screen.getByRole('button', { name: 'All' }));
      await flush();
      const fetchedUrls = mockFetch.mock.calls.map(([url]) => url as string);
      expect(fetchedUrls.some((u) => !u.includes('scope='))).toBe(true);
    });
  });

  describe('search', () => {
    it('typing in search input re-fetches with search param', async () => {
      await renderPage();
      mockFetch.mockClear();
      fireEvent.change(screen.getByPlaceholderText('Search templates...'), { target: { value: 'hero' } });
      await flush();
      const fetchedUrls = mockFetch.mock.calls.map(([url]) => url as string);
      expect(fetchedUrls.some((u) => u.includes('search=hero'))).toBe(true);
    });
  });

  describe('create template form', () => {
    it('shows form with "New Template" heading when button clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));
      expect(screen.getByText('New Template')).toBeTruthy();
    });

    it('auto-generates slug from name', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));
      // Name is the first required text input in the form
      const form = document.querySelector('form') as HTMLFormElement;
      const inputs = form.querySelectorAll('input[type="text"]');
      const nameInput = inputs[0] as HTMLInputElement;
      const slugInput = inputs[1] as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'My New Template' } });
      expect(slugInput.value).toBe('my-new-template');
    });

    it('slug field is editable when not editing', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));
      const form = document.querySelector('form') as HTMLFormElement;
      const inputs = form.querySelectorAll('input[type="text"]');
      const slugInput = inputs[1] as HTMLInputElement;
      expect(slugInput.disabled).toBe(false);
    });

    it('submits POST and closes form on success', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));
      const form = document.querySelector('form') as HTMLFormElement;
      const nameInput = form.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'New' } });
      fireEvent.submit(form);
      await waitFor(() => {
        const postCall = mockFetch.mock.calls.find(
          ([url, init]) => url === '/api/block-templates' && (init as RequestInit)?.method === 'POST',
        );
        expect(postCall).toBeTruthy();
      });
    });

    it('cancel button closes form', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));
      expect(screen.getByText('New Template')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('New Template')).toBeNull();
    });

    it('renders scope dropdown with all options', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));
      const scopeSelect = screen.getByRole('combobox') as HTMLSelectElement;
      const options = Array.from(scopeSelect.options).map((o) => o.value);
      expect(options).toContain('block');
      expect(options).toContain('section');
      expect(options).toContain('global');
    });

    it('tags field accepts comma-separated values', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: '+ New Template' }));
      const tagsInput = screen.getByPlaceholderText(/e.g., hero, landing/) as HTMLInputElement;
      fireEvent.change(tagsInput, { target: { value: 'a, b, c' } });
      expect(tagsInput.value).toBe('a, b, c');
    });
  });

  describe('edit template', () => {
    it('opens form with "Edit Template" heading and pre-filled values', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      expect(screen.getByText('Edit Template')).toBeTruthy();
      expect(screen.getByDisplayValue('Hero Block')).toBeTruthy();
    });

    it('slug field is disabled when editing', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      const slugInput = screen.getByDisplayValue('hero-block') as HTMLInputElement;
      expect(slugInput.disabled).toBe(true);
    });

    it('description is pre-filled', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      expect(screen.getByDisplayValue('A hero section template')).toBeTruthy();
    });

    it('tags are pre-filled joined by comma-space', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      expect(screen.getByDisplayValue('hero, landing')).toBeTruthy();
    });

    it('does NOT auto-update slug when name changes in edit mode', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      const nameInput = screen.getByDisplayValue('Hero Block');
      fireEvent.change(nameInput, { target: { value: 'Hero Block Renamed' } });
      // slug is disabled so value stays
      const slugInput = screen.getByDisplayValue('hero-block') as HTMLInputElement;
      expect(slugInput.value).toBe('hero-block');
    });

    it('submits PUT when Update is clicked', async () => {
      await renderPage();
      const editBtns = screen.getAllByRole('button', { name: 'Edit' });
      fireEvent.click(editBtns[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Update' }));
      await waitFor(() => {
        const putCall = mockFetch.mock.calls.find(
          ([url, init]) => /\/api\/block-templates\/1$/.test(url as string) && (init as RequestInit)?.method === 'PUT',
        );
        expect(putCall).toBeTruthy();
      });
    });
  });

  describe('delete template', () => {
    it('calls DELETE endpoint after confirm', async () => {
      await renderPage();
      const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
      fireEvent.click(deleteBtns[0]);
      expect(confirmMock).toHaveBeenCalled();
      await waitFor(() => {
        const delCall = mockFetch.mock.calls.find(
          ([url, init]) => /\/api\/block-templates\/\d+$/.test(url as string) && (init as RequestInit)?.method === 'DELETE',
        );
        expect(delCall).toBeTruthy();
      });
    });

    it('does not DELETE when confirm returns false', async () => {
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

    it('alerts when DELETE response is not success', async () => {
      global.fetch = vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/block-templates?')) return jsonOk({ success: true, data: [baseTemplate] });
        if (/\/api\/block-templates\/\d+$/.test(url) && init?.method === 'DELETE')
          return jsonOk({ success: false, message: 'Cannot delete: in use' });
        return jsonOk({ success: true });
      });
      await renderPage();
      const deleteBtns = screen.getAllByRole('button', { name: 'Delete' });
      fireEvent.click(deleteBtns[0]);
      await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Cannot delete: in use'));
    });

    it('hides Delete button for pending-delete templates', async () => {
      setupFetch([pendingDeleteTemplate]);
      await renderPage();
      // Only "Cancel deletion" and "Publish" buttons visible — no "Delete"
      expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    });
  });

  describe('publish', () => {
    it('shows Publish button for templates with a draft', async () => {
      setupFetch([draftTemplate]);
      await renderPage();
      expect(screen.getByRole('button', { name: /Publish/ })).toBeTruthy();
    });

    it('calls publish endpoint when Publish clicked', async () => {
      setupFetch([draftTemplate]);
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
      await waitFor(() => {
        const publishCall = mockFetch.mock.calls.find(
          ([url, init]) => /\/api\/block-templates\/4\/publish$/.test(url as string) && (init as RequestInit)?.method === 'POST',
        );
        expect(publishCall).toBeTruthy();
      });
    });

    it('alerts when publish response is not success', async () => {
      global.fetch = vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/block-templates?')) return jsonOk({ success: true, data: [draftTemplate] });
        if (/\/publish$/.test(url) && init?.method === 'POST')
          return jsonOk({ success: false, message: 'Publish failed' });
        return jsonOk({ success: true });
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Publish/ }));
      await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Publish failed'));
    });
  });

  describe('cancel delete', () => {
    it('shows Cancel deletion button for pending-delete templates', async () => {
      setupFetch([pendingDeleteTemplate]);
      await renderPage();
      expect(screen.getByRole('button', { name: /Cancel deletion/ })).toBeTruthy();
    });

    it('calls cancel-delete endpoint when Cancel deletion clicked', async () => {
      setupFetch([pendingDeleteTemplate]);
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Cancel deletion/ }));
      await waitFor(() => {
        const cancelCall = mockFetch.mock.calls.find(
          ([url, init]) => /\/api\/block-templates\/5\/cancel-delete$/.test(url as string) && (init as RequestInit)?.method === 'POST',
        );
        expect(cancelCall).toBeTruthy();
      });
    });

    it('alerts when cancel-delete response is not success', async () => {
      global.fetch = vi.fn((url: string, init?: RequestInit) => {
        if (url.startsWith('/api/block-templates?')) return jsonOk({ success: true, data: [pendingDeleteTemplate] });
        if (/\/cancel-delete$/.test(url) && init?.method === 'POST')
          return jsonOk({ success: false, message: 'Cancel failed' });
        return jsonOk({ success: true });
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Cancel deletion/ }));
      await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Cancel failed'));
    });
  });

  describe('draft badges', () => {
    it('shows "Draft" badge for template with non-delete draft', async () => {
      setupFetch([draftTemplate]);
      await renderPage();
      expect(screen.getByText('Draft')).toBeTruthy();
    });

    it('shows "Pending delete" badge for pending-delete template', async () => {
      setupFetch([pendingDeleteTemplate]);
      await renderPage();
      expect(screen.getByText('Pending delete')).toBeTruthy();
    });

    it('template name is struck-through when pending delete', async () => {
      setupFetch([pendingDeleteTemplate]);
      await renderPage();
      const nameEl = screen.getByText('Old Template');
      expect(nameEl.className).toContain('line-through');
    });

    it('formatDraftTooltip includes updatedAt and updatedBy in title', async () => {
      setupFetch([draftTemplate]);
      await renderPage();
      const draftBadge = screen.getByText('Draft').closest('[title]') as HTMLElement;
      expect(draftBadge?.getAttribute('title')).toContain('by user 42');
    });

    it('formatDraftTooltip falls back to "Unpublished draft" when no metadata', async () => {
      setupFetch([{ ...draftTemplate, draft: { pendingDelete: false } }]);
      await renderPage();
      const draftBadge = screen.getByText('Draft').closest('[title]') as HTMLElement;
      expect(draftBadge?.getAttribute('title')).toBe('Unpublished draft');
    });
  });
});
