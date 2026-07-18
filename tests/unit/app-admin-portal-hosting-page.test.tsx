// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/admin/portal-hosting/page.tsx` — client component.
 * Stubs global fetch; exercises loading state, empty state, populated table,
 * filtering, add/edit/delete modals, DNS row management, and detail panel.
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
  usePathname: () => '/admin/portal-hosting',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseSite = {
  id: 1,
  clientId: 10,
  name: 'Acme Site',
  customDomain: 'acme.example.com',
  railwayProjectId: 'proj-111',
  railwayServiceId: 'svc-222',
  railwayEnvironmentId: 'env-333',
  railwayDomain: 'acme.up.railway.app',
  status: 'active',
  plan: 'pro',
  renewalDate: '2026-12-01T00:00:00Z',
  notes: 'VIP client',
  dnsInstructions: [
    { type: 'CNAME', host: 'www', value: 'acme.up.railway.app', ttl: 'Auto', notes: '' },
  ],
  createdAt: '2025-01-01T00:00:00Z',
  clientCompany: 'Acme Corp',
  clientUserName: 'janedoe',
  clientUserEmail: 'jane@acme.test',
};

const baseClient = {
  id: 10,
  company: 'Acme Corp',
  userName: 'janedoe',
  userEmail: 'jane@acme.test',
};

// ─── Fetch helper ─────────────────────────────────────────────────────────────

function jsonResp(body: any) {
  return { ok: true, json: async () => body } as any;
}

type Handler = (url: string, init?: any) => any;
let currentHandler: Handler;

function setHandler(h: Handler) { currentHandler = h; }

function defaultHandler(url: string, _init?: any): any {
  if (url === '/api/admin/portal/hosting') return jsonResp({ success: true, data: [baseSite] });
  if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
  return jsonResp({ success: true, data: null });
}

// ─── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  setHandler(defaultHandler);
  // @ts-expect-error - assigning a vi.fn mock to global.fetch
  global.fetch = vi.fn((url: string, init?: any) => Promise.resolve(currentHandler(url, init)));
});

// ─── Import under test ───────────────────────────────────────────────────────

