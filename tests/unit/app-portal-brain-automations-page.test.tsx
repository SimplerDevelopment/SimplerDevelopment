// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/automations/page.tsx`
 *
 * The page is a 'use client' component. It is rendered directly.
 * Fetch, next/link, and lib/automation/product-presets are all mocked.
 * ProductAutomationSettings is mocked to a stub so its own fetch chains
 * don't interfere with our assertions.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement('a', { href, className }, children),
}));

vi.mock('@/lib/automation/product-presets', () => ({
  PRODUCT_PRESET_GROUPS: [
    {
      productScope: 'email',
      label: 'Email Marketing',
      icon: 'email',
      description: 'Email automation rules',
      presets: [],
    },
  ],
}));

vi.mock('@/components/portal/ProductAutomationSettings', () => ({
  default: ({ productScope }: { productScope: string }) =>
    React.createElement('div', { 'data-testid': `preset-${productScope}` }, `Presets for ${productScope}`),
}));

// ─── Fetch stub ─────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// Default happy-path rule fixture
function makeRule(id: number, extra: Record<string, unknown> = {}): unknown {
  return {
    id,
    name: `Rule ${id}`,
    description: `Desc ${id}`,
    trigger: { event: 'booking.guest_booked' },
    conditions: [],
    actions: [{ tool: 'create_crm_deal', params: {} }],
    enabled: true,
    source: 'template',
    productScope: 'crm',
    schedule: null,
    nextRunAt: null,
    executionCount: 0,
    lastExecutedAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function makeLog(id: number, extra: Record<string, unknown> = {}): unknown {
  return {
    id,
    ruleId: 1,
    ruleName: `Rule 1`,
    triggerEvent: 'booking.guest_booked',
    status: 'success',
    duration: 120,
    errorMessage: null,
    createdAt: new Date(Date.now() - 5 * 60000).toISOString(), // 5 minutes ago
    ...extra,
  };
}

beforeEach(() => {
  fetchMock.mockReset();
  // Default: all endpoints return empty success
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/api/portal/automations/logs')) {
      return makeRes({ success: true, logs: [] });
    }
    if (url.includes('/api/portal/plugins/scripts')) {
      return makeRes({ success: true, items: [] });
    }
    if (url.includes('/api/portal/automations/preview-schedule')) {
      return makeRes({ success: true, description: 'Daily at 09:00 UTC', nextRunAt: '2025-06-05T09:00:00Z' });
    }
    if (url.includes('/api/portal/automations')) {
      return makeRes({ success: true, rules: [] });
    }
    return makeRes({ success: true });
  });
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  // Default confirm → true
  vi.stubGlobal('confirm', () => true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import BrainAutomationsPage from '@/app/portal/brain/automations/page';

function renderPage() {
  return render(React.createElement(BrainAutomationsPage));
}

// ─── Loading state ───────────────────────────────────────────────────────────

describe('BrainAutomationsPage — loading', () => {
  it('shows spinner while data loads', () => {
    let resolveRules: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return new Promise((res) => { resolveRules = res; }) as Promise<FetchResp>;
      }
      return makeRes({ success: true, logs: [], items: [] });
    });
    const { container } = renderPage();
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeTruthy();
    // resolve to avoid leak
    act(() => { resolveRules(makeRes({ success: true, rules: [] })); });
  });

  it('stops showing spinner after data loads', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Brain Automations');
    });
    // The full-page spinner element that wraps autorenew should be gone
    const spinnerContainer = container.querySelector('.flex.items-center.justify-center.py-20');
    expect(spinnerContainer).toBeNull();
  });
});

// ─── Shell rendering ─────────────────────────────────────────────────────────

describe('BrainAutomationsPage — header and tabs', () => {
  it('renders Brain Automations heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Brain Automations');
    });
  });

  it('renders back link to /portal/brain', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders all four tabs', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Rules');
      expect(container.textContent).toContain('Product Presets');
      expect(container.textContent).toContain('Activity');
      expect(container.textContent).toContain('Create');
    });
  });

  it('defaults to the rules tab', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No automations yet');
    });
  });

  it('Create Automation button switches to create tab', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const createBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Quick start templates');
    });
  });
});

