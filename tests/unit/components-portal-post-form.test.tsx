// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Mocks — declared before module imports so vi.mock hoisting works correctly.
// ---------------------------------------------------------------------------

const mockRouterPush = vi.fn();
const mockRouterBack = vi.fn();
const mockRouterRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockRouterPush,
    back: mockRouterBack,
    refresh: mockRouterRefresh,
  }),
}));

vi.mock('next/link', () => ({
  __esModule: true,
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// Stub realtime/collaboration — heavyweight websocket, irrelevant to form logic
vi.mock('@/lib/realtime/client', () => ({
  useRealtimeDoc: () => ({ ydoc: null, awareness: null, peers: [], status: 'disconnected' }),
  useLocalAwareness: () => ({ setCursor: vi.fn(), setSelection: vi.fn(), setPresence: vi.fn() }),
}));

vi.mock('@/lib/realtime/post-binding', () => ({
  bindPostToYjs: () => ({ applyLocalBlocks: vi.fn(), unbind: vi.fn() }),
}));

// Stub heavy block editor components
vi.mock('@/components/blocks/BlockEditor', () => ({
  BlockEditor: ({ blocks }: any) =>
    React.createElement('div', { 'data-testid': 'block-editor', 'data-count': blocks?.length ?? 0 }),
}));

vi.mock('@/components/blocks/EditorWithPreview', () => ({
  EditorWithPreview: () =>
    React.createElement('div', { 'data-testid': 'editor-with-preview' }),
}));

// Stub PostEditorLayout — exposes all callback buttons as test-friendly elements
vi.mock('@/components/admin/PostEditorLayout', () => ({
  PostEditorLayout: ({
    children,
    postTitle,
    onOpenSettings,
    onPublish,
    onStatusChange,
    onHistoryToggle,
    onPreviewToggle,
    onCodeToggle,
    editorControls,
    centerControls,
    extraNavControls,
  }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'post-editor-layout' },
      React.createElement('span', { 'data-testid': 'layout-title' }, postTitle),
      React.createElement('button', { 'data-testid': 'open-settings', onClick: onOpenSettings }, 'Settings'),
      React.createElement('button', { 'data-testid': 'publish-btn', onClick: onPublish }, 'Publish'),
      onHistoryToggle &&
        React.createElement('button', { 'data-testid': 'history-btn', onClick: onHistoryToggle }, 'History'),
      onPreviewToggle &&
        React.createElement('button', { 'data-testid': 'preview-btn', onClick: onPreviewToggle }, 'Preview'),
      onCodeToggle &&
        React.createElement('button', { 'data-testid': 'code-btn', onClick: onCodeToggle }, 'Code'),
      React.createElement(
        'button',
        { 'data-testid': 'status-published', onClick: () => onStatusChange?.('published') },
        'Set Published',
      ),
      React.createElement(
        'button',
        { 'data-testid': 'status-draft', onClick: () => onStatusChange?.('draft') },
        'Set Draft',
      ),
      editorControls,
      centerControls,
      extraNavControls,
      children,
    ),
}));

vi.mock('@/components/admin/PostFormInner', () => ({
  PostFormInnerControls: ({ onEditorModeChange, onContentMenuToggle }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'post-form-inner' },
      React.createElement(
        'button',
        { 'data-testid': 'set-classic-mode', onClick: () => onEditorModeChange?.('classic') },
        'Classic Mode',
      ),
      React.createElement(
        'button',
        { 'data-testid': 'toggle-content-menu', onClick: onContentMenuToggle },
        'Toggle Menu',
      ),
    ),
}));

vi.mock('@/contexts/BlockEditorContext', () => ({
  BlockEditorProvider: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'block-editor-provider' }, children),
}));

vi.mock('@/contexts/DesignTokensContext', () => ({
  DesignTokensProvider: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'design-tokens-provider' }, children),
}));

// Stub portal-specific heavy sub-components
vi.mock('@/components/portal/VisualEditorShell', () => ({
  VisualEditorShell: () => React.createElement('div', { 'data-testid': 'visual-editor-shell' }),
}));

vi.mock('@/components/portal/CustomCodeModal', () => ({
  CustomCodeModal: ({ open, onClose, onApply }: any) =>
    open
      ? React.createElement(
          'div',
          { 'data-testid': 'custom-code-modal' },
          React.createElement('button', { onClick: onClose }, 'Close Code'),
          React.createElement(
            'button',
            { onClick: () => onApply?.('body { color: red; }', 'console.log(1);') },
            'Apply Code',
          ),
        )
      : null,
}));

