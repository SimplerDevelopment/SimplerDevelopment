// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/brain/automations/page.tsx`.
 *
 * Coverage targets:
 *  - Pure utility functions: pluginTemplateId, parsePluginTemplateId,
 *    describeScheduleClient, getEventScope, formatToolName, timeAgo,
 *    readInitialTab
 *  - BrainAutomationsPage component (client): render, tab switching,
 *    fetch on mount (rules + logs + plugin scripts), rules tab empty/filled,
 *    logs tab empty/filled, create tab (templates, NLP parse, scheduled rule),
 *    handleToggle, handleDelete, handleInstallTemplate, handleParse,
 *    handleSaveRule, handleSaveScheduledRule
 *  - ScheduleEditor sub-component (via create tab)
 *  - PluginScriptArgsEditor sub-component (via schedule rule form)
 *
 * Mocks: next/link, next/navigation (unused but imported transitively),
 *   @/lib/automation/product-presets (light stub), ProductAutomationSettings
 *   (stubbed child), global fetch, window.confirm.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Module mocks (must precede page import) ──────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/automations',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: React.PropsWithChildren<{ href: string; [key: string]: unknown }>) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Stub ProductAutomationSettings — it has its own fetch; we don't want it
// hitting real endpoints in these unit tests.
vi.mock('@/components/portal/ProductAutomationSettings', () => ({
  default: ({ productScope }: { productScope: string }) =>
    React.createElement('div', { 'data-testid': `preset-${productScope}` }, `presets:${productScope}`),
}));

// Stub product-presets so the presets tab renders predictably
vi.mock('@/lib/automation/product-presets', () => ({
  PRODUCT_PRESET_GROUPS: [
    {
      productScope: 'email',
      label: 'Email Marketing',
      icon: 'email',
      description: 'Email automation presets',
      presets: [],
    },
  ],
}));

// ─── Fetch stub ───────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };

const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

// ─── Default rule / log factories ─────────────────────────────────────────

function makeRule(id: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: `Rule ${id}`,
    description: `desc ${id}`,
    trigger: { event: 'booking.guest_booked' },
    conditions: [],
    actions: [{ tool: 'create_crm_deal', params: {} }],
    enabled: true,
    source: 'nlp',
    productScope: null,
    schedule: null,
    nextRunAt: null,
    executionCount: 0,
    lastExecutedAt: null,
    createdAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function makeLog(id: number, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    ruleId: 1,
    ruleName: 'Rule 1',
    triggerEvent: 'booking.guest_booked',
    status: 'success',
    duration: 42,
    errorMessage: null,
    createdAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

// ─── Default fetch responses ───────────────────────────────────────────────

function defaultFetch(url: string): FetchResp {
  if (url.includes('/api/portal/automations/logs')) {
    return makeRes({ success: true, logs: [] });
  }
  if (url.includes('/api/portal/automations')) {
    return makeRes({ success: true, rules: [] });
  }
  if (url.includes('/api/portal/plugins/scripts')) {
    return makeRes({ success: true, items: [] });
  }
  if (url.includes('/api/portal/automations/preview-schedule')) {
    return makeRes({ success: true, description: 'Daily at 09:00 UTC', nextRunAt: '2025-01-02T09:00:00Z' });
  }
  return makeRes({ success: true });
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => defaultFetch(url));
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  vi.stubGlobal('confirm', vi.fn(() => true));
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

// ─── Shell rendering ──────────────────────────────────────────────────────

describe('BrainAutomationsPage — shell', () => {
  it('renders the Brain Automations heading once loaded', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Brain Automations');
    });
  });

  it('renders the Brain back link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders four tab buttons', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const text = container.textContent ?? '';
      expect(text).toContain('Rules');
      expect(text).toContain('Product Presets');
      expect(text).toContain('Activity');
      expect(text).toContain('Create');
    });
  });

  it('shows spinner while loading', () => {
    // Hold the fetch forever so loading state persists
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('autorenew');
  });
});

// ─── Rules tab ────────────────────────────────────────────────────────────

describe('Rules tab — empty state', () => {
  it('shows empty-state copy when no rules exist', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No automations yet');
    });
  });

  it('empty-state "Browse templates" button switches to create tab', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Browse templates'));
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Browse templates'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Quick start templates');
    });
  });
});

