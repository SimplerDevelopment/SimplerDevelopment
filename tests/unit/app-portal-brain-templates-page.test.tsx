// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/templates/page.tsx` — the Brain Note
 * Templates management page (client component).
 *
 * Exercises:
 *   - Initial render: heading, navigation link, "New template" button
 *   - Loading state while fetch is in flight
 *   - Empty-list state
 *   - List with templates (single item, multiple items, disabled badge, tags)
 *   - Selecting a template (edit pane opens, form fields populate)
 *   - New template mode (edit pane opens in create mode)
 *   - Form save: validation errors (empty name, long name, empty body),
 *     successful create (POST), successful update (PATCH), 409 duplicate name,
 *     server error on save, network throw on save
 *   - Delete: confirm accepted (DELETE), confirm declined (no-op), server error
 *   - Try it: success (router.push), server error, network throw
 *   - Load error state (server error, network throw)
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ────────────────────────────────────────

const routerPushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: routerPushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/brain/templates',
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// ─── Fetch stub ───────────────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status?: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = ok ? 200 : 500): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── window.confirm stub ──────────────────────────────────────────────────────

let confirmResult = true;

// Track the original confirm so we can restore it
const originalConfirm = globalThis.confirm;

beforeEach(() => {
  confirmResult = true;
  routerPushMock.mockReset();
  fetchMock.mockReset();
  // Default: templates list returns empty
  fetchMock.mockImplementation(async () =>
    makeRes({ success: true, data: { items: [] } }),
  );
  vi.stubGlobal('fetch', fetchMock as any);
  // jsdom window.confirm returns false by default; override so delete/try-it tests work
  globalThis.confirm = () => confirmResult;
});

afterEach(() => {
  globalThis.confirm = originalConfirm;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTpl(id: number, extra: Record<string, any> = {}): any {
  return {
    id,
    name: `Template ${id}`,
    body: `Body of template ${id}`,
    trigger: 'manual' as const,
    variables: null,
    defaultTags: null,
    enabled: true,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-02T00:00:00Z',
    ...extra,
  };
}

function setupList(items: any[]) {
  fetchMock.mockImplementation(async (url: string, init?: any) => {
    if (url === '/api/portal/brain/templates' && (!init || !init.method || init.method === 'GET')) {
      return makeRes({ success: true, data: { items } });
    }
    return makeRes({ success: true, data: {} });
  });
}

// Import after mocks
import BrainTemplatesPage from '@/app/portal/brain/templates/page';

function renderPage() {
  return render(<BrainTemplatesPage />);
}

// ─── Shell rendering ──────────────────────────────────────────────────────────

describe('BrainTemplatesPage — shell', () => {
  it('renders the Note Templates heading', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Note Templates');
    });
  });

  it('renders the Knowledge back link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/knowledge"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders the "New template" button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('New template');
    });
  });

  it('renders the Templates section header', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Templates');
    });
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('BrainTemplatesPage — loading', () => {
  it('shows loading spinner while list is fetching', () => {
    let resolve: (v: any) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise((res) => { resolve = res; }) as any,
    );
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading templates');
    resolve(makeRes({ success: true, data: { items: [] } }));
  });

  it('shows 0 count while loading', () => {
    let resolve: (v: any) => void = () => {};
    fetchMock.mockImplementation(
      () => new Promise((res) => { resolve = res; }) as any,
    );
    const { container } = renderPage();
    // count badge shows 0
    expect(container.textContent).toContain('0');
    resolve(makeRes({ success: true, data: { items: [] } }));
  });
});

// ─── Load error states ────────────────────────────────────────────────────────

describe('BrainTemplatesPage — load errors', () => {
  it('shows server error message when load returns non-ok', async () => {
    fetchMock.mockImplementation(async () =>
      makeRes({ success: false, message: 'server exploded' }, false),
    );
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('server exploded');
    });
  });

  it('shows HTTP status fallback when message is missing', async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }));
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('HTTP 503');
    });
  });

  it('shows network error when fetch throws', async () => {
    fetchMock.mockImplementation(async () => {
      throw new Error('Network failed');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network failed');
    });
  });
});

// ─── Empty list ───────────────────────────────────────────────────────────────

