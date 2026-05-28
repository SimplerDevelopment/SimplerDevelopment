// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/card-detail/_hooks/useCardDetail.ts` — the
 * state + mutation orchestrator for the card-detail modal. Exercises the load
 * lifecycle, escape-key handling, field/title/desc mutations, file upload/delete,
 * comments, time logs, card deletion, labels, checklist, assignees, watch,
 * dependencies, and artifacts. The api module is fully mocked so no network
 * calls happen; fetch is also stubbed defensively.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mock the api module (must precede hook import) ─────────────────────────

vi.mock('@/components/portal/card-detail/_lib/api', () => ({
  fetchCardBundle: vi.fn(),
  fetchMentionableUsers: vi.fn(),
  fetchProjectLabels: vi.fn(),
  fetchProjectCards: vi.fn(),
  fetchArtifacts: vi.fn(),
  fetchAvailableArtifacts: vi.fn(),
  patchCardField: vi.fn(),
  deleteCard: vi.fn(),
  uploadCardFile: vi.fn(),
  deleteCardFile: vi.fn(),
  postComment: vi.fn(),
  deleteComment: vi.fn(),
  postTimeLog: vi.fn(),
  deleteTimeLog: vi.fn(),
  attachLabel: vi.fn(),
  detachLabel: vi.fn(),
  createProjectLabel: vi.fn(),
  addChecklistItem: vi.fn(),
  patchChecklistItem: vi.fn(),
  deleteChecklistItem: vi.fn(),
  addAssigneeApi: vi.fn(),
  removeAssigneeApi: vi.fn(),
  watchCard: vi.fn(),
  addBlockerApi: vi.fn(),
  removeBlockerApi: vi.fn(),
  linkArtifact: vi.fn(),
  updateArtifact: vi.fn(),
  unlinkArtifact: vi.fn(),
}));

import { useCardDetail } from '@/components/portal/card-detail/_hooks/useCardDetail';
import * as api from '@/components/portal/card-detail/_lib/api';

const mockApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

// ─── Fixtures ───────────────────────────────────────────────────────────────

const baseCard = {
  id: 1,
  columnId: 5,
  projectId: 42,
  title: 'Hello card',
  description: 'desc',
  priority: 'high',
  dueDate: null,
  order: 0,
};

function bundleOk(overrides: Record<string, unknown> = {}) {
  return {
    success: true,
    data: {
      card: { ...baseCard },
      timeLogs: [],
      files: [],
      comments: [],
      labels: [],
      activities: [],
      checklist: [],
      assignees: [],
      watching: false,
      blockers: [],
      blocking: [],
      ...overrides,
    },
  };
}

function defaultApiOk() {
  mockApi.fetchCardBundle.mockResolvedValue(bundleOk());
  mockApi.fetchMentionableUsers.mockResolvedValue({ success: true, data: [] });
  mockApi.fetchProjectLabels.mockResolvedValue({ success: true, data: [] });
  mockApi.fetchProjectCards.mockResolvedValue({ success: true, data: [] });
  mockApi.fetchArtifacts.mockResolvedValue({ success: true, data: [] });
  mockApi.fetchAvailableArtifacts.mockResolvedValue({ success: true, data: [] });
  mockApi.patchCardField.mockResolvedValue({ success: true });
  mockApi.deleteCard.mockResolvedValue({});
  mockApi.uploadCardFile.mockResolvedValue({ success: true, data: { id: 99 } });
  mockApi.deleteCardFile.mockResolvedValue({});
  mockApi.postComment.mockResolvedValue({ success: true, data: { id: 7, body: 'x' } });
  mockApi.deleteComment.mockResolvedValue({});
  mockApi.postTimeLog.mockResolvedValue({ success: true, data: { id: 33, minutes: 60 } });
  mockApi.deleteTimeLog.mockResolvedValue({});
  mockApi.attachLabel.mockResolvedValue({});
  mockApi.detachLabel.mockResolvedValue({});
  mockApi.createProjectLabel.mockResolvedValue({ success: true, data: { id: 80, name: 'new', color: '#000' } });
  mockApi.addChecklistItem.mockResolvedValue({ success: true, data: { id: 50, text: 'todo', completed: false } });
  mockApi.patchChecklistItem.mockResolvedValue({});
  mockApi.deleteChecklistItem.mockResolvedValue({});
  mockApi.addAssigneeApi.mockResolvedValue({});
  mockApi.removeAssigneeApi.mockResolvedValue({});
  mockApi.watchCard.mockResolvedValue({});
  mockApi.addBlockerApi.mockResolvedValue({});
  mockApi.removeBlockerApi.mockResolvedValue({});
  mockApi.linkArtifact.mockResolvedValue({ success: true, data: { id: 10, pinned: false } });
  mockApi.updateArtifact.mockResolvedValue({});
  mockApi.unlinkArtifact.mockResolvedValue({});
}

