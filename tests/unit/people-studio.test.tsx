// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import OrgTreeCards from '@/components/brain/OrgTreeCards';
import WhoKnowsBox from '@/components/brain/WhoKnowsBox';
import type { BrainOrgUnitTreeNode } from '@/lib/brain/org-units';

vi.mock('@/components/portal/FeatureFlagsProvider', () => ({ useFeatureFlag: () => true }));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const unit = (o: Partial<BrainOrgUnitTreeNode>): BrainOrgUnitTreeNode =>
  ({ id: 0, name: '', leadPersonId: null, memberCount: 0, children: [], ...o }) as BrainOrgUnitTreeNode;

describe('PUX-163 People & org chart (studio)', () => {
  it('OrgTreeCards: led units link to the roster filter, unled units are a ghost to the org chart', () => {
    const tree = [unit({ id: 1, name: 'Guides', leadPersonId: 7, memberCount: 2, children: [unit({ id: 2, name: 'Marketing' })] })];
    render(<OrgTreeCards tree={tree} leadNames={new Map([[7, 'Jonah Reyes']])} />);
    const led = screen.getByRole('link', { name: /Guides/ });
    expect(led.getAttribute('href')).toBe('/portal/brain/people?orgUnitId=1');
    expect(led.textContent).toContain('Jonah Reyes · 2');
    const ghost = screen.getByRole('link', { name: /Marketing/ });
    expect(ghost.textContent).toContain('No lead set');
    expect(ghost.getAttribute('href')).toBe('/portal/brain/org-chart');
  });

  it('OrgTreeCards: an unresolved lead shows the member count only', () => {
    render(<OrgTreeCards tree={[unit({ id: 3, name: 'Bookings', leadPersonId: 99, memberCount: 1 })]} leadNames={new Map()} />);
    expect(screen.getByRole('link', { name: /Bookings/ }).textContent).toContain('1 member');
  });

  it('WhoKnowsBox: submits to the who-knows route and lists the people who match', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {
        tagMatches: [{ id: 1, name: 'permits' }],
        people: [{ personId: 3, fullName: 'Jonah Reyes', title: 'Guide lead', primaryOrgUnit: null, matchedTags: [{ id: 1, name: 'permits', level: null }], score: 1 }],
      } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<WhoKnowsBox />);
    fireEvent.change(screen.getByLabelText('Who knows about'), { target: { value: 'permit renewals' } });
    fireEvent.submit(screen.getByRole('search'));
    await waitFor(() => expect(screen.getByRole('link', { name: /Jonah Reyes/ }).getAttribute('href')).toBe('/portal/brain/people/3'));
    expect(fetchMock.mock.calls[0][0]).toBe('/api/portal/brain/who-knows?query=permit%20renewals&limit=10');
    expect(screen.getByText('1 person knows about “permit renewals”')).toBeTruthy();
    expect(screen.getByText(/Matched expertise: permits/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByRole('link')).toBeNull();
  });
});
