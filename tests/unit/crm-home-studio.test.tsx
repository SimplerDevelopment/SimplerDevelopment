// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [k: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));
vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));

import CrmDashboardPage from '@/app/portal/crm/page';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const res = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) });

describe('PUX-168 CRM home (studio)', () => {
  it('one teal New deal in the header, Quick Actions as ghosts, funnel as bars with counts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url.includes('/dashboard')
      ? res({ totalContacts: 1, totalCompanies: 1, openDealsValue: 0, wonDealsValue: 0, recentActivities: [] })
      : res({ winLoss: { won: 1, lost: 1, open: 1 }, revenueByMonth: [], avgDaysToClose: 0, activitySummary: [], topDeals: [], mrr: 0, arr: 0,
              pipelineFunnel: [{ stage_name: 'Lead', color: '#6366f1', sort_order: 1, deal_count: 4, total_value: 1000 }, { stage_name: 'Won', color: '#22c55e', sort_order: 2, deal_count: 1, total_value: 250 }] })));
    const { container } = render(React.createElement(CrmDashboardPage));
    await waitFor(() => expect(container.textContent).toContain('Grow · CRM'));
    const teal = Array.from(container.querySelectorAll('a')).filter((a) => a.className.includes('bg-primary'));
    expect(teal.map((a) => a.textContent?.trim())).toEqual(['addNew deal']);
    expect(teal[0].getAttribute('href')).toBe('/portal/crm/deals');
    const addContact = Array.from(container.querySelectorAll('a')).find((a) => a.textContent?.includes('Add Contact'));
    expect(addContact?.className).toContain('border-border');
    expect(container.textContent).toContain('Lead');
    expect(Array.from(container.querySelectorAll('.font-mono')).map((e) => e.textContent)).toContain('4');
  });
});