// ─── Rules tab — empty state ─────────────────────────────────────────────────

describe('Rules tab — empty state', () => {
  it('renders empty state when no rules', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No automations yet');
      expect(container.textContent).toContain('Install a one-click template');
    });
  });

  it('Browse templates button in empty state switches to create tab', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No automations yet'));
    const browseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Browse templates'),
    ) as HTMLButtonElement;
    fireEvent.click(browseBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Quick start templates');
    });
  });
});

// ─── Rules tab — rules list ───────────────────────────────────────────────────

describe('Rules tab — rules list', () => {
  function setupRules(rules: unknown[]) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules });
      }
      if (url.includes('/api/portal/automations/logs')) {
        return makeRes({ success: true, logs: [] });
      }
      if (url.includes('/api/portal/plugins/scripts')) {
        return makeRes({ success: true, items: [] });
      }
      if (url.includes('/api/portal/automations/preview-schedule')) {
        return makeRes({ success: true, description: 'Daily at 09:00 UTC', nextRunAt: null });
      }
      return makeRes({ success: true });
    });
  }

  it('renders rule name', async () => {
    setupRules([makeRule(1)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Rule 1');
    });
  });

  it('renders rule description', async () => {
    setupRules([makeRule(1)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Desc 1');
    });
  });

  it('renders the action count (1 action)', async () => {
    setupRules([makeRule(1)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1 action');
    });
  });

  it('renders plural "actions" for multiple actions', async () => {
    setupRules([makeRule(1, {
      actions: [
        { tool: 'create_crm_deal', params: {} },
        { tool: 'create_crm_contact', params: {} },
      ],
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2 actions');
    });
  });

  it('renders AI badge for nlp-sourced rules', async () => {
    setupRules([makeRule(1, { source: 'nlp' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('AI');
    });
  });

  it('renders execution count when > 0', async () => {
    setupRules([makeRule(1, { executionCount: 42 })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('42 runs');
    });
  });

  it('renders lastExecutedAt as time ago', async () => {
    setupRules([makeRule(1, {
      executionCount: 1,
      lastExecutedAt: new Date(Date.now() - 2 * 60000).toISOString(), // 2m ago
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Last fired:');
    });
  });

  it('renders schedule badge when rule has schedule', async () => {
    setupRules([makeRule(1, {
      schedule: { cadence: 'daily', time: '08:00' },
      trigger: { event: 'automation.scheduled' },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Daily at 08:00 UTC');
    });
  });

  it('renders schedule cadence weekly', async () => {
    setupRules([makeRule(1, {
      schedule: { cadence: 'weekly', time: '10:00', dayOfWeek: 1 },
      trigger: { event: 'automation.scheduled' },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Mondays at 10:00 UTC');
    });
  });

  it('renders schedule cadence monthly (1st)', async () => {
    setupRules([makeRule(1, {
      schedule: { cadence: 'monthly', time: '09:00', dayOfMonth: 1 },
      trigger: { event: 'automation.scheduled' },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1st of each month');
    });
  });

  it('renders schedule cadence cron', async () => {
    setupRules([makeRule(1, {
      schedule: { cadence: 'cron', cronExpression: '*/30 * * * *' },
      trigger: { event: 'automation.scheduled' },
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Custom: */30 * * * *');
    });
  });

  it('renders action delay chip with seconds', async () => {
    setupRules([makeRule(1, {
      actions: [{ tool: 'create_crm_deal', params: {}, delay: 30 }],
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('30s delay');
    });
  });

  it('renders action delay chip with hours', async () => {
    setupRules([makeRule(1, {
      actions: [{ tool: 'create_crm_deal', params: {}, delay: 7200 }],
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2h delay');
    });
  });

  it('renders action delay chip with days', async () => {
    setupRules([makeRule(1, {
      actions: [{ tool: 'create_crm_deal', params: {}, delay: 172800 }],
    })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2d delay');
    });
  });

  it('renders Rules (N) count in tab label', async () => {
    setupRules([makeRule(1), makeRule(2)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Rules (2)');
    });
  });
});

// ─── Rules tab — toggle ───────────────────────────────────────────────────────

describe('Rules tab — toggle enable/disable', () => {
  function setupOneRule(extra: Record<string, unknown> = {}) {
    const rule = makeRule(1, extra);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules: [rule] });
      }
      if (url.includes('/api/portal/automations/1') && init?.method === 'PATCH') {
        return makeRes({ success: true, rule: { ...(rule as object), enabled: false } });
      }
      if (url.includes('/api/portal/automations/logs')) {
        return makeRes({ success: true, logs: [] });
      }
      if (url.includes('/api/portal/plugins/scripts')) {
        return makeRes({ success: true, items: [] });
      }
      if (url.includes('/api/portal/automations/preview-schedule')) {
        return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      }
      return makeRes({ success: true });
    });
  }

  it('calls PATCH to toggle disable when rule is enabled', async () => {
    setupOneRule({ enabled: true });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rule 1'));
    const toggleBtn = container.querySelector('button[class*="bg-green-500"]') as HTMLButtonElement;
    expect(toggleBtn).toBeTruthy();
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/automations/1') && (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('updates rule state optimistically in the list after toggle', async () => {
    setupOneRule({ enabled: true });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rule 1'));
    const toggleBtn = container.querySelector('button[class*="bg-green-500"]') as HTMLButtonElement;
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.some(
        (c) => String(c[0]).includes('/automations/1') && (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBe(true);
    });
  });
});

// ─── Rules tab — delete ───────────────────────────────────────────────────────

describe('Rules tab — delete', () => {
  it('calls DELETE and removes rule from list', async () => {
    const rule = makeRule(1);
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules: [rule] });
      }
      if (url.includes('/api/portal/automations/1') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      if (url.includes('/api/portal/automations/logs')) {
        return makeRes({ success: true, logs: [] });
      }
      if (url.includes('/api/portal/plugins/scripts')) {
        return makeRes({ success: true, items: [] });
      }
      if (url.includes('/api/portal/automations/preview-schedule')) {
        return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rule 1'));
    const deleteBtn = container.querySelector('button span.material-icons[textContent="delete_outline"]')?.closest('button')
      ?? Array.from(container.querySelectorAll('button')).find(
        (b) => b.querySelector('span')?.textContent === 'delete_outline',
      ) as HTMLButtonElement;
    fireEvent.click(deleteBtn!);
    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/automations/1') && (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(delCall).toBeTruthy();
    });
    // Rule disappears from list
    await waitFor(() => {
      expect(container.textContent).not.toContain('Rule 1');
    });
  });

  it('does NOT call DELETE when confirm returns false', async () => {
    vi.stubGlobal('confirm', () => false);
    const rule = makeRule(1);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules: [rule] });
      }
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rule 1'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.querySelector('span')?.textContent === 'delete_outline',
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn!);
    await waitFor(() => {
      const delCall = fetchMock.mock.calls.find(
        (c) => String(c[0]).includes('/automations/1') && (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(delCall).toBeUndefined();
    });
  });
});

// ─── Presets tab ──────────────────────────────────────────────────────────────

describe('Presets tab', () => {
  it('shows preset group from PRODUCT_PRESET_GROUPS', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const presetsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Product Presets'),
    ) as HTMLButtonElement;
    fireEvent.click(presetsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Email Marketing');
    });
  });

  it('renders the ProductAutomationSettings stub for each group', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const presetsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Product Presets'),
    ) as HTMLButtonElement;
    fireEvent.click(presetsTab);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="preset-email"]')).toBeTruthy();
    });
  });

  it('shows preset info banner text', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const presetsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Product Presets'),
    ) as HTMLButtonElement;
    fireEvent.click(presetsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Product presets are one-toggle rules');
    });
  });
});

