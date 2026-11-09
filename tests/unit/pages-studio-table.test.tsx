// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [k: string]: unknown }) => <a href={href} {...rest}>{children}</a> }));
import PagesStudioTable from '@/components/portal/websites/PagesStudioTable';

afterEach(cleanup);

describe('PUX-184 PagesStudioTable', () => {
  it('type tabs with counts, three statuses, the named row action to the editor', () => {
    const now = new Date().toISOString();
    const { container } = render(<PagesStudioTable siteId={7} total={3} activeType={null} tabs={[{ slug: 'page', name: 'Pages', count: 2 }, { slug: 'blog', name: 'Posts', count: 1 }]} rows={[
      { id: 1, title: 'Home', postType: 'page', status: 'published', updatedAt: now },
      { id: 2, title: 'Spring Trips', postType: 'page', status: 'pending', updatedAt: now },
      { id: 3, title: 'Season opening', postType: 'blog', status: 'draft', updatedAt: now },
    ]} />);
    expect(screen.getByRole('tab', { name: /All/ }).textContent).toContain('3');
    expect(screen.getByRole('tab', { name: /Posts/ }).getAttribute('href')).toBe('?type=blog');
    expect(screen.getByText('Pending approval')).toBeTruthy();
    expect(screen.getByText('Draft')).toBeTruthy();
    const actions = screen.getAllByRole('link', { name: 'Edit in the visual editor' });
    expect(actions.length).toBe(3);
    expect(actions[1].getAttribute('href')).toBe('/portal/websites/7/posts/2/edit');
    expect(container.textContent).not.toContain('Views');
  });
});
