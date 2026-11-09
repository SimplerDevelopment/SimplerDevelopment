// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));

import NotificationsPage from '@/app/portal/settings/notifications/page';

describe('notification preferences under the flag (PUX-201)', () => {
  it('groups rows by room, keeps the single delivery control, draws Push and Quiet hours as ghosts', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { items: [
      { notificationType: 'deal_stale', delivery: 'instant' },
      { notificationType: 'ticket_sla_first_response_breach', delivery: 'off' },
    ] } }) })) as any;
    render(<NotificationsPage />);
    expect(await screen.findByLabelText('CRM')).toBeTruthy();
    expect(screen.getByLabelText('Projects & tickets').textContent).toContain('Ticket first-response SLA breached');
    expect(screen.getAllByRole('radiogroup')).toHaveLength(2);
    expect(screen.getByText('Push notifications')).toBeTruthy();
    expect(screen.getByText('Quiet hours')).toBeTruthy();
  });
});