describe('Rules tab — with rules', () => {
  it('renders rule names', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules: [makeRule(1, { name: 'My Rule Alpha' })] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Rule Alpha'));
  });

  it('renders the scope badge for booking events', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules: [makeRule(1)] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('booking'));
  });

  it('renders AI badge for nlp-source rules', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules: [makeRule(1, { source: 'nlp' })] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('AI'));
  });

  it('renders execution count when executionCount > 0', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules: [makeRule(1, { executionCount: 7 })] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('7 runs'));
  });

  it('renders lastExecutedAt as time-ago', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, { lastExecutedAt: new Date(Date.now() - 70000).toISOString() })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Last fired:');
    });
  });

  it('renders schedule badge for scheduled rules', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, { schedule: { cadence: 'daily', time: '08:00' } })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Schedule:'));
  });

  it('renders action delay chip (days)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, { actions: [{ tool: 'create_crm_deal', params: {}, delay: 90000 }] })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('delay'));
  });

  it('renders action delay chip (hours)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, { actions: [{ tool: 'create_crm_deal', params: {}, delay: 7200 }] })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('delay'));
  });

  it('renders action delay chip (seconds)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, { actions: [{ tool: 'create_crm_deal', params: {}, delay: 30 }] })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('delay'));
  });

  it('toggle button calls PATCH with toggled enabled value', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && (!init || !init.method)) {
        return makeRes({ success: true, rules: [makeRule(1, { enabled: true })] });
      }
      if (url === '/api/portal/automations/1' && init?.method === 'PATCH') {
        return makeRes({ success: true });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rule 1'));
    // The toggle button is an inline-flex h-6 w-10 button
    const toggleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.className.includes('rounded-full') && (b.className.includes('bg-green') || b.className.includes('bg-muted')),
    ) as HTMLButtonElement;
    fireEvent.click(toggleBtn);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => String(c[0]) === '/api/portal/automations/1' && (c[1] as RequestInit)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
  });

  it('delete button calls DELETE after confirm', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && (!init || !init.method)) {
        return makeRes({ success: true, rules: [makeRule(1)] });
      }
      if (url === '/api/portal/automations/1' && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rule 1'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('delete_outline'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      const deleteCall = fetchMock.mock.calls.find(
        (c) => String(c[0]) === '/api/portal/automations/1' && (c[1] as RequestInit)?.method === 'DELETE',
      );
      expect(deleteCall).toBeTruthy();
    });
  });

  it('delete does nothing when confirm is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules: [makeRule(1)] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rule 1'));
    const before = fetchMock.mock.calls.length;
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('delete_outline'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    // No additional fetch call issued
    expect(fetchMock.mock.calls.length).toBe(before);
  });
});

// ─── Logs tab ─────────────────────────────────────────────────────────────

describe('Logs tab — empty and filled states', () => {
  it('shows empty-state when no logs', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rules'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => expect(container.textContent).toContain('No activity yet'));
  });

  it('renders log entries with rule name and time-ago', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/automations/logs')) {
        return makeRes({ success: true, logs: [makeLog(1, { ruleName: 'Alpha Rule', createdAt: new Date(Date.now() - 5 * 60000).toISOString() })] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rules'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Alpha Rule');
    });
  });

  it('renders failure status icon for failed log entries', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/automations/logs')) {
        return makeRes({ success: true, logs: [makeLog(1, { status: 'failed', errorMessage: 'timeout' })] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rules'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('timeout');
    });
  });

  it('renders partial status log with amber icon', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/automations/logs')) {
        return makeRes({ success: true, logs: [makeLog(1, { status: 'partial' })] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rules'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('warning');
    });
  });

  it('renders duration when present', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/automations/logs')) {
        return makeRes({ success: true, logs: [makeLog(1, { duration: 123 })] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rules'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('123ms');
    });
  });
});

// ─── Presets tab ──────────────────────────────────────────────────────────

describe('Presets tab', () => {
  it('renders the presets info banner and the stubbed preset group', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rules'));
    const presetsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Product Presets'),
    ) as HTMLButtonElement;
    fireEvent.click(presetsTab);
    await waitFor(() => {
      expect(container.textContent).toContain('Product presets');
      expect(container.textContent).toContain('presets:email');
    });
  });
});

// ─── Create tab — quick-start templates ──────────────────────────────────