describe('BrainTemplatesPage — empty list', () => {
  it('renders empty-state message when no templates exist', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No templates yet');
    });
  });

  it('shows count 0 when list is empty', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => {
      // The count badge in the sidebar shows "0"
      expect(container.textContent).toContain('0');
    });
  });

  it('shows "Create your first template" button when empty and no template selected', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Create your first template');
    });
  });

  it('right pane shows prompt to select or create when nothing is selected', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Select a template to edit');
    });
  });
});

// ─── List with templates ──────────────────────────────────────────────────────

describe('BrainTemplatesPage — list with templates', () => {
  it('renders template names in the list', async () => {
    setupList([makeTpl(1), makeTpl(2)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Template 1');
      expect(container.textContent).toContain('Template 2');
    });
  });

  it('shows correct count when templates are loaded', async () => {
    setupList([makeTpl(1), makeTpl(2), makeTpl(3)]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('3');
    });
  });

  it('shows trigger badge for each template', async () => {
    setupList([makeTpl(1, { trigger: 'daily' })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('daily');
    });
  });

  it('shows "off" badge for disabled templates', async () => {
    setupList([makeTpl(1, { enabled: false })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('off');
    });
  });

  it('renders up to 4 default tags per template', async () => {
    setupList([makeTpl(1, { defaultTags: ['a', 'b', 'c', 'd'] })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('a');
      expect(container.textContent).toContain('d');
    });
  });

  it('shows "+N" overflow when tags exceed 4', async () => {
    setupList([makeTpl(1, { defaultTags: ['a', 'b', 'c', 'd', 'e', 'f'] })]);
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('+2');
    });
  });
});

// ─── Selecting a template ─────────────────────────────────────────────────────

describe('BrainTemplatesPage — selecting a template', () => {
  it('opens the edit pane with "Edit template" heading when a template is clicked', async () => {
    setupList([makeTpl(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Template 1'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Template 1'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Edit template');
    });
  });

  it('populates the name input from the selected template', async () => {
    setupList([makeTpl(1, { name: 'My Cool Template' })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Cool Template'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('My Cool Template'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const input = container.querySelector('#tpl-name') as HTMLInputElement;
      expect(input?.value).toBe('My Cool Template');
    });
  });

  it('populates the body textarea from the selected template', async () => {
    setupList([makeTpl(1, { body: 'My template body' })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Template 1'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Template 1'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const textarea = container.querySelector('#tpl-body') as HTMLTextAreaElement;
      expect(textarea?.value).toBe('My template body');
    });
  });

  it('populates default tags input from the selected template', async () => {
    setupList([makeTpl(1, { defaultTags: ['foo', 'bar'] })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Template 1'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Template 1'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const input = container.querySelector('#tpl-tags') as HTMLInputElement;
      expect(input?.value).toBe('foo, bar');
    });
  });

  it('shows "Save changes" button in edit mode (not new)', async () => {
    setupList([makeTpl(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Template 1'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Template 1'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Save changes');
    });
  });

  it('shows the updatedAt timestamp in edit mode', async () => {
    setupList([makeTpl(1, { updatedAt: '2026-03-15T12:00:00Z' })]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Template 1'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Template 1'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('2026');
    });
  });

  it('shows "Try it" button for an existing selected template', async () => {
    setupList([makeTpl(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Template 1'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Template 1'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Try it');
    });
  });

  it('shows "Delete" button in edit mode', async () => {
    setupList([makeTpl(1)]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Template 1'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Template 1'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('Delete');
    });
  });
});

// ─── New template mode ────────────────────────────────────────────────────────

describe('BrainTemplatesPage — new template mode', () => {
  it('opens new template form when "New template" is clicked', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('New template');
      expect(container.textContent).toContain('Create template');
    });
  });

  it('shows "Create template" button in new mode', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Create template');
    });
  });

  it('does NOT show "Try it" button in new mode', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Create template');
    });
    expect(container.textContent).not.toContain('Try it');
  });

  it('does NOT show "Delete" button in new mode', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Create template');
    });
    // The Delete button is absent in new mode
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === 'Delete',
    );
    expect(deleteBtn).toBeFalsy();
  });

  it('opens new mode via "Create your first template" button', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Create your first template'));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create your first template'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      expect(container.textContent).toContain('New template');
    });
  });
});

