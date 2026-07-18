// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act, cleanup } from '@testing-library/react';
import React from 'react';

// ---------------------------------------------------------------------------
// Import the component AFTER any mocks (none needed — no external imports)
// ---------------------------------------------------------------------------
import { CustomCodeForm } from '@/components/portal/CustomCodeForm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ENDPOINT = '/api/sites/1/custom-code';

function makeJsonResponse(body: unknown, ok = true) {
  return Promise.resolve({
    ok,
    json: () => Promise.resolve(body),
  });
}

function makeSuccessPayload(overrides: Partial<{
  customCss: string;
  customJs: string;
  draftCustomCss: string | null;
  draftCustomJs: string | null;
  draftUpdatedAt: string | null;
  draftUpdatedBy: { id: number; name: string | null; email: string | null } | null;
  hasDraft: boolean;
}> = {}) {
  return {
    success: true,
    data: {
      customCss: '',
      customJs: '',
      draftCustomCss: null,
      draftCustomJs: null,
      draftUpdatedAt: null,
      draftUpdatedBy: null,
      hasDraft: false,
      ...overrides,
    },
  };
}

/** Sets global.fetch to return the given body for GET, and optionally a
 *  different body for PUT/POST. */
function setupFetch({
  getBody = makeSuccessPayload(),
  putBody = { success: true, data: { customCss: '', customJs: '', draftUpdatedAt: new Date().toISOString(), hasDraft: true } },
  publishBody = makeSuccessPayload({ hasDraft: false }),
  discardBody = makeSuccessPayload(),
  getThrows = false,
}: {
  getBody?: unknown;
  putBody?: unknown;
  publishBody?: unknown;
  discardBody?: unknown;
  getThrows?: boolean;
} = {}) {
  global.fetch = vi.fn((url: string, init?: RequestInit) => {
    const method = (init?.method || 'GET').toUpperCase();
    if (method === 'GET') {
      if (getThrows) return Promise.reject(new Error('Network error'));
      return makeJsonResponse(getBody);
    }
    if (method === 'PUT') return makeJsonResponse(putBody);
    if (method === 'POST') {
      if (typeof url === 'string' && url.endsWith('/publish')) return makeJsonResponse(publishBody);
      if (typeof url === 'string' && url.endsWith('/discard')) return makeJsonResponse(discardBody);
    }
    return makeJsonResponse({ success: true });
  }) as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  setupFetch();
  // Stub window.confirm — publish and discard both call it.
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Mount helper — waits for the loading spinner to disappear.
// ---------------------------------------------------------------------------
async function mountAndWait(props: React.ComponentProps<typeof CustomCodeForm> = { endpoint: ENDPOINT }) {
  const result = render(<CustomCodeForm {...props} />);
  // Loading spinner is present initially; wait until it's gone.
  await waitFor(() =>
    expect(screen.queryByText((_, el) => el?.className?.includes('animate-spin') && el?.tagName === 'SPAN' && !el?.closest('button'))).toBeNull(),
  );
  return result;
}

// ---------------------------------------------------------------------------
// 1. Initial load
// ---------------------------------------------------------------------------
describe('CustomCodeForm — initial load', () => {
  it('renders the default title', async () => {
    await mountAndWait();
    expect(screen.getByText('Custom CSS & JavaScript')).toBeInTheDocument();
  });

  it('renders a custom title when provided', async () => {
    await mountAndWait({ endpoint: ENDPOINT, title: 'Site CSS' });
    expect(screen.getByText('Site CSS')).toBeInTheDocument();
  });

  it('renders a subtitle when provided', async () => {
    await mountAndWait({ endpoint: ENDPOINT, subtitle: 'Injected into every page' });
    expect(screen.getByText('Injected into every page')).toBeInTheDocument();
  });

  it('does not render subtitle when omitted', async () => {
    await mountAndWait();
    expect(screen.queryByText('Injected into every page')).toBeNull();
  });

  it('GETs the endpoint on mount', async () => {
    await mountAndWait();
    expect(global.fetch).toHaveBeenCalledWith(ENDPOINT);
  });

  it('shows error message when GET response success=false', async () => {
    setupFetch({ getBody: { success: false, message: 'Not authorised' } });
    await mountAndWait();
    expect(screen.getByText('Not authorised')).toBeInTheDocument();
  });

  it('shows fallback error when GET response has no message', async () => {
    setupFetch({ getBody: { success: false } });
    await mountAndWait();
    expect(screen.getByText('Failed to load custom code.')).toBeInTheDocument();
  });

  it('shows error when GET throws a network error', async () => {
    setupFetch({ getThrows: true });
    await mountAndWait();
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('seeds CSS textarea from draftCustomCss when draft exists', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'body { color: red; }',
        draftCustomCss: '/* draft css */',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
    });
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('/* draft css */');
  });

  it('falls back to live CSS when no draftCustomCss', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'body { color: blue; }',
        draftCustomCss: null,
      }),
    });
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('body { color: blue; }');
  });
});

