'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useCanvasStore } from '../canvasStore';
import type { ExportedDesignData } from '../types';

interface UseAutoSaveOptions {
  /** Called with the exported canvas payload when an autosave fires. */
  onSave: (data: ExportedDesignData) => Promise<void> | void;
  /** Interval between autosave attempts when dirty. Default 15 s. */
  intervalMs?: number;
  /** Disable the auto-save loop entirely (still exposes forceSave). */
  enabled?: boolean;
}

interface AutoSaveStatus {
  isSaving: boolean;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
  error: string | null;
  forceSave: () => Promise<void>;
}

/**
 * Auto-save hook: when the store reports `isDirty`, debounces a call to the
 * caller's `onSave(payload)` and marks the store clean once the save resolves.
 */
export function useAutoSave({
  onSave,
  intervalMs = 15_000,
  enabled = true,
}: UseAutoSaveOptions): AutoSaveStatus {
  const isDirty = useCanvasStore((s) => s.isDirty);
  const lastSaved = useCanvasStore((s) => s.lastSaved);
  const exportCanvasData = useCanvasStore((s) => s.exportCanvasData);
  const markSaved = useCanvasStore((s) => s.markSaved);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastSavedDataRef = useRef<string>('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const runSave = useCallback(async (): Promise<void> => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      setError(null);
      const data = exportCanvasData();
      const json = JSON.stringify(data);
      if (json === lastSavedDataRef.current) {
        setIsSaving(false);
        return;
      }
      await onSave(data);
      lastSavedDataRef.current = json;
      markSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auto-save failed');
    } finally {
      setIsSaving(false);
    }
  }, [exportCanvasData, isSaving, markSaved, onSave]);

  // Periodic save loop
  useEffect(() => {
    if (!enabled) return;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      if (isDirty) {
        void runSave();
      }
    }, intervalMs);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, intervalMs, isDirty, runSave]);

  // Save on tab hidden
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && isDirty) {
        void runSave();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [enabled, isDirty, runSave]);

  return {
    isSaving,
    lastSaved,
    hasUnsavedChanges: isDirty,
    error,
    forceSave: runSave,
  };
}

export default useAutoSave;
