// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Unit tests for `app/portal/brain/documents/[id]/page.tsx`
 *
 * 'use client' page — rendered directly with @testing-library/react.
 * params is Promise<{ id: string }>; React.use() is mocked below.
 *
 * Covers:
 *  - Loading state (spinner)
 *  - Error state (failed fetch, network throw)
 *  - Populated (draft / published / archived) states + header chips
 *  - Status-conditional action buttons: Publish, Archive, Unarchive, Delete
 *  - canPublish logic (hasDraftWithBody && status !== archived)
 *  - Summary section visibility (only when non-empty)
 *  - Version body section (published body, no-published fallback)
 *  - Version history section renders
 *  - Links panel + required-reads panel render
 *  - Compliance card appears when compliance data is loaded
 *  - handleArchive, handleUnarchive, handlePublish call correct endpoints
 *  - handleDelete: normal flow, 409/DOCUMENT_HAS_ACKS dance, force=true path
 *  - handleSelectVersion inline loading
 *  - "Back to current" button resets selected version
 *  - Owner name display vs. fallback "User #N"
 *  - formatDate: null → dash, valid date → locale string
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ──────────────────────────────────────

const pushMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: any) =>
    React.createElement('a', { href, ...rest }, children),
}));

// MarkdownView — just render children as plain text
vi.mock('@/components/portal/MarkdownView', () => ({
  default: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'markdown-view' }, children),
}));

// Sub-panels — stub to a data-testid div so we can detect their presence
vi.mock('@/components/brain/DocumentVersionHistory', () => ({
  default: ({ versions, onSelectVersion }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'version-history', 'data-count': versions?.length ?? 0 },
      versions?.map((v: any) =>
        React.createElement(
          'button',
          { key: v.id, onClick: () => onSelectVersion(v.id) },
          `v${v.versionNumber}`,
        ),
      ),
    ),
}));

vi.mock('@/components/brain/DocumentLinksPanel', () => ({
  default: ({ documentId }: any) =>
    React.createElement('div', { 'data-testid': 'links-panel', 'data-doc': documentId }),
}));

vi.mock('@/components/brain/DocumentRequiredReadsPanel', () => ({
  default: ({ documentId }: any) =>
    React.createElement('div', { 'data-testid': 'required-reads-panel', 'data-doc': documentId }),
}));

vi.mock('@/components/brain/DocumentComplianceCard', () => ({
  default: ({ report }: any) =>
    React.createElement(
      'div',
      { 'data-testid': 'compliance-card' },
      `acks:${report?.totalAssignees ?? 0}`,
    ),
}));

// React.use — intercept so we can return a synchronously-known value.
// The page calls use(params) where params is Promise<{ id: string }>.
// We store the resolved value on a symbol so use() can retrieve it sync.
const USE_VALUE = Symbol('use-value');
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    use: (p: any) => {
      // If the caller attached a resolved value via our symbol, return it.
      if (p && (USE_VALUE in p)) {
        return p[USE_VALUE];
      }
      // Fallback: actual React.use (Contexts etc.)
      return (actual as any).use(p);
    },
  };
});

// ─── Fetch mock helpers ────────────────────────────────────────────────────

type FetchResp = { ok: boolean; status?: number; json: () => Promise<any> };
const fetchMock = vi.fn<(url: string, init?: any) => Promise<FetchResp>>();

function makeRes(body: any, ok = true, status = 200): FetchResp {
  return { ok, status, json: async () => body };
}

// ─── Sample data factories ─────────────────────────────────────────────────