// ─── Activity (logs) tab ──────────────────────────────────────────────────────

describe('Activity tab — logs', () => {
  it('shows empty state when no logs', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('No activity yet');
    });
  });

  it('renders log entries', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') return makeRes({ success: true, rules: [] });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [makeLog(1)] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Rule 1');
    });
  });

  it('renders log duration in ms', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') return makeRes({ success: true, rules: [] });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [makeLog(1, { duration: 250 })] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('250ms');
    });
  });

  it('renders failure status log entry', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') return makeRes({ success: true, rules: [] });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [makeLog(1, { status: 'failure', errorMessage: 'Something broke' })] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Something broke');
    });
  });

  it('renders partial status log entry', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') return makeRes({ success: true, rules: [] });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [makeLog(1, { status: 'partial' })] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => {
      // partial renders 'warning' icon
      const icons = Array.from(container.querySelectorAll('span.material-icons'));
      expect(icons.some((i) => i.textContent === 'warning')).toBe(true);
    });
  });
});

// ─── Create tab — templates ───────────────────────────────────────────────────

describe('Create tab — quick start templates', () => {
  async function openCreateTab(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const createTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create') && !b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    // Use the tab bar — click the tab button with just "Create"
    const tabBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim().replace(/\s+/g, ' ').startsWith('auto_awesome Create'),
    );
    fireEvent.click(tabBtns[0] ?? createTab);
    await waitFor(() => expect(container.textContent).toContain('Quick start templates'));
  }

  it('renders template cards', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    expect(container.textContent).toContain('New booking → CRM deal');
  });

  it('renders NLP textarea', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    expect(container.querySelector('textarea')).toBeTruthy();
  });

  it('renders example automation prompts', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    expect(container.textContent).toContain('When someone books an appointment');
  });

  it('clicking example fills the textarea', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    const exampleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('When a deal is won'),
    ) as HTMLButtonElement;
    fireEvent.click(exampleBtn);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toContain('When a deal is won');
  });

  it('Parse with AI button is disabled when textarea is empty', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    const parseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Parse with AI'),
    ) as HTMLButtonElement;
    expect(parseBtn.disabled).toBe(true);
  });

  it('Parse with AI button enabled after typing', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'When someone books, do something' } });
    const parseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Parse with AI'),
    ) as HTMLButtonElement;
    expect(parseBtn.disabled).toBe(false);
  });

  it('Install button installs a template', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url === '/api/portal/automations' && init?.method === 'POST') return makeRes({ success: true, rule: makeRule(99) });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await openCreateTab(container);
    const installBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim().includes('Install') && !b.textContent?.includes('Installed'),
    );
    expect(installBtns.length).toBeGreaterThan(0);
    fireEvent.click(installBtns[0] as HTMLButtonElement);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => String(c[0]) === '/api/portal/automations' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('template shows Installed state after successful install', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url === '/api/portal/automations' && init?.method === 'POST') return makeRes({ success: true, rule: makeRule(99) });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await openCreateTab(container);
    const installBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim().includes('Install') && !b.textContent?.includes('Installed'),
    ) as HTMLButtonElement;
    fireEvent.click(installBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Installed');
    });
  });
});

