// @vitest-environment jsdom
/**
 * Regression guard for QAD-026 ("recurring soft-nav hydration mismatch class
 * in admin chrome"). The ticket's diagnosis was that `AdminShellClient` had a
 * pathname-dependent "full-width mode" that swapped the top-level wrapper
 * element (`<main class="min-h-screen">` vs a per-page `<div class="p-6
 * max-w-...">`) for `/admin`, `/admin/crm/**`, and `/admin/portal-ecommerce`
 * — the same class of bug fixed for `/admin/login` in a847c53f.
 *
 * As of this test, that branching does not exist in `AdminShellClient.tsx`:
 * the component unconditionally renders `<main className="min-h-screen">`
 * for every non-login route, and per-page max-width containers live inside
 * each page component instead (see e.g. app/admin/crm/companies/page.tsx and
 * app/admin/page.tsx) — i.e. the fix direction QAD-026 asked for
 * ("a single wrapper element whose className varies, never whose
 * structure/tag varies") is already the shape of the code. This test locks
 * that invariant in so the "full-width mode" pattern can't be reintroduced
 * without a red test: the wrapper's tag and class must be identical across
 * every route this ticket named.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { usePathname } from 'next/navigation';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

// The sidebar/topbar/palette pull in useSession, next/link, and their own
// nav-building logic — irrelevant to the wrapper-shape invariant under test,
// so they're stubbed out per the mocking pattern used in
// components-visual-editor-shell.test.tsx.
vi.mock('@/components/admin/AdminSidebar', () => ({
  __esModule: true,
  default: () => <div data-testid="admin-sidebar" />,
}));
vi.mock('@/components/admin/AdminTopbar', () => ({
  __esModule: true,
  default: () => <div data-testid="admin-topbar" />,
}));
vi.mock('@/components/admin/CommandPalette', () => ({
  __esModule: true,
  default: () => <div data-testid="command-palette" />,
}));

import AdminShellClient from '@/components/admin/AdminShellClient';

// The exact routes QAD-026 named as disagreeing server/client during soft nav.
const ROUTES = [
  '/admin',
  '/admin/crm/companies',
  '/admin/portal-tickets',
  '/admin/portal-ecommerce',
];

describe('AdminShellClient — cross-route wrapper shape (QAD-026 regression)', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it.each(ROUTES)('renders an unconditional <main class="min-h-screen"> wrapper for %s', (route) => {
    vi.mocked(usePathname).mockReturnValue(route);
    render(
      <AdminShellClient>
        <p>page content</p>
      </AdminShellClient>
    );

    const main = screen.getByRole('main');
    expect(main.tagName).toBe('MAIN');
    // Exact match, not .toContain — a route-conditional extra class here is
    // exactly the "full-width mode" shape QAD-026 flagged.
    expect(main.className).toBe('min-h-screen');
  });

  it('keeps the wrapper element/tag identical across every route named in QAD-026', () => {
    const shapes = ROUTES.map((route) => {
      vi.mocked(usePathname).mockReturnValue(route);
      const { container, unmount } = render(
        <AdminShellClient>
          <p>page content</p>
        </AdminShellClient>
      );
      const main = container.querySelector('main');
      const shape = {
        route,
        mainTag: main?.tagName,
        mainClass: main?.className,
      };
      unmount();
      return shape;
    });

    const [first, ...rest] = shapes;
    expect(first.mainTag).toBe('MAIN');
    for (const shape of rest) {
      expect(shape.mainTag, `${shape.route} wrapper tag diverged from ${first.route}`).toBe(first.mainTag);
      expect(shape.mainClass, `${shape.route} wrapper class diverged from ${first.route}`).toBe(first.mainClass);
    }
  });
});
