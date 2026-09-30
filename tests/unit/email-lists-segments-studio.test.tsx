// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/portal/email/lists', useSearchParams: () => new URLSearchParams() }));
vi.mock('next/link', () => ({ default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a> }));

import EmailTabs, { EMAIL_TABS } from '@/components/portal/email/EmailTabs';
import ListsPage from '@/app/portal/email/lists/page';
import SegmentsPage from '@/app/portal/email/segments/page';

describe('email lists & segments under the flag (PUX-204)', () => {
  it('EmailTabs marks the active leaf', () => {
    render(<EmailTabs active="/portal/email/segments" />);
    expect(EMAIL_TABS).toHaveLength(5);
    expect(screen.getByText('Segments').getAttribute('aria-current')).toBe('page');
  });
  it('lists page: tabs, last-sent line, New List as a ghost', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: [{ id: 1, name: 'Newsletter', description: null, subscriberCount: 12, lastSentAt: new Date().toISOString() }, { id: 2, name: 'VIP', description: null, subscriberCount: 3, lastSentAt: null }] }) })) as any;
    render(<ListsPage />);
    expect(await screen.findByText('Newsletter')).toBeTruthy();
    expect(screen.getByLabelText('Email')).toBeTruthy();
    expect(screen.getByText(/Last sent/)).toBeTruthy();
    expect(screen.getByText('Never sent to')).toBeTruthy();
    expect(screen.getByText('New List').closest('button')?.className).not.toContain('bg-primary');
  });
  it('segments page: Create segment is the teal and the count is honest about when it updates', async () => {
    global.fetch = vi.fn((url: string) => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: url.includes('tags') ? [] : [{ id: 1, name: 'Openers', description: null, rules: [{ field: 'opened_campaign', operator: 'eq', value: '3' }], matchType: 'all', subscriberCount: 40, lastCalculatedAt: null, createdAt: '2026-08-01' }] }) })) as any;
    render(<SegmentsPage />);
    expect(await screen.findByText('Openers')).toBeTruthy();
    expect(screen.getByText('Create segment').closest('button')?.className).toContain('bg-primary');
    expect(screen.getByText('count updates after save')).toBeTruthy();
  });
});
