/**
 * REST helpers for the CRM Deals page. Thin fetch wrappers — no React state.
 * Each function returns the parsed JSON envelope (`{ success, data, message? }`)
 * or a primitive (`Response`) for endpoints that don't follow the envelope
 * (multipart upload responses are inspected for `res.ok` instead).
 */
import type {
  Artifact,
  AvailableArtifact,
  Comment,
  Company,
  Contact,
  Deal,
  MentionUser,
  Pipeline,
} from './types';

interface Envelope<T> {
  success: boolean;
  data?: T;
  message?: string;
}

async function getJson<T>(url: string): Promise<Envelope<T>> {
  const res = await fetch(url);
  return (await res.json()) as Envelope<T>;
}

async function postJson<T>(url: string, body: unknown): Promise<Envelope<T>> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Envelope<T>;
}

async function putJson<T>(url: string, body: unknown): Promise<Envelope<T>> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return (await res.json()) as Envelope<T>;
}

async function deleteJson<T>(url: string, body?: unknown): Promise<Envelope<T>> {
  const res = await fetch(url, {
    method: 'DELETE',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as Envelope<T>;
}

// ── Pipelines / contacts / companies ──

export async function fetchPipelines(): Promise<Pipeline[]> {
  const j = await getJson<Pipeline[]>('/api/portal/crm/pipelines');
  return j.data ?? [];
}

export async function fetchContacts(): Promise<Contact[]> {
  const res = await fetch('/api/portal/crm/contacts?limit=1000');
  const j = (await res.json()) as Envelope<{ contacts?: Contact[] } | Contact[]>;
  const data = j.data;
  if (Array.isArray(data)) return data;
  return data?.contacts ?? [];
}

/** Typeahead fetcher for company-picker dropdowns. Returns id/name/logoUrl only,
 *  capped at 50 rows. Wire to a debounced onChange (~200ms) on the input.
 *  This replaces the legacy `fetchCompanies()` bulk loader — the company list
 *  outgrew the "load first 200 into a <select>" UX, see perf/phase1. */
export async function fetchCompaniesTypeahead(query: string): Promise<Pick<Company, 'id' | 'name'>[]> {
  const res = await fetch(`/api/portal/crm/companies?q=${encodeURIComponent(query)}`);
  const j = (await res.json()) as Envelope<{ companies?: Pick<Company, 'id' | 'name'>[] }>;
  return j.data?.companies ?? [];
}

export async function createCompany(name: string): Promise<Envelope<Company>> {
  return postJson<Company>('/api/portal/crm/companies', { name });
}

export async function createContact(input: {
  firstName: string;
  lastName: string | null;
  email: string | null;
  companyId: number | null;
}): Promise<Envelope<{
  id: number;
  firstName: string;
  lastName: string | null;
  companyId: number | null;
}>> {
  return postJson('/api/portal/crm/contacts', input);
}

// ── Deals ──

export async function fetchDeals(params: {
  pipelineId: number;
  status: string;
  customFilters: Record<number, string>;
}): Promise<Deal[]> {
  const search = new URLSearchParams({
    pipelineId: String(params.pipelineId),
    status: params.status,
    // The Kanban groups deals client-side, so it needs every deal in the
    // pipeline — not just the API's default first page (limit=50), which
    // silently hid deals in older stages once a pipeline exceeded 50 cards.
    // Request the route's hard cap (200). TODO: per-stage pagination when a
    // single pipeline can exceed 200 deals.
    limit: '200',
  });
  for (const [fid, val] of Object.entries(params.customFilters)) {
    if (val) search.append('cf', `${fid}:${val}`);
  }
  const j = await getJson<Deal[]>(`/api/portal/crm/deals?${search}`);
  return j.data ?? [];
}

export async function createDeal(body: Record<string, unknown>): Promise<Envelope<Deal>> {
  return postJson<Deal>('/api/portal/crm/deals', body);
}

export async function updateDeal(id: number, body: Record<string, unknown>): Promise<Envelope<Deal>> {
  return putJson<Deal>(`/api/portal/crm/deals/${id}`, body);
}

export async function moveDealStage(id: number, stageId: number): Promise<Envelope<Deal>> {
  return putJson<Deal>(`/api/portal/crm/deals/${id}`, { stageId });
}

export async function deleteDeal(id: number): Promise<Envelope<unknown>> {
  return deleteJson(`/api/portal/crm/deals/${id}`);
}

// ── Artifacts ──

export async function fetchArtifacts(dealId: number): Promise<Artifact[]> {
  const j = await getJson<Artifact[]>(`/api/portal/crm/deals/${dealId}/artifacts`);
  return j.data ?? [];
}

export async function fetchAvailableArtifacts(dealId: number): Promise<AvailableArtifact[]> {
  const j = await getJson<AvailableArtifact[]>(`/api/portal/crm/deals/${dealId}/artifacts/available`);
  return j.data ?? [];
}

export async function addArtifact(dealId: number, artifactType: string, artifactId: number) {
  return postJson(`/api/portal/crm/deals/${dealId}/artifacts`, { artifactType, artifactId });
}

export async function updateArtifactPin(dealId: number, artifactDbId: number, pinned: boolean) {
  return putJson(`/api/portal/crm/deals/${dealId}/artifacts`, { artifactDbId, pinned });
}

export async function removeArtifact(dealId: number, artifactDbId: number) {
  return deleteJson(`/api/portal/crm/deals/${dealId}/artifacts`, { artifactDbId });
}

// ── Comments + mentions ──

export async function fetchComments(dealId: number): Promise<Comment[]> {
  const j = await getJson<Comment[]>(`/api/portal/crm/deals/${dealId}/comments`);
  return j.data ?? [];
}

export async function fetchMentionUsers(): Promise<MentionUser[]> {
  const j = await getJson<MentionUser[]>('/api/portal/crm/mentions');
  return j.data ?? [];
}

/** Posts a comment, with optional file attachments via multipart. Returns the
 *  raw Response so callers can branch on `res.ok` for the multipart path. */
export async function postComment(
  dealId: number,
  body: string,
  files: File[],
): Promise<Response> {
  if (files.length > 0) {
    const formData = new FormData();
    formData.append('body', body);
    files.forEach((f) => formData.append('files', f));
    return fetch(`/api/portal/crm/deals/${dealId}/comments`, {
      method: 'POST',
      body: formData,
    });
  }
  return fetch(`/api/portal/crm/deals/${dealId}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
}

export async function deleteComment(dealId: number, commentId: number) {
  return deleteJson(`/api/portal/crm/deals/${dealId}/comments`, { commentId });
}