function makeProps(overrides: Partial<{ cardId: number; onClose: () => void; onDeleted: (id: number) => void; onUpdated: (u: any) => void }> = {}) {
  return {
    cardId: 1,
    onClose: vi.fn(),
    onDeleted: vi.fn(),
    onUpdated: vi.fn(),
    ...overrides,
  };
}

async function renderLoaded(propsOverride: Parameters<typeof makeProps>[0] = {}) {
  const props = makeProps(propsOverride);
  const r = renderHook(() => useCardDetail(props as any));
  await waitFor(() => expect(r.result.current.loading).toBe(false));
  return { ...r, props };
}

beforeEach(() => {
  vi.clearAllMocks();
  defaultApiOk();
  // Defensive — should never be called since api module is fully mocked
  // but if anything slips through we want a deterministic response.
  globalThis.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({ success: true }) } as any)) as any;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('useCardDetail — load lifecycle', () => {
  it('starts loading=true and resolves to false after fetch', async () => {
    const { result } = renderHook(() => useCardDetail(makeProps() as any));
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(mockApi.fetchCardBundle).toHaveBeenCalledWith(1);
    expect(mockApi.fetchMentionableUsers).toHaveBeenCalled();
  });

  it('populates card/comments/files/labels from the bundle', async () => {
    const files = [
      { id: 1, commentId: null, originalName: 'a' },
      { id: 2, commentId: 7, originalName: 'b' },
    ];
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({
        files,
        comments: [{ id: 7, body: 'hi', mentions: null, createdAt: '', userId: 1, userName: 'u', files: [] }],
        labels: [{ id: 1, name: 'bug', color: '#f00' }],
        activities: [{ id: 1 }],
        checklist: [{ id: 1, text: 't', completed: false, order: 0, createdAt: '', completedAt: null }],
        assignees: [{ id: 1, name: 'a', email: '' }],
        watching: true,
        blockers: [{ id: 2 }],
        blocking: [{ id: 3 }],
      }),
    );
    const { result } = await renderLoaded();
    expect(result.current.card?.title).toBe('Hello card');
    expect(result.current.cardFiles).toHaveLength(1);
    expect(result.current.cardFiles[0].id).toBe(1);
    expect(result.current.comments[0].files).toHaveLength(1);
    expect(result.current.comments[0].files[0].id).toBe(2);
    expect(result.current.labels).toHaveLength(1);
    expect(result.current.activities).toHaveLength(1);
    expect(result.current.checklist).toHaveLength(1);
    expect(result.current.assignees).toHaveLength(1);
    expect(result.current.watching).toBe(true);
    expect(result.current.blockers).toHaveLength(1);
    expect(result.current.blocking).toHaveLength(1);
  });

  it('loads project labels when card has a projectId', async () => {
    mockApi.fetchProjectLabels.mockResolvedValue({
      success: true,
      data: [{ id: 9, name: 'urgent', color: '#0f0' }],
    });
    const { result } = await renderLoaded();
    expect(mockApi.fetchProjectLabels).toHaveBeenCalledWith(42);
    expect(result.current.projectLabels).toHaveLength(1);
  });

  it('loads artifacts and availableArtifacts', async () => {
    mockApi.fetchArtifacts.mockResolvedValue({ success: true, data: [{ id: 1 }] });
    mockApi.fetchAvailableArtifacts.mockResolvedValue({ success: true, data: [{ type: 'doc', id: 1, title: 'X' }] });
    const { result } = await renderLoaded();
    expect(result.current.artifacts).toHaveLength(1);
    expect(result.current.availableArtifacts).toHaveLength(1);
    expect(result.current.artifactsLoaded).toBe(true);
  });

  it('handles bundle failure gracefully (card stays null, still stops loading)', async () => {
    mockApi.fetchCardBundle.mockResolvedValue({ success: false });
    const { result } = await renderLoaded();
    expect(result.current.card).toBeNull();
  });

  it('logs and recovers when fetchCardBundle throws', async () => {
    mockApi.fetchCardBundle.mockRejectedValue(new Error('boom'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result } = await renderLoaded();
    expect(result.current.card).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('skips state writes when usersRes is not an array', async () => {
    mockApi.fetchMentionableUsers.mockResolvedValue({ success: true, data: 'not-array' });
    const { result } = await renderLoaded();
    expect(result.current.mentionUsers).toEqual([]);
  });
});

describe('useCardDetail — escape key', () => {
  it('calls onClose on Escape when not editing', async () => {
    const onClose = vi.fn();
    await renderLoaded({ onClose });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('does NOT call onClose on Escape when editingTitle is true', async () => {
    const onClose = vi.fn();
    const { result } = await renderLoaded({ onClose });
    act(() => result.current.setEditingTitle(true));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('does NOT call onClose on Escape when editingDesc is true', async () => {
    const onClose = vi.fn();
    const { result } = await renderLoaded({ onClose });
    act(() => result.current.setEditingDesc(true));
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignores non-Escape keys', async () => {
    const onClose = vi.fn();
    await renderLoaded({ onClose });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('useCardDetail — saveField / saveTitle / saveDesc', () => {
  it('saveField updates card and calls onUpdated on success', async () => {
    const onUpdated = vi.fn();
    const { result } = await renderLoaded({ onUpdated });
    await act(async () => {
      await result.current.saveField('priority', 'low');
    });
    expect(mockApi.patchCardField).toHaveBeenCalledWith(1, 'priority', 'low');
    expect(result.current.card?.priority).toBe('low');
    expect(onUpdated).toHaveBeenCalledWith({ id: 1, priority: 'low' });
    expect(result.current.savingField).toBeNull();
  });

  it('saveField does not mutate card on failure', async () => {
    mockApi.patchCardField.mockResolvedValue({ success: false });
    const onUpdated = vi.fn();
    const { result } = await renderLoaded({ onUpdated });
    await act(async () => {
      await result.current.saveField('priority', 'low');
    });
    expect(result.current.card?.priority).toBe('high');
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('saveTitle skips save when title is unchanged', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setTitleDraft('Hello card'));
    act(() => result.current.setEditingTitle(true));
    await act(async () => {
      await result.current.saveTitle();
    });
    expect(mockApi.patchCardField).not.toHaveBeenCalled();
    expect(result.current.editingTitle).toBe(false);
  });

  it('saveTitle skips save when draft is blank', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setTitleDraft('   '));
    act(() => result.current.setEditingTitle(true));
    await act(async () => {
      await result.current.saveTitle();
    });
    expect(mockApi.patchCardField).not.toHaveBeenCalled();
    expect(result.current.editingTitle).toBe(false);
  });

  it('saveTitle trims and persists changed title', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setTitleDraft('  New Title  '));
    await act(async () => {
      await result.current.saveTitle();
    });
    expect(mockApi.patchCardField).toHaveBeenCalledWith(1, 'title', 'New Title');
    expect(result.current.editingTitle).toBe(false);
  });

  it('saveDesc skips save when desc is unchanged', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setDescDraft('desc'));
    act(() => result.current.setEditingDesc(true));
    await act(async () => {
      await result.current.saveDesc();
    });
    expect(mockApi.patchCardField).not.toHaveBeenCalled();
    expect(result.current.editingDesc).toBe(false);
  });

  it('saveDesc persists changed desc', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setDescDraft('new desc'));
    await act(async () => {
      await result.current.saveDesc();
    });
    expect(mockApi.patchCardField).toHaveBeenCalledWith(1, 'description', 'new desc');
  });

  it('saveDesc sends null when emptied', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setDescDraft(''));
    await act(async () => {
      await result.current.saveDesc();
    });
    expect(mockApi.patchCardField).toHaveBeenCalledWith(1, 'description', null);
  });
});

