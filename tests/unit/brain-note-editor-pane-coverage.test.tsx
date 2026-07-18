// @vitest-environment jsdom
/**
 * Unit tests for `components/brain/NoteEditorPane.tsx`.
 *
 * Covers: empty state (null noteId), loading state, error/not-found state,
 * note loaded + editing state, title input changes, save handler (success,
 * failure, network error, empty title), auto-save debounce trigger,
 * delete flow (confirm/cancel), patchMeta helper, topics attach/detach
 * diffing (success, failure, rollback), SaveStatus all four states,
 * onEditorReady callback, onTitleChange/onBodyChange propagation.
 *
 * All child components (MarkdownEditor, NoteActionButtons, NoteMetaStrip,
 * TopicPicker, DataviewBlock) are mocked to keep the test surface narrow.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import type { BrainNote } from '@/lib/brain/types';

// ─── Mocks (must precede component import) ──────────────────────────────────

// Lightweight stand-in for MarkdownEditor: renders a textarea + an "onSave"
// trigger button so we can exercise those callbacks without CodeMirror.
vi.mock('@/components/brain/MarkdownEditor', () => ({
  __esModule: true,
  default: function MarkdownEditorStub({
    value,
    onChange,
    onSave,
    onEditorReady,
  }: {
    value: string;
    onChange: (v: string) => void;
    onSave?: () => void;
    onEditorReady?: (view: null) => void;
    [key: string]: unknown;
  }) {
    React.useEffect(() => {
      onEditorReady?.(null);
    }, [onEditorReady]);
    return React.createElement(
      'div',
      { 'data-testid': 'markdown-editor' },
      React.createElement('textarea', {
        'aria-label': 'Note body',
        value,
        onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value),
      }),
      React.createElement('button', {
        type: 'button',
        onClick: () => onSave?.(),
        'data-testid': 'trigger-save',
      }, 'Trigger Save'),
    );
  },
}));

vi.mock('@/components/brain/DataviewBlock', () => ({
  __esModule: true,
  makeDataviewCodeOverride: () => () => null,
}));

// NoteActionButtons: render a delete button and a generic patch button.
vi.mock('@/components/brain/NoteActionButtons', () => ({
  __esModule: true,
  default: ({
    onDelete,
    onPatch,
  }: {
    note: BrainNote;
    onDelete: () => void;
    onPatch: (patch: Partial<BrainNote>) => void;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'note-action-buttons' },
      React.createElement('button', { type: 'button', onClick: onDelete, 'data-testid': 'delete-btn' }, 'Delete'),
      React.createElement('button', {
        type: 'button',
        onClick: () => onPatch({ pinned: true }),
        'data-testid': 'patch-btn',
      }, 'Patch'),
    ),
}));

vi.mock('@/components/brain/NoteMetaStrip', () => ({
  __esModule: true,
  default: ({
    onPatch,
  }: {
    note: BrainNote;
    onPatch: (patch: Partial<BrainNote>) => void;
  }) =>
    React.createElement('button', {
      type: 'button',
      'data-testid': 'meta-strip-patch',
      onClick: () => onPatch({ tags: ['x'] }),
    }, 'Meta Patch'),
}));

// TopicPicker: renders a button that fires onChange with a test value.
vi.mock('@/components/brain/TopicPicker', () => ({
  __esModule: true,
  default: ({
    selectedTopicIds,
    onChange,
  }: {
    selectedTopicIds: number[];
    onChange: (ids: number[]) => void;
    [key: string]: unknown;
  }) =>
    React.createElement(
      'div',
      { 'data-testid': 'topic-picker' },
      React.createElement('span', { 'data-testid': 'topic-count' }, String(selectedTopicIds.length)),
      React.createElement('button', {
        type: 'button',
        'data-testid': 'topic-add',
        onClick: () => onChange([...selectedTopicIds, 99]),
      }, 'Add Topic'),
      React.createElement('button', {
        type: 'button',
        'data-testid': 'topic-remove',
        onClick: () => onChange([]),
      }, 'Remove All Topics'),
    ),
}));

// ─── Component under test ────────────────────────────────────────────────────
import NoteEditorPane from '@/components/brain/NoteEditorPane';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeNote(over: Partial<BrainNote> = {}): BrainNote {
  return {
    id: 1,
    title: 'Test Note',
    body: 'Hello world',
    tags: [],
    meetingId: null,
    relationshipOverlayId: null,
    companyId: null,
    dealId: null,
    contactId: null,
    confidentialityLevel: 'standard',
    pinned: false,
    source: 'manual',
    attachmentUrl: null,
    attachmentFilename: null,
    attachmentMimeType: null,
    attachmentFileSize: null,
    sourceUrl: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...over,
  };
}

type FetchArgs = [url: string, init?: RequestInit];

function mockFetch(responses: Array<{ ok: boolean; data: unknown }>) {
  let callIndex = 0;
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;
    return {
      ok: resp.ok,
      status: resp.ok ? 200 : 500,
      json: async () => resp.data,
    };
  });
  (global as unknown as { fetch: typeof fn }).fetch = fn;
  return fn;
}

function mockFetchReject(message = 'Network error') {
  const fn = vi.fn(async () => { throw new Error(message); });
  (global as unknown as { fetch: typeof fn }).fetch = fn;
  return fn;
}

// Stub window.confirm — default allows deletion.
function stubConfirm(returnValue: boolean) {
  vi.spyOn(window, 'confirm').mockReturnValue(returnValue);
}

// ─── Setup / teardown ────────────────────────────────────────────────────────

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ─── Empty state (noteId = null) ─────────────────────────────────────────────

describe('NoteEditorPane — empty state (noteId = null)', () => {
  it('renders the "No note selected" message', () => {
    render(<NoteEditorPane noteId={null} />);
    expect(screen.getByText('No note selected')).toBeInTheDocument();
  });

  it('does not render the New Note button when onCreate is not provided', () => {
    render(<NoteEditorPane noteId={null} />);
    expect(screen.queryByRole('button', { name: /new note/i })).not.toBeInTheDocument();
  });

  it('renders the New Note button when onCreate is provided', () => {
    const onCreate = vi.fn();
    render(<NoteEditorPane noteId={null} onCreate={onCreate} />);
    expect(screen.getByRole('button', { name: /new note/i })).toBeInTheDocument();
  });

  it('calls onCreate when the New Note button is clicked', () => {
    const onCreate = vi.fn();
    render(<NoteEditorPane noteId={null} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /new note/i }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('does not call fetch when noteId is null', () => {
    const fetchFn = mockFetch([{ ok: true, data: {} }]);
    render(<NoteEditorPane noteId={null} />);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('NoteEditorPane — loading state', () => {
  it('shows a spinner while fetching the note', async () => {
    // Mock fetch that never resolves so we stay in loading.
    (global as unknown as { fetch: () => Promise<never> }).fetch = vi.fn(() => new Promise(() => {}));
    render(<NoteEditorPane noteId={1} />);
    // Loading state is visible immediately before the fetch settles.
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});

// ─── Error / note-not-found state ────────────────────────────────────────────

describe('NoteEditorPane — error state', () => {
  it('shows an error message when the API returns success=false', async () => {
    mockFetch([
      { ok: true, data: { success: false, message: 'Note not found' } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });
    expect(screen.getByText('Note not found')).toBeInTheDocument();
  });

  it('shows a fallback error message when no message field', async () => {
    mockFetch([
      { ok: true, data: { success: false } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });
    expect(screen.getByText(/failed to load note/i)).toBeInTheDocument();
  });

  it('shows network error text on fetch rejection', async () => {
    mockFetchReject('Connection refused');
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });
    expect(screen.getByText('Connection refused')).toBeInTheDocument();
  });

  it('shows generic network error for non-Error throws', async () => {
    (global as unknown as { fetch: () => Promise<never> }).fetch = vi.fn(async () => {
      throw 'not an Error object';
    });
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });
    expect(screen.getByText(/network error/i)).toBeInTheDocument();
  });
});

// ─── Loaded note state ────────────────────────────────────────────────────────

describe('NoteEditorPane — loaded note', () => {
  async function renderLoaded(over: Partial<BrainNote> = {}, extraProps: Record<string, unknown> = {}) {
    const note = makeNote(over);
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [3, 7] } } },
    ]);
    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(<NoteEditorPane noteId={1} {...extraProps} />);
    });
    return { result, note };
  }

  it('renders the title input with the loaded note title', async () => {
    await renderLoaded({ title: 'My Note' });
    expect(screen.getByRole('textbox', { name: /note title/i })).toHaveValue('My Note');
  });

  it('renders the MarkdownEditor with the note body', async () => {
    await renderLoaded({ body: 'Some content' });
    expect(screen.getByTestId('markdown-editor')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /note body/i })).toHaveValue('Some content');
  });

  it('renders NoteActionButtons and NoteMetaStrip', async () => {
    await renderLoaded();
    expect(screen.getByTestId('note-action-buttons')).toBeInTheDocument();
    expect(screen.getByTestId('meta-strip-patch')).toBeInTheDocument();
  });

  it('seeds topic ids from the for-entity endpoint', async () => {
    await renderLoaded();
    // TopicPicker receives the fetched topic IDs (2 ids = "2" in the badge).
    expect(screen.getByTestId('topic-count')).toHaveTextContent('2');
  });

  it('calls onEditorReady with the view when MarkdownEditor mounts', async () => {
    const onEditorReady = vi.fn();
    await renderLoaded({}, { onEditorReady });
    expect(onEditorReady).toHaveBeenCalled();
  });

  it('calls onTitleChange with the initial title on mount', async () => {
    const onTitleChange = vi.fn();
    await renderLoaded({ title: 'Hello' }, { onTitleChange });
    expect(onTitleChange).toHaveBeenCalledWith('Hello');
  });

  it('calls onBodyChange with the initial body on mount', async () => {
    const onBodyChange = vi.fn();
    await renderLoaded({ body: 'World' }, { onBodyChange });
    expect(onBodyChange).toHaveBeenCalledWith('World');
  });

  it('handles note with null body gracefully (empty string)', async () => {
    const note = makeNote({ body: '' });
    mockFetch([
      { ok: true, data: { success: true, data: { ...note, body: null } } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });
    expect(screen.getByRole('textbox', { name: /note body/i })).toHaveValue('');
  });

  it('resets to empty state when noteId changes to null', async () => {
    const note = makeNote();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
    ]);
    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      const r = render(<NoteEditorPane noteId={1} />);
      rerender = r.rerender;
    });
    act(() => { rerender(<NoteEditorPane noteId={null} />); });
    expect(screen.getByText('No note selected')).toBeInTheDocument();
  });
});

// ─── Title editing ────────────────────────────────────────────────────────────

describe('NoteEditorPane — title editing', () => {
  async function renderLoaded() {
    const note = makeNote({ title: 'Original' });
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
    ]);
    let result!: ReturnType<typeof render>;
    await act(async () => {
      result = render(<NoteEditorPane noteId={1} />);
    });
    return result;
  }

  it('updates the title input on change', async () => {
    await renderLoaded();
    const input = screen.getByRole('textbox', { name: /note title/i });
    fireEvent.change(input, { target: { value: 'Updated Title' } });
    expect(input).toHaveValue('Updated Title');
  });

  it('fires onTitleChange when title input changes', async () => {
    const onTitleChange = vi.fn();
    const note = makeNote({ title: 'Original' });
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} onTitleChange={onTitleChange} />);
    });
    onTitleChange.mockClear();
    const input = screen.getByRole('textbox', { name: /note title/i });
    fireEvent.change(input, { target: { value: 'New' } });
    expect(onTitleChange).toHaveBeenCalledWith('New');
  });

  it('shows the dirty indicator (●) when title differs from saved', async () => {
    await renderLoaded();
    const input = screen.getByRole('textbox', { name: /note title/i });
    fireEvent.change(input, { target: { value: 'Changed' } });
    expect(screen.getByText('●')).toBeInTheDocument();
  });
});

// ─── Save handler ─────────────────────────────────────────────────────────────

describe('NoteEditorPane — save handler', () => {
  it('calls PATCH and shows "Saved" pip on success', async () => {
    const note = makeNote();
    const savedNote = makeNote({ title: 'Saved Title' });
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: true, data: { success: true, data: savedNote } },
    ]);
    const onSaved = vi.fn();
    await act(async () => {
      render(<NoteEditorPane noteId={1} onSaved={onSaved} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-save'));
    });

    expect(screen.getByText('Saved')).toBeInTheDocument();
    expect(onSaved).toHaveBeenCalledWith(savedNote);
  });

  it('shows error pip on save failure (API returns success=false)', async () => {
    const note = makeNote();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: false, data: { success: false, message: 'DB error' } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-save'));
    });

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('DB error')).toBeInTheDocument();
  });

  it('shows error state on save network failure', async () => {
    const note = makeNote({ title: 'Note with Error' });
    // First two fetches (load note + topics) succeed; third throws.
    let callCount = 0;
    (global as unknown as { fetch: (...args: FetchArgs) => Promise<unknown> }).fetch = vi.fn(
      async (url: string, _init?: RequestInit) => {
        callCount++;
        if (String(url).includes('for-entity')) {
          return { ok: true, status: 200, json: async () => ({ success: true, data: { topicIds: [] } }) };
        }
        if (callCount === 1) {
          return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
        }
        throw new Error('Network failure');
      },
    );
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-save'));
    });

    expect(screen.getByText('Error')).toBeInTheDocument();
  });

  it('shows "Title is required." when saving with blank title', async () => {
    const note = makeNote({ title: 'X' });
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    // Clear the title.
    const input = screen.getByRole('textbox', { name: /note title/i });
    fireEvent.change(input, { target: { value: '   ' } });

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-save'));
    });

    expect(screen.getByText('Title is required.')).toBeInTheDocument();
  });

  it('the "Saved" pip disappears after 2s', async () => {
    const note = makeNote();
    const savedNote = makeNote();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: true, data: { success: true, data: savedNote } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-save'));
    });

    expect(screen.getByText('Saved')).toBeInTheDocument();

    act(() => { vi.advanceTimersByTime(2001); });
    expect(screen.queryByText('Saved')).not.toBeInTheDocument();
  });
});

// ─── Auto-save debounce ───────────────────────────────────────────────────────

describe('NoteEditorPane — auto-save debounce', () => {
  it('auto-saves after 1500ms of inactivity on body change', async () => {
    const note = makeNote({ body: 'Original' });
    const savedNote = makeNote({ body: 'Updated' });
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: true, data: { success: true, data: savedNote } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const initialCallCount = fetchFn.mock.calls.length;

    const bodyInput = screen.getByRole('textbox', { name: /note body/i });
    fireEvent.change(bodyInput, { target: { value: 'Updated' } });

    // Before timer fires — no additional fetch yet.
    expect(fetchFn.mock.calls.length).toBe(initialCallCount);

    await act(async () => { vi.advanceTimersByTime(1500); });

    // After debounce — PATCH should have been called.
    expect(fetchFn.mock.calls.length).toBeGreaterThan(initialCallCount);
    const lastCall = fetchFn.mock.calls[fetchFn.mock.calls.length - 1];
    expect((lastCall[1] as RequestInit)?.method).toBe('PATCH');
  });

  it('does NOT auto-save when the note is not dirty', async () => {
    const note = makeNote();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const initialCallCount = fetchFn.mock.calls.length;

    act(() => { vi.advanceTimersByTime(3000); });

    expect(fetchFn.mock.calls.length).toBe(initialCallCount);
  });
});

// ─── Delete handler ───────────────────────────────────────────────────────────

describe('NoteEditorPane — delete', () => {
  async function renderWithNote() {
    const note = makeNote({ title: 'Delete Me' });
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} onDeleted={vi.fn()} />);
    });
    return note;
  }

  it('calls onDeleted after successful delete with confirm=true', async () => {
    stubConfirm(true);
    const onDeleted = vi.fn();
    const note = makeNote({ title: 'Delete Me' });
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: true, data: { success: true } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} onDeleted={onDeleted} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-btn'));
    });

    expect(onDeleted).toHaveBeenCalledWith(1);
  });

  it('does not delete when confirm returns false', async () => {
    stubConfirm(false);
    await renderWithNote();
    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const callsBefore = fetchFn.mock.calls.length;

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-btn'));
    });

    expect(fetchFn.mock.calls.length).toBe(callsBefore);
  });

  it('shows error when delete API fails', async () => {
    stubConfirm(true);
    const note = makeNote({ title: 'Delete Me' });
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: false, data: { success: false, message: 'Cannot delete' } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-btn'));
    });

    expect(screen.getByText('Cannot delete')).toBeInTheDocument();
  });
});

// ─── patchMeta helper ─────────────────────────────────────────────────────────

describe('NoteEditorPane — patchMeta', () => {
  it('patches via NoteActionButtons and updates note state on success', async () => {
    const note = makeNote();
    const patchedNote = makeNote({ pinned: true });
    const onSaved = vi.fn();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: true, data: { success: true, data: patchedNote } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} onSaved={onSaved} />);
    });
    onSaved.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByTestId('patch-btn'));
    });

    expect(onSaved).toHaveBeenCalledWith(patchedNote);
  });

  it('shows error when patchMeta API fails', async () => {
    const note = makeNote();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: false, data: { success: false, message: 'Patch failed' } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('patch-btn'));
    });

    expect(screen.getByText('Patch failed')).toBeInTheDocument();
  });

  it('patches via NoteMetaStrip as well', async () => {
    const note = makeNote();
    const patchedNote = makeNote({ tags: ['x'] });
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: true, data: { success: true, data: patchedNote } },
    ]);
    const onSaved = vi.fn();
    await act(async () => {
      render(<NoteEditorPane noteId={1} onSaved={onSaved} />);
    });
    onSaved.mockClear();

    await act(async () => {
      fireEvent.click(screen.getByTestId('meta-strip-patch'));
    });

    expect(onSaved).toHaveBeenCalledWith(patchedNote);
  });
});

// ─── Topic attach/detach ──────────────────────────────────────────────────────

describe('NoteEditorPane — topics change', () => {
  it('calls attach endpoint when adding a topic', async () => {
    const note = makeNote();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: true, data: { success: true } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('topic-add'));
    });

    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const lastCall = fetchFn.mock.calls[fetchFn.mock.calls.length - 1];
    expect(lastCall[0]).toContain('/topics/attach');
    expect((lastCall[1] as RequestInit).method).toBe('POST');
  });

  it('calls detach endpoint when removing a topic', async () => {
    const note = makeNote();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      // Seed with topic 99 so "Remove All" creates a diff.
      { ok: true, data: { success: true, data: { topicIds: [99] } } },
      { ok: true, data: { success: true } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('topic-remove'));
    });

    const fetchFn = (global as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
    const lastCall = fetchFn.mock.calls[fetchFn.mock.calls.length - 1];
    expect(lastCall[0]).toContain('/topics/attach');
    expect((lastCall[1] as RequestInit).method).toBe('DELETE');
  });

  it('rolls back topic selection on attach failure', async () => {
    const note = makeNote();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      // attach call fails
      { ok: false, data: { success: false, message: 'Attach failed (500)' } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    // Before: 0 topics.
    expect(screen.getByTestId('topic-count')).toHaveTextContent('0');

    await act(async () => {
      fireEvent.click(screen.getByTestId('topic-add'));
    });

    // After rollback: back to 0.
    expect(screen.getByTestId('topic-count')).toHaveTextContent('0');
    expect(screen.getByText(/attach failed/i)).toBeInTheDocument();
  });

  it('handles non-Error throws in topic change gracefully', async () => {
    const note = makeNote();
    (global as unknown as { fetch: () => Promise<unknown> }).fetch = vi.fn(async (url: string) => {
      if ((url as string).includes('/topics/attach')) throw 'string error';
      if ((url as string).includes('for-entity')) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: { topicIds: [] } }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
    });
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId('topic-add'));
    });

    expect(screen.getByText(/topic update failed/i)).toBeInTheDocument();
  });
});

// ─── SaveStatus sub-component ─────────────────────────────────────────────────

describe('NoteEditorPane — SaveStatus display', () => {
  it('shows the "Saving" indicator while a save is in flight', async () => {
    const note = makeNote();
    // Third fetch (PATCH) never resolves — stays in flight.
    let callCount = 0;
    (global as unknown as { fetch: (...args: FetchArgs) => Promise<unknown> }).fetch = vi.fn(
      async (_url: string, _init?: RequestInit) => {
        callCount++;
        if (callCount === 1) return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
        if (callCount === 2) return { ok: true, status: 200, json: async () => ({ success: true, data: { topicIds: [] } }) };
        return new Promise(() => {}); // never settles
      },
    );
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });

    // Start save (don't await the full resolution).
    act(() => {
      fireEvent.click(screen.getByTestId('trigger-save'));
    });

    expect(screen.getByText('Saving')).toBeInTheDocument();
  });

  it('shows the error indicator on save failure', async () => {
    const note = makeNote();
    mockFetch([
      { ok: true, data: { success: true, data: note } },
      { ok: true, data: { success: true, data: { topicIds: [] } } },
      { ok: false, data: { success: false, message: 'oops' } },
    ]);
    await act(async () => {
      render(<NoteEditorPane noteId={1} />);
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-save'));
    });
    expect(screen.getByText('Error')).toBeInTheDocument();
  });
});

// ─── noteId switching ─────────────────────────────────────────────────────────

describe('NoteEditorPane — noteId switching', () => {
  // Use real timers for this group because waitFor relies on real time to poll.
  beforeEach(() => { vi.useRealTimers(); });
  afterEach(() => { vi.useFakeTimers(); });

  it('loads a different note when noteId prop changes', async () => {
    const note1 = makeNote({ id: 1, title: 'Note One' });
    const note2 = makeNote({ id: 2, title: 'Note Two' });
    (global as unknown as { fetch: (...args: FetchArgs) => Promise<unknown> }).fetch = vi.fn(
      async (url: string) => {
        if (String(url).includes('for-entity')) {
          return { ok: true, status: 200, json: async () => ({ success: true, data: { topicIds: [] } }) };
        }
        const id = String(url).match(/\/knowledge\/(\d+)/)?.[1];
        const note = id === '1' ? note1 : note2;
        return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
      },
    );

    let rerender!: ReturnType<typeof render>['rerender'];
    await act(async () => {
      const r = render(<NoteEditorPane noteId={1} />);
      rerender = r.rerender;
    });

    expect(screen.getByRole('textbox', { name: /note title/i })).toHaveValue('Note One');

    await act(async () => {
      rerender(<NoteEditorPane noteId={2} />);
    });

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: /note title/i })).toHaveValue('Note Two');
    }, { timeout: 3000 });
  });
});
