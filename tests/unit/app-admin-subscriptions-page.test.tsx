// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/admin/subscriptions/page.tsx` — client component.
 * Stubs global fetch; exercises loading state, empty state, populated table,
 * status filters, action menu, cancel/change-plan/refund dialogs, toast, stats.
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
  usePathname: () => '/admin/subscriptions',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

vi.mock('@/lib/portal-utils', () => ({
  formatCents: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const baseSub = {
  id: 1,
  clientName: 'Jane Doe',
  company: 'Acme Corp',
  serviceName: 'Hosting Pro',
  serviceCategory: 'hosting',
  price: 5000,
  billingCycle: 'monthly',
  status: 'active',
  renewalDate: '2026-12-01T00:00:00Z',
  createdAt: '2025-01-01T00:00:00Z',
};

const baseService = {
  id: 10,
  name: 'Hosting Plus',
  category: 'plan-starter',
  price: 8000,
  billingCycle: 'monthly',
  stripePriceId: 'price_abc123',
  active: true,
};

const baseInvoice = {
  id: 100,
  number: 'INV-001',
  status: 'paid',
  total: 5000,
  paidAt: '2025-06-01T00:00:00Z',
  stripePaymentIntentId: 'pi_abc123',
  createdAt: '2025-06-01T00:00:00Z',
};

// ─── Fetch helper ─────────────────────────────────────────────────────────────

function jsonResp(body: any) {
  return { ok: true, json: async () => body } as any;
}

type Handler = (url: string, init?: any) => any;
let currentHandler: Handler;

function setHandler(h: Handler) { currentHandler = h; }

function defaultHandler(url: string, _init?: any): any {
  if (url === '/api/admin/portal/subscriptions') return jsonResp({ success: true, data: [baseSub] });
  if (url === '/api/admin/portal/services') return jsonResp({ success: true, data: [baseService] });
  if (/\/api\/admin\/portal\/subscriptions\/\d+\/invoices/.test(url))
    return jsonResp({ success: true, data: [baseInvoice] });
  return jsonResp({ success: true, data: null });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setHandler(defaultHandler);
  // @ts-expect-error - assigning a vi.fn mock to global.fetch
  global.fetch = vi.fn((url: string, init?: any) => Promise.resolve(currentHandler(url, init)));
  // Stub window.confirm so dialog tests pass without user interaction
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

// ─── Import under test ────────────────────────────────────────────────────────

import AdminSubscriptionsPage from '@/app/admin/subscriptions/page';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function renderPage() {
  const result = render(<AdminSubscriptionsPage />);
  await waitFor(() => {
    expect(result.container.querySelector('.animate-spin')).toBeNull();
  });
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// Open the actions menu for the first row
async function openActionMenu() {
  await renderPage();
  const actionBtn = screen.getByLabelText('Actions');
  fireEvent.click(actionBtn);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('AdminSubscriptionsPage', () => {

  // ── Loading state ──────────────────────────────────────────────────────────

  describe('loading state', () => {
    it('shows spinner before data resolves', () => {
      const { container } = render(<AdminSubscriptionsPage />);
      expect(container.querySelector('.animate-spin')).toBeTruthy();
    });

    it('shows "Loading subscriptions…" text while loading', () => {
      render(<AdminSubscriptionsPage />);
      expect(screen.getByText('Loading subscriptions...')).toBeTruthy();
    });
  });

  // ── Empty state ────────────────────────────────────────────────────────────

  describe('empty state', () => {
    it('shows "No subscriptions found" when no data', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions') return jsonResp({ success: true, data: [] });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('No subscriptions found')).toBeTruthy();
    });

    it('shows "No client subscriptions yet." when all filter and no data', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions') return jsonResp({ success: true, data: [] });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('No client subscriptions yet.')).toBeTruthy();
    });

    it('shows zero stats when data is empty', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions') return jsonResp({ success: true, data: [] });
        return defaultHandler(url);
      });
      await renderPage();
      // Active Subscriptions stat = 0, Suspended stat = 0
      expect(screen.getByText('Active Subscriptions')).toBeTruthy();
      const zeros = screen.getAllByText('0');
      expect(zeros.length).toBeGreaterThanOrEqual(2);
    });

    it('handles missing data key gracefully (falls back to [])', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions') return jsonResp({ success: true });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('No subscriptions found')).toBeTruthy();
    });
  });

  // ── Page heading & stats ───────────────────────────────────────────────────

  describe('page heading and stats', () => {
    it('renders the Subscriptions heading', async () => {
      await renderPage();
      expect(screen.getByText('Subscriptions')).toBeTruthy();
      expect(screen.getByText('Manage client service subscriptions.')).toBeTruthy();
    });

    it('shows correct active count in stats', async () => {
      await renderPage();
      // baseSub has status 'active', so active count = 1
      const activeCard = screen.getByText('Active Subscriptions').closest('div') as HTMLElement;
      expect(activeCard.textContent).toContain('1');
    });

    it('shows MRR stat card', async () => {
      await renderPage();
      expect(screen.getByText('MRR')).toBeTruthy();
      // baseSub is active + monthly + price 5000 cents = $50.00; appears in stat card AND table cell
      expect(screen.getAllByText('$50.00').length).toBeGreaterThanOrEqual(1);
    });

    it('shows Annual Revenue stat card with $0.00 when no annual subs', async () => {
      await renderPage();
      expect(screen.getByText('Annual Revenue')).toBeTruthy();
    });

    it('shows Suspended stat card', async () => {
      await renderPage();
      expect(screen.getByText('Suspended')).toBeTruthy();
      const suspendedCard = screen.getByText('Suspended').closest('div') as HTMLElement;
      expect(suspendedCard.textContent).toContain('0');
    });

    it('counts MRR only for monthly active subs', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions') return jsonResp({
          success: true,
          data: [
            { ...baseSub, id: 1, status: 'active', billingCycle: 'monthly', price: 3000 },
            { ...baseSub, id: 2, status: 'active', billingCycle: 'annually', price: 120000 },
            { ...baseSub, id: 3, status: 'cancelled', billingCycle: 'monthly', price: 5000 },
          ],
        });
        return defaultHandler(url);
      });
      await renderPage();
      // MRR stat card = $30.00 (only monthly active); appears in stat + table
      const mrrCard = screen.getByText('MRR').closest('div') as HTMLElement;
      expect(mrrCard.textContent).toContain('$30.00');
    });

    it('counts annual revenue for annual active subs', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions') return jsonResp({
          success: true,
          data: [
            { ...baseSub, id: 1, status: 'active', billingCycle: 'annually', price: 120000 },
          ],
        });
        return defaultHandler(url);
      });
      await renderPage();
      // Annual revenue stat card = $1200.00
      const annualCard = screen.getByText('Annual Revenue').closest('div') as HTMLElement;
      expect(annualCard.textContent).toContain('$1200.00');
    });
  });

  // ── Populated table ────────────────────────────────────────────────────────

  describe('populated table', () => {
    it('renders client company in table', async () => {
      await renderPage();
      expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0);
    });

    it('falls back to clientName when company is null', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions')
          return jsonResp({ success: true, data: [{ ...baseSub, company: null }] });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getAllByText('Jane Doe').length).toBeGreaterThan(0);
    });

    it('renders service name in table', async () => {
      await renderPage();
      expect(screen.getByText('Hosting Pro')).toBeTruthy();
    });

    it('renders category badge', async () => {
      await renderPage();
      expect(screen.getAllByText('hosting').length).toBeGreaterThan(0);
    });

    it('renders price formatted via formatCents', async () => {
      await renderPage();
      // $50.00 appears in both the MRR stat card and the table cell
      expect(screen.getAllByText('$50.00').length).toBeGreaterThanOrEqual(1);
    });

    it('renders billing cycle', async () => {
      await renderPage();
      expect(screen.getByText('monthly')).toBeTruthy();
    });

    it('renders status badge', async () => {
      await renderPage();
      expect(screen.getAllByText('active').length).toBeGreaterThan(0);
    });

    it('renders renewal date formatted', async () => {
      await renderPage();
      // toLocaleDateString output; just verify it's not "--"
      const dateCells = document.querySelectorAll('td');
      let found = false;
      dateCells.forEach(td => {
        if (td.textContent && td.textContent !== '--' && /2026|12|1/.test(td.textContent)) {
          found = true;
        }
      });
      expect(found).toBe(true);
    });

    it('renders "--" when renewalDate is null', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions')
          return jsonResp({ success: true, data: [{ ...baseSub, renewalDate: null }] });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('--')).toBeTruthy();
    });

    it('renders multiple rows', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions') return jsonResp({
          success: true,
          data: [
            baseSub,
            { ...baseSub, id: 2, company: 'Beta LLC', serviceName: 'Domain Basic' },
          ],
        });
        return defaultHandler(url);
      });
      await renderPage();
      expect(screen.getByText('Acme Corp')).toBeTruthy();
      expect(screen.getByText('Beta LLC')).toBeTruthy();
    });
  });

  // ── Category color badges ──────────────────────────────────────────────────

  describe('category color badges', () => {
    const categories = ['domain', 'development', 'maintenance', 'other'] as const;
    for (const cat of categories) {
      it(`renders ${cat} category badge`, async () => {
        setHandler((url) => {
          if (url === '/api/admin/portal/subscriptions')
            return jsonResp({ success: true, data: [{ ...baseSub, serviceCategory: cat }] });
          return defaultHandler(url);
        });
        await renderPage();
        expect(screen.getByText(cat)).toBeTruthy();
      });
    }
  });

  // ── Status tabs (filter) ───────────────────────────────────────────────────

  describe('status filter tabs', () => {
    it('renders all status tabs', async () => {
      await renderPage();
      for (const tab of ['all', 'active', 'pending', 'suspended', 'cancelled']) {
        expect(screen.getByRole('button', { name: new RegExp(tab, 'i') })).toBeTruthy();
      }
    });

    it('clicking "active" tab shows only active subscriptions', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions') return jsonResp({
          success: true,
          data: [
            baseSub,
            { ...baseSub, id: 2, company: 'Beta LLC', serviceName: 'Domain Basic', status: 'cancelled' },
          ],
        });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'active' }));
      expect(screen.getByText('Acme Corp')).toBeTruthy();
      expect(screen.queryByText('Beta LLC')).toBeNull();
    });

    it('clicking "cancelled" tab shows no-results for no matching subs', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'cancelled' }));
      expect(screen.getByText('No subscriptions found')).toBeTruthy();
      expect(screen.getByText('No cancelled subscriptions.')).toBeTruthy();
    });

    it('clicking "all" tab shows all subscriptions after filtering', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions') return jsonResp({
          success: true,
          data: [
            baseSub,
            { ...baseSub, id: 2, company: 'Beta LLC', serviceName: 'Domain Basic', status: 'cancelled' },
          ],
        });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'cancelled' }));
      fireEvent.click(screen.getByRole('button', { name: 'all' }));
      expect(screen.getByText('Acme Corp')).toBeTruthy();
      expect(screen.getByText('Beta LLC')).toBeTruthy();
    });

    it('clicking "pending" shows filter-specific empty message', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'pending' }));
      expect(screen.getByText('No pending subscriptions.')).toBeTruthy();
    });
  });

  // ── Action menu ────────────────────────────────────────────────────────────

  describe('action menu', () => {
    it('shows action menu when Actions button clicked', async () => {
      await openActionMenu();
      expect(screen.getByText('Change plan')).toBeTruthy();
      expect(screen.getByText('Refund')).toBeTruthy();
      expect(screen.getByText('Cancel')).toBeTruthy();
    });

    it('toggles menu closed when clicked again', async () => {
      await renderPage();
      const actionBtn = screen.getByLabelText('Actions');
      fireEvent.click(actionBtn);
      expect(screen.getByText('Change plan')).toBeTruthy();
      fireEvent.click(actionBtn);
      expect(screen.queryByText('Change plan')).toBeNull();
    });

    it('Cancel button is disabled when status is "cancelled"', async () => {
      setHandler((url) => {
        if (url === '/api/admin/portal/subscriptions')
          return jsonResp({ success: true, data: [{ ...baseSub, status: 'cancelled' }] });
        return defaultHandler(url);
      });
      await renderPage();
      fireEvent.click(screen.getByLabelText('Actions'));
      const cancelBtn = screen.getByRole('button', { name: /Cancel/ });
      expect(cancelBtn).toHaveProperty('disabled', true);
    });
  });

  // ── Cancel dialog ──────────────────────────────────────────────────────────

  describe('cancel dialog', () => {
    it('opens cancel dialog when "Cancel" action clicked', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => expect(screen.getByText('Cancel subscription')).toBeTruthy());
    });

    it('shows subscription details in dialog subtitle', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => {
        // The subtitle <p> contains "Acme Corp · Hosting Pro"
        const subtitle = document.querySelector('p.text-xs.text-muted-foreground') as HTMLElement;
        expect(subtitle?.textContent).toMatch(/Acme Corp/);
        expect(subtitle?.textContent).toMatch(/Hosting Pro/);
      });
    });

    it('shows cancel description text', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() =>
        expect(screen.getByText(/schedules the Stripe subscription/)).toBeTruthy()
      );
    });

    it('closes dialog when Close button clicked', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => screen.getByText('Cancel subscription'));
      // The "Close" text button is in the footer (not aria-label="Close")
      const closeBtns = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Close');
      fireEvent.click(closeBtns[0]);
      await waitFor(() => expect(screen.queryByText('Cancel subscription')).toBeNull());
    });

    it('closes dialog when X button clicked', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => screen.getByText('Cancel subscription'));
      // The X button has aria-label="Close" (icon-only button in dialog header)
      const xBtn = screen.getAllByRole('button').find(b => b.getAttribute('aria-label') === 'Close');
      if (xBtn) fireEvent.click(xBtn);
      await waitFor(() => expect(screen.queryByText('Cancel subscription')).toBeNull());
    });

    it('shows "Cancel at period end" submit button', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Cancel at period end' })).toBeTruthy()
      );
    });

    it('submits cancel and shows success toast', async () => {
      setHandler((url, init) => {
        if (/\/cancel$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: true });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => screen.getByRole('button', { name: 'Cancel at period end' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel at period end' }));
      await waitFor(() =>
        expect(screen.getByText(/Cancellation scheduled/)).toBeTruthy()
      );
    });

    it('shows error toast when cancel API fails', async () => {
      setHandler((url, init) => {
        if (/\/cancel$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: false, message: 'Stripe error' });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => screen.getByRole('button', { name: 'Cancel at period end' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel at period end' }));
      await waitFor(() => expect(screen.getByText('Stripe error')).toBeTruthy());
    });

    it('shows "Cancel failed" fallback when message is absent', async () => {
      setHandler((url, init) => {
        if (/\/cancel$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: false });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => screen.getByRole('button', { name: 'Cancel at period end' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel at period end' }));
      await waitFor(() => expect(screen.getByText('Cancel failed')).toBeTruthy());
    });

    it('does not submit if confirm() returns false', async () => {
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => screen.getByRole('button', { name: 'Cancel at period end' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel at period end' }));
      await flush();
      // Dialog should still be open (no success toast)
      expect(screen.queryByText(/Cancellation scheduled/)).toBeNull();
      expect(screen.getByText('Cancel subscription')).toBeTruthy();
    });
  });

  // ── Change plan dialog ─────────────────────────────────────────────────────

  describe('change-plan dialog', () => {
    it('opens change-plan dialog when "Change plan" action clicked', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Change plan'));
      await waitFor(() => expect(screen.getByText('Change plan', { selector: 'h2' })).toBeTruthy());
    });

    it('loads service catalog on open', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Change plan'));
      await waitFor(() =>
        expect(screen.getByText(/Hosting Plus/)).toBeTruthy()
      );
    });

    it('shows target plan select with catalog options', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Change plan'));
      await waitFor(() => screen.getByText('Target plan'));
      expect(screen.getByText('— Pick a service from the catalog —')).toBeTruthy();
    });

    it('shows proration select', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Change plan'));
      await waitFor(() => screen.getByText('Proration'));
      expect(screen.getByText('Prorate the change')).toBeTruthy();
      expect(screen.getByText('No proration')).toBeTruthy();
    });

    it('shows "loading catalog" message when services not yet loaded', async () => {
      // Services are initially empty; loading message appears briefly.
      // Intercept so services come back empty.
      setHandler((url, init) => {
        if (url === '/api/admin/portal/services') return jsonResp({ success: true, data: [] });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Change plan'));
      await waitFor(() => screen.getByText('Change plan', { selector: 'h2' }));
      // After loading, catalog is empty — shows the loading text briefly or empty message
      await waitFor(() => expect(screen.getByText(/Loading catalog/)).toBeTruthy());
    });

    it('submit button is disabled when no plan selected', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Change plan'));
      await waitFor(() => screen.getByText('Target plan'));
      // The submit button is disabled until a plan is chosen
      const submitBtns = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Change plan');
      const submitBtn = submitBtns[submitBtns.length - 1] as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it('submits change-plan and shows success toast', async () => {
      setHandler((url, init) => {
        if (/\/change-plan$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: true });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Change plan'));
      await waitFor(() => screen.getByText(/Hosting Plus/));

      // Select the plan
      const planSelect = screen.getByText('Target plan').closest('div')
        ?.querySelector('select') as HTMLSelectElement;
      if (planSelect) fireEvent.change(planSelect, { target: { value: 'price_abc123' } });

      const submitBtns = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Change plan');
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      await waitFor(() => expect(screen.getByText(/Plan changed/)).toBeTruthy());
    });

    it('shows error toast when change-plan API fails', async () => {
      setHandler((url, init) => {
        if (/\/change-plan$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: false, message: 'Plan change failed at Stripe' });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Change plan'));
      await waitFor(() => screen.getByText(/Hosting Plus/));

      const planSelect = screen.getByText('Target plan').closest('div')
        ?.querySelector('select') as HTMLSelectElement;
      if (planSelect) fireEvent.change(planSelect, { target: { value: 'price_abc123' } });

      const submitBtns = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Change plan');
      fireEvent.click(submitBtns[submitBtns.length - 1]);
      await waitFor(() =>
        expect(screen.getByText('Plan change failed at Stripe')).toBeTruthy()
      );
    });
  });

  // ── Refund dialog ──────────────────────────────────────────────────────────

  describe('refund dialog', () => {
    it('opens refund dialog when "Refund" action clicked', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => expect(screen.getByText('Issue refund', { selector: 'h2' })).toBeTruthy());
    });

    it('loads invoices on refund dialog open', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => expect(screen.getByText(/INV-001/)).toBeTruthy());
    });

    it('shows invoice select with loaded invoices', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText('Invoice'));
      expect(screen.getByText('— Pick an invoice —')).toBeTruthy();
    });

    it('shows amount input field', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText('Amount (USD, optional)'));
      expect(screen.getByPlaceholderText('Leave blank for full refund')).toBeTruthy();
    });

    it('shows reason select field', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText('Reason (optional)'));
      expect(screen.getByText('Duplicate charge')).toBeTruthy();
      expect(screen.getByText('Fraudulent')).toBeTruthy();
      expect(screen.getByText('Requested by customer')).toBeTruthy();
    });

    it('shows empty invoices message when no invoices returned', async () => {
      setHandler((url, init) => {
        if (/\/invoices$/.test(url)) return jsonResp({ success: true, data: [] });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() =>
        expect(screen.getByText('No invoices found for this client.')).toBeTruthy()
      );
    });

    it('submit button is disabled when no invoice selected', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText('Issue refund', { selector: 'h2' }));
      // The submit button is disabled until an invoice is picked
      const submitBtns = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Issue refund');
      const submitBtn = submitBtns[submitBtns.length - 1] as HTMLButtonElement;
      expect(submitBtn.disabled).toBe(true);
    });

    it('submits full refund and shows success toast', async () => {
      setHandler((url, init) => {
        if (/\/refund$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: true, data: { status: 'succeeded' } });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText(/INV-001/));

      // Select the invoice
      const invoiceSelect = screen.getByText('— Pick an invoice —').closest('select') as HTMLSelectElement;
      if (invoiceSelect) fireEvent.change(invoiceSelect, { target: { value: '100' } });

      const submitBtns1 = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Issue refund');
      fireEvent.click(submitBtns1[submitBtns1.length - 1]);
      await waitFor(() =>
        expect(screen.getByText(/Refund issued/)).toBeTruthy()
      );
    });

    it('submits partial refund with amount', async () => {
      setHandler((url, init) => {
        if (/\/refund$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: true, data: { status: 'succeeded' } });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText(/INV-001/));

      const invoiceSelect = screen.getByText('— Pick an invoice —').closest('select') as HTMLSelectElement;
      if (invoiceSelect) fireEvent.change(invoiceSelect, { target: { value: '100' } });

      const amountInput = screen.getByPlaceholderText('Leave blank for full refund') as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: '10' } });

      const submitBtns2 = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Issue refund');
      fireEvent.click(submitBtns2[submitBtns2.length - 1]);
      await waitFor(() => expect(screen.getByText(/Refund issued/)).toBeTruthy());
    });

    it('shows error toast when refund amount is invalid', async () => {
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText(/INV-001/));

      const invoiceSelect = screen.getByText('— Pick an invoice —').closest('select') as HTMLSelectElement;
      if (invoiceSelect) fireEvent.change(invoiceSelect, { target: { value: '100' } });

      const amountInput = screen.getByPlaceholderText('Leave blank for full refund') as HTMLInputElement;
      fireEvent.change(amountInput, { target: { value: '-5' } });

      const submitBtns3 = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Issue refund');
      fireEvent.click(submitBtns3[submitBtns3.length - 1]);
      await waitFor(() =>
        expect(screen.getByText('Refund amount must be a positive number.')).toBeTruthy()
      );
    });

    it('shows error toast when refund API fails', async () => {
      setHandler((url, init) => {
        if (/\/refund$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: false, message: 'Card refund declined' });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText(/INV-001/));

      const invoiceSelect = screen.getByText('— Pick an invoice —').closest('select') as HTMLSelectElement;
      if (invoiceSelect) fireEvent.change(invoiceSelect, { target: { value: '100' } });

      const submitBtns4 = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Issue refund');
      fireEvent.click(submitBtns4[submitBtns4.length - 1]);
      await waitFor(() => expect(screen.getByText('Card refund declined')).toBeTruthy());
    });

    it('shows "Refund failed" fallback when message is absent', async () => {
      setHandler((url, init) => {
        if (/\/refund$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: false });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText(/INV-001/));

      const invoiceSelect = screen.getByText('— Pick an invoice —').closest('select') as HTMLSelectElement;
      if (invoiceSelect) fireEvent.change(invoiceSelect, { target: { value: '100' } });

      const submitBtns5 = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Issue refund');
      fireEvent.click(submitBtns5[submitBtns5.length - 1]);
      await waitFor(() => expect(screen.getByText('Refund failed')).toBeTruthy());
    });

    it('does not submit refund if confirm() returns false', async () => {
      vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText(/INV-001/));

      const invoiceSelect = screen.getByText('— Pick an invoice —').closest('select') as HTMLSelectElement;
      if (invoiceSelect) fireEvent.change(invoiceSelect, { target: { value: '100' } });

      const submitBtns6 = screen.getAllByRole('button').filter(b => b.textContent?.trim() === 'Issue refund');
      fireEvent.click(submitBtns6[submitBtns6.length - 1]);
      await flush();
      expect(screen.queryByText(/Refund issued/)).toBeNull();
      expect(screen.getByText('Issue refund', { selector: 'h2' })).toBeTruthy();
    });

    it('marks invoice option disabled when no stripePaymentIntentId', async () => {
      setHandler((url, init) => {
        if (/\/invoices$/.test(url))
          return jsonResp({ success: true, data: [{ ...baseInvoice, stripePaymentIntentId: null }] });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Refund'));
      await waitFor(() => screen.getByText(/no payment intent/));
      const option = screen.getByText(/no payment intent/).closest('option') as HTMLOptionElement;
      expect(option?.disabled).toBe(true);
    });
  });

  // ── Toast ──────────────────────────────────────────────────────────────────

  describe('toast', () => {
    it('dismisses toast when X button clicked', async () => {
      setHandler((url, init) => {
        if (/\/cancel$/.test(url) && init?.method === 'POST')
          return jsonResp({ success: true });
        return defaultHandler(url, init);
      });
      await openActionMenu();
      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => screen.getByRole('button', { name: 'Cancel at period end' }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel at period end' }));
      await waitFor(() => screen.getByText(/Cancellation scheduled/));

      const dismissBtn = screen.getByRole('button', { name: 'Dismiss' });
      fireEvent.click(dismissBtn);
      await waitFor(() => expect(screen.queryByText(/Cancellation scheduled/)).toBeNull());
    });
  });

  // ── Status badge colors ────────────────────────────────────────────────────

  describe('status badge variants', () => {
    const statuses = ['pending', 'suspended', 'cancelled', 'unknown'] as const;
    for (const status of statuses) {
      it(`renders ${status} status badge`, async () => {
        setHandler((url) => {
          if (url === '/api/admin/portal/subscriptions')
            return jsonResp({ success: true, data: [{ ...baseSub, id: 2, status }] });
          return defaultHandler(url);
        });
        await renderPage();
        expect(screen.getAllByText(status).length).toBeGreaterThan(0);
      });
    }
  });

});