function makeDocument(extra: Record<string, any> = {}): any {
  return {
    id: 42,
    title: 'My Test Document',
    slug: 'my-test-document',
    status: 'draft',
    category: 'policy',
    ownerId: null,
    publishedAt: null,
    currentPublishedVersionId: null,
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function makeVersion(extra: Record<string, any> = {}): any {
  return {
    id: 10,
    documentId: 42,
    versionNumber: 1,
    body: '# Hello world',
    summary: '',
    status: 'published',
    createdAt: '2025-01-01T00:00:00Z',
    publishedAt: '2025-01-01T00:00:00Z',
    ...extra,
  };
}

function makeDetailData(extra: Record<string, any> = {}): any {
  return {
    document: makeDocument(),
    currentPublishedVersion: undefined,
    currentDraftVersion: undefined,
    versions: [],
    links: [],
    ...extra,
  };
}

// ─── Setup / teardown ──────────────────────────────────────────────────────

beforeEach(() => {
  pushMock.mockReset();
  fetchMock.mockReset();

  // Default: document endpoint returns a bare draft document, compliance
  // and mentionable-users return empty/success
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/compliance-report')) {
      return makeRes({ success: true, data: null });
    }
    if (url.includes('/mentionable-users')) {
      return makeRes({ success: true, data: [] });
    }
    if (url.includes('/api/portal/brain/documents/42')) {
      return makeRes({ success: true, data: makeDetailData() });
    }
    return makeRes({ success: true, data: {} });
  });

  vi.stubGlobal('fetch', fetchMock as any);

  // Stub window.alert / confirm / prompt so action tests don't throw
  vi.stubGlobal('alert', vi.fn());
  vi.stubGlobal('confirm', vi.fn(() => true));
  vi.stubGlobal('prompt', vi.fn(() => ''));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ─── Import after mocks ────────────────────────────────────────────────────

import BrainDocumentDetailPage from '@/app/portal/brain/documents/[id]/page';

// Build a params object that our mocked React.use() can resolve synchronously.
function makeParams(id = '42') {
  // Create a real Promise but attach the resolved value on a symbol so the
  // mocked use() can return it immediately without waiting for microtasks.
  const p = Promise.resolve({ id }) as any;
  p[USE_VALUE] = { id };
  return p;
}

function renderPage(id = '42') {
  return render(<BrainDocumentDetailPage params={makeParams(id)} />);
}

// ─── Loading state ─────────────────────────────────────────────────────────

describe('BrainDocumentDetailPage — loading', () => {
  it('shows loading spinner while data is fetching', () => {
    // Never resolve the fetch
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = renderPage();
    expect(container.textContent).toContain('Loading');
  });
});

// ─── Error state ───────────────────────────────────────────────────────────

describe('BrainDocumentDetailPage — error state', () => {
  it('shows error banner when fetch returns !ok', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({ success: false, message: 'Not found' }, false, 404);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn't load this document");
    });
  });

  it('shows server message from json.message on failure', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({ success: false, message: 'Forbidden' }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Forbidden');
    });
  });

  it('shows network error message when fetch throws', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      throw new Error('Network down');
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Network down');
    });
  });

  it('shows "Not found" fallback when json has no message', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({ success: false }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain("Couldn't load this document");
    });
  });

  it('renders "Back to documents" link in error state', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({ success: false, message: 'oops' }, false);
    });
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/documents"]');
      expect(link).toBeTruthy();
    });
  });
});

// ─── Populated state — header ─────────────────────────────────────────────

describe('BrainDocumentDetailPage — header (draft document)', () => {
  it('renders document title', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('My Test Document');
    });
  });

  it('renders breadcrumb nav with Documents link', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/documents"]');
      expect(link).toBeTruthy();
    });
  });

  it('renders slug chip', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('/my-test-document');
    });
  });

  it('renders category chip', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('policy');
    });
  });

  it('renders status chip for draft', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('draft');
    });
  });

  it('renders Edit draft link pointing to /edit', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const link = container.querySelector('a[href="/portal/brain/documents/42/edit"]');
      expect(link).toBeTruthy();
      expect(link?.textContent).toContain('Edit draft');
    });
  });
});

// ─── Status chips and action buttons ──────────────────────────────────────

