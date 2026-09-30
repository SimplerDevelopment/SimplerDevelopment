// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { transcript } from '@/lib/chat/transcript';
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));
import VisitorPanel from '@/components/portal/inbox/VisitorPanel';

const messages = [
  { authorKind: 'visitor', authorName: null, body: 'Is SPRING15 still valid?', occurredAt: '2026-08-28T10:00:00Z' },
  { authorKind: 'system', authorName: null, body: 'joined', occurredAt: '2026-08-28T10:00:01Z' },
  { authorKind: 'agent', authorName: 'Dana', body: 'Yes — it never expires.', occurredAt: '2026-08-28T10:01:00Z' },
];

describe('live chat visitor panel (PUX-215)', () => {
  it('transcript skips system lines and names the visitor', () => {
    const t = transcript(messages, 'Luis');
    expect(t.split('\n')).toHaveLength(2);
    expect(t).toContain('Luis: Is SPRING15');
    expect(t).toContain('Dana: Yes');
  });
  it('links the CRM contact on an exact email and turns the chat into a ticket with the transcript', async () => {
    const calls: { url: string; body?: string }[] = [];
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string });
      const data = url.includes('/crm/contacts') ? { contacts: [{ id: 4, email: 'luis@x.com' }] } : { id: 9 };
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data }) } as Response);
    }) as any;
    render(<VisitorPanel conversation={{ id: 1, widgetId: 2, visitorName: 'Luis', visitorEmail: 'Luis@x.com', status: 'open' }} messages={messages} />);
    expect((await screen.findByText('Open in Contacts')).closest('a')?.getAttribute('href')).toBe('/portal/crm/contacts/4');
    expect(screen.getByText('open')).toBeTruthy();
    fireEvent.click(screen.getByText('Turn into a ticket'));
    await waitFor(() => expect(screen.getByRole('status').getAttribute('href')).toBe('/portal/tickets/9'));
    const post = JSON.parse(calls.find((c) => c.url === '/api/portal/tickets')!.body!);
    expect(post.subject).toBe('Chat with Luis');
    expect(post.body).toContain('Is SPRING15 still valid?');
  });
});