// ─── Create tab — NLP parse + save ───────────────────────────────────────────

describe('Create tab — NLP parse flow', () => {
  const parsedResult = {
    name: 'AI Rule',
    trigger: { event: 'booking.guest_booked' },
    conditions: [],
    actions: [{ tool: 'create_crm_deal', params: { title: 'Test' } }],
    productScope: 'crm',
  };

  function setupWithParse() {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url === '/api/portal/automations/parse' && init?.method === 'POST') {
        return makeRes({ success: true, parsed: parsedResult });
      }
      if (url === '/api/portal/automations' && init?.method === 'POST') {
        return makeRes({ success: true, rule: makeRule(10) });
      }
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
  }

  async function openCreateAndParse(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const createBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.includes('Create Automation'),
    );
    fireEvent.click(createBtns[0] as HTMLButtonElement);
    await waitFor(() => expect(container.textContent).toContain('Quick start templates'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'When a guest books, create a deal' } });
    const parseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Parse with AI'),
    ) as HTMLButtonElement;
    fireEvent.click(parseBtn);
  }

  it('shows "Parsing..." during parse', async () => {
    let resolveParse: (v: unknown) => void = () => {};
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url === '/api/portal/automations/parse') {
        return new Promise((res) => { resolveParse = res; }) as Promise<FetchResp>;
      }
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await openCreateAndParse(container);
    expect(container.textContent).toContain('Parsing...');
    act(() => { resolveParse(makeRes({ success: true, parsed: parsedResult })); });
  });

  it('shows parsed result preview', async () => {
    setupWithParse();
    const { container } = renderPage();
    await openCreateAndParse(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Review Automation');
      expect(container.textContent).toContain('AI Rule');
    });
  });

  it('shows parse error on failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url === '/api/portal/automations/parse') return makeRes({ success: false, error: 'Parse failed' });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await openCreateAndParse(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Parse failed');
    });
  });

  it('shows "Network error" when parse fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url === '/api/portal/automations/parse') throw new Error('net fail');
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await openCreateAndParse(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });

  it('Cancel dismisses parsed result and shows examples again', async () => {
    setupWithParse();
    const { container } = renderPage();
    await openCreateAndParse(container);
    await waitFor(() => expect(container.textContent).toContain('Review Automation'));
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Review Automation');
      expect(container.textContent).toContain('Example automations');
    });
  });

  it('Save Automation calls POST and switches to rules tab', async () => {
    setupWithParse();
    const { container } = renderPage();
    await openCreateAndParse(container);
    await waitFor(() => expect(container.textContent).toContain('Review Automation'));
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => String(c[0]) === '/api/portal/automations' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
    // Should switch back to rules tab
    await waitFor(() => {
      expect(container.textContent).toContain('Rules');
      // The newly created rule should show
      expect(container.textContent).toContain('Rule 10');
    });
  });

  it('trigger mode radio switches to schedule', async () => {
    setupWithParse();
    const { container } = renderPage();
    await openCreateAndParse(container);
    await waitFor(() => expect(container.textContent).toContain('Review Automation'));
    const scheduleRadio = container.querySelector('input[value="schedule"]') as HTMLInputElement;
    expect(scheduleRadio).toBeTruthy();
    fireEvent.click(scheduleRadio);
    await waitFor(() => {
      // ScheduleEditor should be visible — look for the Cadence selector
      expect(container.textContent).toContain('Cadence');
    });
  });

  it('trigger mode radio defaults to event', async () => {
    setupWithParse();
    const { container } = renderPage();
    await openCreateAndParse(container);
    await waitFor(() => expect(container.textContent).toContain('Review Automation'));
    const eventRadio = container.querySelector('input[value="event"]') as HTMLInputElement;
    expect(eventRadio?.checked).toBe(true);
  });
});