describe('useCardDetail — files', () => {
  it('uploadFile adds to cardFiles when not for comment', async () => {
    mockApi.uploadCardFile.mockResolvedValue({ success: true, data: { id: 11, commentId: null } });
    const { result } = await renderLoaded();
    let returned: any;
    await act(async () => {
      returned = await result.current.uploadFile(new File(['hi'], 'a.txt'));
    });
    expect(returned).toEqual({ id: 11, commentId: null });
    expect(result.current.cardFiles).toHaveLength(1);
    expect(result.current.pendingCommentFiles).toHaveLength(0);
  });

  it('uploadFile adds to pendingCommentFiles when forComment=true', async () => {
    mockApi.uploadCardFile.mockResolvedValue({ success: true, data: { id: 22 } });
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.uploadFile(new File(['hi'], 'a.txt'), true);
    });
    expect(result.current.pendingCommentFiles).toHaveLength(1);
    expect(result.current.cardFiles).toHaveLength(0);
  });

  it('uploadFile returns null on failure', async () => {
    mockApi.uploadCardFile.mockResolvedValue({ success: false });
    const { result } = await renderLoaded();
    let returned: any = 'nope';
    await act(async () => {
      returned = await result.current.uploadFile(new File(['hi'], 'a.txt'));
    });
    expect(returned).toBeNull();
  });

  it('deleteFile removes from cardFiles by default', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({ files: [{ id: 5, commentId: null }] }),
    );
    const { result } = await renderLoaded();
    expect(result.current.cardFiles).toHaveLength(1);
    await act(async () => {
      await result.current.deleteFile(5);
    });
    expect(result.current.cardFiles).toHaveLength(0);
  });

  it('deleteFile removes a file from the correct comment when fromComment=true', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({
        files: [{ id: 9, commentId: 7 }],
        comments: [{ id: 7, body: 'b', mentions: null, createdAt: '', userId: null, userName: null, files: [] }],
      }),
    );
    const { result } = await renderLoaded();
    expect(result.current.comments[0].files).toHaveLength(1);
    await act(async () => {
      await result.current.deleteFile(9, true, 7);
    });
    expect(result.current.comments[0].files).toHaveLength(0);
  });

  it('handleFileInput uploads each selected file and resets the input', async () => {
    mockApi.uploadCardFile.mockResolvedValue({ success: true, data: { id: 1 } });
    const { result } = await renderLoaded();
    const target = {
      files: [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')],
      value: 'x',
    } as any;
    await act(async () => {
      result.current.handleFileInput({ target } as any);
      // let the kicked-off uploads resolve
      await new Promise(r => setTimeout(r, 0));
    });
    expect(mockApi.uploadCardFile).toHaveBeenCalledTimes(2);
    expect(target.value).toBe('');
  });

  it('handleFileInput tolerates a null files list', async () => {
    const { result } = await renderLoaded();
    const target = { files: null, value: 'x' } as any;
    await act(async () => {
      result.current.handleFileInput({ target } as any);
    });
    expect(mockApi.uploadCardFile).not.toHaveBeenCalled();
    expect(target.value).toBe('');
  });
});

