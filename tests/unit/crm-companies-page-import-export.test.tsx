/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom
/**
 * CRM79-017 — the companies list page (`app/portal/crm/companies/page.tsx`)
 * now renders <CrmImportExport entityType="company" .../> in the header
 * actions, mirroring how the contacts page already wires it in
 * (`app/portal/crm/contacts/page.tsx`). This suite is scoped to just that
 * wiring: does the control render, with the right entityType, and is it
 * hooked up to the page's own filters/refetch.
 *
 * Modelled on `tests/unit/app-portal-crm-companies-page.test.tsx` — same
 * mock-the-heavy-children strategy (CompanyMap, CrmCustomFieldFilters,
 * MediaPicker) plus a stub for CrmImportExport itself so we can assert on
 * the props the page passes it without exercising the real import/export
 * flow (that's already covered by
 * `tests/unit/components-portal-crm-import-export.test.tsx`).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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
  usePathname: () => '/portal/crm/companies',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

vi.mock('@/components/portal/CompanyMap', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'company-map' }),
}));

vi.mock('@/components/portal/CrmCustomFieldFilters', () => ({
  __esModule: true,
  default: () => React.createElement('div', { 'data-testid': 'custom-filters' }),
}));

vi.mock('@/components/admin/MediaPicker', () => ({
  __esModule: true,
  default: ({ label }: any) => React.createElement('div', { 'data-testid': 'media-picker' }, label),
}));

// Capture the props CrmImportExport is invoked with, and render a minimal
// stub that surfaces entityType visibly (so assertions can read it off the
// DOM the same way a user-facing check would) plus an "onImportComplete"
// trigger button to prove the callback wiring, without pulling in the real
// upload/preview/mapping flow.
const crmImportExportCalls: any[] = [];
vi.mock('@/components/portal/CrmImportExport', () => ({
  __esModule: true,
  default: (props: any) => {
    crmImportExportCalls.push(props);
    return React.createElement(
      'div',
      { 'data-testid': 'crm-import-export', 'data-entity-type': props.entityType },
      React.createElement('button', { onClick: () => props.onImportComplete?.() }, `Import/Export ${props.entityType}s`),
    );
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

type FetchHandler = (url: string, init?: RequestInit) => any;
const handlers: FetchHandler[] = [];

function setFetchHandler(handler: FetchHandler) {
  handlers.length = 0;
  handlers.push(handler);
}

function jsonResponse(body: any) {
  return { ok: true, json: async () => body } as any;
}

const baseCompanies = [
  {
    id: 1,
    name: 'Acme Corp',
    domain: 'acme.com',
    industry: 'Manufacturing',
    size: '51-200',
    phone: '555-0001',
    website: 'https://acme.com',
    address: '1 Acme Way, Springfield',
    logoUrl: null,
    notes: 'Key partner',
    latitude: '40.7128',
    longitude: '-74.0060',
    contactCount: 5,
    totalDealValue: 150000,
    createdAt: '2025-01-01T00:00:00Z',
  },
];

function defaultFetch(url: string, init?: RequestInit): any {
  if (
    typeof url === 'string' &&
    url.startsWith('/api/portal/crm/companies') &&
    (!init || init.method === undefined || init.method === 'GET')
  ) {
    return jsonResponse({ data: { companies: baseCompanies, total: 1 } });
  }
  return jsonResponse({});
}

beforeEach(() => {
  crmImportExportCalls.length = 0;
  setFetchHandler(defaultFetch);
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => Promise.resolve(handlers[0](url, init))),
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ───────────────────────────────────────────────────────

import CrmCompaniesPage from '@/app/portal/crm/companies/page';

async function renderPage() {
  const result = render(React.createElement(CrmCompaniesPage));
  await waitFor(() => {
    expect(result.container.textContent).toContain('Acme Corp');
  });
  return result;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('CrmCompaniesPage — import/export wiring (CRM79-017)', () => {
  it('renders the CrmImportExport control', async () => {
    await renderPage();
    expect(screen.getByTestId('crm-import-export')).toBeTruthy();
  });

  it('renders it with entityType="company"', async () => {
    await renderPage();
    const control = screen.getByTestId('crm-import-export');
    expect(control.getAttribute('data-entity-type')).toBe('company');
    expect(control.textContent).toContain('Import/Export companys');
  });

  it('passes entityType="company" as a prop, not "contact" or "deal"', async () => {
    await renderPage();
    expect(crmImportExportCalls.length).toBeGreaterThan(0);
    expect(crmImportExportCalls[crmImportExportCalls.length - 1].entityType).toBe('company');
  });

  it('places the control next to the Add Company action in the header', async () => {
    const { container } = await renderPage();
    const addBtn = screen.getByText('Add Company');
    const control = screen.getByTestId('crm-import-export');
    // Both live inside the same header actions wrapper.
    const actionsWrapper = addBtn.closest('div');
    expect(actionsWrapper?.contains(control)).toBe(true);
    void container;
  });

  it('passes the current search filter through currentFilters', async () => {
    vi.useFakeTimers();
    render(React.createElement(CrmCompaniesPage));
    await vi.waitFor(() => {
      expect(crmImportExportCalls.length).toBeGreaterThan(0);
    });
    const searchInput = document.querySelector(
      'input[placeholder="Search companies..."]',
    ) as HTMLInputElement;
    fireEvent.change(searchInput, { target: { value: 'acme' } });
    await vi.advanceTimersByTimeAsync(350);
    vi.useRealTimers();
    await waitFor(() => {
      const last = crmImportExportCalls[crmImportExportCalls.length - 1];
      expect(last.currentFilters).toMatchObject({ search: 'acme' });
    });
  });

  it('wires onImportComplete to the page refetch (fires a companies GET)', async () => {
    const fetchSpy = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(defaultFetch(url, init)),
    );
    vi.stubGlobal('fetch', fetchSpy);
    await renderPage();
    const callsBefore = fetchSpy.mock.calls.filter(
      (c) => typeof c[0] === 'string' && c[0].startsWith('/api/portal/crm/companies'),
    ).length;
    fireEvent.click(screen.getByText('Import/Export companys'));
    await waitFor(() => {
      const callsAfter = fetchSpy.mock.calls.filter(
        (c) => typeof c[0] === 'string' && c[0].startsWith('/api/portal/crm/companies'),
      ).length;
      expect(callsAfter).toBeGreaterThan(callsBefore);
    });
  });
});
