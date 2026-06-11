// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// next/navigation mock (component doesn't use it, but nested libs might)
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/portal/projects/1',
  useSearchParams: () => ({ get: () => null }),
}));

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function buildFetchMock(
  handlers: Array<{
    match: (url: string, method?: string) => boolean;
    respond: () => Promise<{ ok?: boolean; body: unknown }>;
  }>,
) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? 'GET').toUpperCase();
    const handler = handlers.find((h) => h.match(url, method));
    if (!handler) {
      return {
        ok: true,
        json: async () => ({ success: false, message: 'unmocked: ' + method + ' ' + url }),
      };
    }
    const result = await handler.respond();
    return {
      ok: result.ok ?? true,
      json: async () => result.body,
    };
  }) as unknown as typeof global.fetch;
}

const MEMBER_1 = {
  id: 1,
  userId: 10,
  role: 'owner' as const,
  addedAt: '2025-01-15T10:00:00Z',
  name: 'Alice Smith',
  email: 'alice@example.com',
};

const MEMBER_2 = {
  id: 2,
  userId: 20,
  role: 'editor' as const,
  addedAt: '2025-02-20T08:00:00Z',
  name: null,
  email: 'bob@example.com',
};

const TEAM_USER_3 = { userId: 30, name: 'Carol Jones', email: 'carol@example.com' };

function happyFetch(overrides?: {
  members?: unknown[];
  team?: unknown[];
  postSuccess?: boolean;
  patchSuccess?: boolean;
  deleteSuccess?: boolean;
}) {
  const members = overrides?.members ?? [MEMBER_1, MEMBER_2];
  const team = overrides?.team ?? [TEAM_USER_3];
  const postSuccess = overrides?.postSuccess ?? true;
  const patchSuccess = overrides?.patchSuccess ?? true;
  const deleteSuccess = overrides?.deleteSuccess ?? true;

  return buildFetchMock([
    {
      match: (u, m) => u.includes('/members') && m === 'POST',
      respond: async () => ({
        body: postSuccess
          ? { success: true, data: {} }
          : { success: false, message: 'Already a member' },
      }),
    },
    {
      match: (u, m) => u.includes('/members') && m === 'PATCH',
      respond: async () => ({
        body: patchSuccess
          ? { success: true }
          : { success: false, message: 'Cannot change role' },
      }),
    },
    {
      match: (u, m) => u.includes('/members') && m === 'DELETE',
      respond: async () => ({
        body: deleteSuccess
          ? { success: true }
          : { success: false, message: 'Cannot remove owner' },
      }),
    },
    {
      match: (u) => u.includes('/members'),
      respond: async () => ({ body: { success: true, data: members } }),
    },
    {
      match: (u) => u.includes('/api/portal/team'),
      respond: async () => ({ body: { success: true, data: team } }),
    },
  ]);
}

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------
import ProjectMembersTab from '@/components/portal/ProjectMembersTab';

// ---------------------------------------------------------------------------
// window.confirm stub
// ---------------------------------------------------------------------------
const confirmSpy = vi.spyOn(window, 'confirm');

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  confirmSpy.mockReturnValue(true);
  global.fetch = happyFetch();
});

