// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));

import TeamPage from '@/app/portal/settings/team/page';

describe('team page under the flag (PUX-194)', () => {
  it('shows the ROLES explainer verbatim, the agency ghost, and Invite as the teal', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, currentRole: 'owner', data: [{ memberId: 1, userId: 2, name: 'Alice', email: 'a@x.com', role: 'admin', isOwner: false, isCurrentUser: false, joinedAt: '2026-08-01' }] }) })) as any;
    render(<TeamPage />);
    await screen.findByText('Alice');
    expect(screen.getByText('Can invite members, change roles, manage projects')).toBeTruthy();
    expect(screen.getByText('Your Simpler Development team')).toBeTruthy();
    const invite = screen.getByText('Invite').closest('button');
    expect(invite?.className).toContain('bg-primary');
    expect(screen.queryByText('Add Member')).toBeNull();
  });
});