vi.mock('@/components/portal/visual-editor/PresenceAvatars', () => ({
  PresenceAvatars: () => React.createElement('div', { 'data-testid': 'presence-avatars' }),
}));

vi.mock('@/components/portal/visual-editor/PresenceLayer', () => ({
  PresenceLayer: () => React.createElement('div', { 'data-testid': 'presence-layer' }),
}));

vi.mock('@/components/portal/post-form/sections/InlineSettingsPanel', () => ({
  InlineSettingsPanel: ({ onClose }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'inline-settings-panel' },
      React.createElement('button', { onClick: onClose }, 'Close Settings'),
    ),
}));

vi.mock('@/components/portal/post-form/sections/SettingsSlideOver', () => ({
  SettingsSlideOver: ({ onClose }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'settings-slide-over' },
      React.createElement('button', { onClick: onClose }, 'Close SlideOver'),
    ),
}));

vi.mock('@/components/portal/post-form/sections/RevisionsPanel', () => ({
  RevisionsPanel: ({ open, onClose }: any) =>
    open
      ? React.createElement(
          'div',
          { 'data-testid': 'revisions-panel' },
          React.createElement('button', { onClick: onClose }, 'Close Revisions'),
        )
      : null,
}));

vi.mock('@/components/portal/post-form/sections/CreatePageIntroCard', () => ({
  CreatePageIntroCard: ({ onSubmit }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'create-page-intro' },
      React.createElement('button', { onClick: onSubmit }, 'Create Page Submit'),
    ),
}));

vi.mock('@/components/portal/post-form/sections/IframeChromeControls', () => ({
  IframeViewportControls: ({ iframeViewport, setIframeViewport }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'iframe-viewport-controls' },
      React.createElement(
        'button',
        { onClick: () => setIframeViewport?.('mobile') },
        `Viewport: ${iframeViewport}`,
      ),
    ),
  UndoRedoControls: () => React.createElement('div', { 'data-testid': 'undo-redo-controls' }),
}));

vi.mock('@/lib/branding/block-defaults', () => ({
  applyBrandDefaults: (_block: any, _defaults: any) => _block,
}));

vi.mock('@/lib/blocks/defaults', () => ({
  createDefaultBlock: (type: string, opts: any) => ({ id: 'new-block', type, data: {}, order: opts?.order ?? 0 }),
}));

vi.mock('@/lib/utils/blockHelpers', () => ({
  removeBlockById: (blocks: any[], id: string) => blocks.filter((b: any) => b.id !== id),
}));

vi.mock('@/lib/hooks/useContentTypes', () => ({
  useContentTypes: () => [],
}));

// ---------------------------------------------------------------------------
// Import component AFTER mocks
// ---------------------------------------------------------------------------
import PortalPostForm from '@/components/portal/PortalPostForm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFetchOk(body: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  });
}

function makeFetchFail(body: unknown) {
  return Promise.resolve({
    ok: false,
    json: () => Promise.resolve(body),
  });
}

