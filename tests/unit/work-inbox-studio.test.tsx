// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a> }));

import WorkInbox from '@/components/portal/work/WorkInbox';

const rows = [
  { key: 'k:1', source: 'projects' as const, title: 'Fix hero', meta: 'Site · Doing', href: '/p/1', at: new Date() },
  { key: 'ny:reply:7', source: 'tickets' as const, title: 'Reply to ticket', meta: 'waiting on you', href: '/portal/tickets/7', at: new Date(), urgent: true },
];

describe('WorkInbox (PUX-198)', () => {
  it('chips narrow the one list; quick-add posts through quickAddRequest', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) })) as any;
    render(<WorkInbox rows={rows} targets={[{ key: 'kanban:5', label: 'Site · To do', kind: 'kanban', columnId: 5 }]} />);
    expect(screen.getByLabelText('Today').textContent).toContain('Fix hero');
    fireEvent.click(screen.getByRole('tab', { name: /Tickets/ }));
    expect(screen.queryByText('Fix hero')).toBeNull();
    expect(screen.getByText('Reply to ticket')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('New item'), { target: { value: 'Call Sam' } });
    fireEvent.click(screen.getByText('Add'));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/portal/cards', expect.objectContaining({ method: 'POST', body: JSON.stringify({ columnId: 5, title: 'Call Sam' }) })));
  });
});