describe('useCardDetail — comments', () => {
  it('submitComment does nothing for empty body + no files', async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.submitComment();
    });
    expect(mockApi.postComment).not.toHaveBeenCalled();
  });

  it('submitComment posts a comment and resets state', async () => {
    mockApi.postComment.mockResolvedValue({ success: true, data: { id: 100, body: 'hi' } });
    const { result } = await renderLoaded();
    act(() => result.current.setCommentBody('hi there'));
    await act(async () => {
      await result.current.submitComment();
    });
    expect(mockApi.postComment).toHaveBeenCalledWith(1, 'hi there', [], []);
    expect(result.current.comments).toHaveLength(1);
    expect(result.current.commentBody).toBe('');
  });

  it('submitComment includes mentions from @name matches', async () => {
    mockApi.fetchMentionableUsers.mockResolvedValue({
      success: true,
      data: [
        { id: 1, name: 'alice' },
        { id: 2, name: 'bob' },
      ],
    });
    mockApi.postComment.mockResolvedValue({ success: true, data: { id: 100, body: 'hi' } });
    const { result } = await renderLoaded();
    act(() => result.current.setCommentBody('hello @alice and @bob and @carl'));
    await act(async () => {
      await result.current.submitComment();
    });
    expect(mockApi.postComment).toHaveBeenCalledWith(1, 'hello @alice and @bob and @carl', [1, 2], []);
  });

  it('submitComment does not append comment on failure', async () => {
    mockApi.postComment.mockResolvedValue({ success: false });
    const { result } = await renderLoaded();
    act(() => result.current.setCommentBody('hello'));
    await act(async () => {
      await result.current.submitComment();
    });
    expect(result.current.comments).toHaveLength(0);
    expect(result.current.commentBody).toBe('hello');
  });

  it('removeComment deletes a comment from local state', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({
        comments: [
          { id: 1, body: 'a', mentions: null, createdAt: '', userId: null, userName: null, files: [] },
          { id: 2, body: 'b', mentions: null, createdAt: '', userId: null, userName: null, files: [] },
        ],
      }),
    );
    const { result } = await renderLoaded();
    expect(result.current.comments).toHaveLength(2);
    await act(async () => {
      await result.current.removeComment(1);
    });
    expect(result.current.comments).toHaveLength(1);
    expect(result.current.comments[0].id).toBe(2);
    expect(mockApi.deleteComment).toHaveBeenCalledWith(1, 1);
  });
});

