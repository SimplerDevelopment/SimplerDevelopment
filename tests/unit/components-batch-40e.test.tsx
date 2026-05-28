// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// next/link — render plain anchor
vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, onClick, ...rest }: any) =>
    React.createElement('a', { href, onClick, ...rest }, children),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------

import NoteBacklinksPanel from '@/components/brain/NoteBacklinksPanel';
import NoteOutlinePanel from '@/components/brain/NoteOutlinePanel';
import NoteHistoryPanel from '@/components/brain/NoteHistoryPanel';
import TemplatesPickerButton from '@/components/brain/TemplatesPickerButton';

// ---------------------------------------------------------------------------
// fetch helper
// ---------------------------------------------------------------------------

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

function mockFetchOnce(resp: Partial<FetchResponse> & { body?: unknown }): void {
  const r: FetchResponse = {
    ok: resp.ok ?? true,
    status: resp.status ?? 200,
    json: () => Promise.resolve(resp.body ?? {}),
  };
  (globalThis as any).fetch = vi.fn().mockResolvedValue(r);
}

function mockFetchReject(err: unknown): void {
  (globalThis as any).fetch = vi.fn().mockRejectedValue(err);
}

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// NoteBacklinksPanel
// ---------------------------------------------------------------------------

describe('NoteBacklinksPanel', () => {
  it('renders loading state on first render before fetch resolves', () => {
    // Use a fetch that never resolves so we stay in loading state.
    (globalThis as any).fetch = vi.fn(() => new Promise(() => {}));
    render(<NoteBacklinksPanel noteId={1} />);
    expect(screen.getByText(/Loading backlinks/i)).toBeTruthy();
  });

  it('renders empty-state message when no backlinks returned', async () => {
    mockFetchOnce({ body: { success: true, data: { items: [] } } });
    render(<NoteBacklinksPanel noteId={42} />);
    await waitFor(() => {
      expect(screen.getByText(/No backlinks yet/i)).toBeTruthy();
    });
  });

  it('renders a list of backlinks with link, title, and snippet', async () => {
    mockFetchOnce({
      body: {
        success: true,
        data: {
          items: [
            {
              id: 7,
              title: 'Linked Note',
              snippet: 'some snippet preview text',
              displayText: null,
              updatedAt: '2025-01-01T00:00:00.000Z',
            },
          ],
        },
      },
    });
    render(<NoteBacklinksPanel noteId={1} />);
    const link = await screen.findByRole('link', { name: /Linked Note/ });
    expect(link.getAttribute('href')).toBe('/portal/brain/knowledge/7');
    expect(screen.getByText('some snippet preview text')).toBeTruthy();
  });

  it('renders error state when API responds non-ok', async () => {
    mockFetchOnce({ ok: false, status: 500, body: { success: false, message: 'boom' } });
    render(<NoteBacklinksPanel noteId={1} />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load backlinks/i)).toBeTruthy();
      expect(screen.getByText(/boom/)).toBeTruthy();
    });
  });

  it('renders error state when fetch throws a network error', async () => {
    mockFetchReject(new Error('offline'));
    render(<NoteBacklinksPanel noteId={1} />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load backlinks/i)).toBeTruthy();
      expect(screen.getByText(/offline/)).toBeTruthy();
    });
  });
});

// ---------------------------------------------------------------------------
// NoteOutlinePanel
// ---------------------------------------------------------------------------

