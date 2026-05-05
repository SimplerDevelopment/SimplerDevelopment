/** Thin fetch wrappers for the pitch-deck editor's `/api/portal/tools/pitch-decks/...` endpoints. */
import type { PitchDeckSlideV2, PitchDeckTheme } from '@/lib/db/schema';
import type { Block } from '@/types/blocks';

export interface DeckPayload {
  id: number;
  title: string;
  slug: string;
  description: string | null;
  status: string;
  slides: PitchDeckSlideV2[];
  theme: PitchDeckTheme;
  sourceUrl: string | null;
  brandingProfileId: number | null;
  updatedAt: string;
}

export interface VersionMeta {
  id: number;
  label: string | null;
  trigger: string;
  slideCount: number;
  createdAt: string;
}

export interface AiHistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

interface ApiEnvelope<T> {
  success: boolean;
  data?: T;
  message?: string;
  aiResponse?: string;
}

/** GET the deck. */
export async function loadDeck(id: string): Promise<{ ok: true; data: DeckPayload } | { ok: false; status: number; message: string }> {
  const res = await fetch(`/api/portal/tools/pitch-decks/${id}`);
  if (!res.ok) return { ok: false, status: res.status, message: `Failed to load deck (${res.status})` };
  const data = (await res.json()) as ApiEnvelope<DeckPayload>;
  if (data.success && data.data) return { ok: true, data: data.data };
  return { ok: false, status: res.status, message: data.message || 'Failed to load deck' };
}

/** PATCH arbitrary deck fields. */
export async function patchDeck(id: string, body: Record<string, unknown>): Promise<ApiEnvelope<DeckPayload>> {
  const res = await fetch(`/api/portal/tools/pitch-decks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as ApiEnvelope<DeckPayload>;
}

/** PATCH slides + theme as a single save. */
export async function saveDeck(id: string, slides: PitchDeckSlideV2[], theme: PitchDeckTheme) {
  return patchDeck(id, { slides, theme });
}

/** DELETE the deck. */
export async function deleteDeck(id: string) {
  return fetch(`/api/portal/tools/pitch-decks/${id}`, { method: 'DELETE' });
}

/** AI: regenerate the entire deck from a prompt. */
export async function regenerateDeck(id: string, prompt: string, websiteUrl?: string | null) {
  const res = await fetch(`/api/portal/tools/pitch-decks/${id}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, websiteUrl }),
  });
  return (await res.json()) as ApiEnvelope<DeckPayload>;
}

/** AI: regenerate a single slide with conversation history. */
export async function generateSlide(id: string, slideIndex: number, prompt: string, history: AiHistoryTurn[]) {
  const res = await fetch(`/api/portal/tools/pitch-decks/${id}/slides/${slideIndex}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, history }),
  });
  return (await res.json()) as ApiEnvelope<DeckPayload>;
}

/** AI: apply a single prompt across multiple selected slides. */
export async function batchEditSlides(id: string, prompt: string, slideIndices: number[]) {
  const res = await fetch(`/api/portal/tools/pitch-decks/${id}/slides/batch-edit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, slideIndices }),
  });
  return (await res.json()) as ApiEnvelope<DeckPayload>;
}

/** Versions: list, save manual checkpoint, restore. */
export async function listVersions(id: string): Promise<ApiEnvelope<VersionMeta[]>> {
  const res = await fetch(`/api/portal/tools/pitch-decks/${id}/versions`);
  return (await res.json()) as ApiEnvelope<VersionMeta[]>;
}

export async function saveVersionCheckpoint(id: string, label: string): Promise<ApiEnvelope<VersionMeta>> {
  const res = await fetch(`/api/portal/tools/pitch-decks/${id}/versions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
  });
  return (await res.json()) as ApiEnvelope<VersionMeta>;
}

export async function restoreVersion(id: string, versionId: number): Promise<ApiEnvelope<DeckPayload>> {
  const res = await fetch(`/api/portal/tools/pitch-decks/${id}/versions/${versionId}/restore`, { method: 'POST' });
  return (await res.json()) as ApiEnvelope<DeckPayload>;
}

/** Branding & surveys & nav helpers used by the editor. */
export async function loadBrandDefaults(profileId: number | null) {
  const qs = profileId ? `?profileId=${profileId}` : '';
  const res = await fetch(`/api/portal/branding/defaults${qs}`);
  return res.json() as Promise<ApiEnvelope<unknown>>;
}

export async function loadBrandingProfile(profileId: number) {
  const res = await fetch(`/api/portal/branding/profiles/${profileId}`);
  return res.json() as Promise<ApiEnvelope<{
    primaryColor?: string;
    accentColor?: string;
    backgroundColor?: string;
    textColor?: string;
    headingFont?: string;
    bodyFont?: string;
  }>>;
}

export async function loadNavServices() {
  const res = await fetch('/api/portal/services/nav');
  if (!res.ok) return null;
  return res.json() as Promise<ApiEnvelope<Array<{ category: string; subscribed: boolean }>>>;
}

export async function loadSurveys() {
  const res = await fetch('/api/portal/surveys');
  if (!res.ok) return null;
  return res.json() as Promise<ApiEnvelope<Array<{ id: number; title: string; status: string; fields: unknown[] }>>>;
}

export async function patchSurveyFields(surveyId: number, fields: unknown[]) {
  return fetch(`/api/portal/surveys/${surveyId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
}

export async function uploadHtmlSlide(file: File): Promise<{ success: boolean; data?: { url: string; filename: string }; error?: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const res = await fetch('/api/portal/html-uploads', { method: 'POST', body: fd });
  const json = await res.json();
  if (!res.ok || !json.success) return { success: false, error: json.error || 'unknown error' };
  return { success: true, data: json.data };
}

/** Serialize the slide-preview iframe URL. Kept here so the page no longer
 * inlines a 600-character template literal. */
export function buildSlidePreviewSrc(args: {
  id: string;
  editorMode: 'preview' | 'edit';
  slidePageSettings: Record<string, unknown> | undefined;
  theme: PitchDeckTheme;
  brandingProfileId: number | null;
}) {
  const { id, editorMode, slidePageSettings, theme, brandingProfileId } = args;
  const ps = slidePageSettings || {};
  const params = new URLSearchParams();
  if (editorMode === 'edit') params.set('_edit', 'true');
  params.set('pc', theme.primaryColor);
  params.set('ac', theme.accentColor);
  params.set('bg', String((ps as { backgroundColor?: string }).backgroundColor || theme.backgroundColor));
  params.set('text', String((ps as { color?: string }).color || theme.textColor));
  params.set('hf', theme.headingFont);
  params.set('bf', theme.bodyFont);
  params.set('ps', JSON.stringify(ps));
  if (brandingProfileId) params.set('profileId', String(brandingProfileId));
  return `/portal/tools/pitch-decks/${id}/slide-preview?${params.toString()}`;
}

export type { Block };