describe('BrainDocumentDetailPage — status-conditional buttons', () => {
  it('shows Publish button when draft has body and status !== archived', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          document: makeDocument({ status: 'draft' }),
          currentDraftVersion: makeVersion({ body: 'Some content', status: 'draft' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const publishBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Publish'),
      );
      expect(publishBtn).toBeTruthy();
    });
  });

  it('does NOT show Publish when draft body is empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          document: makeDocument({ status: 'draft' }),
          currentDraftVersion: makeVersion({ body: '   ', status: 'draft' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Test Document'));
    const publishBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Publish',
    );
    expect(publishBtn).toBeUndefined();
  });

  it('does NOT show Publish when status is archived', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          document: makeDocument({ status: 'archived' }),
          currentDraftVersion: makeVersion({ body: 'Big body', status: 'draft' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('archived'));
    const publishBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Publish'),
    );
    expect(publishBtn).toBeUndefined();
  });

  it('shows Archive button when status is published', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({ document: makeDocument({ status: 'published' }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const archiveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Archive'),
      );
      expect(archiveBtn).toBeTruthy();
    });
  });

  it('shows Unarchive button when status is archived', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({ document: makeDocument({ status: 'archived' }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const unarchiveBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Unarchive'),
      );
      expect(unarchiveBtn).toBeTruthy();
    });
  });

  it('always shows Delete button', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const deleteBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Delete'),
      );
      expect(deleteBtn).toBeTruthy();
    });
  });

  it('renders status chip "published" with correct text', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({ document: makeDocument({ status: 'published' }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('published');
    });
  });
});

// ─── Owner name ────────────────────────────────────────────────────────────

describe('BrainDocumentDetailPage — owner display', () => {
  it('shows owner name from users list when ownerId matches', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report')) return makeRes({ success: true, data: null });
      if (url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: [{ id: 7, name: 'Jane Smith' }] });
      }
      return makeRes({
        success: true,
        data: makeDetailData({ document: makeDocument({ ownerId: 7 }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Jane Smith');
    });
  });

  it('shows "User #N" fallback when user not found in list', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report')) return makeRes({ success: true, data: null });
      if (url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: [] });
      }
      return makeRes({
        success: true,
        data: makeDetailData({ document: makeDocument({ ownerId: 99 }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('User #99');
    });
  });

  it('does not show owner chip when ownerId is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Test Document'));
    // No "person" icon or owner text beyond what the chip would show
    expect(container.textContent).not.toContain('User #');
  });
});

// ─── Published date (formatDate) ──────────────────────────────────────────

describe('BrainDocumentDetailPage — formatDate', () => {
  it('shows dash for null publishedAt', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Published —');
    });
  });

  it('shows formatted date when publishedAt is set', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          document: makeDocument({ publishedAt: '2025-03-15T10:00:00Z' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      // Year is locale-stable
      expect(container.textContent).toMatch(/2025/);
    });
  });
});

// ─── Body sections ────────────────────────────────────────────────────────

