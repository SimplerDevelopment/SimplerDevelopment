// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import ContactEmailsTab from '@/app/portal/crm/contacts/[id]/_components/ContactEmailsTab';
import ContactNotesCard from '@/app/portal/crm/contacts/[id]/_components/ContactNotesCard';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PUX-170 contact detail studio tabs', () => {
  it('Emails: newest first from the thread route, inbound marked gold', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [
      { id: 1, direction: 'outbound', fromEmail: 'me@x.io', toEmail: 'j@bank.com', subject: 'Trip options', snippet: 'Here are…', sentAt: '2026-08-20T10:00:00Z' },
      { id: 2, direction: 'inbound', fromEmail: 'j@bank.com', toEmail: 'me@x.io', subject: 'Re: retreat dates', snippet: 'Sept works', sentAt: '2026-08-26T10:00:00Z' },
    ] }) });
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(<ContactEmailsTab contactId="9" />);
    await waitFor(() => expect(screen.getByText('Re: retreat dates')).toBeTruthy());
    expect(fetchMock.mock.calls[0][0]).toBe('/api/portal/crm/contacts/9/thread');
    const rows = container.querySelectorAll('li');
    expect(rows[0].textContent).toContain('Re: retreat dates');
    expect(rows[0].querySelector('.material-icons')?.textContent).toBe('call_received');
  });

  it('Emails: empty thread is a preview', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: [] }) }));
    render(<ContactEmailsTab contactId="9" />);
    await waitFor(() => expect(screen.getByText('No emails yet.')).toBeTruthy());
  });

  it('Brain knows: counts and links the notes; renders nothing without Brain (402)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { items: [{ id: 4, title: 'Intro call', updatedAt: '', needsReview: false }], total: 2 } }) }));
    render(<ContactNotesCard contactId="9" firstName="Jordan" />);
    await waitFor(() => expect(screen.getByText('2 notes mention Jordan')).toBeTruthy());
    expect(screen.getByRole('link', { name: /Intro call/ }).getAttribute('href')).toBe('/portal/brain/knowledge/4');
    cleanup();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 402, json: async () => ({ success: false }) }));
    const { container } = render(<ContactNotesCard contactId="9" firstName="Jordan" />);
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
  });
});