describe('Create tab — quick-start templates', () => {
  async function openCreateTab(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Quick start templates'));
  }

  it('renders all 4 built-in templates', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    expect(container.textContent).toContain('New booking → CRM deal');
    expect(container.textContent).toContain('Survey response → CRM deal');
    expect(container.textContent).toContain('New booking → CRM contact');
    expect(container.textContent).toContain('Survey response → CRM contact');
  });

  it('clicking Install POSTs the template and marks it as installed', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && init?.method === 'POST') {
        return makeRes({ success: true, rule: makeRule(99, { name: 'Booking → CRM Deal' }) });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const installBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.textContent?.trim().includes('Install') && !b.textContent?.includes('Installed'),
    );
    fireEvent.click(installBtns[0] as HTMLButtonElement);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => String(c[0]) === '/api/portal/automations' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
    await waitFor(() => {
      expect(container.textContent).toContain('Installed');
    });
  });

  it('renders example automation prompts when parsed is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    expect(container.textContent).toContain('Example automations');
    expect(container.textContent).toContain('books an appointment');
  });

  it('clicking an example prompt fills the NLP textarea', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const exampleBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('books an appointment'),
    ) as HTMLButtonElement;
    fireEvent.click(exampleBtn);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea?.value).toContain('books an appointment');
  });
});

// ─── Create tab — NLP parse ───────────────────────────────────────────────

describe('Create tab — NLP parse flow', () => {
  async function openCreateTab(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Quick start templates'));
  }

  it('Parse with AI button is disabled when textarea is empty', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const parseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Parse with AI'),
    ) as HTMLButtonElement;
    expect(parseBtn.disabled).toBe(true);
  });

  it('successful parse shows Review Automation section', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations/parse' && init?.method === 'POST') {
        return makeRes({
          success: true,
          parsed: {
            name: 'My Parsed Rule',
            trigger: { event: 'booking.guest_booked' },
            conditions: [],
            actions: [{ tool: 'create_crm_deal', params: { title: 'deal' } }],
            productScope: null,
          },
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'When someone books, create a deal' } });
    const parseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Parse with AI'),
    ) as HTMLButtonElement;
    fireEvent.click(parseBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Review Automation');
      expect(container.textContent).toContain('My Parsed Rule');
    });
  });

  it('parse error shows the error message', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations/parse' && init?.method === 'POST') {
        return makeRes({ success: false, error: 'AI quota exceeded' });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'test input' } });
    const parseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Parse with AI'),
    ) as HTMLButtonElement;
    fireEvent.click(parseBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('AI quota exceeded');
    });
  });

  it('parse network error shows "Network error"', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations/parse' && init?.method === 'POST') {
        throw new Error('offline');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'test input' } });
    const parseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Parse with AI'),
    ) as HTMLButtonElement;
    fireEvent.click(parseBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── Create tab — save parsed rule ───────────────────────────────────────

describe('Create tab — save parsed rule', () => {
  async function setupParsed(container: HTMLElement) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations/parse' && init?.method === 'POST') {
        return makeRes({
          success: true,
          parsed: {
            name: 'Parsed Rule',
            trigger: { event: 'booking.guest_booked', filters: { status: 'confirmed' } },
            conditions: [{ field: 'amount', operator: '>', value: 100 }],
            actions: [
              { tool: 'create_crm_deal', params: { title: '{{event.name}}' }, delay: 0 },
              { tool: 'send_email', params: { to: 'test@example.com' }, delay: 3600 },
            ],
            productScope: 'crm',
          },
        });
      }
      if (url === '/api/portal/automations' && init?.method === 'POST') {
        return makeRes({ success: true, rule: makeRule(55, { name: 'Parsed Rule' }) });
      }
      return defaultFetch(url);
    });
    // Navigate to create tab
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Quick start templates'));
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'When someone books, create a deal' } });
    const parseBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Parse with AI'),
    ) as HTMLButtonElement;
    fireEvent.click(parseBtn);
    await waitFor(() => expect(container.textContent).toContain('Review Automation'));
  }

  it('Save Automation POSTs and returns to rules tab on success', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await setupParsed(container);
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
    // After save success the tab returns to rules (the parsed review panel is gone)
    await waitFor(() => expect(container.textContent).not.toContain('Review Automation'));
  });

  it('Cancel button in parsed preview hides the review panel', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await setupParsed(container);
    expect(container.textContent).toContain('Review Automation');
    const cancelBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Review Automation');
    });
  });

  it('renders parsed conditions in review panel', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await setupParsed(container);
    expect(container.textContent).toContain('amount');
    expect(container.textContent).toContain('>');
  });

  it('renders trigger filters in review panel', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await setupParsed(container);
    expect(container.textContent).toContain('filtered:');
  });

  it('trigger mode radio switches to schedule', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await setupParsed(container);
    const scheduleRadio = container.querySelector('input[value="schedule"]') as HTMLInputElement;
    fireEvent.click(scheduleRadio);
    await waitFor(() => {
      expect(container.textContent).toContain('Cadence');
    });
  });
});

