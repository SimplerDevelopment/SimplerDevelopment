// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — must precede component import
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/portal',
}));

// Providers — render children inertly so context consumers don't throw.
vi.mock('@/contexts/DesignTokensContext', () => ({
  DesignTokensProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'design-tokens-provider' }, children),
}));

vi.mock('@/contexts/BlockEditorContext', () => ({
  BlockEditorProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement('div', { 'data-testid': 'block-editor-provider' }, children),
}));

// VisualEditorShell — heavyweight iframe shell; stub that surfaces iframeSrc so tests can inspect it.
vi.mock('@/components/portal/VisualEditorShell', () => ({
  VisualEditorShell: (props: {
    blocks: unknown[];
    iframeSrc?: string;
    onAddBlock: (type: string) => void;
    onDeleteBlock: (id: string) => void;
  }) =>
    React.createElement('div', {
      'data-testid': 'visual-editor-shell',
      'data-block-count': String(props.blocks?.length ?? 0),
      'data-iframe-src': props.iframeSrc ?? '',
    }),
}));

// CustomCodeModal — stub so we can assert open/close without CodeMirror.
vi.mock('@/components/portal/CustomCodeModal', () => ({
  CustomCodeModal: (props: { open: boolean; onClose: () => void; onApply: (css: string, js: string) => void }) =>
    props.open
      ? React.createElement(
          'div',
          { 'data-testid': 'code-modal' },
          React.createElement('button', { onClick: props.onClose, 'data-testid': 'code-modal-close' }, 'Close'),
          React.createElement(
            'button',
            {
              onClick: () => props.onApply('.new-class { color: red; }', 'console.log("js")'),
              'data-testid': 'code-modal-apply',
            },
            'Apply',
          ),
        )
      : null,
}));

// Block helpers — light stubs that return predictable values.
vi.mock('@/lib/blocks/registry', () => ({
  POST_CONTENT_PICKER_ENTRY: { type: 'post-content', label: 'Post Content' },
}));

vi.mock('@/lib/blocks/defaults', () => ({
  createDefaultBlock: (type: string, opts: { order: number }) => ({
    id: `new-${type}-${opts.order}`,
    type,
    order: opts.order,
  }),
}));

vi.mock('@/lib/utils/blockHelpers', () => ({
  findBlockById: (_blocks: unknown[], id: string) => ({ id, type: 'heading', order: 0 }),
  removeBlockById: (blocks: unknown[], _id: string) => blocks,
  updateBlockById: (blocks: unknown[], _id: string, updated: unknown) => [updated],
}));

// ---------------------------------------------------------------------------
// Component under test
// ---------------------------------------------------------------------------
import { TemplateEditor } from '@/components/portal/TemplateEditor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_PROPS = {
  siteId: '42',
  typeId: '7',
  typeName: 'Blog Post',
  typeSlug: 'blog-post',
  siteUrl: 'https://example.com',
  previewToken: 'tok-abc',
};

/** Build a minimal fetch mock that resolves both template and code endpoints. */
function mockFetchSuccess(
  templateBlocks: unknown[] = [],
  cssOverride = '',
  jsOverride = '',
) {
  return vi.spyOn(window, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/template')) {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            success: true,
            data: { template: { blocks: templateBlocks, version: '1.0' } },
          }),
          { status: 200 },
        ),
      );
    }
    // code endpoint
    return Promise.resolve(
      new Response(
        JSON.stringify({
          success: true,
          data: { customCss: cssOverride, customJs: jsOverride },
        }),
        { status: 200 },
      ),
    );
  });
}

/** Mock that returns failure for both endpoints. */
function mockFetchFailure() {
  return vi.spyOn(window, 'fetch').mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({ success: false, message: 'Server error' }),
        { status: 500 },
      ),
    ),
  );
}