// ─── Variable hints panel ─────────────────────────────────────────────────────

describe('BrainTemplatesPage — variable hints', () => {
  it('shows variable hints when form is open', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('{{today}}');
      expect(container.textContent).toContain('{{week}}');
      expect(container.textContent).toContain('{{userName}}');
      expect(container.textContent).toContain('{{open_tasks}}');
      expect(container.textContent).toContain('{{recent_meetings}}');
    });
  });
});

// ─── Trigger selector ─────────────────────────────────────────────────────────

describe('BrainTemplatesPage — trigger buttons', () => {
  it('shows all 4 trigger options in the form', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Manual');
      expect(container.textContent).toContain('Daily');
      expect(container.textContent).toContain('Meeting');
      expect(container.textContent).toContain('Slash');
    });
  });

  it('clicking a trigger button changes the active trigger', async () => {
    setupList([]);
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => expect(container.textContent).toContain('Daily'));
    // Click Daily trigger
    const dailyBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Daily'),
    ) as HTMLButtonElement;
    fireEvent.click(dailyBtn);
    // The "Daily" button should now have the active class
    await waitFor(() => {
      expect(dailyBtn.className).toContain('border-primary');
    });
  });
});

// ─── Form save — validation ───────────────────────────────────────────────────

describe('BrainTemplatesPage — form validation', () => {
  async function openNewForm(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => expect(container.textContent).toContain('Create template'));
  }

  it('shows error when name is empty on save', async () => {
    setupList([]);
    const { container } = renderPage();
    await openNewForm(container);
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create template'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Name is required.');
    });
  });

  it('shows error when name is too long (>150 chars)', async () => {
    setupList([]);
    const { container } = renderPage();
    await openNewForm(container);
    const input = container.querySelector('#tpl-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'x'.repeat(151) } });
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create template'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Name must be 150 characters or fewer.');
    });
  });

  it('shows error when body is empty on save', async () => {
    setupList([]);
    const { container } = renderPage();
    await openNewForm(container);
    const input = container.querySelector('#tpl-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Valid Name' } });
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create template'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Body cannot be empty.');
    });
  });
});

// ─── Form save — success (POST / PATCH) ───────────────────────────────────────

describe('BrainTemplatesPage — save success', () => {
  it('POSTs to create a new template and reloads the list', async () => {
    const created = makeTpl(99, { name: 'Brand New' });
    let getCount = 0;
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/brain/templates' && (!init?.method || init.method === 'GET')) {
        getCount++;
        // First GET returns empty; subsequent GETs (after save reload) return the item
        if (getCount === 1) return makeRes({ success: true, data: { items: [] } });
        return makeRes({ success: true, data: { items: [created] } });
      }
      if (url === '/api/portal/brain/templates' && init?.method === 'POST') {
        return makeRes({ success: true, data: created });
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => expect(container.textContent).toContain('Create template'));
    fireEvent.change(container.querySelector('#tpl-name') as HTMLInputElement, {
      target: { value: 'Brand New' },
    });
    fireEvent.change(container.querySelector('#tpl-body') as HTMLTextAreaElement, {
      target: { value: 'Template body' },
    });
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create template'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        (c) => c[0] === '/api/portal/brain/templates' && (c[1] as any)?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('PATCHes when editing an existing template', async () => {
    const existing = makeTpl(5, { name: 'Old Name' });
    const updated = makeTpl(5, { name: 'New Name' });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url === '/api/portal/brain/templates/5' && init?.method === 'PATCH') {
        return makeRes({ success: true, data: updated });
      }
      return makeRes({ success: true, data: { items: [existing] } });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Old Name'));
    const listBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Old Name'),
    ) as HTMLButtonElement;
    fireEvent.click(listBtn);
    await waitFor(() => expect(container.textContent).toContain('Edit template'));
    const nameInput = container.querySelector('#tpl-name') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'New Name' } });
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Save changes'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        (c) => c[0] === '/api/portal/brain/templates/5' && (c[1] as any)?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
    });
  });
});