import AdminPortalHostingPage from '@/app/admin/portal-hosting/page';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function renderPage() {
  const result = render(<AdminPortalHostingPage />);
  // Wait for loading to finish (spinner removed)
  await waitFor(() => {
    expect(result.container.querySelector('.animate-spin')).toBeNull();
  });
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AdminPortalHostingPage', () => {

  describe('loading state', () => {
    it('shows spinner before data resolves', () => {
      // Don't await — capture while still loading
      const { container } = render(<AdminPortalHostingPage />);
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });
  });

  describe('empty state', () => {
    it('shows empty message when no sites exist', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting') return jsonResp({ success: true, data: [] });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      expect(screen.getByText('No hosted sites yet. Add one to get started.')).toBeTruthy();
    });

    it('shows stats all at 0 when no sites', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting') return jsonResp({ success: true, data: [] });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      // All 4 stat cards should show 0
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBe(4);
    });
  });

  describe('populated table', () => {
    it('renders the page heading', async () => {
      await renderPage();
      expect(screen.getByText('Hosting')).toBeTruthy();
      expect(screen.getByText('Managed Railway hosting sold to clients.')).toBeTruthy();
    });

    it('renders site name in table', async () => {
      await renderPage();
      expect(screen.getByText('Acme Site')).toBeTruthy();
    });

    it('renders client company in table', async () => {
      await renderPage();
      expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0);
    });

    it('renders custom domain in table', async () => {
      await renderPage();
      expect(screen.getByText('acme.example.com')).toBeTruthy();
    });

    it('renders plan badge', async () => {
      await renderPage();
      expect(screen.getByText('Pro')).toBeTruthy();
    });

    it('renders status badge', async () => {
      await renderPage();
      // 'active' appears in both the stats card and the table badge
      expect(screen.getAllByText('active').length).toBeGreaterThan(0);
    });

    it('renders railway domain below site name', async () => {
      await renderPage();
      expect(screen.getByText('acme.up.railway.app')).toBeTruthy();
    });

    it('shows "Not configured" when customDomain is null', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting')
          return jsonResp({ success: true, data: [{ ...baseSite, customDomain: null }] });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      expect(screen.getByText('Not configured')).toBeTruthy();
    });

    it('shows em-dash when renewalDate is null', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting')
          return jsonResp({ success: true, data: [{ ...baseSite, renewalDate: null }] });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      expect(screen.getByText('—')).toBeTruthy();
    });

    it('falls back to clientUserName when clientCompany is null', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting')
          return jsonResp({ success: true, data: [{ ...baseSite, clientCompany: null }] });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      expect(screen.getAllByText('janedoe').length).toBeGreaterThan(0);
    });

    it('shows correct stat count for active sites', async () => {
      await renderPage();
      // The 'active' stat card should show 1
      const statCards = document.querySelectorAll('.bg-card.border.border-border.rounded-xl.p-4');
      // Find card whose text includes 'active'
      let foundActive = false;
      statCards.forEach(card => {
        if (card.textContent?.includes('active') && card.textContent?.includes('1')) {
          foundActive = true;
        }
      });
      expect(foundActive).toBe(true);
    });
  });

  describe('status variants', () => {
    const statuses = ['provisioning', 'suspended', 'cancelled'] as const;
    for (const st of statuses) {
      it(`renders ${st} status badge`, async () => {
        setHandler((url) => {
          if (url === '/api/admin/portal/hosting')
            return jsonResp({ success: true, data: [{ ...baseSite, id: 2, status: st }] });
          if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
          return jsonResp({ success: true, data: null });
        });
        await renderPage();
        // Status text appears in both the stats card label and the table badge
        expect(screen.getAllByText(st).length).toBeGreaterThan(0);
      });
    }
  });

  describe('plan variants', () => {
    const plans = [
      { plan: 'starter', label: 'Starter' },
      { plan: 'enterprise', label: 'Enterprise' },
    ] as const;
    for (const { plan, label } of plans) {
      it(`renders ${plan} plan badge`, async () => {
        setHandler((url) => {
          if (url === '/api/admin/portal/hosting')
            return jsonResp({ success: true, data: [{ ...baseSite, plan }] });
          if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
          return jsonResp({ success: true, data: null });
        });
        await renderPage();
        expect(screen.getByText(label)).toBeTruthy();
      });
    }
  });

  describe('search filter', () => {
    it('filters by site name', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting')
          return jsonResp({ success: true, data: [baseSite, { ...baseSite, id: 2, name: 'Beta Site', clientUserName: 'bob', clientUserEmail: 'bob@test.com' }] });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      const searchInput = screen.getByPlaceholderText('Search sites, domains, clients...');
      fireEvent.change(searchInput, { target: { value: 'Beta' } });
      expect(screen.queryByText('Acme Site')).toBeNull();
      expect(screen.getByText('Beta Site')).toBeTruthy();
    });

    it('shows filter-no-results message when search has no match', async () => {
      await renderPage();
      const searchInput = screen.getByPlaceholderText('Search sites, domains, clients...');
      fireEvent.change(searchInput, { target: { value: 'zzznomatch' } });
      expect(screen.getByText('No sites match your filters.')).toBeTruthy();
    });

    it('filters by status dropdown', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting')
          return jsonResp({
            success: true,
            data: [
              baseSite,
              { ...baseSite, id: 2, name: 'Prov Site', status: 'provisioning', clientUserName: 'bob', clientUserEmail: 'bob@test.com' },
            ],
          });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      const statusSelect = screen.getByDisplayValue('All statuses');
      fireEvent.change(statusSelect, { target: { value: 'provisioning' } });
      expect(screen.queryByText('Acme Site')).toBeNull();
      expect(screen.getByText('Prov Site')).toBeTruthy();
    });

    it('filters no-match when status + search combined', async () => {
      await renderPage();
      const searchInput = screen.getByPlaceholderText('Search sites, domains, clients...');
      fireEvent.change(searchInput, { target: { value: 'zzz' } });
      const statusSelect = screen.getByDisplayValue('All statuses');
      fireEvent.change(statusSelect, { target: { value: 'suspended' } });
      expect(screen.getByText('No sites match your filters.')).toBeTruthy();
    });
  });

  describe('detail panel', () => {
    it('opens detail panel when site name clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      expect(screen.getByText('VIP client')).toBeTruthy();
    });

    it('shows custom domain in detail panel', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      // Should appear in the domain section of the panel
      const customDomains = screen.getAllByText('acme.example.com');
      expect(customDomains.length).toBeGreaterThan(0);
    });

    it('shows Railway IDs in detail panel', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      expect(screen.getByText('proj-111')).toBeTruthy();
      expect(screen.getByText('svc-222')).toBeTruthy();
      expect(screen.getByText('env-333')).toBeTruthy();
    });

    it('shows DNS records table in detail panel', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      expect(screen.getByText('DNS Records')).toBeTruthy();
      expect(screen.getByText('CNAME')).toBeTruthy();
    });

    it('shows renewal date in detail panel', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      expect(screen.getByText('Renews')).toBeTruthy();
    });

    it('closes detail panel when backdrop clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      expect(screen.getByText('VIP client')).toBeTruthy();
      // The backdrop is the flex-1 div before the panel
      const backdrop = document.querySelector('.flex-1.bg-black\\/40') as HTMLElement;
      if (backdrop) fireEvent.click(backdrop);
      await waitFor(() => expect(screen.queryByText('VIP client')).toBeNull());
    });

    it('closes detail panel when close button clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      // Close button in detail header
      const closeBtns = screen.getAllByRole('button').filter(b =>
        b.querySelector('.material-icons')?.textContent === 'close',
      );
      fireEvent.click(closeBtns[0]);
      await waitFor(() => expect(screen.queryByText('VIP client')).toBeNull());
    });

    it('shows "No domain configured" when both domains are null', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting')
          return jsonResp({
            success: true,
            data: [{ ...baseSite, customDomain: null, railwayDomain: null }],
          });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      expect(screen.getByText('No domain configured.')).toBeTruthy();
    });

    it('shows "No Railway IDs linked" when IDs are null', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting')
          return jsonResp({
            success: true,
            data: [{ ...baseSite, railwayProjectId: null, railwayServiceId: null, railwayEnvironmentId: null }],
          });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      expect(screen.getByText('No Railway IDs linked.')).toBeTruthy();
    });

    it('does not render DNS Records section when dnsInstructions is empty', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/hosting')
          return jsonResp({ success: true, data: [{ ...baseSite, dnsInstructions: [] }] });
        if (url === '/api/admin/portal/clients') return jsonResp({ success: true, data: [baseClient] });
        return jsonResp({ success: true, data: null });
      });
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      expect(screen.queryByText('DNS Records')).toBeNull();
    });
  });

  describe('add form modal', () => {
    it('opens add form when "Add Hosted Site" button clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));
      expect(screen.getByText('Add Hosted Site', { selector: 'h2' })).toBeTruthy();
    });

    it('closes form when Cancel clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByText('Add Hosted Site', { selector: 'h2' })).toBeNull());
    });

    it('closes form when X button clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));
      const closeBtns = screen.getAllByRole('button').filter(b =>
        b.querySelector('.material-icons')?.textContent === 'close',
      );
      fireEvent.click(closeBtns[0]);
      await waitFor(() => expect(screen.queryByText('Add Hosted Site', { selector: 'h2' })).toBeNull());
    });

    it('shows validation error when saving without required fields', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Add Site' }));
      expect(screen.getByText('Client and site name are required.')).toBeTruthy();
    });

    it('populates client dropdown from clients API', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));
      // Client select should include the base client option
      expect(screen.getByText('Acme Corp (janedoe)')).toBeTruthy();
    });

    it('successfully saves a new site', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/portal/hosting' && init?.method === 'POST')
          return jsonResp({ success: true, data: { ...baseSite, id: 99, name: 'New Site' } });
        return defaultHandler(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));

      // Select client
      const clientSelect = screen.getByText('Acme Corp (janedoe)').closest('select') as HTMLSelectElement;
      fireEvent.change(clientSelect, { target: { value: '10' } });

      // Enter site name
      const nameInput = screen.getByPlaceholderText('e.g. Acme Corp E-commerce');
      fireEvent.change(nameInput, { target: { value: 'New Site' } });

      fireEvent.click(screen.getByRole('button', { name: 'Add Site' }));
      await waitFor(() => expect(screen.queryByText('Add Hosted Site', { selector: 'h2' })).toBeNull());
    });

    it('shows error message when save fails', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/portal/hosting' && init?.method === 'POST')
          return jsonResp({ success: false, message: 'Server error occurred' });
        return defaultHandler(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));

      const clientSelect = screen.getByText('Acme Corp (janedoe)').closest('select') as HTMLSelectElement;
      fireEvent.change(clientSelect, { target: { value: '10' } });

      const nameInput = screen.getByPlaceholderText('e.g. Acme Corp E-commerce');
      fireEvent.change(nameInput, { target: { value: 'New Site' } });

      fireEvent.click(screen.getByRole('button', { name: 'Add Site' }));
      await waitFor(() => expect(screen.getByText('Server error occurred')).toBeTruthy());
    });

    it('shows "Save failed" fallback when message is absent', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/portal/hosting' && init?.method === 'POST')
          return jsonResp({ success: false });
        return defaultHandler(url, init);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));

      const clientSelect = screen.getByText('Acme Corp (janedoe)').closest('select') as HTMLSelectElement;
      fireEvent.change(clientSelect, { target: { value: '10' } });

      const nameInput = screen.getByPlaceholderText('e.g. Acme Corp E-commerce');
      fireEvent.change(nameInput, { target: { value: 'New Site' } });

      fireEvent.click(screen.getByRole('button', { name: 'Add Site' }));
      await waitFor(() => expect(screen.getByText('Save failed')).toBeTruthy());
    });
  });

  describe('DNS row management in form', () => {
    it('shows empty DNS placeholder text when no rows', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));
      expect(screen.getByText(/No DNS records added/)).toBeTruthy();
    });

    it('adds a DNS row when "Add record" clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));
      fireEvent.click(screen.getByRole('button', { name: /Add record/ }));
      expect(screen.getByPlaceholderText('Host (e.g. @)')).toBeTruthy();
    });

    it('removes a DNS row when remove button clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));
      fireEvent.click(screen.getByRole('button', { name: /Add record/ }));
      const removeBtn = document.querySelector('button span.material-icons[class*="base"]')?.closest('button');
      // Find remove_circle_outline button
      const removeBtns = screen.getAllByRole('button').filter(b =>
        b.querySelector('.material-icons')?.textContent === 'remove_circle_outline',
      );
      expect(removeBtns.length).toBe(1);
      fireEvent.click(removeBtns[0]);
      expect(screen.queryByPlaceholderText('Host (e.g. @)')).toBeNull();
    });

    it('updates DNS row field values', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Add Hosted Site/ }));
      fireEvent.click(screen.getByRole('button', { name: /Add record/ }));

      const hostInput = screen.getByPlaceholderText('Host (e.g. @)') as HTMLInputElement;
      fireEvent.change(hostInput, { target: { value: '@' } });
      expect(hostInput.value).toBe('@');

      const valueInput = screen.getByPlaceholderText('Value / points to') as HTMLInputElement;
      fireEvent.change(valueInput, { target: { value: '1.2.3.4' } });
      expect(valueInput.value).toBe('1.2.3.4');
    });
  });

  describe('edit modal', () => {
    it('opens edit form with pre-filled values when edit button clicked', async () => {
      await renderPage();
      const editBtns = screen.getAllByTitle('Edit');
      fireEvent.click(editBtns[0]);
      expect(screen.getByText('Edit Hosted Site')).toBeTruthy();
      expect(screen.getByDisplayValue('Acme Site')).toBeTruthy();
    });

    it('disables the client dropdown in edit mode', async () => {
      await renderPage();
      const editBtns = screen.getAllByTitle('Edit');
      fireEvent.click(editBtns[0]);
      // The client select should be disabled
      const clientSelect = document.querySelector('select[disabled]') as HTMLSelectElement;
      expect(clientSelect).toBeTruthy();
    });

    it('pre-fills DNS rows in edit mode', async () => {
      await renderPage();
      const editBtns = screen.getAllByTitle('Edit');
      fireEvent.click(editBtns[0]);
      // Should have the CNAME row from baseSite.dnsInstructions
      const hostInputs = screen.getAllByPlaceholderText('Host (e.g. @)') as HTMLInputElement[];
      expect(hostInputs.length).toBeGreaterThan(0);
      expect(hostInputs[0].value).toBe('www');
    });

    it('saves edit via PATCH and updates table', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/portal/hosting/1' && init?.method === 'PATCH')
          return jsonResp({ success: true, data: { ...baseSite, name: 'Acme Updated' } });
        return defaultHandler(url, init);
      });
      await renderPage();
      const editBtns = screen.getAllByTitle('Edit');
      fireEvent.click(editBtns[0]);

      const nameInput = screen.getByDisplayValue('Acme Site') as HTMLInputElement;
      fireEvent.change(nameInput, { target: { value: 'Acme Updated' } });

      fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));
      await waitFor(() => expect(screen.queryByText('Edit Hosted Site')).toBeNull());
    });

    it('opens edit from detail panel edit button', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      // The detail panel has an edit button in its header
      const panelEditBtns = screen.getAllByRole('button').filter(b =>
        b.querySelector('.material-icons')?.textContent === 'edit',
      );
      fireEvent.click(panelEditBtns[0]);
      expect(screen.getByText('Edit Hosted Site')).toBeTruthy();
    });
  });

  describe('delete confirmation dialog', () => {
    it('opens delete dialog when delete button clicked', async () => {
      await renderPage();
      const deleteBtns = screen.getAllByTitle('Delete');
      fireEvent.click(deleteBtns[0]);
      expect(screen.getByText('Delete hosted site?')).toBeTruthy();
    });

    it('cancels delete when Cancel clicked', async () => {
      await renderPage();
      const deleteBtns = screen.getAllByTitle('Delete');
      fireEvent.click(deleteBtns[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByText('Delete hosted site?')).toBeNull());
    });

    it('deletes site and removes from table', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/portal/hosting/1' && init?.method === 'DELETE')
          return jsonResp({ success: true });
        return defaultHandler(url, init);
      });
      await renderPage();
      const deleteBtns = screen.getAllByTitle('Delete');
      fireEvent.click(deleteBtns[0]);
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByText('Acme Site')).toBeNull());
    });

    it('opens delete dialog from detail panel Delete Site button', async () => {
      await renderPage();
      fireEvent.click(screen.getByText('Acme Site'));
      fireEvent.click(screen.getByRole('button', { name: /Delete Site/ }));
      expect(screen.getByText('Delete hosted site?')).toBeTruthy();
    });

    it('clears detail panel after deleting the open site', async () => {
      setHandler((url, init) => {
        if (url === '/api/admin/portal/hosting/1' && init?.method === 'DELETE')
          return jsonResp({ success: true });
        return defaultHandler(url, init);
      });
      await renderPage();
      // Open detail panel
      fireEvent.click(screen.getByText('Acme Site'));
      // Open delete from detail panel
      fireEvent.click(screen.getByRole('button', { name: /Delete Site/ }));
      // Confirm delete
      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(screen.queryByText('VIP client')).toBeNull());
    });
  });
});
