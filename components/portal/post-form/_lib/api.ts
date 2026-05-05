import type { Post, TaxonomyItem, CustomFieldDef } from './types';
import { serializeBlocksForSave } from './validation';
import type { Block } from '@/types/blocks';

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * POST a brand-new post. Returns the created row on success so the caller
 * can route into the edit page.
 */
export async function createPost(
  siteId: number,
  formData: Post,
  blocks: Block[],
): Promise<ApiResponse<{ id: number }>> {
  const content = serializeBlocksForSave(blocks);
  const res = await fetch(`/api/portal/cms/websites/${siteId}/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...formData, content }),
  });
  return res.json();
}

/**
 * PUT an existing post. The `revisionTrigger` discriminator lets the API
 * tag the new revision row with how the save originated (autosave, manual,
 * publish) — useful for the revision history UI.
 */
export async function updatePost(
  siteId: number,
  postId: number,
  formData: Post,
  blocks: Block[],
  revisionTrigger: 'autosave' | 'manual' | 'publish',
): Promise<ApiResponse<unknown>> {
  const content = serializeBlocksForSave(blocks);
  const res = await fetch(`/api/portal/cms/websites/${siteId}/posts/${postId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...formData, content, revisionTrigger }),
  });
  return res.json();
}

export async function fetchCategories(siteId: number): Promise<TaxonomyItem[]> {
  try {
    const res = await fetch(`/api/portal/cms/websites/${siteId}/categories`);
    const data: ApiResponse<TaxonomyItem[]> = await res.json();
    return data.success && data.data ? data.data : [];
  } catch {
    return [];
  }
}

export async function fetchTags(siteId: number): Promise<TaxonomyItem[]> {
  try {
    const res = await fetch(`/api/portal/cms/websites/${siteId}/tags`);
    const data: ApiResponse<TaxonomyItem[]> = await res.json();
    return data.success && data.data ? data.data : [];
  } catch {
    return [];
  }
}

export async function createCategory(
  siteId: number,
  name: string,
  slug: string,
): Promise<TaxonomyItem | null> {
  const res = await fetch(`/api/portal/cms/websites/${siteId}/categories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, slug }),
  });
  const data: ApiResponse<TaxonomyItem> = await res.json();
  return data.success && data.data ? data.data : null;
}

export async function createTag(
  siteId: number,
  name: string,
  slug: string,
): Promise<TaxonomyItem | null> {
  const res = await fetch(`/api/portal/cms/websites/${siteId}/tags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, slug }),
  });
  const data: ApiResponse<TaxonomyItem> = await res.json();
  return data.success && data.data ? data.data : null;
}

export async function fetchCustomFieldDefs(): Promise<CustomFieldDef[]> {
  try {
    const res = await fetch('/api/custom-fields');
    const data: ApiResponse<CustomFieldDef[]> = await res.json();
    return data.success && data.data ? data.data : [];
  } catch {
    return [];
  }
}

export async function fetchCustomFieldValues(
  postId: number,
): Promise<Record<number, string>> {
  try {
    const res = await fetch(`/api/posts/${postId}/custom-fields`);
    const data: ApiResponse<Array<{ customFieldId: number; value: string | null }>> =
      await res.json();
    if (!data.success || !data.data) return {};
    const out: Record<number, string> = {};
    for (const v of data.data) out[v.customFieldId] = v.value || '';
    return out;
  } catch {
    return {};
  }
}

export async function saveCustomFieldValue(
  postId: number,
  customFieldId: number,
  value: string,
): Promise<boolean> {
  try {
    const res = await fetch(`/api/posts/${postId}/custom-fields`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customFieldId, value }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