describe('useCardDetail — time logs', () => {
  it('logTime skips when total <= 0', async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.logTime();
    });
    expect(mockApi.postTimeLog).not.toHaveBeenCalled();
  });

  it('logTime converts hours + minutes and posts', async () => {
    mockApi.postTimeLog.mockResolvedValue({ success: true, data: { id: 1, minutes: 90 } });
    const { result } = await renderLoaded();
    act(() => result.current.setTimeHours('1'));
    act(() => result.current.setTimeMinutesInput('30'));
    act(() => result.current.setTimeNote('worked'));
    act(() => result.current.setShowTimeForm(true));
    await act(async () => {
      await result.current.logTime();
    });
    expect(mockApi.postTimeLog).toHaveBeenCalledWith(1, 90, 'worked');
    expect(result.current.timeLogs).toHaveLength(1);
    expect(result.current.timeHours).toBe('');
    expect(result.current.timeMinutesInput).toBe('');
    expect(result.current.timeNote).toBe('');
    expect(result.current.showTimeForm).toBe(false);
  });

  it('logTime sends null note when timeNote is blank', async () => {
    mockApi.postTimeLog.mockResolvedValue({ success: true, data: { id: 1, minutes: 60 } });
    const { result } = await renderLoaded();
    act(() => result.current.setTimeHours('1'));
    await act(async () => {
      await result.current.logTime();
    });
    expect(mockApi.postTimeLog).toHaveBeenCalledWith(1, 60, null);
  });

  it('logTime leaves state unchanged on failure', async () => {
    mockApi.postTimeLog.mockResolvedValue({ success: false });
    const { result } = await renderLoaded();
    act(() => result.current.setTimeHours('1'));
    await act(async () => {
      await result.current.logTime();
    });
    expect(result.current.timeLogs).toHaveLength(0);
    expect(result.current.timeHours).toBe('1');
  });

  it('removeTimeLog removes from local state', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({
        timeLogs: [
          { id: 1, minutes: 60, note: null, loggedAt: '', userId: null, userName: null },
          { id: 2, minutes: 30, note: null, loggedAt: '', userId: null, userName: null },
        ],
      }),
    );
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.removeTimeLog(1);
    });
    expect(result.current.timeLogs).toHaveLength(1);
    expect(result.current.timeLogs[0].id).toBe(2);
  });
});