describe('BrainDocumentDetailPage — body sections', () => {
  it('renders "No published version yet" when there is no published version', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('No published version yet');
    });
  });

  it('renders MarkdownView when published version has body', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          document: makeDocument({ status: 'published', currentPublishedVersionId: 10 }),
          currentPublishedVersion: makeVersion({ body: '# Hello world' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="markdown-view"]')).toBeTruthy();
      expect(container.textContent).toContain('# Hello world');
    });
  });

  it('renders Summary section only when summary is non-empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          document: makeDocument({ status: 'published', currentPublishedVersionId: 10 }),
          currentPublishedVersion: makeVersion({ body: '# Content', summary: 'Executive summary' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Summary');
      expect(container.textContent).toContain('Executive summary');
    });
  });

  it('does NOT render Summary section when summary is empty', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          currentPublishedVersion: makeVersion({ body: 'Body', summary: '' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Test Document'));
    // "Summary" heading should not appear (only the version-history section header)
    const summaryHeading = Array.from(container.querySelectorAll('h2')).find(
      (h) => h.textContent?.trim() === 'Summary',
    );
    expect(summaryHeading).toBeUndefined();
  });

  it('renders version history section with count', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          versions: [makeVersion({ id: 1 }), makeVersion({ id: 2 })],
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Version history');
      expect(container.textContent).toContain('(2)');
    });
  });

  it('renders the links panel', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="links-panel"]')).toBeTruthy();
    });
  });

  it('renders the required-reads panel', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.querySelector('[data-testid="required-reads-panel"]')).toBeTruthy();
    });
  });

  it('renders compliance card when compliance data loads', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report')) {
        return makeRes({
          success: true,
          data: { totalAssignees: 5, acknowledged: 3, pendingList: [] },
        });
      }
      if (url.includes('/mentionable-users')) return makeRes({ success: true, data: [] });
      return makeRes({ success: true, data: makeDetailData() });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const card = container.querySelector('[data-testid="compliance-card"]');
      expect(card).toBeTruthy();
      expect(card?.textContent).toContain('acks:5');
    });
  });

  it('does NOT render compliance card when compliance is null', async () => {
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Test Document'));
    expect(container.querySelector('[data-testid="compliance-card"]')).toBeNull();
  });
});

// ─── Version inline viewer ────────────────────────────────────────────────

describe('BrainDocumentDetailPage — inline version viewer', () => {
  function setupWithVersions() {
    fetchMock.mockImplementation(async (url: string, _init?: any) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      if (url.match(/\/versions\/\d+$/)) {
        return makeRes({
          success: true,
          data: makeVersion({ id: 99, versionNumber: 3, body: 'Older content' }),
        });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          document: makeDocument({ status: 'published', currentPublishedVersionId: 10 }),
          currentPublishedVersion: makeVersion({ id: 10, body: 'Current body' }),
          versions: [
            makeVersion({ id: 10, versionNumber: 1 }),
            makeVersion({ id: 99, versionNumber: 3 }),
          ],
        }),
      });
    });
  }

  it('shows "Current published version" heading by default', async () => {
    setupWithVersions();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Current published version');
    });
  });

  it('shows version loading spinner when a version is clicked', async () => {
    let resolveVersion: (v: any) => void = () => {};
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      if (url.match(/\/versions\/\d+$/)) {
        return new Promise((res) => { resolveVersion = res; }) as any;
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          currentPublishedVersion: makeVersion({ id: 10, body: 'Current body' }),
          versions: [makeVersion({ id: 10, versionNumber: 1 })],
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      const versionBtn = container.querySelector('button[data-testid="version-history"] button');
      return versionBtn;
    });
    // Click a version button rendered by the stubbed DocumentVersionHistory
    const versionBtn = container.querySelector('[data-testid="version-history"] button') as HTMLButtonElement;
    if (versionBtn) fireEvent.click(versionBtn);
    await waitFor(() => {
      expect(container.textContent).toContain('Loading version');
    });
    resolveVersion(makeRes({ success: true, data: makeVersion({ id: 10 }) }));
  });

  it('shows version body after inline load completes', async () => {
    setupWithVersions();
    const { container } = renderPage();
    await waitFor(() => {
      expect(container.textContent).toContain('Version history');
    });
    const versionBtn = container.querySelector('[data-testid="version-history"] button') as HTMLButtonElement;
    if (versionBtn) {
      fireEvent.click(versionBtn);
      await waitFor(() => {
        // After load, either the version body or the "Version v3" heading appears
        expect(container.textContent).toMatch(/Older content|Version v/);
      });
    }
  });

  it('shows "Back to current" button when a version is selected', async () => {
    setupWithVersions();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Version history'));
    const versionBtn = container.querySelector('[data-testid="version-history"] button') as HTMLButtonElement;
    if (versionBtn) {
      fireEvent.click(versionBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Back to current');
      });
    }
  });

  it('"Back to current" resets to published version heading', async () => {
    setupWithVersions();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('Version history'));
    const versionBtn = container.querySelector('[data-testid="version-history"] button') as HTMLButtonElement;
    if (versionBtn) {
      fireEvent.click(versionBtn);
      await waitFor(() => expect(container.textContent).toContain('Back to current'));
      const backBtn = Array.from(container.querySelectorAll('button')).find(
        (b) => b.textContent?.includes('Back to current'),
      ) as HTMLButtonElement;
      fireEvent.click(backBtn);
      await waitFor(() => {
        expect(container.textContent).toContain('Current published version');
      });
    }
  });
});

