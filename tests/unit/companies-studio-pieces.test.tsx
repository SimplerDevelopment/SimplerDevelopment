// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
vi.mock('next/link', () => ({ default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a> }));
import CompaniesStudioTable from '@/components/portal/crm/CompaniesStudioTable';
import CompanyPanel from '@/components/portal/crm/CompanyPanel';

describe('companies studio pieces (PUX-203)', () => {
  it('table shows the deal-predicting columns and opens on click', () => {
    const onOpen = vi.fn();
    render(<CompaniesStudioTable rows={[{ id: 1, name: 'Ridgeline', domain: 'ridgeline.co', contactCount: 3, openDeals: 2, lastActivity: { title: 'Call', at: new Date().toISOString() } }]} onOpen={onOpen} footer="1 company" />);
    expect(screen.getByText('Open deals')).toBeTruthy();
    expect(screen.getByText('Call')).toBeTruthy();
    fireEvent.click(screen.getByText('Ridgeline'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 1 }));
  });
  it('panel reads the detail routes and shows Brain knows only when notes exist', async () => {
    global.fetch = vi.fn((url: string) => {
      const ok = (data: unknown) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) } as Response);
      if (url.includes('/knowledge')) return ok({ items: [{ id: 9, title: 'Prefers morning calls' }] });
      if (url.includes('/contacts')) return ok({ contacts: [{ id: 4, firstName: 'Luis', lastName: 'Barrera', title: 'Ops' }] });
      return ok({ id: 1, deals: [{ id: 7, title: 'Spring trips', value: 250000, status: 'open' }, { id: 8, title: 'Lost one', status: 'lost' }] });
    }) as any;
    render(<CompanyPanel companyId={1} name="Ridgeline" onClose={() => {}} />);
    expect(await screen.findByText('Luis Barrera')).toBeTruthy();
    expect(await screen.findByText('Spring trips')).toBeTruthy();
    expect(screen.queryByText('Lost one')).toBeNull();
    expect(await screen.findByText('Prefers morning calls')).toBeTruthy();
    expect(screen.getByText('Open full record').getAttribute('href')).toBe('/portal/crm/companies/1');
  });
});
