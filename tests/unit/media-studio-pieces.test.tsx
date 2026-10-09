// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import MediaFilterColumn from '@/components/portal/media/MediaFilterColumn';
import MediaUsedOn from '@/components/portal/media/MediaUsedOn';

vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));

describe('media studio pieces (PUX-188)', () => {
  it('filter column: type list drives the filter, brand select only with profiles', () => {
    const setFilter = vi.fn();
    const { rerender } = render(<MediaFilterColumn search="" setSearch={() => {}} filter="all" setFilter={setFilter} profileFilter="" setProfileFilter={() => {}} brandingProfiles={[]} total={12} />);
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.queryByText('All brands')).toBeNull();
    fireEvent.click(screen.getByText('Images'));
    expect(setFilter).toHaveBeenCalledWith('image');
    rerender(<MediaFilterColumn search="" setSearch={() => {}} filter="image" setFilter={setFilter} profileFilter="" setProfileFilter={() => {}} brandingProfiles={[{ id: 1, name: 'Acme' }]} total={12} />);
    expect(screen.getByText('Images').closest('button')?.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByText('All brands')).toBeTruthy();
  });

  it('used-on: reads the usages route and links each page to its editor', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ json: () => Promise.resolve({ success: true, data: { count: 2, capped: false, pages: [{ id: 5, title: 'Home', websiteId: 3 }, { id: 6, title: '', websiteId: null }] } }) })) as any;
    render(<MediaUsedOn mediaId={9} />);
    expect(await screen.findByText('Used on 2 pages')).toBeTruthy();
    expect(screen.getByText('Home').getAttribute('href')).toBe('/portal/websites/3/posts/5/edit');
    expect(screen.getByText('Untitled')).toBeTruthy();
    expect((global.fetch as any).mock.calls[0][0]).toBe('/api/portal/media/9/usages');
  });
});
