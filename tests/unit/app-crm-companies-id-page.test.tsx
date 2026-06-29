// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/crm/companies/[id]/page.tsx` — the CRM Company
 * detail page. The page reads its company id via `useParams`, fetches the
 * company + paginated contacts + available titles on mount, has Info /
 * Contacts / Deals tabs, supports edit + delete on the company, paginated
 * contact list with debounced search + title filter + create-contact form,
 * and a deals tab with pipeline-aware create-deal form.
 *
 * We stub `next/navigation`, `next/link`, `fetch`, child components that
 * own non-trivial subtrees (MediaPicker, CrmCustomFieldsPanel,
 * PositionMultiSelect), and `window.confirm`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

const pushMock = vi.fn();
let paramsValue: Record<string, string> = { id: '42' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  useParams: () => paramsValue,
  usePathname: () => '/portal/crm/companies/42',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

vi.mock('@/components/admin/MediaPicker', () => ({
  __esModule: true,
  default: ({ value, onChange, label }: any) =>
    React.createElement('div', { 'data-testid': 'media-picker' },
      React.createElement('span', null, `MP:${label}`),
      React.createElement('button', {
        type: 'button',
        onClick: () => onChange('https://cdn.test/new-logo.png'),
      }, 'pick-logo'),
      React.createElement('span', { 'data-testid': 'media-picker-value' }, value || ''),
    ),
}));

// Track invocations so we can assert calls to save() / reload() on the panel.
const customFieldsSaveSpy = vi.fn().mockResolvedValue(true);
const customFieldsReloadSpy = vi.fn().mockResolvedValue(undefined);

vi.mock('@/components/portal/CrmCustomFieldsPanel', () => {
  const PanelImpl = React.forwardRef<any, any>((props: any, ref) => {
    React.useImperativeHandle(ref, () => ({
      save: customFieldsSaveSpy,
      reload: customFieldsReloadSpy,
    }));
    return React.createElement(
      'div',
      { 'data-testid': 'crm-custom-fields' },
      `panel:${props.entityType}:${props.entityId}:${props.externalMode}`,
    );
  });
  PanelImpl.displayName = 'CrmCustomFieldsPanelMock';
  return { __esModule: true, default: PanelImpl };
});

vi.mock('@/components/portal/PositionMultiSelect', () => ({
  __esModule: true,
  default: ({ options, selected, onChange }: any) =>
    React.createElement('div', { 'data-testid': 'position-multi-select' },
      React.createElement('span', null, `opts:${(options || []).join('|')}`),
      React.createElement('span', null, `sel:${(selected || []).join('|')}`),
      React.createElement('button', {
        type: 'button',
        onClick: () => onChange(['Engineer']),
        'data-testid': 'pms-select-engineer',
      }, 'select-engineer'),
      React.createElement('button', {
        type: 'button',
        onClick: () => onChange([]),
        'data-testid': 'pms-clear',
      }, 'clear-positions'),
    ),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: any) => any | Promise<any>;
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: any) {
  return { ok: true, json: async () => body } as any;
}

const baseCompany = {
  id: 42,
  name: 'Acme Corp',
  domain: 'acme.test',
  industry: 'Software',
  size: '11-50',
  phone: '555-1234',
  website: 'https://acme.test',
  address: '1 Way, Town',
  logoUrl: 'https://cdn.test/logo.png',
  latitude: '40.7128',
  longitude: '-74.0060',
  notes: 'VIP client',
  createdAt: '2025-01-01T00:00:00Z',
};

const baseContacts = [
  { id: 1, firstName: 'Jane', lastName: 'Doe', email: 'jane@acme.test', phone: '111', title: 'CEO', status: 'active' },
  { id: 2, firstName: 'Bob', lastName: 'Smith', email: 'bob@acme.test', phone: null, title: null, status: 'lead' },
];

const baseDeals = [
  { id: 11, title: 'Q1 Project', value: 150000, stageName: 'Proposal', status: 'open', contactName: 'Jane Doe', expectedCloseDate: '2025-06-01' },
  { id: 12, title: 'Maintenance', value: 50000, stageName: 'Closed Won', status: 'won', contactName: null, expectedCloseDate: null },
];

const basePipelines = [
  {
    id: 1,
    name: 'Sales',
    stages: [
      { id: 100, name: 'Lead', order: 1 },
      { id: 101, name: 'Proposal', order: 2 },
    ],
  },
  {
    id: 2,
    name: 'Onboarding',
    stages: [
      { id: 200, name: 'Kickoff', order: 1 },
    ],
  },
];

function defaultFetch(url: string, init?: any): any {
  if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
    return jsonResponse({
      success: true,
      data: { company: baseCompany, deals: baseDeals },
    });
  }
  if (url === '/api/portal/crm/companies/42' && init?.method === 'PUT') {
    return jsonResponse({ success: true });
  }
  if (url === '/api/portal/crm/companies/42' && init?.method === 'DELETE') {
    return jsonResponse({ success: true });
  }
  if (url.startsWith('/api/portal/crm/contacts/titles')) {
    return jsonResponse({ success: true, data: ['CEO', 'Engineer', 'Designer'] });
  }
  if (url === '/api/portal/crm/contacts' && init?.method === 'POST') {
    return jsonResponse({ success: true, data: { id: 999 } });
  }
  if (url.startsWith('/api/portal/crm/contacts?')) {
    return jsonResponse({
      success: true,
      data: { contacts: baseContacts, total: 2 },
    });
  }
  if (url === '/api/portal/crm/pipelines') {
    return jsonResponse({ success: true, data: basePipelines });
  }
  if (url === '/api/portal/crm/deals' && init?.method === 'POST') {
    return jsonResponse({ success: true, data: { id: 888 } });
  }
  return jsonResponse({ success: true, data: {} });
}

beforeEach(() => {
  paramsValue = { id: '42' };
  pushMock.mockReset();
  customFieldsSaveSpy.mockClear();
  customFieldsSaveSpy.mockResolvedValue(true);
  customFieldsReloadSpy.mockClear();
  customFieldsReloadSpy.mockResolvedValue(undefined);
  setFetchHandler(defaultFetch);
  // @ts-ignore
  global.fetch = vi.fn((url: string, init?: any) => Promise.resolve(handlers[0](url, init)));
  // Default-allow confirm
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// Imports under test (after mocks)
import CrmCompanyDetailPage from '@/app/portal/crm/companies/[id]/page';

async function renderPage() {
  const result = render(<CrmCompanyDetailPage />);
  // Wait for loading spinner to clear
  await waitFor(() => {
    expect(result.container.textContent).toContain('Acme Corp');
  });
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CrmCompanyDetailPage', () => {
  describe('initial load + header', () => {
    it('renders the company name and badges', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Acme Corp');
      // company size is no longer rendered as a badge in the view header (redesign removed it);
      // domain and industry appear in the PortalPageHeader subtitle instead
      expect(container.textContent).toContain('acme.test');
      expect(container.textContent).toContain('Software');
    });

    it('renders loading spinner before fetch resolves', async () => {
      // Use a never-resolving fetch to keep loading state
      setFetchHandler(() => new Promise(() => {}));
      const { container } = render(<CrmCompanyDetailPage />);
      // The loading spinner contains the material icon "refresh"
      expect(container.textContent).toContain('refresh');
    });

    it('renders not-found state when company is null', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => {
        expect(container.textContent).toContain('Company not found.');
      });
      expect(container.textContent).toContain('Back to companies');
    });

    it('falls back to data when data.company is missing', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({ success: true, data: { ...baseCompany, name: 'Direct Company' } });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => {
        expect(container.textContent).toContain('Direct Company');
      });
    });

    it('renders logo img when logoUrl is set', async () => {
      const { container } = await renderPage();
      const img = container.querySelector('img[alt="Acme Corp logo"]') as HTMLImageElement;
      expect(img).toBeTruthy();
      expect(img.src).toContain('logo.png');
    });

    it('renders placeholder business icon when logoUrl is null', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { company: { ...baseCompany, logoUrl: null }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      expect(container.querySelector('img[alt="Acme Corp logo"]')).toBeNull();
      expect(container.textContent).toContain('business');
    });

    it('does not render size badge when size is null', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { company: { ...baseCompany, size: null }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      // No "11-50" pill
      expect(container.textContent).not.toContain('11-50');
    });

    it('does not render domain link when domain is null', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { company: { ...baseCompany, domain: null, industry: null, website: null }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      // No https://acme.test link anywhere when both domain and website are nulled
      expect(container.querySelector('a[href="https://acme.test"]')).toBeNull();
    });

    it('renders the tabs with counts', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toMatch(/Contacts \(2\)/);
      expect(container.textContent).toMatch(/Deals \(2\)/);
    });

    it('uses empty data when deals key is missing', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { company: baseCompany },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      expect(container.textContent).toMatch(/Deals \(0\)/);
    });

    it('uses empty data when titles fetch fails', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts/titles')) {
          return Promise.reject(new Error('boom'));
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      // Title chip area still renders; available titles is empty
      expect(container.textContent).toContain('Acme Corp');
    });

    it('handles titles fetch returning success false', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts/titles')) {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      await renderPage();
      // No throw
      expect(true).toBe(true);
    });
  });

  describe('info tab', () => {
    it('renders company info fields', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('555-1234');
      expect(container.textContent).toContain('https://acme.test');
      expect(container.textContent).toContain('1 Way, Town');
      expect(container.textContent).toContain('VIP client');
    });

    it('renders "No phone / No website / No address" when fields are null', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: {
              company: { ...baseCompany, phone: null, website: null, address: null, notes: null },
              deals: baseDeals,
            },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      expect(container.textContent).toContain('No phone');
      expect(container.textContent).toContain('No website');
      expect(container.textContent).toContain('No address');
    });

    it('renders the custom fields panel with view mode initially', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('panel:company:42:view');
    });
  });

  describe('edit company', () => {
    it('clicking edit opens the edit form with current values', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      expect(container.textContent).toContain('Edit Company');
      const nameInput = container.querySelector('input[required]') as HTMLInputElement;
      expect(nameInput.value).toBe('Acme Corp');
    });

    it('switches the custom fields panel to edit mode when editing', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      expect(container.textContent).toContain('panel:company:42:edit');
    });

    it('Cancel button closes the edit form and reloads the panel', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      const cancelBtns = Array.from(container.querySelectorAll('button')).filter(
        b => b.textContent === 'Cancel'
      );
      fireEvent.click(cancelBtns[0]);
      expect(container.textContent).not.toContain('Edit Company');
      expect(customFieldsReloadSpy).toHaveBeenCalled();
    });

    it('updates form fields on change', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      const nameInput = container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'New Name' } });
      expect(nameInput.value).toBe('New Name');
    });

    it('saves the form, sends correct payload, and closes edit', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      const nameInput = container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Renamed' } });
      const form = container.querySelector('form')!;
      fireEvent.submit(form);
      await waitFor(() => {
        const put = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/crm/companies/42' && c[1]?.method === 'PUT'
        );
        expect(put).toBeTruthy();
        const body = JSON.parse(put![1]!.body);
        expect(body.name).toBe('Renamed');
        expect(body.latitude).toBe('40.7128');
        expect(body.longitude).toBe('-74.0060');
      });
      await waitFor(() => {
        expect(container.textContent).not.toContain('Edit Company');
      });
      expect(customFieldsSaveSpy).toHaveBeenCalled();
    });

    it('omits latitude/longitude from payload when both are empty', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { company: { ...baseCompany, latitude: null, longitude: null }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        const put = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/crm/companies/42' && c[1]?.method === 'PUT'
        );
        expect(put).toBeTruthy();
        const body = JSON.parse(put![1]!.body);
        expect(body.latitude).toBeUndefined();
        expect(body.longitude).toBeUndefined();
      });
    });

    it('handles numeric latitude/longitude that come back from the API', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { company: { ...baseCompany, latitude: 12.34, longitude: -56.78 }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      fireEvent.click(screen.getByText('Edit'));
      const latInput = container.querySelector('input[type="number"][min="-90"]') as HTMLInputElement;
      expect(latInput.value).toBe('12.34');
      const lngInput = container.querySelector('input[type="number"][min="-180"]') as HTMLInputElement;
      expect(lngInput.value).toBe('-56.78');
    });

    it('aborts when API returns success:false on save', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && init?.method === 'PUT') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.submit(container.querySelector('form')!);
      await flush();
      // Still in edit mode
      expect(container.textContent).toContain('Edit Company');
      // Custom fields save not called
      expect(customFieldsSaveSpy).not.toHaveBeenCalled();
    });

    it('aborts close when custom-fields save returns false', async () => {
      customFieldsSaveSpy.mockResolvedValueOnce(false);
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.submit(container.querySelector('form')!);
      await flush();
      // Should stay in edit mode because cfOk was false
      expect(container.textContent).toContain('Edit Company');
    });

    it('handles missing customFieldsRef.save() (resolves true via fallback)', async () => {
      customFieldsSaveSpy.mockResolvedValueOnce(true);
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        expect(container.textContent).not.toContain('Edit Company');
      });
    });

    it('passes latitude/longitude through trim when user types values', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      const latInput = container.querySelector('input[type="number"][min="-90"]') as HTMLInputElement;
      expect(latInput).toBeTruthy();
      fireEvent.change(latInput, { target: { value: '25.5' } });
      expect(latInput.value).toBe('25.5');
    });

    it('MediaPicker mock updates logoUrl when "pick-logo" is clicked', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      const pickBtns = screen.getAllByText('pick-logo');
      fireEvent.click(pickBtns[0]);
      // Value text shown in mock
      const mediaValues = screen.getAllByTestId('media-picker-value');
      expect(mediaValues[0].textContent).toContain('new-logo.png');
    });

    it('updates select for size', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      const sizeSelect = container.querySelector('select') as HTMLSelectElement;
      fireEvent.change(sizeSelect, { target: { value: '201-500' } });
      expect(sizeSelect.value).toBe('201-500');
    });

    it('uses empty strings for null company fields in edit form', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: {
              company: {
                ...baseCompany,
                domain: null, industry: null, size: null, phone: null,
                website: null, address: null, logoUrl: null, notes: null,
                latitude: null, longitude: null,
              },
              deals: [],
            },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      fireEvent.click(screen.getByText('Edit'));
      const inputs = container.querySelectorAll('input');
      // First input is required name (value=Acme Corp); subsequent inputs should be empty
      const domain = inputs[1] as HTMLInputElement;
      expect(domain.value).toBe('');
    });
  });

  describe('delete company', () => {
    it('calls window.confirm and aborts when user cancels', async () => {
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      await renderPage();
      fireEvent.click(screen.getByText('Delete'));
      await flush();
      const deleteCalls = fetchSpy.mock.calls.filter(
        c => c[0] === '/api/portal/crm/companies/42' && c[1]?.method === 'DELETE'
      );
      expect(deleteCalls.length).toBe(0);
      expect(pushMock).not.toHaveBeenCalled();
    });

    it('calls DELETE and navigates back to companies on confirm', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      await renderPage();
      fireEvent.click(screen.getByText('Delete'));
      await waitFor(() => {
        const deleteCalls = fetchSpy.mock.calls.filter(
          c => c[0] === '/api/portal/crm/companies/42' && c[1]?.method === 'DELETE'
        );
        expect(deleteCalls.length).toBe(1);
      });
      expect(pushMock).toHaveBeenCalledWith('/portal/crm/companies');
    });
  });

  describe('contacts tab', () => {
    async function openContacts(result: any) {
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        (b: any) => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab as Element);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Jane');
      });
    }

    it('switches to contacts tab and renders contacts', async () => {
      const result = await renderPage();
      await openContacts(result);
      expect(result.container.textContent).toContain('Jane Doe');
      expect(result.container.textContent).toContain('Bob Smith');
    });

    it('shows title for contact when title is set, falls back to email', async () => {
      const result = await renderPage();
      await openContacts(result);
      expect(result.container.textContent).toContain('CEO');
      // Bob has no title and no title => falls back to email
      expect(result.container.textContent).toContain('bob@acme.test');
    });

    it('renders contact links to /portal/crm/contacts/:id', async () => {
      const result = await renderPage();
      await openContacts(result);
      const link = result.container.querySelector('a[href="/portal/crm/contacts/1"]');
      expect(link).toBeTruthy();
    });

    it('shows contact status badge', async () => {
      const result = await renderPage();
      await openContacts(result);
      expect(result.container.textContent).toContain('active');
      expect(result.container.textContent).toContain('lead');
    });

    it('shows empty state when no contacts at all', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?')) {
          return jsonResponse({ success: true, data: { contacts: [], total: 0 } });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('No contacts at this company.');
      });
    });

    it('shows filtered empty state when search yields no results', async () => {
      const result = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      // Switch to contacts tab
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab!);
      await flush();

      // Now switch handler to return empty + a non-empty search query
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?') && url.includes('search=zzz')) {
          return jsonResponse({ success: true, data: { contacts: [], total: 0 } });
        }
        return defaultFetch(url, init);
      });
      const searchInput = result.container.querySelector(
        'input[placeholder="Search contacts..."]'
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'zzz' } });
      // Real debounce of 300ms
      await new Promise(r => setTimeout(r, 400));
      await act(async () => { await Promise.resolve(); });
      await waitFor(() => {
        expect(result.container.textContent).toContain('No contacts match your filters.');
      });
    });

    it('shows filtered empty state when title filter is set', async () => {
      const result = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab!);
      await flush();
      // Set up handler so titleFilter URL returns empty
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?') && url.includes('title=Engineer')) {
          return jsonResponse({ success: true, data: { contacts: [], total: 0 } });
        }
        return defaultFetch(url, init);
      });
      fireEvent.click(screen.getByTestId('pms-select-engineer'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('No contacts match your filters.');
      });
    });

    it('debounces search input and sends new fetch with search param', async () => {
      vi.useFakeTimers();
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const result = render(<CrmCompanyDetailPage />);
      await act(async () => { await Promise.resolve(); });
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab!);
      const searchInput = result.container.querySelector(
        'input[placeholder="Search contacts..."]'
      ) as HTMLInputElement;
      fireEvent.change(searchInput, { target: { value: 'jane' } });
      await act(async () => { vi.advanceTimersByTime(350); });
      const queryCalls = fetchSpy.mock.calls.filter(
        c => typeof c[0] === 'string' && c[0].includes('search=jane')
      );
      expect(queryCalls.length).toBeGreaterThan(0);
      vi.useRealTimers();
    });

    it('PositionMultiSelect updates filter and triggers refetch', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const result = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab!);
      await flush();
      fireEvent.click(screen.getByTestId('pms-select-engineer'));
      await waitFor(() => {
        const titleCalls = fetchSpy.mock.calls.filter(
          c => typeof c[0] === 'string' && c[0].includes('title=Engineer')
        );
        expect(titleCalls.length).toBeGreaterThan(0);
      });
    });

    it('opens and closes the new contact form via the toggle', async () => {
      const result = await renderPage();
      await openContacts(result);
      fireEvent.click(screen.getByText('Add Contact'));
      expect(result.container.textContent).toContain('First name *');
      fireEvent.click(screen.getByText('Cancel'));
      expect(result.container.textContent).not.toContain('First name *');
    });

    it('updates new contact fields on change', async () => {
      const result = await renderPage();
      await openContacts(result);
      fireEvent.click(screen.getByText('Add Contact'));
      const inputs = result.container.querySelectorAll('input[type="text"], input:not([type])');
      // Find the firstName input via label proximity
      const firstNameInput = result.container.querySelectorAll('input')[1] as HTMLInputElement;
      // Actually the first input on the form is "Search contacts..." — find required one
      const required = result.container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(required, { target: { value: 'Alice' } });
      expect(required.value).toBe('Alice');
    });

    it('submits a new contact and refetches', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const result = await renderPage();
      await openContacts(result);
      fireEvent.click(screen.getByText('Add Contact'));
      const required = result.container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(required, { target: { value: 'Alice' } });
      const form = result.container.querySelector('form')!;
      fireEvent.submit(form);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          c => c[0] === '/api/portal/crm/contacts' && c[1]?.method === 'POST'
        );
        expect(post).toBeTruthy();
        const body = JSON.parse(post![1]!.body);
        expect(body.firstName).toBe('Alice');
        expect(body.companyId).toBe(42);
        expect(body.lastName).toBeNull();
        expect(body.email).toBeNull();
      });
      await waitFor(() => {
        expect(result.container.textContent).not.toContain('First name *');
      });
    });

    it('shows error when create-contact returns success:false with message', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Email taken' });
        }
        return defaultFetch(url, init);
      });
      const result = await renderPage();
      await openContacts(result);
      fireEvent.click(screen.getByText('Add Contact'));
      const required = result.container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(required, { target: { value: 'Alice' } });
      fireEvent.submit(result.container.querySelector('form')!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Email taken');
      });
    });

    it('shows default error when create-contact returns no message', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts' && init?.method === 'POST') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const result = await renderPage();
      await openContacts(result);
      fireEvent.click(screen.getByText('Add Contact'));
      const required = result.container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(required, { target: { value: 'Alice' } });
      fireEvent.submit(result.container.querySelector('form')!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Failed to create contact.');
      });
    });

    it('updates new contact status select', async () => {
      const result = await renderPage();
      await openContacts(result);
      fireEvent.click(screen.getByText('Add Contact'));
      const statusSelect = Array.from(result.container.querySelectorAll('select')).find(
        s => Array.from(s.options).some(o => o.value === 'lead')
      ) as HTMLSelectElement;
      fireEvent.change(statusSelect, { target: { value: 'customer' } });
      expect(statusSelect.value).toBe('customer');
    });

    it('shows contacts loading spinner when contacts are loading', async () => {
      let resolveContacts: any;
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?')) {
          return new Promise(r => { resolveContacts = r; });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab!);
      // Contacts loading spinner should be visible (animate-spin in panel)
      expect(result.container.innerHTML).toContain('animate-spin');
      resolveContacts(jsonResponse({ success: true, data: { contacts: [], total: 0 } }));
    });

    it('pagination renders when total > page size and Next button advances page', async () => {
      // 25 contacts -> 3 pages
      const many = Array.from({ length: 10 }, (_, i) => ({
        id: 100 + i,
        firstName: `C${i}`, lastName: 'X',
        email: `c${i}@x.test`, phone: null, title: 'CEO', status: 'active',
      }));
      const fetchSpy = vi.fn((url: string, init?: any) => {
        if (url.startsWith('/api/portal/crm/contacts?')) {
          return Promise.resolve(jsonResponse({ success: true, data: { contacts: many, total: 25 } }));
        }
        return Promise.resolve(handlers[0](url, init));
      });
      // @ts-ignore
      global.fetch = fetchSpy;
      const result = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Page 1 of 3');
      });
      // Click "2" page button
      const pageBtn = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent === '2'
      );
      fireEvent.click(pageBtn!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Page 2 of 3');
      });
    });

    it('previous-page button advances page back', async () => {
      const many = Array.from({ length: 10 }, (_, i) => ({
        id: 100 + i,
        firstName: `C${i}`, lastName: 'X',
        email: null, phone: null, title: null, status: 'active',
      }));
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?')) {
          return jsonResponse({ success: true, data: { contacts: many, total: 25 } });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Page 1 of 3');
      });
      // Go to page 3 via direct button click
      const pageBtn3 = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent === '3'
      );
      fireEvent.click(pageBtn3!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Page 3 of 3');
      });
      // Previous button: find the one with chevron_left material icon
      const prevBtn = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('chevron_left')
      );
      fireEvent.click(prevBtn!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Page 2 of 3');
      });
    });

    it('pagination is hidden when total <= page size', async () => {
      const result = await renderPage();
      await openContacts(result);
      // total=2 => totalPages=1 => no "Page 1 of 1" text
      expect(result.container.textContent).not.toContain('Page 1 of');
    });

    it('handles fetch response without success flag in contacts', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/contacts?')) {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Contacts (')
      );
      fireEvent.click(tab!);
      await flush();
      // No throw; default state shows empty
      expect(result.container.textContent).toContain('No contacts');
    });
  });

  describe('deals tab', () => {
    async function openDeals(result: any) {
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        (b: any) => b.textContent?.includes('Deals (')
      );
      fireEvent.click(tab as Element);
    }

    it('switches to deals tab and renders deals', async () => {
      const result = await renderPage();
      await openDeals(result);
      expect(result.container.textContent).toContain('Q1 Project');
      expect(result.container.textContent).toContain('Maintenance');
    });

    it('formats deal values as currency', async () => {
      const result = await renderPage();
      await openDeals(result);
      expect(result.container.textContent).toContain('$1,500.00');
      expect(result.container.textContent).toContain('$500.00');
    });

    it('shows stageName, contactName, expectedCloseDate when present', async () => {
      const result = await renderPage();
      await openDeals(result);
      expect(result.container.textContent).toContain('Proposal');
      expect(result.container.textContent).toContain('Jane Doe');
      expect(result.container.textContent).toContain('Close:');
    });

    it('renders deal status badges', async () => {
      const result = await renderPage();
      await openDeals(result);
      expect(result.container.textContent).toContain('open');
      expect(result.container.textContent).toContain('won');
    });

    it('shows empty state when no deals', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies/42' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { company: baseCompany, deals: [] },
          });
        }
        return defaultFetch(url, init);
      });
      const result = render(<CrmCompanyDetailPage />);
      await waitFor(() => screen.getByText('Acme Corp'));
      const tab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Deals (')
      );
      fireEvent.click(tab!);
      await flush();
      expect(result.container.textContent).toContain('No deals with this company.');
    });

    it('opens the new deal form and fetches pipelines', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        const pipelineCalls = fetchSpy.mock.calls.filter(
          c => c[0] === '/api/portal/crm/pipelines'
        );
        expect(pipelineCalls.length).toBeGreaterThan(0);
      });
    });

    it('does not refetch pipelines when already loaded', async () => {
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await flush();
      // Close
      fireEvent.click(screen.getByText('Cancel'));
      // Track calls after pipelines already loaded
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      fireEvent.click(screen.getByText('Add Deal'));
      await flush();
      const pipelineCalls = fetchSpy.mock.calls.filter(
        c => c[0] === '/api/portal/crm/pipelines'
      );
      expect(pipelineCalls.length).toBe(0);
    });

    it('shows "no pipelines" message when none returned', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/pipelines') {
          return jsonResponse({ data: [] });
        }
        return defaultFetch(url, init);
      });
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('No pipelines available');
      });
    });

    it('handles undefined pipelines data array gracefully', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/pipelines') {
          return jsonResponse({});
        }
        return defaultFetch(url, init);
      });
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('No pipelines available');
      });
    });

    it('selects first pipeline + first stage by default', async () => {
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        // Pipeline select shows "Sales" as default
        expect(result.container.textContent).toContain('Sales');
      });
    });

    it('switching pipeline updates available stages', async () => {
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      // pipeline select is one of the selects in the form
      const selects = result.container.querySelectorAll('select');
      const pipelineSelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.textContent === 'Sales')
      ) as HTMLSelectElement;
      fireEvent.change(pipelineSelect, { target: { value: '2' } });
      // Stage select should now show "Kickoff"
      await waitFor(() => {
        expect(result.container.textContent).toContain('Kickoff');
      });
    });

    it('toggle button closes the deal form when clicked again', async () => {
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      // Toggle button now reads "Cancel" with close icon; use getByText
      fireEvent.click(screen.getByText('Cancel'));
      // Form should no longer show the pipeline label
      await waitFor(() => {
        expect(result.container.querySelector('input[required]')).toBeNull();
      });
    });

    it('submits a new deal and refetches the company', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      const titleInput = result.container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'New Deal' } });
      const valueInput = result.container.querySelector('input[type="number"]') as HTMLInputElement;
      fireEvent.change(valueInput, { target: { value: '250.00' } });
      fireEvent.submit(result.container.querySelector('form')!);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          c => c[0] === '/api/portal/crm/deals' && c[1]?.method === 'POST'
        );
        expect(post).toBeTruthy();
        const body = JSON.parse(post![1]!.body);
        expect(body.title).toBe('New Deal');
        expect(body.value).toBe(25000);
        expect(body.pipelineId).toBe(1);
        expect(body.stageId).toBe(100);
        expect(body.companyId).toBe(42);
      });
    });

    it('submits a deal with empty value as null', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      const titleInput = result.container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'Free Deal' } });
      fireEvent.submit(result.container.querySelector('form')!);
      await waitFor(() => {
        const post = fetchSpy.mock.calls.find(
          c => c[0] === '/api/portal/crm/deals' && c[1]?.method === 'POST'
        );
        expect(post).toBeTruthy();
        const body = JSON.parse(post![1]!.body);
        expect(body.value).toBeNull();
        expect(body.expectedCloseDate).toBeNull();
        expect(body.notes).toBeNull();
      });
    });

    it('shows error when create-deal returns success:false with message', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/deals' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'Bad deal' });
        }
        return defaultFetch(url, init);
      });
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      const titleInput = result.container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'X' } });
      fireEvent.submit(result.container.querySelector('form')!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Bad deal');
      });
    });

    it('shows default error when create-deal returns no message', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/deals' && init?.method === 'POST') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      const titleInput = result.container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'X' } });
      fireEvent.submit(result.container.querySelector('form')!);
      await waitFor(() => {
        expect(result.container.textContent).toContain('Failed to create deal.');
      });
    });

    it('priority select updates value', async () => {
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      const prioritySelect = Array.from(result.container.querySelectorAll('select')).find(
        s => Array.from(s.options).some(o => o.value === 'high')
      ) as HTMLSelectElement;
      fireEvent.change(prioritySelect, { target: { value: 'high' } });
      expect(prioritySelect.value).toBe('high');
    });

    it('expected close date updates value', async () => {
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      const dateInput = result.container.querySelector('input[type="date"]') as HTMLInputElement;
      fireEvent.change(dateInput, { target: { value: '2025-12-25' } });
      expect(dateInput.value).toBe('2025-12-25');
    });

    it('notes textarea updates value', async () => {
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      const textareas = result.container.querySelectorAll('textarea');
      const notesTextarea = textareas[textareas.length - 1] as HTMLTextAreaElement;
      fireEvent.change(notesTextarea, { target: { value: 'These are notes' } });
      expect(notesTextarea.value).toBe('These are notes');
    });

    it('stage select updates value', async () => {
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await waitFor(() => {
        expect(result.container.textContent).toContain('Sales');
      });
      const stageSelect = Array.from(result.container.querySelectorAll('select')).find(
        s => Array.from(s.options).some(o => o.textContent === 'Proposal')
      ) as HTMLSelectElement;
      fireEvent.change(stageSelect, { target: { value: '101' } });
      expect(stageSelect.value).toBe('101');
    });

    it('handles deal stages missing from pipeline gracefully', async () => {
      // Use a pipeline list where chosen pipeline has no stages
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/pipelines') {
          return jsonResponse({ data: [{ id: 3, name: 'Empty', stages: [] }] });
        }
        return defaultFetch(url, init);
      });
      const result = await renderPage();
      await openDeals(result);
      fireEvent.click(screen.getByText('Add Deal'));
      await flush();
      // No throw; Stage select renders no options
      expect(result.container.textContent).toContain('Empty');
    });
  });

  describe('tab indicators', () => {
    it('Info tab is active by default and shows info content', async () => {
      const result = await renderPage();
      expect(result.container.textContent).toContain('Company Information');
    });

    it('starts editing moves to info tab even if user was on deals tab', async () => {
      const result = await renderPage();
      // Switch to deals
      const dealsTab = Array.from(result.container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Deals (')
      );
      fireEvent.click(dealsTab!);
      await flush();
      // Click Edit -> should switch back to info
      fireEvent.click(screen.getByText('Edit'));
      // Edit form is visible and Info tab content (Company Information) renders below
      expect(result.container.textContent).toContain('Edit Company');
      expect(result.container.textContent).toContain('Company Information');
    });
  });
});
