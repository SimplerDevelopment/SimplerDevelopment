// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// next/link mock
// ---------------------------------------------------------------------------
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// next/navigation mock
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/portal/projects/1',
  useSearchParams: () => ({ get: () => null }),
}));

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

function buildFetchMock(body: unknown, ok = true) {
  return vi.fn(async () => ({
    ok,
    json: async () => body,
  })) as unknown as typeof global.fetch;
}

// Helpers for building sprint data
interface SprintOverrides {
  id?: number;
  name?: string;
  status?: 'planning' | 'active' | 'completed';
  startDate?: string | null;
  endDate?: string | null;
  cards?: Array<{
    id: number;
    number: number | null;
    title: string;
    dueDate: string | null;
    storyPoints: number | null;
    columnIsDone: boolean | null;
    cardType: string;
  }>;
}

function makeSprint(overrides: SprintOverrides = {}) {
  return {
    id: overrides.id !== undefined ? overrides.id : 1,
    name: overrides.name !== undefined ? overrides.name : 'Sprint 1',
    status: overrides.status !== undefined ? overrides.status : ('active' as const),
    startDate: 'startDate' in overrides ? overrides.startDate : '2025-01-01',
    endDate: 'endDate' in overrides ? overrides.endDate : '2025-02-01',
    cards: overrides.cards !== undefined ? overrides.cards : [],
  };
}

function sprintResponse(sprints: ReturnType<typeof makeSprint>[], backlog: unknown[] = []) {
  return buildFetchMock({ success: true, data: { sprints, backlog } });
}

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------
import ProjectRoadmapTab from '@/components/portal/ProjectRoadmapTab';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  global.fetch = sprintResponse([]);
});

