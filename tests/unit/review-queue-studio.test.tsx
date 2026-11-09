// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import ReviewTab from '@/components/brain/review/ReviewTab';
import { ReviewCard, type ReviewItem } from '@/components/brain/review/ReviewCard';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const item = (id: number, status: ReviewItem['status'] = 'pending'): ReviewItem => ({
  id, sourceType: 'meeting', sourceId: 1, proposedType: 'task', proposedPayload: { title: `Item ${id}` },
  status, reviewedAt: null, resultEntityType: null, resultEntityId: null, createdAt: '2026-08-27T00:00:00Z',
});
const approveOf = (root: HTMLElement) => Array.from(root.querySelectorAll('button')).filter((b) => /^\s*check\s*Approve\s*$/.test(b.textContent ?? ''));

describe('PUX-165 Review queue studio', () => {
  it('ReviewCard: primary gets the teal, otherwise ghost; legacy untouched without studio', () => {
    const noop = () => {};
    const { container, rerender } = render(<ReviewCard item={item(1)} busy={false} onApprove={noop} onReject={noop} meetingHref={null} selectable selected={false} onToggleSelect={noop} studio primary />);
    expect(approveOf(container)[0].className).toContain('bg-primary');
    rerender(<ReviewCard item={item(1)} busy={false} onApprove={noop} onReject={noop} meetingHref={null} selectable selected={false} onToggleSelect={noop} studio />);
    expect(approveOf(container)[0].className).not.toContain('bg-primary');
    expect(approveOf(container)[0].className).toContain('border-border');
  });

  it('ReviewTab studio: only the first pending row owns the teal Approve', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: async () => ({ success: true, data: { items: [item(1, 'approved'), item(2), item(3)], meetings: {} } }),
    }));
    const { container } = render(<ReviewTab onPendingChange={() => {}} studio />);
    await waitFor(() => expect(approveOf(container).length).toBe(2));
    const [first, second] = approveOf(container);
    expect(first.className).toContain('bg-primary');
    expect(second.className).not.toContain('bg-primary');
  });

  it('ReviewTab studio: empty queue is a preview, not a dashed box', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, data: { items: [], meetings: {} } }) }));
    render(<ReviewTab onPendingChange={() => {}} studio />);
    await waitFor(() => expect(screen.getByText('Nothing pending review.')).toBeTruthy());
    expect(screen.getByText('Review item')).toBeTruthy(); // Ghost label
  });
});