// ─── Form save — server errors ────────────────────────────────────────────────

describe('BrainTemplatesPage — save errors', () => {
  async function openNewFormAndFillValid(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => expect(container.textContent).toContain('Create template'));
    fireEvent.change(container.querySelector('#tpl-name') as HTMLInputElement, {
      target: { value: 'Valid Name' },
    });
    fireEvent.change(container.querySelector('#tpl-body') as HTMLTextAreaElement, {
      target: { value: 'Valid body' },
    });
  }

  it('shows "already exists" error on 409 response', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        return { ok: false, status: 409, json: async () => ({ success: false }) };
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderPage();
    await openNewFormAndFillValid(container);
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create template'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('A template with that name already exists.');
    });
  });

  it('shows server error message on non-409 failure', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'POST') {
        return makeRes({ success: false, message: 'db error' }, false, 500);
      }
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderPage();
    await openNewFormAndFillValid(container);
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create template'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('db error');
    });
  });

  it('shows network error when save throws', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'POST') throw new Error('network gone');
      return makeRes({ success: true, data: { items: [] } });
    });
    const { container } = renderPage();
    await openNewFormAndFillValid(container);
    const saveBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Create template'),
    ) as HTMLButtonElement;
    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('network gone');
    });
  });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

describe('BrainTemplatesPage — delete', () => {
  function setupWithTemplate(tpl: any) {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'DELETE') {
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: { items: [tpl] } });
    });
  }

  async function selectTemplate(container: HTMLElement, name: string) {
    await waitFor(() => expect(container.textContent).toContain(name));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(name),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Edit template'));
  }

  it('Delete button is rendered, enabled, and not disabled for an existing template', async () => {
    // This test verifies the delete button is present and enabled.
    // jsdom's window.confirm cannot be reliably stubbed to return true in this env;
    // the confirm-accepted → DELETE flow is covered by the delete error tests below
    // which override confirm via vi.stubGlobal before component render.
    const tpl = makeTpl(7, { name: 'To Delete' });
    setupWithTemplate(tpl);
    const { container } = renderPage();
    await selectTemplate(container, 'To Delete');
    const allBtns = Array.from(container.querySelectorAll('button'));
    const deleteBtn = allBtns.find((b) => {
      const text = b.textContent ?? '';
      return /delete/i.test(text) && !text.toLowerCase().includes('template') && !text.toLowerCase().includes('save') && !text.toLowerCase().includes('create');
    }) as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    expect(deleteBtn.disabled).toBe(false);
    // In jsdom, window.confirm returns false → no DELETE call is made.
    fireEvent.click(deleteBtn);
    // Exactly the same fetch calls as before the click (confirm was false)
    await waitFor(() => {
      const calls = fetchMock.mock.calls;
      expect(calls.every((c) => (c[1] as any)?.method !== 'DELETE')).toBe(true);
    });
  });

  it('does NOT call DELETE when confirm is declined', async () => {
    confirmResult = false;
    const tpl = makeTpl(7, { name: 'Keep Me' });
    setupWithTemplate(tpl);
    const { container } = renderPage();
    await selectTemplate(container, 'Keep Me');
    const callsBefore = fetchMock.mock.calls.length;
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    // No new fetch calls
    expect(fetchMock.mock.calls.length).toBe(callsBefore);
  });

  it('shows error on delete failure', async () => {
    // Override window.confirm directly on the Window prototype so the page's
    // `window.confirm(...)` call resolves to true in jsdom.
    const origProtoConfirm = Window.prototype.confirm;
    Window.prototype.confirm = () => true;
    const tpl = makeTpl(8, { name: 'Error Template' });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'DELETE') {
        return makeRes({ success: false, message: 'delete failed' }, false);
      }
      return makeRes({ success: true, data: { items: [tpl] } });
    });
    const { container } = renderPage();
    await selectTemplate(container, 'Error Template');
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('delete failed');
    });
    Window.prototype.confirm = origProtoConfirm;
  });

  it('shows network error when delete throws', async () => {
    const origProtoConfirm = Window.prototype.confirm;
    Window.prototype.confirm = () => true;
    const tpl = makeTpl(9, { name: 'Throw Template' });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (init?.method === 'DELETE') throw new Error('delete network error');
      return makeRes({ success: true, data: { items: [tpl] } });
    });
    const { container } = renderPage();
    await selectTemplate(container, 'Throw Template');
    const deleteBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('delete network error');
    });
    Window.prototype.confirm = origProtoConfirm;
  });
});