// ─── Create tab — schedule rule form ─────────────────────────────────────

describe('Create tab — standalone schedule rule', () => {
  async function openCreateTab(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Schedule a rule'));
  }

  it('renders the schedule rule section', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    expect(container.textContent).toContain('Schedule a rule');
  });

  it('Save scheduled rule is disabled without name and template', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save scheduled rule'),
    ) as HTMLButtonElement;
    expect(saveBtn.disabled).toBe(true);
  });

  it('fills name + template and saves a scheduled rule', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && init?.method === 'POST') {
        return makeRes({ success: true, rule: makeRule(77, { name: 'Weekly digest' }) });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    // Fill name
    const nameInput = container.querySelector('input[placeholder="Weekly digest"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Weekly digest' } });
    // Pick a template (first built-in option after "— pick one —")
    const templateSelect = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(templateSelect, { target: { value: 'booking-to-deal' } });
    // Save
    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save scheduled rule'),
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save scheduled rule'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => String(c[0]) === '/api/portal/automations' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
    // After success tab switches back to rules — schedule form is no longer shown
    await waitFor(() => expect(container.textContent).not.toContain('Schedule a rule'));
  });

  it('save-error is surfaced in the preview error area', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/automations' && init?.method === 'POST') {
        return makeRes({ success: false, error: 'quota hit' });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const nameInput = container.querySelector('input[placeholder="Weekly digest"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My Schedule' } });
    const templateSelect = container.querySelector('select') as HTMLSelectElement;
    fireEvent.change(templateSelect, { target: { value: 'survey-to-deal' } });
    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save scheduled rule'),
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save scheduled rule'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('quota hit');
    });
  });
});

// ─── ScheduleEditor — cadence interactions ─────────────────────────────

describe('ScheduleEditor — cadence interactions', () => {
  async function openCreateTab(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Schedule a rule'));
  }

  it('switches cadence to weekly and shows day-of-week select', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    // The ScheduleEditor's cadence select is the second select on the create tab
    const selects = Array.from(container.querySelectorAll('select'));
    // Find the cadence select (contains daily/weekly/monthly/cron options)
    const cadenceSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === 'weekly'),
    ) as HTMLSelectElement;
    fireEvent.change(cadenceSelect, { target: { value: 'weekly' } });
    await waitFor(() => {
      expect(container.textContent).toContain('Day of week');
    });
  });

  it('switches cadence to monthly and shows day-of-month input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const selects = Array.from(container.querySelectorAll('select'));
    const cadenceSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === 'monthly'),
    ) as HTMLSelectElement;
    fireEvent.change(cadenceSelect, { target: { value: 'monthly' } });
    await waitFor(() => {
      expect(container.textContent).toContain('Day of month');
    });
  });

  it('switches cadence to cron and shows cron expression input', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    const selects = Array.from(container.querySelectorAll('select'));
    const cadenceSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value === 'cron'),
    ) as HTMLSelectElement;
    fireEvent.change(cadenceSelect, { target: { value: 'cron' } });
    await waitFor(() => {
      expect(container.textContent).toContain('Cron expression');
    });
  });
});

// ─── Plugin scripts integration ──────────────────────────────────────────