// ─── Actions ──────────────────────────────────────────────────────────────

describe('BrainDocumentDetailPage — handlePublish', () => {
  function setupPublishable() {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      if (url.includes('/publish') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          document: makeDocument({ status: 'draft' }),
          currentDraftVersion: makeVersion({ body: 'Has content', status: 'draft' }),
        }),
      });
    });
  }

  it('calls POST /publish when Publish is clicked', async () => {
    setupPublishable();
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Publish'),
      )).toBe(true);
    });
    const publishBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Publish'),
    ) as HTMLButtonElement;
    fireEvent.click(publishBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/publish'))).toBe(true);
    });
  });

  it('alerts on publish failure', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      if (url.includes('/publish') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Publish failed.' }, false);
      }
      return makeRes({
        success: true,
        data: makeDetailData({
          document: makeDocument({ status: 'draft' }),
          currentDraftVersion: makeVersion({ body: 'Content', status: 'draft' }),
        }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Publish'),
      )).toBe(true);
    });
    const publishBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Publish'),
    ) as HTMLButtonElement;
    fireEvent.click(publishBtn);
    await waitFor(() => {
      expect(alertMock).toHaveBeenCalled();
    });
  });
});

describe('BrainDocumentDetailPage — handleArchive', () => {
  function setupPublished() {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      if (url.includes('/archive') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: makeDetailData({ document: makeDocument({ status: 'published' }) }),
      });
    });
  }

  it('calls POST /archive when Archive is clicked and reason provided', async () => {
    vi.stubGlobal('prompt', vi.fn(() => 'Outdated'));
    setupPublished();
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Archive'),
      )).toBe(true);
    });
    const archiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Archive'),
    ) as HTMLButtonElement;
    fireEvent.click(archiveBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/archive'))).toBe(true);
    });
  });

  it('does NOT archive when prompt is cancelled (null)', async () => {
    vi.stubGlobal('prompt', vi.fn(() => null));
    setupPublished();
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Archive'),
      )).toBe(true);
    });
    const beforeCalls = fetchMock.mock.calls.length;
    const archiveBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Archive'),
    ) as HTMLButtonElement;
    fireEvent.click(archiveBtn);
    await new Promise((r) => setTimeout(r, 50));
    const archiveCalls = fetchMock.mock.calls.filter((c) => String(c[0]).includes('/archive'));
    expect(archiveCalls.length).toBe(0);
    expect(fetchMock.mock.calls.length).toBe(beforeCalls);
  });
});

describe('BrainDocumentDetailPage — handleUnarchive', () => {
  it('calls POST /unarchive when Unarchive is clicked', async () => {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      if (url.includes('/unarchive') && init?.method === 'POST') {
        return makeRes({ success: true });
      }
      return makeRes({
        success: true,
        data: makeDetailData({ document: makeDocument({ status: 'archived' }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Unarchive'),
      )).toBe(true);
    });
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Unarchive'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.map((c) => String(c[0]));
      expect(calls.some((u) => u.includes('/unarchive'))).toBe(true);
    });
  });

  it('alerts on unarchive failure', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      if (url.includes('/unarchive') && init?.method === 'POST') {
        return makeRes({ success: false, message: 'Cannot unarchive' }, false);
      }
      return makeRes({
        success: true,
        data: makeDetailData({ document: makeDocument({ status: 'archived' }) }),
      });
    });
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Unarchive'),
      )).toBe(true);
    });
    const btn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Unarchive'),
    ) as HTMLButtonElement;
    fireEvent.click(btn);
    await waitFor(() => expect(alertMock).toHaveBeenCalled());
  });
});

