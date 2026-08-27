// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import React from 'react';
import NoteLinkedEntities, { labelOf } from '@/components/brain/NoteLinkedEntities';

const originalFetch = global.fetch;
afterEach(() => { cleanup(); global.fetch = originalFetch; });

describe('NoteLinkedEntities (PUX-160)', () => {
  it('labelOf prefers name, then first+last, then title, then #id', () => {
    expect(labelOf('company', { name: 'Summit Bank' }, 1)).toBe('Summit Bank');
    expect(labelOf('contact', { firstName: 'Jordan', lastName: 'Whitfield' }, 2)).toBe('Jordan Whitfield');
    expect(labelOf('deal', { title: 'Corporate retreat' }, 3)).toBe('Corporate retreat');
    expect(labelOf('deal', null, 4)).toBe('Deal #4');
  });

  it('fetches only the ids the note has and links each into the CRM', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const u = String(input); calls.push(u);
      const body = u.includes('/deals/') ? { success: true, data: { title: 'Corporate retreat' } } : { success: true, data: { firstName: 'Jordan', lastName: 'Whitfield' } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch;
    render(<NoteLinkedEntities contactId={2} dealId={3} companyId={null} />);
    expect((await screen.findByRole('link', { name: /Jordan Whitfield/ })).getAttribute('href')).toBe('/portal/crm/contacts/2');
    expect(screen.getByRole('link', { name: /Corporate retreat/ }).getAttribute('href')).toBe('/portal/crm/deals/3');
    expect(calls).toHaveLength(2);
    expect(calls.some((c) => c.includes('/companies/'))).toBe(false);
  });

  it('nothing linked → says so, no fetch', () => {
    global.fetch = vi.fn() as typeof fetch;
    render(<NoteLinkedEntities contactId={null} dealId={null} companyId={null} />);
    expect(screen.getByText(/Not linked/)).toBeTruthy();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
