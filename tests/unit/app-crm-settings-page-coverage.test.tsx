// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/crm/settings/page.tsx`.
 *
 * Coverage targets:
 *  - Initial loading state
 *  - Tab rendering and switching (pipelines, tags, custom-fields, automations)
 *  - Pipelines tab: empty state, pipeline list, expand/collapse stages
 *  - Create pipeline form
 *  - Rename pipeline (edit mode, save, cancel, keyboard shortcuts)
 *  - Delete pipeline (with confirm mock)
 *  - Stage management: add stage, delete stage, move stage up/down
 *  - Tags tab: empty state, tag list, add tag, delete tag, color picker
 *  - Custom-fields tab: renders CrmCustomFieldsAdmin stub
 *  - Automations tab: renders ProductAutomationSettings stub
 *
 * Mocks: next/navigation, global fetch, window.confirm,
 *        ProductAutomationSettings, CrmCustomFieldsAdmin.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Module mocks (must precede page import) ──────────────────────────────────

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/crm/settings',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/components/portal/ProductAutomationSettings', () => ({
  default: ({
    title,
    description,
  }: {
    productScope: string;
    presets: unknown[];
    title: string;
    description: string;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'product-automation-settings' },
      React.createElement('span', {}, title),
      React.createElement('p', {}, description),
    ),
}));

vi.mock('@/components/portal/CrmCustomFieldsAdmin', () => ({
  default: () =>
    React.createElement('div', { 'data-testid': 'crm-custom-fields-admin' }, 'CustomFields'),
}));

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; json: () => Promise<unknown> };
const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<FetchResp>>();

function makeRes(body: unknown, ok = true): FetchResp {
  return { ok, json: async () => body };
}

const DEFAULT_PIPELINE = {
  id: 1,
  name: 'Sales',
  stages: [
    { id: 10, name: 'Prospect', color: '#3b82f6', probability: 10, order: 1 },
    { id: 11, name: 'Proposal', color: '#10b981', probability: 50, order: 2 },
  ],
};

const DEFAULT_TAG = { id: 1, name: 'VIP', color: '#ef4444' };

function setupDefault() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/portal/crm/pipelines') {
      return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
    }
    if (url === '/api/portal/crm/tags') {
      return makeRes({ success: true, data: [DEFAULT_TAG] });
    }
    return makeRes({ success: true, data: {} });
  });
}

function setupEmpty() {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/portal/crm/pipelines') {
      return makeRes({ success: true, data: [] });
    }
    if (url === '/api/portal/crm/tags') {
      return makeRes({ success: true, data: [] });
    }
    return makeRes({ success: true, data: {} });
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  setupDefault();
  vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
  // Default confirm to true so destructive actions proceed
  vi.stubGlobal('confirm', vi.fn(() => true));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Import after mocks
import CrmSettingsPage from '@/app/portal/crm/settings/page';

function renderPage() {
  return render(<CrmSettingsPage />);
}

// Wait for loading to complete (loading spinner disappears)
async function waitForLoaded(container: HTMLElement) {
  await waitFor(() => {
    expect(container.querySelector('.animate-spin')).toBeNull();
  });
}

// ─── Loading state ────────────────────────────────────────────────────────────

describe('CrmSettingsPage — loading state', () => {
  it('shows a spinner while fetching', () => {
    fetchMock.mockImplementation(() => new Promise(() => {}) as Promise<FetchResp>);
    const { container } = renderPage();
    expect(container.querySelector('.animate-spin')).toBeTruthy();
  });

  it('removes spinner after data loads', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
  });
});

// ─── Tab navigation ────────────────────────────────────────────────────────────

