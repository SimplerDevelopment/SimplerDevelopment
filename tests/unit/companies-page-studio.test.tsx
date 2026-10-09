// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a> }));
vi.mock('@/components/portal/CompanyMap', () => ({ default: () => <div data-testid="map" /> }));
vi.mock('@/components/portal/CrmImportExport', () => ({ default: () => null }));
vi.mock('@/components/portal/CrmCustomFieldFilters', () => ({ default: () => null }));

import CompaniesPage from '@/app/portal/crm/companies/page';

describe('companies under the flag (PUX-203)', () => {
  it('defaults to the list idiom, opens a side panel on a row, New company is the teal, map is one icon', async () => {
    global.fetch = vi.fn((url: string) => {
      const ok = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) } as Response);
      if (url.includes('/companies/1')) return ok({ id: 1, deals: [] });
      if (url.includes('/contacts')) return ok({ contacts: [] });
      if (url.includes('/knowledge')) return Promise.resolve({ ok: false, status: 402, json: () => Promise.resolve({}) } as Response);
      return ok({ companies: [{ id: 1, name: 'Ridgeline', domain: 'ridgeline.co', contactCount: 3, openDeals: 2, lastActivity: null, latitude: null, longitude: null, totalDealValue: 0, createdAt: '2026-08-01' }], total: 1 });
    }) as any;
    render(<CompaniesPage />);
    expect(await screen.findByText('Ridgeline')).toBeTruthy();
    expect(screen.getByText('Open deals')).toBeTruthy();
    expect(screen.queryByTestId('map')).toBeNull();
    expect(screen.getByText('New company').closest('button')?.className).toContain('bg-primary');
    fireEvent.click(screen.getByText('Ridgeline'));
    expect(await screen.findByLabelText('Company: Ridgeline')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Map view'));
    expect(screen.getByTestId('map')).toBeTruthy();
  });
});