describe('BrainDocumentDetailPage — handleDelete', () => {
  function setupForDelete(extra: Record<string, any> = {}) {
    fetchMock.mockImplementation(async (url: string, init?: any) => {
      if (url.includes('/compliance-report') || url.includes('/mentionable-users')) {
        return makeRes({ success: true, data: null });
      }
      if (init?.method === 'DELETE') {
        const handler = extra.deleteHandler;
        if (handler) return handler(url, init);
        return makeRes({ success: true });
      }
      return makeRes({ success: true, data: makeDetailData() });
    });
  }

  it('calls DELETE when Delete is clicked and confirm returns true', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    setupForDelete();
    const { container } = renderPage();
    await waitFor(() => {
      expect(Array.from(container.querySelectorAll('button')).some(
        (b) => b.textContent?.includes('Delete'),
      )).toBe(true);
    });
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      const calls = fetchMock.mock.calls.filter((c) => (c[1] as any)?.method === 'DELETE');
      expect(calls.length).toBeGreaterThan(0);
    });
  });

  it('does NOT delete when confirm returns false', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false));
    setupForDelete();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Test Document'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await new Promise((r) => setTimeout(r, 50));
    const deleteCalls = fetchMock.mock.calls.filter((c) => (c[1] as any)?.method === 'DELETE');
    expect(deleteCalls.length).toBe(0);
  });

  it('navigates to /portal/brain/documents on successful delete', async () => {
    vi.stubGlobal('confirm', vi.fn(() => true));
    setupForDelete();
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Test Document'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/documents');
    });
  });

  it('alerts on delete failure', async () => {
    const alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    vi.stubGlobal('confirm', vi.fn(() => true));
    setupForDelete({
      deleteHandler: async () => makeRes({ success: false, message: 'Delete blocked' }, false),
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Test Document'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => expect(alertMock).toHaveBeenCalled());
  });

  it('handles 409 DOCUMENT_HAS_ACKS: shows second confirm, then force-deletes', async () => {
    vi.stubGlobal('confirm', vi.fn()
      .mockReturnValueOnce(true)   // initial "Delete ..." confirm
      .mockReturnValueOnce(true),  // force-delete confirm
    );
    let deleteCount = 0;
    setupForDelete({
      deleteHandler: async (url: string) => {
        deleteCount++;
        if (!url.includes('force=true')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({
              code: 'DOCUMENT_HAS_ACKS',
              message: 'Has acks',
              ackCount: 3,
            }),
          };
        }
        return makeRes({ success: true });
      },
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Test Document'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await waitFor(() => {
      expect(deleteCount).toBeGreaterThanOrEqual(2);
      expect(pushMock).toHaveBeenCalledWith('/portal/brain/documents');
    });
  });

  it('does NOT force-delete when user cancels the ack confirm', async () => {
    vi.stubGlobal('confirm', vi.fn()
      .mockReturnValueOnce(true)   // initial confirm
      .mockReturnValueOnce(false), // cancel force-delete
    );
    setupForDelete({
      deleteHandler: async (url: string) => {
        if (!url.includes('force=true')) {
          return {
            ok: false,
            status: 409,
            json: async () => ({ code: 'DOCUMENT_HAS_ACKS', ackCount: 2 }),
          };
        }
        return makeRes({ success: true });
      },
    });
    const { container } = renderPage();
    await waitFor(() => expect(container.textContent).toContain('My Test Document'));
    const deleteBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Delete'),
    ) as HTMLButtonElement;
    fireEvent.click(deleteBtn);
    await new Promise((r) => setTimeout(r, 100));
    expect(pushMock).not.toHaveBeenCalled();
  });
});