// ---------------------------------------------------------------------------
// 2. Language tab switching
// ---------------------------------------------------------------------------
describe('CustomCodeForm — CSS / JS tab switching', () => {
  it('defaults to CSS tab', async () => {
    await mountAndWait();
    const cssBtn = screen.getByRole('button', { name: /^CSS$/i });
    expect(cssBtn.className).toContain('bg-accent');
  });

  it('switches to JS tab and shows JS textarea', async () => {
    await mountAndWait();
    const jsBtn = screen.getByRole('button', { name: /^JavaScript$/i });
    fireEvent.click(jsBtn);
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.placeholder).toContain('Custom JS');
  });

  it('shows CSS placeholder text on CSS textarea', async () => {
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.placeholder).toContain('Custom CSS');
  });
});

// ---------------------------------------------------------------------------
// 3. Draft / Live view tabs (supportsDrafts=true)
// ---------------------------------------------------------------------------
/** Returns the Draft tab button (the tab, not the "Save draft" header button). */
function getDraftTabBtn() {
  // The Draft tab button has class "rounded-t-md" and its visible text is "Draft"
  // (the icon span's text "edit" + the label "Draft").
  const allBtns = screen.getAllByRole('button');
  return allBtns.find(
    (b) => b.className.includes('rounded-t-md') && b.textContent?.includes('Draft') && !b.textContent?.includes('Save'),
  )!;
}

function getLiveTabBtn() {
  const allBtns = screen.getAllByRole('button');
  return allBtns.find(
    (b) => b.className.includes('rounded-t-md') && b.textContent?.includes('Live'),
  )!;
}

/** Returns the Publish button (by text content, avoiding accessible-name issues with icon text). */
function getPublishBtn() {
  const allBtns = screen.getAllByRole('button');
  return allBtns.find(
    (b) => b.textContent?.includes('Publish') && !b.textContent?.includes('unpublished'),
  )!;
}