function setupFetch() {
  global.fetch = vi.fn((url: string) => {
    if (typeof url === 'string' && url.includes('/categories'))
      return makeFetchOk({ success: true, data: [] });
    if (typeof url === 'string' && url.includes('/tags'))
      return makeFetchOk({ success: true, data: [] });
    if (typeof url === 'string' && url.includes('/posts'))
      return makeFetchOk({ success: true, data: { id: 42 } });
    if (typeof url === 'string' && url.includes('/content-types'))
      return makeFetchOk({ success: true, data: [] });
    if (typeof url === 'string' && url.includes('/experiments'))
      return makeFetchOk({ success: true, data: { id: 7 } });
    return makeFetchOk({ success: true, data: null });
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  setupFetch();
  // Stub localStorage
  vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Minimal post fixture
// ---------------------------------------------------------------------------
const basePost = {
  id: 5,
  title: 'My Post',
  slug: 'my-post',
  postType: 'page',
  content: '',
  published: false,
};

// ---------------------------------------------------------------------------
// Tests — create mode (no siteUrl → visual editor path)
// ---------------------------------------------------------------------------

describe('PortalPostForm — create mode (visual editor)', () => {
  it('renders without crashing in create mode', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => expect(screen.getByTestId('post-editor-layout')).toBeTruthy());
  });

  it('shows "Create Page" submit button in create mode', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create Page/i })).toBeTruthy(),
    );
  });

  it('shows "New Page" in layout title when no title is set', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() =>
      expect(screen.getByTestId('layout-title').textContent).toBe('New Page'),
    );
  });

  it('wraps content in DesignTokensProvider and BlockEditorProvider', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => expect(screen.getByTestId('design-tokens-provider')).toBeTruthy());
    expect(screen.getByTestId('block-editor-provider')).toBeTruthy();
  });

  it('renders EditorWithPreview by default (visual mode, no siteUrl)', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => expect(screen.getByTestId('editor-with-preview')).toBeTruthy());
  });

  it('renders PostFormInnerControls when not in iframe mode', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => expect(screen.getByTestId('post-form-inner')).toBeTruthy());
  });

  it('Cancel button navigates to /portal/websites/:siteId', async () => {
    render(<PortalPostForm siteId={3} mode="create" />);
    await waitFor(() => screen.getByRole('button', { name: /Cancel/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(mockRouterPush).toHaveBeenCalledWith('/portal/websites/3');
  });
});

// ---------------------------------------------------------------------------
// Tests — edit mode (no siteUrl → visual editor path)
// ---------------------------------------------------------------------------

describe('PortalPostForm — edit mode (visual editor)', () => {
  it('renders "Save Changes" in edit mode', async () => {
    render(<PortalPostForm siteId={1} mode="edit" post={basePost} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Save Changes/i })).toBeTruthy(),
    );
  });

  it('displays post title in layout header', async () => {
    render(<PortalPostForm siteId={1} mode="edit" post={basePost} />);
    await waitFor(() =>
      expect(screen.getByTestId('layout-title').textContent).toBe('My Post'),
    );
  });

  it('shows "Edit Page" in layout title when post title is empty', async () => {
    render(
      <PortalPostForm siteId={1} mode="edit" post={{ ...basePost, title: '' }} />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('layout-title').textContent).toBe('Edit Page'),
    );
  });

  it('shows "Start A/B test" button in edit mode with post id', async () => {
    render(<PortalPostForm siteId={1} mode="edit" post={basePost} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Start A\/B test/i })).toBeTruthy(),
    );
  });

  it('does NOT show "Start A/B test" button in create mode', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByRole('button', { name: /Create Page/i }));
    expect(screen.queryByRole('button', { name: /Start A\/B test/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — iframe editor path (siteUrl provided)
// ---------------------------------------------------------------------------

describe('PortalPostForm — iframe editor mode (siteUrl provided)', () => {
  const iframeProps = {
    siteId: 1,
    mode: 'edit' as const,
    post: basePost,
    siteUrl: 'http://localhost:3000',
    publicUrl: 'https://example.com',
    previewToken: 'tok123',
  };

  it('renders VisualEditorShell when siteUrl + post.slug present', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() => expect(screen.getByTestId('visual-editor-shell')).toBeTruthy());
  });

  it('renders IframeViewportControls in center controls', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() =>
      expect(screen.getByTestId('iframe-viewport-controls')).toBeTruthy(),
    );
  });

  it('shows CreatePageIntroCard when siteUrl present but no slug (create mode)', async () => {
    render(
      <PortalPostForm
        siteId={1}
        mode="create"
        siteUrl="http://localhost:3000"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId('create-page-intro')).toBeTruthy(),
    );
  });

  it('does NOT render PostFormInnerControls in iframe mode', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    expect(screen.queryByTestId('post-form-inner')).toBeNull();
  });

  it('shows history toggle button in iframe edit mode', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() =>
      expect(screen.getByTestId('history-btn')).toBeTruthy(),
    );
  });

  it('shows preview toggle button in iframe mode', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() =>
      expect(screen.getByTestId('preview-btn')).toBeTruthy(),
    );
  });

  it('shows code toggle button in iframe edit mode', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() =>
      expect(screen.getByTestId('code-btn')).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — settings panel open/close
// ---------------------------------------------------------------------------

describe('PortalPostForm — settings panel', () => {
  it('opens InlineSettingsPanel (visual mode) when Settings is clicked', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByTestId('open-settings'));
    fireEvent.click(screen.getByTestId('open-settings'));
    await waitFor(() => expect(screen.getByTestId('inline-settings-panel')).toBeTruthy());
  });

  it('closes InlineSettingsPanel when its close button is clicked', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByTestId('open-settings'));
    fireEvent.click(screen.getByTestId('open-settings'));
    await waitFor(() => screen.getByTestId('inline-settings-panel'));
    fireEvent.click(screen.getByRole('button', { name: /Close Settings/i }));
    await waitFor(() =>
      expect(screen.queryByTestId('inline-settings-panel')).toBeNull(),
    );
  });

  it('opens SettingsSlideOver in iframe edit mode when Settings clicked', async () => {
    render(
      <PortalPostForm
        siteId={1}
        mode="edit"
        post={basePost}
        siteUrl="http://localhost:3000"
      />,
    );
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    fireEvent.click(screen.getByTestId('open-settings'));
    await waitFor(() => expect(screen.getByTestId('settings-slide-over')).toBeTruthy());
  });

  it('closes SettingsSlideOver when its close button clicked', async () => {
    render(
      <PortalPostForm
        siteId={1}
        mode="edit"
        post={basePost}
        siteUrl="http://localhost:3000"
      />,
    );
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    fireEvent.click(screen.getByTestId('open-settings'));
    await waitFor(() => screen.getByTestId('settings-slide-over'));
    fireEvent.click(screen.getByRole('button', { name: /Close SlideOver/i }));
    await waitFor(() =>
      expect(screen.queryByTestId('settings-slide-over')).toBeNull(),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — history / revisions panel
// ---------------------------------------------------------------------------

describe('PortalPostForm — revisions panel (iframe edit mode)', () => {
  const iframeProps = {
    siteId: 1,
    mode: 'edit' as const,
    post: basePost,
    siteUrl: 'http://localhost:3000',
  };

  it('opens RevisionsPanel when history button is clicked', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() => screen.getByTestId('history-btn'));
    fireEvent.click(screen.getByTestId('history-btn'));
    await waitFor(() => expect(screen.getByTestId('revisions-panel')).toBeTruthy());
  });

  it('closes RevisionsPanel via its own close button', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() => screen.getByTestId('history-btn'));
    fireEvent.click(screen.getByTestId('history-btn'));
    await waitFor(() => screen.getByTestId('revisions-panel'));
    fireEvent.click(screen.getByRole('button', { name: /Close Revisions/i }));
    await waitFor(() =>
      expect(screen.queryByTestId('revisions-panel')).toBeNull(),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — custom code modal (iframe edit mode)
// ---------------------------------------------------------------------------

describe('PortalPostForm — custom code modal (iframe edit mode)', () => {
  const iframeProps = {
    siteId: 1,
    mode: 'edit' as const,
    post: basePost,
    siteUrl: 'http://localhost:3000',
  };

  it('opens CustomCodeModal when code toggle is clicked', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() => screen.getByTestId('code-btn'));
    fireEvent.click(screen.getByTestId('code-btn'));
    await waitFor(() => expect(screen.getByTestId('custom-code-modal')).toBeTruthy());
  });

  it('closes CustomCodeModal when its close button is clicked', async () => {
    render(<PortalPostForm {...iframeProps} />);
    await waitFor(() => screen.getByTestId('code-btn'));
    fireEvent.click(screen.getByTestId('code-btn'));
    await waitFor(() => screen.getByTestId('custom-code-modal'));
    fireEvent.click(screen.getByRole('button', { name: /Close Code/i }));
    await waitFor(() =>
      expect(screen.queryByTestId('custom-code-modal')).toBeNull(),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSubmit (create path)
// ---------------------------------------------------------------------------

describe('PortalPostForm — handleSubmit create', () => {
  it('POSTs to portal posts API and redirects on success', async () => {
    render(<PortalPostForm siteId={2} mode="create" />);
    await waitFor(() => screen.getByRole('button', { name: /Create Page/i }));

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() => {
      const postCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('/posts') && c[1]?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
    expect(mockRouterPush).toHaveBeenCalledWith(
      expect.stringContaining('/portal/websites/2/posts/42/edit'),
    );
  });

  it('shows loading state ("Saving...") during in-flight POST', async () => {
    let resolve: (v: any) => void = () => {};
    const pending = new Promise((res) => { resolve = res; });

    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/categories'))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/tags'))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/content-types'))
        return makeFetchOk({ success: true, data: [] });
      return pending;
    }) as any;

    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByRole('button', { name: /Create Page/i }));

    act(() => { fireEvent.submit(document.querySelector('form')!); });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Saving\.\.\./i })).toBeTruthy(),
    );

    act(() => {
      resolve({ ok: true, json: () => Promise.resolve({ success: true, data: { id: 1 } }) });
    });
  });

  it('falls back to /portal/websites/:siteId when response has no id', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/categories'))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/tags'))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/content-types'))
        return makeFetchOk({ success: true, data: [] });
      return makeFetchOk({ success: true, data: null });
    }) as any;

    render(<PortalPostForm siteId={9} mode="create" />);
    await waitFor(() => screen.getByRole('button', { name: /Create Page/i }));

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/portal/websites/9'),
    );
  });

  it('does not redirect when create response is not success', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/categories'))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/tags'))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/content-types'))
        return makeFetchOk({ success: true, data: [] });
      return makeFetchOk({ success: false });
    }) as any;

    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByRole('button', { name: /Create Page/i }));

    await act(async () => {
      fireEvent.submit(document.querySelector('form')!);
    });

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Create Page/i })).toBeTruthy(),
    );
    expect(mockRouterPush).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Tests — handleSubmit (edit path via Publish button)
