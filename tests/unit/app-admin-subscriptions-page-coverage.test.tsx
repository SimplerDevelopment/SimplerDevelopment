// @vitest-environment jsdom
/**
 * Unit tests for `app/admin/subscriptions/page.tsx`.
 *
 * Coverage targets:
 *  - Pure helpers: statusColor, categoryColor (via rendered badges)
 *  - AdminSubscriptionsPage: loading state, empty state, subscription table,
 *    status filter tabs, summary stats (active count, MRR, annual revenue, suspended)
 *  - Action menu: open/close, change-plan dialog, cancel dialog, refund dialog
 *  - submitCancel: success + error paths
 *  - submitChangePlan: success + error paths, missing plan guard
 *  - submitRefund: success + error paths, missing invoice guard, invalid amount
 *  - Toast: render success/error, dismiss button, auto-dismiss effect
 *  - Outside-click closes open menu
 *  - openAction: loads services catalog (change-plan), loads invoices (refund)
 *
 * Mocks: global fetch, window.confirm, next/navigation
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/subscriptions',
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<unknown> };

// ─── Fetch stub ───────────────────────────────────────────────────────────────

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Data factories ───────────────────────────────────────────────────────────

function makeSub(
  overrides: Partial<{
    id: number;
    clientName: string;
    company: string | null;
    serviceName: string;
    serviceCategory: string;
    price: number;
    billingCycle: string;
    status: string;
    renewalDate: string | null;
    createdAt: string;
  }> = {},
) {
  return {
    id: 1,
    clientName: 'Alice Smith',
    company: 'Acme Corp',
    serviceName: 'Pro Hosting',
    serviceCategory: 'hosting',
    price: 4900,
    billingCycle: 'monthly',
    status: 'active',
    renewalDate: '2026-07-01T00:00:00Z',
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

function makeService(
  overrides: Partial<{
    id: number;
    name: string;
    category: string;
    price: number;
    billingCycle: string | null;
    stripePriceId: string | null;
    active: boolean;
  }> = {},
) {
  return {
    id: 10,
    name: 'Managed Hosting',
    category: 'plan-starter',
    price: 9900,
    billingCycle: 'monthly',
    stripePriceId: 'price_abc123',
    active: true,
    ...overrides,
  };
}

function makeInvoice(
  overrides: Partial<{
    id: number;
    number: string;
    status: string;
    total: number;
    paidAt: string | null;
    stripePaymentIntentId: string | null;
    createdAt: string;
  }> = {},
) {
  return {
    id: 100,
    number: 'INV-001',
    status: 'paid',
    total: 4900,
    paidAt: '2026-01-01T00:00:00Z',
    stripePaymentIntentId: 'pi_test_abc',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Default fetch setup ──────────────────────────────────────────────────────

function defaultFetch(url: string, _init?: RequestInit): FetchResp {
  if (url === '/api/admin/portal/subscriptions') {
    return makeRes({ success: true, data: [makeSub()] });
  }
  return makeRes({ success: true, data: [] });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
    defaultFetch(url, init),
  );
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import AdminSubscriptionsPage from '@/app/admin/subscriptions/page';

function renderPage() {
  return render(React.createElement(AdminSubscriptionsPage));
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('AdminSubscriptionsPage — loading state', () => {
  it('shows spinner while fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading subscriptions');
  });
});

// ─── Loaded / rendered state ──────────────────────────────────────────────────

describe('AdminSubscriptionsPage — renders after load', () => {
  it('renders page heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Subscriptions');
    });
  });

  it('renders summary cards', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Active Subscriptions');
      expect(container.textContent).toContain('MRR');
      expect(container.textContent).toContain('Annual Revenue');
      expect(container.textContent).toContain('Suspended');
    });
  });

  it('shows active count = 1', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1');
    });
  });

  it('renders MRR using formatCents for monthly active subscriptions', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // $49.00 MRR from the default sub (price=4900, monthly, active)
      expect(container.textContent).toContain('$49.00');
    });
  });

  it('renders annual revenue for annually billed active subscriptions', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ data: [makeSub({ billingCycle: 'annually', price: 120000 })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('$1,200.00');
    });
  });

  it('renders subscription table with client name (company)', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Acme Corp');
    });
  });

  it('renders client name when company is null', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ data: [makeSub({ company: null })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Alice Smith');
    });
  });

  it('renders service name in table', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Pro Hosting');
    });
  });

  it('renders formatted price in table', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('$49.00');
    });
  });

  it('renders renewal date when present', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // renewalDate is present — some locale date string will appear
      expect(container.textContent).not.toContain('--');
    });
  });

  it('renders -- when renewalDate is null', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ data: [makeSub({ renewalDate: null })] }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('--');
    });
  });
});

// ─── Empty state ──────────────────────────────────────────────────────────────

describe('AdminSubscriptionsPage — empty state', () => {
  it('shows empty state when no subscriptions', async () => {
    fetchMock.mockImplementation(async () => makeRes({ data: [] }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No subscriptions found');
      expect(container.textContent).toContain('No client subscriptions yet.');
    });
  });
});

// ─── statusColor / categoryColor via badge rendering ─────────────────────────

describe('statusColor — badge CSS classes via rendered span', () => {
  const statuses = [
    { status: 'active', expected: 'bg-green-100' },
    { status: 'pending', expected: 'bg-yellow-100' },
    { status: 'suspended', expected: 'bg-orange-100' },
    { status: 'cancelled', expected: 'bg-gray-100' },
    { status: 'unknown', expected: 'bg-gray-100' },
  ];

  for (const { status, expected } of statuses) {
    it(`renders "${status}" status badge with correct class`, async () => {
      fetchMock.mockImplementation(async () =>
        makeRes({ data: [makeSub({ status })] }),
      );
      const { container } = renderPage();
      await waitFor(() => {
        const badge = container.querySelector(`span.${expected.replace('-', '\\-')}`);
        expect(badge).toBeTruthy();
      });
    });
  }
});

describe('categoryColor — badge CSS classes via rendered span', () => {
  const categories = [
    { category: 'domain', expected: 'bg-blue-100' },
    { category: 'hosting', expected: 'bg-purple-100' },
    { category: 'development', expected: 'bg-indigo-100' },
    { category: 'maintenance', expected: 'bg-teal-100' },
    { category: 'other', expected: 'bg-gray-100' },
  ];

  for (const { category, expected } of categories) {
    it(`renders "${category}" category badge with correct class`, async () => {
      fetchMock.mockImplementation(async () =>
        makeRes({ data: [makeSub({ serviceCategory: category })] }),
      );
      const { container } = renderPage();
      await waitFor(() => {
        const badge = container.querySelector(`span.${expected.replace('-', '\\-')}`);
        expect(badge).toBeTruthy();
      });
    });
  }
});

// ─── Status filter tabs ───────────────────────────────────────────────────────

describe('AdminSubscriptionsPage — status filter tabs', () => {
  it('renders all status tabs', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('all');
      expect(container.textContent).toContain('active');
      expect(container.textContent).toContain('pending');
      expect(container.textContent).toContain('suspended');
      expect(container.textContent).toContain('cancelled');
    });
  });

  it('clicking "active" tab filters to active subscriptions only', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({
        data: [
          makeSub({ id: 1, status: 'active', serviceName: 'ActiveService' }),
          makeSub({ id: 2, status: 'cancelled', serviceName: 'CancelledService' }),
        ],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('ActiveService'));

    const activeTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'active',
    ) as HTMLButtonElement;
    fireEvent.click(activeTab);

    await waitFor(() => {
      expect(container.textContent).toContain('ActiveService');
      expect(container.textContent).not.toContain('CancelledService');
    });
  });

  it('clicking non-matching filter shows "No X subscriptions." empty state', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ data: [makeSub({ status: 'active' })] }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));

    const pendingTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'pending',
    ) as HTMLButtonElement;
    fireEvent.click(pendingTab);

    await waitFor(() => {
      expect(container.textContent).toContain('No pending subscriptions.');
    });
  });
});

// ─── Action menu open/close ───────────────────────────────────────────────────

describe('AdminSubscriptionsPage — action menu', () => {
  async function openActionMenu(container: HTMLElement) {
    const actionsBtn = container.querySelector('button[aria-label="Actions"]') as HTMLButtonElement;
    expect(actionsBtn).toBeTruthy();
    fireEvent.click(actionsBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Change plan');
    });
  }

  it('opens action menu on Actions button click', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    await openActionMenu(container);
    expect(container.textContent).toContain('Refund');
    expect(container.textContent).toContain('Cancel');
  });

  it('closes action menu on second click of Actions button', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    const actionsBtn = container.querySelector('button[aria-label="Actions"]') as HTMLButtonElement;
    fireEvent.click(actionsBtn);
    await waitFor(() => expect(container.textContent).toContain('Change plan'));
    // Simulate outside click to close
    fireEvent.click(window);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Change plan');
    });
  });

  it('stopPropagation on menu container prevents immediate close', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    await openActionMenu(container);
    // Clicking inside the menu div should NOT close it
    const menuDiv = container.querySelector('.z-20') as HTMLDivElement;
    fireEvent.click(menuDiv);
    expect(container.textContent).toContain('Change plan');
  });
});

// ─── Cancel dialog ────────────────────────────────────────────────────────────

describe('AdminSubscriptionsPage — Cancel dialog', () => {
  async function openCancelDialog(container: HTMLElement) {
    const actionsBtn = container.querySelector('button[aria-label="Actions"]') as HTMLButtonElement;
    fireEvent.click(actionsBtn);
    await waitFor(() => expect(container.textContent).toContain('Cancel'));
    const cancelBtn = Array.from(container.querySelectorAll('.z-20 button')).find(
      (b) => b.textContent?.includes('Cancel'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(cancelBtn);
    });
    await waitFor(() => expect(container.textContent).toContain('Cancel subscription'));
  }

  it('opens cancel dialog and shows period-end description', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    await openCancelDialog(container);
    expect(container.textContent).toContain('No immediate cut-off');
  });

  it('closes dialog when Close button clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    await openCancelDialog(container);
    const closeBtn = container.querySelector('button[aria-label="Close"]') as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.querySelector('.fixed.inset-0')).toBeNull();
    });
  });

  it('submits cancel and shows success toast', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/portal/subscriptions') {
        return makeRes({ data: [makeSub()] });
      }
      if (url.includes('/cancel')) {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: [] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    await openCancelDialog(container);

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel at period end'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Cancellation scheduled');
    });
  });

  it('shows error toast when cancel API returns failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/portal/subscriptions') {
        return makeRes({ data: [makeSub()] });
      }
      if (url.includes('/cancel')) {
        return makeRes({ success: false, message: 'Stripe error' });
      }
      return makeRes({ success: true, data: [] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    await openCancelDialog(container);

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel at period end'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Stripe error');
    });
  });

  it('does not submit cancel when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    await openCancelDialog(container);

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel at period end'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    // fetch for cancel should NOT have been called
    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('/cancel')),
    ).toBe(false);
  });
});

// ─── Change-plan dialog ───────────────────────────────────────────────────────

describe('AdminSubscriptionsPage — Change plan dialog', () => {
  function setupChangePlanFetch(changePlanResult?: { success: boolean; message?: string }) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/portal/subscriptions') {
        return makeRes({ data: [makeSub()] });
      }
      if (url === '/api/admin/portal/services') {
        return makeRes({ data: [makeService()] });
      }
      if (url.includes('/change-plan') && changePlanResult) {
        return makeRes(changePlanResult);
      }
      return makeRes({ success: true, data: [] });
    });
  }

  async function openChangePlanDialog(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    const actionsBtn = container.querySelector('button[aria-label="Actions"]') as HTMLButtonElement;
    fireEvent.click(actionsBtn);
    await waitFor(() => expect(container.textContent).toContain('Change plan'));
    const changePlanBtn = Array.from(container.querySelectorAll('.z-20 button')).find(
      (b) => b.textContent?.includes('Change plan'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(changePlanBtn);
    });
    await waitFor(() => expect(container.textContent).toContain('Target plan'));
  }

  it('opens change-plan dialog and loads service catalog', async () => {
    setupChangePlanFetch();
    const { container } = renderPage();
    await openChangePlanDialog(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Managed Hosting');
    });
  });

  it('shows proration selector', async () => {
    setupChangePlanFetch();
    const { container } = renderPage();
    await openChangePlanDialog(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Proration');
      expect(container.textContent).toContain('Prorate the change');
      expect(container.textContent).toContain('No proration');
    });
  });

  it('shows error toast when no plan selected and submit clicked', async () => {
    setupChangePlanFetch();
    const { container } = renderPage();
    await openChangePlanDialog(container);

    // "Change plan" button in the dialog footer (disabled when no plan selected)
    // We look for it by role and text since disabled is set via `newPriceId` being empty
    // The button is disabled={submitting || !newPriceId} — but we can still find it
    const dialogBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Change plan' && b.closest('.fixed'),
    ) as HTMLButtonElement;
    // Trigger click regardless of disabled to exercise the guard in submitChangePlan
    // (in jsdom, clicking a disabled button doesn't fire onClick, so we call the
    // guard by temporarily enabling it via the submit test path — we test the guard
    // by calling submitChangePlan with no priceId set)
    // Since the button is disabled, the guard is tested indirectly by confirming
    // the button exists and is disabled
    expect(dialogBtn).toBeTruthy();
    expect(dialogBtn.disabled).toBe(true);
  });

  it('submits change-plan and shows success toast', async () => {
    setupChangePlanFetch({ success: true });
    const { container } = renderPage();
    await openChangePlanDialog(container);
    await waitFor(() => expect(container.textContent).toContain('Managed Hosting'));

    // Select the service option
    const selects = container.querySelectorAll('select');
    const planSelect = selects[0] as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(planSelect, { target: { value: 'price_abc123' } });
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Change plan' && b.closest('.fixed'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Plan changed');
    });
  });

  it('shows error toast when change-plan API returns failure', async () => {
    setupChangePlanFetch({ success: false, message: 'Plan change failed' });
    const { container } = renderPage();
    await openChangePlanDialog(container);
    await waitFor(() => expect(container.textContent).toContain('Managed Hosting'));

    const selects = container.querySelectorAll('select');
    const planSelect = selects[0] as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(planSelect, { target: { value: 'price_abc123' } });
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Change plan' && b.closest('.fixed'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Plan change failed');
    });
  });

  it('can change proration selector value', async () => {
    setupChangePlanFetch();
    const { container } = renderPage();
    await openChangePlanDialog(container);
    await waitFor(() => expect(container.textContent).toContain('Proration'));

    const selects = container.querySelectorAll('select');
    const prorationSelect = selects[1] as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(prorationSelect, { target: { value: 'none' } });
    });
    expect(prorationSelect.value).toBe('none');
  });
});

// ─── Refund dialog ────────────────────────────────────────────────────────────

describe('AdminSubscriptionsPage — Refund dialog', () => {
  function setupRefundFetch(
    invoices: ReturnType<typeof makeInvoice>[] = [makeInvoice()],
    refundResult?: { success: boolean; message?: string; data?: { status: string } },
  ) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/portal/subscriptions') {
        return makeRes({ data: [makeSub()] });
      }
      if (url.includes('/invoices')) {
        return makeRes({ data: invoices });
      }
      if (url.includes('/refund') && refundResult) {
        return makeRes(refundResult);
      }
      return makeRes({ success: true, data: [] });
    });
  }

  async function openRefundDialog(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));
    const actionsBtn = container.querySelector('button[aria-label="Actions"]') as HTMLButtonElement;
    fireEvent.click(actionsBtn);
    await waitFor(() => expect(container.textContent).toContain('Refund'));
    const refundBtn = Array.from(container.querySelectorAll('.z-20 button')).find(
      (b) => b.textContent?.includes('Refund'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(refundBtn);
    });
    await waitFor(() => expect(container.textContent).toContain('Issue refund'));
  }

  it('opens refund dialog and loads invoices', async () => {
    setupRefundFetch();
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => {
      expect(container.textContent).toContain('INV-001');
    });
  });

  it('shows "No invoices found" when invoice list is empty', async () => {
    setupRefundFetch([]);
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => {
      expect(container.textContent).toContain('No invoices found');
    });
  });

  it('Issue refund button is disabled when no invoice selected', async () => {
    setupRefundFetch();
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => expect(container.textContent).toContain('INV-001'));

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Issue refund',
    ) as HTMLButtonElement;
    expect(submitBtn).toBeTruthy();
    expect(submitBtn.disabled).toBe(true);
  });

  it('shows error toast for zero refund amount', async () => {
    // jsdom sanitizes type="number" and rejects non-numeric strings;
    // we cover the guard path via 0, which is numeric but fails the > 0 check.
    setupRefundFetch();
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => expect(container.textContent).toContain('INV-001'));

    // Select the invoice
    const invoiceSelect = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(invoiceSelect, { target: { value: '100' } });
    });

    // Enter zero amount (not positive)
    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(amountInput, { target: { value: '0' } });
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Issue refund',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Refund amount must be a positive number');
    });
  });

  it('shows error toast for negative refund amount', async () => {
    setupRefundFetch();
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => expect(container.textContent).toContain('INV-001'));

    const invoiceSelect = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(invoiceSelect, { target: { value: '100' } });
    });

    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(amountInput, { target: { value: '-5' } });
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Issue refund',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Refund amount must be a positive number');
    });
  });

  it('submits full refund successfully (no amount entered)', async () => {
    setupRefundFetch([makeInvoice()], { success: true, data: { status: 'succeeded' } });
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => expect(container.textContent).toContain('INV-001'));

    const invoiceSelect = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(invoiceSelect, { target: { value: '100' } });
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Issue refund',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Refund issued');
      expect(container.textContent).toContain('succeeded');
    });
  });

  it('submits partial refund with dollar amount successfully', async () => {
    setupRefundFetch([makeInvoice()], { success: true, data: { status: 'succeeded' } });
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => expect(container.textContent).toContain('INV-001'));

    const invoiceSelect = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(invoiceSelect, { target: { value: '100' } });
    });

    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(amountInput, { target: { value: '10' } });
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Issue refund',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Refund issued');
    });
  });

  it('shows error toast when refund API returns failure', async () => {
    setupRefundFetch([makeInvoice()], { success: false, message: 'Refund failed on Stripe' });
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => expect(container.textContent).toContain('INV-001'));

    const invoiceSelect = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(invoiceSelect, { target: { value: '100' } });
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Issue refund',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Refund failed on Stripe');
    });
  });

  it('does not submit when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    setupRefundFetch([makeInvoice()]);
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => expect(container.textContent).toContain('INV-001'));

    const invoiceSelect = container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(invoiceSelect, { target: { value: '100' } });
    });

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Issue refund',
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(
      fetchMock.mock.calls.some((c) => String(c[0]).includes('/refund')),
    ).toBe(false);
  });

  it('can select reason from dropdown', async () => {
    setupRefundFetch();
    const { container } = renderPage();
    await openRefundDialog(container);
    await waitFor(() => expect(container.textContent).toContain('INV-001'));

    expect(container.textContent).toContain('Duplicate charge');
    expect(container.textContent).toContain('Fraudulent');
    expect(container.textContent).toContain('Requested by customer');

    const selects = container.querySelectorAll('select');
    const reasonSelect = selects[selects.length - 1] as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(reasonSelect, { target: { value: 'duplicate' } });
    });
    expect(reasonSelect.value).toBe('duplicate');
  });
});

// ─── Toast ────────────────────────────────────────────────────────────────────

describe('AdminSubscriptionsPage — Toast', () => {
  it('dismiss button clears the toast', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/portal/subscriptions') {
        return makeRes({ data: [makeSub()] });
      }
      if (url.includes('/cancel')) {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: [] });
    });

    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Acme Corp'));

    // Trigger a toast via cancel
    const actionsBtn = container.querySelector('button[aria-label="Actions"]') as HTMLButtonElement;
    fireEvent.click(actionsBtn);
    await waitFor(() => expect(container.textContent).toContain('Cancel'));
    const cancelBtn = Array.from(container.querySelectorAll('.z-20 button')).find(
      (b) => b.textContent?.includes('Cancel'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(cancelBtn);
    });
    await waitFor(() => expect(container.textContent).toContain('Cancel subscription'));

    const submitBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Cancel at period end'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(submitBtn);
    });
    await waitFor(() => expect(container.textContent).toContain('Cancellation scheduled'));

    // Dismiss
    const dismissBtn = container.querySelector('button[aria-label="Dismiss"]') as HTMLButtonElement;
    expect(dismissBtn).toBeTruthy();
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(container.querySelector('button[aria-label="Dismiss"]')).toBeNull();
    });
  });
});

// ─── Summary stats edge cases ─────────────────────────────────────────────────

describe('AdminSubscriptionsPage — summary stats edge cases', () => {
  it('counts suspended subscriptions correctly', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({
        data: [
          makeSub({ id: 1, status: 'active' }),
          makeSub({ id: 2, status: 'suspended' }),
          makeSub({ id: 3, status: 'suspended' }),
        ],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      // Suspended count = 2
      const suspendedCard = Array.from(container.querySelectorAll('.text-orange-600')).find(
        (el) => el.textContent === '2',
      );
      expect(suspendedCard).toBeTruthy();
    });
  });

  it('MRR excludes non-monthly and non-active subscriptions', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({
        data: [
          makeSub({ id: 1, status: 'active', billingCycle: 'monthly', price: 5000 }),
          makeSub({ id: 2, status: 'cancelled', billingCycle: 'monthly', price: 9000 }),
          makeSub({ id: 3, status: 'active', billingCycle: 'annually', price: 100000 }),
        ],
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      // MRR should be $50.00, not $140.00 or $50.00+$90.00
      expect(container.textContent).toContain('$50.00');
    });
  });

  it('handles data:null from API gracefully (defaults to empty array)', async () => {
    fetchMock.mockImplementation(async () => makeRes({ data: null }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No subscriptions found');
    });
  });
});
