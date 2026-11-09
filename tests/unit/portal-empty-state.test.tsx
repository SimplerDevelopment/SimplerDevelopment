/**
 * PUX-144 — the empty-state rule's one invariant: converting a caller must
 * never change what an UNFLAGGED tenant sees. Flag off → `legacy` verbatim;
 * flag on → the Studio preview, and none of the legacy markup.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FeatureFlagsProvider } from '@/components/portal/FeatureFlagsProvider';
import { EmptyState, GhostCard } from '@/components/portal/EmptyState';

const legacy = <p>No revenue data yet</p>;

describe('EmptyState / GhostCard (PUX-144)', () => {
  it('flag off → legacy markup, verbatim, nothing else', () => {
    render(
      <FeatureFlagsProvider flags={[]}>
        <EmptyState title="Won value, month by month." ghostLabel="Revenue" legacy={legacy} />
        <GhostCard title="Add a site" href="/portal/websites/new" legacy={<a href="/x">Add another website</a>} />
      </FeatureFlagsProvider>,
    );
    expect(screen.getByText('No revenue data yet')).toBeTruthy();
    expect(screen.getByText('Add another website')).toBeTruthy();
    expect(screen.queryByText('Won value, month by month.')).toBeNull();
    expect(screen.queryByText('Add a site')).toBeNull();
  });

  it('outside any provider → fails closed to legacy', () => {
    render(<EmptyState title="Studio" legacy={legacy} />);
    expect(screen.getByText('No revenue data yet')).toBeTruthy();
    expect(screen.queryByText('Studio')).toBeNull();
  });

  it('flag on → the preview with its one button; legacy gone', () => {
    render(
      <FeatureFlagsProvider flags={['portal-redesign']}>
        <EmptyState
          title="Won value, month by month."
          body="Every closed deal lands here."
          cta={{ label: 'New deal', href: '/portal/crm/deals' }}
          ghostLabel="Revenue · 12 months"
          legacy={legacy}
        />
        <GhostCard title="Add a site" href="/portal/websites/new" legacy={<a href="/x">Add another website</a>} />
      </FeatureFlagsProvider>,
    );
    expect(screen.queryByText('No revenue data yet')).toBeNull();
    expect(screen.queryByText('Add another website')).toBeNull();
    expect(screen.getByText('Won value, month by month.')).toBeTruthy();
    expect(screen.getByText('Revenue · 12 months')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'New deal' }).getAttribute('href')).toBe('/portal/crm/deals');
    expect(screen.getByRole('link', { name: /Add a site/ }).getAttribute('href')).toBe('/portal/websites/new');
  });
});
