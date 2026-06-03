/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/ban-ts-comment, react-hooks/rules-of-hooks, @typescript-eslint/no-require-imports */
// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/crm/contacts/[id]/page.tsx` — the CRM Contact
 * detail page. The page reads its contact id via `useParams`, fetches the
 * contact + activities + companies on mount, supports edit + delete on the
 * contact, tag add/remove, notes auto-save, log-activity, send-email, and
 * renders an activity timeline and deals list.
 *
 * We stub `next/navigation`, `next/link`, `fetch`, `CrmCustomFieldsPanel`,
 * and `window.confirm`.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

const pushMock = vi.fn();
let paramsValue: Record<string, string> = { id: '7' };

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
  usePathname: () => '/portal/crm/contacts/7',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

vi.mock('@/components/portal/CrmCustomFieldsPanel', () => ({
  __esModule: true,
  default: (props: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'crm-custom-fields' },
      `panel:${props.entityType}:${props.entityId}`,
    ),
}));

// Render CrmCompanyTypeaheadPicker as a native <select> backed by a prefetched
// company list. Uses local state so React's controlled-select validation works
// for any option value, and `fireEvent.change` always fires the callback.
vi.mock('@/components/portal/CrmCompanyTypeaheadPicker', () => {
  const { useState, useEffect } = require('react');
  const { createElement: h } = require('react');
  return {
    __esModule: true,
    default: ({ value, selectedLabel, onChange, placeholder, noneLabel }: any) => {
      const [opts, setOpts] = useState<{ id: number; name: string }[]>([]);
      useEffect(() => {
        fetch('/api/portal/crm/companies?limit=5000')
          .then((r: any) => r.json())
          .then((d: any) => {
            const rows = d?.data?.companies ?? d?.data ?? [];
            if (Array.isArray(rows)) setOpts(rows);
          })
          .catch(() => {});
      }, []);
      // Local selection state so the controlled <select> always reflects changes
      const [sel, setSel] = useState(value ?? '');
      useEffect(() => { setSel(value ?? ''); }, [value]);
      const noneText = noneLabel ?? placeholder ?? 'None';
      const allOpts = [...opts];
      if (value && selectedLabel && !allOpts.find((o: any) => String(o.id) === String(value))) {
        allOpts.unshift({ id: Number(value), name: selectedLabel });
      }
      return h(
        'select',
        {
          'data-testid': 'company-typeahead',
          value: sel,
          onChange: (e: any) => {
            const v = e.target.value;
            setSel(v);
            if (!v) { onChange(null); return; }
            const text = e.target.options?.[e.target.selectedIndex]?.text ?? String(v);
            onChange({ id: Number(v), name: text });
          },
        },
        h('option', { key: '__none', value: '' }, noneText),
        ...allOpts.map((c: any) => h('option', { key: c.id, value: String(c.id) }, c.name)),
      );
    },
  };
});

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

const baseContact = {
  id: 7,
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.test',
  phone: '555-2345',
  linkedinUrl: 'https://linkedin.com/in/janedoe',
  title: 'CTO',
  companyId: 42,
  companyName: 'Acme Corp',
  status: 'active',
  source: 'web',
  address: '123 Main St',
  notes: 'VIP contact',
  tags: [
    { id: 1, name: 'priority', color: '#ff0000' },
    { id: 2, name: 'enterprise', color: null },
  ],
  score: 85,
  ownerId: 99,
  lastContactedAt: null,
  createdAt: '2025-01-01T00:00:00Z',
};

const baseActivities = [
  { id: 11, type: 'call', title: 'Discovery call', description: 'Initial outreach', createdAt: new Date(Date.now() - 60000).toISOString() },
  { id: 12, type: 'email', title: 'Follow-up email', description: null, createdAt: new Date(Date.now() - 3600000).toISOString() },
];

const baseDeals = [
  { id: 100, title: 'Big Deal', value: 150000, stageName: 'Proposal', status: 'open' },
  { id: 101, title: 'Lost Cause', value: 50000, stageName: 'Closed Lost', status: 'lost' },
];

const baseCompanies = [
  { id: 42, name: 'Acme Corp' },
  { id: 43, name: 'Globex' },
];