describe('CustomCodeForm — draft/live tabs', () => {
  it('shows Draft and Live tab buttons when supportsDrafts=true', async () => {
    await mountAndWait();
    expect(getDraftTabBtn()).toBeTruthy();
    expect(getLiveTabBtn()).toBeTruthy();
  });

  it('does not show Draft/Live tabs when supportsDrafts=false', async () => {
    await mountAndWait({ endpoint: ENDPOINT, supportsDrafts: false });
    const allBtns = screen.getAllByRole('button');
    const draftTab = allBtns.find(
      (b) => b.textContent?.trim().startsWith('Draft') && b.className.includes('rounded-t-md'),
    );
    const liveTab = allBtns.find(
      (b) => b.textContent?.trim() === 'Live' && b.className.includes('rounded-t-md'),
    );
    expect(draftTab).toBeUndefined();
    expect(liveTab).toBeUndefined();
  });

  it('switches to Live tab and textarea becomes read-only', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'live-css',
        draftCustomCss: 'draft-css',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
    });
    await mountAndWait();
    fireEvent.click(getLiveTabBtn());
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.readOnly).toBe(true);
    expect(textarea.value).toBe('live-css');
  });

  it('shows read-only note when viewing Live tab', async () => {
    await mountAndWait();
    fireEvent.click(getLiveTabBtn());
    expect(screen.getByText(/Currently serving on the public site/i)).toBeInTheDocument();
  });

  it('shows editing note on Draft tab', async () => {
    await mountAndWait();
    expect(screen.getByText(/Edits stage here until you publish/i)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 4. Dirty state detection
// ---------------------------------------------------------------------------
describe('CustomCodeForm — dirty state', () => {
  it('shows "Unsaved changes" after editing CSS textarea', async () => {
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'body { margin: 0; }' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('shows "Unsaved changes" after editing JS textarea', async () => {
    await mountAndWait();
    fireEvent.click(screen.getByRole('button', { name: /^JavaScript$/i }));
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'console.log("hi")' } });
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('does not show "Unsaved changes" when content is unchanged', async () => {
    await mountAndWait();
    expect(screen.queryByText('Unsaved changes')).toBeNull();
  });

  it('Save draft button is disabled when no dirty state', async () => {
    await mountAndWait();
    const saveBtn = screen.getByRole('button', { name: /Save draft/i });
    expect(saveBtn).toBeDisabled();
  });

  it('Save draft button becomes enabled after editing', async () => {
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '.foo { color: red; }' } });
    const saveBtn = screen.getByRole('button', { name: /Save draft/i });
    expect(saveBtn).not.toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 5. Save draft (PUT)
// ---------------------------------------------------------------------------
describe('CustomCodeForm — saveDraft', () => {
  it('PUTs to the endpoint with CSS and JS values', async () => {
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'body {}' } });

    const saveBtn = screen.getByRole('button', { name: /Save draft/i });
    await act(async () => { fireEvent.click(saveBtn); });

    await waitFor(() => {
      const putCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => c[1]?.method === 'PUT',
      );
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body).toHaveProperty('customCss', 'body {}');
      expect(body).toHaveProperty('customJs', '');
    });
  });

  it('shows "Draft saved" toast on success', async () => {
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '.a {}' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));
    });
    await waitFor(() => expect(screen.getByText('Draft saved')).toBeInTheDocument());
  });

  it('shows error when PUT returns success=false', async () => {
    setupFetch({ putBody: { success: false, message: 'Quota exceeded' } });
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '.b {}' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));
    });
    await waitFor(() => expect(screen.getByText('Quota exceeded')).toBeInTheDocument());
  });

  it('shows fallback error when PUT success=false has no message', async () => {
    setupFetch({ putBody: { success: false } });
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '.c {}' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));
    });
    await waitFor(() => expect(screen.getByText('Save failed.')).toBeInTheDocument());
  });

  it('shows error when PUT throws', async () => {
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      const method = (init?.method || 'GET').toUpperCase();
      if (method === 'GET') return makeJsonResponse(makeSuccessPayload());
      return Promise.reject(new Error('PUT network error'));
    }) as any;

    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '.d {}' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));
    });
    await waitFor(() => expect(screen.getByText('PUT network error')).toBeInTheDocument());
  });

  it('shows "Saved" (not "Draft saved") in legacy mode (supportsDrafts=false)', async () => {
    setupFetch({
      putBody: { success: true, data: { customCss: '.e {}', customJs: '' } },
    });
    await mountAndWait({ endpoint: ENDPOINT, supportsDrafts: false });
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '.e {}' } });
    // In legacy mode the button label is "Save" (not "Save draft").
    // The accessible name includes the material-icon span text "save" + "Save",
    // so use a text-content filter to find it reliably.
    const allBtns = screen.getAllByRole('button');
    const saveBtn = allBtns.find((b) => b.textContent?.includes('Save') && !b.textContent?.includes('draft'));
    expect(saveBtn).toBeTruthy();
    await act(async () => { fireEvent.click(saveBtn!); });
    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
  });
});