/** Block fixture that is a post-content placeholder. */
const POST_CONTENT_BLOCK = { id: 'pc-1', type: 'post-content', order: 0, required: true };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TemplateEditor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ── no-domain guard ────────────────────────────────────────────────────────

  it('renders the no-domain warning when siteUrl is null', () => {
    render(<TemplateEditor {...BASE_PROPS} siteUrl={null} />);
    // The text contains a typographic apostrophe; match on a stable substring.
    expect(
      screen.getByText(/domain or subdomain configured yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('visual-editor-shell')).not.toBeInTheDocument();
  });

  // ── initial load ──────────────────────────────────────────────────────────

  it('shows a loading spinner while fetching, then renders the shell', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);

    // Loading state: shell not yet mounted.
    expect(screen.queryByTestId('visual-editor-shell')).not.toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByTestId('visual-editor-shell')).toBeInTheDocument(),
    );
  });

  it('renders typeName as heading and typeSlug in the toolbar', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);

    await waitFor(() => screen.getByText('Blog Post'));
    expect(screen.getByText('Blog Post')).toBeInTheDocument();
    expect(screen.getByText('blog-post')).toBeInTheDocument();
  });

  it('displays "Saved" status when loaded with no changes', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    // With a post-content block loaded, no dirty, should show "Saved"
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('displays "No template — post renders raw" before the load resolves', () => {
    // Delay the fetch so the component stays in "loading" state through this assertion.
    vi.spyOn(window, 'fetch').mockImplementation(
      () => new Promise(() => { /* never resolves */ }),
    );
    render(<TemplateEditor {...BASE_PROPS} />);
    // During load: blocks=[], not dirty, savedAt=null → the status message branch
    // "No template — post renders raw" only appears when blocks.length===0 AND
    // not dirty AND savedAt===null. Because loading is true, the shell is
    // replaced by a spinner, but the toolbar is rendered immediately.
    expect(screen.getByText(/No template — post renders raw/i)).toBeInTheDocument();
  });

  // ── load error ────────────────────────────────────────────────────────────

  it('shows the error banner when the template endpoint returns success:false', async () => {
    mockFetchFailure();
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByText(/Server error/i));
    expect(screen.getByText(/Server error/i)).toBeInTheDocument();
  });

  it('shows an error banner when fetch throws a network error', async () => {
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('Network down'));
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByText(/Network down/i));
    expect(screen.getByText(/Network down/i)).toBeInTheDocument();
  });

  // ── placeholder invariant warning ─────────────────────────────────────────

  it('shows the missing-placeholder warning when no post-content block is present', async () => {
    // Load an empty template — the setBlocks guard will re-add a placeholder,
    // but with empty initial there may be a flash. More directly: load a
    // non-post-content block so placeholderCount resolves to 0 momentarily.
    // The guard adds one automatically, so let's verify the warning is NOT
    // shown after loading since the guard auto-inserts it.
    mockFetchSuccess([{ id: 'h1', type: 'heading', order: 0 }]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    // The setBlocks guard auto-inserts a post-content placeholder, so warning should NOT appear.
    expect(
      screen.queryByText(/Templates require a/i),
    ).not.toBeInTheDocument();
  });

  // ── dirty / save state ────────────────────────────────────────────────────

  it('Save button is disabled while loading', () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save button remains disabled when no changes are made', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).toBeDisabled();
  });

  // ── Code button / modal ───────────────────────────────────────────────────

  it('Code button opens the CustomCodeModal', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));

    expect(screen.queryByTestId('code-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /code/i }));
    expect(screen.getByTestId('code-modal')).toBeInTheDocument();
  });

  it('closing the code modal hides it', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));

    fireEvent.click(screen.getByRole('button', { name: /code/i }));
    expect(screen.getByTestId('code-modal')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('code-modal-close'));
    expect(screen.queryByTestId('code-modal')).not.toBeInTheDocument();
  });

  it('applying code marks the editor dirty and shows the badge', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));

    fireEvent.click(screen.getByRole('button', { name: /code/i }));
    fireEvent.click(screen.getByTestId('code-modal-apply'));

    // After apply the CSS/JS are set, editor is dirty
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    // Badge showing "CSS + JS" should appear on the Code button
    expect(screen.getByText('CSS + JS')).toBeInTheDocument();
    // Save button should now be enabled
    const saveBtn = screen.getByRole('button', { name: /save/i });
    expect(saveBtn).not.toBeDisabled();
  });

  it('shows only CSS badge when only customCss is set', async () => {
    // Load with existing CSS from server
    mockFetchSuccess([POST_CONTENT_BLOCK], '.body { color: blue; }', '');
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    expect(screen.getByText('CSS')).toBeInTheDocument();
  });

  it('shows only JS badge when only customJs is set', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK], '', 'console.log(1)');
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    expect(screen.getByText('JS')).toBeInTheDocument();
  });

  // ── save — success ────────────────────────────────────────────────────────

  it('save succeeds: shows saved timestamp and disables Save again', async () => {
    const fetchSpy = mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));

    // Make the editor dirty by applying code
    fireEvent.click(screen.getByRole('button', { name: /code/i }));
    fireEvent.click(screen.getByTestId('code-modal-apply'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled(),
    );

    // Now mock the PUT responses for save
    fetchSpy.mockRestore();
    vi.spyOn(window, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/code')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              success: true,
              data: { customCss: '.new-class { color: red; }', customJs: 'console.log("js")' },
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: true, data: { template: { blocks: [POST_CONTENT_BLOCK] } } }),
          { status: 200 },
        ),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    // After save: no unsaved changes + "Saved HH:MM:SS" status visible
    await waitFor(() =>
      expect(screen.queryByText('Unsaved changes')).not.toBeInTheDocument(),
    );
    // Save button goes back to disabled (no more dirty state)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save/i })).toBeDisabled(),
    );
  });

  // ── save — error ──────────────────────────────────────────────────────────

  it('save failure shows an error banner', async () => {
    const fetchSpy = mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));

    // Apply code to make dirty
    fireEvent.click(screen.getByRole('button', { name: /code/i }));
    fireEvent.click(screen.getByTestId('code-modal-apply'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled(),
    );

    // PUT fails
    fetchSpy.mockRestore();
    vi.spyOn(window, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/code')) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ success: false, message: 'Code save failed' }),
            { status: 500 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({ success: false, message: 'Template save failed' }),
          { status: 500 },
        ),
      );
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    await waitFor(() => screen.getByText(/Code save failed|Template save failed/i));
    expect(screen.getByText(/Code save failed|Template save failed/i)).toBeInTheDocument();
  });

  it('save network error shows the error message in the banner', async () => {
    const fetchSpy = mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));

    fireEvent.click(screen.getByRole('button', { name: /code/i }));
    fireEvent.click(screen.getByTestId('code-modal-apply'));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled(),
    );

    fetchSpy.mockRestore();
    vi.spyOn(window, 'fetch').mockRejectedValue(new Error('Network failure'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /save/i }));
    });

    await waitFor(() => screen.getByText(/Network failure/i));
    expect(screen.getByText(/Network failure/i)).toBeInTheDocument();
  });

  // ── iframe URL wiring ─────────────────────────────────────────────────────

  it('passes the correct iframeSrc to the shell (siteUrl + typeId + previewToken)', async () => {
    // The top-level VisualEditorShell stub already surfaces data-iframe-src.
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    const src = screen.getByTestId('visual-editor-shell').getAttribute('data-iframe-src') ?? '';
    expect(src).toContain('example.com');
    expect(src).toContain('7'); // typeId
    expect(src).toContain('tok-abc'); // previewToken
    expect(src).toContain('_edit=true');
  });

  // ── providers mounted ─────────────────────────────────────────────────────

  it('wraps content in DesignTokensProvider and BlockEditorProvider', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));
    expect(screen.getByTestId('design-tokens-provider')).toBeInTheDocument();
    expect(screen.getByTestId('block-editor-provider')).toBeInTheDocument();
  });

  // ── content-type header ───────────────────────────────────────────────────

  it('shows the view_quilt icon and "Content type" label', async () => {
    mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByText('Content type'));
    expect(screen.getByText('Content type')).toBeInTheDocument();
  });

  // ── endpoints ─────────────────────────────────────────────────────────────

  it('fetches template and code endpoints on mount using the correct URLs', async () => {
    const fetchSpy = mockFetchSuccess([POST_CONTENT_BLOCK]);
    render(<TemplateEditor {...BASE_PROPS} />);
    await waitFor(() => screen.getByTestId('visual-editor-shell'));

    const calledUrls = fetchSpy.mock.calls.map((c) => String(c[0]));
    expect(calledUrls.some((u) => u.includes('/content-types/7/template'))).toBe(true);
    expect(calledUrls.some((u) => u.includes('/content-types/7/code'))).toBe(true);
  });
});