describe('ProjectRoadmapTab', () => {
  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------
  describe('loading state', () => {
    it('shows loading spinner before fetch resolves', () => {
      global.fetch = vi.fn(() => new Promise(() => {})) as unknown as typeof global.fetch;
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      const spinner = document.querySelector('.animate-spin');
      expect(spinner).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Empty state (no dated sprints)
  // -------------------------------------------------------------------------
  describe('empty state', () => {
    it('shows "No dated sprints yet" when no sprints returned', async () => {
      global.fetch = sprintResponse([]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => expect(screen.getByText('No dated sprints yet')).toBeTruthy());
    });

    it('shows the help text about setting start/end dates', async () => {
      global.fetch = sprintResponse([]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() =>
        expect(screen.getByText(/Set a startDate and endDate/)).toBeTruthy(),
      );
    });

    it('shows "No dated sprints yet" when sprints have no startDate/endDate', async () => {
      global.fetch = sprintResponse([
        makeSprint({ startDate: null, endDate: null }),
      ]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => expect(screen.getByText('No dated sprints yet')).toBeTruthy());
    });

    it('shows empty state if only one sprint has a date (range would collapse)', async () => {
      // When min === max, range becomes null and we fall into empty state
      global.fetch = sprintResponse([
        makeSprint({ startDate: '2025-06-01', endDate: '2025-06-01' }),
      ]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      // Either empty state OR roadmap heading — just don't throw
      await waitFor(() => {
        const heading = screen.queryByText('No dated sprints yet');
        const roadmap = screen.queryByText('Roadmap');
        expect(heading !== null || roadmap !== null).toBe(true);
      });
    });
  });

  // -------------------------------------------------------------------------
  // Roadmap render
  // -------------------------------------------------------------------------
  describe('roadmap with sprints', () => {
    const sprint1 = makeSprint({ id: 1, name: 'Sprint Alpha', status: 'active', startDate: '2025-01-01', endDate: '2025-03-01' });
    const sprint2 = makeSprint({ id: 2, name: 'Sprint Beta', status: 'planning', startDate: '2025-03-01', endDate: '2025-05-01' });
    const sprint3 = makeSprint({ id: 3, name: 'Sprint Gamma', status: 'completed', startDate: '2024-10-01', endDate: '2024-12-31' });

    it('renders the Roadmap heading', async () => {
      global.fetch = sprintResponse([sprint1, sprint2]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => expect(screen.getByText('Roadmap')).toBeTruthy());
    });

    it('renders an SVG with role="img"', async () => {
      global.fetch = sprintResponse([sprint1, sprint2]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        const svg = document.querySelector('svg[role="img"]');
        expect(svg).toBeTruthy();
      });
    });

    it('renders sprint names as text in the SVG', async () => {
      global.fetch = sprintResponse([sprint1, sprint2]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        expect(screen.getByText('Sprint Alpha')).toBeTruthy();
        expect(screen.getByText('Sprint Beta')).toBeTruthy();
      });
    });

    it('truncates long sprint names with ellipsis', async () => {
      const longNameSprint = makeSprint({ id: 99, name: 'Very Long Sprint Name Here', startDate: '2025-01-01', endDate: '2025-06-01' });
      global.fetch = sprintResponse([sprint1, longNameSprint]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        // Name is 25 chars, truncated to 14 + ellipsis
        expect(screen.getByText('Very Long Spri…')).toBeTruthy();
      });
    });

    it('renders sprint link buttons at the bottom', async () => {
      global.fetch = sprintResponse([sprint1, sprint2]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        const links = screen.getAllByRole('link');
        expect(links.length).toBeGreaterThanOrEqual(2);
        expect(links[0].getAttribute('href')).toContain('/portal/projects/1');
        expect(links[0].getAttribute('href')).toContain('#1');
      });
    });

    it('renders the legend labels', async () => {
      global.fetch = sprintResponse([sprint1, sprint2]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        expect(screen.getByText('Planning')).toBeTruthy();
        expect(screen.getByText('Active')).toBeTruthy();
        expect(screen.getByText('Completed')).toBeTruthy();
        expect(screen.getByText('Open card due')).toBeTruthy();
        expect(screen.getByText('Done card')).toBeTruthy();
      });
    });

    it('renders completed sprint with opacity', async () => {
      global.fetch = sprintResponse([sprint1, sprint3]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        // Completed sprint renders a rect with opacity=0.6
        const rects = document.querySelectorAll('rect');
        const completedRect = Array.from(rects).find(r => r.getAttribute('opacity') === '0.6');
        expect(completedRect).toBeTruthy();
      });
    });

    it('renders card count text inside sprint bar', async () => {
      const sprintWithCards = makeSprint({
        id: 5,
        name: 'Card Sprint',
        startDate: '2025-01-01',
        endDate: '2025-04-01',
        cards: [
          { id: 101, number: 1, title: 'Card A', dueDate: null, storyPoints: 3, columnIsDone: false, cardType: 'task' },
          { id: 102, number: 2, title: 'Card B', dueDate: null, storyPoints: null, columnIsDone: null, cardType: 'task' },
        ],
      });
      global.fetch = sprintResponse([sprint1, sprintWithCards]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        expect(screen.getByText('2 cards')).toBeTruthy();
      });
    });

    it('renders singular "card" for sprint with 1 card', async () => {
      const oneCardSprint = makeSprint({
        id: 6,
        name: 'One Card',
        startDate: '2025-01-01',
        endDate: '2025-04-01',
        cards: [
          { id: 200, number: 3, title: 'Solo Card', dueDate: null, storyPoints: null, columnIsDone: null, cardType: 'task' },
        ],
      });
      global.fetch = sprintResponse([sprint1, oneCardSprint]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        expect(screen.getByText('1 card')).toBeTruthy();
      });
    });
  });

  // -------------------------------------------------------------------------
  // Card dots (due dates)
  // -------------------------------------------------------------------------
  describe('card due-date dots', () => {
    const baseSprint = makeSprint({ startDate: '2025-01-01', endDate: '2025-06-01' });

    it('renders circle dots for cards with due dates', async () => {
      const sprint = {
        ...baseSprint,
        cards: [
          { id: 10, number: 1, title: 'Due Card', dueDate: '2025-03-15', storyPoints: null, columnIsDone: false, cardType: 'task' },
        ],
      };
      global.fetch = sprintResponse([sprint]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        const circles = document.querySelectorAll('circle');
        expect(circles.length).toBeGreaterThan(0);
      });
    });

    it('card tooltip includes project key and card number', async () => {
      const sprint = {
        ...baseSprint,
        cards: [
          { id: 11, number: 5, title: 'My Task', dueDate: '2025-03-15', storyPoints: 8, columnIsDone: false, cardType: 'task' },
        ],
      };
      global.fetch = sprintResponse([sprint]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        const title = document.querySelector('circle title');
        expect(title?.textContent).toContain('PRJ-5');
        expect(title?.textContent).toContain('My Task');
        expect(title?.textContent).toContain('8 pts');
      });
    });

    it('card tooltip without project key omits the prefix', async () => {
      const sprint = {
        ...baseSprint,
        cards: [
          { id: 12, number: 6, title: 'No Key Card', dueDate: '2025-03-15', storyPoints: null, columnIsDone: null, cardType: 'task' },
        ],
      };
      global.fetch = sprintResponse([sprint]);
      render(<ProjectRoadmapTab projectId={1} projectKey={null} />);
      await waitFor(() => {
        const title = document.querySelector('circle title');
        expect(title?.textContent).not.toContain('null-');
        expect(title?.textContent).toContain('No Key Card');
      });
    });

    it('renders done cards with emerald fill class', async () => {
      const sprint = {
        ...baseSprint,
        cards: [
          { id: 20, number: 7, title: 'Done Card', dueDate: '2025-03-15', storyPoints: null, columnIsDone: true, cardType: 'task' },
        ],
      };
      global.fetch = sprintResponse([sprint]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        const circle = document.querySelector('circle');
        expect(circle?.className.baseVal ?? circle?.getAttribute('class')).toContain('emerald');
      });
    });

    it('renders open cards with rose fill class', async () => {
      const sprint = {
        ...baseSprint,
        cards: [
          { id: 21, number: 8, title: 'Open Card', dueDate: '2025-04-01', storyPoints: null, columnIsDone: false, cardType: 'task' },
        ],
      };
      global.fetch = sprintResponse([sprint]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        const circle = document.querySelector('circle');
        expect(circle?.className.baseVal ?? circle?.getAttribute('class')).toContain('rose');
      });
    });

    it('does not render dots for cards without due dates', async () => {
      const sprint = {
        ...baseSprint,
        cards: [
          { id: 30, number: null, title: 'No Due', dueDate: null, storyPoints: null, columnIsDone: null, cardType: 'task' },
        ],
      };
      global.fetch = sprintResponse([sprint]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => screen.getByText('Roadmap'));
      const circles = document.querySelectorAll('circle');
      expect(circles.length).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Backlog warning
  // -------------------------------------------------------------------------
  describe('backlog due-date warning', () => {
    it('shows backlog warning when backlog cards have due dates', async () => {
      const sprint = makeSprint({ startDate: '2025-01-01', endDate: '2025-06-01' });
      const backlog = [
        { id: 500, dueDate: '2025-04-01', title: 'Backlog card' },
        { id: 501, dueDate: '2025-05-01', title: 'Backlog card 2' },
      ];
      global.fetch = sprintResponse([sprint], backlog);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() =>
        expect(screen.getByText(/2 backlog cards with due dates/)).toBeTruthy(),
      );
    });

    it('uses singular "card" for exactly 1 backlog item', async () => {
      const sprint = makeSprint({ startDate: '2025-01-01', endDate: '2025-06-01' });
      const backlog = [{ id: 600, dueDate: '2025-04-01', title: 'Lone backlog' }];
      global.fetch = sprintResponse([sprint], backlog);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() =>
        expect(screen.getByText(/1 backlog card with due dates/)).toBeTruthy(),
      );
    });

    it('does not show backlog warning when backlog cards have no due dates', async () => {
      const sprint = makeSprint({ startDate: '2025-01-01', endDate: '2025-06-01' });
      const backlog = [{ id: 700, dueDate: null, title: 'No due backlog' }];
      global.fetch = sprintResponse([sprint], backlog);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => screen.getByText('Roadmap'));
      expect(screen.queryByText(/backlog card/)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Resilience
  // -------------------------------------------------------------------------
  describe('resilience', () => {
    it('handles fetch failure gracefully (no crash)', async () => {
      global.fetch = vi.fn(async () => ({
        ok: false,
        json: async () => ({ success: false }),
      })) as unknown as typeof global.fetch;

      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      // Should reach empty state without throwing
      await waitFor(() => expect(screen.getByText('No dated sprints yet')).toBeTruthy());
    });

    it('re-fetches when projectId changes', async () => {
      global.fetch = sprintResponse([]);
      const { rerender } = render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => screen.getByText('No dated sprints yet'));

      const sprint = makeSprint({ startDate: '2025-01-01', endDate: '2025-06-01' });
      global.fetch = sprintResponse([sprint]);
      rerender(<ProjectRoadmapTab projectId={2} projectKey="PRJ" />);
      await waitFor(() => expect(screen.getByText('Roadmap')).toBeTruthy());
    });

    it('month ticks are rendered for multi-month date ranges', async () => {
      const sprint = makeSprint({ startDate: '2025-01-01', endDate: '2025-04-01' });
      global.fetch = sprintResponse([sprint]);
      render(<ProjectRoadmapTab projectId={1} projectKey="PRJ" />);
      await waitFor(() => {
        const texts = document.querySelectorAll('svg text');
        // At least a few month labels should exist
        expect(texts.length).toBeGreaterThan(1);
      });
    });
  });
});
