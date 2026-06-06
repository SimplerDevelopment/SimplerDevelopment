// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/admin/agentic-os/page.tsx` — client component.
 * Stubs global fetch; exercises loading, error, catalog render,
 * filter switching, run history, rules panel, skill cards, and the run drawer.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(), replace: vi.fn(), refresh: vi.fn(),
    back: vi.fn(), forward: vi.fn(), prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/agentic-os',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string; [key: string]: unknown }) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const baseSkillOnDemand = {
  id: 'skill-alpha',
  domain: 'marketing',
  name: 'Alpha Skill',
  description: 'Does alpha things',
  icon: 'star',
  estimatedRuntime: '30s',
  trigger: 'on-demand' as const,
  promptTemplate: 'Run {{target}} task',
  variables: [
    { key: 'target', label: 'Target', required: true, placeholder: 'e.g. site', type: 'text' as const },
  ],
  appliesRules: ['rule-1'],
  manualRunPath: '/scripts/alpha.sh',
};

const baseSkillScheduled = {
  id: 'skill-beta',
  domain: 'marketing',
  name: 'Beta Skill',
  description: 'Runs on a schedule',
  icon: 'schedule',
  trigger: 'scheduled' as const,
  cronExpression: '0 6 * * *',
};

const baseSkillCloud = {
  id: 'skill-gamma',
  domain: 'crm',
  name: 'Gamma Skill',
  description: 'Cloud triggered',
  icon: 'cloud',
  trigger: 'cloud' as const,
};

const baseRules = [
  { id: 'rule-1', title: 'Rule One', body: 'Always do this first.' },
  { id: 'rule-2', title: 'Rule Two', body: 'Never skip validation.' },
];

const baseRuns = [
  {
    id: 10,
    skillId: 'skill-alpha',
    status: 'succeeded' as const,
    exitCode: 0,
    durationMs: 1500,
    errorMessage: null,
    createdAt: '2026-01-01T12:00:00Z',
    completedAt: '2026-01-01T12:00:01.5Z',
  },
  {
    id: 11,
    skillId: 'skill-beta',
    status: 'failed' as const,
    exitCode: 1,
    durationMs: 3000,
    errorMessage: 'Script exited 1',
    createdAt: '2026-01-01T11:00:00Z',
    completedAt: '2026-01-01T11:00:03Z',
  },
];

function makeCatalog(overrides: Partial<{
  skills: (typeof baseSkillOnDemand | typeof baseSkillScheduled | typeof baseSkillCloud)[];
  executorAvailable: boolean;
  executorHostHint: string | null;
  recentRuns: typeof baseRuns;
}> = {}) {
  const skills = overrides.skills ?? [baseSkillOnDemand, baseSkillScheduled, baseSkillCloud];
  return {
    skills,
    domains: ['marketing', 'crm'],
    domainLabels: { marketing: 'Marketing', crm: 'CRM' },
    rules: baseRules,
    recentRuns: overrides.recentRuns ?? baseRuns,
    counts: { succeeded: 42, failed: 3 },
    executorAvailable: overrides.executorAvailable ?? true,
    executorHostHint: overrides.executorHostHint ?? null,
  };
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────

type Handler = (url: string, init?: RequestInit) => any;
let currentHandler: Handler;

function setHandler(h: Handler) { currentHandler = h; }

function jsonResp(body: any, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as any;
}

function defaultHandler(url: string, _init?: RequestInit): any {
  if (url === '/api/admin/agentic-os') {
    return jsonResp({ success: true, data: makeCatalog() });
  }
  if (url === '/api/admin/agentic-os/run') {
    return jsonResp({ success: true, data: { runId: 99 } });
  }
  return jsonResp({ success: true, data: null });
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  setHandler(defaultHandler);
  global.fetch = vi.fn((url: string, init?: RequestInit) =>
    Promise.resolve(currentHandler(url, init)),
  ) as unknown as typeof fetch;

  // Clipboard
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });

  // EventSource stub (not in jsdom) — stays open by default
  (global as any).EventSource = vi.fn().mockImplementation(() => ({
    onmessage: null,
    onerror: null,
    addEventListener: vi.fn(),
    close: vi.fn(),
  }));
});

