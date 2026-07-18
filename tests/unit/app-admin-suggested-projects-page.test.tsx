// @vitest-environment jsdom
/**
 * Unit tests for `app/admin/portal-suggested-projects/page.tsx` — the admin
 * suggested-projects (Project Market) page. Stubs out `fetch`,
 * `@/lib/portal-utils`, and `@/components/admin/SurveyBuilder`, then
 * exercises render, empty/loading states, create, edit, delete, and
 * toggleActive flows.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
    back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/portal-suggested-projects',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

vi.mock('@/lib/portal-utils', () => ({
  formatCents: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// SurveyBuilder renders nothing — it just needs to be a valid React component
// that does NOT call any React hooks internally so we stub it out completely.
vi.mock('@/components/admin/SurveyBuilder', () => ({
  __esModule: true,
  default: function SurveyBuilderStub() {
    return React.createElement('div', { 'data-testid': 'survey-builder' });
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => { ok: boolean; json: () => Promise<unknown> };
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: unknown) {
  return { ok: true, json: async () => body } as ReturnType<FetchHandler>;
}

const baseSP = {
  id: 1,
  title: 'Website Starter',
  description: 'A great starter website',
  category: 'website',
  estimatedPrice: 150000,
  estimatedTimeline: '2–4 weeks',
  features: ['Custom design', 'Mobile responsive', 'SEO optimized'],
  icon: 'web',
  active: true,
  clientId: null,
  order: 0,
  surveyFields: [],
  createdAt: '2025-01-01T00:00:00Z',
  clientCompany: null,
  clientName: null,
};

const baseClients = [
  { id: 10, company: 'Acme Corp', userName: 'acme_user' },
  { id: 11, company: null, userName: 'orphan_user' },
];

function defaultFetch(url: string, init?: RequestInit): ReturnType<FetchHandler> {
  if (url === '/api/admin/portal/suggested-projects') {
    if (init?.method === 'POST') {
      const body = JSON.parse(init.body as string);
      return jsonResponse({ success: true, data: { ...baseSP, id: 99, title: body.title } });
    }
    return jsonResponse({ success: true, data: [baseSP] });
  }
  if (/^\/api\/admin\/portal\/suggested-projects\/\d+$/.test(url)) {
    if (init?.method === 'PATCH') {
      const body = JSON.parse(init.body as string);
      return jsonResponse({ success: true, data: { ...baseSP, ...body, id: parseInt(url.split('/').pop()!, 10) } });
    }
    if (init?.method === 'DELETE') {
      return jsonResponse({ success: true });
    }
  }
  if (url === '/api/admin/portal/clients') {
    return jsonResponse({ success: true, data: baseClients });
  }
  return jsonResponse({ success: true, data: null });
}

let confirmMock: ReturnType<typeof vi.fn>;
let alertMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setFetchHandler(defaultFetch);
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(handlers[0](url, init)),
  ));
  confirmMock = vi.fn(() => true);
  alertMock = vi.fn();
  vi.stubGlobal('confirm', confirmMock);
  vi.stubGlobal('alert', alertMock);
});

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// Imports under test (after mocks)
import AdminSuggestedProjectsPage from '@/app/admin/portal-suggested-projects/page';

async function renderPage() {
  const result = render(<AdminSuggestedProjectsPage />);
  await waitFor(() => {
    expect(screen.queryByText('Loading...')).toBeNull();
  });
  return result;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AdminSuggestedProjectsPage', () => {
  describe('initial render', () => {
    it('shows loading state before fetch resolves', () => {
      render(<AdminSuggestedProjectsPage />);
      expect(screen.getByText('Loading...')).toBeTruthy();
    });

    it('renders page heading after fetch', async () => {
      await renderPage();
      expect(screen.getByText('Project Market')).toBeTruthy();
      expect(screen.getByText(/Create project suggestions/)).toBeTruthy();
    });

    it('renders "New Suggestion" button', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: /New Suggestion/ })).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty-state message when no projects', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects') return jsonResponse({ success: true, data: [] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('No suggested projects yet')).toBeTruthy();
      expect(screen.getByText('Create your first suggestion above.')).toBeTruthy();
    });

    it('handles missing data field gracefully', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects') return jsonResponse({ success: true });
        if (url === '/api/admin/portal/clients') return jsonResponse({ success: true });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('No suggested projects yet')).toBeTruthy();
    });
  });

  describe('project list', () => {
    it('renders a project card with title and category', async () => {
      await renderPage();
      expect(screen.getByText('Website Starter')).toBeTruthy();
      expect(screen.getByText('Website')).toBeTruthy();
    });

    it('renders estimated price via formatCents', async () => {
      await renderPage();
      expect(screen.getByText('$1500.00')).toBeTruthy();
    });

    it('renders "Quote on request" when no price', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, estimatedPrice: null }] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('Quote on request')).toBeTruthy();
    });

    it('renders estimated timeline when present', async () => {
      await renderPage();
      expect(screen.getByText('2–4 weeks')).toBeTruthy();
    });

    it('renders feature list (up to 4)', async () => {
      await renderPage();
      expect(screen.getByText('Custom design')).toBeTruthy();
      expect(screen.getByText('Mobile responsive')).toBeTruthy();
      expect(screen.getByText('SEO optimized')).toBeTruthy();
    });

    it('shows "+N more" label when features exceed 4', async () => {
      const manyFeatures = ['A', 'B', 'C', 'D', 'E', 'F'];
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, features: manyFeatures }] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('+2 more')).toBeTruthy();
    });

    it('shows "All clients" badge when clientId is null', async () => {
      await renderPage();
      expect(screen.getByText('All clients')).toBeTruthy();
    });

    it('shows client badge with company name when clientId is set', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, clientId: 10, clientCompany: 'Acme Corp', clientName: 'acme_user' }] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('Acme Corp')).toBeTruthy();
    });

    it('falls back to clientName when clientCompany is null', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, clientId: 11, clientCompany: null, clientName: 'orphan_user' }] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('orphan_user')).toBeTruthy();
    });

    it('falls back to "Client #N" when both company and name are null', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, clientId: 42, clientCompany: null, clientName: null }] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('Client #42')).toBeTruthy();
    });

    it('shows survey field badge when surveyFields present', async () => {
      const fields = [{ id: 'f1', type: 'text', label: 'Q1', required: false }];
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, surveyFields: fields }] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText(/1 survey field/)).toBeTruthy();
    });

    it('pluralises survey field badge for multiple fields', async () => {
      const fields = [
        { id: 'f1', type: 'text', label: 'Q1', required: false },
        { id: 'f2', type: 'text', label: 'Q2', required: false },
      ];
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, surveyFields: fields }] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText(/2 survey fields/)).toBeTruthy();
    });

    it('renders "Active" toggle on an active project', async () => {
      await renderPage();
      expect(screen.getByText('Active')).toBeTruthy();
    });

    it('renders "Inactive" toggle on an inactive project', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, active: false }] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.getByText('Inactive')).toBeTruthy();
    });

    it('shows reduced opacity for inactive projects', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, active: false }] });
        return defaultFetch(url);
      });
      const { container } = await renderPage();
      const card = container.querySelector('.opacity-60');
      expect(card).toBeTruthy();
    });

    it('renders project description when present', async () => {
      await renderPage();
      expect(screen.getByText('A great starter website')).toBeTruthy();
    });

    it('does not render description element when null', async () => {
      setFetchHandler((url) => {
        if (url === '/api/admin/portal/suggested-projects')
          return jsonResponse({ success: true, data: [{ ...baseSP, description: null }] });
        return defaultFetch(url);
      });
      await renderPage();
      expect(screen.queryByText('A great starter website')).toBeNull();
    });
  });

  describe('create project', () => {
    it('shows create form when "New Suggestion" is clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      expect(screen.getByText('Create Suggested Project')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Create' })).toBeTruthy();
    });

    it('hides create form when Cancel is clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      expect(screen.getByText('Create Suggested Project')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText('Create Suggested Project')).toBeNull();
    });

    it('closes create form when "New Suggestion" is toggled again', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      expect(screen.getByText('Create Suggested Project')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      expect(screen.queryByText('Create Suggested Project')).toBeNull();
    });

    it('populates client dropdown with fetched clients', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      expect(screen.getByText('All clients (global)')).toBeTruthy();
      expect(screen.getByText('Acme Corp')).toBeTruthy();
      expect(screen.getByText('orphan_user')).toBeTruthy();
    });

    it('submits create form and adds item to list', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));

      const titleInput = screen.getByText('Title').parentElement!.querySelector('input')!;
      fireEvent.change(titleInput, { target: { value: 'New Project' } });

      fireEvent.submit(titleInput.closest('form')!);
      await waitFor(() => expect(screen.queryByText('Create Suggested Project')).toBeNull());
    });

    it('shows error when create fails', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/portal/suggested-projects' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Server error on create' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      const titleInput = screen.getByText('Title').parentElement!.querySelector('input')!;
      fireEvent.change(titleInput, { target: { value: 'Bad Project' } });
      fireEvent.submit(titleInput.closest('form')!);
      await waitFor(() => expect(screen.getByText('Server error on create')).toBeTruthy());
    });

    it('shows default error message when create fails without message', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/admin/portal/suggested-projects' && init?.method === 'POST') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      const titleInput = screen.getByText('Title').parentElement!.querySelector('input')!;
      fireEvent.change(titleInput, { target: { value: 'Bad Project' } });
      fireEvent.submit(titleInput.closest('form')!);
      await waitFor(() => expect(screen.getByText('Failed')).toBeTruthy());
    });

    it('updates category icon when category changes', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      const catSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      fireEvent.change(catSelect, { target: { value: 'mobile' } });
      // The icon field should now show the mobile icon value
      const iconInput = screen.getByPlaceholderText('rocket_launch') as HTMLInputElement;
      expect(iconInput.value).toBe('phone_iphone');
    });
  });

  describe('edit project', () => {
    it('shows edit form when Edit button clicked', async () => {
      await renderPage();
      const editBtn = screen.getByTitle('Edit');
      fireEvent.click(editBtn);
      expect(screen.getByText(/Editing:/)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Save Changes' })).toBeTruthy();
    });

    it('pre-populates edit form with item values', async () => {
      await renderPage();
      fireEvent.click(screen.getByTitle('Edit'));
      await waitFor(() => {
        const inputs = screen.getAllByDisplayValue('Website Starter');
        expect(inputs.length).toBeGreaterThan(0);
      });
    });

    it('cancels edit and returns to list view', async () => {
      await renderPage();
      fireEvent.click(screen.getByTitle('Edit'));
      expect(screen.getByText(/Editing:/)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(screen.queryByText(/Editing:/)).toBeNull();
    });

    it('saves edit and updates item in list', async () => {
      await renderPage();
      fireEvent.click(screen.getByTitle('Edit'));
      const titleInput = screen.getAllByDisplayValue('Website Starter')[0] as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'Updated Project' } });
      fireEvent.submit(titleInput.closest('form')!);
      await waitFor(() => expect(screen.queryByText(/Editing:/)).toBeNull());
    });

    it('shows error when save fails', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/admin\/portal\/suggested-projects\/\d+$/.test(url) && init?.method === 'PATCH') {
          return jsonResponse({ success: false, message: 'Patch failed' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByTitle('Edit'));
      const titleInput = screen.getAllByDisplayValue('Website Starter')[0] as HTMLInputElement;
      fireEvent.submit(titleInput.closest('form')!);
      await waitFor(() => expect(screen.getByText('Patch failed')).toBeTruthy());
    });

    it('shows default error message when save fails without message', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/admin\/portal\/suggested-projects\/\d+$/.test(url) && init?.method === 'PATCH') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByTitle('Edit'));
      const titleInput = screen.getAllByDisplayValue('Website Starter')[0] as HTMLInputElement;
      fireEvent.submit(titleInput.closest('form')!);
      await waitFor(() => expect(screen.getByText('Failed to save')).toBeTruthy());
    });

    it('converts price from cents to decimal in edit form', async () => {
      await renderPage();
      fireEvent.click(screen.getByTitle('Edit'));
      // 150000 cents → "1500.00"
      await waitFor(() => {
        const priceInput = screen.getByDisplayValue('1500.00') as HTMLInputElement;
        expect(priceInput).toBeTruthy();
      });
    });
  });

  describe('delete project', () => {
    it('calls confirm dialog before deleting', async () => {
      await renderPage();
      fireEvent.click(screen.getByTitle('Delete'));
      expect(confirmMock).toHaveBeenCalledWith('Delete "Website Starter"? This cannot be undone.');
    });

    it('removes item from list after confirmed delete', async () => {
      await renderPage();
      expect(screen.getByText('Website Starter')).toBeTruthy();
      fireEvent.click(screen.getByTitle('Delete'));
      await waitFor(() => expect(screen.queryByText('Website Starter')).toBeNull());
    });

    it('does not delete when confirm is cancelled', async () => {
      confirmMock.mockReturnValueOnce(false);
      await renderPage();
      fireEvent.click(screen.getByTitle('Delete'));
      await flush();
      expect(screen.getByText('Website Starter')).toBeTruthy();
    });

    it('shows alert when delete fails', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/admin\/portal\/suggested-projects\/\d+$/.test(url) && init?.method === 'DELETE') {
          return jsonResponse({ success: false, message: 'Delete failed' });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByTitle('Delete'));
      await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Delete failed'));
    });

    it('shows default alert message when delete fails without message', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/admin\/portal\/suggested-projects\/\d+$/.test(url) && init?.method === 'DELETE') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByTitle('Delete'));
      await waitFor(() => expect(alertMock).toHaveBeenCalledWith('Delete failed'));
    });
  });

  describe('toggleActive', () => {
    it('calls PATCH with toggled active value', async () => {
      await renderPage();
      const toggleBtn = screen.getByText('Active');
      fireEvent.click(toggleBtn);
      await flush();
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        '/api/admin/portal/suggested-projects/1',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });

    it('updates item active state in the list on success', async () => {
      await renderPage();
      const toggleBtn = screen.getByText('Active');
      fireEvent.click(toggleBtn);
      await waitFor(() => expect(screen.getByText('Inactive')).toBeTruthy());
    });

    it('does not update list when toggle PATCH fails', async () => {
      setFetchHandler((url, init) => {
        if (/^\/api\/admin\/portal\/suggested-projects\/\d+$/.test(url) && init?.method === 'PATCH') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      const toggleBtn = screen.getByText('Active');
      fireEvent.click(toggleBtn);
      await flush();
      // Should still show Active (not toggled) since it failed
      expect(screen.getByText('Active')).toBeTruthy();
    });
  });

  describe('form fields', () => {
    it('allows editing the description textarea', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      const descTextareas = screen.getAllByRole('textbox');
      // The description textarea is the third textbox (title, description, icon, features, timeline...)
      // Find by its adjacent label
      const descLabel = screen.getByText('Description');
      const descTextarea = descLabel.parentElement!.querySelector('textarea')!;
      fireEvent.change(descTextarea, { target: { value: 'Great project' } });
      expect((descTextarea as HTMLTextAreaElement).value).toBe('Great project');
    });

    it('renders all category options in create form', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      // Use getAllByText because the card list also shows a "Website" badge
      expect(screen.getAllByText('Website').length).toBeGreaterThan(0);
      expect(screen.getByText('E-Commerce')).toBeTruthy();
      expect(screen.getByText('Mobile App')).toBeTruthy();
      expect(screen.getByText('Maintenance')).toBeTruthy();
      expect(screen.getByText('Branding')).toBeTruthy();
      expect(screen.getByText('Development')).toBeTruthy();
      expect(screen.getByText('Other')).toBeTruthy();
    });

    it('active checkbox is checked by default in create form', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      const activeCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
      expect(activeCheckbox.checked).toBe(true);
    });

    it('can toggle active checkbox in create form', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      const activeCheckbox = screen.getByRole('checkbox') as HTMLInputElement;
      fireEvent.click(activeCheckbox);
      expect(activeCheckbox.checked).toBe(false);
    });

    it('renders survey builder in create form', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /New Suggestion/ }));
      expect(screen.getByTestId('survey-builder')).toBeTruthy();
    });
  });
});