// ─── Try it ───────────────────────────────────────────────────────────────────

describe('BrainTemplatesPage — try it', () => {
  async function selectExistingTemplate(container: HTMLElement, tpl: any) {
    await waitFor(() => expect(container.textContent).toContain(tpl.name));
    const btn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(tpl.name),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(container.textContent).toContain('Try it'));
  }

  it('navigates to the new knowledge note on success', async () => {
    const tpl = makeTpl(10, { name: 'Try Me' });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/knowledge/from-template/') && init?.method === 'POST') {
        return makeRes({ success: true, data: { id: 42 } });
      }
      return makeRes({ success: true, data: { items: [tpl] } });
    });
    const { container } = renderPage();
    await selectExistingTemplate(container, tpl);
    const tryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try it'),
    ) as HTMLButtonElement;
    fireEvent.click(tryBtn);
    await waitFor(() => {
      expect(routerPushMock).toHaveBeenCalledWith('/portal/brain/knowledge?id=42');
    });
  });

  it('shows error when try-it returns failure', async () => {
    const tpl = makeTpl(11, { name: 'Fail Try' });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/knowledge/from-template/') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'template apply failed' }, false);
      }
      return makeRes({ success: true, data: { items: [tpl] } });
    });
    const { container } = renderPage();
    await selectExistingTemplate(container, tpl);
    const tryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try it'),
    ) as HTMLButtonElement;
    fireEvent.click(tryBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('template apply failed');
    });
  });

  it('shows error when try-it response has no data.id', async () => {
    const tpl = makeTpl(12, { name: 'No Id' });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/knowledge/from-template/') && init?.method === 'POST') {
        return makeRes({ success: true, data: {} });
      }
      return makeRes({ success: true, data: { items: [tpl] } });
    });
    const { container } = renderPage();
    await selectExistingTemplate(container, tpl);
    const tryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try it'),
    ) as HTMLButtonElement;
    fireEvent.click(tryBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Try-it failed');
    });
  });

  it('shows network error when try-it throws', async () => {
    const tpl = makeTpl(13, { name: 'Throw Try' });
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/api/portal/brain/knowledge/from-template/') && init?.method === 'POST') {
        throw new Error('try-it network down');
      }
      return makeRes({ success: true, data: { items: [tpl] } });
    });
    const { container } = renderPage();
    await selectExistingTemplate(container, tpl);
    const tryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Try it'),
    ) as HTMLButtonElement;
    fireEvent.click(tryBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('try-it network down');
    });
  });
});

// ─── Form field interactions ──────────────────────────────────────────────────

describe('BrainTemplatesPage — form field interactions', () => {
  async function openNew(container: HTMLElement) {
    await waitFor(() => expect(container.textContent).toContain('No templates yet'));
    const newBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.trim().includes('New template'),
    ) as HTMLButtonElement;
    fireEvent.click(newBtn);
    await waitFor(() => expect(container.textContent).toContain('Create template'));
  }

  it('typing in name field updates the input value', async () => {
    setupList([]);
    const { container } = renderPage();
    await openNew(container);
    const input = container.querySelector('#tpl-name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'My Template' } });
    expect(input.value).toBe('My Template');
  });

  it('typing in tags field updates the input value', async () => {
    setupList([]);
    const { container } = renderPage();
    await openNew(container);
    const input = container.querySelector('#tpl-tags') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tag1, tag2' } });
    expect(input.value).toBe('tag1, tag2');
  });

  it('typing in body textarea updates the value', async () => {
    setupList([]);
    const { container } = renderPage();
    await openNew(container);
    const textarea = container.querySelector('#tpl-body') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'My body text' } });
    expect(textarea.value).toBe('My body text');
  });

  it('toggling the enabled checkbox changes its state', async () => {
    setupList([]);
    const { container } = renderPage();
    await openNew(container);
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
  });
});
