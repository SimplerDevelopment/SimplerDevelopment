// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import ProposalsStudioTable from '@/components/portal/crm/ProposalsStudioTable';
import { proposalTimeline } from '@/lib/crm/proposal-timeline';
import ProposalTimeline from '@/components/portal/crm/ProposalTimeline';

afterEach(cleanup);

describe('PUX-173 proposal timeline', () => {
  it('reads sent → first viewed → viewed again → awaiting / signed from the row', () => {
    const labels = (p: Parameters<typeof proposalTimeline>[0]) => proposalTimeline(p).map((s) => s.label);
    expect(labels({ status: 'viewed', sentAt: 'a', firstViewedAt: 'b', lastViewedAt: 'c', viewCount: 2 })).toEqual(['Sent', 'Viewed first time', 'Viewed again (×1)', 'Awaiting signature']);
    expect(labels({ status: 'accepted', sentAt: 'a', firstViewedAt: 'b', viewCount: 1, signedAt: 'd' })).toEqual(['Sent', 'Viewed first time', 'Signed']);
    expect(labels({ status: 'declined', sentAt: 'a', viewCount: 0, declinedAt: 'd' })).toEqual(['Sent', 'Viewed first time', 'Declined']);
    expect(labels({ status: 'draft' })).toEqual(['Not sent yet', 'Viewed first time']);
    // older rows: only lastViewedAt is known → it stands in for the first view
    expect(proposalTimeline({ status: 'viewed', sentAt: 'a', lastViewedAt: 'c', viewCount: 1 })[1].at).toBe('c');
  });

  it('renders as a closed <details> with the steps inside', () => {
    render(<ProposalTimeline summary="2 views" proposal={{ status: 'viewed', sentAt: '2026-08-25T09:00:00Z', firstViewedAt: '2026-08-26T14:20:00Z', lastViewedAt: '2026-08-27T08:05:00Z', viewCount: 2 }} />);
    const details = document.querySelector('details');
    expect(details?.open).toBe(false);
    expect(screen.getByText('2 views')).toBeTruthy();
    expect(screen.getByText('Viewed again (×1)')).toBeTruthy();
    expect(screen.getByText('Awaiting signature')).toBeTruthy();
  });
});


describe('PUX-173 ProposalsStudioTable', () => {
  it('lists proposals with a Views column and a folded timeline; drafts get no timeline', () => {
    const rows = [
      { id: 1, title: 'Summit Bank retreat', status: 'viewed', sentAt: '2026-08-25T09:00:00Z', firstViewedAt: '2026-08-26T14:20:00Z', lastViewedAt: '2026-08-27T08:05:00Z', viewCount: 2, contactFirstName: 'Jordan', contactLastName: 'Whitfield', companyName: 'Summit Bank' },
      { id: 2, title: 'Barrera gift program', status: 'draft', viewCount: 0, contactName: 'Luis Barrera', companyName: null },
    ];
    const onOpen = vi.fn();
    const { container } = render(<ProposalsStudioTable proposals={rows} valueOf={(p) => p.id * 100000} onOpen={onOpen} />);
    expect(container.querySelectorAll('details').length).toBe(1);
    expect(screen.getByText('2 views · story')).toBeTruthy();
    expect(screen.getByText('Jordan Whitfield')).toBeTruthy();
    expect(screen.getByText('Luis Barrera')).toBeTruthy();
    expect(container.textContent).toContain('2 proposals');
    fireEvent.click(screen.getByText('Barrera gift program'));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });
});