describe('useCardDetail — card delete', () => {
  it('removeCard calls api + onDeleted with cardId', async () => {
    const onDeleted = vi.fn();
    const { result } = await renderLoaded({ onDeleted });
    await act(async () => {
      await result.current.removeCard();
    });
    expect(mockApi.deleteCard).toHaveBeenCalledWith(1);
    expect(onDeleted).toHaveBeenCalledWith(1);
  });
});

describe('useCardDetail — labels', () => {
  it('toggleLabel attaches a new label', async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.toggleLabel({ id: 9, name: 'bug', color: '#f00' });
    });
    expect(result.current.labels).toHaveLength(1);
    expect(mockApi.attachLabel).toHaveBeenCalledWith(1, 9);
  });

  it('toggleLabel detaches an existing label', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({ labels: [{ id: 9, name: 'bug', color: '#f00' }] }),
    );
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.toggleLabel({ id: 9, name: 'bug', color: '#f00' });
    });
    expect(result.current.labels).toHaveLength(0);
    expect(mockApi.detachLabel).toHaveBeenCalledWith(1, 9);
  });

  it('createAndAttachLabel no-ops when name is blank', async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.createAndAttachLabel();
    });
    expect(mockApi.createProjectLabel).not.toHaveBeenCalled();
  });

  it('createAndAttachLabel adds to projectLabels and attaches', async () => {
    mockApi.createProjectLabel.mockResolvedValue({
      success: true,
      data: { id: 88, name: 'urgent', color: '#0f0' },
    });
    const { result } = await renderLoaded();
    act(() => result.current.setNewLabelName('  urgent '));
    act(() => result.current.setNewLabelColor('#0f0'));
    await act(async () => {
      await result.current.createAndAttachLabel();
    });
    expect(mockApi.createProjectLabel).toHaveBeenCalledWith(42, 'urgent', '#0f0');
    expect(result.current.projectLabels.some(l => l.id === 88)).toBe(true);
    expect(result.current.labels.some(l => l.id === 88)).toBe(true);
    expect(result.current.newLabelName).toBe('');
  });

  it('createAndAttachLabel does nothing on api failure', async () => {
    mockApi.createProjectLabel.mockResolvedValue({ success: false });
    const { result } = await renderLoaded();
    act(() => result.current.setNewLabelName('urgent'));
    await act(async () => {
      await result.current.createAndAttachLabel();
    });
    expect(result.current.projectLabels).toHaveLength(0);
    expect(result.current.labels).toHaveLength(0);
    expect(result.current.newLabelName).toBe('urgent');
  });
});