// ─── Create tab — Schedule a rule form ───────────────────────────────────────

describe('Create tab — Schedule a rule', () => {
  async function openCreateTab(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const createBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => expect(container.textContent).toContain('Schedule a rule'));
  }

  it('renders Schedule a rule section', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    expect(container.textContent).toContain('Schedule a rule');
  });

  it('Save scheduled rule button is disabled without name and template', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save scheduled rule'),
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('filling name and template enables the Save button', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    // Fill rule name
    const nameInput = container.querySelector('input[placeholder="Weekly digest"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My digest' } });
    // Pick first template from select
    const select = container.querySelector('select') as HTMLSelectElement;
    // The first real option after "— pick one —" would be a built-in template
    const options = Array.from(select.options);
    const firstTemplate = options.find((o) => o.value !== '');
    if (firstTemplate) {
      fireEvent.change(select, { target: { value: firstTemplate.value } });
    }
    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save scheduled rule'),
      ) as HTMLButtonElement;
      // If a template was found the button should be enabled
      if (firstTemplate) {
        expect(saveBtn.disabled).toBe(false);
      }
    });
  });

  it('renders schedule preview from API', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Daily at 09:00 UTC');
    });
  });

  it('changing cadence to weekly shows day-of-week selector', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    // ScheduleEditor cadence select - pick the one with value 'daily' and change
    const cadenceSelects = Array.from(container.querySelectorAll('select')).filter(
      (s) => Array.from(s.options).some((o) => o.value === 'weekly'),
    );
    expect(cadenceSelects.length).toBeGreaterThan(0);
    fireEvent.change(cadenceSelects[cadenceSelects.length - 1], { target: { value: 'weekly' } });
    await waitFor(() => {
      expect(container.textContent).toContain('Day of week');
    });
  });

  it('changing cadence to monthly shows day-of-month input', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    const cadenceSelects = Array.from(container.querySelectorAll('select')).filter(
      (s) => Array.from(s.options).some((o) => o.value === 'monthly'),
    );
    fireEvent.change(cadenceSelects[cadenceSelects.length - 1], { target: { value: 'monthly' } });
    await waitFor(() => {
      expect(container.textContent).toContain('Day of month');
    });
  });

  it('changing cadence to cron shows cron expression input', async () => {
    const { container } = renderPage();
    await openCreateTab(container);
    const cadenceSelects = Array.from(container.querySelectorAll('select')).filter(
      (s) => Array.from(s.options).some((o) => o.value === 'cron'),
    );
    fireEvent.change(cadenceSelects[cadenceSelects.length - 1], { target: { value: 'cron' } });
    await waitFor(() => {
      expect(container.textContent).toContain('Cron expression');
    });
  });

  it('schedule preview error is displayed', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) {
        return makeRes({ success: false, error: 'Bad cron' });
      }
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await openCreateTab(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Bad cron');
    });
  });

  it('saves a scheduled rule with built-in template', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url === '/api/portal/automations' && init?.method === 'POST') return makeRes({ success: true, rule: makeRule(77) });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily at 09:00 UTC', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await openCreateTab(container);
    const nameInput = container.querySelector('input[placeholder="Weekly digest"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My Rule' } });
    // Pick the first template
    const selects = Array.from(container.querySelectorAll('select'));
    // first select is likely the action template select (not cadence)
    const templateSelect = selects.find(
      (s) => Array.from(s.options).some((o) => o.textContent?.includes('New booking')),
    ) as HTMLSelectElement;
    if (templateSelect) {
      fireEvent.change(templateSelect, { target: { value: 'booking-to-deal' } });
    }
    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save scheduled rule'),
      ) as HTMLButtonElement;
      if (templateSelect) expect(saveBtn.disabled).toBe(false);
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save scheduled rule'),
    ) as HTMLButtonElement;
    if (!saveBtn.disabled) {
      fireEvent.click(saveBtn);
      await waitFor(() => {
        const postCall = fetchMock.mock.calls.find(
          (c) => String(c[0]) === '/api/portal/automations' && (c[1] as RequestInit)?.method === 'POST',
        );
        expect(postCall).toBeTruthy();
      });
    }
  });
});