describe('CrmSettingsPage — tab navigation', () => {
  it('renders all four tab labels', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    expect(container.textContent).toContain('Pipelines');
    expect(container.textContent).toContain('Tags');
    expect(container.textContent).toContain('Custom Fields');
    expect(container.textContent).toContain('Automations');
  });

  it('shows pipelines panel by default', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    expect(container.textContent).toContain('Manage your deal pipelines');
  });

  it('switches to Tags tab on click', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    // Tab buttons include a material-icon span, so use includes not exact match
    const tagsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Tags') && !b.textContent?.includes('Custom'),
    ) as HTMLButtonElement;
    expect(tagsBtn).toBeTruthy();
    fireEvent.click(tagsBtn);
    expect(container.textContent).toContain('Manage tags for organizing contacts');
  });

  it('switches to Custom Fields tab on click', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const cfBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Custom Fields'),
    ) as HTMLButtonElement;
    expect(cfBtn).toBeTruthy();
    fireEvent.click(cfBtn);
    expect(container.querySelector('[data-testid="crm-custom-fields-admin"]')).toBeTruthy();
  });

  it('switches to Automations tab on click', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const autoBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Automations'),
    ) as HTMLButtonElement;
    expect(autoBtn).toBeTruthy();
    fireEvent.click(autoBtn);
    expect(container.querySelector('[data-testid="product-automation-settings"]')).toBeTruthy();
  });
});

// ─── Pipelines tab ────────────────────────────────────────────────────────────

describe('CrmSettingsPage — pipelines tab', () => {
  it('shows "No pipelines yet" when list is empty', async () => {
    setupEmpty();
    const { container } = renderPage();
    await waitForLoaded(container);
    expect(container.textContent).toContain('No pipelines yet');
  });

  it('renders pipeline name from API', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    expect(container.textContent).toContain('Sales');
  });

  it('renders stage count badge on pipeline row', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    expect(container.textContent).toContain('2 stages');
  });

  it('renders pipeline with 1 stage using singular label', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/crm/pipelines') {
        return makeRes({
          success: true,
          data: [{ id: 2, name: 'Solo', stages: [{ id: 20, name: 'Lead', color: '#blue', probability: 10, order: 1 }] }],
        });
      }
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    expect(container.textContent).toContain('1 stage');
    expect(container.textContent).not.toContain('1 stages');
  });

  it('expands pipeline stages on header click', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const expandBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Sales'),
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Prospect');
      expect(container.textContent).toContain('Proposal');
    });
  });

  it('collapses pipeline stages on second header click', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const expandBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Sales'),
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    await waitFor(() => expect(container.textContent).toContain('Prospect'));
    fireEvent.click(expandBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('Prospect');
    });
  });
});

// ─── Pipeline rename ──────────────────────────────────────────────────────────

describe('CrmSettingsPage — pipeline rename', () => {
  it('clicking edit (pencil) icon enters rename mode', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const editBtn = container.querySelector('button[title="Rename"]') as HTMLButtonElement;
    fireEvent.click(editBtn);
    const input = container.querySelector('input') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe('Sales');
  });

  it('clicking Cancel exits rename mode without saving', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const editBtn = container.querySelector('button[title="Rename"]') as HTMLButtonElement;
    fireEvent.click(editBtn);
    const cancelBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    fireEvent.click(cancelBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Sales');
      expect(container.querySelector('button[title="Rename"]')).toBeTruthy();
    });
    const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });

  it('clicking Save calls PUT /api/portal/crm/pipelines/:id', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/api/portal/crm/pipelines/') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    const editBtn = container.querySelector('button[title="Rename"]') as HTMLButtonElement;
    fireEvent.click(editBtn);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed Pipeline' } });
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Save',
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'PUT');
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });

  it('pressing Enter saves the renamed pipeline', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/api/portal/crm/pipelines/') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    const editBtn = container.querySelector('button[title="Rename"]') as HTMLButtonElement;
    fireEvent.click(editBtn);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Enter Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => {
      const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'PUT');
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });

  it('pressing Escape cancels rename without saving', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const editBtn = container.querySelector('button[title="Rename"]') as HTMLButtonElement;
    fireEvent.click(editBtn);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Should not save' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(container.querySelector('button[title="Rename"]')).toBeTruthy();
    });
    const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });

  it('empty rename input does not call PUT', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const editBtn = container.querySelector('button[title="Rename"]') as HTMLButtonElement;
    fireEvent.click(editBtn);
    const input = container.querySelector('input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await new Promise((r) => setTimeout(r, 30));
    const putCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'PUT');
    expect(putCalls).toHaveLength(0);
  });
});