describe('NoteOutlinePanel', () => {
  it('renders empty-state when body has no headings', () => {
    render(<NoteOutlinePanel body={'just paragraph text\nmore text'} />);
    expect(screen.getByText(/No headings yet/i)).toBeTruthy();
  });

  it('parses ATX headings and renders them as buttons with H<level> labels', () => {
    const body = '# Title\n## Sub\n### Sub-sub';
    render(<NoteOutlinePanel body={body} />);
    expect(screen.getByRole('button', { name: /H1\s*Title/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /H2\s*Sub/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /H3\s*Sub-sub/ })).toBeTruthy();
  });

  it('ignores headings inside fenced code blocks', () => {
    const body = '# Real\n```\n# fake-in-code\n```\n## Also Real';
    render(<NoteOutlinePanel body={body} />);
    expect(screen.getByRole('button', { name: /H1\s*Real/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /H2\s*Also Real/ })).toBeTruthy();
    expect(screen.queryByText(/fake-in-code/)).toBeNull();
  });

  it('strips trailing closing # characters from heading text', () => {
    render(<NoteOutlinePanel body={'## A heading ##'} />);
    expect(screen.getByRole('button', { name: /H2\s*A heading/ })).toBeTruthy();
  });

  it('invokes the editor view dispatch + focus when a heading is clicked', () => {
    const dispatch = vi.fn();
    const focus = vi.fn();
    const view: any = {
      state: { doc: { line: (n: number) => ({ from: n * 10 }) } },
      dispatch,
      focus,
    };
    render(<NoteOutlinePanel body={'# Hello'} getEditorView={() => view} />);
    fireEvent.click(screen.getByRole('button', { name: /Hello/ }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledTimes(1);
    const call = dispatch.mock.calls[0][0];
    expect(call.selection.anchor).toBe(10); // line index 0 + 1 → from 10
    expect(call.scrollIntoView).toBe(true);
  });

  it('does nothing when getEditorView returns null', () => {
    render(<NoteOutlinePanel body={'# Hello'} getEditorView={() => null} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /Hello/ }))).not.toThrow();
  });

  it('swallows errors thrown by the editor view dispatch', () => {
    const view: any = {
      state: {
        doc: {
          line: () => {
            throw new Error('out of range');
          },
        },
      },
      dispatch: vi.fn(),
      focus: vi.fn(),
    };
    render(<NoteOutlinePanel body={'# Hello'} getEditorView={() => view} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: /Hello/ }))).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// NoteHistoryPanel
// ---------------------------------------------------------------------------

