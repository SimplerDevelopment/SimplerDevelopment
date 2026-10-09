// @vitest-environment jsdom
/**
 * PUX-157 — the approvals page under `portal-redesign`: titled Approvals,
 * longest-waiting first with the one teal Approve, ghost Approve/Reject on
 * the rest, inline decisions hitting the existing per-item routes.
 */
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { FeatureFlagsProvider } from '@/components/portal/FeatureFlagsProvider';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/portal/approvals',
}));
import PortalApprovalsPage from '@/app/portal/approvals/page';

const item = (id: number, summary: string, createdAt: string) => ({
  id, entityType: 'post', entityId: 100, operation: 'update', summary, status: 'pending', keyId: 5, keyName: 'mcp-key-a',
  submitterName: 'Alice', reviewedAt: null, reviewNote: null, appliedAt: null, errorMessage: null, createdAt,
});
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const originalFetch = global.fetch;
afterEach(() => { cleanup(); global.fetch = originalFetch; });

describe('PortalApprovalsPage under portal-redesign (PUX-157)', () => {
  it('Approvals, oldest first, one teal Approve, inline decide → per-item route', async () => {
    const calls: string[] = [];
    global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input); calls.push(`${init?.method ?? 'GET'} ${u}`);
      if (u.includes('/approve') || u.includes('/reject')) return json({ success: true });
      return json({ success: true, data: [item(2, 'Newer change', '2026-08-27T12:00:00Z'), item(1, 'Older change', '2026-08-20T12:00:00Z')], meta: { role: 'owner', canManage: true } });
    }) as typeof fetch;
    render(<FeatureFlagsProvider flags={['portal-redesign']}><PortalApprovalsPage /></FeatureFlagsProvider>);
    expect(await screen.findByText('Approvals')).toBeTruthy();
    expect(screen.queryByText('MCP Approvals')).toBeNull();
    await screen.findByText('Older change');
    const rows = [screen.getByText('Older change'), screen.getByText('Newer change')];
    expect(rows[0].compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const approves = screen.getAllByRole('button', { name: 'Approve' });
    expect(approves).toHaveLength(2);
    expect(approves[0].className).toContain('bg-primary');     // the longest-waiting row
    expect(approves[1].className).not.toContain('bg-primary'); // ghost
    fireEvent.click(approves[1]);
    await waitFor(() => expect(calls.some((c) => c === 'POST /api/portal/approvals/2/approve')).toBe(true));
  });

  it('flag off: MCP Approvals, API order, no inline buttons', async () => {
    global.fetch = vi.fn(async () => json({ success: true, data: [item(2, 'Newer change', '2026-08-27T12:00:00Z'), item(1, 'Older change', '2026-08-20T12:00:00Z')], meta: { role: 'owner', canManage: true } })) as typeof fetch;
    render(<PortalApprovalsPage />);
    expect(await screen.findByText('MCP Approvals')).toBeTruthy();
    await screen.findByText('Newer change');
    expect(screen.queryAllByRole('button', { name: 'Approve' })).toHaveLength(0);
  });
});