describe('useCardDetail — checklist', () => {
  it('addChecklist skips when text is blank', async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.addChecklist();
    });
    expect(mockApi.addChecklistItem).not.toHaveBeenCalled();
  });

  it('addChecklist appends new item and resets input', async () => {
    mockApi.addChecklistItem.mockResolvedValue({
      success: true,
      data: { id: 22, text: 'todo', completed: false, order: 0, createdAt: '', completedAt: null },
    });
    const { result } = await renderLoaded();
    act(() => result.current.setNewChecklistText('  todo '));
    await act(async () => {
      await result.current.addChecklist();
    });
    expect(mockApi.addChecklistItem).toHaveBeenCalledWith(1, 'todo');
    expect(result.current.checklist).toHaveLength(1);
    expect(result.current.newChecklistText).toBe('');
  });

  it('toggleChecklistItem flips completion locally and calls api', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({
        checklist: [{ id: 1, text: 't', completed: false, order: 0, createdAt: '', completedAt: null }],
      }),
    );
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.toggleChecklistItem({ id: 1, text: 't', completed: false, order: 0, createdAt: '', completedAt: null });
    });
    expect(result.current.checklist[0].completed).toBe(true);
    expect(mockApi.patchChecklistItem).toHaveBeenCalledWith(1, true);
  });

  it('removeChecklistItem removes locally and calls api', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({
        checklist: [
          { id: 1, text: 'a', completed: false, order: 0, createdAt: '', completedAt: null },
          { id: 2, text: 'b', completed: false, order: 0, createdAt: '', completedAt: null },
        ],
      }),
    );
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.removeChecklistItem(1);
    });
    expect(result.current.checklist).toHaveLength(1);
    expect(result.current.checklist[0].id).toBe(2);
    expect(mockApi.deleteChecklistItem).toHaveBeenCalledWith(1);
  });
});

describe('useCardDetail — assignees', () => {
  it('addAssignee adds a new user', async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.addAssignee({ id: 7, name: 'alice' });
    });
    expect(result.current.assignees).toHaveLength(1);
    expect(mockApi.addAssigneeApi).toHaveBeenCalledWith(1, 7);
  });

  it('addAssignee skips when already assigned', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({ assignees: [{ id: 7, name: 'alice', email: '' }] }),
    );
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.addAssignee({ id: 7, name: 'alice' });
    });
    expect(mockApi.addAssigneeApi).not.toHaveBeenCalled();
  });

  it('removeAssignee removes locally and calls api', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({ assignees: [{ id: 7, name: 'alice', email: '' }] }),
    );
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.removeAssignee(7);
    });
    expect(result.current.assignees).toHaveLength(0);
    expect(mockApi.removeAssigneeApi).toHaveBeenCalledWith(1, 7);
  });
});

describe('useCardDetail — watch', () => {
  it('toggleWatch flips state and calls api', async () => {
    const { result } = await renderLoaded();
    expect(result.current.watching).toBe(false);
    await act(async () => {
      await result.current.toggleWatch();
    });
    expect(result.current.watching).toBe(true);
    expect(mockApi.watchCard).toHaveBeenCalledWith(1, true);
  });

  it('toggleWatch flips back to false', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(bundleOk({ watching: true }));
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.toggleWatch();
    });
    expect(result.current.watching).toBe(false);
    expect(mockApi.watchCard).toHaveBeenCalledWith(1, false);
  });
});

describe('useCardDetail — dependencies', () => {
  it('openDepMenu opens the menu and fetches project cards once', async () => {
    mockApi.fetchProjectCards.mockResolvedValue({
      success: true,
      data: [{ id: 5, title: 't', number: 1, key: 'K', columnIsDone: false }],
    });
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.openDepMenu();
    });
    expect(result.current.showDepMenu).toBe(true);
    expect(result.current.projectCards).toHaveLength(1);
    // Second call should NOT re-fetch (projectCards already populated)
    mockApi.fetchProjectCards.mockClear();
    await act(async () => {
      await result.current.openDepMenu();
    });
    expect(mockApi.fetchProjectCards).not.toHaveBeenCalled();
  });

  it('addBlocker adds a new blocker', async () => {
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.addBlocker({ id: 8, title: 't', number: null, key: null, columnIsDone: null });
    });
    expect(result.current.blockers).toHaveLength(1);
    expect(mockApi.addBlockerApi).toHaveBeenCalledWith(1, 8);
  });

  it('addBlocker skips when already in blockers', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({ blockers: [{ id: 8, title: 't', number: null, key: null, columnIsDone: null }] }),
    );
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.addBlocker({ id: 8, title: 't', number: null, key: null, columnIsDone: null });
    });
    expect(mockApi.addBlockerApi).not.toHaveBeenCalled();
  });

  it('removeBlocker removes locally and calls api', async () => {
    mockApi.fetchCardBundle.mockResolvedValue(
      bundleOk({ blockers: [{ id: 8, title: 't', number: null, key: null, columnIsDone: null }] }),
    );
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.removeBlocker(8);
    });
    expect(result.current.blockers).toHaveLength(0);
    expect(mockApi.removeBlockerApi).toHaveBeenCalledWith(1, 8);
  });
});

