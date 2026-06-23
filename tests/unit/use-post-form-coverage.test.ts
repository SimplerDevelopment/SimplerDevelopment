// @vitest-environment jsdom
/**
 * Unit tests for `components/portal/post-form/_hooks/usePostForm.ts`.
 * Exercises formData init, taxonomy loading, handleTitleChange, savePost,
 * handleSubmit (create + edit paths), autosave, and Yjs binding setup.
 * All external deps (api module, next/navigation, post-binding) are mocked.
 *
 * Timer discipline:
 *  - Suites that test debounce / setTimeout behaviour (savePost status resets,
 *    autosave schedule) opt-in to fake timers locally and restore in afterEach.
 *  - The taxonomy-loading suite stays on real timers so waitFor can resolve.
 *  - Global beforeEach only clears mocks — no timer manipulation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// ─── Mocks (hoisted before subject import) ───────────────────────────────────

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

vi.mock('@/components/portal/post-form/_lib/api', () => ({
  createPost: vi.fn(),
  updatePost: vi.fn(),
  fetchCategories: vi.fn(),
  fetchTags: vi.fn(),
}));

const mockApplyLocalBlocks = vi.fn();
const mockUnbind = vi.fn();
const mockBoundPost = { applyLocalBlocks: mockApplyLocalBlocks, unbind: mockUnbind };

vi.mock('@/lib/realtime/post-binding', () => ({
  bindPostToYjs: vi.fn(() => mockBoundPost),
}));

// ─── Imports after mocks ─────────────────────────────────────────────────────

import { usePostForm } from '@/components/portal/post-form/_hooks/usePostForm';
import * as api from '@/components/portal/post-form/_lib/api';
import * as postBinding from '@/lib/realtime/post-binding';
import type { Post } from '@/components/portal/post-form/_lib/types';

const mockApi = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

// ─── Fixtures ────────────────────────────────────────────────────────────────

const basePost: Post = {
  id: 42,
  title: 'Hello World',
  slug: 'hello-world',
  postType: 'page',
  excerpt: 'An excerpt',
  content: '',
  coverImage: '',
  published: false,
  publishedAt: null,
  categoryIds: [],
  tagIds: [],
  seoTitle: '',
  seoDescription: '',
  ogImage: '',
  noIndex: false,
  canonicalUrl: '',
  customCss: '',
  customJs: '',
};

function defaultArgs(overrides: Partial<Parameters<typeof usePostForm>[0]> = {}) {
  return {
    siteId: 1,
    post: basePost,
    mode: 'edit' as const,
    editorMode: 'classic' as const,
    ydoc: null,
    ...overrides,
  };
}

function setupApiOk() {
  mockApi.fetchCategories.mockResolvedValue([{ id: 1, name: 'News', slug: 'news' }]);
  mockApi.fetchTags.mockResolvedValue([{ id: 2, name: 'Featured', slug: 'featured' }]);
  mockApi.updatePost.mockResolvedValue({ success: true });
  mockApi.createPost.mockResolvedValue({ success: true, data: { id: 99 } });
}

// Global: reset mocks only — no timer state
beforeEach(() => {
  vi.clearAllMocks();
  setupApiOk();
});

// ─── Initial state ────────────────────────────────────────────────────────────

describe('usePostForm — initial state', () => {
  it('seeds formData from the supplied post', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    expect(result.current.formData.title).toBe('Hello World');
    expect(result.current.formData.slug).toBe('hello-world');
    expect(result.current.formData.id).toBe(42);
  });

  it('starts with loading=false and postSaveStatus=idle', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    expect(result.current.loading).toBe(false);
    expect(result.current.postSaveStatus).toBe('idle');
  });

  it('starts with iframeSaveVersion=0', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    expect(result.current.iframeSaveVersion).toBe(0);
  });

  it('initialises with empty blocks when content is blank', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    expect(result.current.blocks).toEqual([]);
  });

  it('parses blocks from JSON post content', () => {
    const content = JSON.stringify({
      blocks: [{ id: 'b1', type: 'text', values: {} }],
      version: '1.0',
    });
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ post: { ...basePost, content } }))
    );
    expect(result.current.blocks).toHaveLength(1);
    expect(result.current.blocks[0].id).toBe('b1');
  });

  it('defaults empty taxonomy arrays on mount', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    expect(result.current.availableCategories).toEqual([]);
    expect(result.current.availableTags).toEqual([]);
  });

  it('initialises with blank formData when no post is supplied (create mode)', () => {
    const { result } = renderHook(() =>
      usePostForm({ siteId: 1, mode: 'create', editorMode: 'classic' })
    );
    expect(result.current.formData.title).toBe('');
    expect(result.current.formData.slug).toBe('');
    expect(result.current.formData.published).toBe(false);
  });
});

// ─── Taxonomy loading (real timers — waitFor needs microtask resolution) ──────

describe('usePostForm — taxonomy loading', () => {
  it('loads categories and tags after mount', async () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    await waitFor(() => expect(result.current.availableCategories).toHaveLength(1));
    expect(result.current.availableCategories[0].name).toBe('News');
    expect(result.current.availableTags[0].name).toBe('Featured');
    expect(mockApi.fetchCategories).toHaveBeenCalledWith(1);
    expect(mockApi.fetchTags).toHaveBeenCalledWith(1);
  });

  it('exposes setAvailableCategories / setAvailableTags for external use', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    act(() => {
      result.current.setAvailableCategories([{ id: 99, name: 'Other', slug: 'other' }]);
    });
    expect(result.current.availableCategories[0].id).toBe(99);
    act(() => {
      result.current.setAvailableTags([{ id: 88, name: 'Hot', slug: 'hot' }]);
    });
    expect(result.current.availableTags[0].id).toBe(88);
  });
});

// ─── handleTitleChange ────────────────────────────────────────────────────────

describe('usePostForm — handleTitleChange', () => {
  it('updates title in formData', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    act(() => {
      result.current.handleTitleChange({
        target: { value: 'New Title' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.formData.title).toBe('New Title');
  });

  it('auto-generates slug only in create mode', () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ mode: 'create', post: undefined }))
    );
    act(() => {
      result.current.handleTitleChange({
        target: { value: 'My New Post' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.formData.slug).toBe('my-new-post');
  });

  it('does NOT change slug in edit mode', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    act(() => {
      result.current.handleTitleChange({
        target: { value: 'Changed Title' },
      } as React.ChangeEvent<HTMLInputElement>);
    });
    expect(result.current.formData.slug).toBe('hello-world');
  });
});

// ─── setFormData / setBlocks ──────────────────────────────────────────────────

describe('usePostForm — setFormData / setBlocks', () => {
  it('setFormData replaces form state', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    act(() => {
      result.current.setFormData(prev => ({ ...prev, title: 'Updated' }));
    });
    expect(result.current.formData.title).toBe('Updated');
  });

  it('setBlocks replaces blocks array', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    const newBlocks = [{ id: 'x1', type: 'text', values: {} }];
    act(() => {
      result.current.setBlocks(newBlocks);
    });
    expect(result.current.blocks).toEqual(newBlocks);
  });

  it('setBlocks with function updater works', () => {
    const content = JSON.stringify({
      blocks: [{ id: 'a', type: 'text', values: {} }],
      version: '1.0',
    });
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ post: { ...basePost, content } }))
    );
    act(() => {
      result.current.setBlocks(prev => [
        ...prev,
        { id: 'b', type: 'text', values: {} },
      ]);
    });
    expect(result.current.blocks).toHaveLength(2);
  });

  it('setBlocks is a no-op when the reference is identical', () => {
    const content = JSON.stringify({
      blocks: [{ id: 'a', type: 'text', values: {} }],
      version: '1.0',
    });
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ post: { ...basePost, content } }))
    );
    const original = result.current.blocks;
    act(() => {
      result.current.setBlocks(_ => original);
    });
    expect(result.current.blocks).toBe(original);
  });
});

// ─── savePost (fake timers scoped to this suite) ──────────────────────────────

describe('usePostForm — savePost', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

  it('calls updatePost and sets status to saved on success', async () => {
    const { result } = renderHook(() => usePostForm(defaultArgs({ editorMode: 'classic' })));
    await act(async () => { await result.current.savePost('manual'); });
    expect(mockApi.updatePost).toHaveBeenCalledWith(
      1, 42, expect.objectContaining({ title: 'Hello World' }), [], 'manual',
    );
    expect(result.current.postSaveStatus).toBe('saved');
  });

  it('resets postSaveStatus to idle after 3 s', async () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    await act(async () => { await result.current.savePost('manual'); });
    expect(result.current.postSaveStatus).toBe('saved');
    act(() => { vi.advanceTimersByTime(3001); });
    expect(result.current.postSaveStatus).toBe('idle');
  });

  it('sets status to error on API failure and resets after 5 s', async () => {
    mockApi.updatePost.mockResolvedValue({ success: false });
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    await act(async () => { await result.current.savePost('manual'); });
    expect(result.current.postSaveStatus).toBe('error');
    act(() => { vi.advanceTimersByTime(5001); });
    expect(result.current.postSaveStatus).toBe('idle');
  });

  it('sets status to error when updatePost throws', async () => {
    mockApi.updatePost.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    await act(async () => { await result.current.savePost('manual'); });
    expect(result.current.postSaveStatus).toBe('error');
  });

  it('does not call updatePost in create mode', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ mode: 'create', post: undefined }))
    );
    await act(async () => { await result.current.savePost('manual'); });
    expect(mockApi.updatePost).not.toHaveBeenCalled();
  });

  it('does not call updatePost when post.id is absent', async () => {
    const postWithoutId = { ...basePost, id: undefined };
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ post: postWithoutId }))
    );
    await act(async () => { await result.current.savePost('manual'); });
    expect(mockApi.updatePost).not.toHaveBeenCalled();
  });

  it('does not set loading=true during autosave', async () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    const loadingDuring: boolean[] = [];
    mockApi.updatePost.mockImplementation(async () => {
      loadingDuring.push(result.current.loading);
      return { success: true };
    });
    await act(async () => { await result.current.savePost('autosave'); });
    expect(loadingDuring).toContain(false);
  });

  it('navigates away on manual save in non-iframe mode', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ editorMode: 'classic' }))
    );
    await act(async () => { await result.current.savePost('manual'); });
    expect(mockPush).toHaveBeenCalledWith('/portal/websites/1');
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('does NOT navigate away in iframe mode on manual save', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ editorMode: 'iframe' }))
    );
    await act(async () => { await result.current.savePost('manual'); });
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('increments iframeSaveVersion on manual save', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ editorMode: 'iframe' }))
    );
    expect(result.current.iframeSaveVersion).toBe(0);
    await act(async () => { await result.current.savePost('manual'); });
    expect(result.current.iframeSaveVersion).toBe(1);
  });

  it('does NOT increment iframeSaveVersion on autosave', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ editorMode: 'iframe' }))
    );
    await act(async () => { await result.current.savePost('autosave'); });
    expect(result.current.iframeSaveVersion).toBe(0);
  });
});

// ─── handleSubmit — create mode (fake timers scoped) ─────────────────────────

describe('usePostForm — handleSubmit (create mode)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

  it('calls createPost and redirects to new post edit page', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ mode: 'create', post: undefined }))
    );
    await act(async () => { await result.current.handleSubmit(); });
    expect(mockApi.createPost).toHaveBeenCalledWith(
      1, expect.objectContaining({ title: '' }), [],
    );
    expect(mockPush).toHaveBeenCalledWith('/portal/websites/1/posts/99/edit');
    expect(mockRefresh).toHaveBeenCalled();
    expect(result.current.postSaveStatus).toBe('saved');
  });

  it('redirects to website root when createPost returns no id', async () => {
    mockApi.createPost.mockResolvedValue({ success: true, data: {} });
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ mode: 'create', post: undefined }))
    );
    await act(async () => { await result.current.handleSubmit(); });
    expect(mockPush).toHaveBeenCalledWith('/portal/websites/1');
  });

  it('sets status to error when createPost reports failure', async () => {
    mockApi.createPost.mockResolvedValue({ success: false });
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ mode: 'create', post: undefined }))
    );
    await act(async () => { await result.current.handleSubmit(); });
    expect(result.current.postSaveStatus).toBe('error');
  });

  it('sets status to error when createPost throws', async () => {
    mockApi.createPost.mockRejectedValue(new Error('oops'));
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ mode: 'create', post: undefined }))
    );
    await act(async () => { await result.current.handleSubmit(); });
    expect(result.current.postSaveStatus).toBe('error');
  });

  it('calls e.preventDefault when an event is passed', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ mode: 'create', post: undefined }))
    );
    const fakeEvent = { preventDefault: vi.fn() };
    await act(async () => {
      await result.current.handleSubmit(fakeEvent as unknown as React.FormEvent);
    });
    expect(fakeEvent.preventDefault).toHaveBeenCalled();
  });
});

// ─── handleSubmit — edit mode (fake timers scoped) ───────────────────────────

describe('usePostForm — handleSubmit (edit mode)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

  it('calls savePost with publish trigger', async () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    await act(async () => { await result.current.handleSubmit(); });
    expect(mockApi.updatePost).toHaveBeenCalledWith(
      1, 42, expect.anything(), [], 'publish',
    );
  });

  it('sets published=true on formData when post was unpublished', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ post: { ...basePost, published: false } }))
    );
    await act(async () => { await result.current.handleSubmit(); });
    expect(mockApi.updatePost).toHaveBeenCalledWith(
      1, 42, expect.objectContaining({ published: true }), [], 'publish',
    );
  });

  it('does not flip published when post is already published', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ post: { ...basePost, published: true } }))
    );
    await act(async () => { await result.current.handleSubmit(); });
    expect(mockApi.updatePost).toHaveBeenCalledWith(
      1, 42, expect.objectContaining({ published: true }), [], 'publish',
    );
  });
});

// ─── refs ─────────────────────────────────────────────────────────────────────

describe('usePostForm — refs', () => {
  it('formDataRef.current tracks latest formData', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    act(() => {
      result.current.setFormData(prev => ({ ...prev, title: 'Tracked' }));
    });
    expect(result.current.formDataRef.current.title).toBe('Tracked');
  });

  it('autosaveTimer ref is exposed', () => {
    const { result } = renderHook(() => usePostForm(defaultArgs()));
    expect(result.current.autosaveTimer).toBeDefined();
  });
});

// ─── Autosave (fake timers scoped) ────────────────────────────────────────────

describe('usePostForm — autosave', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

  it('schedules autosave 2 s after blocks change in edit+iframe mode', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ editorMode: 'iframe' }))
    );
    act(() => {
      result.current.setBlocks([{ id: 'n1', type: 'text', values: {} }]);
    });
    expect(mockApi.updatePost).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(2001); });
    expect(mockApi.updatePost).toHaveBeenCalled();
  });

  it('does NOT autosave in classic editorMode', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ editorMode: 'classic' }))
    );
    act(() => {
      result.current.setBlocks([{ id: 'n1', type: 'text', values: {} }]);
    });
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(mockApi.updatePost).not.toHaveBeenCalled();
  });

  it('does NOT autosave when ydoc is connected', async () => {
    const fakeYdoc = {
      on: vi.fn(), off: vi.fn(), transact: vi.fn(),
    } as unknown as import('yjs').Doc;
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ editorMode: 'iframe', ydoc: fakeYdoc }))
    );
    act(() => {
      result.current.setBlocks([{ id: 'n1', type: 'text', values: {} }]);
    });
    await act(async () => { vi.advanceTimersByTime(3000); });
    expect(mockApi.updatePost).not.toHaveBeenCalled();
  });
});

// ─── postType change triggers save in iframe mode (fake timers scoped) ────────

describe('usePostForm — postType change effect', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.runAllTimers(); vi.useRealTimers(); });

  it('triggers manual save when postType changes in iframe+edit mode', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ editorMode: 'iframe' }))
    );
    act(() => {
      result.current.setFormData(prev => ({ ...prev, postType: 'blog' }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(mockApi.updatePost).toHaveBeenCalledWith(
      1, 42, expect.anything(), [], 'manual',
    );
  });

  it('does NOT save on postType change in classic mode', async () => {
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ editorMode: 'classic' }))
    );
    act(() => {
      result.current.setFormData(prev => ({ ...prev, postType: 'blog' }));
    });
    await act(async () => { await Promise.resolve(); });
    expect(mockApi.updatePost).not.toHaveBeenCalled();
  });
});

// ─── Yjs binding ─────────────────────────────────────────────────────────────

describe('usePostForm — Yjs binding', () => {
  it('calls bindPostToYjs when ydoc is provided', () => {
    const fakeYdoc = {
      on: vi.fn(), off: vi.fn(), transact: vi.fn(),
    } as unknown as import('yjs').Doc;
    renderHook(() => usePostForm(defaultArgs({ ydoc: fakeYdoc })));
    expect(postBinding.bindPostToYjs).toHaveBeenCalledWith(
      expect.objectContaining({ ydoc: fakeYdoc }),
    );
  });

  it('calls unbind on the binding when ydoc changes to null', () => {
    const fakeYdoc = {
      on: vi.fn(), off: vi.fn(), transact: vi.fn(),
    } as unknown as import('yjs').Doc;
    const { rerender } = renderHook(
      ({ ydoc }: { ydoc: typeof fakeYdoc | null }) =>
        usePostForm(defaultArgs({ ydoc })),
      { initialProps: { ydoc: fakeYdoc } },
    );
    act(() => { rerender({ ydoc: null }); });
    expect(mockUnbind).toHaveBeenCalled();
  });

  it('calls applyLocalBlocks when setBlocks is called while binding is active', () => {
    const fakeYdoc = {
      on: vi.fn(), off: vi.fn(), transact: vi.fn(),
    } as unknown as import('yjs').Doc;
    const { result } = renderHook(() =>
      usePostForm(defaultArgs({ ydoc: fakeYdoc }))
    );
    act(() => {
      result.current.setBlocks([{ id: 'z', type: 'text', values: {} }]);
    });
    expect(mockApplyLocalBlocks).toHaveBeenCalledWith([
      { id: 'z', type: 'text', values: {} },
    ]);
  });
});