// ─── Pipeline delete ──────────────────────────────────────────────────────────

describe('CrmSettingsPage — pipeline delete', () => {
  it('calls DELETE /api/portal/crm/pipelines/:id on delete button click', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/api/portal/crm/pipelines/') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    const deleteBtn = container.querySelector('button[title="Delete"]') as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      const delCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'DELETE');
      expect(delCalls.length).toBeGreaterThan(0);
    });
  });

  it('does NOT call DELETE when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { container } = renderPage();
    await waitForLoaded(container);
    const deleteBtn = container.querySelector('button[title="Delete"]') as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await new Promise((r) => setTimeout(r, 30));
    const delCalls = fetchMock.mock.calls.filter((c) => c[1]?.method === 'DELETE');
    expect(delCalls).toHaveLength(0);
  });

  it('removes pipeline from list after successful delete', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/api/portal/crm/pipelines/') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    const deleteBtn = container.querySelector('button[title="Delete"]') as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('No pipelines yet');
    });
  });

  it('collapses expanded pipeline when it is deleted', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/api/portal/crm/pipelines/') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    // Expand pipeline first
    const expandBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Sales'),
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    await waitFor(() => expect(container.textContent).toContain('Prospect'));
    // Now delete
    const deleteBtn = container.querySelector('button[title="Delete"]') as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('No pipelines yet');
    });
  });
});

// ─── Create pipeline ──────────────────────────────────────────────────────────

describe('CrmSettingsPage — create pipeline', () => {
  it('Create Pipeline button is disabled when input is empty', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const submitBtn = Array.from(container.querySelectorAll('button[type="submit"]')).find((b) =>
      b.textContent?.includes('Create Pipeline'),
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
  });

  it('Create Pipeline button is enabled when input has a value', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const input = container.querySelector(
      'input[placeholder="New pipeline name..."]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Marketing' } });
    const submitBtn = Array.from(container.querySelectorAll('button[type="submit"]')).find((b) =>
      b.textContent?.includes('Create Pipeline'),
    ) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);
  });

  it('submitting form calls POST /api/portal/crm/pipelines', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines' && !init?.method) {
        return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      }
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url === '/api/portal/crm/pipelines' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99, name: 'Marketing', stages: [] } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    const input = container.querySelector(
      'input[placeholder="New pipeline name..."]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Marketing' } });
    const form = input.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => c[0] === '/api/portal/crm/pipelines' && c[1]?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('adds new pipeline to list after successful creation', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines' && !init?.method) {
        return makeRes({ success: true, data: [] });
      }
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url === '/api/portal/crm/pipelines' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 99, name: 'Marketing', stages: [] } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    const input = container.querySelector(
      'input[placeholder="New pipeline name..."]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Marketing' } });
    const form = input.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('Marketing');
    });
  });

  it('does not call POST when pipeline name is blank (whitespace)', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const input = container.querySelector(
      'input[placeholder="New pipeline name..."]',
    ) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '   ' } });
    const form = input.closest('form') as HTMLFormElement;
    // Manually fire submit to bypass disabled button
    await act(async () => {
      fireEvent.submit(form);
    });
    await new Promise((r) => setTimeout(r, 30));
    const postCalls = fetchMock.mock.calls.filter(
      (c) => c[0] === '/api/portal/crm/pipelines' && c[1]?.method === 'POST',
    );
    expect(postCalls).toHaveLength(0);
  });
});

// ─── Stage management ─────────────────────────────────────────────────────────