function defaultFetch(url: string, init?: any): any {
  if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
    return jsonResponse({
      success: true,
      data: { contact: baseContact, deals: baseDeals },
    });
  }
  if (url === '/api/portal/crm/contacts/7' && init?.method === 'PUT') {
    return jsonResponse({ success: true });
  }
  if (url === '/api/portal/crm/contacts/7' && init?.method === 'DELETE') {
    return jsonResponse({ success: true });
  }
  if (url.startsWith('/api/portal/crm/activities?contactId=')) {
    return jsonResponse({ success: true, data: baseActivities });
  }
  if (url === '/api/portal/crm/activities' && init?.method === 'POST') {
    return jsonResponse({ success: true, data: { id: 999 } });
  }
  if (url === '/api/portal/crm/companies?limit=5000') {
    return jsonResponse({ success: true, data: { companies: baseCompanies } });
  }
  if (url === '/api/portal/crm/tags' && init?.method === 'POST') {
    return jsonResponse({ success: true, data: { id: 5, name: 'hot', color: '#00ff00' } });
  }
  if (url === '/api/portal/crm/contacts/7/send-email' && init?.method === 'POST') {
    return jsonResponse({ success: true });
  }
  return jsonResponse({ success: true, data: {} });
}

beforeEach(() => {
  paramsValue = { id: '7' };
  pushMock.mockReset();
  setFetchHandler(defaultFetch);
  // @ts-ignore
  global.fetch = vi.fn((url: string, init?: any) => Promise.resolve(handlers[0](url, init)));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

// Imports under test (after mocks)
import CrmContactDetailPage from '@/app/portal/crm/contacts/[id]/page';

async function renderPage() {
  const result = render(<CrmContactDetailPage />);
  await waitFor(() => {
    expect(result.container.textContent).toContain('Jane Doe');
  });
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CrmContactDetailPage', () => {
  describe('initial load + header', () => {
    it('renders the contact name and status', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Jane Doe');
      expect(container.textContent).toContain('active');
    });

    it('renders the score badge when score > 0', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('85');
    });

    it('does not render the score badge when score is 0', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { contact: { ...baseContact, score: 0 }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      // Score badge contains "star" icon text; ensure no 85
      expect(container.textContent).not.toContain('85');
    });

    it('renders title and company link in header', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('CTO');
      const companyLink = container.querySelector('a[href="/portal/crm/companies/42"]');
      expect(companyLink).toBeTruthy();
      expect(companyLink?.textContent).toContain('Acme Corp');
    });

    it('renders loading spinner before fetch resolves', () => {
      setFetchHandler(() => new Promise(() => {}));
      const { container } = render(<CrmContactDetailPage />);
      expect(container.textContent).toContain('refresh');
    });

    it('renders not-found state when contact is null', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => {
        expect(container.textContent).toContain('Contact not found.');
      });
      expect(container.textContent).toContain('Back to contacts');
    });

    it('falls back to data when data.contact is missing', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({ success: true, data: { ...baseContact, firstName: 'Bob', notes: 'note via fallback' } });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => {
        expect(container.textContent).toContain('Bob Doe');
      });
    });

    it('uses default status color when status is unknown', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { contact: { ...baseContact, status: 'archived' }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('archived');
    });
  });

  describe('contact info section', () => {
    it('renders email, phone, linkedin (truncated), address, source, and created date', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('jane@example.test');
      expect(container.textContent).toContain('555-2345');
      expect(container.textContent).toContain('linkedin.com/in/janedoe');
      expect(container.textContent).toContain('123 Main St');
      expect(container.textContent).toContain('web');
    });

    it('renders "No email/phone/LinkedIn/address" placeholders when null', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: {
              contact: {
                ...baseContact,
                email: null, phone: null, linkedinUrl: null,
                address: null, source: null,
              },
              deals: baseDeals,
            },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('No email');
      expect(container.textContent).toContain('No phone');
      expect(container.textContent).toContain('No LinkedIn');
      expect(container.textContent).toContain('No address');
      expect(container.textContent).toContain('Unknown source');
    });

    it('renders custom fields panel with contact entity', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('panel:contact:7');
    });
  });

  describe('edit contact', () => {
    it('clicking Edit opens the edit form with current values', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      expect(container.textContent).toContain('Edit Contact');
      // First required input = firstName = Jane
      const firstNameInput = container.querySelector('input[required]') as HTMLInputElement;
      expect(firstNameInput.value).toBe('Jane');
    });

    it('Cancel button closes the edit form', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      expect(container.textContent).toContain('Edit Contact');
      fireEvent.click(screen.getByText('Cancel'));
      expect(container.textContent).not.toContain('Edit Contact');
    });

    it('updates form fields on change', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      const firstNameInput = container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(firstNameInput, { target: { value: 'Janet' } });
      expect(firstNameInput.value).toBe('Janet');
    });

    it('saves the form, sends correct payload, and closes edit', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      const firstNameInput = container.querySelector('input[required]') as HTMLInputElement;
      fireEvent.change(firstNameInput, { target: { value: 'Janet' } });
      const form = container.querySelector('form')!;
      fireEvent.submit(form);
      await waitFor(() => {
        const put = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/crm/contacts/7' && c[1]?.method === 'PUT'
        );
        expect(put).toBeTruthy();
        const body = JSON.parse(put![1]!.body);
        expect(body.firstName).toBe('Janet');
        expect(body.companyId).toBe(42);
      });
      await waitFor(() => {
        expect(container.textContent).not.toContain('Edit Contact');
      });
    });

    it('passes null companyId when companyId field is empty', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { contact: { ...baseContact, companyId: null, companyName: null }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.submit(container.querySelector('form')!);
      await waitFor(() => {
        const put = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/crm/contacts/7' && c[1]?.method === 'PUT'
        );
        expect(put).toBeTruthy();
        const body = JSON.parse(put![1]!.body);
        expect(body.companyId).toBeNull();
      });
    });

    it('aborts close when API returns success:false on save', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && init?.method === 'PUT') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      fireEvent.submit(container.querySelector('form')!);
      await flush();
      expect(container.textContent).toContain('Edit Contact');
    });

    it('uses empty strings for null contact fields in edit form', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: {
              contact: {
                ...baseContact,
                email: null, phone: null, linkedinUrl: null, title: null,
                companyId: null, source: null, address: null,
              },
              deals: baseDeals,
            },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      fireEvent.click(screen.getByText('Edit'));
      const inputs = container.querySelectorAll('input');
      // 0: firstName="Jane", 1: lastName="Doe", 2: email="" etc.
      const emailInput = inputs[2] as HTMLInputElement;
      expect(emailInput.value).toBe('');
    });

    it('populates company select with companies fetched on mount', async () => {
      const { container } = await renderPage();
      fireEvent.click(screen.getByText('Edit'));
      const selects = container.querySelectorAll('select');
      // Find company select (has option text "Acme Corp")
      const companySelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.textContent === 'Acme Corp')
      ) as HTMLSelectElement;
      expect(companySelect).toBeTruthy();
      expect(companySelect.value).toBe('42');
    });

    it('handles companies fetch returning array directly', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies?limit=5000') {
          return jsonResponse({ success: true, data: baseCompanies });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      fireEvent.click(screen.getByText('Edit'));
      const selects = container.querySelectorAll('select');
      const companySelect = Array.from(selects).find(s =>
        Array.from(s.options).some(o => o.textContent === 'Acme Corp')
      ) as HTMLSelectElement;
      expect(companySelect).toBeTruthy();
    });

    it('handles companies fetch returning empty/no data', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/companies?limit=5000') {
          return jsonResponse({});
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      // Should not crash
      expect(container.textContent).toContain('Jane Doe');
    });

    it('startEditing no-ops when contact is not yet loaded', async () => {
      // Simulate a never-resolving load and render — there should be no Edit button visible
      setFetchHandler(() => new Promise(() => {}));
      const { container } = render(<CrmContactDetailPage />);
      // While loading, the Edit button does not render
      expect(container.querySelector('button')).toBeNull();
    });
  });

  describe('delete contact', () => {
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
        c => c[0] === '/api/portal/crm/contacts/7' && c[1]?.method === 'DELETE'
      );
      expect(deleteCalls.length).toBe(0);
      expect(pushMock).not.toHaveBeenCalled();
    });

    it('calls DELETE and navigates back to contacts on confirm', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      await renderPage();
      fireEvent.click(screen.getByText('Delete'));
      await waitFor(() => {
        const deleteCalls = fetchSpy.mock.calls.filter(
          c => c[0] === '/api/portal/crm/contacts/7' && c[1]?.method === 'DELETE'
        );
        expect(deleteCalls.length).toBe(1);
      });
      expect(pushMock).toHaveBeenCalledWith('/portal/crm/contacts');
    });
  });

  describe('tags', () => {
    it('renders existing tags', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('priority');
      expect(container.textContent).toContain('enterprise');
    });

    it('renders "No tags yet" placeholder when tags is empty', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { contact: { ...baseContact, tags: [] }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('No tags yet.');
    });

    it('Add tag button is disabled when input is empty', async () => {
      const { container } = await renderPage();
      const addBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent === 'Add'
      ) as HTMLButtonElement;
      expect(addBtn.disabled).toBe(true);
    });

    it('typing in tag input enables the Add button', async () => {
      const { container } = await renderPage();
      const tagInput = container.querySelector(
        'input[placeholder="Add tag..."]'
      ) as HTMLInputElement;
      fireEvent.change(tagInput, { target: { value: 'hot' } });
      const addBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent === 'Add'
      ) as HTMLButtonElement;
      expect(addBtn.disabled).toBe(false);
    });

    it('adds a new tag via the Add button', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const tagInput = container.querySelector(
        'input[placeholder="Add tag..."]'
      ) as HTMLInputElement;
      fireEvent.change(tagInput, { target: { value: 'hot' } });
      const addBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent === 'Add'
      ) as HTMLButtonElement;
      fireEvent.click(addBtn);
      await waitFor(() => {
        const createCall = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/crm/tags' && c[1]?.method === 'POST'
        );
        expect(createCall).toBeTruthy();
      });
      await waitFor(() => {
        const linkCall = fetchSpy.mock.calls.find(c => {
          if (c[0] !== '/api/portal/crm/contacts/7' || c[1]?.method !== 'PUT') return false;
          try {
            const body = JSON.parse(c[1].body);
            return Array.isArray(body.tagIds);
          } catch {
            return false;
          }
        });
        expect(linkCall).toBeTruthy();
      });
    });

    it('addTag clears input and no-ops when tag name already exists', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const tagInput = container.querySelector(
        'input[placeholder="Add tag..."]'
      ) as HTMLInputElement;
      // "priority" already exists on the contact
      fireEvent.change(tagInput, { target: { value: 'priority' } });
      const addBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent === 'Add'
      ) as HTMLButtonElement;
      fireEvent.click(addBtn);
      await flush();
      const createCall = fetchSpy.mock.calls.find(c =>
        c[0] === '/api/portal/crm/tags' && c[1]?.method === 'POST'
      );
      expect(createCall).toBeUndefined();
      expect(tagInput.value).toBe('');
    });

    it('addTag no-ops when input is whitespace only', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const tagInput = container.querySelector(
        'input[placeholder="Add tag..."]'
      ) as HTMLInputElement;
      fireEvent.change(tagInput, { target: { value: '   ' } });
      const addBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent === 'Add'
      ) as HTMLButtonElement;
      // disabled, but try clicking the addTag function via Enter key
      fireEvent.keyDown(tagInput, { key: 'Enter' });
      await flush();
      const createCall = fetchSpy.mock.calls.find(c =>
        c[0] === '/api/portal/crm/tags' && c[1]?.method === 'POST'
      );
      expect(createCall).toBeUndefined();
    });

    it('Enter key in tag input triggers addTag', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const tagInput = container.querySelector(
        'input[placeholder="Add tag..."]'
      ) as HTMLInputElement;
      fireEvent.change(tagInput, { target: { value: 'hot' } });
      fireEvent.keyDown(tagInput, { key: 'Enter' });
      await waitFor(() => {
        const createCall = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/crm/tags' && c[1]?.method === 'POST'
        );
        expect(createCall).toBeTruthy();
      });
    });

    it('addTag bails when tag create returns non-ok', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/tags' && init?.method === 'POST') {
          return { ok: false, json: async () => ({ success: false }) };
        }
        return defaultFetch(url, init);
      });
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      const tagInput = container.querySelector(
        'input[placeholder="Add tag..."]'
      ) as HTMLInputElement;
      fireEvent.change(tagInput, { target: { value: 'hot' } });
      fireEvent.keyDown(tagInput, { key: 'Enter' });
      await flush();
      // The PUT linking call should NOT happen
      const putWithTagIds = fetchSpy.mock.calls.find(c => {
        if (c[0] !== '/api/portal/crm/contacts/7' || c[1]?.method !== 'PUT') return false;
        try {
          const body = JSON.parse(c[1].body);
          return Array.isArray(body.tagIds);
        } catch {
          return false;
        }
      });
      expect(putWithTagIds).toBeUndefined();
    });

    it('addTag bails when newTagRow.id is missing', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/tags' && init?.method === 'POST') {
          return jsonResponse({ success: true, data: {} });
        }
        return defaultFetch(url, init);
      });
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      const tagInput = container.querySelector(
        'input[placeholder="Add tag..."]'
      ) as HTMLInputElement;
      fireEvent.change(tagInput, { target: { value: 'hot' } });
      fireEvent.keyDown(tagInput, { key: 'Enter' });
      await flush();
      const putWithTagIds = fetchSpy.mock.calls.find(c => {
        if (c[0] !== '/api/portal/crm/contacts/7' || c[1]?.method !== 'PUT') return false;
        try {
          const body = JSON.parse(c[1].body);
          return Array.isArray(body.tagIds);
        } catch {
          return false;
        }
      });
      expect(putWithTagIds).toBeUndefined();
    });

    it('removeTag sends PUT with reduced tagIds array', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      // Each tag has a close button (material-icons "close"). Find buttons inside tag pills.
      // Tag pills wrap a button with material-icon text "close"
      const closeButtons = Array.from(container.querySelectorAll('span button')).filter(
        b => b.textContent === 'close'
      );
      expect(closeButtons.length).toBeGreaterThan(0);
      fireEvent.click(closeButtons[0]!);
      await waitFor(() => {
        const putCall = fetchSpy.mock.calls.find(c => {
          if (c[0] !== '/api/portal/crm/contacts/7' || c[1]?.method !== 'PUT') return false;
          try {
            const body = JSON.parse(c[1].body);
            return Array.isArray(body.tagIds);
          } catch {
            return false;
          }
        });
        expect(putCall).toBeTruthy();
        const body = JSON.parse(putCall![1].body);
        expect(body.tagIds).toEqual([2]);
      });
    });
  });

  describe('notes section', () => {
    it('renders existing notes value', async () => {
      const { container } = await renderPage();
      const textarea = Array.from(container.querySelectorAll('textarea')).find(
        t => (t as HTMLTextAreaElement).value === 'VIP contact'
      ) as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
      expect(textarea.value).toBe('VIP contact');
    });

    it('updates notes textarea on change', async () => {
      const { container } = await renderPage();
      const notesTextarea = Array.from(container.querySelectorAll('textarea')).find(
        t => (t as HTMLTextAreaElement).value === 'VIP contact'
      ) as HTMLTextAreaElement;
      fireEvent.change(notesTextarea, { target: { value: 'New notes' } });
      expect(notesTextarea.value).toBe('New notes');
    });

    it('saves notes on blur', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const notesTextarea = Array.from(container.querySelectorAll('textarea')).find(
        t => (t as HTMLTextAreaElement).value === 'VIP contact'
      ) as HTMLTextAreaElement;
      fireEvent.change(notesTextarea, { target: { value: 'Updated notes' } });
      fireEvent.blur(notesTextarea);
      await waitFor(() => {
        const putCall = fetchSpy.mock.calls.find(c => {
          if (c[0] !== '/api/portal/crm/contacts/7' || c[1]?.method !== 'PUT') return false;
          try {
            const body = JSON.parse(c[1].body);
            return body.notes === 'Updated notes';
          } catch {
            return false;
          }
        });
        expect(putCall).toBeTruthy();
      });
    });
  });

  describe('log activity', () => {
    it('does not submit when title is empty', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const logForms = container.querySelectorAll('form');
      // Activity form is one of multiple — pick the one containing "Activity title..."
      const activityForm = Array.from(logForms).find(f =>
        f.querySelector('input[placeholder="Activity title..."]')
      )!;
      fireEvent.submit(activityForm);
      await flush();
      const postCall = fetchSpy.mock.calls.find(c =>
        c[0] === '/api/portal/crm/activities' && c[1]?.method === 'POST'
      );
      expect(postCall).toBeUndefined();
    });

    it('switches activity type when type chip is clicked', async () => {
      const { container } = await renderPage();
      const meetingBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Meeting')
      ) as HTMLButtonElement;
      fireEvent.click(meetingBtn);
      // No direct value to inspect; instead, check the button has the active classes
      expect(meetingBtn.className).toContain('bg-primary');
    });

    it('submits a new activity, resets form, and refetches activities', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      const titleInput = container.querySelector(
        'input[placeholder="Activity title..."]'
      ) as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'Demo call' } });
      const descInput = container.querySelector(
        'textarea[placeholder="Description (optional)..."]'
      ) as HTMLTextAreaElement;
      fireEvent.change(descInput, { target: { value: 'with prospects' } });
      const activityForm = titleInput.closest('form')!;
      fireEvent.submit(activityForm);
      await waitFor(() => {
        const postCall = fetchSpy.mock.calls.find(c =>
          c[0] === '/api/portal/crm/activities' && c[1]?.method === 'POST'
        );
        expect(postCall).toBeTruthy();
        const body = JSON.parse(postCall![1].body);
        expect(body.title).toBe('Demo call');
        expect(body.description).toBe('with prospects');
        expect(body.type).toBe('call');
        expect(body.contactId).toBe(7);
      });
      await waitFor(() => {
        expect(titleInput.value).toBe('');
      });
    });

    it('does not reset the form when API returns success:false', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/activities' && init?.method === 'POST') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      const titleInput = container.querySelector(
        'input[placeholder="Activity title..."]'
      ) as HTMLInputElement;
      fireEvent.change(titleInput, { target: { value: 'X' } });
      const activityForm = titleInput.closest('form')!;
      fireEvent.submit(activityForm);
      await flush();
      expect(titleInput.value).toBe('X');
    });
  });

  describe('activity timeline', () => {
    it('renders activities with title, description, and connectors', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Discovery call');
      expect(container.textContent).toContain('Initial outreach');
      expect(container.textContent).toContain('Follow-up email');
    });

    it('renders empty state when no activities', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/activities?')) {
          return jsonResponse({ success: true, data: [] });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('No activities logged yet.');
    });

    it('renders default icon for unknown activity type', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/activities?')) {
          return jsonResponse({
            success: true,
            data: [
              { id: 50, type: 'mystery', title: 'Strange thing', description: null, createdAt: new Date().toISOString() },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      // Default fallback icon is "circle"
      expect(container.textContent).toContain('circle');
    });

    it('renders "just now" for activities created within the minute', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/activities?')) {
          return jsonResponse({
            success: true,
            data: [
              { id: 50, type: 'note', title: 'Fresh note', description: null, createdAt: new Date().toISOString() },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('just now');
    });

    it('renders "Xm ago" for activities within the hour', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/activities?')) {
          return jsonResponse({
            success: true,
            data: [
              { id: 50, type: 'note', title: 'Recent note', description: null, createdAt: new Date(Date.now() - 5 * 60000).toISOString() },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('5m ago');
    });

    it('renders "Xh ago" for activities within the day', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/activities?')) {
          return jsonResponse({
            success: true,
            data: [
              { id: 50, type: 'note', title: 'Some time ago', description: null, createdAt: new Date(Date.now() - 3 * 3600000).toISOString() },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('3h ago');
    });

    it('renders "Xd ago" for activities within the week', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/activities?')) {
          return jsonResponse({
            success: true,
            data: [
              { id: 50, type: 'note', title: 'Days ago', description: null, createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('3d ago');
    });

    it('renders locale date for activities older than a week', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/activities?')) {
          return jsonResponse({
            success: true,
            data: [
              { id: 50, type: 'note', title: 'Long ago', description: null, createdAt: new Date(Date.now() - 30 * 86400000).toISOString() },
            ],
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      // No "d ago" — falls back to locale date
      expect(container.textContent).toContain('Long ago');
    });

    it('handles activities fetch returning non-array data gracefully', async () => {
      setFetchHandler((url, init) => {
        if (url.startsWith('/api/portal/crm/activities?')) {
          return jsonResponse({ success: false, data: null });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('No activities logged yet.');
    });
  });

  describe('send email', () => {
    it('Send Email button is visible when contact has email and not editing', async () => {
      const { container } = await renderPage();
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Send Email')
      );
      expect(sendBtn).toBeTruthy();
    });

    it('Send Email button is not visible when email is null', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { contact: { ...baseContact, email: null }, deals: baseDeals },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Send Email')
      );
      expect(sendBtn).toBeUndefined();
    });

    it('clicking Send Email opens the email form', async () => {
      const { container } = await renderPage();
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Send Email')
      ) as HTMLButtonElement;
      fireEvent.click(sendBtn);
      expect(container.textContent).toContain('Send Email to jane@example.test');
    });

    it('close icon button hides the email form', async () => {
      const { container } = await renderPage();
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Send Email')
      ) as HTMLButtonElement;
      fireEvent.click(sendBtn);
      // Close icon button (material-icons "close")
      const closeBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent === 'close'
      );
      fireEvent.click(closeBtn!);
      expect(container.textContent).not.toContain('Send Email to jane@example.test');
    });

    it('Cancel button hides the email form', async () => {
      const { container } = await renderPage();
      const sendBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent?.includes('Send Email')
      ) as HTMLButtonElement;
      fireEvent.click(sendBtn);
      const cancelBtn = Array.from(container.querySelectorAll('button')).find(
        b => b.textContent === 'Cancel'
      );
      fireEvent.click(cancelBtn!);
      expect(container.textContent).not.toContain('Send Email to jane@example.test');
    });

    it('does not submit when subject or body is empty', async () => {
      const fetchSpy = vi.fn((url: string, init?: any) =>
        Promise.resolve(handlers[0](url, init))
      );
      // @ts-ignore
      global.fetch = fetchSpy;
      const { container } = await renderPage();
      fireEvent.click(
        Array.from(container.querySelectorAll('button')).find(
          b => b.textContent?.includes('Send Email')
        )!
      );
      // Submit the email form (subject + body required)
      const emailForm = container.querySelector('form')!;
      fireEvent.submit(emailForm);
      await flush();
      const sendCall = fetchSpy.mock.calls.find(c =>
        c[0] === '/api/portal/crm/contacts/7/send-email' && c[1]?.method === 'POST'
      );
      expect(sendCall).toBeUndefined();
    });

    it('shows error message when API returns success:false', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7/send-email' && init?.method === 'POST') {
          return jsonResponse({ success: false, message: 'SMTP down' });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      fireEvent.click(
        Array.from(container.querySelectorAll('button')).find(
          b => b.textContent?.includes('Send Email')
        )!
      );
      const subjectInput = container.querySelector(
        'form input[required]'
      ) as HTMLInputElement;
      fireEvent.change(subjectInput, { target: { value: 'Hi' } });
      const bodyTextarea = container.querySelector(
        'form textarea[required]'
      ) as HTMLTextAreaElement;
      fireEvent.change(bodyTextarea, { target: { value: 'there' } });
      fireEvent.submit(subjectInput.closest('form')!);
      await waitFor(() => {
        expect(container.textContent).toContain('SMTP down');
      });
    });

    it('shows default error message when API returns no message', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7/send-email' && init?.method === 'POST') {
          return jsonResponse({ success: false });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      fireEvent.click(
        Array.from(container.querySelectorAll('button')).find(
          b => b.textContent?.includes('Send Email')
        )!
      );
      const subjectInput = container.querySelector(
        'form input[required]'
      ) as HTMLInputElement;
      fireEvent.change(subjectInput, { target: { value: 'Hi' } });
      const bodyTextarea = container.querySelector(
        'form textarea[required]'
      ) as HTMLTextAreaElement;
      fireEvent.change(bodyTextarea, { target: { value: 'there' } });
      fireEvent.submit(subjectInput.closest('form')!);
      await waitFor(() => {
        expect(container.textContent).toContain('Failed to send email.');
      });
    });
  });

  describe('deals section', () => {
    it('renders deals list with title, stage, value, status', async () => {
      const { container } = await renderPage();
      expect(container.textContent).toContain('Big Deal');
      expect(container.textContent).toContain('Proposal');
      expect(container.textContent).toContain('$1,500.00');
      expect(container.textContent).toContain('open');
      expect(container.textContent).toContain('Lost Cause');
      expect(container.textContent).toContain('lost');
    });

    it('renders empty state when no deals', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: { contact: baseContact, deals: [] },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('No deals associated with this contact.');
    });

    it('uses default badge color for unknown deal status', async () => {
      setFetchHandler((url, init) => {
        if (url === '/api/portal/crm/contacts/7' && (!init || init.method === undefined || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: {
              contact: baseContact,
              deals: [{ id: 200, title: 'Mystery Deal', value: 100, stageName: 'Unknown', status: 'paused' }],
            },
          });
        }
        return defaultFetch(url, init);
      });
      const { container } = render(<CrmContactDetailPage />);
      await waitFor(() => screen.getByText('Jane Doe'));
      expect(container.textContent).toContain('Mystery Deal');
      expect(container.textContent).toContain('paused');
    });

    it('renders link to pipelines page', async () => {
      const { container } = await renderPage();
      const link = container.querySelector('a[href="/portal/crm/deals"]');
      expect(link).toBeTruthy();
    });
  });
});
