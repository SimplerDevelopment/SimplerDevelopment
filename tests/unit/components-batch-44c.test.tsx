// @vitest-environment jsdom
/**
 * Unit tests for 4 React contexts/providers (batch 44c):
 *
 *   - contexts/BlobColorContext.tsx
 *   - contexts/DesignTokensContext.tsx
 *   - app/portal/email/campaigns/[id]/_components/EmailCollaborationProvider.tsx
 *   - app/portal/tools/pitch-decks/[id]/_components/DeckCollaborationProvider.tsx
 *
 * Each suite exercises:
 *   • provider mounts and renders children
 *   • consumer hook reads default / provided values
 *   • mutation API (setColor, addColor, etc) updates state
 *   • outside-provider fallback (for the providers that ship one)
 *
 * The realtime-aware providers (Email/Deck) mock `@/lib/realtime/client`
 * and `next-auth/react` so no socket is opened.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';

// ─── Mocks (must come before imports under test) ───────────────────────────

const setPresenceMock = vi.fn();
const setCursorMock = vi.fn();
const setSelectionMock = vi.fn();
const setFocusedFieldMock = vi.fn();
const setActiveSlideMock = vi.fn();

// Track args for useRealtimeDoc + useLocalAwareness so tests can assert the
// provider passes the right entityType / entityId.
const realtimeDocCalls: Array<{
  entityType: string;
  entityId: string;
  enabled?: boolean;
}> = [];

const fakeAwareness = { clientID: 42, __fake: true } as unknown as object;

const realtimeResult = {
  ydoc: null,
  awareness: fakeAwareness,
  status: 'connected' as const,
  peers: [
    {
      clientId: 1,
      user: { id: 'peer-1', name: 'Peer', color: '#ff0000', avatar: null },
    },
  ],
};

vi.mock('@/lib/realtime/client', () => ({
  __esModule: true,
  useRealtimeDoc: (opts: { entityType: string; entityId: string; enabled?: boolean }) => {
    realtimeDocCalls.push(opts);
    return realtimeResult;
  },
  useLocalAwareness: (_awareness: unknown) => ({
    setPresence: setPresenceMock,
    setCursor: setCursorMock,
    setSelection: setSelectionMock,
    setFocusedField: setFocusedFieldMock,
    setActiveSlide: setActiveSlideMock,
  }),
}));

// next-auth/react — drive useSession from a mutable holder so tests can flip
// the session shape per-test without resetting modules.
const sessionHolder: {
  data:
    | {
        user?: {
          id?: string;
          name?: string | null;
          email?: string | null;
          image?: string | null;
        };
      }
    | null;
} = { data: null };

vi.mock('next-auth/react', () => ({
  __esModule: true,
  useSession: () => sessionHolder,
}));

// ─── Imports under test (after mocks) ─────────────────────────────────────

import {
  BlobColorProvider,
  useBlobColor,
} from '@/contexts/BlobColorContext';
import {
  DesignTokensProvider,
  useDesignTokens,
} from '@/contexts/DesignTokensContext';
import {
  EmailCollaborationProvider,
  useEmailPresence,
} from '@/app/portal/email/campaigns/[id]/_components/EmailCollaborationProvider';
import {
  DeckCollaborationProvider,
  useDeckCollab,
} from '@/app/portal/tools/pitch-decks/[id]/_components/DeckCollaborationProvider';

// ───────────────────────────────────────────────────────────────────────────
// BlobColorContext
// ───────────────────────────────────────────────────────────────────────────
describe('BlobColorContext', () => {
  it('provides the default color (#3b82f6) to consumers', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BlobColorProvider>{children}</BlobColorProvider>
    );
    const { result } = renderHook(() => useBlobColor(), { wrapper });
    expect(result.current.color).toBe('#3b82f6');
    expect(typeof result.current.setColor).toBe('function');
  });

  it('updates color via setColor', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BlobColorProvider>{children}</BlobColorProvider>
    );
    const { result } = renderHook(() => useBlobColor(), { wrapper });
    act(() => {
      result.current.setColor('#ff00aa');
    });
    expect(result.current.color).toBe('#ff00aa');
  });

  it('throws when used outside the provider', () => {
    // Silence React's error logging for this expected throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useBlobColor())).toThrow(
      /useBlobColor must be used within a BlobColorProvider/,
    );
    spy.mockRestore();
  });

  it('renders provider children', () => {
    const { getByText } = render(
      <BlobColorProvider>
        <span>blob-child</span>
      </BlobColorProvider>,
    );
    expect(getByText('blob-child')).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DesignTokensContext
// ───────────────────────────────────────────────────────────────────────────
describe('DesignTokensContext', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns sensible defaults when used outside a provider', () => {
    const { result } = renderHook(() => useDesignTokens());
    expect(result.current.tokens.colors.length).toBeGreaterThan(0);
    expect(result.current.tokens.fonts.length).toBeGreaterThan(0);
    // The no-op shims are still functions.
    expect(typeof result.current.updateTokens).toBe('function');
    expect(typeof result.current.addColor).toBe('function');
  });

  it('inside provider, exposes the default token set', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DesignTokensProvider>{children}</DesignTokensProvider>
    );
    const { result } = renderHook(() => useDesignTokens(), { wrapper });
    expect(result.current.tokens.colors.find((c) => c.name === 'White')).toBeTruthy();
    expect(result.current.tokens.radii.find((r) => r.name === 'Full')?.value).toBe(
      '9999px',
    );
  });

  it('addColor appends a color and persists to localStorage', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DesignTokensProvider>{children}</DesignTokensProvider>
    );
    const { result } = renderHook(() => useDesignTokens(), { wrapper });
    const before = result.current.tokens.colors.length;
    act(() => {
      result.current.addColor({ name: 'Brand', value: '#abcdef' });
    });
    expect(result.current.tokens.colors).toHaveLength(before + 1);
    expect(result.current.tokens.colors.at(-1)).toEqual({
      name: 'Brand',
      value: '#abcdef',
    });

    const stored = JSON.parse(localStorage.getItem('sd-design-tokens') || '{}');
    expect(stored.colors.at(-1)).toEqual({ name: 'Brand', value: '#abcdef' });
  });

  it('updateColor replaces the color at the given index', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DesignTokensProvider>{children}</DesignTokensProvider>
    );
    const { result } = renderHook(() => useDesignTokens(), { wrapper });
    act(() => {
      result.current.updateColor(0, { name: 'NewWhite', value: '#fefefe' });
    });
    expect(result.current.tokens.colors[0]).toEqual({
      name: 'NewWhite',
      value: '#fefefe',
    });
  });

  it('removeColor drops the color at the given index', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DesignTokensProvider>{children}</DesignTokensProvider>
    );
    const { result } = renderHook(() => useDesignTokens(), { wrapper });
    const originalFirst = result.current.tokens.colors[0];
    act(() => {
      result.current.removeColor(0);
    });
    expect(result.current.tokens.colors[0]).not.toEqual(originalFirst);
  });

  it('updateTokens replaces the entire token set', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DesignTokensProvider>{children}</DesignTokensProvider>
    );
    const { result } = renderHook(() => useDesignTokens(), { wrapper });
    act(() => {
      result.current.updateTokens({
        colors: [{ name: 'Only', value: '#000' }],
        fonts: [],
        spacing: [],
        radii: [],
      });
    });
    expect(result.current.tokens.colors).toEqual([
      { name: 'Only', value: '#000' },
    ]);
    expect(result.current.tokens.fonts).toEqual([]);
  });

  it('resetToDefaults restores the default token set', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DesignTokensProvider>{children}</DesignTokensProvider>
    );
    const { result } = renderHook(() => useDesignTokens(), { wrapper });
    act(() => {
      result.current.addColor({ name: 'X', value: '#123456' });
    });
    const grew = result.current.tokens.colors.length;
    act(() => {
      result.current.resetToDefaults();
    });
    expect(result.current.tokens.colors.length).toBeLessThan(grew);
    expect(result.current.tokens.colors.find((c) => c.name === 'White')).toBeTruthy();
  });

  it('hydrates from localStorage on mount when a stored value exists', () => {
    localStorage.setItem(
      'sd-design-tokens',
      JSON.stringify({
        colors: [{ name: 'Stored', value: '#111111' }],
        fonts: [{ name: 'StoredFont', value: 'serif' }],
        spacing: [],
        radii: [],
      }),
    );
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DesignTokensProvider>{children}</DesignTokensProvider>
    );
    const { result } = renderHook(() => useDesignTokens(), { wrapper });
    expect(result.current.tokens.colors).toEqual([
      { name: 'Stored', value: '#111111' },
    ]);
  });

  it('silently survives malformed localStorage payloads', () => {
    localStorage.setItem('sd-design-tokens', '{not json');
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DesignTokensProvider>{children}</DesignTokensProvider>
    );
    const { result } = renderHook(() => useDesignTokens(), { wrapper });
    // Falls back to defaults — the white color is still there.
    expect(result.current.tokens.colors.find((c) => c.name === 'White')).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// EmailCollaborationProvider
// ───────────────────────────────────────────────────────────────────────────
describe('EmailCollaborationProvider', () => {
  beforeEach(() => {
    realtimeDocCalls.length = 0;
    setPresenceMock.mockClear();
    setCursorMock.mockClear();
    setSelectionMock.mockClear();
    setFocusedFieldMock.mockClear();
    sessionHolder.data = null;
  });

  it('useEmailPresence returns a no-op shim outside a provider', () => {
    const { result } = renderHook(() => useEmailPresence());
    expect(result.current.status).toBe('disconnected');
    expect(result.current.peers).toEqual([]);
    expect(result.current.ydoc).toBeNull();
    expect(result.current.localUser).toBeNull();
    expect(() => result.current.setFocusedField(null)).not.toThrow();
    expect(() => result.current.setCursor(null)).not.toThrow();
    expect(() => result.current.setSelection(null)).not.toThrow();
  });

  it('opens a realtime doc for the given email entityId', () => {
    sessionHolder.data = {
      user: { id: 'u-1', name: 'Casey', email: 'c@example.com' },
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EmailCollaborationProvider entityId="campaign-99">
        {children}
      </EmailCollaborationProvider>
    );
    renderHook(() => useEmailPresence(), { wrapper });
    expect(realtimeDocCalls.at(-1)).toEqual({
      entityType: 'email',
      entityId: 'campaign-99',
      enabled: true,
    });
  });

  it('forwards `enabled: false` to useRealtimeDoc', () => {
    sessionHolder.data = { user: { id: 'u-1', name: 'Casey' } };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EmailCollaborationProvider entityId="c-1" enabled={false}>
        {children}
      </EmailCollaborationProvider>
    );
    renderHook(() => useEmailPresence(), { wrapper });
    expect(realtimeDocCalls.at(-1)?.enabled).toBe(false);
  });

  it('publishes the local user identity onto awareness once session is known', () => {
    sessionHolder.data = {
      user: {
        id: 'u-7',
        name: 'Riley',
        email: 'riley@example.com',
        image: 'https://img/r.png',
      },
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EmailCollaborationProvider entityId="c-x">{children}</EmailCollaborationProvider>
    );
    const { result } = renderHook(() => useEmailPresence(), { wrapper });
    expect(setPresenceMock).toHaveBeenCalled();
    const presenceArg = setPresenceMock.mock.calls.at(-1)?.[0];
    expect(presenceArg.user.id).toBe('u-7');
    expect(presenceArg.user.name).toBe('Riley');
    expect(presenceArg.user.avatar).toBe('https://img/r.png');
    expect(typeof presenceArg.user.color).toBe('string');

    // Context surface
    expect(result.current.localUser?.id).toBe('u-7');
    expect(result.current.peers).toHaveLength(1);
    expect(result.current.status).toBe('connected');
  });

  it('does not publish when session lacks a user.id', () => {
    sessionHolder.data = { user: { name: 'Anon', email: undefined } };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EmailCollaborationProvider entityId="c-x">{children}</EmailCollaborationProvider>
    );
    const { result } = renderHook(() => useEmailPresence(), { wrapper });
    expect(result.current.localUser).toBeNull();
    expect(setPresenceMock).not.toHaveBeenCalled();
  });

  it('exposes awareness setters from context', () => {
    sessionHolder.data = { user: { id: 'u-1', name: 'Casey' } };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <EmailCollaborationProvider entityId="c-x">{children}</EmailCollaborationProvider>
    );
    const { result } = renderHook(() => useEmailPresence(), { wrapper });
    result.current.setFocusedField('blocks.0.title');
    result.current.setCursor({ x: 1, y: 2 });
    result.current.setSelection({ blockId: 'b-1' });
    expect(setFocusedFieldMock).toHaveBeenCalledWith('blocks.0.title');
    expect(setCursorMock).toHaveBeenCalledWith({ x: 1, y: 2 });
    expect(setSelectionMock).toHaveBeenCalledWith({ blockId: 'b-1' });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// DeckCollaborationProvider
// ───────────────────────────────────────────────────────────────────────────
describe('DeckCollaborationProvider', () => {
  beforeEach(() => {
    realtimeDocCalls.length = 0;
    setPresenceMock.mockClear();
    setCursorMock.mockClear();
    setSelectionMock.mockClear();
    setFocusedFieldMock.mockClear();
    setActiveSlideMock.mockClear();
    sessionHolder.data = null;
  });

  it('useDeckCollab returns a stable no-op shape outside a provider', () => {
    const { result } = renderHook(() => useDeckCollab());
    expect(result.current.status).toBe('disconnected');
    expect(result.current.peers).toEqual([]);
    expect(result.current.localUser).toBeNull();
    expect(result.current.enabled).toBe(false);
    expect(() => result.current.awareness.setCursor(null)).not.toThrow();
    expect(() => result.current.awareness.setSelection(null)).not.toThrow();
    expect(() => result.current.awareness.setActiveSlide(0)).not.toThrow();
    expect(() => result.current.awareness.setFocusedField(null)).not.toThrow();
    expect(() => result.current.awareness.setPresence({})).not.toThrow();
  });

  it('opens a realtime doc for the given deckId', () => {
    sessionHolder.data = { user: { email: 'a@b.co', name: 'A' } };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DeckCollaborationProvider deckId="deck-77">{children}</DeckCollaborationProvider>
    );
    renderHook(() => useDeckCollab(), { wrapper });
    expect(realtimeDocCalls.at(-1)).toEqual({
      entityType: 'deck',
      entityId: 'deck-77',
      enabled: true,
    });
  });

  it('honors enabled=false', () => {
    sessionHolder.data = { user: { email: 'a@b.co', name: 'A' } };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DeckCollaborationProvider deckId="d-x" enabled={false}>
        {children}
      </DeckCollaborationProvider>
    );
    const { result } = renderHook(() => useDeckCollab(), { wrapper });
    expect(realtimeDocCalls.at(-1)?.enabled).toBe(false);
    // The context-level `enabled` flag is true only when both the prop is
    // true AND realtime says we're connected. With prop=false it must be false.
    expect(result.current.enabled).toBe(false);
  });

  it('publishes the local user once per awareness instance', () => {
    sessionHolder.data = {
      user: { email: 'pat@example.com', name: 'Pat' },
    };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DeckCollaborationProvider deckId="d-1">{children}</DeckCollaborationProvider>
    );
    const { result, rerender } = renderHook(() => useDeckCollab(), { wrapper });

    expect(setPresenceMock).toHaveBeenCalledTimes(1);
    const arg = setPresenceMock.mock.calls[0][0];
    expect(arg.user.id).toBe('pat@example.com');
    expect(arg.user.name).toBe('Pat');
    expect(arg.user.color).toMatch(/^hsl\(\d+, 70%, 50%\)$/);

    // Re-rendering with the same awareness must not re-publish.
    rerender();
    expect(setPresenceMock).toHaveBeenCalledTimes(1);

    // Context flag is true once realtime is 'connected' AND prop enabled.
    expect(result.current.enabled).toBe(true);
    expect(result.current.localUser?.id).toBe('pat@example.com');
  });

  it('falls back to name → "anon" when no email is present', () => {
    sessionHolder.data = { user: { name: 'JustName' } };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DeckCollaborationProvider deckId="d-2">{children}</DeckCollaborationProvider>
    );
    const { result } = renderHook(() => useDeckCollab(), { wrapper });
    expect(result.current.localUser?.id).toBe('JustName');
    expect(result.current.localUser?.name).toBe('JustName');
  });

  it('skips publishing when session has no usable identity', () => {
    sessionHolder.data = { user: {} };
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <DeckCollaborationProvider deckId="d-3">{children}</DeckCollaborationProvider>
    );
    const { result } = renderHook(() => useDeckCollab(), { wrapper });
    expect(setPresenceMock).not.toHaveBeenCalled();
    expect(result.current.localUser).toBeNull();
  });

  it('renders children unchanged', () => {
    sessionHolder.data = { user: { email: 'a@b.co', name: 'A' } };
    const { getByText } = render(
      <DeckCollaborationProvider deckId="d-render">
        <span>deck-child</span>
      </DeckCollaborationProvider>,
    );
    expect(getByText('deck-child')).toBeTruthy();
  });
});