describe('NoteHistoryPanel', () => {
  it('renders prompt when noteId is null', () => {
    render(<NoteHistoryPanel noteId={null} />);
    expect(screen.getByText(/Select a note to see its history/i)).toBeTruthy();
  });

  it('renders loading state while fetch is pending', () => {
    (globalThis as any).fetch = vi.fn(() => new Promise(() => {}));
    render(<NoteHistoryPanel noteId={5} />);
    expect(screen.getByText(/Loading history/i)).toBeTruthy();
  });

  it('renders empty-state when no history items', async () => {
    mockFetchOnce({ body: { success: true, data: { items: [] } } });
    render(<NoteHistoryPanel noteId={5} />);
    await waitFor(() => {
      expect(screen.getByText(/No history yet/i)).toBeTruthy();
    });
  });

  it('renders a known action with its mapped label and actor', async () => {
    mockFetchOnce({
      body: {
        success: true,
        data: {
          items: [
            {
              id: 1,
              action: 'create',
              actorId: 42,
              entityType: 'brain_kb_note',
              entityId: 5,
              metadata: null,
              createdAt: new Date().toISOString(),
            },
          ],
        },
      },
    });
    render(<NoteHistoryPanel noteId={5} />);
    expect(await screen.findByText('Created')).toBeTruthy();
    expect(screen.getByText('user #42')).toBeTruthy();
    expect(screen.getByText(/just now|ago/)).toBeTruthy();
  });

  it('renders "system" actor when actorId is null and falls back for unknown actions', async () => {
    mockFetchOnce({
      body: {
        success: true,
        data: {
          items: [
            {
              id: 2,
              action: 'mystery_action',
              actorId: null,
              entityType: null,
              entityId: null,
              metadata: { changedFields: ['title', 'body', 42] },
              createdAt: new Date(Date.now() - 3 * 60_000).toISOString(),
            },
          ],
        },
      },
    });
    render(<NoteHistoryPanel noteId={9} />);
    // Unknown action falls back to raw action string for label.
    expect(await screen.findByText('mystery_action')).toBeTruthy();
    expect(screen.getByText('system')).toBeTruthy();
    // changedFields chips render the string entries; the 42 is filtered out.
    expect(screen.getByText('title')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
    expect(screen.queryByText('42')).toBeNull();
  });

  it('renders error state when API responds non-ok', async () => {
    mockFetchOnce({ ok: false, status: 500, body: { success: false, message: 'kaput' } });
    render(<NoteHistoryPanel noteId={5} />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load history/i)).toBeTruthy();
      expect(screen.getByText(/kaput/)).toBeTruthy();
    });
  });

  it('renders error state when fetch rejects', async () => {
    mockFetchReject(new Error('no net'));
    render(<NoteHistoryPanel noteId={5} />);
    await waitFor(() => {
      expect(screen.getByText(/Failed to load history/i)).toBeTruthy();
      expect(screen.getByText(/no net/)).toBeTruthy();
    });
  });

  it('formats createdAt as days-ago for older items', async () => {
    const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
    mockFetchOnce({
      body: {
        success: true,
        data: {
          items: [
            {
              id: 3,
              action: 'update',
              actorId: 1,
              entityType: null,
              entityId: null,
              metadata: null,
              createdAt: fiveDaysAgo,
            },
          ],
        },
      },
    });
    render(<NoteHistoryPanel noteId={5} />);
    expect(await screen.findByText(/5d ago/)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// TemplatesPickerButton
// ---------------------------------------------------------------------------

describe('TemplatesPickerButton', () => {
  it('renders both the create and chevron buttons closed by default', () => {
    render(<TemplatesPickerButton onCreate={() => {}} onTemplateApplied={() => {}} />);
    expect(screen.getByRole('button', { name: 'New note' })).toBeTruthy();
    const chevron = screen.getByRole('button', { name: 'New note from template' });
    expect(chevron.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('invokes onCreate when the left "New note" button is clicked', () => {
    const onCreate = vi.fn();
    render(<TemplatesPickerButton onCreate={onCreate} onTemplateApplied={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'New note' }));
    expect(onCreate).toHaveBeenCalledTimes(1);
  });

  it('opens the menu and loads templates on chevron click', async () => {
    mockFetchOnce({
      body: {
        success: true,
        data: {
          items: [
            { id: 11, name: 'Meeting', body: '', trigger: 'mtg', defaultTags: ['team'] },
          ],
        },
      },
    });
    render(<TemplatesPickerButton onCreate={() => {}} onTemplateApplied={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'New note from template' }));
    expect(await screen.findByRole('menu')).toBeTruthy();
    expect(await screen.findByRole('menuitem', { name: /Meeting/ })).toBeTruthy();
    // The default tag chip is rendered.
    expect(screen.getByText('team')).toBeTruthy();
  });

  it('renders the empty-state when the templates list is empty', async () => {
    mockFetchOnce({ body: { success: true, data: { items: [] } } });
    render(<TemplatesPickerButton onCreate={() => {}} onTemplateApplied={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'New note from template' }));
    await waitFor(() => {
      expect(screen.getByText(/No templates yet/i)).toBeTruthy();
    });
  });

  it('renders an error message when the load fails', async () => {
    mockFetchOnce({ ok: false, status: 500, body: { success: false, message: 'load-fail' } });
    render(<TemplatesPickerButton onCreate={() => {}} onTemplateApplied={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'New note from template' }));
    await waitFor(() => {
      expect(screen.getByText(/Failed to load/i)).toBeTruthy();
      expect(screen.getByText(/load-fail/)).toBeTruthy();
    });
  });

  it('closes the menu on Escape key', async () => {
    mockFetchOnce({ body: { success: true, data: { items: [] } } });
    render(<TemplatesPickerButton onCreate={() => {}} onTemplateApplied={() => {}} />);
    const chevron = screen.getByRole('button', { name: 'New note from template' });
    fireEvent.click(chevron);
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('closes the menu on outside mousedown', async () => {
    mockFetchOnce({ body: { success: true, data: { items: [] } } });
    render(<TemplatesPickerButton onCreate={() => {}} onTemplateApplied={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'New note from template' }));
    await waitFor(() => expect(screen.getByRole('menu')).toBeTruthy());
    // Mousedown on document.body (outside the wrapper) should close.
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('applies a template and invokes onTemplateApplied with the created note', async () => {
    // First call: load templates. Second call: from-template POST.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              items: [{ id: 11, name: 'Meeting', body: '', trigger: 'mtg', defaultTags: [] }],
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: { id: 999, title: 'New Meeting' } }),
      });
    (globalThis as any).fetch = fetchMock;

    const onTemplateApplied = vi.fn();
    render(<TemplatesPickerButton onCreate={() => {}} onTemplateApplied={onTemplateApplied} />);
    fireEvent.click(screen.getByRole('button', { name: 'New note from template' }));
    const item = await screen.findByRole('menuitem', { name: /Meeting/ });
    fireEvent.click(item);
    await waitFor(() => {
      expect(onTemplateApplied).toHaveBeenCalledWith({ id: 999, title: 'New Meeting' });
    });
    // Second fetch call hits the from-template endpoint with POST.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe('/api/portal/brain/knowledge/from-template/11');
    expect(init.method).toBe('POST');
    // Menu should close after a successful apply.
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  it('shows the manage-templates link inside the menu', async () => {
    mockFetchOnce({ body: { success: true, data: { items: [] } } });
    render(<TemplatesPickerButton onCreate={() => {}} onTemplateApplied={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'New note from template' }));
    const manage = await screen.findByText(/Manage templates/);
    expect(manage).toBeTruthy();
    // The Link mock renders as <a href>.
    const anchor = manage.closest('a') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/portal/brain/templates');
  });
});
