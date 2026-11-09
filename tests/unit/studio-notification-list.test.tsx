// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import StudioNotificationList from '@/components/portal/StudioNotificationList';
import type { UnifiedNotif } from '@/components/portal/NotificationBell';

afterEach(cleanup);
const today = new Date().toISOString();
const rows: UnifiedNotif[] = [
  { source: 'pm', id: 1, actor: 'Dana Park', title: 'Dana Park replied on #482', body: 'Coupon code not applying', read: false, createdAt: today, url: '/portal/tickets/482', icon: 'comment', group: 'Projects & Tasks' },
  { source: 'crm', id: 2, actor: null, title: 'AI credits at 80% of this month’s plan', body: null, read: true, createdAt: '2020-01-01T00:00:00Z', url: '/portal/settings/billing', icon: 'data_usage', group: 'Billing' },
];

describe('StudioNotificationList (PUX-148)', () => {
  it('Today then Earlier, actor bold, footer links to preferences', () => {
    const onItemClick = vi.fn(); const onMarkAllRead = vi.fn();
    render(<StudioNotificationList notifications={rows} loaded loading={false} filterUnread={false} unreadCount={1} onItemClick={onItemClick} onMarkAllRead={onMarkAllRead} />);
    const heads = screen.getAllByText(/^(Today|Earlier)$/).map((e) => e.textContent);
    expect(heads).toEqual(['Today', 'Earlier']);
    expect(screen.getByText('Dana Park').tagName).toBe('B');
    expect(screen.getByText('DP')).toBeTruthy();
    expect(screen.getByText('replied on #482')).toBeTruthy();
    expect(screen.getByText(/Billing · /)).toBeTruthy(); // no body → the group leads the second line
    expect(screen.getByRole('link', { name: 'What reaches you' }).getAttribute('href')).toBe('/portal/settings/notifications');
    fireEvent.click(screen.getByText('replied on #482'));
    expect(onItemClick).toHaveBeenCalledWith(rows[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(onMarkAllRead).toHaveBeenCalled();
  });

  it('empty + loading states', () => {
    const { rerender } = render(<StudioNotificationList notifications={[]} loaded={false} loading filterUnread={false} unreadCount={0} onItemClick={() => {}} onMarkAllRead={() => {}} />);
    expect(screen.getByText('Loading…')).toBeTruthy();
    rerender(<StudioNotificationList notifications={[]} loaded loading={false} filterUnread filterUnread unreadCount={0} onItemClick={() => {}} onMarkAllRead={() => {}} />);
    expect(screen.getByText('No unread notifications')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Mark all read' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