afterEach(() => {
  vi.useRealTimers();
});

// Import under test (after mocks)
import AgenticOsPage from '@/app/admin/agentic-os/page';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function renderPage() {
  const result = render(<AgenticOsPage />);
  // Wait for loading spinner to disappear
  await waitFor(() => {
    expect(screen.queryByText('Loading Agentic OS…')).toBeNull();
  });
  return result;
}

async function flush() {
  await act(async () => { await Promise.resolve(); });
}

// Click the skill-card "Run" button for the first on-demand skill.
// The button text is "play_arrowRun" due to the icon span, so getByRole with
// name=/^Run$/ fails. The skill-card Run button uniquely has the class
// "hover:opacity-90" (filter buttons use "transition-colors" instead).
// We find it by looking for a button whose className includes "hover:opacity-90"
// but NOT "disabled:opacity-40" (that's the drawer Run button).
function clickSkillCardRunBtn() {
  const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  const btn = btns.find(
    (b) =>
      b.className.includes('hover:opacity-90') &&
      !b.className.includes('disabled:opacity-40'),
  );
  if (!btn) throw new Error('Skill-card Run button not found (hover:opacity-90 without disabled:opacity-40)');
  fireEvent.click(btn);
}

// Click the footer "Run" button inside the drawer aside.
// The drawer Run button has "disabled:opacity-40" which the skill-card one does not.
function clickDrawerRunBtn() {
  const btns = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
  const btn = btns.find(
    (b) =>
      b.className.includes('hover:opacity-90') &&
      b.className.includes('disabled:opacity-40'),
  );
  if (!btn) throw new Error('Drawer footer Run button not found');
  fireEvent.click(btn);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgenticOsPage', () => {
  describe('loading state', () => {
    it('shows loading spinner before fetch resolves', () => {
      render(<AgenticOsPage />);
      expect(screen.getByText('Loading Agentic OS…')).toBeTruthy();
    });
  });

  describe('error state', () => {
    it('shows error panel when fetch returns success:false', async () => {
      setHandler(() => jsonResp({ success: false, message: 'Catalog unavailable' }));
      render(<AgenticOsPage />);
      await waitFor(() =>
        expect(screen.getByText("Couldn't load Agentic OS")).toBeTruthy(),
      );
      expect(screen.getByText('Catalog unavailable')).toBeTruthy();
    });

    it('shows error panel when fetch throws', async () => {
      global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as unknown as typeof fetch;
      render(<AgenticOsPage />);
      await waitFor(() =>
        expect(screen.getByText("Couldn't load Agentic OS")).toBeTruthy(),
      );
      expect(screen.getByText('Network error')).toBeTruthy();
    });

    it('shows generic message when API returns no message', async () => {
      setHandler(() => jsonResp({ success: false }));
      render(<AgenticOsPage />);
      await waitFor(() =>
        expect(screen.getByText("Couldn't load Agentic OS")).toBeTruthy(),
      );
      expect(screen.getByText('Failed to load catalog')).toBeTruthy();
    });
  });

  describe('catalog render — header', () => {
    it('renders Agentic OS heading', async () => {
      await renderPage();
      expect(screen.getByText('Agentic OS')).toBeTruthy();
    });

    it('shows "Local executor available" badge when executor is available', async () => {
      await renderPage();
      expect(screen.getByText('Local executor available')).toBeTruthy();
    });

    it('shows "Catalog mode" badge when executor is unavailable', async () => {
      setHandler(() =>
        jsonResp({ success: true, data: makeCatalog({ executorAvailable: false }) }),
      );
      await renderPage();
      expect(screen.getByText('Catalog mode')).toBeTruthy();
    });

    it('shows executor host hint when unavailable and hint is set', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({
            executorAvailable: false,
            executorHostHint: 'Run from your dev machine instead.',
          }),
        }),
      );
      await renderPage();
      expect(screen.getByText('Run from your dev machine instead.')).toBeTruthy();
    });

    it('does not show host hint when executor is available', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({ executorAvailable: true, executorHostHint: 'should not show' }),
        }),
      );
      await renderPage();
      expect(screen.queryByText('should not show')).toBeNull();
    });
  });

  describe('catalog render — stat strip', () => {
    it('renders stat card labels', async () => {
      await renderPage();
      expect(screen.getAllByText('Skills').length).toBeGreaterThan(0);
      expect(screen.getAllByText('On-demand').length).toBeGreaterThan(0);
      expect(screen.getByText('Succeeded')).toBeTruthy();
      expect(screen.getByText('Failed')).toBeTruthy();
    });

    it('shows succeeded count (42) from server', async () => {
      await renderPage();
      expect(screen.getByText('42')).toBeTruthy();
    });

    it('shows correct total skill count (3)', async () => {
      await renderPage();
      // Total skills = 3; on-demand = 1; scheduled = 1; those values appear in the strip.
      // "3" appears in the Skills card
      const threes = screen.getAllByText('3');
      expect(threes.length).toBeGreaterThan(0);
    });
  });

  describe('rules panel', () => {
    it('rules panel is hidden by default', async () => {
      await renderPage();
      expect(screen.queryByText('Cross-cutting rules')).toBeNull();
    });

    it('toggles rules panel open when Rules button is clicked', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Rules \(2\)/ }));
      expect(screen.getByText('Cross-cutting rules')).toBeTruthy();
      // "Rule One" also appears as a skill-card tag so use getAllByText
      expect(screen.getAllByText('Rule One').length).toBeGreaterThan(0);
      expect(screen.getByText('Rule Two')).toBeTruthy();
      expect(screen.getByText('Always do this first.')).toBeTruthy();
    });

    it('toggles rules panel closed when Rules button is clicked again', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Rules \(2\)/ }));
      expect(screen.getByText('Cross-cutting rules')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: /Rules \(2\)/ }));
      expect(screen.queryByText('Cross-cutting rules')).toBeNull();
    });

    it('rules button shows count of rules', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: /Rules \(2\)/ })).toBeTruthy();
    });
  });

  describe('skill cards', () => {
    it('renders Alpha Skill heading in the grid', async () => {
      await renderPage();
      // getAllByText because the compact run history also shows the name in a table row
      expect(screen.getAllByText('Alpha Skill').length).toBeGreaterThan(0);
    });

    it('renders Beta Skill and Gamma Skill in the catalog', async () => {
      await renderPage();
      expect(screen.getAllByText('Beta Skill').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Gamma Skill').length).toBeGreaterThan(0);
    });

    it('renders domain section labels', async () => {
      await renderPage();
      expect(screen.getByText('Marketing')).toBeTruthy();
      expect(screen.getByText('CRM')).toBeTruthy();
    });

    it('renders skill description text', async () => {
      await renderPage();
      expect(screen.getByText('Does alpha things')).toBeTruthy();
    });

    it('renders estimated runtime when provided', async () => {
      await renderPage();
      expect(screen.getByText('30s')).toBeTruthy();
    });

    it('renders cron expression for scheduled skills', async () => {
      await renderPage();
      expect(screen.getByText('0 6 * * *')).toBeTruthy();
    });

    it('renders rule tags on skill cards that apply rules', async () => {
      await renderPage();
      // rule-1 is applied by skill-alpha; the tag has title="Always do this first."
      expect(screen.getByTitle('Always do this first.')).toBeTruthy();
    });

    it('renders Run button for on-demand skills', async () => {
      await renderPage();
      // The skill card Run button has class bg-primary.text-primary-foreground
      const runBtn = document.querySelector('button.bg-primary.text-primary-foreground');
      expect(runBtn).toBeTruthy();
    });

    it('shows "Cron-managed" label for scheduled skills', async () => {
      await renderPage();
      expect(screen.getByText('Cron-managed')).toBeTruthy();
    });

    it('shows "Cloud-triggered" label for cloud skills', async () => {
      await renderPage();
      expect(screen.getByText('Cloud-triggered')).toBeTruthy();
    });

    it('renders manualRunPath as code snippet on skill card', async () => {
      await renderPage();
      expect(screen.getByText('/scripts/alpha.sh')).toBeTruthy();
    });

    it('renders skill count per domain section', async () => {
      await renderPage();
      // marketing has 2 skills (alpha + beta); crm has 1 (gamma)
      expect(screen.getByText('2 skills')).toBeTruthy();
      expect(screen.getByText('1 skill')).toBeTruthy();
    });
  });

  describe('filter bar', () => {
    it('renders all filter buttons', async () => {
      await renderPage();
      expect(screen.getByRole('button', { name: /All domains/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /On-demand only/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Scheduled/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /Run history/ })).toBeTruthy();
    });

    it('on-demand filter shows alpha skill card heading in the grid', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /On-demand only/ }));
      // Alpha Skill should still appear (it's on-demand)
      expect(screen.getAllByText('Alpha Skill').length).toBeGreaterThan(0);
      // Beta Skill should not appear anywhere in the DOM after filter
      // (compact RunHistory still might show it by skillId, so check the card section)
      // The domain section should only have marketing with 1 skill now
      expect(screen.getByText('1 skill')).toBeTruthy();
    });

    it('scheduled filter hides on-demand skill from grid section', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Scheduled/ }));
      // Beta Skill (scheduled) should remain
      expect(screen.getAllByText('Beta Skill').length).toBeGreaterThan(0);
      // After scheduled filter, domain section shows 1 skill
      expect(screen.getByText('1 skill')).toBeTruthy();
    });

    it('shows empty state when filter matches no skills', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({ skills: [baseSkillCloud as any] }),
        }),
      );
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /On-demand only/ }));
      expect(screen.getByText('No skills match this filter')).toBeTruthy();
    });

    it('restores multi-skill count after resetting to All domains', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /On-demand only/ }));
      fireEvent.click(screen.getByRole('button', { name: /All domains/ }));
      // marketing now has 2 skills again
      expect(screen.getByText('2 skills')).toBeTruthy();
    });
  });

  describe('run history tab', () => {
    it('switches to run history view', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      // The full RunHistory section renders "Run history" as its heading
      expect(screen.getAllByText('Run history').length).toBeGreaterThan(0);
    });

    it('shows succeeded and failed status badges in history', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getAllByText('succeeded').length).toBeGreaterThan(0);
      expect(screen.getAllByText('failed').length).toBeGreaterThan(0);
    });

    it('shows skill name for known skillId', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getAllByText('Alpha Skill').length).toBeGreaterThan(0);
    });

    it('falls back to skillId text when skill not in catalog', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({
            recentRuns: [
              {
                id: 99,
                skillId: 'unknown-skill-xyz',
                status: 'succeeded' as const,
                exitCode: 0,
                durationMs: 500,
                errorMessage: null,
                createdAt: '2026-01-01T10:00:00Z',
                completedAt: '2026-01-01T10:00:01Z',
              },
            ],
          }),
        }),
      );
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getAllByText('unknown-skill-xyz').length).toBeGreaterThan(0);
    });

    it('shows formatted duration in history rows', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getAllByText('1.5s').length).toBeGreaterThan(0);
      expect(screen.getAllByText('3.0s').length).toBeGreaterThan(0);
    });

    it('shows error message text when run has errorMessage', async () => {
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getByText('Script exited 1')).toBeTruthy();
    });

    it('shows -- for null durationMs', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({
            recentRuns: [
              {
                id: 20,
                skillId: 'skill-alpha',
                status: 'running' as const,
                exitCode: null,
                durationMs: null,
                errorMessage: null,
                createdAt: '2026-01-01T10:00:00Z',
                completedAt: null,
              },
            ],
          }),
        }),
      );
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getAllByText('--').length).toBeGreaterThan(0);
    });

    it('shows empty state when there are no runs', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({ recentRuns: [] }),
        }),
      );
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getByText('No runs yet')).toBeTruthy();
    });

    it('compact recent runs section appears in all-domains view', async () => {
      await renderPage();
      // "Recent runs" heading in the compact footer (below skill grid)
      expect(screen.getByText('Recent runs')).toBeTruthy();
    });
  });

  describe('refresh button', () => {
    it('calls fetch again when Refresh is clicked', async () => {
      await renderPage();
      const callsBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
      fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
      await waitFor(() => {
        expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callsBefore);
      });
    });
  });

  describe('run drawer', () => {
    async function openDrawer() {
      await renderPage();
      clickSkillCardRunBtn();
      // Wait for drawer to appear
      await waitFor(() => expect(screen.getByLabelText('Close drawer')).toBeTruthy());
    }

    it('opens run drawer when skill-card Run is clicked', async () => {
      await openDrawer();
      expect(screen.getByLabelText('Close drawer')).toBeTruthy();
      expect(screen.getAllByText('Alpha Skill').length).toBeGreaterThan(0);
    });

    it('closes drawer when backdrop is clicked', async () => {
      await openDrawer();
      // The backdrop is the first child div of the fixed overlay
      const backdrop = document.querySelector('.fixed.inset-0 > div') as HTMLElement;
      if (backdrop) fireEvent.click(backdrop);
      await waitFor(() => expect(screen.queryByLabelText('Close drawer')).toBeNull());
    });

    it('closes drawer when close button is clicked', async () => {
      await openDrawer();
      fireEvent.click(screen.getByLabelText('Close drawer'));
      await waitFor(() => expect(screen.queryByLabelText('Close drawer')).toBeNull());
    });

    it('renders skill description in drawer body', async () => {
      await openDrawer();
      // getAllByText because description may appear in card and drawer
      expect(screen.getAllByText('Does alpha things').length).toBeGreaterThan(0);
    });

    it('renders variable input field for required variable', async () => {
      await openDrawer();
      const input = screen.getByPlaceholderText('e.g. site') as HTMLInputElement;
      expect(input).toBeTruthy();
    });

    it('updates variable value on change', async () => {
      await openDrawer();
      const input = screen.getByPlaceholderText('e.g. site') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'mysite' } });
      expect(input.value).toBe('mysite');
    });

    it('renders textarea for textarea-type variable', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({
            skills: [
              {
                ...baseSkillOnDemand,
                variables: [
                  { key: 'content', label: 'Content', required: true, type: 'textarea' as const },
                ],
              },
            ],
          }),
        }),
      );
      await renderPage();
      clickSkillCardRunBtn();
      await waitFor(() => expect(screen.getByLabelText('Close drawer')).toBeTruthy());
      const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
      expect(textarea).toBeTruthy();
    });

    it('renders select for select-type variable', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({
            skills: [
              {
                ...baseSkillOnDemand,
                variables: [
                  {
                    key: 'env',
                    label: 'Environment',
                    required: true,
                    type: 'select' as const,
                    options: ['staging', 'production'],
                    placeholder: 'Pick one',
                  },
                ],
              },
            ],
          }),
        }),
      );
      await renderPage();
      clickSkillCardRunBtn();
      await waitFor(() => expect(screen.getByLabelText('Close drawer')).toBeTruthy());
      expect(screen.getByText('Pick one')).toBeTruthy();
      expect(screen.getByText('staging')).toBeTruthy();
      expect(screen.getByText('production')).toBeTruthy();
    });

    it('shows "no inputs" text for skill with no variables', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({
            skills: [{ ...baseSkillOnDemand, variables: [] }],
          }),
        }),
      );
      await renderPage();
      clickSkillCardRunBtn();
      await waitFor(() => expect(screen.getByLabelText('Close drawer')).toBeTruthy());
      expect(screen.getByText('This skill takes no inputs.')).toBeTruthy();
    });

    it('shows rendered prompt with substituted variable', async () => {
      await openDrawer();
      const input = screen.getByPlaceholderText('e.g. site') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'mysite' } });
      // prompt template is "Run {{target}} task"
      await waitFor(() => expect(screen.getByText(/Run mysite task/)).toBeTruthy());
    });

    it('shows char count in prompt panel', async () => {
      await openDrawer();
      expect(screen.getByText(/chars/)).toBeTruthy();
    });

    it('copies prompt to clipboard when Copy prompt is clicked', async () => {
      await openDrawer();
      fireEvent.click(screen.getByRole('button', { name: /Copy prompt/ }));
      expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>)).toHaveBeenCalled();
    });

    it('shows "Executor disabled" note in drawer when executor is unavailable', async () => {
      setHandler(() =>
        jsonResp({ success: true, data: makeCatalog({ executorAvailable: false }) }),
      );
      await renderPage();
      clickSkillCardRunBtn();
      await waitFor(() => expect(screen.getByLabelText('Close drawer')).toBeTruthy());
      expect(screen.getByText(/Executor disabled/)).toBeTruthy();
    });

    it('drawer Run button is disabled when executor unavailable', async () => {
      setHandler(() =>
        jsonResp({ success: true, data: makeCatalog({ executorAvailable: false }) }),
      );
      await renderPage();
      clickSkillCardRunBtn();
      await waitFor(() => expect(screen.getByLabelText('Close drawer')).toBeTruthy());
      const footerRunBtn = Array.from(document.querySelectorAll('button')).find(
        (b) =>
          (b as HTMLButtonElement).className.includes('hover:opacity-90') &&
          (b as HTMLButtonElement).className.includes('disabled:opacity-40'),
      ) as HTMLButtonElement;
      expect(footerRunBtn?.disabled).toBe(true);
    });

    it('drawer Run button is disabled when required variable is empty', async () => {
      await openDrawer();
      // "target" variable is empty by default
      const footerRunBtn = Array.from(document.querySelectorAll('button')).find(
        (b) =>
          (b as HTMLButtonElement).className.includes('hover:opacity-90') &&
          (b as HTMLButtonElement).className.includes('disabled:opacity-40'),
      ) as HTMLButtonElement;
      expect(footerRunBtn?.disabled).toBe(true);
    });

    it('drawer Run button becomes enabled when required variable is filled', async () => {
      await openDrawer();
      const input = screen.getByPlaceholderText('e.g. site') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'mysite' } });
      await waitFor(() => {
        const footerRunBtn = document.querySelector(
          'aside footer button:last-child',
        ) as HTMLButtonElement;
        expect(footerRunBtn?.disabled).toBe(false);
      });
    });

    it('submits a run request to the API', async () => {
      await openDrawer();
      const input = screen.getByPlaceholderText('e.g. site') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'mysite' } });
      await act(async () => {
        clickDrawerRunBtn();
        await Promise.resolve();
      });
      await waitFor(() => {
        const calls = (global.fetch as ReturnType<typeof vi.fn>).mock.calls as [string, ...unknown[]][];
        expect(calls.some((c) => c[0] === '/api/admin/agentic-os/run')).toBe(true);
      });
    });

    it('shows error panel when run POST returns success:false', async () => {
      setHandler((url) => {
        if (url === '/api/admin/agentic-os/run') {
          return jsonResp({ success: false, message: 'Executor busy' }, false);
        }
        return defaultHandler(url);
      });
      await openDrawer();
      const input = screen.getByPlaceholderText('e.g. site') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'mysite' } });
      await act(async () => {
        clickDrawerRunBtn();
        await Promise.resolve();
      });
      await waitFor(() => expect(screen.getAllByText('Error').length).toBeGreaterThan(0));
    });

    it('shows 503 user-friendly message', async () => {
      setHandler((url) => {
        if (url === '/api/admin/agentic-os/run') {
          return { ok: false, status: 503, json: async () => ({ success: false }) };
        }
        return defaultHandler(url);
      });
      await openDrawer();
      const input = screen.getByPlaceholderText('e.g. site') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'mysite' } });
      await act(async () => {
        clickDrawerRunBtn();
        await Promise.resolve();
      });
      await waitFor(() =>
        expect(screen.getByText(/Executor disabled on this host/)).toBeTruthy(),
      );
    });
  });

  describe('helper functions (indirect via render)', () => {
    it('formatDuration renders ms for sub-second runs', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({
            recentRuns: [
              {
                id: 30,
                skillId: 'skill-alpha',
                status: 'succeeded' as const,
                exitCode: 0,
                durationMs: 500,
                errorMessage: null,
                createdAt: '2026-01-01T10:00:00Z',
                completedAt: '2026-01-01T10:00:00.5Z',
              },
            ],
          }),
        }),
      );
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getByText('500ms')).toBeTruthy();
    });

    it('formatDuration renders minutes for long runs', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({
            recentRuns: [
              {
                id: 31,
                skillId: 'skill-alpha',
                status: 'succeeded' as const,
                exitCode: 0,
                durationMs: 125000, // 2m 5s
                errorMessage: null,
                createdAt: '2026-01-01T10:00:00Z',
                completedAt: '2026-01-01T10:02:05Z',
              },
            ],
          }),
        }),
      );
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getByText('2m 5s')).toBeTruthy();
    });

    it('statusBadge renders all status variants in history', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: makeCatalog({
            recentRuns: [
              { id: 40, skillId: 'skill-alpha', status: 'pending' as const, exitCode: null, durationMs: null, errorMessage: null, createdAt: '2026-01-01T10:00:00Z', completedAt: null },
              { id: 41, skillId: 'skill-alpha', status: 'running' as const, exitCode: null, durationMs: null, errorMessage: null, createdAt: '2026-01-01T10:00:00Z', completedAt: null },
              { id: 42, skillId: 'skill-alpha', status: 'cancelled' as const, exitCode: null, durationMs: null, errorMessage: null, createdAt: '2026-01-01T10:00:00Z', completedAt: null },
              { id: 43, skillId: 'skill-alpha', status: 'unavailable' as const, exitCode: null, durationMs: null, errorMessage: null, createdAt: '2026-01-01T10:00:00Z', completedAt: null },
            ],
          }),
        }),
      );
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: /Run history/ }));
      expect(screen.getAllByText('pending').length).toBeGreaterThan(0);
      expect(screen.getAllByText('running').length).toBeGreaterThan(0);
      expect(screen.getByText('cancelled')).toBeTruthy();
      expect(screen.getByText('unavailable')).toBeTruthy();
    });

    it('triggerBadge renders cloud text for cloud-triggered skill', async () => {
      await renderPage();
      // "cloud" appears at least in the trigger badge span for Gamma Skill
      expect(screen.getAllByText('cloud').length).toBeGreaterThan(0);
    });

    it('triggerBadge renders scheduled text', async () => {
      await renderPage();
      expect(screen.getAllByText('scheduled').length).toBeGreaterThan(0);
    });

    it('triggerBadge renders on-demand text', async () => {
      await renderPage();
      expect(screen.getAllByText('on-demand').length).toBeGreaterThan(0);
    });
  });

  describe('run started callback', () => {
    it('adds optimistic running badge after successful run launch', async () => {
      // EventSource stays open (no done event) — run stays in "running" state.
      await renderPage();
      clickSkillCardRunBtn();
      await waitFor(() => expect(screen.getByLabelText('Close drawer')).toBeTruthy());
      const input = screen.getByPlaceholderText('e.g. site') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'mysite' } });
      await act(async () => {
        clickDrawerRunBtn();
        await Promise.resolve();
      });
      // The drawer shows a live-output section with the "running" status badge
      await waitFor(() => {
        expect(screen.getAllByText('running').length).toBeGreaterThan(0);
      });
    });
  });

  describe('empty catalog state', () => {
    it('shows empty state panel when no skills match current filter', async () => {
      setHandler(() =>
        jsonResp({
          success: true,
          data: {
            ...makeCatalog({ skills: [] }),
            domains: [],
          },
        }),
      );
      await renderPage();
      expect(screen.getByText('No skills match this filter')).toBeTruthy();
    });
  });
});
