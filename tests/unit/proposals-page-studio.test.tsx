// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('@/components/portal/CrmCompanyTypeaheadPicker', () => ({ default: () => null }));
import ProposalsPage from '@/app/portal/crm/proposals/page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PUX-173 Proposals & contracts (studio)', () => {
  it('two tabs with counts, one teal New proposal, the studio table with Views, and the contracts body on its tab', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => ({ success: true, data:
      url.includes('/crm/proposals') ? [{ id: 1, title: 'Summit Bank retreat', status: 'viewed', contactId: null, companyId: null, dealId: null, lineItems: [], fees: [], sentAt: '2026-08-25T09:00:00Z', firstViewedAt: '2026-08-26T14:20:00Z', lastViewedAt: '2026-08-27T08:05:00Z', viewCount: 2, acceptedAt: null, declinedAt: null, createdAt: '2026-08-20T00:00:00Z', contactFirstName: 'Jordan', contactLastName: 'Whitfield', companyName: 'Summit Bank', dealTitle: null }]
      : url.includes('/crm/contracts') ? [{ id: 9, title: 'MSA', summary: null, status: 'partially_signed', dealId: null, contactId: null, companyId: null, validUntil: null, sentAt: null, fullyExecutedAt: null, createdAt: '2026-08-20T00:00:00Z', contactName: null, companyName: 'Summit Bank', dealTitle: null, signers: { total: 2, signed: 1 } }]
      : [] }) })));
    const { container } = render(<ProposalsPage />);
    await waitFor(() => expect(screen.getByRole('tab', { name: /Proposals 1/ })).toBeTruthy());
    expect(container.textContent).toContain('1 proposals out · 1 contracts in progress');
    const teal = Array.from(container.querySelectorAll('button')).filter((b) => b.className.includes('bg-primary'));
    expect(teal.map((b) => b.textContent)).toEqual(['addNew proposal']);
    expect(screen.getByText('Views')).toBeTruthy();
    expect(screen.getByText('2 views · story')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Contracts 1/ }));
    await waitFor(() => expect(screen.getByText('MSA')).toBeTruthy());
    expect(container.textContent).toContain('Partially Signed');
  });
});
