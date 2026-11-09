// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import StudioTable from '@/components/portal/StudioTable';
import SavedViewTabs, { viewCountUrl } from '@/components/portal/crm/SavedViewTabs';
import { contactsCsv } from '@/components/portal/crm/ContactsBulkBar';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PUX-169 Contacts studio pieces', () => {
  it('StudioTable: ink header, select all / toggle, row click, footer', () => {
    const onToggle = vi.fn(); const onToggleAll = vi.fn(); const onRowClick = vi.fn();
    const { container } = render(
      <StudioTable
        columns={[{ key: 'n', label: 'Name', render: (r: { id: number; n: string }) => r.n }, { key: 'v', label: 'Value', align: 'right', render: (r) => r.id }]}
        rows={[{ id: 1, n: 'Ana' }, { id: 2, n: 'Theo' }]}
        rowKey={(r) => r.id}
        selectable selected={new Set([1])} onToggle={onToggle} onToggleAll={onToggleAll} onRowClick={onRowClick}
        footer="1–2 of 2"
      />,
    );
    expect(container.querySelector('thead tr')?.className).toContain('bg-foreground');
    expect(screen.getAllByLabelText('Select row')[0]).toHaveProperty('checked', true);
    fireEvent.click(screen.getAllByLabelText('Select row')[1]);
    expect(onToggle).toHaveBeenCalledWith(2);
    expect(onRowClick).not.toHaveBeenCalled(); // checkbox click never navigates
    fireEvent.click(screen.getByLabelText('Select all'));
    expect(onToggleAll).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Theo'));
    expect(onRowClick).toHaveBeenCalledWith({ id: 2, n: 'Theo' });
    expect(container.querySelectorAll('td.text-right.tabular-nums').length).toBe(2);
    expect(container.textContent).toContain('1–2 of 2');
  });

  it('SavedViewTabs: counts each view through the list route, selects, offers Save this view', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, json: async () => ({ data: { total: url.includes('status=lead') ? 23 : 412 } }) })));
    const onSelect = vi.fn(); const onSave = vi.fn();
    render(<SavedViewTabs views={[{ id: 7, name: 'Corporate leads', filters: { status: 'lead' } }]} selectedId={null} onSelect={onSelect} onDelete={() => {}} canSave onSave={onSave} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Corporate leads/ }).textContent).toContain('23'));
    expect(screen.getByRole('button', { name: /^All/ }).textContent).toContain('412');
    fireEvent.click(screen.getByRole('button', { name: /Corporate leads/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    fireEvent.click(screen.getByRole('button', { name: /Save this view/ }));
    expect(onSave).toHaveBeenCalled();
    expect(viewCountUrl({ status: 'lead', companyId: '3' })).toBe('/api/portal/crm/contacts?limit=1&status=lead&companyId=3');
  });

  it('contactsCsv escapes quotes and keeps the column order', () => {
    const csv = contactsCsv([{ id: 1, firstName: 'Ana', lastName: 'Reyes', email: 'a@x.io', phone: null, companyName: 'Acme "Co"', title: null, status: 'customer' }]);
    expect(csv.split('\n')[0]).toBe('First name,Last name,Email,Phone,Company,Title,Status');
    expect(csv.split('\n')[1]).toBe('"Ana","Reyes","a@x.io","","Acme ""Co""","","customer"');
  });
});