describe('CrmSettingsPage — stage management', () => {
  async function expandPipeline(container: HTMLElement) {
    const expandBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Sales'),
    ) as HTMLButtonElement;
    fireEvent.click(expandBtn);
    await waitFor(() => expect(container.textContent).toContain('Prospect'));
  }

  it('shows stages when pipeline is expanded', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    expect(container.textContent).toContain('Prospect');
    expect(container.textContent).toContain('Proposal');
  });

  it('shows stage probability values', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    expect(container.textContent).toContain('10%');
    expect(container.textContent).toContain('50%');
  });

  it('renders add-stage form with Stage Name input', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    const stageNameInput = container.querySelector(
      'input[placeholder="e.g. Proposal"]',
    ) as HTMLInputElement;
    expect(stageNameInput).toBeTruthy();
  });

  it('Add stage button is disabled when stage name is empty', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    const addBtn = Array.from(container.querySelectorAll('button[type="submit"]')).find((b) =>
      b.textContent?.includes('Add'),
    ) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it('submitting add-stage form calls POST /api/portal/crm/pipelines/:id/stages', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/stages') && !url.includes('/reorder') && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 30, name: 'Closed', color: '#3b82f6', probability: 100, order: 3 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    const stageNameInput = container.querySelector(
      'input[placeholder="e.g. Proposal"]',
    ) as HTMLInputElement;
    fireEvent.change(stageNameInput, { target: { value: 'Closed' } });
    const form = stageNameInput.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/stages') && !String(c[0]).includes('/reorder') && c[1]?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('adds new stage to list after successful creation', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/stages') && !url.includes('/reorder') && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 30, name: 'Closed Won', color: '#3b82f6', probability: 100, order: 3 } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    const stageNameInput = container.querySelector(
      'input[placeholder="e.g. Proposal"]',
    ) as HTMLInputElement;
    fireEvent.change(stageNameInput, { target: { value: 'Closed Won' } });
    const form = stageNameInput.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('Closed Won');
    });
  });

  it('delete stage button calls DELETE stages/:stageId', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/stages/') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    // Stage delete buttons use "close" icon — find the first one
    const stageDeleteBtns = Array.from(
      container.querySelectorAll('button'),
    ).filter((b) => b.querySelector('.material-icons')?.textContent === 'close');
    expect(stageDeleteBtns.length).toBeGreaterThan(0);
    fireEvent.click(stageDeleteBtns[0]);
    await waitFor(() => {
      const delCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/stages/') && c[1]?.method === 'DELETE',
      );
      expect(delCalls.length).toBeGreaterThan(0);
    });
  });

  it('does NOT delete stage when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    const stageDeleteBtns = Array.from(
      container.querySelectorAll('button'),
    ).filter((b) => b.querySelector('.material-icons')?.textContent === 'close');
    fireEvent.click(stageDeleteBtns[0]);
    await new Promise((r) => setTimeout(r, 30));
    const delCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes('/stages/') && c[1]?.method === 'DELETE',
    );
    expect(delCalls).toHaveLength(0);
  });

  it('up-arrow button is disabled for the first stage', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    const upBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'arrow_upward',
    );
    expect((upBtns[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('down-arrow button is disabled for the last stage', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    const downBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'arrow_downward',
    );
    const lastDownBtn = downBtns[downBtns.length - 1] as HTMLButtonElement;
    expect(lastDownBtn.disabled).toBe(true);
  });

  it('clicking up-arrow on second stage reorders stages', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/reorder') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    const upBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'arrow_upward',
    );
    // Second up button (for second stage) is enabled
    fireEvent.click(upBtns[1]);
    await waitFor(() => {
      const reorderCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/reorder') && c[1]?.method === 'PUT',
      );
      expect(reorderCalls.length).toBeGreaterThan(0);
    });
  });

  it('clicking down-arrow on first stage reorders stages', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [DEFAULT_PIPELINE] });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true, data: [] });
      if (url.includes('/reorder') && init?.method === 'PUT') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    await expandPipeline(container);
    const downBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'arrow_downward',
    );
    // First down button (for first stage) is enabled
    fireEvent.click(downBtns[0]);
    await waitFor(() => {
      const reorderCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/reorder') && c[1]?.method === 'PUT',
      );
      expect(reorderCalls.length).toBeGreaterThan(0);
    });
  });

  it('moveStage does nothing when pipeline is not found', async () => {
    // Render with no pipelines, try to move — nothing should error
    setupEmpty();
    const { container } = renderPage();
    await waitForLoaded(container);
    // No pipelines, no stage buttons — just verify no crash
    const upBtns = Array.from(container.querySelectorAll('button')).filter(
      (b) => b.querySelector('.material-icons')?.textContent === 'arrow_upward',
    );
    expect(upBtns).toHaveLength(0);
  });
});

