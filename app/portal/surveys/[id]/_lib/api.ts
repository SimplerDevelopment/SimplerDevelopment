/**
 * Portal Survey detail page — API helpers.
 *
 * Thin wrappers around the existing /api/portal/surveys/[id] endpoints.
 * Pulled out of page.tsx during refactor so the page stays presentational.
 */

import type { SurveyField } from '@/components/admin/SurveyBuilder';
import type { SurveyRecommendationConfig } from '@/lib/db/schema';

export interface Survey {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  fields: SurveyField[];
  status: string;
  color: string;
  brandingProfileId?: number | null;
  styling?: Record<string, string | boolean | undefined> | null;
  thankYouTitle: string;
  thankYouMessage: string;
  redirectUrl: string | null;
  requireEmail: boolean;
  allowMultiple: boolean;
  notifyOnResponse: boolean;
  notifyDigest: string;
  closesAt: string | null;
  maxResponses: number | null;
  linkedType: string | null;
  linkedId: number | null;
  recommendation: SurveyRecommendationConfig | null;
  responseCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SurveyResponse {
  id: number;
  formName: string;
  answers: Record<string, unknown>;
  respondentEmail: string | null;
  respondentName: string | null;
  source: string;
  completedAt: string | null;
  createdAt: string;
}

export interface SurveyResponseStats {
  total: number;
  completed: number;
  withEmail: number;
}

export interface BrandingProfile {
  id: number;
  name: string;
  isDefault: boolean;
  primaryColor: string | null;
  logoUrl: string | null;
}

export async function fetchSurvey(id: string | number): Promise<Survey | null> {
  const res = await fetch(`/api/portal/surveys/${id}`);
  const data = await res.json();
  return data.success ? (data.data as Survey) : null;
}

export async function fetchSurveyResponses(
  id: string | number,
): Promise<{ responses: SurveyResponse[]; stats: SurveyResponseStats } | null> {
  const res = await fetch(`/api/portal/surveys/${id}/responses`);
  const data = await res.json();
  if (!data.success) return null;
  return {
    responses: data.data.responses as SurveyResponse[],
    stats: data.data.stats as SurveyResponseStats,
  };
}

export async function updateSurvey(
  id: string | number,
  updates: Record<string, unknown>,
): Promise<{ success: true; data: Survey } | { success: false; message: string }> {
  const res = await fetch(`/api/portal/surveys/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!data.success) return { success: false, message: data.message || 'Failed to save' };
  return { success: true, data: data.data as Survey };
}

export async function deleteSurvey(id: string | number): Promise<{ success: boolean; message?: string }> {
  const res = await fetch(`/api/portal/surveys/${id}`, { method: 'DELETE' });
  const data = await res.json();
  return data.success ? { success: true } : { success: false, message: data.message };
}

export async function fetchBrandingProfiles(): Promise<BrandingProfile[]> {
  try {
    const res = await fetch('/api/portal/branding/profiles');
    const data = await res.json();
    return data.success ? (data.data as BrandingProfile[]) : [];
  } catch {
    return [];
  }
}