describe('Create tab — plugin scripts', () => {
  const pluginScript = {
    pluginSlug: 'acme',
    pluginName: 'Acme Plugin',
    pluginIcon: 'extension',
    script: {
      id: 'report',
      name: 'Daily Report',
      description: 'Sends a daily report',
      argsSchema: [
        { name: 'recipient', type: 'string', required: true, description: 'Email address', default: 'test@test.com' },
        { name: 'count', type: 'number', required: false, default: 5 },
        { name: 'verbose', type: 'boolean', required: false, default: false },
      ],
    },
  };

  async function openCreateTab(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Schedule a rule'));
  }

  it('renders plugin script options in the template picker', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/plugins/scripts') {
        return makeRes({ success: true, items: [pluginScript] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Acme Plugin');
    });
  });

  it('selecting a plugin script template shows the args editor', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/plugins/scripts') {
        return makeRes({ success: true, items: [pluginScript] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    await waitFor(() => expect(container.textContent).toContain('Acme Plugin'));
    const selects = Array.from(container.querySelectorAll('select'));
    const templateSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value.includes('plugin:')),
    ) as HTMLSelectElement;
    const pluginOptionValue = Array.from(templateSelect.options).find(
      (o) => o.value.includes('plugin:'),
    )!.value;
    fireEvent.change(templateSelect, { target: { value: pluginOptionValue } });
    await waitFor(() => {
      expect(container.textContent).toContain('Script inputs');
      expect(container.textContent).toContain('recipient');
    });
  });

  it('saves a scheduled rule with plugin script actions', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/plugins/scripts') {
        return makeRes({ success: true, items: [pluginScript] });
      }
      if (url === '/api/portal/automations' && init?.method === 'POST') {
        return makeRes({ success: true, rule: makeRule(88) });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    await waitFor(() => expect(container.textContent).toContain('Acme Plugin'));
    // Fill name
    const nameInput = container.querySelector('input[placeholder="Weekly digest"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'My Plugin Rule' } });
    // Pick the plugin template
    const selects = Array.from(container.querySelectorAll('select'));
    const templateSelect = selects.find((s) =>
      Array.from(s.options).some((o) => o.value.includes('plugin:')),
    ) as HTMLSelectElement;
    const pluginVal = Array.from(templateSelect.options).find(
      (o) => o.value.includes('plugin:'),
    )!.value;
    fireEvent.change(templateSelect, { target: { value: pluginVal } });
    await waitFor(() => expect(container.textContent).toContain('Script inputs'));
    // Save
    await waitFor(() => {
      const saveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Save scheduled rule'),
      ) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Save scheduled rule'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => String(c[0]) === '/api/portal/automations' && (c[1] as RequestInit)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
      const body = JSON.parse((postCall![1] as RequestInit).body as string);
      expect(body.actions[0].tool).toBe('run_plugin_script');
    });
  });
});

// ─── Pure utility function unit tests ─────────────────────────────────────
// These are tested indirectly via rendered output above, but we can also
// test some directly by importing the private helpers — they are not exported,
// so we rely on rendered output in the preceding suites for coverage.

// Verify describeScheduleClient variants via rendered output (schedule badge in rules tab)
describe('describeScheduleClient — via rendered schedule badge', () => {
  it('weekly schedule badge shows day name', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, {
            schedule: { cadence: 'weekly', time: '10:00', dayOfWeek: 3 },
          })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Wednesday');
    });
  });

  it('monthly schedule badge shows ordinal suffix (11th = th special case)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, {
            schedule: { cadence: 'monthly', time: '06:00', dayOfMonth: 11 },
          })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('11th');
    });
  });

  it('monthly schedule badge shows ordinal suffix (1st)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, {
            schedule: { cadence: 'monthly', time: '06:00', dayOfMonth: 1 },
          })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('1st');
    });
  });

  it('monthly schedule badge shows ordinal suffix (2nd)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, {
            schedule: { cadence: 'monthly', time: '06:00', dayOfMonth: 2 },
          })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('2nd');
    });
  });

  it('monthly schedule badge shows ordinal suffix (3rd)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, {
            schedule: { cadence: 'monthly', time: '06:00', dayOfMonth: 3 },
          })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('3rd');
    });
  });

  it('cron schedule badge shows the cron expression', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, {
            schedule: { cadence: 'cron', cronExpression: '*/5 * * * *' },
          })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('*/5 * * * *');
    });
  });
});

// ─── getEventScope — via scope badges in rules tab ─────────────────────