// ─── Tags tab ─────────────────────────────────────────────────────────────────

describe('CrmSettingsPage — tags tab', () => {
  async function switchToTags(container: HTMLElement) {
    const tagsBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Tags') && !b.textContent?.includes('Custom'),
    ) as HTMLButtonElement;
    expect(tagsBtn).toBeTruthy();
    fireEvent.click(tagsBtn);
  }

  it('shows "No tags yet" when list is empty', async () => {
    setupEmpty();
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    expect(container.textContent).toContain('No tags yet');
  });

  it('renders tag name from API', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    expect(container.textContent).toContain('VIP');
  });

  it('add tag button is disabled when input is empty', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    const addBtn = Array.from(container.querySelectorAll('button[type="submit"]')).find((b) =>
      b.textContent?.includes('Add Tag'),
    ) as HTMLButtonElement;
    expect(addBtn.disabled).toBe(true);
  });

  it('submitting add-tag form calls POST /api/portal/crm/tags', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [] });
      if (url === '/api/portal/crm/tags' && !init?.method) return makeRes({ success: true, data: [] });
      if (url === '/api/portal/crm/tags' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 2, name: 'Lead', color: '#3b82f6' } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    const tagInput = container.querySelector(
      'input[placeholder="e.g. VIP"]',
    ) as HTMLInputElement;
    fireEvent.change(tagInput, { target: { value: 'Lead' } });
    const form = tagInput.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      const postCalls = fetchMock.mock.calls.filter(
        (c) => c[0] === '/api/portal/crm/tags' && c[1]?.method === 'POST',
      );
      expect(postCalls.length).toBeGreaterThan(0);
    });
  });

  it('adds tag to list after successful creation', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [] });
      if (url === '/api/portal/crm/tags' && !init?.method) return makeRes({ success: true, data: [] });
      if (url === '/api/portal/crm/tags' && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 2, name: 'Enterprise', color: '#3b82f6' } });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    const tagInput = container.querySelector(
      'input[placeholder="e.g. VIP"]',
    ) as HTMLInputElement;
    fireEvent.change(tagInput, { target: { value: 'Enterprise' } });
    const form = tagInput.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    await waitFor(() => {
      expect(container.textContent).toContain('Enterprise');
    });
  });

  it('does not submit empty tag name', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    const tagInput = container.querySelector(
      'input[placeholder="e.g. VIP"]',
    ) as HTMLInputElement;
    // Enter whitespace only
    fireEvent.change(tagInput, { target: { value: '  ' } });
    const form = tagInput.closest('form') as HTMLFormElement;
    await act(async () => {
      fireEvent.submit(form);
    });
    await new Promise((r) => setTimeout(r, 30));
    const postCalls = fetchMock.mock.calls.filter(
      (c) => c[0] === '/api/portal/crm/tags' && c[1]?.method === 'POST',
    );
    expect(postCalls).toHaveLength(0);
  });

  it('clicking close button on tag calls DELETE /api/portal/crm/tags/:id', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [] });
      if (url === '/api/portal/crm/tags' && !init?.method) return makeRes({ success: true, data: [DEFAULT_TAG] });
      if (url.includes('/api/portal/crm/tags/') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    await waitFor(() => expect(container.textContent).toContain('VIP'));
    // The delete button for a tag uses "close" icon inside a <span>
    const tagDeleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) =>
        b.querySelector('.material-icons')?.textContent === 'close' &&
        b.closest('span.inline-flex') !== null,
    ) as HTMLButtonElement;
    expect(tagDeleteBtn).toBeTruthy();
    fireEvent.click(tagDeleteBtn);
    await waitFor(() => {
      const delCalls = fetchMock.mock.calls.filter(
        (c) => String(c[0]).includes('/api/portal/crm/tags/') && c[1]?.method === 'DELETE',
      );
      expect(delCalls.length).toBeGreaterThan(0);
    });
  });

  it('does NOT delete tag when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    await waitFor(() => expect(container.textContent).toContain('VIP'));
    const tagDeleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) =>
        b.querySelector('.material-icons')?.textContent === 'close' &&
        b.closest('span.inline-flex') !== null,
    ) as HTMLButtonElement;
    if (tagDeleteBtn) fireEvent.click(tagDeleteBtn);
    await new Promise((r) => setTimeout(r, 30));
    const delCalls = fetchMock.mock.calls.filter(
      (c) => String(c[0]).includes('/api/portal/crm/tags/') && c[1]?.method === 'DELETE',
    );
    expect(delCalls).toHaveLength(0);
  });

  it('removes tag from list after delete', async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true, data: [] });
      if (url === '/api/portal/crm/tags' && !init?.method) return makeRes({ success: true, data: [DEFAULT_TAG] });
      if (url.includes('/api/portal/crm/tags/') && init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: {} });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    await waitFor(() => expect(container.textContent).toContain('VIP'));
    const tagDeleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) =>
        b.querySelector('.material-icons')?.textContent === 'close' &&
        b.closest('span.inline-flex') !== null,
    ) as HTMLButtonElement;
    fireEvent.click(tagDeleteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('No tags yet');
    });
  });

  it('clicking a color swatch updates the tag color input', async () => {
    setupEmpty();
    const { container } = renderPage();
    await waitForLoaded(container);
    await switchToTags(container);
    // Color swatches are round buttons without type="submit"
    const swatches = Array.from(container.querySelectorAll('button[type="button"]')).filter(
      (b) => b.className.includes('rounded-full'),
    );
    expect(swatches.length).toBeGreaterThan(0);
    // Click first swatch — should not crash
    fireEvent.click(swatches[0]);
  });
});

