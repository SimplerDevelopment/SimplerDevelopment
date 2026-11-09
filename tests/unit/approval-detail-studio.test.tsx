// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: '42' }), useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
vi.mock('@/components/portal/approvals/DiffViewer', () => ({ DiffViewer: ({ before, after }: any) => <pre data-testid="diff">{JSON.stringify({ before, after })}</pre> }));

import ApprovalDetailPage from '@/app/portal/approvals/[id]/page';

describe('approval detail (PUX-200)', () => {
  it('shows the diff, sends the note with approve, and confirms in place', async () => {
    const calls: { url: string; body?: string }[] = [];
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string });
      const json = url.endsWith('/approve') ? { success: true } : { success: true, data: {
        change: { id: 42, entityType: 'post', entityId: 7, operation: 'update', summary: 'Update the Spring Trips page', status: 'pending', createdAt: new Date().toISOString(), reviewNote: null, reviewedAt: null, payload: { title: 'New' }, originalSnapshot: { title: 'Old' } },
        keyName: 'Claude', submitterName: 'Sam',
      } };
      return Promise.resolve({ ok: true, json: () => Promise.resolve(json) } as Response);
    }) as any;
    render(<ApprovalDetailPage />);
    expect(await screen.findByText('Update the Spring Trips page')).toBeTruthy();
    expect(screen.getByTestId('diff').textContent).toContain('Old');
    expect(screen.getByText('Preview of the change')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Looks right' } });
    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Approved'));
    expect(calls.find((c) => c.url.endsWith('/approvals/42/approve'))?.body).toBe(JSON.stringify({ note: 'Looks right' }));
    await waitFor(() => expect(screen.queryByText('Approve')).toBeNull());
    expect(screen.getByText('approved')).toBeTruthy();
  });
});