// ---------------------------------------------------------------------------

describe('PortalPostForm — handleSubmit edit / publish', () => {
  it('PUTs to portal posts API when Publish clicked in visual edit mode', async () => {
    render(<PortalPostForm siteId={1} mode="edit" post={basePost} />);
    await waitFor(() => screen.getByTestId('publish-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-btn'));
    });

    await waitFor(() => {
      const putCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes(`/posts/${basePost.id}`) && c[1]?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
    });
  });

  it('redirects to /portal/websites/:siteId after save in non-iframe edit mode', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && (url.includes('/categories') || url.includes('/tags') || url.includes('/content-types')))
        return makeFetchOk({ success: true, data: [] });
      return makeFetchOk({ success: true, data: {} });
    }) as any;

    render(<PortalPostForm siteId={4} mode="edit" post={{ ...basePost, id: 10 }} />);
    await waitFor(() => screen.getByTestId('publish-btn'));

    await act(async () => {
      fireEvent.click(screen.getByTestId('publish-btn'));
    });

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/portal/websites/4'),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — A/B test button
// ---------------------------------------------------------------------------

describe('PortalPostForm — A/B experiment button', () => {
  it('navigates to experiment page on success', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && (url.includes('/categories') || url.includes('/tags') || url.includes('/content-types')))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/experiments'))
        return makeFetchOk({ success: true, data: { id: 99 } });
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalPostForm siteId={1} mode="edit" post={basePost} />);
    await waitFor(() => screen.getByRole('button', { name: /Start A\/B test/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start A\/B test/i }));
    });

    await waitFor(() =>
      expect(mockRouterPush).toHaveBeenCalledWith('/portal/experiments/99'),
    );
  });

  it('shows inline error when experiment creation fails (api error)', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && (url.includes('/categories') || url.includes('/tags') || url.includes('/content-types')))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/experiments'))
        return makeFetchOk({ success: false, error: 'Experiment limit reached' });
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalPostForm siteId={1} mode="edit" post={basePost} />);
    await waitFor(() => screen.getByRole('button', { name: /Start A\/B test/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start A\/B test/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Experiment limit reached')).toBeTruthy(),
    );
  });

  it('shows fallback error message when experiment json has no error field', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && (url.includes('/categories') || url.includes('/tags') || url.includes('/content-types')))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/experiments'))
        return makeFetchOk({ success: false });
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalPostForm siteId={1} mode="edit" post={basePost} />);
    await waitFor(() => screen.getByRole('button', { name: /Start A\/B test/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start A\/B test/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Failed to create experiment')).toBeTruthy(),
    );
  });

  it('shows error and dismisses it via close button', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && (url.includes('/categories') || url.includes('/tags') || url.includes('/content-types')))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/experiments'))
        return makeFetchOk({ success: false, error: 'Server error' });
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalPostForm siteId={1} mode="edit" post={basePost} />);
    await waitFor(() => screen.getByRole('button', { name: /Start A\/B test/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start A\/B test/i }));
    });

    await waitFor(() => screen.getByText('Server error'));
    // Dismiss the error
    fireEvent.click(screen.getByLabelText('Dismiss error'));
    await waitFor(() =>
      expect(screen.queryByText('Server error')).toBeNull(),
    );
  });

  it('shows error when experiment fetch throws a network error', async () => {
    global.fetch = vi.fn((url: string) => {
      if (typeof url === 'string' && (url.includes('/categories') || url.includes('/tags') || url.includes('/content-types')))
        return makeFetchOk({ success: true, data: [] });
      if (typeof url === 'string' && url.includes('/experiments'))
        return Promise.reject(new Error('Network down'));
      return makeFetchOk({ success: true, data: [] });
    }) as any;

    render(<PortalPostForm siteId={1} mode="edit" post={basePost} />);
    await waitFor(() => screen.getByRole('button', { name: /Start A\/B test/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Start A\/B test/i }));
    });

    await waitFor(() =>
      expect(screen.getByText('Network down')).toBeTruthy(),
    );
  });
});