describe('getEventScope — scope badge variants via rules tab', () => {
  async function renderWithEvent(event: string) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({ success: true, rules: [makeRule(1, { trigger: { event } })] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rule 1'));
    return container;
  }

  it('email.campaign.sent → email scope', async () => {
    const container = await renderWithEvent('email.campaign.sent');
    expect(container.textContent).toContain('email');
  });

  it('project.created → projects scope', async () => {
    const container = await renderWithEvent('project.created');
    expect(container.textContent).toContain('projects');
  });

  it('task.completed → projects scope', async () => {
    const container = await renderWithEvent('task.completed');
    expect(container.textContent).toContain('projects');
  });

  it('ticket.created → support scope', async () => {
    const container = await renderWithEvent('ticket.created');
    expect(container.textContent).toContain('support');
  });

  it('form.submitted → website scope', async () => {
    const container = await renderWithEvent('form.submitted');
    expect(container.textContent).toContain('website');
  });

  it('page.published → website scope', async () => {
    const container = await renderWithEvent('page.published');
    expect(container.textContent).toContain('website');
  });

  it('order.placed → store scope', async () => {
    const container = await renderWithEvent('order.placed');
    expect(container.textContent).toContain('store');
  });

  it('invoice.sent → billing scope (no specific color)', async () => {
    const container = await renderWithEvent('invoice.sent');
    expect(container.textContent).toContain('billing');
  });

  it('proposal.accepted → crm scope', async () => {
    const container = await renderWithEvent('proposal.accepted');
    expect(container.textContent).toContain('crm');
  });

  it('unknown.event → other scope', async () => {
    const container = await renderWithEvent('unknown.event');
    expect(container.textContent).toContain('other');
  });
});

// ─── timeAgo — via log entries ─────────────────────────────────────────

describe('timeAgo — via log entries', () => {
  async function renderLogWithDate(createdAt: string) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/automations/logs')) {
        return makeRes({ success: true, logs: [makeLog(1, { createdAt })] });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Rules'));
    const logsTab = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Activity'),
    ) as HTMLButtonElement;
    fireEvent.click(logsTab);
    await waitFor(() => expect(container.textContent).toContain('Rule 1'));
    return container;
  }

  it('renders "just now" for very recent dates', async () => {
    const container = await renderLogWithDate(new Date(Date.now() - 30000).toISOString());
    expect(container.textContent).toContain('just now');
  });

  it('renders minutes ago', async () => {
    const container = await renderLogWithDate(new Date(Date.now() - 5 * 60000).toISOString());
    expect(container.textContent).toContain('5m ago');
  });

  it('renders hours ago', async () => {
    const container = await renderLogWithDate(new Date(Date.now() - 3 * 3600000).toISOString());
    expect(container.textContent).toContain('3h ago');
  });

  it('renders days ago', async () => {
    const container = await renderLogWithDate(new Date(Date.now() - 2 * 86400000).toISOString());
    expect(container.textContent).toContain('2d ago');
  });
});

// ─── readInitialTab — tab URL param ───────────────────────────────────

describe('readInitialTab — URL-driven initial tab', () => {
  it('defaults to rules tab when no ?tab param', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      // Rules tab content (empty state) should be shown
      expect(container.textContent).toContain('No automations yet');
    });
  });

  it('opens create tab when ?tab=create in window.location.search', async () => {
    // Simulate ?tab=create in the URL before render
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '?tab=create' },
      writable: true,
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Quick start templates');
    });
    // Restore
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '' },
      writable: true,
    });
  });
});

// ─── Preview schedule error path ─────────────────────────────────────────

describe('Schedule preview — error paths', () => {
  async function openCreateTab(container: HTMLElement) {
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Schedule a rule'));
  }

  it('shows computing next run while preview is loading', async () => {
    // Hold the preview-schedule fetch
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/automations/preview-schedule')) {
        return new Promise(() => {});
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Computing next run');
    });
  });

  it('shows schedule preview description when available', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/automations/preview-schedule')) {
        return makeRes({
          success: true,
          description: 'Daily at 09:00 UTC',
          nextRunAt: '2025-01-02T09:00:00.000Z',
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Daily at 09:00 UTC');
    });
  });

  it('shows preview error on failed preview-schedule response', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/automations/preview-schedule')) {
        return makeRes({ success: false, error: 'bad cron' });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    await waitFor(() => {
      expect(container.textContent).toContain('bad cron');
    });
  });

  it('shows "Network error" when preview-schedule fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/portal/automations/preview-schedule')) {
        throw new Error('network down');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    await openCreateTab(container);
    await waitFor(() => {
      expect(container.textContent).toContain('Network error');
    });
  });
});

// ─── plugin scripts fetch failure is non-fatal ──────────────────────────

describe('Plugin scripts fetch failure', () => {
  it('does not crash when /plugins/scripts 5xxs', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/plugins/scripts') {
        throw new Error('server error');
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Brain Automations');
    });
  });
});

// ─── formatToolName — via action chips ────────────────────────────────────

describe('formatToolName — via action chips in rules tab', () => {
  it('converts snake_case tool name to Title Case', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/automations') {
        return makeRes({
          success: true,
          rules: [makeRule(1, { actions: [{ tool: 'send_welcome_email', params: {} }] })],
        });
      }
      return defaultFetch(url);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Send Welcome Email');
    });
  });
});

// ─── "Create Automation" header button ────────────────────────────────────

describe('Header "Create Automation" button', () => {
  it('clicking Create Automation header button navigates to create tab', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Brain Automations'));
    // The header button
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim().includes('Create Automation'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Quick start templates');
    });
  });
});