describe('ProjectMembersTab', () => {
  // -------------------------------------------------------------------------
  // Basic render + loading
  // -------------------------------------------------------------------------
  describe('initial render', () => {
    it('shows loading spinner initially', () => {
      // Defer the fetch so the loading state is visible.
      global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof global.fetch;
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      expect(screen.getByText((_, el) => el?.className?.includes('animate-spin') ?? false)).toBeTruthy();
    });

    it('renders the Members heading', async () => {
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() => expect(screen.getByText('Members')).toBeTruthy());
    });

    it('renders member names after load', async () => {
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() => expect(screen.getByText('Alice Smith')).toBeTruthy());
      expect(screen.getByText('bob@example.com')).toBeTruthy();
    });

    it('shows member email as sub-label when name exists', async () => {
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() => expect(screen.getByText('alice@example.com')).toBeTruthy());
    });

    it('shows "No members yet." when list is empty', async () => {
      global.fetch = happyFetch({ members: [] });
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() => expect(screen.getByText('No members yet.')).toBeTruthy());
    });

    it('shows member added date', async () => {
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() =>
        expect(
          screen.getByText(new Date('2025-01-15T10:00:00Z').toLocaleDateString()),
        ).toBeTruthy(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // canManage=false — read-only view
  // -------------------------------------------------------------------------
  describe('read-only mode (canManage=false)', () => {
    it('does not show Add Member button', async () => {
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() => expect(screen.getByText('Alice Smith')).toBeTruthy());
      expect(screen.queryByText('Add Member')).toBeNull();
    });

    it('renders role as a text badge, not a select', async () => {
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() => expect(screen.getByText('Owner')).toBeTruthy());
      // No role-change selects in read-only mode
      const selects = screen.queryAllByRole('combobox');
      expect(selects).toHaveLength(0);
    });

    it('does not show Remove buttons', async () => {
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() => expect(screen.getByText('Alice Smith')).toBeTruthy());
      expect(screen.queryByText('Remove')).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // canManage=true — management controls
  // -------------------------------------------------------------------------
  describe('management mode (canManage=true)', () => {
    it('shows Add Member button', async () => {
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => expect(screen.getByText('Add Member')).toBeTruthy());
    });

    it('shows Remove buttons for each member', async () => {
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => {
        const removes = screen.getAllByText('Remove');
        expect(removes).toHaveLength(2);
      });
    });

    it('renders role selects for each member', async () => {
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => {
        // One select per member row (role column)
        const selects = screen.getAllByRole('combobox');
        expect(selects.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('column header shows Actions when canManage', async () => {
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() =>
        expect(screen.getByText((t) => t.toUpperCase() === 'ACTIONS')).toBeTruthy(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Add Member flow
  // -------------------------------------------------------------------------
  describe('Add Member form', () => {
    it('toggles form open and closed via the button', async () => {
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => expect(screen.getByText('Add Member')).toBeTruthy());

      fireEvent.click(screen.getByText('Add Member'));
      await waitFor(() => expect(screen.getByText('Add member')).toBeTruthy());

      fireEvent.click(screen.getByText('Cancel'));
      await waitFor(() => expect(screen.queryByText('Add member')).toBeNull());
    });

    it('shows available teammates in the select (not already members)', async () => {
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getByText('Add Member'));
      fireEvent.click(screen.getByText('Add Member'));
      await waitFor(() =>
        expect(screen.getByText(/Carol Jones/)).toBeTruthy(),
      );
    });

    it('shows "Everyone on your team is already a member" when no available team', async () => {
      // Members include userId 30 (carol), team returns only her
      global.fetch = happyFetch({
        members: [{ ...MEMBER_1 }, { ...MEMBER_2 }, { id: 3, userId: 30, role: 'viewer', addedAt: '2025-03-01T00:00:00Z', name: 'Carol Jones', email: 'carol@example.com' }],
        team: [TEAM_USER_3],
      });
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getByText('Add Member'));
      fireEvent.click(screen.getByText('Add Member'));
      await waitFor(() =>
        expect(screen.getByText(/Everyone on your team is already a member/)).toBeTruthy(),
      );
    });

    it('shows error if no teammate is selected on submit', async () => {
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getByText('Add Member'));
      fireEvent.click(screen.getByText('Add Member'));

      await waitFor(() => screen.getByText('Add member')); // form heading

      // Submit the form without selecting a teammate
      const submitBtn = screen.getAllByText('Add Member').find(el => el.closest('button[type="submit"]'));
      // find submit button directly
      const form = document.querySelector('form');
      expect(form).toBeTruthy();
      fireEvent.submit(form!);

      await waitFor(() =>
        expect(screen.getByText('Pick a teammate to add')).toBeTruthy(),
      );
    });

    it('successfully adds a member and reloads', async () => {
      // After POST, fetch returns updated list with carol added
      let callCount = 0;
      global.fetch = vi.fn(async (url: string, init?: RequestInit) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        if (method === 'POST' && url.includes('/members')) {
          return { ok: true, json: async () => ({ success: true, data: {} }) };
        }
        if (method === 'GET' && url.includes('/members')) {
          callCount++;
          const data = callCount === 1 ? [MEMBER_1, MEMBER_2] : [MEMBER_1, MEMBER_2, { id: 3, userId: 30, role: 'viewer', addedAt: '2025-03-01T00:00:00Z', name: 'Carol Jones', email: 'carol@example.com' }];
          return { ok: true, json: async () => ({ success: true, data }) };
        }
        if (url.includes('/api/portal/team')) {
          return { ok: true, json: async () => ({ success: true, data: [TEAM_USER_3] }) };
        }
        return { ok: true, json: async () => ({ success: false }) };
      }) as unknown as typeof global.fetch;

      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getByText('Add Member'));
      fireEvent.click(screen.getByText('Add Member'));

      await waitFor(() => screen.getByText(/Carol Jones/));
      const teamSelect = screen.getAllByRole('combobox')[0];
      fireEvent.change(teamSelect, { target: { value: '30' } });

      const form = document.querySelector('form');
      await act(async () => { fireEvent.submit(form!); });

      await waitFor(() => expect(screen.getByText('Carol Jones')).toBeTruthy());
    });

    it('shows server error message on failed POST', async () => {
      global.fetch = happyFetch({ postSuccess: false });
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getByText('Add Member'));
      fireEvent.click(screen.getByText('Add Member'));

      await waitFor(() => screen.getByText(/Carol Jones/));
      const teamSelect = screen.getAllByRole('combobox')[0];
      fireEvent.change(teamSelect, { target: { value: '30' } });

      const form = document.querySelector('form');
      await act(async () => { fireEvent.submit(form!); });

      await waitFor(() => expect(screen.getByText('Already a member')).toBeTruthy());
    });

    it('allows changing the role selector in the add form', async () => {
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getByText('Add Member'));
      fireEvent.click(screen.getByText('Add Member'));

      await waitFor(() => screen.getByText('Add member'));
      const selects = screen.getAllByRole('combobox');
      // Second select is the role selector in the form
      const roleSelect = selects[1];
      fireEvent.change(roleSelect, { target: { value: 'viewer' } });
      expect((roleSelect as HTMLSelectElement).value).toBe('viewer');
    });
  });

  // -------------------------------------------------------------------------
  // Role change
  // -------------------------------------------------------------------------
  describe('role change', () => {
    it('calls PATCH on role change', async () => {
      const mockFetch = happyFetch();
      global.fetch = mockFetch;
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getByText('Alice Smith'));

      const selects = screen.getAllByRole('combobox');
      await act(async () => {
        fireEvent.change(selects[0], { target: { value: 'viewer' } });
      });

      await waitFor(() => {
        const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls;
        const patchCall = calls.find(
          ([, init]) => (init as RequestInit)?.method === 'PATCH',
        );
        expect(patchCall).toBeTruthy();
      });
    });

    it('shows error when role change fails', async () => {
      global.fetch = happyFetch({ patchSuccess: false });
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getByText('Alice Smith'));

      const selects = screen.getAllByRole('combobox');
      await act(async () => {
        fireEvent.change(selects[0], { target: { value: 'viewer' } });
      });

      await waitFor(() =>
        expect(screen.getByText('Cannot change role')).toBeTruthy(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Remove member
  // -------------------------------------------------------------------------
  describe('remove member', () => {
    it('calls DELETE and reloads on confirm', async () => {
      confirmSpy.mockReturnValue(true);
      const mockFetch = happyFetch();
      global.fetch = mockFetch;
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getAllByText('Remove'));

      await act(async () => {
        fireEvent.click(screen.getAllByText('Remove')[0]);
      });

      await waitFor(() => {
        const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls;
        const deleteCall = calls.find(
          ([, init]) => (init as RequestInit)?.method === 'DELETE',
        );
        expect(deleteCall).toBeTruthy();
      });
    });

    it('does not call DELETE when user cancels confirm', async () => {
      confirmSpy.mockReturnValue(false);
      const mockFetch = happyFetch();
      global.fetch = mockFetch;
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getAllByText('Remove'));

      fireEvent.click(screen.getAllByText('Remove')[0]);

      const calls = (mockFetch as ReturnType<typeof vi.fn>).mock.calls;
      const deleteCall = calls.find(
        ([, init]) => (init as RequestInit)?.method === 'DELETE',
      );
      expect(deleteCall).toBeUndefined();
    });

    it('shows error when DELETE fails', async () => {
      confirmSpy.mockReturnValue(true);
      global.fetch = happyFetch({ deleteSuccess: false });
      render(<ProjectMembersTab projectId={1} canManage={true} />);
      await waitFor(() => screen.getAllByText('Remove'));

      await act(async () => {
        fireEvent.click(screen.getAllByText('Remove')[0]);
      });

      await waitFor(() =>
        expect(screen.getByText('Cannot remove owner')).toBeTruthy(),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Team fetch failure (graceful degradation)
  // -------------------------------------------------------------------------
  describe('resilience', () => {
    it('renders members even if team fetch fails', async () => {
      global.fetch = buildFetchMock([
        {
          match: (u) => u.includes('/members'),
          respond: async () => ({ body: { success: true, data: [MEMBER_1] } }),
        },
        {
          match: (u) => u.includes('/api/portal/team'),
          respond: async () => {
            throw new Error('network error');
          },
        },
      ]);
      render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() => expect(screen.getByText('Alice Smith')).toBeTruthy());
    });

    it('re-fetches when projectId changes', async () => {
      global.fetch = happyFetch();
      const { rerender } = render(<ProjectMembersTab projectId={1} canManage={false} />);
      await waitFor(() => screen.getByText('Alice Smith'));

      global.fetch = happyFetch({ members: [] });
      rerender(<ProjectMembersTab projectId={2} canManage={false} />);
      await waitFor(() => expect(screen.getByText('No members yet.')).toBeTruthy());
    });
  });
});