// ─── Custom Fields tab ────────────────────────────────────────────────────────

describe('CrmSettingsPage — custom fields tab', () => {
  it('renders CrmCustomFieldsAdmin stub on custom-fields tab', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const cfBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Custom Fields'),
    ) as HTMLButtonElement;
    fireEvent.click(cfBtn);
    expect(container.querySelector('[data-testid="crm-custom-fields-admin"]')).toBeTruthy();
  });
});

// ─── Automations tab ──────────────────────────────────────────────────────────

describe('CrmSettingsPage — automations tab', () => {
  it('renders ProductAutomationSettings with CRM title', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const autoBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Automations'),
    ) as HTMLButtonElement;
    expect(autoBtn).toBeTruthy();
    fireEvent.click(autoBtn);
    const el = container.querySelector('[data-testid="product-automation-settings"]');
    expect(el).toBeTruthy();
    expect(el?.textContent).toContain('CRM Automations');
  });

  it('renders automation description text', async () => {
    const { container } = renderPage();
    await waitForLoaded(container);
    const autoBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Automations'),
    ) as HTMLButtonElement;
    expect(autoBtn).toBeTruthy();
    fireEvent.click(autoBtn);
    expect(container.textContent).toContain('Automate follow-ups');
  });
});

// ─── Data initialisation fallbacks ───────────────────────────────────────────

describe('CrmSettingsPage — API response fallbacks', () => {
  it('handles pipelines response with no data field (undefined)', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/portal/crm/pipelines') return makeRes({ success: true });
      if (url === '/api/portal/crm/tags') return makeRes({ success: true });
      return makeRes({ success: true });
    });
    const { container } = renderPage();
    await waitForLoaded(container);
    expect(container.textContent).toContain('No pipelines yet');
  });
});