// ---------------------------------------------------------------------------
// 6. Publish draft (POST /publish)
// ---------------------------------------------------------------------------
describe('CustomCodeForm — publishDraft', () => {
  it('POSTs to /publish when Publish button is clicked after confirming', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'live-css',
        draftCustomCss: 'draft-css',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
    });
    await mountAndWait();

    const publishBtn = getPublishBtn();
    expect(publishBtn).toBeTruthy();
    await act(async () => { fireEvent.click(publishBtn); });

    await waitFor(() => {
      const postCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].endsWith('/publish') && c[1]?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('shows "Published to live" toast on success', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'a',
        draftCustomCss: 'b',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
      publishBody: makeSuccessPayload({ hasDraft: false }),
    });
    await mountAndWait();
    await act(async () => { fireEvent.click(getPublishBtn()); });
    await waitFor(() => expect(screen.getByText('Published to live')).toBeInTheDocument());
  });

  it('does not POST when user cancels confirm dialog', async () => {
    (window.confirm as any).mockReturnValueOnce(false);
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'a',
        draftCustomCss: 'b',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
    });
    await mountAndWait();
    await act(async () => { fireEvent.click(getPublishBtn()); });
    const postCall = (global.fetch as any).mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].endsWith('/publish'),
    );
    expect(postCall).toBeUndefined();
  });

  it('shows error when publish returns success=false', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'a',
        draftCustomCss: 'b',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
      publishBody: { success: false, message: 'Publish rejected' },
    });
    await mountAndWait();
    await act(async () => { fireEvent.click(getPublishBtn()); });
    await waitFor(() => expect(screen.getByText('Publish rejected')).toBeInTheDocument());
  });

  it('Publish button is absent when supportsDrafts=false', async () => {
    await mountAndWait({ endpoint: ENDPOINT, supportsDrafts: false });
    // When supportsDrafts=false the Publish button is not rendered at all.
    const allBtns = screen.getAllByRole('button');
    const publishBtn = allBtns.find(
      (b) => b.textContent?.includes('Publish') && !b.textContent?.includes('unpublished'),
    );
    expect(publishBtn).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 7. Discard draft (POST /discard)
// ---------------------------------------------------------------------------
describe('CustomCodeForm — discardDraft', () => {
  function withDraft() {
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'live',
        draftCustomCss: 'draft',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
    });
  }

  it('POSTs to /discard when Discard draft is clicked and confirmed', async () => {
    withDraft();
    await mountAndWait();
    const discardBtn = screen.getByRole('button', { name: /Discard draft/i });
    await act(async () => { fireEvent.click(discardBtn); });
    await waitFor(() => {
      const postCall = (global.fetch as any).mock.calls.find(
        (c: any[]) => typeof c[0] === 'string' && c[0].endsWith('/discard') && c[1]?.method === 'POST',
      );
      expect(postCall).toBeTruthy();
    });
  });

  it('shows "Draft discarded" toast on success', async () => {
    withDraft();
    await mountAndWait();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Discard draft/i }));
    });
    await waitFor(() => expect(screen.getByText('Draft discarded')).toBeInTheDocument());
  });

  it('does not POST when user cancels confirm', async () => {
    withDraft();
    (window.confirm as any).mockReturnValueOnce(false);
    await mountAndWait();
    const discardBtn = screen.getByRole('button', { name: /Discard draft/i });
    await act(async () => { fireEvent.click(discardBtn); });
    const postCall = (global.fetch as any).mock.calls.find(
      (c: any[]) => typeof c[0] === 'string' && c[0].endsWith('/discard'),
    );
    expect(postCall).toBeUndefined();
  });

  it('shows error when discard returns success=false', async () => {
    withDraft();
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'live',
        draftCustomCss: 'draft',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
      discardBody: { success: false, message: 'Cannot discard' },
    });
    await mountAndWait();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Discard draft/i }));
    });
    await waitFor(() => expect(screen.getByText('Cannot discard')).toBeInTheDocument());
  });

  it('Discard draft button is absent when no hasDraft', async () => {
    await mountAndWait();
    expect(screen.queryByRole('button', { name: /Discard draft/i })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 8. Draft metadata display
// ---------------------------------------------------------------------------
describe('CustomCodeForm — draft metadata', () => {
  it('shows "Draft has unpublished changes" pill when hasDraft and draft differs from live', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'live',
        draftCustomCss: 'draft',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
    });
    await mountAndWait();
    expect(screen.getByText(/Draft has unpublished changes/i)).toBeInTheDocument();
  });

  it('does not show "Draft has unpublished changes" when draft matches live', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        customCss: 'same',
        draftCustomCss: 'same',
        hasDraft: true,
        draftUpdatedAt: new Date().toISOString(),
      }),
    });
    await mountAndWait();
    expect(screen.queryByText(/Draft has unpublished changes/i)).toBeNull();
  });

  it('shows "Drafted by" metadata row when hasDraft and draftUpdatedAt exists', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        hasDraft: true,
        draftUpdatedAt: '2026-01-01T12:00:00.000Z',
        draftUpdatedBy: { id: 1, name: 'Alice', email: 'alice@example.com' },
      }),
    });
    await mountAndWait();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('shows email when draftUpdatedBy name is null', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        hasDraft: true,
        draftUpdatedAt: '2026-01-01T12:00:00.000Z',
        draftUpdatedBy: { id: 1, name: null, email: 'bob@example.com' },
      }),
    });
    await mountAndWait();
    expect(screen.getByText('bob@example.com')).toBeInTheDocument();
  });

  it('shows "unknown" when draftUpdatedBy is null', async () => {
    setupFetch({
      getBody: makeSuccessPayload({
        hasDraft: true,
        draftUpdatedAt: '2026-01-01T12:00:00.000Z',
        draftUpdatedBy: null,
      }),
    });
    await mountAndWait();
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('does not show "Drafted by" row when hasDraft=false', async () => {
    await mountAndWait();
    expect(screen.queryByText(/Drafted by/i)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 9. relativeTime (indirectly via rendered output)
// ---------------------------------------------------------------------------
describe('CustomCodeForm — relativeTime display', () => {
  function withDraftAt(iso: string) {
    setupFetch({
      getBody: makeSuccessPayload({
        hasDraft: true,
        draftUpdatedAt: iso,
        draftUpdatedBy: { id: 1, name: 'Dev', email: null },
      }),
    });
  }

  it('shows "just now" for a very recent draft', async () => {
    withDraftAt(new Date(Date.now() - 5000).toISOString());
    await mountAndWait();
    expect(screen.getByText('just now')).toBeInTheDocument();
  });

  it('shows "X minutes ago" for a draft a few minutes old', async () => {
    withDraftAt(new Date(Date.now() - 3 * 60 * 1000).toISOString());
    await mountAndWait();
    expect(screen.getByText('3 minutes ago')).toBeInTheDocument();
  });

  it('shows "1 minute ago" (singular) for exactly 1 minute', async () => {
    withDraftAt(new Date(Date.now() - 65 * 1000).toISOString());
    await mountAndWait();
    expect(screen.getByText('1 minute ago')).toBeInTheDocument();
  });

  it('shows "X hours ago" for a draft a few hours old', async () => {
    withDraftAt(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString());
    await mountAndWait();
    expect(screen.getByText('2 hours ago')).toBeInTheDocument();
  });

  it('shows "X days ago" for a draft several days old', async () => {
    withDraftAt(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString());
    await mountAndWait();
    expect(screen.getByText('5 days ago')).toBeInTheDocument();
  });

  it('shows locale date string for a draft older than 30 days', async () => {
    const old = new Date('2025-01-01T00:00:00.000Z');
    withDraftAt(old.toISOString());
    await mountAndWait();
    // The component calls toLocaleDateString() — any non-relative string is fine.
    // We just check "just now", "ago", etc. are NOT shown.
    expect(screen.queryByText(/ago/i)).toBeNull();
    expect(screen.queryByText('just now')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 10. Save draft button disabled when viewing Live tab
// ---------------------------------------------------------------------------
describe('CustomCodeForm — button state while viewing Live tab', () => {
  it('Save draft button is disabled when on Live tab (showingLive=true)', async () => {
    await mountAndWait();
    fireEvent.click(getLiveTabBtn());
    const saveBtn = screen.getByRole('button', { name: /Save draft/i });
    expect(saveBtn).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// 11. Toast auto-dismiss (setTimeout path — we just verify the toast appears
//     without fake timers to keep the test lightweight)
// ---------------------------------------------------------------------------
describe('CustomCodeForm — toast appearance', () => {
  it('draft saved toast is visible immediately after save', async () => {
    await mountAndWait();
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '.toast-test {}' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save draft/i }));
    });
    await waitFor(() => expect(screen.getByText('Draft saved')).toBeInTheDocument());
  });
});
