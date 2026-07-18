/**
 * PortalPostForm — pre-refactor baseline.
 *
 * The component is ~2150 LOC of mixed concerns (orchestrator, settings
 * slide-over, custom-fields renderer, taxonomy combobox, manage-fields
 * modal). This spec pins the user-visible contract before we extract those
 * sections so the refactor can land without changing observable behavior.
 *
 * We render in non-iframe mode (siteUrl = null → editorMode defaults to
 * 'visual'), mock the heavy iframe + block-editor children, and stub
 * the network so the component runs in isolation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── Mock heavy children so the form can render in jsdom ──────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/components/blocks/BlockEditor', () => ({
  BlockEditor: () => <div data-testid="block-editor-mock">block-editor</div>,
}));

vi.mock('@/components/blocks/EditorWithPreview', () => ({
  EditorWithPreview: () => <div data-testid="editor-with-preview-mock">editor-with-preview</div>,
}));

vi.mock('@/components/blocks/ViewportSelector', () => ({
  ViewportSelector: () => <div data-testid="viewport-selector-mock" />,
}));

vi.mock('@/components/admin/PostEditorLayout', () => ({
  PostEditorLayout: ({ children, postTitle, onOpenSettings }: {
    children: React.ReactNode;
    postTitle: string;
    onOpenSettings: () => void;
  }) => (
    <div data-testid="post-editor-layout">
      <div data-testid="post-title-display">{postTitle}</div>
      <button type="button" data-testid="open-settings" onClick={onOpenSettings}>
        Open Settings
      </button>
      {children}
    </div>
  ),
}));

vi.mock('@/components/admin/PostFormInner', () => ({
  PostFormInnerControls: () => <div data-testid="post-form-inner-controls" />,
}));

vi.mock('@/components/portal/RevisionHistory', () => ({
  default: () => <div data-testid="revision-history-mock" />,
}));

vi.mock('@/components/portal/CustomCodeModal', () => ({
  CustomCodeModal: () => <div data-testid="custom-code-modal-mock" />,
}));

vi.mock('@/components/portal/VisualEditorShell', () => ({
  VisualEditorShell: () => <div data-testid="visual-editor-shell-mock" />,
}));

vi.mock('@/components/admin/MediaPicker', () => ({
  default: ({ label, value, onChange }: { label?: string; value?: string; onChange: (v: string) => void }) => (
    <div data-testid={`media-picker-${(label || 'untitled').toLowerCase().replace(/\s+/g, '-')}`}>
      <span>{label}</span>
      <input
        aria-label={label || 'media-picker'}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  ),
}));

vi.mock('@/contexts/BlockEditorContext', () => ({
  BlockEditorProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useBlockEditor: () => ({}),
}));

vi.mock('@/contexts/DesignTokensContext', () => ({
  DesignTokensProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useDesignTokens: () => ({ tokens: null }),
}));

vi.mock('@/lib/hooks/useContentTypes', () => ({
  useContentTypes: () => [
    { id: 1, name: 'Page', slug: 'page', icon: null, description: null, websiteId: null, active: true },
    { id: 2, name: 'Blog Post', slug: 'blog', icon: null, description: null, websiteId: null, active: true },
  ],
}));

vi.mock('@/lib/branding/block-defaults', () => ({
  applyBrandDefaults: <T,>(b: T) => b,
}));

vi.mock('@/lib/blocks/defaults', () => ({
  createDefaultBlock: () => ({ id: 'mock-block', type: 'text' }),
}));

vi.mock('@/lib/utils/blockHelpers', () => ({
  removeBlockById: (blocks: unknown[]) => blocks,
}));

import PortalPostForm from '@/components/portal/PortalPostForm';

interface FetchCall {
  url: string;
  method: string;
  body: unknown;
}

function setupFetch(): { calls: FetchCall[] } {
  const calls: FetchCall[] = [];
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    let body: unknown = undefined;
    if (init?.body && typeof init.body === 'string') {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    calls.push({ url, method: init?.method || 'GET', body });

    // Simulate the GET endpoints the form polls on mount.
    if (url.includes('/categories') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/tags') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url.includes('/custom-fields') && (!init?.method || init.method === 'GET')) {
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // POST/PUT — return a successful save with an id so create-mode can
    // route to the new edit page.
    return new Response(JSON.stringify({ success: true, data: { id: 42 } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;

  return { calls };
}

describe('PortalPostForm — baseline', () => {
  beforeEach(() => {
    setupFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the post-editor layout shell with the post title', () => {
    render(
      <PortalPostForm
        siteId={1}
        mode="create"
        siteUrl={null}
        publicUrl={null}
      />,
    );
    expect(screen.getByTestId('post-editor-layout')).toBeInTheDocument();
    expect(screen.getByTestId('post-title-display')).toHaveTextContent('New Page');
  });

  it('renders the visual editor (EditorWithPreview) when no siteUrl is provided', () => {
    render(
      <PortalPostForm
        siteId={1}
        mode="create"
        siteUrl={null}
        publicUrl={null}
      />,
    );
    expect(screen.getByTestId('editor-with-preview-mock')).toBeInTheDocument();
  });

  it('opens the inline settings panel and shows the major sections (title, slug, type, status, excerpt)', async () => {
    render(
      <PortalPostForm
        siteId={1}
        mode="create"
        siteUrl={null}
        publicUrl={null}
      />,
    );

    fireEvent.click(screen.getByTestId('open-settings'));

    // Title + slug fields
    expect(screen.getByPlaceholderText('Page title')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('page-slug')).toBeInTheDocument();
    // Type dropdown — surfaces the content types fed by useContentTypes
    expect(screen.getByRole('option', { name: 'Page' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Blog Post' })).toBeInTheDocument();
    // Status dropdown
    expect(screen.getByRole('option', { name: 'Draft' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Published' })).toBeInTheDocument();
    // Excerpt textarea
    expect(screen.getByPlaceholderText('Short description...')).toBeInTheDocument();
  });

  it('typing into the inline title field auto-generates a slug in create mode', async () => {
    const user = userEvent.setup();
    render(
      <PortalPostForm
        siteId={1}
        mode="create"
        siteUrl={null}
        publicUrl={null}
      />,
    );

    await user.click(screen.getByTestId('open-settings'));

    const titleInput = screen.getByPlaceholderText('Page title') as HTMLInputElement;
    const slugInput = screen.getByPlaceholderText('page-slug') as HTMLInputElement;

    await user.type(titleInput, 'About Us');
    expect(titleInput.value).toBe('About Us');
    expect(slugInput.value).toBe('about-us');
  });

  it('clicking Create Page submits to /api/portal/cms/websites/:siteId/posts with the typed title', async () => {
    const { calls } = setupFetch();
    const user = userEvent.setup();
    render(
      <PortalPostForm
        siteId={9}
        mode="create"
        siteUrl={null}
        publicUrl={null}
      />,
    );

    await user.click(screen.getByTestId('open-settings'));
    const titleInput = screen.getByPlaceholderText('Page title');
    await user.type(titleInput, 'Hello World');

    // The "Create Page" submit button lives in the inline form (visible
    // because we're in non-iframe mode).
    const submit = await screen.findByRole('button', { name: /Create Page/i });
    await user.click(submit);

    await waitFor(() => {
      const post = calls.find((c) => c.method === 'POST' && c.url.includes('/api/portal/cms/websites/9/posts'));
      expect(post).toBeTruthy();
      const body = post!.body as { title: string };
      expect(body.title).toBe('Hello World');
    });
  });

  it('renders the inline create-page Cancel button alongside the submit button', () => {
    render(
      <PortalPostForm
        siteId={1}
        mode="create"
        siteUrl={null}
        publicUrl={null}
      />,
    );
    expect(screen.getByRole('button', { name: /Create Page/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
  });

  it('hydrates the title input from a passed-in post in edit mode', () => {
    render(
      <PortalPostForm
        siteId={1}
        mode="edit"
        siteUrl={null}
        publicUrl={null}
        post={{
          id: 7,
          title: 'Existing Page',
          slug: 'existing-page',
          postType: 'page',
          content: '',
          published: true,
        }}
      />,
    );
    // Layout shows the title in the header.
    expect(screen.getByTestId('post-title-display')).toHaveTextContent('Existing Page');
  });
});

describe('PortalPostForm — settings tabs (taxonomy + custom fields)', () => {
  beforeEach(() => {
    setupFetch();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // The slide-over (with SEO/Taxonomy/Custom Fields tabs) is wired only in
  // iframe mode where VisualEditorShell mounts — non-iframe mode uses the
  // simpler inline panel above. We assert here that the inline panel still
  // exposes the categories/tags affordances when the API returns rows, so
  // the refactor can confidently move them into a TaxonomySection without
  // dropping the create-mode integration.
  it('shows category + tag chips returned from the API', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/categories')) {
        return new Response(
          JSON.stringify({ success: true, data: [{ id: 11, name: 'News', slug: 'news' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/tags')) {
        return new Response(
          JSON.stringify({ success: true, data: [{ id: 22, name: 'Featured', slug: 'featured' }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ success: true, data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const user = userEvent.setup();
    render(
      <PortalPostForm
        siteId={1}
        mode="create"
        siteUrl={null}
        publicUrl={null}
      />,
    );

    await user.click(screen.getByTestId('open-settings'));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'News' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Featured' })).toBeInTheDocument();
    });

    // Click the category chip — formData.categoryIds should accept the toggle.
    fireEvent.click(screen.getByRole('button', { name: 'News' }));
    // Re-clicking removes it (still rendered, just unselected) — assert the
    // button is still in the DOM after toggle round-trip.
    fireEvent.click(screen.getByRole('button', { name: 'News' }));
    expect(screen.getByRole('button', { name: 'News' })).toBeInTheDocument();
  });
});