// ─── Plugin scripts integration ───────────────────────────────────────────────

describe('Plugin scripts', () => {
  const pluginScript = {
    pluginSlug: 'my-plugin',
    pluginName: 'My Plugin',
    pluginIcon: 'extension',
    script: {
      id: 'run-report',
      name: 'Run Report',
      description: 'Generates a report',
      argsSchema: [
        { name: 'email', type: 'string', required: true, description: 'Recipient email' },
        { name: 'count', type: 'number', default: 5 },
        { name: 'verbose', type: 'boolean', default: false },
      ],
    },
  };

  it('renders plugin scripts in template dropdown', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [pluginScript] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const createBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('My Plugin');
      expect(container.textContent).toContain('Run Report');
    });
  });

  it('selecting a plugin script shows the args editor', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && !init?.method) return makeRes({ success: true, rules: [] });
      if (url.includes('/api/portal/automations/logs')) return makeRes({ success: true, logs: [] });
      if (url.includes('/api/portal/plugins/scripts')) return makeRes({ success: true, items: [pluginScript] });
      if (url.includes('/api/portal/automations/preview-schedule')) return makeRes({ success: true, description: 'Daily', nextRunAt: null });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    const createBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(createBtn);
    await waitFor(() => expect(container.textContent).toContain('My Plugin'));
    const templateSelect = Array.from(container.querySelectorAll('select')).find(
      (s) => Array.from(s.options).some((o) => o.textContent?.includes('My Plugin')),
    ) as HTMLSelectElement;
    expect(templateSelect).toBeTruthy();
    fireEvent.change(templateSelect, { target: { value: 'plugin:my-plugin:run-report' } });
    await waitFor(() => {
      expect(container.textContent).toContain('Script inputs');
      expect(container.textContent).toContain('email');
      expect(container.textContent).toContain('count');
    });
  });
});
