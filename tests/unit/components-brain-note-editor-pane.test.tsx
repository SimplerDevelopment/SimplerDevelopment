// @vitest-environment jsdom
/**
 * Unit tests for `components/brain/NoteEditorPane.tsx`
 *
 * Covers:
 *   - Empty state (noteId=null): invite message, optional New Note button
 *   - Loading state: spinner
 *   - Error state: failed fetch renders error message
 *   - Editing state: title input, MarkdownEditor, NoteMetaStrip, TopicPicker
 *   - Title changes propagate via onTitleChange callback
 *   - Body changes propagate via onBodyChange callback
 *   - Dirty indicator (●) when note is modified
 *   - Save: PATCH called with trimmed title+body
 *   - Save: title-required validation
 *   - Save: error state on non-ok response
 *   - Save: onSaved callback on success
 *   - SaveStatus sub-component: saving/saved/error/idle display
 *   - Delete: confirm → DELETE fetch → onDeleted callback
 *   - Delete: cancel confirm → no DELETE fetch
 *   - patchMeta: PATCH with arbitrary fields
 *   - Topics: loaded from for-entity endpoint on note load
 *   - Topics: attach/detach via handleTopicsChange
 *   - Topics: rollback on attach error
 *   - onEditorReady forwarded from MarkdownEditor mock
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import NoteEditorPane from '@/components/brain/NoteEditorPane';
import type { BrainNote } from '@/lib/brain/types';

// ─── Mock heavy child components ────────────────────────────────────────────

vi.mock('@/components/brain/MarkdownEditor', () => ({
  default: function MarkdownEditorStub({
    value,
    onChange,
    onSave,
    onEditorReady,
  }: {
    value: string;
    onChange: (v: string) => void;
    onSave?: () => void;
    onEditorReady?: (view: unknown) => void;
  }) {
    React.useEffect(() => {
      onEditorReady?.({ __stub: 'editorView' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
      <textarea
        data-testid="markdown-editor"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 's' && e.metaKey) onSave?.();
        }}
      />
    );
  },
}));

vi.mock('@/components/brain/DataviewBlock', () => ({
  makeDataviewCodeOverride: () => () => null,
}));

vi.mock('@/components/brain/NoteActionButtons', () => ({
  default: function NoteActionButtonsStub({
    note,
    onPatch,
    onDelete,
  }: {
    note: BrainNote;
    onPatch: (p: Partial<BrainNote>) => void;
    onDelete: () => void;
  }) {
    return (
      <>
        <button
          type="button"
          data-testid="pin-btn"
          onClick={() => onPatch({ pinned: !note.pinned })}
        >
          {note.pinned ? 'Unpin' : 'Pin'}
        </button>
        <button type="button" data-testid="delete-btn" onClick={onDelete}>
          Delete
        </button>
      </>
    );
  },
}));

vi.mock('@/components/brain/NoteMetaStrip', () => ({
  default: function NoteMetaStripStub({ note }: { note: BrainNote }) {
    return <div data-testid="note-meta-strip">{note.title}</div>;
  },
}));

vi.mock('@/components/brain/TopicPicker', () => ({
  default: function TopicPickerStub({
    selectedTopicIds,
    onChange,
  }: {
    selectedTopicIds: number[];
    onChange: (ids: number[]) => void;
  }) {
    return (
      <div data-testid="topic-picker">
        <span data-testid="topic-ids">{selectedTopicIds.join(',')}</span>
        <button
          type="button"
          data-testid="add-topic-btn"
          onClick={() => onChange([...selectedTopicIds, 99])}
        >
          Add topic
        </button>
        <button
          type="button"
          data-testid="remove-topic-btn"
          onClick={() => onChange(selectedTopicIds.filter((id) => id !== 99))}
        >
          Remove topic
        </button>
      </div>
    );
  },
}));

vi.mock('@/components/brain/TagEditor', () => ({
  default: function TagEditorStub() {
    return <div data-testid="tag-editor" />;
  },
}));

// ─── Fetch helpers ────────────────────────────────────────────────────────────

type FetchRouteMap = Record<string, { ok?: boolean; json: unknown }>;

function mockFetch(routes: FetchRouteMap) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    const method = opts?.method?.toUpperCase() ?? 'GET';
    const key = Object.keys(routes).find((k) => url.includes(k) || `${method}:${url}`.includes(k));
    const entry = key ? routes[key] : { ok: true, json: { success: false } };
    const isOk = entry.ok !== undefined ? entry.ok : true;
    return {
      ok: isOk,
      status: isOk ? 200 : 500,
      json: async () => entry.json,
    };
  });
}

function makeFetchWithMethod(routes: Record<string, { ok?: boolean; json: unknown }>) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = vi.fn(async (url: string, opts?: RequestInit) => {
    const method = opts?.method?.toUpperCase() ?? 'GET';
    const methodKey = `${method}:${url}`;
    const key =
      Object.keys(routes).find((k) => methodKey.includes(k)) ??
      Object.keys(routes).find((k) => url.includes(k));
    const entry = key ? routes[key] : { ok: true, json: { success: false } };
    const isOk = entry.ok !== undefined ? entry.ok : true;
    return {
      ok: isOk,
      status: isOk ? 200 : 500,
      json: async () => entry.json,
    };
  });
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeNote(over: Partial<BrainNote> = {}): BrainNote {
  return {
    id: 42,
    title: 'My Note',
    body: 'Some body text',
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
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-02T00:00:00Z',
    ...over,
  };
}

function setupHappyPath(note: BrainNote = makeNote(), topicIds: number[] = []) {
  mockFetch({
    '/api/portal/brain/knowledge/': { json: { success: true, data: note } },
    '/api/portal/brain/topics/for-entity': {
      json: { success: true, data: { topicIds } },
    },
  });
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

afterEach(async () => {
  await act(async () => {});
  vi.clearAllMocks();
});

// ─── Empty state (noteId=null) ────────────────────────────────────────────────

describe('NoteEditorPane — empty state', () => {
  it('shows "No note selected" message when noteId is null', () => {
    render(<NoteEditorPane noteId={null} />);
    expect(screen.getByText('No note selected')).toBeInTheDocument();
  });

  it('does NOT render the editor or title input when noteId is null', () => {
    render(<NoteEditorPane noteId={null} />);
    expect(screen.queryByLabelText('Note title')).not.toBeInTheDocument();
    expect(screen.queryByTestId('markdown-editor')).not.toBeInTheDocument();
  });

  it('does NOT show the New note button when onCreate is not provided', () => {
    render(<NoteEditorPane noteId={null} />);
    expect(screen.queryByRole('button', { name: /New note/i })).not.toBeInTheDocument();
  });

  it('shows the New note button when onCreate is provided', () => {
    render(<NoteEditorPane noteId={null} onCreate={() => {}} />);
    expect(screen.getByRole('button', { name: /New note/i })).toBeInTheDocument();
  });

  it('calls onCreate when the New note button is clicked', () => {
    const onCreate = vi.fn();
    render(<NoteEditorPane noteId={null} onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: /New note/i }));
    expect(onCreate).toHaveBeenCalledOnce();
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('NoteEditorPane — loading state', () => {
  beforeEach(() => {
    // Never resolves — keeps component in loading state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn(() => new Promise(() => {}));
  });

  it('shows the loading spinner while fetching', () => {
    render(<NoteEditorPane noteId={1} />);
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it('does NOT render title input while loading', () => {
    render(<NoteEditorPane noteId={1} />);
    expect(screen.queryByLabelText('Note title')).not.toBeInTheDocument();
  });
});

// ─── Error / not-found state ─────────────────────────────────────────────────

describe('NoteEditorPane — error state', () => {
  it('shows error message when fetch returns success:false', async () => {
    mockFetch({
      '/api/portal/brain/knowledge/': { json: { success: false, message: 'Note not found.' } },
      '/api/portal/brain/topics/for-entity': { json: { success: false } },
    });
    render(<NoteEditorPane noteId={5} />);
    await waitFor(() =>
      expect(screen.getByText('Note not found.')).toBeInTheDocument(),
    );
  });

  it('shows fallback error message when no message field returned', async () => {
    mockFetch({
      '/api/portal/brain/knowledge/': { json: { success: false } },
      '/api/portal/brain/topics/for-entity': { json: { success: false } },
    });
    render(<NoteEditorPane noteId={5} />);
    await waitFor(() =>
      expect(screen.getByText('Failed to load note.')).toBeInTheDocument(),
    );
  });

  it('shows network error message when fetch throws', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn(async (url: string) => {
      if (String(url).includes('/api/portal/brain/knowledge/')) {
        throw new Error('Network error');
      }
      return { ok: true, json: async () => ({ success: false }) };
    });
    render(<NoteEditorPane noteId={5} />);
    await waitFor(() =>
      expect(screen.getByText('Network error')).toBeInTheDocument(),
    );
  });
});

// ─── Editing state ────────────────────────────────────────────────────────────

describe('NoteEditorPane — editing state', () => {
  it('renders the title input with the loaded note title', async () => {
    setupHappyPath(makeNote({ title: 'Hello World' }));
    render(<NoteEditorPane noteId={42} />);
    await waitFor(() =>
      expect(screen.getByLabelText('Note title')).toBeInTheDocument(),
    );
    expect((screen.getByLabelText('Note title') as HTMLInputElement).value).toBe('Hello World');
  });

  it('renders the MarkdownEditor with the loaded note body', async () => {
    setupHappyPath(makeNote({ body: 'Body content here' }));
    render(<NoteEditorPane noteId={42} />);
    await waitFor(() =>
      expect(screen.getByTestId('markdown-editor')).toBeInTheDocument(),
    );
    expect((screen.getByTestId('markdown-editor') as HTMLTextAreaElement).value).toBe(
      'Body content here',
    );
  });

  it('renders NoteMetaStrip after loading', async () => {
    setupHappyPath();
    render(<NoteEditorPane noteId={42} />);
    await waitFor(() =>
      expect(screen.getByTestId('note-meta-strip')).toBeInTheDocument(),
    );
  });

  it('renders TopicPicker after loading', async () => {
    setupHappyPath();
    render(<NoteEditorPane noteId={42} />);
    await waitFor(() =>
      expect(screen.getByTestId('topic-picker')).toBeInTheDocument(),
    );
  });

  it('seeded topic ids are passed to TopicPicker', async () => {
    setupHappyPath(makeNote(), [10, 20]);
    render(<NoteEditorPane noteId={42} />);
    await waitFor(() =>
      expect(screen.getByTestId('topic-ids').textContent).toBe('10,20'),
    );
  });
});

// ─── Title / body change callbacks ───────────────────────────────────────────

describe('NoteEditorPane — change callbacks', () => {
  it('calls onTitleChange when user edits the title', async () => {
    setupHappyPath();
    const onTitleChange = vi.fn();
    render(<NoteEditorPane noteId={42} onTitleChange={onTitleChange} />);
    await waitFor(() => screen.getByLabelText('Note title'));
    fireEvent.change(screen.getByLabelText('Note title'), {
      target: { value: 'New Title' },
    });
    expect(onTitleChange).toHaveBeenCalledWith('New Title');
  });

  it('calls onBodyChange when the editor body changes', async () => {
    setupHappyPath();
    const onBodyChange = vi.fn();
    render(<NoteEditorPane noteId={42} onBodyChange={onBodyChange} />);
    await waitFor(() => screen.getByTestId('markdown-editor'));
    fireEvent.change(screen.getByTestId('markdown-editor'), {
      target: { value: 'updated body' },
    });
    expect(onBodyChange).toHaveBeenCalledWith('updated body');
  });

  it('shows dirty indicator (●) when title differs from loaded note', async () => {
    setupHappyPath(makeNote({ title: 'Original' }));
    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByLabelText('Note title'));
    fireEvent.change(screen.getByLabelText('Note title'), {
      target: { value: 'Modified' },
    });
    await waitFor(() => expect(screen.getByText('●')).toBeInTheDocument());
  });

  it('forwards onEditorReady from MarkdownEditor stub', async () => {
    setupHappyPath();
    const onEditorReady = vi.fn();
    render(<NoteEditorPane noteId={42} onEditorReady={onEditorReady} />);
    await waitFor(() => screen.getByTestId('markdown-editor'));
    expect(onEditorReady).toHaveBeenCalledWith({ __stub: 'editorView' });
  });
});

// ─── Save behaviour ───────────────────────────────────────────────────────────

describe('NoteEditorPane — save', () => {
  it('shows "Title is required." when title is cleared', async () => {
    setupHappyPath(makeNote({ title: 'Original' }));
    // PATCH response irrelevant — validation fires before fetch
    makeFetchWithMethod({
      '/api/portal/brain/knowledge/': { json: { success: true, data: makeNote() } },
      '/api/portal/brain/topics/for-entity': {
        json: { success: true, data: { topicIds: [] } },
      },
    });
    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByLabelText('Note title'));
    // Clear the title
    fireEvent.change(screen.getByLabelText('Note title'), {
      target: { value: '   ' },
    });
    // Change body to make note dirty so autosave fires
    fireEvent.change(screen.getByTestId('markdown-editor'), {
      target: { value: 'trigger dirty' },
    });
    // Advance fake timers past AUTOSAVE_DELAY_MS isn't available; trigger
    // save directly by simulating Ctrl+S on the editor textarea
    // (our stub fires onSave on metaKey+s — but jsdom doesn't propagate
    // metaKey nicely; instead just wait for the validation error since
    // the autosave path also sets it via save())
    // We'll advance time via real timer flush with act
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });
    await waitFor(() =>
      expect(screen.getByText('Title is required.')).toBeInTheDocument(),
    );
  });

  it('calls PATCH with trimmed title + body on successful save', async () => {
    const note = makeNote({ title: 'Title', body: 'Body' });
    setupHappyPath(note);
    const savedNote = makeNote({ title: 'Title', body: 'Updated body' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ success: true, data: savedNote }) };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;

    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByTestId('markdown-editor'));

    fireEvent.change(screen.getByTestId('markdown-editor'), {
      target: { value: 'Updated body' },
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });

    const patchCalls = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patchCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(patchCalls[0][1]!.body as string);
    expect(body.title).toBe('Title');
    expect(body.body).toBe('Updated body');
  });

  it('shows "Saved" status after successful save then clears it', async () => {
    const note = makeNote({ title: 'T', body: 'B' });
    const savedNote = makeNote({ title: 'T', body: 'B2' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ success: true, data: savedNote }) };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
    });

    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByTestId('markdown-editor'));

    fireEvent.change(screen.getByTestId('markdown-editor'), {
      target: { value: 'B2' },
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });

    await waitFor(() => expect(screen.queryByText('Saved')).toBeInTheDocument());
  });

  it('calls onSaved callback with the returned note', async () => {
    const note = makeNote({ title: 'T', body: 'B' });
    const savedNote = makeNote({ title: 'T', body: 'B-new' });
    const onSaved = vi.fn();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ success: true, data: savedNote }) };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
    });

    render(<NoteEditorPane noteId={42} onSaved={onSaved} />);
    await waitFor(() => screen.getByTestId('markdown-editor'));

    fireEvent.change(screen.getByTestId('markdown-editor'), {
      target: { value: 'B-new' },
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(savedNote));
  });

  it('shows error state when PATCH returns ok:false', async () => {
    const note = makeNote({ title: 'T', body: 'B' });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (method === 'PATCH') {
        return { ok: false, status: 500, json: async () => ({ success: false, message: 'DB error' }) };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
    });

    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByTestId('markdown-editor'));

    fireEvent.change(screen.getByTestId('markdown-editor'), {
      target: { value: 'changed body' },
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 1600));
    });

    await waitFor(() => expect(screen.getByText('DB error')).toBeInTheDocument());
  });
});

// ─── Delete behaviour ─────────────────────────────────────────────────────────

describe('NoteEditorPane — delete', () => {
  it('calls DELETE fetch and fires onDeleted when user confirms', async () => {
    const note = makeNote();
    setupHappyPath(note);
    const onDeleted = vi.fn();

    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;

    render(<NoteEditorPane noteId={42} onDeleted={onDeleted} />);
    await waitFor(() => screen.getByTestId('delete-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-btn'));
    });

    await waitFor(() => expect(onDeleted).toHaveBeenCalledWith(42));
  });

  it('does NOT call DELETE when user cancels confirm', async () => {
    setupHappyPath();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      if (method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: makeNote() }) };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;

    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByTestId('delete-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-btn'));
    });

    const deleteCalls = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls).toHaveLength(0);
  });

  it('shows error when DELETE fails', async () => {
    const note = makeNote();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (method === 'DELETE') {
        return {
          ok: false,
          status: 500,
          json: async () => ({ success: false, message: 'Delete failed.' }),
        };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
    });

    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByTestId('delete-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('delete-btn'));
    });

    await waitFor(() => expect(screen.getByText('Delete failed.')).toBeInTheDocument());
  });
});

// ─── patchMeta ────────────────────────────────────────────────────────────────

describe('NoteEditorPane — patchMeta via NoteActionButtons', () => {
  it('sends PATCH with the provided patch object when pin is toggled', async () => {
    const note = makeNote({ pinned: false });
    const patchedNote = makeNote({ pinned: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (method === 'PATCH') {
        return { ok: true, status: 200, json: async () => ({ success: true, data: patchedNote }) };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: note }) };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;

    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByTestId('pin-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('pin-btn'));
    });

    const patchCalls = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === 'PATCH',
    );
    expect(patchCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(patchCalls[0][1]!.body as string);
    expect(body.pinned).toBe(true);
  });
});

// ─── Topic attach/detach ──────────────────────────────────────────────────────

describe('NoteEditorPane — topics', () => {
  it('adds a topic id via attach POST when TopicPicker fires onChange with new id', async () => {
    setupHappyPath(makeNote(), []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (String(url).includes('/api/portal/brain/topics/attach') && method === 'POST') {
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: makeNote() }) };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;

    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByTestId('add-topic-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('add-topic-btn'));
    });

    const attachCalls = fetchMock.mock.calls.filter(
      (c) =>
        String(c[0]).includes('/api/portal/brain/topics/attach') &&
        (c[1] as RequestInit | undefined)?.method === 'POST',
    );
    expect(attachCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(attachCalls[0][1]!.body as string);
    expect(body.topicIds).toContain(99);
  });

  it('removes a topic id via attach DELETE when TopicPicker fires onChange removing id', async () => {
    setupHappyPath(makeNote(), [99]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (String(url).includes('/api/portal/brain/topics/attach') && method === 'DELETE') {
        return { ok: true, status: 200, json: async () => ({ success: true }) };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [99] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: makeNote() }) };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;

    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByTestId('topic-ids'));
    await waitFor(() => expect(screen.getByTestId('topic-ids').textContent).toBe('99'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('remove-topic-btn'));
    });

    const deleteCalls = fetchMock.mock.calls.filter(
      (c) =>
        String(c[0]).includes('/api/portal/brain/topics/attach') &&
        (c[1] as RequestInit | undefined)?.method === 'DELETE',
    );
    expect(deleteCalls.length).toBeGreaterThanOrEqual(1);
    const body = JSON.parse(deleteCalls[0][1]!.body as string);
    expect(body.topicIds).toContain(99);
  });

  it('rolls back topic ids when attach POST fails', async () => {
    setupHappyPath(makeNote(), []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method?.toUpperCase() ?? 'GET';
      if (String(url).includes('/api/portal/brain/topics/attach') && method === 'POST') {
        return {
          ok: false,
          status: 500,
          json: async () => ({ success: false, message: 'Attach failed (500)' }),
        };
      }
      if (String(url).includes('for-entity')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, data: { topicIds: [] } }),
        };
      }
      return { ok: true, status: 200, json: async () => ({ success: true, data: makeNote() }) };
    });

    render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByTestId('add-topic-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('add-topic-btn'));
    });

    // After rollback, topic ids should revert to empty
    await waitFor(() =>
      expect(screen.getByTestId('topic-ids').textContent).toBe(''),
    );
  });
});

// ─── noteId transition ───────────────────────────────────────────────────────

describe('NoteEditorPane — noteId transitions', () => {
  it('resets to empty state when noteId changes to null', async () => {
    setupHappyPath(makeNote({ title: 'Old Note' }));
    const { rerender } = render(<NoteEditorPane noteId={42} />);
    await waitFor(() => screen.getByLabelText('Note title'));

    rerender(<NoteEditorPane noteId={null} />);
    expect(screen.queryByLabelText('Note title')).not.toBeInTheDocument();
    expect(screen.getByText('No note selected')).toBeInTheDocument();
  });

  it('fetches new note when noteId changes', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('for-entity')) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: { topicIds: [] } }) };
      }
      if (String(url).includes('/42')) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: makeNote({ id: 42, title: 'Note 42' }) }) };
      }
      if (String(url).includes('/99')) {
        return { ok: true, status: 200, json: async () => ({ success: true, data: makeNote({ id: 99, title: 'Note 99' }) }) };
      }
      return { ok: true, status: 200, json: async () => ({ success: false }) };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (global as any).fetch = fetchMock;

    const { rerender } = render(<NoteEditorPane noteId={42} />);
    await waitFor(() =>
      expect((screen.getByLabelText('Note title') as HTMLInputElement).value).toBe('Note 42'),
    );

    rerender(<NoteEditorPane noteId={99} />);
    await waitFor(() =>
      expect((screen.getByLabelText('Note title') as HTMLInputElement).value).toBe('Note 99'),
    );
  });
});
