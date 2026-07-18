// @vitest-environment jsdom
/**
 * Unit tests for `app/admin/agentic-os/page.tsx`.
 *
 * Coverage targets:
 *  - Pure helper functions: renderPromptTemplate, formatDate, formatDuration,
 *    statusBadge, triggerBadge (exercised through rendered output)
 *  - AgenticOsPage (default export): loading, error, catalog render,
 *    filter bar, domain grouping, rules collapsible, refresh, RunDrawer open/close
 *  - SkillCard: on-demand / scheduled / cloud variants, appliesRules chips,
 *    manualRunPath code tag, estimatedRuntime + cronExpression badges
 *  - RunDrawer: variable inputs (text, url, textarea, select), copy prompt,
 *    Run button disabled/enabled states, fetch success → SSE stream,
 *    fetch error paths (non-ok, 503, thrown exception)
 *  - RunHistory: empty state, filled table rows, compact mode
 *
 * Mocks: global fetch, EventSource, navigator.clipboard, next/navigation
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/admin/agentic-os',
  useSearchParams: () => new URLSearchParams(),
}));

// ─── Types ────────────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status: number; json: () => Promise<unknown> };

// ─── Fetch stub ───────────────────────────────────────────────────────────────

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── EventSource stub ─────────────────────────────────────────────────────────

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: Record<string, Array<(ev: MessageEvent) => void>> = {};

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, handler: (ev: MessageEvent) => void) {
    this.listeners[type] = this.listeners[type] ?? [];
    this.listeners[type].push(handler);
  }

  emit(type: string, data: string) {
    const ev = new MessageEvent(type, { data });
    if (type === 'message' && this.onmessage) {
      this.onmessage(ev);
    }
    (this.listeners[type] ?? []).forEach((h) => h(ev));
  }

  close() {}
}

// ─── Catalog factories ────────────────────────────────────────────────────────

function makeSkill(
  overrides: Partial<{
    id: string;
    domain: string;
    name: string;
    description: string;
    icon: string;
    trigger: 'on-demand' | 'scheduled' | 'cloud';
    estimatedRuntime: string;
    appliesRules: string[];
    cronExpression: string;
    manualRunPath: string;
    promptTemplate: string;
    variables: unknown[];
    source: unknown;
  }> = {},
) {
  return {
    id: 'skill-id',
    domain: 'dev',
    name: 'Test Skill',
    description: 'A test skill',
    icon: 'build',
    trigger: 'on-demand' as const,
    ...overrides,
  };
}

function makeRun(
  overrides: Partial<{
    id: number;
    skillId: string;
    status: string;
    exitCode: number | null;
    durationMs: number | null;
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  }> = {},
) {
  return {
    id: 1,
    skillId: 'skill-id',
    status: 'succeeded',
    exitCode: 0,
    durationMs: 1500,
    errorMessage: null,
    createdAt: '2025-01-15T12:00:00Z',
    completedAt: '2025-01-15T12:00:01Z',
    ...overrides,
  };
}

function makeCatalog(
  overrides: Partial<{
    skills: ReturnType<typeof makeSkill>[];
    domains: string[];
    domainLabels: Record<string, string>;
    rules: { id: string; title: string; body: string }[];
    recentRuns: ReturnType<typeof makeRun>[];
    counts: Record<string, number>;
    executorAvailable: boolean;
    executorHostHint: string | null;
  }> = {},
) {
  return {
    skills: [makeSkill()],
    domains: ['dev'],
    domainLabels: { dev: 'Development' },
    rules: [],
    recentRuns: [],
    counts: { succeeded: 5, failed: 1 },
    executorAvailable: true,
    executorHostHint: null,
    ...overrides,
  };
}

function defaultCatalogFetch(_url: string): FetchResp {
  return makeRes({ success: true, data: makeCatalog() });
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

beforeEach(() => {
  MockEventSource.instances = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultCatalogFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('EventSource', MockEventSource);
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import AgenticOsPage from '@/app/admin/agentic-os/page';

function renderPage() {
  return render(React.createElement(AgenticOsPage));
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('AgenticOsPage — loading state', () => {
  it('shows spinner while fetch is pending', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('autorenew');
    expect(container.textContent).toContain('Loading Agentic OS');
  });
});

// ─── Error state ──────────────────────────────────────────────────────────────

describe('AgenticOsPage — error state', () => {
  it('shows error panel when API returns success:false', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false, message: 'Catalog unavailable' }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn't load Agentic OS");
      expect(container.textContent).toContain('Catalog unavailable');
    });
  });

  it('shows error panel with fallback message when no message field', async () => {
    fetchMock.mockResolvedValue(makeRes({ success: false }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn't load Agentic OS");
    });
  });

  it('shows error panel when fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('Network down'));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn't load Agentic OS");
      expect(container.textContent).toContain('Network down');
    });
  });
});

// ─── Catalog render ───────────────────────────────────────────────────────────

describe('AgenticOsPage — catalog renders', () => {
  it('renders the Agentic OS heading after load', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Agentic OS');
    });
  });

  it('shows "Local executor available" badge when executorAvailable is true', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Local executor available');
    });
  });

  it('shows "Catalog mode" badge when executorAvailable is false', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({ executorAvailable: false, executorHostHint: null }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Catalog mode');
    });
  });

  it('shows executorHostHint when executor not available and hint provided', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          executorAvailable: false,
          executorHostHint: 'Run on dev-machine.local',
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Run on dev-machine.local');
    });
  });

  it('renders stat strip with skill counts', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Skills');
      expect(container.textContent).toContain('On-demand');
      expect(container.textContent).toContain('Scheduled');
      expect(container.textContent).toContain('Succeeded');
      expect(container.textContent).toContain('Failed');
    });
  });

  it('renders domain section heading with label', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Development');
    });
  });

  it('renders skill card name and description', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Test Skill');
      expect(container.textContent).toContain('A test skill');
    });
  });

  it('renders domain section with correct skill count label (plural)', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill(), makeSkill({ id: 'skill-2', name: 'Skill Two' })],
          domains: ['dev'],
          domainLabels: { dev: 'Development' },
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2 skills');
    });
  });

  it('renders domain section with singular skill label', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 skill');
    });
  });
});

// ─── Refresh button ───────────────────────────────────────────────────────────

describe('AgenticOsPage — refresh button', () => {
  it('Refresh button re-fetches catalog', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));
    const callsBefore = fetchMock.mock.calls.length;
    const refreshBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Refresh'),
    ) as HTMLButtonElement;
    fireEvent.click(refreshBtn);
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});

// ─── Rules collapsible ────────────────────────────────────────────────────────

describe('AgenticOsPage — rules panel', () => {
  it('Rules button toggles the rules panel', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          rules: [{ id: 'rule-1', title: 'No cross-tenant queries', body: 'Always scope by clientId.' }],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));

    // Rules panel is initially hidden
    expect(container.textContent).not.toContain('Cross-cutting rules');

    const rulesBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Rules'),
    ) as HTMLButtonElement;
    fireEvent.click(rulesBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Cross-cutting rules');
      expect(container.textContent).toContain('No cross-tenant queries');
      expect(container.textContent).toContain('Always scope by clientId.');
    });

    // Clicking again collapses it
    fireEvent.click(rulesBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Cross-cutting rules');
    });
  });
});

// ─── Filter bar ───────────────────────────────────────────────────────────────

describe('AgenticOsPage — filter bar', () => {
  it('renders all four filter buttons', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));
    expect(container.textContent).toContain('All domains');
    expect(container.textContent).toContain('On-demand only');
    expect(container.textContent).toContain('Scheduled');
    expect(container.textContent).toContain('Run history');
  });

  it('on-demand filter shows only on-demand skills', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [
            makeSkill({ id: 'od', name: 'OnDemandSkill', trigger: 'on-demand' }),
            makeSkill({ id: 'sc', name: 'ScheduledSkill', trigger: 'scheduled', domain: 'dev' }),
          ],
          domains: ['dev'],
          domainLabels: { dev: 'Dev' },
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('OnDemandSkill'));

    const odBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'On-demand only' || b.textContent?.includes('On-demand only'),
    ) as HTMLButtonElement;
    fireEvent.click(odBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('OnDemandSkill');
      expect(container.textContent).not.toContain('ScheduledSkill');
    });
  });

  it('scheduled filter shows only scheduled skills', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [
            makeSkill({ id: 'od', name: 'OnDemandSkill', trigger: 'on-demand' }),
            makeSkill({ id: 'sc', name: 'ScheduledSkill', trigger: 'scheduled', domain: 'dev' }),
          ],
          domains: ['dev'],
          domainLabels: { dev: 'Dev' },
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('OnDemandSkill'));

    const scBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Scheduled' || b.textContent?.includes('Scheduled'),
    ) as HTMLButtonElement;
    fireEvent.click(scBtn);

    await waitFor(() => {
      expect(container.textContent).not.toContain('OnDemandSkill');
      expect(container.textContent).toContain('ScheduledSkill');
    });
  });

  it('shows empty state when no skills match filter', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ trigger: 'on-demand' })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));

    const scBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Scheduled'),
    ) as HTMLButtonElement;
    fireEvent.click(scBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('No skills match this filter');
    });
  });

  it('Run history filter shows the RunHistory component', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));

    const histBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run history'),
    ) as HTMLButtonElement;
    fireEvent.click(histBtn);

    await waitFor(() => {
      // RunHistory empty state text when no runs
      expect(container.textContent).toContain('No runs yet');
    });
  });

  it('Run history filter with runs shows history table', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          recentRuns: [makeRun({ status: 'succeeded', durationMs: 1500 })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));

    const histBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run history'),
    ) as HTMLButtonElement;
    fireEvent.click(histBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('Run history');
      expect(container.textContent).toContain('succeeded');
    });
  });
});

// ─── SkillCard variants ───────────────────────────────────────────────────────

describe('SkillCard — trigger variants', () => {
  it('renders Run button for on-demand skill', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    const runBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Run' || b.textContent?.includes('Run'),
    );
    expect(runBtn).toBeTruthy();
  });

  it('renders "Cron-managed" text for scheduled skill', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [
            makeSkill({
              trigger: 'scheduled',
              cronExpression: '0 9 * * 1',
              estimatedRuntime: '2m',
            }),
          ],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Cron-managed');
    });
  });

  it('renders "Cloud-triggered" text for cloud skill', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ trigger: 'cloud' })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Cloud-triggered');
    });
  });

  it('renders estimatedRuntime badge', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ estimatedRuntime: '~3 min' })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('~3 min');
    });
  });

  it('renders cronExpression badge for scheduled skill', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ trigger: 'scheduled', cronExpression: '0 6 * * *' })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('0 6 * * *');
    });
  });

  it('renders manualRunPath code tag', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ manualRunPath: 'scripts/run-skill.sh' })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('scripts/run-skill.sh');
    });
  });

  it('renders appliesRules chips with rule title from rulesById', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ appliesRules: ['rule-1'] })],
          rules: [{ id: 'rule-1', title: 'Tenancy Guard', body: 'Must scope by tenant.' }],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Tenancy Guard');
    });
  });

  it('falls back to rule id when rule not found in rulesById', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ appliesRules: ['unknown-rule'] })],
          rules: [],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('unknown-rule');
    });
  });
});

// ─── RunHistory component ─────────────────────────────────────────────────────

describe('RunHistory — empty state', () => {
  it('shows empty state copy when no runs in history filter', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));
    const histBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run history'),
    ) as HTMLButtonElement;
    fireEvent.click(histBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('No runs yet');
      expect(container.textContent).toContain('Fire a skill from the catalog above');
    });
  });
});

describe('RunHistory — filled table', () => {
  it('renders run rows with skill name, status badge, duration, date, and error', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ id: 'skill-id', name: 'My Skill' })],
          recentRuns: [
            makeRun({
              skillId: 'skill-id',
              status: 'succeeded',
              durationMs: 2500,
              errorMessage: null,
              createdAt: '2025-06-01T10:00:00Z',
            }),
          ],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));

    const histBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run history'),
    ) as HTMLButtonElement;
    fireEvent.click(histBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('My Skill');
      expect(container.textContent).toContain('succeeded');
      expect(container.textContent).toContain('2.5s');
    });
  });

  it('renders failed run with error message', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          recentRuns: [
            makeRun({
              status: 'failed',
              exitCode: 1,
              durationMs: 500,
              errorMessage: 'Process exited with code 1',
            }),
          ],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));

    const histBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run history'),
    ) as HTMLButtonElement;
    fireEvent.click(histBtn);

    await waitFor(() => {
      expect(container.textContent).toContain('failed');
      expect(container.textContent).toContain('Process exited with code 1');
    });
  });

  it('renders run with null durationMs as --', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          recentRuns: [makeRun({ durationMs: null })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));
    const histBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run history'),
    ) as HTMLButtonElement;
    fireEvent.click(histBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('--');
    });
  });

  it('compact RunHistory at bottom of all-domains view shows "Recent runs"', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          recentRuns: [makeRun({ status: 'running', durationMs: null })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Recent runs');
    });
  });
});

// ─── formatDuration coverage ──────────────────────────────────────────────────

describe('formatDuration — via RunHistory rows', () => {
  async function renderWithDurationMs(durationMs: number | null) {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          recentRuns: [makeRun({ durationMs })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));
    const histBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run history'),
    ) as HTMLButtonElement;
    fireEvent.click(histBtn);
    await waitFor(() => expect(container.textContent).toContain('succeeded'));
    return container;
  }

  it('renders ms for sub-second durations', async () => {
    const container = await renderWithDurationMs(500);
    expect(container.textContent).toContain('500ms');
  });

  it('renders seconds for 1–59 second durations', async () => {
    const container = await renderWithDurationMs(12500);
    expect(container.textContent).toContain('12.5s');
  });

  it('renders minutes+seconds for durations >= 60s', async () => {
    const container = await renderWithDurationMs(125000);
    expect(container.textContent).toContain('2m');
  });

  it('renders -- for null duration', async () => {
    const container = await renderWithDurationMs(null);
    expect(container.textContent).toContain('--');
  });
});

// ─── formatDate coverage ──────────────────────────────────────────────────────

describe('formatDate — via RunHistory rows', () => {
  it('renders formatted date for valid ISO string', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          recentRuns: [makeRun({ createdAt: '2025-03-15T14:30:00Z' })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Agentic OS'));
    const histBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Run history'),
    ) as HTMLButtonElement;
    fireEvent.click(histBtn);
    await waitFor(() => {
      // Should contain some form of "Mar" or the month
      expect(container.textContent).toMatch(/Mar|Feb|Apr/);
    });
  });
});

// ─── statusBadge coverage (via RunHistory status column) ──────────────────────

describe('statusBadge — all status values via RunHistory', () => {
  const statuses = ['pending', 'running', 'succeeded', 'failed', 'cancelled', 'unavailable'] as const;

  for (const status of statuses) {
    it(`renders "${status}" status badge`, async () => {
      fetchMock.mockResolvedValue(
        makeRes({
          success: true,
          data: makeCatalog({
            recentRuns: [makeRun({ status })],
          }),
        }),
      );
      const { container } = renderPage();
      await waitFor(() => expect(container.textContent).toContain('Agentic OS'));
      const histBtn = Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Run history'),
      ) as HTMLButtonElement;
      fireEvent.click(histBtn);
      await waitFor(() => {
        expect(container.textContent).toContain(status);
      });
    });
  }
});

// ─── triggerBadge coverage ────────────────────────────────────────────────────

describe('triggerBadge — all trigger types via SkillCard', () => {
  it('renders on-demand trigger badge', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('on-demand');
    });
  });

  it('renders scheduled trigger badge', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({ skills: [makeSkill({ trigger: 'scheduled' })] }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('scheduled');
    });
  });

  it('renders cloud trigger badge', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({ skills: [makeSkill({ trigger: 'cloud' })] }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('cloud');
    });
  });
});

// ─── Helper: find the on-demand Run button inside a SkillCard ────────────────
// The SkillCard button renders material-icon text "play_arrow" + "Run".
// We find it by looking for buttons inside the skill-card grid area (not footer).

function findCardRunButton(container: HTMLElement): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) =>
      b.textContent?.includes('Run') &&
      b.className.includes('bg-primary') &&
      // Not in the <footer> of the drawer
      !b.closest('footer') &&
      // Not the drawer's footer run button (disabled or not)
      !b.closest('aside'),
  ) as HTMLButtonElement | undefined;
}

// ─── RunDrawer — open/close ───────────────────────────────────────────────────

describe('RunDrawer — open and close', () => {
  it('opens drawer when Run button on skill card is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const btn = findCardRunButton(container);
      expect(btn).toBeTruthy();
    });
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => {
      // Drawer is open when the <aside> panel is in the DOM
      expect(container.querySelector('aside')).toBeTruthy();
      // The close button has aria-label="Close drawer"
      expect(container.querySelector('button[aria-label="Close drawer"]')).toBeTruthy();
    });
  });

  it('closes drawer when backdrop is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    // Click the backdrop overlay div
    const backdrop = container.querySelector('.fixed.inset-0.z-40 > .absolute') as HTMLDivElement;
    fireEvent.click(backdrop);
    await waitFor(() => {
      expect(container.querySelector('aside')).toBeNull();
    });
  });

  it('closes drawer when Close button is clicked', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    const closeBtn = container.querySelector('button[aria-label="Close drawer"]') as HTMLButtonElement;
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.querySelector('aside')).toBeNull();
    });
  });
});

// ─── RunDrawer — no variables ─────────────────────────────────────────────────

describe('RunDrawer — no variables', () => {
  it('shows "no inputs" message when skill has no variables', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => {
      expect(container.textContent).toContain('This skill takes no inputs.');
    });
  });

  it('renders "(no prompt template)" when skill has no promptTemplate', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => {
      expect(container.textContent).toContain('(no prompt template)');
    });
  });
});

// ─── RunDrawer — variable inputs ──────────────────────────────────────────────

describe('RunDrawer — variable inputs', () => {
  function catalogWithVariables(
    variables: {
      key: string;
      label: string;
      required: boolean;
      placeholder?: string;
      helpText?: string;
      type?: 'text' | 'textarea' | 'url' | 'select';
      options?: string[];
    }[],
    promptTemplate = 'Hello {{name}}',
  ) {
    return makeCatalog({
      skills: [
        makeSkill({
          variables,
          promptTemplate,
        }),
      ],
    });
  }

  async function openDrawer(container: HTMLElement) {
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());
  }

  it('renders text input for default type', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: catalogWithVariables([{ key: 'name', label: 'Name', required: true }]),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await openDrawer(container);
    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    fireEvent.change(input, { target: { value: 'Alice' } });
    expect(input.value).toBe('Alice');
  });

  it('renders url input for url type', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: catalogWithVariables([{ key: 'url', label: 'URL', required: false, type: 'url' }]),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await openDrawer(container);
    const input = container.querySelector('input[type="url"]') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it('renders textarea for textarea type', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: catalogWithVariables([
          { key: 'body', label: 'Body', required: false, type: 'textarea', helpText: 'Markdown supported' },
        ]),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await openDrawer(container);
    expect(container.querySelector('textarea')).toBeTruthy();
    expect(container.textContent).toContain('Markdown supported');
  });

  it('renders select for select type with options', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: catalogWithVariables([
          {
            key: 'env',
            label: 'Environment',
            required: true,
            type: 'select',
            options: ['staging', 'production'],
            placeholder: 'Pick one',
          },
        ]),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await openDrawer(container);
    const select = container.querySelector('select') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(container.textContent).toContain('staging');
    expect(container.textContent).toContain('production');
    fireEvent.change(select, { target: { value: 'staging' } });
  });

  it('rendered prompt template updates as variables are filled', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: catalogWithVariables(
          [{ key: 'name', label: 'Name', required: true }],
          'Hello {{name}}!',
        ),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await openDrawer(container);

    // Before filling: template placeholder remains
    expect(container.textContent).toContain('Hello {{name}}!');

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Bob' } });

    await waitFor(() => {
      expect(container.textContent).toContain('Hello Bob!');
    });
  });

  it('shows required asterisk on required variable labels', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: catalogWithVariables([{ key: 'x', label: 'MyField', required: true }]),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await openDrawer(container);
    expect(container.textContent).toContain('MyField');
    const star = container.querySelector('.text-red-500');
    expect(star).toBeTruthy();
  });

  it('Run button disabled when required variable is empty', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: catalogWithVariables([{ key: 'name', label: 'Name', required: true }]),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await openDrawer(container);

    const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
      b.textContent?.includes('Run'),
    ) as HTMLButtonElement;
    expect(footerRunBtn.disabled).toBe(true);
  });

  it('Run button enabled once required variable filled', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: catalogWithVariables([{ key: 'name', label: 'Name', required: true }]),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Test Skill'));
    await openDrawer(container);

    const input = container.querySelector('input[type="text"]') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Bob' } });

    await waitFor(() => {
      const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
        b.textContent?.includes('Run'),
      ) as HTMLButtonElement;
      expect(footerRunBtn.disabled).toBe(false);
    });
  });
});

// ─── RunDrawer — executor disabled ───────────────────────────────────────────

describe('RunDrawer — executor disabled', () => {
  it('shows "Executor disabled" notice in footer when executorAvailable is false', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({ executorAvailable: false }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => {
      expect(container.textContent).toContain('Executor disabled');
    });
  });
});

// ─── RunDrawer — Copy prompt ──────────────────────────────────────────────────

describe('RunDrawer — copy prompt', () => {
  it('Copy prompt button writes rendered prompt to clipboard', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ promptTemplate: 'Do the thing.' })],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    const copyBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
      b.textContent?.includes('Copy prompt'),
    ) as HTMLButtonElement;
    fireEvent.click(copyBtn);

    await waitFor(() => {
      expect((navigator.clipboard.writeText as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(
        'Do the thing.',
      );
    });
  });

  it('Copy prompt button shows "Copied" text after click', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [makeSkill({ promptTemplate: 'Hello!' })],
        }),
      }),
    );
    const { container } = renderPage();
    // Use real timers for the waitFor, then stub
    vi.useRealTimers();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.click(findCardRunButton(container)!);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    const copyBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
      b.textContent?.includes('Copy prompt'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(copyBtn);
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Copied');
    });

    vi.useRealTimers();
  });
});

// ─── RunDrawer — Run flow: success + SSE ─────────────────────────────────────

describe('RunDrawer — Run button: success path', () => {
  it('hitting Run posts to /api/admin/agentic-os/run and opens SSE stream', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/agentic-os') {
        return makeRes({ success: true, data: makeCatalog() });
      }
      if (url === '/api/admin/agentic-os/run') {
        return makeRes({ success: true, data: { runId: 42 } });
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
      b.textContent?.includes('Run'),
    ) as HTMLButtonElement;
    await act(async () => {
      fireEvent.click(footerRunBtn);
    });

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((c) => c[0] === '/api/admin/agentic-os/run')).toBe(true);
    });

    // SSE stream should have been subscribed to
    await waitFor(() => {
      expect(MockEventSource.instances.length).toBeGreaterThan(0);
    });
  });

  it('SSE message events append to live output', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/agentic-os') {
        return makeRes({ success: true, data: makeCatalog() });
      }
      if (url === '/api/admin/agentic-os/run') {
        return makeRes({ success: true, data: { runId: 7 } });
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    await act(async () => {
      const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
        b.textContent?.includes('Run'),
      ) as HTMLButtonElement;
      fireEvent.click(footerRunBtn);
    });

    await waitFor(() => MockEventSource.instances.length > 0);

    await act(async () => {
      MockEventSource.instances[0].emit('message', 'Output line 1\n');
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Output line 1');
    });
  });

  it('SSE done event sets final status', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/agentic-os') {
        return makeRes({ success: true, data: makeCatalog() });
      }
      if (url === '/api/admin/agentic-os/run') {
        return makeRes({ success: true, data: { runId: 8 } });
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    await act(async () => {
      const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
        b.textContent?.includes('Run'),
      ) as HTMLButtonElement;
      fireEvent.click(footerRunBtn);
    });

    await waitFor(() => MockEventSource.instances.length > 0);

    await act(async () => {
      MockEventSource.instances[0].emit('done', JSON.stringify({ status: 'succeeded' }));
    });

    await waitFor(() => {
      // Run button should no longer say "Running…" (submitting = false)
      const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
        b.textContent?.includes('Run'),
      ) as HTMLButtonElement;
      expect(footerRunBtn.textContent).not.toContain('Running…');
    });
  });

  it('SSE error event sets status to failed', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/agentic-os') {
        return makeRes({ success: true, data: makeCatalog() });
      }
      if (url === '/api/admin/agentic-os/run') {
        return makeRes({ success: true, data: { runId: 9 } });
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    await act(async () => {
      const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
        b.textContent?.includes('Run'),
      ) as HTMLButtonElement;
      fireEvent.click(footerRunBtn);
    });

    await waitFor(() => MockEventSource.instances.length > 0);

    await act(async () => {
      MockEventSource.instances[0].onerror?.();
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Live stream disconnected');
    });
  });
});

// ─── RunDrawer — Run flow: error paths ───────────────────────────────────────

describe('RunDrawer — Run button: error paths', () => {
  it('shows error message when API returns success:false', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/agentic-os') {
        return makeRes({ success: true, data: makeCatalog() });
      }
      if (url === '/api/admin/agentic-os/run') {
        return makeRes({ success: false, message: 'Quota exceeded' }, false, 429);
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    await act(async () => {
      const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
        b.textContent?.includes('Run'),
      ) as HTMLButtonElement;
      fireEvent.click(footerRunBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Quota exceeded');
    });
  });

  it('shows 503 executor-disabled message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/agentic-os') {
        return makeRes({ success: true, data: makeCatalog() });
      }
      if (url === '/api/admin/agentic-os/run') {
        return makeRes({ success: false }, false, 503);
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    await act(async () => {
      const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
        b.textContent?.includes('Run'),
      ) as HTMLButtonElement;
      fireEvent.click(footerRunBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Executor disabled on this host');
    });
  });

  it('shows error message when fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/agentic-os') {
        return makeRes({ success: true, data: makeCatalog() });
      }
      if (url === '/api/admin/agentic-os/run') {
        throw new Error('Network failure');
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    await act(async () => {
      const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
        b.textContent?.includes('Run'),
      ) as HTMLButtonElement;
      fireEvent.click(footerRunBtn);
    });

    await waitFor(() => {
      expect(container.textContent).toContain('Network failure');
    });
  });
});

// ─── OnRunStarted optimistic update ──────────────────────────────────────────

describe('AgenticOsPage — onRunStarted optimistic update', () => {
  it('adds optimistic run to recentRuns when run starts', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/admin/agentic-os') {
        return makeRes({ success: true, data: makeCatalog() });
      }
      if (url === '/api/admin/agentic-os/run') {
        return makeRes({ success: true, data: { runId: 100 } });
      }
      return makeRes({ success: true });
    });

    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    await act(async () => {
      const footerRunBtn = Array.from(container.querySelectorAll('footer button')).find((b) =>
        b.textContent?.includes('Run'),
      ) as HTMLButtonElement;
      fireEvent.click(footerRunBtn);
    });

    // After run starts, the compact RunHistory at page bottom should show 'running'
    await waitFor(() => {
      expect(container.textContent).toContain('running');
    });
  });
});

// ─── renderPromptTemplate — direct logic via drawer ──────────────────────────

describe('renderPromptTemplate — via RunDrawer rendered prompt', () => {
  it('substitutes filled variable values', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [
            makeSkill({
              promptTemplate: 'Hello {{name}}, you are {{role}}.',
              variables: [
                { key: 'name', label: 'Name', required: false },
                { key: 'role', label: 'Role', required: false },
              ],
            }),
          ],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    const inputs = container.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[0], { target: { value: 'Alice' } });
    fireEvent.change(inputs[1], { target: { value: 'admin' } });

    await waitFor(() => {
      expect(container.textContent).toContain('Hello Alice, you are admin.');
    });
  });

  it('leaves placeholder intact for empty optional variable', async () => {
    fetchMock.mockResolvedValue(
      makeRes({
        success: true,
        data: makeCatalog({
          skills: [
            makeSkill({
              promptTemplate: 'Site: {{site_url}}',
              variables: [{ key: 'site_url', label: 'Site URL', required: false, type: 'url' }],
            }),
          ],
        }),
      }),
    );
    const { container } = renderPage();
    await waitFor(() => expect(findCardRunButton(container)).toBeTruthy());
    fireEvent.click(findCardRunButton(container)!);
    await waitFor(() => expect(container.querySelector('aside')).toBeTruthy());

    // No input filled — placeholder should remain in rendered template
    await waitFor(() => {
      expect(container.textContent).toContain('{{site_url}}');
    });
  });
});
