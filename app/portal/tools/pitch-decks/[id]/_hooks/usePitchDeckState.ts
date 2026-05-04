/** Top-level state for the pitch-deck editor — deck loading, save flag, AI/version/UI toggles. */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { loadDeck, type DeckPayload } from '../_lib/api';
import { normalizeDeckBlockIds } from '../_lib/helpers';

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

/** Loads the deck on mount, exposes save/error state, and a refetch helper. */
export function usePitchDeckState(id: string): PitchDeckState {
  const [deck, setDeck] = useState<DeckPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const refetch = useCallback(async () => {
    try {
      const result = await loadDeck(id);
      if (result.ok) setDeck(normalizeDeckBlockIds(result.data));
      else setError(result.message);
    } catch {
      setError('Failed to connect to server. Please refresh the page.');
    }
    setLoading(false);
  }, [id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- mount-fetch pattern; setDeck/setError run after the network call resolves
  useEffect(() => { refetch(); }, [refetch]);

  return {
    deck, setDeck, loading, error, setError,
    hasUnsavedChanges, setHasUnsavedChanges, saving, setSaving, publishing, setPublishing,
    refetch,
  };
}