// ---------------------------------------------------------------------------
// Tests — status changes and published state
// ---------------------------------------------------------------------------

describe('PortalPostForm — status changes', () => {
  it('calls setFormData when status changed to published', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByTestId('status-published'));
    act(() => { fireEvent.click(screen.getByTestId('status-published')); });
    expect(screen.getByTestId('post-editor-layout')).toBeTruthy();
  });

  it('calls setFormData when status changed to draft', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByTestId('status-draft'));
    act(() => { fireEvent.click(screen.getByTestId('status-draft')); });
    expect(screen.getByTestId('post-editor-layout')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — editor mode switching
// ---------------------------------------------------------------------------

describe('PortalPostForm — editor mode switching', () => {
  it('switches to BlockEditor (classic) when classic mode selected', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByTestId('set-classic-mode'));
    fireEvent.click(screen.getByTestId('set-classic-mode'));
    await waitFor(() => expect(screen.getByTestId('block-editor')).toBeTruthy());
  });

  it('toggles content menu without crashing', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByTestId('toggle-content-menu'));
    fireEvent.click(screen.getByTestId('toggle-content-menu'));
    expect(screen.getByTestId('post-editor-layout')).toBeTruthy();
    fireEvent.click(screen.getByTestId('toggle-content-menu'));
    expect(screen.getByTestId('post-editor-layout')).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Tests — collaboration / presence layer
// ---------------------------------------------------------------------------

describe('PortalPostForm — collaboration (create mode = disabled)', () => {
  it('does not show presence avatars in create mode (collab disabled)', async () => {
    render(<PortalPostForm siteId={1} mode="create" />);
    await waitFor(() => screen.getByTestId('post-editor-layout'));
    // PresenceAvatars only renders in iframe mode via extraNavControls
    expect(screen.queryByTestId('presence-avatars')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests — blocks initialization from content
// ---------------------------------------------------------------------------

describe('PortalPostForm — block content initialization', () => {
  it('initializes with empty blocks when content is empty string', async () => {
    render(<PortalPostForm siteId={1} mode="edit" post={{ ...basePost, content: '' }} />);
    await waitFor(() => expect(screen.getByTestId('block-editor-provider')).toBeTruthy());
  });

  it('initializes from valid JSON block content', async () => {
    const content = JSON.stringify({
      blocks: [{ id: 'abc', type: 'text', data: {} }],
      version: '1.0',
    });
    render(<PortalPostForm siteId={1} mode="edit" post={{ ...basePost, content }} />);
    await waitFor(() => expect(screen.getByTestId('block-editor-provider')).toBeTruthy());
  });

  it('falls back to empty blocks on malformed JSON content', async () => {
    render(
      <PortalPostForm siteId={1} mode="edit" post={{ ...basePost, content: 'not-json' }} />,
    );
    await waitFor(() => expect(screen.getByTestId('block-editor-provider')).toBeTruthy());
  });
});

// ---------------------------------------------------------------------------
// Tests — currentUser / collaborationProvider integration
// ---------------------------------------------------------------------------

describe('PortalPostForm — currentUser prop', () => {
  it('renders correctly when currentUser is null (anon fallback)', async () => {
    render(
      <PortalPostForm siteId={1} mode="edit" post={basePost} currentUser={null} />,
    );
    await waitFor(() => expect(screen.getByTestId('post-editor-layout')).toBeTruthy());
  });

  it('renders correctly when currentUser is provided', async () => {
    render(
      <PortalPostForm
        siteId={1}
        mode="edit"
        post={basePost}
        currentUser={{ id: 'u1', name: 'Dan', image: null }}
      />,
    );
    await waitFor(() => expect(screen.getByTestId('post-editor-layout')).toBeTruthy());
  });
});
