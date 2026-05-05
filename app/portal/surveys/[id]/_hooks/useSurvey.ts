'use client';

/**
 * useSurvey — fetch + mutation hook for the survey detail page.
 *
 * Encapsulates the load/save lifecycle that used to live inline in page.tsx.
 * Behavior is preserved 1:1 (success-flash for 2s, error retained until
 * dismissed, branding-profiles loaded once on mount).
 */

import { useCallback, useEffect, useState } from 'react';
import {
  type BrandingProfile,
  type Survey,
  type SurveyResponse,
  type SurveyResponseStats,
  deleteSurvey as deleteSurveyApi,
  fetchBrandingProfiles,
  fetchSurvey,
  fetchSurveyResponses,
  updateSurvey,
} from '../_lib/api';

export interface UseSurveyResult {
  survey: Survey | null;
  responses: SurveyResponse[];
  stats: SurveyResponseStats;
  brandingProfiles: BrandingProfile[];
  loading: boolean;
  saving: boolean;
  error: string;
  setError: (msg: string) => void;
  successMsg: string;
  refresh: () => Promise<void>;
  refreshResponses: () => Promise<void>;
  save: (updates: Record<string, unknown>) => Promise<boolean>;
  remove: () => Promise<{ success: boolean; message?: string }>;
}

export function useSurvey(id: string | number): UseSurveyResult {
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [stats, setStats] = useState<SurveyResponseStats>({ total: 0, completed: 0, withEmail: 0 });
  const [brandingProfiles, setBrandingProfiles] = useState<BrandingProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const refresh = useCallback(async () => {
    const data = await fetchSurvey(id);
    if (data) setSurvey(data);
    setLoading(false);
  }, [id]);

  const refreshResponses = useCallback(async () => {
    const data = await fetchSurveyResponses(id);
    if (data) {
      setResponses(data.responses);
      setStats(data.stats);
    }
  }, [id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    fetchBrandingProfiles().then(setBrandingProfiles).catch(() => {});
  }, []);

  const save = useCallback(
    async (updates: Record<string, unknown>) => {
      setSaving(true);
      setError('');
      const result = await updateSurvey(id, updates);
      setSaving(false);
      if (!result.success) {
        setError(result.message || 'Failed to save');
        return false;
      }
      setSurvey(result.data);
      setSuccessMsg('Saved');
      setTimeout(() => setSuccessMsg(''), 2000);
      return true;
    },
    [id],
  );

  const remove = useCallback(async () => {
    const result = await deleteSurveyApi(id);
    if (!result.success) setError(result.message || 'Failed to delete');
    return result;
  }, [id]);

  return {
    survey,
    responses,
    stats,
    brandingProfiles,
    loading,
    saving,
    error,
    setError,
    successMsg,
    refresh,
    refreshResponses,
    save,
    remove,
  };
}
