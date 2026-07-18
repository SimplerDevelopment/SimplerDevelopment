/** Top-level state for the pitch-deck editor — deck loading, save flag, AI/version/UI toggles.
 *
 * When a Yjs `ydoc` is supplied via `opts.ydoc`, the slides array is bound
 * bidirectionally to that doc:
 *  - Local edits to `deck.slides` are mirrored into Y via `bindDeckToYjs`.
 *  - Remote edits flow back into local React state.
 *  - Auto-save / unsaved-flag is suppressed while collab is connected — the
 *    server-side snapshot persister owns durable saves. Manual `saveDeck()`
 *    callers in the page still work; with collab they no-op slides (theme/etc.
 *    still patches via the existing REST path).
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type * as Y from 'yjs';
import type { PitchDeckSlideV2 } from '@/lib/db/schema';
import { loadDeck, type DeckPayload } from '../_lib/api';
import { normalizeDeckBlockIds } from '../_lib/helpers';
import { bindDeckToYjs, type DeckBinding } from '@/lib/realtime/deck-binding';

export interface PitchDeckState {
  deck: DeckPayload | null;
  setDeck: React.Dispatch<React.SetStateAction<DeckPayload | null>>;
  loading: boolean;
  error: string;
  setError: (s: string) => void;
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (v: boolean) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  publishing: boolean;
  setPublishing: (v: boolean) => void;
  refetch: () => Promise<void>;
}

export interface UsePitchDeckStateOptions {
  /**
   * When supplied, slides are bound bidirectionally to this Y.Doc. Pass
   * `null` (or omit) to use the legacy non-collaborative state path.
   */
  ydoc?: Y.Doc | null;
  /**
   * True only when the realtime WebSocket is actually connected and the
   * server-side snapshot persister is actively managing durable saves.
   * Used to decide whether to suppress the manual dirty flag.
   *
   * NOTE: do NOT derive this from `ydoc !== null` — the Y.Doc is
   * instantiated immediately in the RealtimeClient constructor, so it is
   * non-null even before the socket connects. The caller must pass the
   * explicit connection status from `collab.enabled`.
   */
  collabEnabled?: boolean;
}

/** Loads the deck on mount, exposes save/error state, and a refetch helper. */
export function usePitchDeckState(
  id: string,
  opts: UsePitchDeckStateOptions = {}
): PitchDeckState {
  const ydoc = opts.ydoc ?? null;
  // collabActive: true only when the WS is actually connected and the server-
  // side persister is durably saving slides. Y.Doc is always non-null (created
  // in the RealtimeClient constructor before the socket connects), so we must
  // NOT derive this from `ydoc !== null` — instead we rely on the explicit
  // connection flag passed by the caller.
  const collabActive = opts.collabEnabled === true;

  const [deck, setDeckRaw] = useState<DeckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChangesRaw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // The active deck-binding (if collab is on). Null otherwise.
  const bindingRef = useRef<DeckBinding | null>(null);
  // Track which deck id the current binding belongs to so we rebind when the
  // doc/deck flips. DeckPayload.id is a number.
  const boundDeckIdRef = useRef<number | null>(null);

  const refetch = useCallback(async () => {
    try {
      const result = await loadDeck(id);
      if (result.ok) setDeckRaw(normalizeDeckBlockIds(result.data));
      else setError(result.message);
    } catch {
      setError('Failed to connect to server. Please refresh the page.');
    }
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-fetch pattern; setDeck/setError run after the network call resolves
  useEffect(() => { refetch(); }, [refetch]);

  // Bind once we have both a deck *and* a ydoc.
  useEffect(() => {
    if (!ydoc || !deck) return;
    // Already bound for this combination?
    if (bindingRef.current && boundDeckIdRef.current === deck.id) return;

    // Tear down any previous binding (e.g. doc rotated mid-session).
    if (bindingRef.current) {
      bindingRef.current.unbind();
      bindingRef.current = null;
    }

    bindingRef.current = bindDeckToYjs({
      ydoc,
      initialSlides: deck.slides as PitchDeckSlideV2[],
      onRemoteSlides: (remoteSlides) => {
        setDeckRaw((prev) => {
          if (!prev) return prev;
          if (prev.slides === remoteSlides) return prev;
          return { ...prev, slides: remoteSlides };
        });
      },
    });
    boundDeckIdRef.current = deck.id;

    return () => {
      bindingRef.current?.unbind();
      bindingRef.current = null;
      boundDeckIdRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately re-run only when ydoc swaps or the deck identity changes.
  }, [ydoc, deck?.id]);

  // Wrapped setDeck — if collab is active, route slide updates through the
  // Y binding so peers see them. Theme/title/etc. go through plain state.
  const setDeck: React.Dispatch<React.SetStateAction<DeckPayload | null>> =
    useCallback(
      (update) => {
        setDeckRaw((prev) => {
          const next =
            typeof update === 'function'
              ? (update as (p: DeckPayload | null) => DeckPayload | null)(prev)
              : update;

          if (!next || !prev) return next;

          const slidesChanged = next.slides !== prev.slides;
          if (slidesChanged && bindingRef.current) {
            bindingRef.current.applyLocalSlides(
              next.slides as PitchDeckSlideV2[]
            );
          }
          return next;
        });
      },
      []
    );

  // Wrapped unsaved-flag setter — suppressed while collab is active so the
  // header doesn't perpetually show "unsaved changes" (the server persister
  // is durably saving in the background).
  const setHasUnsavedChanges = useCallback(
    (v: boolean) => {
      if (collabActive && v) return;
      setHasUnsavedChangesRaw(v);
    },
    [collabActive]
  );

  return {
    deck,
    setDeck,
    loading,
    error,
    setError,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    saving,
    setSaving,
    publishing,
    setPublishing,
    refetch,
  };
}
