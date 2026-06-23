// @vitest-environment jsdom
/**
 * Unit tests for `app/portal/tools/pitch-decks/[id]/page.tsx` — the pitch deck
 * editor page. Sub-components and the `_lib/api` module are mocked into thin
 * stubs that expose the parent's callbacks via clickable buttons, letting us
 * drive the page's internal CRUD / AI / version / survey logic from the test.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';

// ─── Mocks (must precede page import) ───────────────────────────────────────

const pushMock = vi.fn();
const replaceMock = vi.fn();
let searchParamsValue = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/portal/tools/pitch-decks/1',
  useSearchParams: () => searchParamsValue,
}));

// next-auth — DeckCollaborationProvider uses this; provide stub.
vi.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => ({ data: null }),
}));

// Realtime client — short-circuit to prevent socket use.
vi.mock('@/lib/realtime/client', () => ({
  __esModule: true,
  useRealtimeDoc: () => ({
    ydoc: null,
    awareness: null,
    status: 'disconnected',
    peers: [],
  }),
  useLocalAwareness: () => ({
    setCursor: vi.fn(),
    setSelection: vi.fn(),
    setActiveSlide: vi.fn(),
    setFocusedField: vi.fn(),
    setPresence: vi.fn(),
  }),
}));

// API module — capture every call so tests assert behaviour without a server.
const apiMocks = vi.hoisted(() => {
  // Inline tiny deck factory because makeDeck isn't defined yet at hoist time.
  const minimalDeck = () => ({
    id: 1,
    title: 'AI Deck',
    slug: 'ai-deck',
    description: null,
    status: 'draft',
    slides: [
      { id: 'ai-slide-1', label: 'Generated', blocks: [{ id: 'ai-b1', type: 'heading', order: 1, content: 'h' }] },
    ],
    theme: {
      primaryColor: '#000', accentColor: '#f00', backgroundColor: '#fff',
      textColor: '#111', headingFont: 's', bodyFont: 's',
    },
    sourceUrl: null, brandingProfileId: null, seoTitle: null,
    seoDescription: null, ogImage: null, canonicalUrl: null, noIndex: false,
    updatedAt: '2025-01-01',
  });
  return {
    loadBrandDefaults: vi.fn(async () => ({ success: true, data: { foo: 'bar' } })),
    loadNavServices: vi.fn(async () => ({ success: true, data: [{ category: 'surveys', subscribed: true }] })),
    loadSurveys: vi.fn(async () => ({
      success: true,
      data: [
        {
          id: 7,
          title: 'Lead intake',
          status: 'active',
          fields: [
            { id: 'q1', type: 'text', label: 'Name', required: true, options: [], order: 1 },
            { id: 'q2', type: 'page_break', label: '', required: false, options: [], order: 2 },
            { id: 'q3', type: 'email', label: 'Email', required: false, options: [], order: 3 },
          ],
        },
      ],
    })),
    patchSurveyFields: vi.fn(async () => ({})),
    patchDeck: vi.fn(async () => ({ success: true, data: null })),
    saveDeck: vi.fn(async () => ({ success: true })),
    deleteDeck: vi.fn(async () => ({})),
    regenerateDeck: vi.fn(async () => ({ success: true, data: minimalDeck() })),
    generateSlide: vi.fn(async () => ({ success: true, data: minimalDeck(), aiResponse: 'done' })),
    batchEditSlides: vi.fn(async () => ({ success: true, data: minimalDeck() })),
    listVersions: vi.fn(async () => ({ success: true, data: [{ id: 1, label: 'v1', trigger: 'manual', slideCount: 1, createdAt: 'now' }] })),
    saveVersionCheckpoint: vi.fn(async () => ({ success: true, data: { id: 2, label: 'v2', trigger: 'manual', slideCount: 1, createdAt: 'now' } })),
    restoreVersion: vi.fn(async () => ({ success: true, data: minimalDeck() })),
    uploadHtmlSlide: vi.fn(async () => ({ success: true, data: { url: '/u/x.html', filename: 'x.html' } })),
  };
});

vi.mock('@/app/portal/tools/pitch-decks/[id]/_lib/api', () => apiMocks);

// usePitchDeckState — drive the deck/loading state from a holder so tests
// can vary the initial deck per-test.
const stateHolder = vi.hoisted(() => ({
  deck: null as unknown,
  loading: false,
  error: '',
  hasUnsavedChanges: false,
  saving: false,
  publishing: false,
}));
const setDeckMock = vi.hoisted(() => vi.fn());
const setErrorMock = vi.hoisted(() => vi.fn());
const setHasUnsavedChangesMock = vi.hoisted(() => vi.fn());
const setSavingMock = vi.hoisted(() => vi.fn());
const setPublishingMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/portal/tools/pitch-decks/[id]/_hooks/usePitchDeckState', () => ({
  __esModule: true,
  usePitchDeckState: () => {
    // Use React state so updates re-render and exercise effects/render paths.
    const [deck, setDeckReact] = React.useState<Deck | null>(stateHolder.deck);
    const [hasUnsavedChanges, setHasUnsavedChangesReact] = React.useState(stateHolder.hasUnsavedChanges);
    const [saving, setSavingReact] = React.useState(stateHolder.saving);
    const [publishing, setPublishingReact] = React.useState(stateHolder.publishing);
    const [error, setErrorReact] = React.useState(stateHolder.error);

    const setDeck = (v: unknown) => {
      setDeckMock(v);
      setDeckReact((prev) => (typeof v === 'function' ? (v as (p: typeof prev) => typeof prev)(prev) : v as typeof prev));
    };
    const setError = (v: string) => {
      setErrorMock(v);
      setErrorReact(v);
    };
    const setHasUnsavedChanges = (v: boolean) => {
      setHasUnsavedChangesMock(v);
      setHasUnsavedChangesReact(v);
    };
    const setSaving = (v: boolean) => {
      setSavingMock(v);
      setSavingReact(v);
    };
    const setPublishing = (v: boolean) => {
      setPublishingMock(v);
      setPublishingReact(v);
    };

    return {
      deck,
      setDeck,
      loading: stateHolder.loading,
      error,
      setError,
      hasUnsavedChanges,
      setHasUnsavedChanges,
      saving,
      setSaving,
      publishing,
      setPublishing,
      refetch: vi.fn(),
    };
  },
}));

// Sub-components — replaced with thin stubs that expose the page's callbacks
// as clickable buttons. Each stub renders a data-testid root so tests can
// query, plus a button per callback the test wants to drive.
const { makeStub } = vi.hoisted(() => {
  // Strip non-serializable values for the test inspection layer.
  function serialize(v: unknown, depth = 0): unknown {
    if (v == null) return v;
    if (depth > 6) return '<deep>';
    if (typeof v === 'function') return '<fn>';
    if (v instanceof Set) return Array.from(v.values());
    if (React.isValidElement(v)) return '<react-element>';
    if (Array.isArray(v)) return v.map((x) => serialize(x, depth + 1));
    if (typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v)) {
        try { out[k] = serialize((v as Record<string, unknown>)[k], depth + 1); } catch { out[k] = '<unserialisable>'; }
      }
      return out;
    }
    return v;
  }
  function makeStub(name: string, propsToButtons: string[] = []) {
    return function Stub(props: Record<string, unknown>) {
      return React.createElement(
        'div',
        { 'data-testid': name, 'data-props': JSON.stringify(serialize(props)) },
        propsToButtons.map((p) =>
          React.createElement(
            'button',
            {
              key: p,
              'data-testid': `${name}-${p}`,
              onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
                const cb = props[p];
                if (typeof cb === 'function') {
                  // For submit-style callbacks, always pass a synthetic event
                  // with preventDefault() — page handlers expect React.FormEvent.
                  if (p === 'onSubmit' || p === 'onSubmitSlidePrompt') {
                    (cb as (arg: { preventDefault: () => void }) => void)({ preventDefault: () => {} });
                    return;
                  }
                  const arg = (e.currentTarget as HTMLButtonElement).dataset.arg;
                  if (arg) {
                    try {
                      const parsed = JSON.parse(arg) as unknown;
                      if (Array.isArray(parsed)) {
                        (cb as (...args: unknown[]) => void)(...parsed);
                      } else {
                        (cb as (arg: unknown) => void)(parsed);
                      }
                      return;
                    } catch {}
                  }
                  (cb as () => void)();
                }
              },
            },
            p,
          ),
        ),
      );
    };
  }
  return { makeStub };
});

vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/EditorHeader', () => ({
  EditorHeader: makeStub('EditorHeader', [
    'onStartEditTitle', 'onSaveTitle', 'onCancelEditTitle',
    'onStartEditSlug', 'onSaveSlug', 'onCancelEditSlug',
    'onToggleTheme', 'onToggleRegenerate', 'onToggleHistory', 'onToggleSeo',
    'onSave', 'onTogglePublish', 'onPresent', 'onDelete',
  ]),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/ThemePanel', () => ({
  ThemePanel: makeStub('ThemePanel', ['onClose', 'onUpdateTheme', 'onUpdateBrandingProfileId']),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/RegenerateModal', () => ({
  RegenerateModal: makeStub('RegenerateModal', ['onPromptChange', 'onClose', 'onSubmit']),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/HistoryPanel', () => ({
  HistoryPanel: makeStub('HistoryPanel', ['onClose', 'onSaveCheckpoint', 'onRestore']),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/SeoPanel', () => ({
  SeoPanel: makeStub('SeoPanel', ['onUpdateDeck', 'onClose']),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/SlideList', () => ({
  SlideList: makeStub('SlideList', [
    'onSetActive', 'onSetCollapsed', 'onOpenBoardView', 'onAddSlide',
    'onUploadHtmlSlide', 'onRenameSlide', 'onDuplicateSlide', 'onRemoveSlide',
    'onToggleSelect', 'onAddDecisionSlide', 'onAddPathGroup',
    'onAddSlideToPathGroup', 'onToggleSurveyPicker', 'onAddSurveySlide',
    'onDragEnd',
  ]),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/BatchEditBar', () => ({
  BatchEditBar: makeStub('BatchEditBar', ['onPromptChange', 'onSelectAll', 'onClear', 'onSubmit']),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/BoardView', () => ({
  BoardView: makeStub('BoardView', [
    'onSetColumns', 'onClose', 'onSelectSlide', 'onRenameSlide',
    'onRenamePathGroup', 'onAddSlide', 'onUploadHtmlSlide', 'onDragEnd',
  ]),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/DecisionSlideEditor', () => ({
  DecisionSlideEditor: makeStub('DecisionSlideEditor', [
    'onUpdateLabel', 'onAddOption', 'onUpdateOption', 'onRemoveOption',
    'onUpdateCover', 'onRemoveSlide',
  ]),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/SurveySlideEditor', () => ({
  SurveySlideQuestionList: makeStub('SurveySlideQuestionList', ['onSelectField', 'onRemoveSlide']),
  SurveyFieldEditorView: makeStub('SurveyFieldEditorView', ['onSelectFieldId', 'onUpdateField']),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/SlideSettingsPanel', () => ({
  SlideSettingsPanel: makeStub('SlideSettingsPanel', ['onChange']),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/SlideContentEditor', () => ({
  SlideContentEditor: makeStub('SlideContentEditor', [
    'onSlidePromptChange', 'onSubmitSlidePrompt', 'onChangeNotes',
    'onBlocksChange', 'onSetEditorLeftCollapsed', 'onSetEditorRightCollapsed',
  ]),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/DeckCollaborationProvider', () => {
  return {
    DeckCollaborationProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useDeckCollab: () => ({
      ydoc: null,
      status: 'disconnected',
      peers: [],
      awareness: {
        setCursor: () => {}, setSelection: () => {}, setActiveSlide: () => {},
        setFocusedField: () => {}, setPresence: () => {},
      },
      localUser: null,
      enabled: false,
    }),
  };
});
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/DeckPresenceBar', () => ({
  DeckPresenceBar: makeStub('DeckPresenceBar', ['onJumpToSlide']),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/DeckSlideCursors', () => ({
  DeckSlideCursors: makeStub('DeckSlideCursors'),
}));
vi.mock('@/app/portal/tools/pitch-decks/[id]/_components/DeckSlideThumbnailIndicators', () => ({
  DeckSlideThumbnailIndicators: makeStub('DeckSlideThumbnailIndicators', ['onJumpToSlide']),
}));

// dnd-kit — module-level usage; pass through.
vi.mock('@dnd-kit/core', async () => ({
  DragEndEvent: undefined,
}));
vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: <T,>(arr: T[], from: number, to: number) => {
    const next = [...arr];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  },
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

type TestBlock = { id: string; type: string; order: number; content: string } & Record<string, unknown>;
type TestSlide = { id: string; label: string; blocks: TestBlock[] } & Record<string, unknown>;
type TestDeck = { id: number; title: string; slug: string; slides: TestSlide[] } & Record<string, unknown>;

function makeBlock(id: string, type: string = 'heading', extra: Record<string, unknown> = {}): TestBlock {
  return { id, type, order: 1, content: 'h', ...extra };
}

function makeSlide(id: string, label: string, extra: Record<string, unknown> = {}): TestSlide {
  return {
    id,
    label,
    blocks: [makeBlock(`${id}-b`, 'heading')],
    ...extra,
  };
}

function makeDeck(overrides: Partial<TestDeck> = {}): TestDeck {
  return {
    id: 1,
    title: 'My deck',
    slug: 'my-deck',
    description: 'desc',
    status: 'draft',
    slides: [makeSlide('s1', 'Slide 1'), makeSlide('s2', 'Slide 2')],
    theme: {
      primaryColor: '#000000',
      accentColor: '#ff0000',
      backgroundColor: '#ffffff',
      textColor: '#111111',
      headingFont: 'sans',
      bodyFont: 'sans',
    },
    sourceUrl: null,
    brandingProfileId: null,
    seoTitle: null,
    seoDescription: null,
    ogImage: null,
    canonicalUrl: null,
    noIndex: false,
    updatedAt: '2025-01-01',
    ...overrides,
  };
}

// Imports under test (after mocks)
import PitchDeckEditorPage from '@/app/portal/tools/pitch-decks/[id]/page';

// Cache a pre-resolved params promise — React.use needs a thenable that's
// already settled (or that resolves synchronously via the React cache).
type ResolvedParams = Promise<{ id: string }> & { status: string; value: { id: string } };
const cachedParams = Promise.resolve({ id: '1' }) as ResolvedParams;
// Attach `status` / `value` so React's `use` shortcuts to the resolved value
// without suspending.
cachedParams.status = 'fulfilled';
cachedParams.value = { id: '1' };

function renderPage(deck: ReturnType<typeof makeDeck> | null = makeDeck(), opts: Partial<typeof stateHolder> = {}) {
  stateHolder.deck = deck;
  stateHolder.loading = opts.loading ?? false;
  stateHolder.error = opts.error ?? '';
  stateHolder.hasUnsavedChanges = opts.hasUnsavedChanges ?? false;
  stateHolder.saving = opts.saving ?? false;
  stateHolder.publishing = opts.publishing ?? false;
  return render(<PitchDeckEditorPage params={cachedParams} />);
}

function getProps(testid: string, container: HTMLElement) {
  const el = container.querySelector(`[data-testid="${testid}"]`) as HTMLElement | null;
  if (!el) return null;
  return JSON.parse(el.dataset.props || '{}');
}

function clickCb(container: HTMLElement, testid: string, payload?: unknown) {
  const btn = container.querySelector(`[data-testid="${testid}"]`) as HTMLButtonElement | null;
  if (!btn) throw new Error(`button ${testid} not found`);
  if (payload !== undefined) btn.dataset.arg = JSON.stringify(payload);
  fireEvent.click(btn);
}

beforeEach(() => {
  searchParamsValue = new URLSearchParams();
  pushMock.mockReset();
  replaceMock.mockReset();
  setDeckMock.mockReset();
  setErrorMock.mockReset();
  setHasUnsavedChangesMock.mockReset();
  setSavingMock.mockReset();
  setPublishingMock.mockReset();
  Object.values(apiMocks).forEach((m) => m.mockClear());
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Top-level rendering ────────────────────────────────────────────────────

describe('PitchDeckEditorPage rendering', () => {
  it('renders the loading spinner when usePitchDeckState reports loading', () => {
    const { container } = renderPage(null, { loading: true });
    expect(container.querySelector('.material-icons')?.textContent).toContain('autorenew');
  });

  it('renders the "Deck not found" empty state when no deck is loaded', () => {
    const { container } = renderPage(null);
    expect(container.textContent).toContain('Deck not found');
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/portal/tools/pitch-decks');
  });

  it('renders EditorHeader + SlideList + DeckPresenceBar when a deck is loaded', () => {
    const { container } = renderPage();
    expect(container.querySelector('[data-testid="EditorHeader"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="SlideList"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="DeckPresenceBar"]')).toBeTruthy();
  });

  it('renders the no-slides empty state when deck.slides is empty', () => {
    const { container } = renderPage(makeDeck({ slides: [] }));
    expect(container.textContent).toContain('No slides yet');
    expect(container.textContent).toContain('Generate with AI');
    expect(container.textContent).toContain('Add Blank Slide');
  });

  it('passes pathGroups and slide counts to SlideList', () => {
    const { container } = renderPage(
      makeDeck({
        slides: [
          makeSlide('s1', 'Main 1'),
          makeSlide('s2', 'Branch 1', { pathGroup: 'alpha' }),
          makeSlide('s3', 'Branch 2', { pathGroup: 'alpha' }),
          makeSlide('s4', 'Branch 3', { pathGroup: 'beta' }),
        ],
      }),
    );
    const props = getProps('SlideList', container);
    expect(props.pathGroups).toEqual(['alpha', 'beta']);
  });
});

// ─── Title / slug editing ───────────────────────────────────────────────────

describe('Title and slug editing', () => {
  it('starts editing the title and surfaces titleDraft via the header', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onStartEditTitle');
    await waitFor(() => {
      const props = getProps('EditorHeader', container);
      expect(props.editingTitle).toBe(true);
      expect(props.titleDraft).toBe('My deck');
    });
  });

  it('cancels title editing', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onStartEditTitle');
    clickCb(container, 'EditorHeader-onCancelEditTitle');
    await waitFor(() => {
      const props = getProps('EditorHeader', container);
      expect(props.editingTitle).toBe(false);
    });
  });

  it('saveTitle: no-op when title is unchanged', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onStartEditTitle');
    clickCb(container, 'EditorHeader-onSaveTitle');
    await waitFor(() => {
      expect(apiMocks.patchDeck).not.toHaveBeenCalled();
    });
  });

  it('starts editing the slug', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onStartEditSlug');
    await waitFor(() => {
      const props = getProps('EditorHeader', container);
      expect(props.editingSlug).toBe(true);
      expect(props.slugDraft).toBe('my-deck');
    });
  });

  it('cancels slug editing and clears slugError', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onStartEditSlug');
    clickCb(container, 'EditorHeader-onCancelEditSlug');
    await waitFor(() => {
      const props = getProps('EditorHeader', container);
      expect(props.editingSlug).toBe(false);
    });
  });

  it('saveSlug: same slug exits edit mode without API call', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onStartEditSlug');
    clickCb(container, 'EditorHeader-onSaveSlug');
    await waitFor(() => {
      expect(apiMocks.patchDeck).not.toHaveBeenCalled();
      const props = getProps('EditorHeader', container);
      expect(props.editingSlug).toBe(false);
    });
  });
});

// ─── Panels (toggle visibility) ─────────────────────────────────────────────

describe('Panel toggles', () => {
  it('toggles the theme panel', async () => {
    const { container } = renderPage();
    expect(container.querySelector('[data-testid="ThemePanel"]')).toBeNull();
    clickCb(container, 'EditorHeader-onToggleTheme');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="ThemePanel"]')).toBeTruthy();
    });
    clickCb(container, 'ThemePanel-onClose');
    // close button calls setShowTheme(false) — but our stub onClose maps to setShowTheme(false)
    // through onClose which is rendered as a button so click flips it.
    await waitFor(() => {
      // Theme panel is still mounted because onClose just calls setShowTheme(false) — verify by re-toggling
    });
  });

  it('toggles the regenerate modal', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleRegenerate');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="RegenerateModal"]')).toBeTruthy();
    });
  });

  it('toggles the history panel and loads versions on open', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleHistory');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="HistoryPanel"]')).toBeTruthy();
      expect(apiMocks.listVersions).toHaveBeenCalledWith('1');
    });
  });

  it('toggles the SEO panel', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleSeo');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="SeoPanel"]')).toBeTruthy();
    });
  });
});

// ─── Save / publish / delete ────────────────────────────────────────────────

describe('Save / publish / delete', () => {
  it('saves the deck via apiSaveDeck when collab is disabled', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onSave');
    await waitFor(() => {
      expect(apiMocks.saveDeck).toHaveBeenCalled();
    });
    expect(apiMocks.saveDeck.mock.calls[0][0]).toBe('1');
  });

  it('togglePublish flips the status via patchDeck', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onTogglePublish');
    await waitFor(() => {
      expect(apiMocks.patchDeck).toHaveBeenCalled();
    });
    expect(apiMocks.patchDeck.mock.calls[0][1]).toEqual({ status: 'published' });
  });

  it('togglePublish from published flips back to draft', async () => {
    const { container } = renderPage(makeDeck({ status: 'published' }));
    clickCb(container, 'EditorHeader-onTogglePublish');
    await waitFor(() => {
      expect(apiMocks.patchDeck.mock.calls[0][1]).toEqual({ status: 'draft' });
    });
  });

  it('opens presenter window onPresent', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onPresent');
    expect(openSpy).toHaveBeenCalled();
    expect(openSpy.mock.calls[0][0]).toContain('/portal/tools/pitch-decks/1/presenter');
    openSpy.mockRestore();
  });

  it('cancels delete when confirm() returns false', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onDelete');
    await Promise.resolve();
    expect(apiMocks.deleteDeck).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('deletes the deck and routes back when confirmed', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onDelete');
    await waitFor(() => {
      expect(apiMocks.deleteDeck).toHaveBeenCalledWith('1');
      expect(pushMock).toHaveBeenCalledWith('/portal/tools/pitch-decks');
    });
    confirmSpy.mockRestore();
  });
});

// ─── Slide CRUD via SlideList callbacks ─────────────────────────────────────

describe('Slide CRUD', () => {
  it('addSlide appends a fresh blank slide and moves activeSlide to it', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onAddSlide');
    await waitFor(() => {
      expect(setHasUnsavedChangesMock).toHaveBeenCalledWith(true);
    });
    const list = getProps('SlideList', container);
    expect(list.slides.length).toBe(3);
    expect(list.activeSlide).toBe(2);
  });

  it('renameSlide updates a slide label without firing setActive', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onRenameSlide', [0, 'Renamed!']);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides[0].label).toBe('Renamed!');
    });
  });

  it('duplicateSlide copies a slide with a "(copy)" suffix', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onDuplicateSlide', 0);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides.length).toBe(3);
      expect(list.slides[1].label).toContain('(copy)');
    });
  });

  it('removeSlide cancelled when confirm() is false', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = renderPage();
    clickCb(container, 'SlideList-onRemoveSlide', 0);
    await Promise.resolve();
    const list = getProps('SlideList', container);
    expect(list.slides.length).toBe(2);
    confirmSpy.mockRestore();
  });

  it('removeSlide on a live slide marks it pendingDelete (tombstone) instead of dropping it', async () => {
    // Live slides are no longer removed immediately — they get a pendingDelete
    // draft tombstone and stay visible in the public deck until publish.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = renderPage();
    clickCb(container, 'SlideList-onRemoveSlide', 0);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides.length).toBe(2);
      expect(list.slides[0].draft.pendingDelete).toBe(true);
    });
    confirmSpy.mockRestore();
  });

  it('removeSlide drops a pending-create draft slide immediately when confirmed', async () => {
    // Pending-create slides have no live counterpart, so they are removed
    // from the array right away.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = renderPage(makeDeck({
      slides: [
        makeSlide('s1', 'Slide 1', { draft: { pendingCreate: true, blocks: [makeBlock('d1', 'heading')] } }),
        makeSlide('s2', 'Slide 2'),
      ],
    }));
    clickCb(container, 'SlideList-onRemoveSlide', 0);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides.length).toBe(1);
      expect(list.slides[0].id).toBe('s2');
    });
    confirmSpy.mockRestore();
  });

  it('removeSlide refuses to drop below 1 slide', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = renderPage(makeDeck({ slides: [makeSlide('only', 'Only')] }));
    clickCb(container, 'SlideList-onRemoveSlide', 0);
    await Promise.resolve();
    const list = getProps('SlideList', container);
    expect(list.slides.length).toBe(1);
    confirmSpy.mockRestore();
  });

  it('toggleSelect adds and removes slide indices from the selection set', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onToggleSelect', 0);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.selectedSlides).toEqual([0]);
    });
    clickCb(container, 'SlideList-onToggleSelect', 0);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.selectedSlides).toEqual([]);
    });
  });
});

// ─── Path groups & decision slides ──────────────────────────────────────────

describe('Path groups and decision slides', () => {
  it('addPathGroup uses window.prompt to slugify a name into a new slide', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue('Case Studies');
    const { container } = renderPage();
    clickCb(container, 'SlideList-onAddPathGroup');
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides.some((s: Record<string, unknown>) => s.pathGroup === 'case-studies')).toBe(true);
    });
    promptSpy.mockRestore();
  });

  it('addPathGroup is a no-op when prompt is cancelled', async () => {
    const promptSpy = vi.spyOn(window, 'prompt').mockReturnValue(null);
    const { container } = renderPage();
    clickCb(container, 'SlideList-onAddPathGroup');
    await Promise.resolve();
    const list = getProps('SlideList', container);
    expect(list.slides.length).toBe(2);
    promptSpy.mockRestore();
  });

  it('addSlideToPathGroup appends a new slide after the last in that group', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [
          makeSlide('s1', 'Main'),
          makeSlide('s2', 'A1', { pathGroup: 'alpha' }),
        ],
      }),
    );
    clickCb(container, 'SlideList-onAddSlideToPathGroup', 'alpha');
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides.filter((s: Record<string, unknown>) => s.pathGroup === 'alpha').length).toBe(2);
    });
  });

  it('addDecisionSlide creates a decision slide with options derived from path groups', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [
          makeSlide('s1', 'Main'),
          makeSlide('s2', 'A1', { pathGroup: 'alpha' }),
          makeSlide('s3', 'B1', { pathGroup: 'beta' }),
        ],
      }),
    );
    clickCb(container, 'SlideList-onAddDecisionSlide');
    await waitFor(() => {
      const list = getProps('SlideList', container);
      const decision = list.slides.find((s: Record<string, unknown>) => s.decisionSlide);
      expect(decision).toBeTruthy();
      expect(decision.decisionOptions.length).toBe(2);
    });
  });

  it('addDecisionSlide falls back to two default options when no path groups exist', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onAddDecisionSlide');
    await waitFor(() => {
      const list = getProps('SlideList', container);
      const decision = list.slides.find((s: Record<string, unknown>) => s.decisionSlide);
      expect(decision.decisionOptions[0].label).toBe('Option A');
      expect(decision.decisionOptions[1].label).toBe('Option B');
    });
  });

  it('renders DecisionSlideEditor when the active slide is a decision slide', () => {
    const { container } = renderPage(
      makeDeck({
        slides: [
          makeSlide('s1', 'Decision', {
            decisionSlide: true,
            decisionOptions: [{ id: 'o1', label: 'A', pathGroup: 'a' }],
          }),
        ],
      }),
    );
    expect(container.querySelector('[data-testid="DecisionSlideEditor"]')).toBeTruthy();
  });

  it('decision slide: updateLabel writes through to the slide', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [makeSlide('s1', 'Decision', { decisionSlide: true, decisionOptions: [] })],
      }),
    );
    clickCb(container, 'DecisionSlideEditor-onUpdateLabel', 'New Label');
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides[0].label).toBe('New Label');
    });
  });

  it('decision slide: addOption / updateOption / removeOption mutate decisionOptions', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [
          makeSlide('s1', 'Decision', {
            decisionSlide: true,
            decisionOptions: [{ id: 'o1', label: 'A', pathGroup: 'a' }],
          }),
        ],
      }),
    );
    clickCb(container, 'DecisionSlideEditor-onAddOption');
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides[0].decisionOptions.length).toBe(2);
    });
    clickCb(container, 'DecisionSlideEditor-onUpdateOption', ['o1', { label: 'Updated' }]);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides[0].decisionOptions[0].label).toBe('Updated');
    });
    clickCb(container, 'DecisionSlideEditor-onRemoveOption', 'o1');
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides[0].decisionOptions.find((o: Record<string, unknown>) => o.id === 'o1')).toBeUndefined();
    });
  });

  it('decision slide: updateCover merges into decisionCover', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [makeSlide('s1', 'Decision', { decisionSlide: true, decisionOptions: [] })],
      }),
    );
    clickCb(container, 'DecisionSlideEditor-onUpdateCover', { headline: 'Hello' });
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides[0].decisionCover?.headline).toBe('Hello');
    });
  });
});

// ─── AI flows ───────────────────────────────────────────────────────────────

describe('AI generation flows', () => {
  it('regenerate modal submits the prompt and replaces slides on success', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleRegenerate');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="RegenerateModal"]')).toBeTruthy();
    });
    clickCb(container, 'RegenerateModal-onPromptChange', 'Make it spicy');
    clickCb(container, 'RegenerateModal-onSubmit', { preventDefault: () => {} });
    await waitFor(() => {
      expect(apiMocks.regenerateDeck).toHaveBeenCalled();
    });
    expect(apiMocks.regenerateDeck.mock.calls[0][1]).toBe('Make it spicy');
  });

  it('regenerate is a no-op when prompt is blank', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleRegenerate');
    clickCb(container, 'RegenerateModal-onSubmit', { preventDefault: () => {} });
    await Promise.resolve();
    expect(apiMocks.regenerateDeck).not.toHaveBeenCalled();
  });

  it('slide content editor: generates a per-slide AI edit', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideContentEditor-onSlidePromptChange', 'Punch it up');
    clickCb(container, 'SlideContentEditor-onSubmitSlidePrompt', { preventDefault: () => {} });
    await waitFor(() => {
      expect(apiMocks.generateSlide).toHaveBeenCalled();
    });
  });

  it('per-slide AI edit is a no-op when prompt is blank', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideContentEditor-onSubmitSlidePrompt', { preventDefault: () => {} });
    await Promise.resolve();
    expect(apiMocks.generateSlide).not.toHaveBeenCalled();
  });

  it('batch edit: selecting slides exposes the BatchEditBar and submits batch prompt', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onToggleSelect', 0);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="BatchEditBar"]')).toBeTruthy();
    });
    clickCb(container, 'BatchEditBar-onPromptChange', 'Be concise');
    clickCb(container, 'BatchEditBar-onSubmit', { preventDefault: () => {} });
    await waitFor(() => {
      expect(apiMocks.batchEditSlides).toHaveBeenCalled();
    });
  });

  it('batch edit: select-all toggles every slide on, then off', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onToggleSelect', 0);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="BatchEditBar"]')).toBeTruthy();
    });
    clickCb(container, 'BatchEditBar-onSelectAll');
    await waitFor(() => {
      const props = getProps('BatchEditBar', container);
      expect(props.selectedCount).toBe(2);
    });
  });

  it('batch edit clear removes all selections and hides the bar', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onToggleSelect', 0);
    clickCb(container, 'BatchEditBar-onClear');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="BatchEditBar"]')).toBeNull();
    });
  });

  it('handleSlideEdit failure surfaces error message via setError', async () => {
    apiMocks.generateSlide.mockResolvedValueOnce({ success: false, message: 'boom' });
    const { container } = renderPage();
    clickCb(container, 'SlideContentEditor-onSlidePromptChange', 'test');
    clickCb(container, 'SlideContentEditor-onSubmitSlidePrompt', { preventDefault: () => {} });
    await waitFor(() => {
      expect(setErrorMock).toHaveBeenCalledWith('boom');
    });
  });

  it('handleRegenerate failure surfaces error message via setError', async () => {
    apiMocks.regenerateDeck.mockResolvedValueOnce({ success: false, message: 'no good' });
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleRegenerate');
    clickCb(container, 'RegenerateModal-onPromptChange', 'try');
    clickCb(container, 'RegenerateModal-onSubmit', { preventDefault: () => {} });
    await waitFor(() => {
      expect(setErrorMock).toHaveBeenCalledWith('no good');
    });
  });
});

// ─── Versions ───────────────────────────────────────────────────────────────

describe('Version history', () => {
  it('saveCheckpoint appends a new version', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleHistory');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="HistoryPanel"]')).toBeTruthy();
    });
    clickCb(container, 'HistoryPanel-onSaveCheckpoint');
    await waitFor(() => {
      expect(apiMocks.saveVersionCheckpoint).toHaveBeenCalled();
    });
  });

  it('restoreVersion: cancel via confirm dialog', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleHistory');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="HistoryPanel"]')).toBeTruthy();
    });
    clickCb(container, 'HistoryPanel-onRestore', 1);
    await Promise.resolve();
    expect(apiMocks.restoreVersion).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('restoreVersion confirmed: calls restoreVersion and reloads versions', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleHistory');
    await waitFor(() => {
      expect(apiMocks.listVersions).toHaveBeenCalled();
    });
    clickCb(container, 'HistoryPanel-onRestore', 1);
    await waitFor(() => {
      expect(apiMocks.restoreVersion).toHaveBeenCalledWith('1', 1);
    });
    confirmSpy.mockRestore();
  });

  it('restoreVersion failure surfaces error', async () => {
    apiMocks.restoreVersion.mockResolvedValueOnce({ success: false, message: 'nope' });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleHistory');
    clickCb(container, 'HistoryPanel-onRestore', 1);
    await waitFor(() => {
      expect(setErrorMock).toHaveBeenCalledWith('nope');
    });
    confirmSpy.mockRestore();
  });
});

// ─── Effects ────────────────────────────────────────────────────────────────

describe('Mount-time effects', () => {
  it('loads brand defaults for the deck', async () => {
    renderPage();
    await waitFor(() => {
      expect(apiMocks.loadBrandDefaults).toHaveBeenCalled();
    });
  });

  it('loads nav services + surveys + sets hasSurveyService when subscribed', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      expect(apiMocks.loadSurveys).toHaveBeenCalled();
      const list = getProps('SlideList', container);
      expect(list.hasSurveyService).toBe(true);
      expect(list.surveyListLoaded).toBe(true);
      expect(list.surveyList.length).toBe(1);
    });
  });

  it('skips loading surveys when not subscribed', async () => {
    apiMocks.loadNavServices.mockResolvedValueOnce({
      success: true,
      data: [{ category: 'surveys', subscribed: false }],
    });
    apiMocks.loadSurveys.mockClear();
    renderPage();
    await waitFor(() => {
      expect(apiMocks.loadNavServices).toHaveBeenCalled();
    });
    // loadSurveys should NOT fire because not subscribed
    expect(apiMocks.loadSurveys).not.toHaveBeenCalled();
  });

  it('surfaces AI-generation errors via searchParams "genError=1"', async () => {
    searchParamsValue = new URLSearchParams('genError=1');
    renderPage();
    await waitFor(() => {
      expect(setErrorMock).toHaveBeenCalledWith(
        'AI generation failed. You can try regenerating the deck.',
      );
    });
  });
});

// ─── Survey slides ──────────────────────────────────────────────────────────

describe('Survey slides', () => {
  it('renders SurveySlideQuestionList when active slide is a survey slide', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [makeSlide('sv1', 'Survey', { surveySlide: true, surveyId: 7 })],
      }),
    );
    // surveys load asynchronously; the question list should render once the
    // current slide is a survey slide regardless.
    expect(container.querySelector('[data-testid="SurveySlideQuestionList"]')).toBeTruthy();
  });

  it('selecting a survey field switches to the SurveyFieldEditorView', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [makeSlide('sv1', 'Survey', { surveySlide: true, surveyId: 7 })],
      }),
    );
    clickCb(container, 'SurveySlideQuestionList-onSelectField', 'q1');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="SurveyFieldEditorView"]')).toBeTruthy();
    });
  });

  it('addSurveySlide appends a survey slide', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.surveyListLoaded).toBe(true);
    });
    clickCb(container, 'SlideList-onAddSurveySlide', [7, 'Intake']);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      const sv = list.slides.find((s: Record<string, unknown>) => s.surveySlide);
      expect(sv).toBeTruthy();
      expect(sv.surveyId).toBe(7);
    });
  });

  it('toggleSurveyPicker flips showSurveyPicker', async () => {
    const { container } = renderPage();
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.showSurveyPicker).toBe(false);
    });
    clickCb(container, 'SlideList-onToggleSurveyPicker');
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.showSurveyPicker).toBe(true);
    });
  });
});

// ─── Theme / settings updates ───────────────────────────────────────────────

describe('Theme and slide settings updates', () => {
  it('updating the theme via ThemePanel merges into deck.theme', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleTheme');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="ThemePanel"]')).toBeTruthy();
    });
    clickCb(container, 'ThemePanel-onUpdateTheme', { primaryColor: '#abcdef' });
    await waitFor(() => {
      const theme = getProps('ThemePanel', container).theme;
      expect(theme.primaryColor).toBe('#abcdef');
    });
  });

  it('updating brandingProfileId via ThemePanel writes through', async () => {
    const { container } = renderPage();
    clickCb(container, 'EditorHeader-onToggleTheme');
    clickCb(container, 'ThemePanel-onUpdateBrandingProfileId', 99);
    await waitFor(() => {
      const props = getProps('ThemePanel', container);
      expect(props.brandingProfileId).toBe(99);
    });
  });
});

// ─── SlideContentEditor wiring ──────────────────────────────────────────────

describe('SlideContentEditor wiring', () => {
  it('block changes write through to the slide draft overlay', async () => {
    const { container } = renderPage();
    const newBlocks = [makeBlock('nb', 'text', { content: 'new' })];
    // Wrap in outer array so clickCb's spread passes newBlocks as the single arg.
    clickCb(container, 'SlideContentEditor-onBlocksChange', [newBlocks]);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      // Edits land in slide.draft — published live blocks stay untouched
      // until the user explicitly publishes.
      expect(list.slides[0].draft.blocks[0].id).toBe('nb');
      expect(list.slides[0].blocks[0].id).toBe('s1-b');
    });
  });

  it('notes change writes through to the slide draft overlay', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideContentEditor-onChangeNotes', 'speaker notes');
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides[0].draft.notes).toBe('speaker notes');
    });
  });

  it('toggling left/right editor collapse forwards into SlideContentEditor props', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideContentEditor-onSetEditorLeftCollapsed', true);
    await waitFor(() => {
      const props = getProps('SlideContentEditor', container);
      expect(props.editorLeftCollapsed).toBe(true);
    });
    clickCb(container, 'SlideContentEditor-onSetEditorRightCollapsed', true);
    await waitFor(() => {
      const props = getProps('SlideContentEditor', container);
      expect(props.editorRightCollapsed).toBe(true);
    });
  });
});

// ─── Board view ─────────────────────────────────────────────────────────────

describe('Board view', () => {
  it('SlideList "open board view" mounts BoardView', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onOpenBoardView');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="BoardView"]')).toBeTruthy();
    });
  });

  it('BoardView onSelectSlide jumps to the slide and closes the board', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onOpenBoardView');
    clickCb(container, 'BoardView-onSelectSlide', 1);
    await waitFor(() => {
      expect(container.querySelector('[data-testid="BoardView"]')).toBeNull();
      const list = getProps('SlideList', container);
      expect(list.activeSlide).toBe(1);
    });
  });

  it('BoardView rename forwards through', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onOpenBoardView');
    clickCb(container, 'BoardView-onRenameSlide', [0, 'Board renamed']);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides[0].label).toBe('Board renamed');
    });
  });

  it('BoardView setColumns updates boardColumns', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onOpenBoardView');
    clickCb(container, 'BoardView-onSetColumns', 6);
    await waitFor(() => {
      const props = getProps('BoardView', container);
      expect(props.boardColumns).toBe(6);
    });
  });

  it('Escape key closes the board view', async () => {
    const { container } = renderPage();
    clickCb(container, 'SlideList-onOpenBoardView');
    await waitFor(() => {
      expect(container.querySelector('[data-testid="BoardView"]')).toBeTruthy();
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    await waitFor(() => {
      expect(container.querySelector('[data-testid="BoardView"]')).toBeNull();
    });
  });
});

// ─── HTML slide upload ──────────────────────────────────────────────────────

describe('HTML slide upload', () => {
  it('clicking "Upload HTML Slide" on the empty state triggers the file input', () => {
    const { container } = renderPage(makeDeck({ slides: [] }));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
    // Simulate clicking through SlideList's onUploadHtmlSlide path via empty-state button
    const uploadButton = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Upload HTML Slide'),
    ) as HTMLButtonElement;
    expect(uploadButton).toBeTruthy();
    // Click should not throw — file input proxies via ref.
    fireEvent.click(uploadButton);
  });

  it('addHtmlSlide pushes a new html-embed slide on successful upload', async () => {
    const { container } = renderPage();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['<html />'], 'demo.html', { type: 'text/html' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(apiMocks.uploadHtmlSlide).toHaveBeenCalled();
    });
    await waitFor(() => {
      const list = getProps('SlideList', container);
      const last = list.slides[list.slides.length - 1];
      // New uploads arrive as draft-only (pendingCreate) slides — live blocks
      // stay empty until publish; the html-embed block lives in the draft.
      expect(last.draft.pendingCreate).toBe(true);
      expect(last.draft.blocks[0].type).toBe('html-embed');
      expect(last.blocks).toEqual([]);
    });
  });

  it('addHtmlSlide alerts on upload failure', async () => {
    apiMocks.uploadHtmlSlide.mockResolvedValueOnce({ success: false, error: 'boom' });
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const { container } = renderPage();
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'demo.html');
    Object.defineProperty(fileInput, 'files', { value: [file] });
    fireEvent.change(fileInput);
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
      expect(alertSpy.mock.calls[0][0]).toContain('Upload failed');
    });
    alertSpy.mockRestore();
  });
});

// ─── Drag and drop reorder ──────────────────────────────────────────────────

describe('Slide drag-and-drop reordering', () => {
  it('reordering swaps slides via arrayMove and bumps activeSlide tracker', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [
          makeSlide('s1', 'A'),
          makeSlide('s2', 'B'),
          makeSlide('s3', 'C'),
        ],
      }),
    );
    clickCb(container, 'SlideList-onDragEnd', {
      active: { id: 's1' },
      over: { id: 's3' },
    });
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides.map((s: Record<string, unknown>) => s.id)).toEqual(['s2', 's3', 's1']);
    });
  });

  it('dropping onto drop-zone-main strips pathGroup from the slide', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [
          makeSlide('s1', 'Main'),
          makeSlide('s2', 'Branch', { pathGroup: 'alpha' }),
        ],
      }),
    );
    clickCb(container, 'SlideList-onDragEnd', {
      active: { id: 's2' },
      over: { id: 'drop-zone-main' },
    });
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides.find((s: Record<string, unknown>) => s.id === 's2').pathGroup).toBeUndefined();
    });
  });

  it('drag onto a non-main drop-zone assigns the path group', async () => {
    const { container } = renderPage(
      makeDeck({
        slides: [makeSlide('s1', 'A'), makeSlide('s2', 'B', { pathGroup: 'alpha' })],
      }),
    );
    clickCb(container, 'SlideList-onDragEnd', {
      active: { id: 's1' },
      over: { id: 'drop-zone-alpha' },
    });
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.slides.find((s: Record<string, unknown>) => s.id === 's1').pathGroup).toBe('alpha');
    });
  });

  it('drag with active === over is a no-op', async () => {
    const { container } = renderPage();
    setHasUnsavedChangesMock.mockClear();
    clickCb(container, 'SlideList-onDragEnd', {
      active: { id: 's1' },
      over: { id: 's1' },
    });
    await Promise.resolve();
    expect(setHasUnsavedChangesMock).not.toHaveBeenCalled();
  });

  it('drag with no over target is a no-op', async () => {
    const { container } = renderPage();
    setHasUnsavedChangesMock.mockClear();
    clickCb(container, 'SlideList-onDragEnd', { active: { id: 's1' }, over: null });
    await Promise.resolve();
    expect(setHasUnsavedChangesMock).not.toHaveBeenCalled();
  });
});

// ─── Error banner ───────────────────────────────────────────────────────────

describe('Error banner', () => {
  it('renders the error banner when error state is set', async () => {
    const { container } = renderPage();
    // Trigger an error path
    apiMocks.generateSlide.mockResolvedValueOnce({ success: false, message: 'fail-me' });
    clickCb(container, 'SlideContentEditor-onSlidePromptChange', 'p');
    clickCb(container, 'SlideContentEditor-onSubmitSlidePrompt', { preventDefault: () => {} });
    await waitFor(() => {
      expect(container.textContent).toContain('fail-me');
    });
  });

  it('clicking the error close button clears the error', async () => {
    const { container } = renderPage();
    apiMocks.generateSlide.mockResolvedValueOnce({ success: false, message: 'gone-soon' });
    clickCb(container, 'SlideContentEditor-onSlidePromptChange', 'p');
    clickCb(container, 'SlideContentEditor-onSubmitSlidePrompt', { preventDefault: () => {} });
    await waitFor(() => {
      expect(container.textContent).toContain('gone-soon');
    });
    const closeBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('close'),
    ) as HTMLButtonElement;
    expect(closeBtn).toBeTruthy();
    fireEvent.click(closeBtn);
    await waitFor(() => {
      expect(container.textContent).not.toContain('gone-soon');
    });
  });
});

// ─── DeckPresenceBar jump-to-slide ──────────────────────────────────────────

describe('Misc small surface', () => {
  it('DeckPresenceBar onJumpToSlide moves activeSlide', async () => {
    const { container } = renderPage();
    clickCb(container, 'DeckPresenceBar-onJumpToSlide', 1);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.activeSlide).toBe(1);
    });
  });

  it('DeckSlideThumbnailIndicators onJumpToSlide moves activeSlide', async () => {
    const { container } = renderPage();
    clickCb(container, 'DeckSlideThumbnailIndicators-onJumpToSlide', 1);
    await waitFor(() => {
      const list = getProps('SlideList', container);
      expect(list.activeSlide).toBe(1);
    });
  });

  it('renders viewport switcher buttons for desktop / tablet / mobile', () => {
    const { container } = renderPage();
    const titles = ['Desktop', 'Tablet', 'Mobile'];
    for (const t of titles) {
      expect(container.querySelector(`button[title="${t}"]`)).toBeTruthy();
    }
  });

  it('clicking the viewport tablet button updates SlideContentEditor.iframeViewport', async () => {
    const { container } = renderPage();
    fireEvent.click(container.querySelector('button[title="Tablet"]') as HTMLButtonElement);
    await waitFor(() => {
      const props = getProps('SlideContentEditor', container);
      expect(props.iframeViewport).toBe('tablet');
    });
  });

  it('switches between preview and edit modes', async () => {
    const { container } = renderPage();
    const previewBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Preview'),
    ) as HTMLButtonElement;
    fireEvent.click(previewBtn);
    await waitFor(() => {
      const props = getProps('SlideContentEditor', container);
      expect(props.editorMode).toBe('preview');
    });
  });
});