describe('useCardDetail — artifacts', () => {
  it('addArtifact prepends new artifact and closes picker', async () => {
    mockApi.linkArtifact.mockResolvedValue({
      success: true,
      data: { id: 1, cardId: 1, artifactType: 'doc', artifactId: 5, displayTitle: 'D', pinned: false, createdAt: '' },
    });
    const { result } = await renderLoaded();
    act(() => result.current.setShowArtifactPicker(true));
    await act(async () => {
      await result.current.addArtifact('doc', 5);
    });
    expect(mockApi.linkArtifact).toHaveBeenCalledWith(1, 'doc', 5);
    expect(result.current.artifacts).toHaveLength(1);
    expect(result.current.showArtifactPicker).toBe(false);
  });

  it('addArtifact does nothing on failure', async () => {
    mockApi.linkArtifact.mockResolvedValue({ success: false });
    const { result } = await renderLoaded();
    act(() => result.current.setShowArtifactPicker(true));
    await act(async () => {
      await result.current.addArtifact('doc', 5);
    });
    expect(result.current.artifacts).toHaveLength(0);
    expect(result.current.showArtifactPicker).toBe(true);
  });

  it('toggleArtifactPin updates pinned for matching artifact', async () => {
    mockApi.fetchArtifacts.mockResolvedValue({
      success: true,
      data: [{ id: 50, cardId: 1, artifactType: 'doc', artifactId: 5, displayTitle: 'D', pinned: false, createdAt: '' }],
    });
    const { result } = await renderLoaded();
    expect(result.current.artifacts[0].pinned).toBe(false);
    await act(async () => {
      await result.current.toggleArtifactPin(50, true);
    });
    expect(mockApi.updateArtifact).toHaveBeenCalledWith(1, 50, true);
    expect(result.current.artifacts[0].pinned).toBe(true);
  });

  it('removeArtifact removes from local state', async () => {
    mockApi.fetchArtifacts.mockResolvedValue({
      success: true,
      data: [{ id: 50, cardId: 1, artifactType: 'doc', artifactId: 5, displayTitle: 'D', pinned: false, createdAt: '' }],
    });
    const { result } = await renderLoaded();
    await act(async () => {
      await result.current.removeArtifact(50);
    });
    expect(mockApi.unlinkArtifact).toHaveBeenCalledWith(1, 50);
    expect(result.current.artifacts).toHaveLength(0);
  });
});

describe('useCardDetail — setters', () => {
  it('exposes UI flag setters that flip booleans', async () => {
    const { result } = await renderLoaded();
    act(() => result.current.setIsDragOver(true));
    expect(result.current.isDragOver).toBe(true);
    act(() => result.current.setConfirmDelete(true));
    expect(result.current.confirmDelete).toBe(true);
    act(() => result.current.setShowLabelMenu(true));
    expect(result.current.showLabelMenu).toBe(true);
    act(() => result.current.setShowAssigneeMenu(true));
    expect(result.current.showAssigneeMenu).toBe(true);
    act(() => result.current.setShowActivity(false));
    expect(result.current.showActivity).toBe(false);
    act(() => result.current.setArtifactTypeFilter('doc'));
    expect(result.current.artifactTypeFilter).toBe('doc');
  });

  it('exposes setPendingCommentFiles to mutate pending list', async () => {
    const { result } = await renderLoaded();
    act(() => {
      result.current.setPendingCommentFiles([
        { id: 1, originalName: 'a', mimeType: '', fileSize: 0, url: '', commentId: null, userId: null, userName: null, createdAt: '' },
      ]);
    });
    expect(result.current.pendingCommentFiles).toHaveLength(1);
  });
});
